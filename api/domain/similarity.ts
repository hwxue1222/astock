import { getEastmoneyKline } from '../providers/eastmoneyKline.js'
import { getEastmoneyClist } from '../providers/eastmoneyClist.js'
import { getSinaSpotDataset } from '../providers/ashareSinaSpot.js'
import { getTencentKline } from '../providers/tencentKline.js'

type Candle = {
  ts: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type SimilarStock = {
  symbol: string
  name: string | undefined
  score: number
}

type UniverseEntry = {
  code: string
  name?: string
  marketCapYuan?: number
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i += 1) {
    const x = a[i]
    const y = b[i]
    dot += x * y
    na += x * x
    nb += y * y
  }
  if (na <= 0 || nb <= 0) return 0
  return dot / Math.sqrt(na * nb)
}

function zscore(v: number[]): number[] {
  if (!v.length) return []
  const mean = v.reduce((s, x) => s + x, 0) / v.length
  const var0 = v.reduce((s, x) => s + (x - mean) * (x - mean), 0) / v.length
  const sd = Math.sqrt(var0) || 1
  return v.map((x) => (x - mean) / sd)
}

function buildDailyShapeFeature(input: { candles: Candle[]; lastDays: number }): number[] {
  const c = input.candles
  if (c.length < input.lastDays + 1) return []
  const recent = c.slice(-1 * (input.lastDays + 1))

  const rets: number[] = []
  const bodies: number[] = []
  const ranges: number[] = []

  for (let i = 1; i < recent.length; i += 1) {
    const prev = recent[i - 1]
    const cur = recent[i]
    const r = Math.log(cur.close / prev.close)
    if (Number.isFinite(r)) rets.push(r)

    const denom = Math.max(1e-9, Math.abs(cur.open))
    const body = (cur.close - cur.open) / denom
    const range = (cur.high - cur.low) / denom
    if (Number.isFinite(body)) bodies.push(body)
    if (Number.isFinite(range)) ranges.push(range)
  }

  const zr = zscore(rets)
  const zb = zscore(bodies)
  const zg = zscore(ranges)
  return [...zr, ...zb, ...zg]
}

async function hasTurnoverSpikeInLastDays(input: {
  code: string
  days: number
  multiple: number
}): Promise<boolean> {
  const days = Math.max(2, Math.min(20, input.days))
  const multiple = Math.max(1.1, Math.min(10, input.multiple))
  const out = await getEastmoneyKline({
    code: input.code,
    klt: '101',
    fqt: '1',
    limit: days + 1,
    timeoutMs: 5_000,
  })
  const xs = out.candles
    .slice(-1 * (days + 1))
    .map((c) => (typeof c.turnover === 'number' ? c.turnover : null))

  if (xs.length < days + 1) return false

  for (let i = 1; i < xs.length; i += 1) {
    const prev = xs[i - 1]
    const cur = xs[i]
    if (prev === null || cur === null) continue
    if (prev > 0 && cur >= prev * multiple) return true
  }
  return false
}

function avgRangePct(input: { candles: Candle[]; lastDays: number }): number | null {
  const n = Math.max(2, Math.min(30, input.lastDays))
  const c = input.candles
  if (c.length < n) return null
  const recent = c.slice(-1 * n)
  const xs = recent
    .map((x) => {
      const denom = Math.max(1e-9, Math.abs(x.close))
      const v = (x.high - x.low) / denom
      return Number.isFinite(v) ? v : null
    })
    .filter((x): x is number => x !== null)
  if (!xs.length) return null
  return xs.reduce((s, x) => s + x, 0) / xs.length
}

function normalizeAshareCode(symbol: string): string {
  const raw = String(symbol ?? '').trim().toUpperCase()
  if (!raw) return ''
  const m = raw.match(/(\d{6})/)
  return m ? m[1] : raw
}

function mapKltToPeriod(klt: '101' | '102' | '103'): 'day' | 'week' | 'month' {
  return klt === '103' ? 'month' : klt === '102' ? 'week' : 'day'
}

