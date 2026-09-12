import { cacheFilePath, readJsonCache, writeJsonCache } from '../providers/fsCache.js'
import {
  getEastmoneyBoardConstituents,
  getEastmoneyBoardFlowDayKline,
  getEastmoneyIndustryBoards,
  type EastmoneyBoard,
} from '../providers/eastmoneyBoards.js'

type MonthTopItem = {
  boardCode: string
  name: string
  avgNetInflowYi: number
  positiveYearRatePct: number
  yearsUsed: number
}

type MonthTop = {
  month: number
  top: MonthTopItem[]
}

type Y2026MonthTopItem = {
  boardCode: string
  name: string
  netInflowYi: number
}

type Y2026MonthTop = {
  month: number
  top: Y2026MonthTopItem[]
}

type ForecastItem = {
  boardCode: string
  name: string
  score: number
  seasonalityAvgNetInflowYi?: number
  y2026YtdNetInflowYi?: number
  leaders: Array<{ symbol: string; name?: string }>
}

export type IndustryFlowSeasonalityResponse = {
  years: number
  baselineYears: number[]
  baselineTop5ByMonth: MonthTop[]
  y2026JanAugTop5ByMonth: Y2026MonthTop[]
  y2026SepDecForecastTop3ByMonth: Array<{ month: number; top: ForecastItem[] }>
  meta: {
    boardsTotal: number
    boardsUsed: number
    asOfDate: string
    computeMs: number
    partial?: boolean
    source: string
  }
}

function isVercelRuntime(): boolean {
  return Boolean(process.env.VERCEL)
}

function isoDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.max(lo, Math.min(hi, n))
}

function yearFromDate(ymd: string): number {
  const m = String(ymd).match(/^(\d{4})-/)
  return m ? Number(m[1]) : NaN
}

function monthFromDate(ymd: string): number {
  const m = String(ymd).match(/^\d{4}-(\d{2})-/)
  return m ? Number(m[1]) : NaN
}

function mean(nums: number[]): number {
  const v = nums.filter((x) => Number.isFinite(x))
  if (!v.length) return 0
  return v.reduce((a, b) => a + b, 0) / v.length
}

function zscore(v: number[]): number[] {
  const vals = v.map((x) => (Number.isFinite(x) ? x : 0))
  const m = mean(vals)
  const var0 = mean(vals.map((x) => (x - m) * (x - m)))
  const sd = Math.sqrt(var0) || 1
  return vals.map((x) => (x - m) / sd)
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const workers = new Array(Math.max(1, limit)).fill(null).map(async () => {
    while (i < items.length) {
      const idx = i
      i += 1
      out[idx] = await fn(items[idx], idx)
    }
  })
  await Promise.all(workers)
  return out
}

type BoardMonthlyAgg = {
  boardCode: string
  name: string
  byYearMonthYi: Map<string, number>
  y2026ByMonthYi: Map<number, number>
  y2026YtdYi: number
}

async function fetchBoardAgg(input: {
  board: EastmoneyBoard
  baselineYears: number[]
  timeoutMs: number
}): Promise<BoardMonthlyAgg> {
  const years = input.baselineYears
  const startYear = Math.min(...years)
  const endYear = Math.max(...years)
  const start = `${startYear}-01-01`
  const end = `${endYear}-12-31`

  const y2026Start = '2026-01-01'
  const y2026End = '2026-08-31'
  const needYears = (endYear - startYear + 1)
  const limitGuess = clamp(needYears * 260 + 200, 400, 6000)

  const out = await getEastmoneyBoardFlowDayKline({
    boardCode: input.board.code,
    limit: limitGuess,
    timeoutMs: input.timeoutMs,
  })

  const byYearMonthYi = new Map<string, number>()
  const y2026ByMonthYi = new Map<number, number>()
  let y2026YtdYi = 0

  for (const r of out.rows) {
    const d = r.date
    const y = yearFromDate(d)
    const m = monthFromDate(d)
    if (!Number.isFinite(y) || !Number.isFinite(m)) continue

    const yi = r.mainNetInflowYuan / 1e8

    if (d >= start && d <= end && years.includes(y)) {
      const key = `${y}-${String(m).padStart(2, '0')}`
      byYearMonthYi.set(key, (byYearMonthYi.get(key) ?? 0) + yi)
    }

    if (d >= y2026Start && d <= y2026End) {
      y2026ByMonthYi.set(m, (y2026ByMonthYi.get(m) ?? 0) + yi)
      y2026YtdYi += yi
    }
  }

  return {
    boardCode: input.board.code,
    name: out.boardName?.trim() || input.board.name,
    byYearMonthYi,
    y2026ByMonthYi,
    y2026YtdYi,
  }
}

