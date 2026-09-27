import { cacheFilePath, readJsonCache, writeJsonCache } from '../providers/fsCache.js'
import {
  getEastmoneyBoardFlowDayKline,
  getEastmoneyConceptBoards,
  getEastmoneyThemeBoards,
  type EastmoneyBoard,
  type EastmoneyBoardFlowDaily,
} from '../providers/eastmoneyBoards.js'

export type BoardFlowRollingItem = {
  boardCode: string
  name: string
  startDate: string
  endDate: string
  daysUsed: number
  sumMainNetInflowYi: number
  lastMainNetInflowYi: number
}

export type BoardFlowRollingResponse = {
  boardType: 'concept' | 'theme'
  days: number
  top: number
  items: BoardFlowRollingItem[]
  meta: {
    boardsTotal: number
    boardsUsed: number
    computeMs: number
    partial?: boolean
    source: string
    fallback?: string
  }
}

function sum(nums: number[]): number {
  let s = 0
  for (const n of nums) s += n
  return s
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

function pickLastN<T>(arr: T[], n: number): T[] {
  if (n <= 0) return []
  if (arr.length <= n) return arr
  return arr.slice(arr.length - n)
}

function toYi(yuan: number): number {
  return yuan / 1e8
}

async function loadBoards(boardType: 'concept' | 'theme', timeoutMs: number): Promise<{ boards: EastmoneyBoard[]; fallback?: string }> {
  if (boardType === 'concept') {
    return { boards: await getEastmoneyConceptBoards({ timeoutMs }) }
  }

  const theme = await getEastmoneyThemeBoards({ timeoutMs }).catch(() => [])
  if (theme.length) return { boards: theme }
  const concept = await getEastmoneyConceptBoards({ timeoutMs }).catch(() => [])
  return { boards: concept, fallback: 'theme_empty_fallback_to_concept' }
}

export async function buildBoardFlowRolling(input?: {
  boardType?: 'concept' | 'theme'
  days?: number
  top?: number
  boardLimit?: number
  ttlSeconds?: number
  maxComputeMs?: number
}): Promise<BoardFlowRollingResponse> {
  const boardType: 'concept' | 'theme' = input?.boardType === 'theme' ? 'theme' : 'concept'
  const days = Math.max(3, Math.min(60, Math.trunc(input?.days ?? 14)))
  const top = Math.max(1, Math.min(60, Math.trunc(input?.top ?? 20)))
  const boardLimit = Math.max(30, Math.min(500, Math.trunc(input?.boardLimit ?? 200)))
  const ttlSeconds = Math.max(60, Math.min(6 * 3600, Math.trunc(input?.ttlSeconds ?? 20 * 60)))

  const startedAt = Date.now()
  const maxComputeMs = Math.max(2000, Math.min(55_000, Math.trunc(input?.maxComputeMs ?? (process.env.VERCEL ? 8000 : 25_000))))
  const deadlineMs = startedAt + maxComputeMs
  const timeoutMs = process.env.VERCEL ? 6000 : 15_000
  const concurrency = process.env.VERCEL ? 3 : 6

  const cacheKey = `board_flow_rolling_${boardType}_d${days}_t${top}_b${boardLimit}.json`
  const cachePath = cacheFilePath(cacheKey)
  const cached = await readJsonCache<BoardFlowRollingResponse>(cachePath, { ttlSeconds })
  if (cached?.items?.length) return cached

  const { boards: allBoards, fallback } = await loadBoards(boardType, timeoutMs)
  const boards = allBoards.slice(0, boardLimit)

  let partial = false
  const perBoard = await mapLimit(boards, concurrency, async (b) => {
    if (Date.now() > deadlineMs) {
      partial = true
      return null
    }

    const limit = Math.max(30, Math.min(200, days * 4))
    let flow: { rows: EastmoneyBoardFlowDaily[] } | null = null
    try {
      flow = await getEastmoneyBoardFlowDayKline({ boardCode: b.code, limit, timeoutMs })
    } catch {
      flow = null
    }
    const rows: EastmoneyBoardFlowDaily[] = flow?.rows?.length ? flow.rows : []
    const last = pickLastN(rows, days)
    if (!last.length) return null

    const sumYi = toYi(sum(last.map((r) => r.mainNetInflowYuan)))
    const lastYi = toYi(last[last.length - 1].mainNetInflowYuan)
    const startDate = last[0].date
    const endDate = last[last.length - 1].date

    const item: BoardFlowRollingItem = {
      boardCode: b.code,
      name: b.name,
      startDate,
      endDate,
      daysUsed: last.length,
      sumMainNetInflowYi: sumYi,
      lastMainNetInflowYi: lastYi,
    }
    return item
  })

  const items = perBoard
    .filter((x): x is BoardFlowRollingItem => x !== null)
    .sort((a, b) => b.sumMainNetInflowYi - a.sumMainNetInflowYi)
    .slice(0, top)

  const out: BoardFlowRollingResponse = {
    boardType,
    days,
    top,
    items,
    meta: {
      boardsTotal: allBoards.length,
      boardsUsed: boards.length,
      computeMs: Date.now() - startedAt,
      partial,
      source: 'eastmoney_clist + eastmoney_fflow_daykline',
      fallback,
    },
  }

  await writeJsonCache(cachePath, out)
  return out
}