function mapFqtToAdjust(fqt: '0' | '1' | '2'): 'qfq' | 'none' {
  return fqt === '1' ? 'qfq' : 'none'
}

type CacheKey = string
type CacheVal = { tsMs: number; candles: Candle[] }
const cache = new Map<CacheKey, CacheVal>()

async function getCandlesCached(input: {
  code: string
  klt: '101' | '102' | '103'
  fqt: '0' | '1' | '2'
  limit: number
  ttlMs: number
  timeoutMs?: number
  fallbackToTencent?: boolean
}): Promise<Candle[]> {
  const key = `${input.code}:${input.klt}:${input.fqt}:${input.limit}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.tsMs <= input.ttlMs) return hit.candles

  let candles: Candle[] = []
  try {
    const out = await getEastmoneyKline({
      code: input.code,
      klt: input.klt,
      fqt: input.fqt,
      limit: input.limit,
      timeoutMs: input.timeoutMs,
    })
    candles = out.candles.map((c) => ({
      ts: c.ts,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }))
  } catch {
    candles = []
  }

  const fallbackToTencent = input.fallbackToTencent ?? true
  if (!candles.length && fallbackToTencent) {
    const period = mapKltToPeriod(input.klt)
    const adjust = mapFqtToAdjust(input.fqt)
    const out = await getTencentKline({
      code: input.code,
      period,
      adjust,
      limit: input.limit,
      timeoutMs: input.timeoutMs,
    })
    candles = out.candles.map((c) => ({
      ts: c.ts,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }))
  }
  cache.set(key, { tsMs: Date.now(), candles })
  return candles
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
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

function selectUniverseEntries(input: {
  items: UniverseEntry[]
  maxCandidates: number
  sort: 'mktcap_desc' | 'mktcap_asc'
  capLimitYuan: number
  applyCapLimit: boolean
  nameByCode: Map<string, string>
  capYuanByCode: Map<string, number>
}): string[] {
  const entries = input.items
    .map((it) => ({
      code: normalizeAshareCode(it.code),
      name: typeof it.name === 'string' ? it.name.trim() : '',
      marketCapYuan: typeof it.marketCapYuan === 'number' ? it.marketCapYuan : NaN,
    }))
    .filter((it) => /^\d{6}$/.test(it.code))

  for (const it of entries) {
    if (it.name) input.nameByCode.set(it.code, it.name)
    if (Number.isFinite(it.marketCapYuan) && it.marketCapYuan > 0) {
      input.capYuanByCode.set(it.code, it.marketCapYuan)
    }
  }

  const filtered = entries.filter((it) => {
    if (!input.applyCapLimit) return true
    return Number.isFinite(it.marketCapYuan) && it.marketCapYuan > 0 && it.marketCapYuan <= input.capLimitYuan
  })

  filtered.sort((a, b) => {
    const ca = Number.isFinite(a.marketCapYuan) ? a.marketCapYuan : input.sort === 'mktcap_asc' ? Number.POSITIVE_INFINITY : 0
    const cb = Number.isFinite(b.marketCapYuan) ? b.marketCapYuan : input.sort === 'mktcap_asc' ? Number.POSITIVE_INFINITY : 0
    return input.sort === 'mktcap_asc' ? ca - cb : cb - ca
  })

  return Array.from(new Set(filtered.map((it) => it.code))).slice(0, input.maxCandidates)
}

async function getFullMarketCandidates(input: {
  maxCandidates: number
  sort: 'mktcap_desc' | 'mktcap_asc'
  capLimitYuan: number
  applyCapLimit: boolean
  nameByCode: Map<string, string>
  capYuanByCode: Map<string, number>
}): Promise<{ candidates: string[]; source: 'eastmoney_clist' | 'sina_spot_cache' }> {
  const fetchSize = Math.max(
    40,
    Math.min(200, input.applyCapLimit ? input.maxCandidates * 4 : input.maxCandidates * 2),
  )

  try {
    const cl = await getEastmoneyClist({
      page: 1,
      pageSize: fetchSize,
      sort: input.sort,
      timeoutMs: 12_000,
    })
    const candidates = selectUniverseEntries({
      items: cl.items,
      maxCandidates: input.maxCandidates,
      sort: input.sort,
      capLimitYuan: input.capLimitYuan,
      applyCapLimit: input.applyCapLimit,
      nameByCode: input.nameByCode,
      capYuanByCode: input.capYuanByCode,
    })
    if (candidates.length) return { candidates, source: 'eastmoney_clist' }
  } catch {
    // Fall through to the cached Sina full-market snapshot.
  }

  const ds = await getSinaSpotDataset({ preferNetwork: false, ttlSeconds: 7 * 24 * 3600 })
  const items = (ds?.items ?? []).map((it) => ({
    code: String(it.code ?? ''),
    name: typeof it.name === 'string' ? it.name : undefined,
    marketCapYuan: typeof it.mktcap === 'number' ? it.mktcap * 10_000 : undefined,
  }))
  const candidates = selectUniverseEntries({
    items,
    maxCandidates: input.maxCandidates,
    sort: input.sort,
    capLimitYuan: input.capLimitYuan,
    applyCapLimit: input.applyCapLimit,
    nameByCode: input.nameByCode,
    capYuanByCode: input.capYuanByCode,
  })
  if (candidates.length) return { candidates, source: 'sina_spot_cache' }

  throw new Error('Full-market candidate pool unavailable')
}

export async function findSimilarStocks(input: {
  targetSymbol: string
  klt: '101' | '102' | '103'
  fqt: '0' | '1' | '2'
  days: number
  top: number
  candidateSymbols?: string[]
  maxCandidates?: number
  enabled: Array<1 | 2 | 3>
  s1MaxMarketCapYi: number
  s2LastDays: number
  s2TurnoverSpikeMultiple: number
  s2PreselectTop: number
  s3LastDays: number
  s3RangeRatioMin: number
  s3RangeRatioMax: number
}): Promise<{ target: string; candidates: number; top: SimilarStock[]; meta: { window: number } }> {
  const target = normalizeAshareCode(input.targetSymbol)
  const top = Math.max(1, Math.min(50, input.top))
  const enabled = new Set(input.enabled)

  const s1MaxMarketCapYi = Math.max(1, Math.min(10_000, input.s1MaxMarketCapYi))
  const s2LastDays = Math.max(3, Math.min(15, input.s2LastDays))
  const s2TurnoverSpikeMultiple = Math.max(1.1, Math.min(10, input.s2TurnoverSpikeMultiple))
  const s2PreselectTop = Math.max(10, Math.min(80, input.s2PreselectTop))
  const s3LastDays = Math.max(3, Math.min(30, input.s3LastDays))
  const s3RangeRatioMin = Math.max(0.05, Math.min(10, input.s3RangeRatioMin))
  const s3RangeRatioMax = Math.max(s3RangeRatioMin, Math.min(10, input.s3RangeRatioMax))

  const capLimitYuan = s1MaxMarketCapYi * 100_000_000
  const limit = enabled.has(2) || enabled.has(3) ? 20 : 0
  const window = enabled.has(2) ? s2LastDays : enabled.has(3) ? s3LastDays : 0

  const nameByCode = new Map<string, string>()
  const capYuanByCode = new Map<string, number>()

  let candidates: string[]
  if (input.candidateSymbols?.length) {
    candidates = input.candidateSymbols.map(normalizeAshareCode).filter(Boolean)
  } else {
    const maxCandidates = Math.max(
      8,
      Math.min(
        120,
        enabled.has(2) || enabled.has(3) ? Math.min(input.maxCandidates ?? 60, 8) : input.maxCandidates ?? 60,
      ),
    )

    const sort = enabled.has(1) ? 'mktcap_asc' : 'mktcap_desc'
    const out = await getFullMarketCandidates({
      maxCandidates,
      sort,
      capLimitYuan,
      applyCapLimit: enabled.has(1),
      nameByCode,
      capYuanByCode,
    })
    candidates = out.candidates
  }

  candidates = Array.from(new Set(candidates)).filter((c) => c !== target).slice(0, 120)

  if (enabled.has(1) && capYuanByCode.size) {
    candidates = candidates.filter((c) => {
      const cap = capYuanByCode.get(c)
      return typeof cap === 'number' ? cap <= capLimitYuan : false
    })
  }

  if (enabled.size === 1 && enabled.has(1)) {
    const out = candidates
      .map((c) => {
        const cap = capYuanByCode.get(c) ?? 0
        return {
          symbol: c,
          name: typeof nameByCode.get(c) === 'string' ? String(nameByCode.get(c)) : undefined,
          score: clamp01(cap / capLimitYuan),
        } satisfies SimilarStock
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, top)
    return { target, candidates: candidates.length, top: out, meta: { window } }
  }

  const targetCandles = enabled.has(2) || enabled.has(3)
    ? await getCandlesCached({
        code: target,
        klt: '101',
        fqt: '1',
        limit,
        ttlMs: 10 * 60 * 1000,
        timeoutMs: 6_000,
        fallbackToTencent: false,
      })
    : []

  const fvTarget = enabled.has(2) ? buildDailyShapeFeature({ candles: targetCandles, lastDays: s2LastDays }) : []
  const targetRange = enabled.has(3) ? avgRangePct({ candles: targetCandles, lastDays: s3LastDays }) : null

  const rows = await mapLimit(candidates, enabled.has(2) || enabled.has(3) ? 4 : 2, async (code) => {
    try {
      const candles = await getCandlesCached({
        code,
        klt: '101',
        fqt: '1',
        limit,
        ttlMs: 10 * 60 * 1000,
        timeoutMs: 6_000,
        fallbackToTencent: false,
      })
      if (enabled.has(3) && targetRange !== null) {
        const r = avgRangePct({ candles, lastDays: s3LastDays })
        if (r === null) return null
        const ratio = r / Math.max(1e-9, targetRange)
        if (!(ratio >= s3RangeRatioMin && ratio <= s3RangeRatioMax)) return null
      }

      if (enabled.has(2)) {
        const fv = buildDailyShapeFeature({ candles, lastDays: s2LastDays })
        if (!fv.length || !fvTarget.length) return null
        const s = cosine(fvTarget, fv)
        return {
          symbol: code,
          name: typeof nameByCode.get(code) === 'string' ? String(nameByCode.get(code)) : undefined,
          score: clamp01((s + 1) / 2),
        } satisfies SimilarStock
      }

      const cap = capYuanByCode.get(code) ?? 0
      return {
        symbol: code,
        name: typeof nameByCode.get(code) === 'string' ? String(nameByCode.get(code)) : undefined,
        score: clamp01(cap / Math.max(1, capLimitYuan)),
      } satisfies SimilarStock
    } catch {
      return null
    }
  })

  const scored = rows.filter((x): x is SimilarStock => x !== null).sort((a, b) => b.score - a.score)

  if (enabled.has(2)) {
    const pool = scored.slice(0, Math.min(s2PreselectTop, 10))
    const passed = await mapLimit(pool, 4, async (it) => {
      try {
        const ok = await hasTurnoverSpikeInLastDays({
          code: it.symbol,
          days: s2LastDays,
          multiple: s2TurnoverSpikeMultiple,
        })
        return ok ? it : null
      } catch {
        return null
      }
    })
    const out = passed.filter((x): x is SimilarStock => x !== null).slice(0, top)
    return { target, candidates: candidates.length, top: out, meta: { window } }
  }

  return { target, candidates: candidates.length, top: scored.slice(0, top), meta: { window } }
}