export async function buildIndustryMonthlyFlowSeasonality(input?: {
  years?: number
  topPerMonth?: number
  boardLimit?: number
  ttlSeconds?: number
  maxComputeMs?: number
}): Promise<IndustryFlowSeasonalityResponse> {
  const years = clamp(input?.years ?? 10, 3, 15)
  const topPerMonth = clamp(input?.topPerMonth ?? 5, 3, 10)
  const boardLimit = clamp(input?.boardLimit ?? 180, 20, 400)
  const ttlSeconds = clamp(input?.ttlSeconds ?? 7 * 24 * 3600, 60, 30 * 24 * 3600)

  const startedAt = Date.now()
  const maxComputeMs = clamp(input?.maxComputeMs ?? (isVercelRuntime() ? 9000 : 45_000), 2000, 55_000)
  const deadlineMs = startedAt + maxComputeMs
  const timeoutMs = isVercelRuntime() ? 8000 : 15_000
  const concurrency = isVercelRuntime() ? 2 : 4

  const asOfDate = isoDate(new Date())
  const endYear = new Date().getFullYear() - 1
  const baselineYears: number[] = []
  for (let y = endYear - years + 1; y <= endYear; y += 1) baselineYears.push(y)

  const cacheKey = `industry_monthly_flow_seasonality_y${years}_top${topPerMonth}_b${boardLimit}.json`
  const cachePath = cacheFilePath(cacheKey)
  const cached = await readJsonCache<IndustryFlowSeasonalityResponse>(cachePath, { ttlSeconds })
  if (cached?.baselineTop5ByMonth?.length) return cached

  const boardsAll = await getEastmoneyIndustryBoards({ timeoutMs })
  const boards = boardsAll.slice(0, boardLimit)

  let partial = false
  const aggs: BoardMonthlyAgg[] = []

  await mapLimit(boards, concurrency, async (b) => {
    if (Date.now() > deadlineMs) {
      partial = true
      return null
    }
    try {
      const a = await fetchBoardAgg({ board: b, baselineYears, timeoutMs })
      aggs.push(a)
    } catch {
      partial = true
    }
    return null
  })

  const baselineTop5ByMonth: MonthTop[] = []
  for (let month = 1; month <= 12; month += 1) {
    const items: MonthTopItem[] = []
    for (const a of aggs) {
      const vals: number[] = []
      let posYears = 0
      let used = 0
      for (const y of baselineYears) {
        const key = `${y}-${String(month).padStart(2, '0')}`
        const v = a.byYearMonthYi.get(key)
        if (typeof v !== 'number' || !Number.isFinite(v)) continue
        vals.push(v)
        used += 1
        if (v > 0) posYears += 1
      }
      if (used < Math.max(3, Math.floor(baselineYears.length * 0.6))) continue

      const avgYi = mean(vals)
      items.push({
        boardCode: a.boardCode,
        name: a.name,
        avgNetInflowYi: avgYi,
        positiveYearRatePct: used ? (posYears / used) * 100 : 0,
        yearsUsed: used,
      })
    }

    items.sort((x, y) => y.avgNetInflowYi - x.avgNetInflowYi)
    baselineTop5ByMonth.push({ month, top: items.slice(0, topPerMonth) })
  }

  const y2026JanAugTop5ByMonth: Y2026MonthTop[] = []
  for (let month = 1; month <= 8; month += 1) {
    const items: Y2026MonthTopItem[] = aggs
      .map((a) => ({
        boardCode: a.boardCode,
        name: a.name,
        netInflowYi: a.y2026ByMonthYi.get(month) ?? 0,
      }))
      .filter((x) => Number.isFinite(x.netInflowYi))
      .sort((x, y) => y.netInflowYi - x.netInflowYi)
      .slice(0, topPerMonth)
    y2026JanAugTop5ByMonth.push({ month, top: items })
  }

  const ytd = aggs.map((a) => a.y2026YtdYi)
  const ytdZ = zscore(ytd)
  const ytdByCode = new Map<string, number>()
  for (let i = 0; i < aggs.length; i += 1) ytdByCode.set(aggs[i].boardCode, ytdZ[i])

  const y2026SepDecForecastTop3ByMonth: Array<{ month: number; top: ForecastItem[] }> = []
  for (const month of [9, 10, 11, 12]) {
    const seas = baselineTop5ByMonth.find((x) => x.month === month)?.top ?? []
    const seasByCode = new Map(seas.map((x) => [x.boardCode, x]))

    const scored = aggs.map((a) => {
      const s = seasByCode.get(a.boardCode)
      const seasYi = s?.avgNetInflowYi
      const seasScore = Number.isFinite(seasYi as number) ? Number(seasYi) : 0
      const ytdScore = ytdByCode.get(a.boardCode) ?? 0
      const score = 0.7 * seasScore + 0.3 * ytdScore
      return {
        boardCode: a.boardCode,
        name: a.name,
        score,
        seasonalityAvgNetInflowYi: seasYi,
        y2026YtdNetInflowYi: a.y2026YtdYi,
      }
    })

    scored.sort((a, b) => b.score - a.score)
    const picked = scored.slice(0, 3)

    const leaders = await mapLimit(picked, isVercelRuntime() ? 2 : 3, async (p) => {
      if (Date.now() > deadlineMs) {
        partial = true
        return []
      }
      const cons = await getEastmoneyBoardConstituents({ boardCode: p.boardCode, top: 12, timeoutMs }).catch(() => [])
      return cons.slice(0, 10).map((x) => ({ symbol: x.symbol, name: x.name }))
    })

    y2026SepDecForecastTop3ByMonth.push({
      month,
      top: picked.map((p, idx) => ({
        ...p,
        leaders: leaders[idx] ?? [],
      })),
    })
  }

  const out: IndustryFlowSeasonalityResponse = {
    years,
    baselineYears,
    baselineTop5ByMonth,
    y2026JanAugTop5ByMonth,
    y2026SepDecForecastTop3ByMonth,
    meta: {
      boardsTotal: boardsAll.length,
      boardsUsed: aggs.length,
      asOfDate,
      computeMs: Date.now() - startedAt,
      partial,
      source: 'eastmoney_fundflow_daykline + eastmoney_clist_boards',
    },
  }

  await writeJsonCache(cachePath, out)
  return out
}

