import { cacheFilePath, readJsonCache, writeJsonCache } from '../providers/fsCache.js'
import { getEastmoneyKline } from '../providers/eastmoneyKline.js'
import { getTencentKline } from '../providers/tencentKline.js'
import { getSinaMarketCenterNode } from '../providers/sinaMarketCenter.js'
import { getSinaIndustryMoneyflow } from '../providers/sinaMoneyflowIndustry.js'

type RotationLeader = { symbol: string; name?: string }

export type IndustryRotationForecastItem = {
  name: string
  category?: string
  score: number
  seasonalityAvgReturnPct?: number
  seasonalityPosRatePct?: number
  flowNetInflowWan?: number
  flowNetInflowRatePct?: number
  leaders: RotationLeader[]
}

export type IndustryRotationForecastMonth = {
  month: number
  top: IndustryRotationForecastItem[]
}

export type IndustryRotationForecastResponse = {
  asOfDate: string
  years: number
  months: IndustryRotationForecastMonth[]
  meta: {
    industryCount: number
    analyzedIndustries: number
    stocksPerIndustry: number
    source: string
    partial?: boolean
    computeMs?: number
  }
}

function isVercelRuntime(): boolean {
  return Boolean(process.env.VERCEL)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function isoDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

function ymdNoDash(s: string): string {
  const m = String(s ?? '').match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  return `${m[1]}${m[2]}${m[3]}`
}

function dayBefore(ymd: string): string {
  const s = String(ymd ?? '').trim()
  if (!/^\d{8}$/.test(s)) return ''
  const y = Number(s.slice(0, 4))
  const mo = Number(s.slice(4, 6))
  const d = Number(s.slice(6, 8))
  const dt = new Date(Date.UTC(y, mo - 1, d))
  dt.setUTCDate(dt.getUTCDate() - 1)
  return `${dt.getUTCFullYear()}${pad2(dt.getUTCMonth() + 1)}${pad2(dt.getUTCDate())}`
}

function monthKey(ts: string): string {
  const m = String(ts ?? '').match(/^(\d{4})-(\d{2})-/)
  return m ? `${m[1]}-${m[2]}` : ''
}

function mean(nums: number[]): number | null {
  const v = nums.filter((x) => Number.isFinite(x))
  if (!v.length) return null
  return v.reduce((a, b) => a + b, 0) / v.length
}

function pct(n: number | null): number | undefined {
  if (n === null) return undefined
  if (!Number.isFinite(n)) return undefined
  return n * 100
}

async function fetchMonthlyReturns(code: string, years: number, input?: { timeoutMs?: number }): Promise<Map<string, number>> {
  const cachePath = cacheFilePath(`tencent_monthly_returns_${code}_y${years}.json`)
  const cached = await readJsonCache<Record<string, number>>(cachePath, { ttlSeconds: 30 * 24 * 3600 })
  if (cached && Object.keys(cached).length) return new Map(Object.entries(cached))

  const limit = Math.max(60, Math.min(260, years * 12 + 24))
  const timeoutMs = Number.isFinite(input?.timeoutMs) ? Math.max(1000, Number(input?.timeoutMs)) : 18_000
  const t = await getTencentKline({ code, period: 'month', adjust: 'qfq', limit, timeoutMs }).catch(() => null)
  const candles = t?.candles?.length ? t.candles : []

  const closeByMonth = new Map<string, number>()
  for (const c of candles) {
    const k = monthKey(c.ts)
    if (!k) continue
    closeByMonth.set(k, c.close)
  }

  if (!closeByMonth.size) {
    const out = await getEastmoneyKline({ code, klt: '103', fqt: '1', limit, timeoutMs }).catch(() => null)
    for (const c of out?.candles ?? []) {
      const k = monthKey(c.ts)
      if (!k) continue
      closeByMonth.set(k, c.close)
    }
  }

  const keys = Array.from(closeByMonth.keys()).sort()
  const out = new Map<string, number>()
  for (let i = 1; i < keys.length; i += 1) {
    const prev = closeByMonth.get(keys[i - 1])
    const cur = closeByMonth.get(keys[i])
    if (!prev || !cur) continue
    out.set(keys[i], cur / prev - 1)
  }

  const obj: Record<string, number> = {}
  for (const [k, v] of out) obj[k] = v
  await writeJsonCache(cachePath, obj)
  return out
}

function seasonalityForMonths(input: {
  monthlyReturnByStock: Array<Map<string, number>>
  years: number
  month: number
}): { avgReturn: number | null; posRate: number | null } {
  const now = new Date()
  const endYear = now.getFullYear() - 1
  const startYear = endYear - Math.max(1, input.years) + 1

  const yearReturns: number[] = []
  const yearPos: number[] = []

  for (let y = startYear; y <= endYear; y += 1) {
    const key = `${y}-${pad2(input.month)}`
    const vals: number[] = []
    for (const m of input.monthlyReturnByStock) {
      const r = m.get(key)
      if (typeof r === 'number' && Number.isFinite(r)) vals.push(r)
    }
    const avg = mean(vals)
    if (avg === null) continue
    yearReturns.push(avg)
    yearPos.push(avg > 0 ? 1 : 0)
  }

  const avgReturn = mean(yearReturns)
  const posRate = mean(yearPos)
  return { avgReturn, posRate }
}

function percentileRank(value: number, list: number[]): number {
  const v = list.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return 0
  let count = 0
  for (const x of v) if (x <= value) count += 1
  return count / v.length
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

export async function buildIndustryRotationForecast(input?: {
  months?: number[]
  years?: number
  top?: number
  industries?: number
  stocksPerIndustry?: number
  ttlSeconds?: number
  maxComputeMs?: number
}): Promise<IndustryRotationForecastResponse> {
  const months = (input?.months?.length ? input.months : [9, 10, 11, 12])
    .map((x) => Math.max(1, Math.min(12, Math.trunc(x))))
    .filter((x, i, a) => a.indexOf(x) === i)
    .sort((a, b) => a - b)
  const years = Math.max(3, Math.min(15, input?.years ?? 10))
  const top = Math.max(3, Math.min(15, input?.top ?? 8))
  const industries = Math.max(6, Math.min(30, input?.industries ?? 10))
  const stocksPerIndustry = Math.max(1, Math.min(8, input?.stocksPerIndustry ?? 2))
  const ttlSeconds = Math.max(60, Math.min(24 * 3600, input?.ttlSeconds ?? 6 * 3600))

  const startedAt = Date.now()
  const maxComputeMs = Math.max(2000, Math.min(55_000, input?.maxComputeMs ?? (isVercelRuntime() ? 8000 : 25_000)))
  const deadlineMs = startedAt + maxComputeMs
  const timeoutMs = isVercelRuntime() ? 6000 : 18_000
  const perIndustryConcurrency = isVercelRuntime() ? 2 : 4
  const perIndustryStockConcurrency = isVercelRuntime() ? 2 : 3

  const cacheKey = `rotation_forecast_y${years}_m${months.join('-')}_i${industries}_s${stocksPerIndustry}_t${top}.json`
  const cachePath = cacheFilePath(cacheKey)
  const cached = await readJsonCache<IndustryRotationForecastResponse>(cachePath, { ttlSeconds })
  if (cached?.months?.length) return cached

  const asOfDate = isoDate(new Date())

  const mf = await getSinaIndustryMoneyflow({ fenlei: 0, limit: 100, ttlSeconds: 120, timeoutMs })
  const universe = mf
    .filter((x) => x.category)
    .sort((a, b) => b.netInflowRate - a.netInflowRate)
  const picked = universe.slice(0, industries)

  const allFlowRates = universe.map((x) => x.netInflowRate)
  const allFlowWan = universe.map((x) => x.netInflowWan)

  let partial = false

  const perIndustry = await mapLimit(picked, perIndustryConcurrency, async (ind) => {
      const node = String(ind.category ?? '').trim()
      const leaders: RotationLeader[] = []

      if (ind.leadingSymbol) leaders.push({ symbol: ind.leadingSymbol.replace(/^(sh|sz|bj)/, ''), name: ind.leadingName })

      if (Date.now() > deadlineMs) {
        partial = true
        return {
          name: ind.name,
          category: ind.category,
          leaders,
          flowNetInflowRatePct: ind.netInflowRate,
          flowNetInflowWan: ind.netInflowWan,
          flowScore: 0,
          seasonality: new Map<number, { avgReturn: number | null; posRate: number | null }>(),
        }
      }

      const rows = await getSinaMarketCenterNode({ node, pn: 1, pz: 200, sort: 'nmc', asc: 0, ttlSeconds: 6 * 3600 })
      const stocks = rows
        .map((r) => ({
          symbol: String(r.code ?? '').trim(),
          name: typeof r.name === 'string' ? r.name.trim() : undefined,
          nmc: typeof r.nmc === 'number' ? r.nmc : null,
        }))
        .filter((x) => /^\d{6}$/.test(x.symbol))
        .sort((a, b) => (b.nmc ?? 0) - (a.nmc ?? 0))

      for (const s of stocks) {
        if (leaders.length >= stocksPerIndustry) break
        if (leaders.some((x) => x.symbol === s.symbol)) continue
        leaders.push({ symbol: s.symbol, name: s.name })
      }

      const stockList = leaders.filter((x) => /^\d{6}$/.test(x.symbol))
      const monthlyReturnByStock = await mapLimit(stockList, perIndustryStockConcurrency, async (s) => {
        if (Date.now() > deadlineMs) {
          partial = true
          return new Map<string, number>()
        }
        return fetchMonthlyReturns(s.symbol, years, { timeoutMs })
      })

      const flowRatePct = ind.netInflowRate
      const flowWan = ind.netInflowWan
      const flowScore =
        60 * percentileRank(flowRatePct, allFlowRates) + 40 * percentileRank(flowWan, allFlowWan)

      const seasonality = new Map<number, { avgReturn: number | null; posRate: number | null }>()
      for (const m of months) {
        seasonality.set(m, seasonalityForMonths({ monthlyReturnByStock, years, month: m }))
      }

      return {
        name: ind.name,
        category: ind.category,
        leaders,
        flowNetInflowRatePct: flowRatePct,
        flowNetInflowWan: flowWan,
        flowScore,
        seasonality,
      }
    })

  const byMonth: IndustryRotationForecastMonth[] = months.map((m) => {
    const items: IndustryRotationForecastItem[] = perIndustry
      .map((x) => {
        const seas = x.seasonality.get(m) ?? { avgReturn: null, posRate: null }
        const seasonalityAvgReturnPct = pct(seas.avgReturn)
        const seasonalityPosRatePct = seas.posRate === null ? undefined : seas.posRate * 100

        const seasonalityScore =
          (seasonalityAvgReturnPct ?? 0) * 4 + ((seasonalityPosRatePct ?? 50) - 50) * 0.6
        const score = 0.55 * seasonalityScore + 0.45 * x.flowScore

        return {
          name: x.name,
          category: x.category,
          score,
          seasonalityAvgReturnPct,
          seasonalityPosRatePct,
          flowNetInflowWan: x.flowNetInflowWan,
          flowNetInflowRatePct: x.flowNetInflowRatePct,
          leaders: x.leaders.slice(0, 3),
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, top)

    return { month: m, top: items }
  })

  const out: IndustryRotationForecastResponse = {
    asOfDate,
    years,
    months: byMonth,
    meta: {
      industryCount: universe.length,
      analyzedIndustries: picked.length,
      stocksPerIndustry,
      source: 'sina_moneyflow + sina_market_center + eastmoney_kline',
      partial: partial || Date.now() > deadlineMs,
      computeMs: Date.now() - startedAt,
    },
  }

  await writeJsonCache(cachePath, out)
  return out
}
