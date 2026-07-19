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
  if (candles.length) cache.set(key, { tsMs: Date.now(), candles })
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
  sort: 'mktcap_desc' | 'mktcap_asc' | 'pctchg_desc'
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

  if (input.sort === 'mktcap_asc' || input.sort === 'mktcap_desc') {
    filtered.sort((a, b) => {
      const ca = Number.isFinite(a.marketCapYuan) ? a.marketCapYuan : input.sort === 'mktcap_asc' ? Number.POSITIVE_INFINITY : 0
      const cb = Number.isFinite(b.marketCapYuan) ? b.marketCapYuan : input.sort === 'mktcap_asc' ? Number.POSITIVE_INFINITY : 0
      return input.sort === 'mktcap_asc' ? ca - cb : cb - ca
    })
  }

  return Array.from(new Set(filtered.map((it) => it.code))).slice(0, input.maxCandidates)
}

export async function getFullMarketCandidates(input: {
  maxCandidates: number
  sort: 'mktcap_desc' | 'mktcap_asc' | 'pctchg_desc'
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
  s2MinSimilarity?: number
  s3LastDays?: number
  s3ChangePct?: number
  s3VolumeMultiple?: number
}): Promise<{ target: string; candidates: number; top: SimilarStock[]; meta: { window: number } }> {
  const target = normalizeAshareCode(input.targetSymbol)
  const top = Math.max(1, Math.min(50, input.top))
  const enabled = new Set(input.enabled)

  const s1MaxMarketCapYi = Math.max(1, Math.min(10_000, input.s1MaxMarketCapYi))
  const s2LastDays = Math.max(3, Math.min(15, input.s2LastDays))
  const s2MinSimilarity = Math.max(0, Math.min(1, input.s2MinSimilarity ?? 0))
  void input.s2TurnoverSpikeMultiple
  void input.s2PreselectTop
  const s3LastDays = Math.max(1, Math.min(10, input.s3LastDays ?? 5))
  const s3ChangePct = Math.max(0, Math.min(30, input.s3ChangePct ?? 9.98))
  const s3VolumeMultiple = Math.max(1, Math.min(10, input.s3VolumeMultiple ?? 2))

  const capLimitYuan = s1MaxMarketCapYi * 100_000_000
  const window = enabled.has(2) ? s2LastDays : enabled.has(3) ? s3LastDays : 0
  const limit = enabled.has(2) || enabled.has(3) ? Math.max(20, window + 1) : 0
  const klineFqt = enabled.has(3) ? '0' : '1'

  const nameByCode = new Map<string, string>()
  const capYuanByCode = new Map<string, number>()

  let candidates: string[]
  if (input.candidateSymbols?.length) {
    candidates = input.candidateSymbols.map(normalizeAshareCode).filter(Boolean)
  } else {
    const maxCandidates = Math.max(20, Math.min(200, input.maxCandidates ?? 200))
    const n = Math.max(20, Math.min(100, Math.floor(maxCandidates / 2)))
    const [gainers, losers] = await Promise.all([
      getEastmoneyClist({ page: 1, pageSize: n, sort: 'pctchg_desc', timeoutMs: 12_000 }),
      getEastmoneyClist({ page: 1, pageSize: n, sort: 'pctchg_asc', timeoutMs: 12_000 }),
    ])

    for (const it of [...gainers.items, ...losers.items]) {
      nameByCode.set(it.code, it.name)
      capYuanByCode.set(it.code, it.marketCapYuan)
    }
    candidates = Array.from(new Set([...gainers.items.map((x) => x.code), ...losers.items.map((x) => x.code)])).slice(
      0,
      maxCandidates,
    )
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
        fqt: klineFqt,
        limit,
        ttlMs: 10 * 60 * 1000,
        timeoutMs: 12_000,
        fallbackToTencent: true,
      })
    : []

  const fvTarget = enabled.has(2) ? buildDailyShapeFeature({ candles: targetCandles, lastDays: s2LastDays }) : []
  void targetCandles

  const passStd3 = (candles: Candle[]): boolean => {
    const xs = candles.slice(-1 * (s3LastDays + 1))
    if (xs.length < 2) return false
    for (let i = 1; i < xs.length; i += 1) {
      const prev = xs[i - 1]
      const cur = xs[i]
      const changePctAbs = Math.abs((cur.close / Math.max(1e-9, prev.close) - 1) * 100)
      const volMultiple = cur.volume / Math.max(1e-9, prev.volume)
      if (changePctAbs + 0.02 >= s3ChangePct && volMultiple >= s3VolumeMultiple) return true
    }
    return false
  }

  if (enabled.has(3) && !enabled.has(2)) {
    const want = top
    const picked: Array<SimilarStock & { idx: number }> = []
    const pickedSet = new Set<string>()
    let i = 0

    const workers = new Array(4).fill(null).map(async () => {
      while (true) {
        if (picked.length >= want) return
        const idx = i
        i += 1
        if (idx >= candidates.length) return
        const code = candidates[idx]
        try {
          const candles = await getCandlesCached({
            code,
            klt: '101',
            fqt: klineFqt,
            limit,
            ttlMs: 10 * 60 * 1000,
            timeoutMs: 12_000,
            fallbackToTencent: true,
          })
          if (!passStd3(candles)) continue

          if (pickedSet.has(code)) continue
          pickedSet.add(code)
          picked.push({
            symbol: code,
            name: typeof nameByCode.get(code) === 'string' ? String(nameByCode.get(code)) : undefined,
            score: clamp01(1 - idx / Math.max(1, candidates.length)),
            idx,
          })
        } catch {
          continue
        }
      }
    })

    await Promise.all(workers)
    const out = picked
      .sort((a, b) => a.idx - b.idx)
      .slice(0, top)
      .map((x) => ({ symbol: x.symbol, name: x.name, score: x.score }))
    return { target, candidates: candidates.length, top: out, meta: { window } }
  }

  const rows = await mapLimit(candidates, enabled.has(2) || enabled.has(3) ? 4 : 2, async (code) => {
    try {
      const candles = await getCandlesCached({
        code,
        klt: '101',
        fqt: klineFqt,
        limit,
        ttlMs: 10 * 60 * 1000,
        timeoutMs: 12_000,
        fallbackToTencent: true,
      })
      if (enabled.has(3)) {
        if (!passStd3(candles)) return null
      }

      if (enabled.has(2)) {
        const fv = buildDailyShapeFeature({ candles, lastDays: s2LastDays })
        if (!fv.length || !fvTarget.length) return null
        const s = cosine(fvTarget, fv)
        const sim = clamp01((s + 1) / 2)
        if (sim < s2MinSimilarity) return null
        return {
          symbol: code,
          name: typeof nameByCode.get(code) === 'string' ? String(nameByCode.get(code)) : undefined,
          score: sim,
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
  return { target, candidates: candidates.length, top: scored.slice(0, top), meta: { window } }
}
