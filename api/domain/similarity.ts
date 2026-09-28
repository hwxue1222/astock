import { getEastmoneyKline } from '../providers/eastmoneyKline.js'
import { getEastmoneyClist } from '../providers/eastmoneyClist.js'
import { getSinaSpotDataset } from '../providers/ashareSinaSpot.js'
import { getTencentKline } from '../providers/tencentKline.js'
import { detectKlinePatterns, hasPatternInLastNDays } from './klineStrongPatterns.js'

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
  s4Matches?: Array<{ id: string; name: string; kind: 'strong' | 'reversal' | 'range_ready' }>
}

type UniverseEntry = {
  code: string
  name?: string
  marketCapYuan?: number
}

type GalaxyBridgeCodesResp = {
  items?: Array<{ code?: string; name?: string }>
}

type GalaxyBridgeStateOwnedResp = {
  items?: Array<{
    code?: string
    isStateOwned?: boolean
    evidence?: string[]
  }>
}

async function fetchGalaxyBridgeCodes(input: { limit: number; timeoutMs?: number }): Promise<UniverseEntry[]> {
  const base = (process.env.GALAXY_BRIDGE_URL ?? '').trim()
  if (!base) return []
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), input.timeoutMs ?? 15_000)
    const resp = await fetch(`${base.replace(/\/$/, '')}/codes?limit=${Math.min(7000, Math.max(1, input.limit))}`, {
      signal: ctrl.signal,
    })
    clearTimeout(t)
    if (!resp.ok) return []
    const data = (await resp.json()) as GalaxyBridgeCodesResp
    const items = (data.items ?? [])
      .map((it) => ({ code: String(it.code ?? '').trim(), name: String(it.name ?? '').trim() || undefined }))
      .filter((x) => /^\d{6}$/.test(x.code))
    return items
  } catch {
    return []
  }
}

async function fetchGalaxyBridgeStateOwned(input: {
  codes: string[]
  timeoutMs?: number
}): Promise<Map<string, { isStateOwned: boolean; evidence: string[] }>> {
  const base = (process.env.GALAXY_BRIDGE_URL ?? '').trim()
  if (!base) return new Map()
  const uniq = Array.from(new Set(input.codes.map((x) => String(x ?? '').trim()).filter((x) => /^\d{6}$/.test(x))))
  if (!uniq.length) return new Map()

  const chunkSize = 200
  const chunks: string[][] = []
  for (let i = 0; i < uniq.length; i += chunkSize) chunks.push(uniq.slice(i, i + chunkSize))

  const out = new Map<string, { isStateOwned: boolean; evidence: string[] }>()

  for (const chunk of chunks) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), input.timeoutMs ?? 18_000)
      const resp = await fetch(
        `${base.replace(/\/$/, '')}/stateowned?codes=${encodeURIComponent(chunk.join(','))}`,
        { signal: ctrl.signal },
      )
      clearTimeout(t)
      if (!resp.ok) continue
      const data = (await resp.json()) as GalaxyBridgeStateOwnedResp
      for (const it of data.items ?? []) {
        const code = String(it.code ?? '').trim()
        if (!/^\d{6}$/.test(code)) continue
        out.set(code, {
          isStateOwned: Boolean(it.isStateOwned),
          evidence: Array.isArray(it.evidence) ? it.evidence.map((x) => String(x)) : [],
        })
      }
    } catch {
      continue
    }
  }

  return out
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
}): Promise<{ candidates: string[]; source: 'eastmoney_clist' | 'sina_spot_cache' | 'galaxy_bridge' }> {
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

  const galaxyItems = await fetchGalaxyBridgeCodes({ limit: Math.max(200, input.maxCandidates), timeoutMs: 15_000 })
  if (galaxyItems.length) {
    for (const it of galaxyItems) {
      if (it.name) input.nameByCode.set(it.code, it.name)
    }
    return { candidates: galaxyItems.map((x) => x.code).slice(0, input.maxCandidates), source: 'galaxy_bridge' }
  }

  throw new Error('Full-market candidate pool unavailable')
}

export async function findSimilarStocks(input: {
  targetSymbol: string
  klt: '101' | '102' | '103'
  fqt: '0' | '1' | '2'
  days: number
  top: number
  anchorDate?: string
  candidateSymbols?: string[]
  maxCandidates?: number
  enabled: Array<1 | 2 | 3 | 4 | 5 | 6>
  s1MaxMarketCapYi: number
  s2LastDays: number
  s2TurnoverSpikeMultiple: number
  s2PreselectTop: number
  s2MinSimilarity?: number
  s3LastDays?: number
  s3ChangePct?: number
  s3VolumeMultiple?: number
  s4MinOverlap?: number
}): Promise<{
  target: string
  candidates: number
  top: SimilarStock[]
  meta: {
    window: number
    candidatePool: 'full_market' | 'custom'
    candidateSource: string
    s6?: { applied: boolean; source?: string; kept?: number; reason?: string }
  }
}> {
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
  const s4MinOverlap = Math.max(1, Math.min(10, input.s4MinOverlap ?? 1))

  const capLimitYuan = s1MaxMarketCapYi * 100_000_000
  const window = enabled.has(2) ? s2LastDays : enabled.has(3) ? s3LastDays : 0
  const baseLimit = enabled.has(2) || enabled.has(3) ? Math.max(20, window + 1) : 0
  const limit = enabled.has(4) ? Math.max(baseLimit, 220) : baseLimit
  const limit2 = enabled.has(5) ? Math.max(limit, 140) : limit
  const fetchLimit = input.anchorDate ? Math.max(limit2, 900) : limit2
  const klineFqt = enabled.has(3) ? '0' : '1'

  const anchorDate = input.anchorDate && /^\d{4}-\d{2}-\d{2}$/.test(input.anchorDate) ? input.anchorDate : undefined
  const anchorMs = anchorDate ? Date.parse(`${anchorDate}T23:59:59.999Z`) : undefined

  const parseCandleDateMs = (ts: string): number => {
    const raw = String(ts ?? '').trim()
    if (!raw) return Number.NaN
    const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/)?.[1]
    if (iso) return Date.parse(`${iso}T00:00:00Z`)
    const ymd = raw.match(/^(\d{8})/)?.[1]
    if (ymd) {
      const y = ymd.slice(0, 4)
      const m = ymd.slice(4, 6)
      const d = ymd.slice(6, 8)
      return Date.parse(`${y}-${m}-${d}T00:00:00Z`)
    }
    return Date.parse(raw)
  }

  const sliceAsOf = (candles: Candle[]): Candle[] => {
    if (!anchorMs) return candles
    const filtered = candles.filter((c) => {
      const ms = parseCandleDateMs(c.ts)
      return Number.isFinite(ms) && ms <= anchorMs
    })
    return filtered
  }

  const passStd5 = (candles: Candle[]): boolean => {
    if (!enabled.has(5)) return true
    return hasPatternInLastNDays(candles, 'roucuo_line', 15)
  }

  const nameByCode = new Map<string, string>()
  const capYuanByCode = new Map<string, number>()

  let candidates: string[]
  let candidatePool: 'full_market' | 'custom'
  let candidateSource: string
  let s6Meta:
    | { applied: boolean; source?: string; kept?: number; reason?: string }
    | undefined
  if (input.candidateSymbols?.length) {
    candidates = input.candidateSymbols.map(normalizeAshareCode).filter(Boolean)
    candidatePool = 'custom'
    candidateSource = 'custom'
  } else {
    const maxCandidates = Math.max(60, Math.min(2000, input.maxCandidates ?? 500))
    const out = await getFullMarketCandidates({
      maxCandidates,
      sort: 'pctchg_desc',
      capLimitYuan,
      applyCapLimit: enabled.has(1),
      nameByCode,
      capYuanByCode,
    })
    candidates = out.candidates
    candidatePool = 'full_market'
    candidateSource = out.source
  }

  const buildMeta = () => ({
    window,
    candidatePool,
    candidateSource,
    ...(s6Meta ? { s6: s6Meta } : {}),
  })

  candidates = Array.from(new Set(candidates)).filter((c) => c !== target)

  if (enabled.has(1) && capYuanByCode.size) {
    candidates = candidates.filter((c) => {
      const cap = capYuanByCode.get(c)
      return typeof cap === 'number' ? cap <= capLimitYuan : false
    })
  }

  if (enabled.has(6)) {
    const base = (process.env.GALAXY_BRIDGE_URL ?? '').trim()
    if (!base) {
      return {
        target,
        candidates: 0,
        top: [],
        meta: { ...buildMeta(), s6: { applied: false, reason: 'GALAXY_BRIDGE_URL missing' } },
      }
    }
    const stateMap = await fetchGalaxyBridgeStateOwned({
      codes: candidates,
      timeoutMs: 18_000,
    })
    if (!stateMap.size) {
      return {
        target,
        candidates: 0,
        top: [],
        meta: { ...buildMeta(), s6: { applied: false, source: 'galaxy_bridge', reason: 'bridge returned empty' } },
      }
    }
    const stateSet = new Set<string>()
    for (const [code, v] of stateMap.entries()) {
      if (v.isStateOwned) stateSet.add(code)
    }
    candidates = candidates.filter((c) => stateSet.has(c))
    s6Meta = { applied: true, source: 'galaxy_bridge', kept: candidates.length }
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
    return { target, candidates: candidates.length, top: out, meta: buildMeta() }
  }

  if (enabled.size === 1 && enabled.has(6)) {
    const out = candidates
      .map((c) => ({
        symbol: c,
        name: typeof nameByCode.get(c) === 'string' ? String(nameByCode.get(c)) : undefined,
        score: 1,
      }) satisfies SimilarStock)
      .slice(0, top)
    return {
      target,
      candidates: candidates.length,
      top: out,
      meta: buildMeta(),
    }
  }

  if (enabled.size === 1 && enabled.has(6)) {
    const out = candidates
      .map((c) => ({
        symbol: c,
        name: typeof nameByCode.get(c) === 'string' ? String(nameByCode.get(c)) : undefined,
        score: 1,
      }) satisfies SimilarStock)
      .slice(0, top)
    return { target, candidates: candidates.length, top: out, meta: buildMeta() }
  }

  const targetCandles = enabled.has(2) || enabled.has(3) || enabled.has(4)
    ? await getCandlesCached({
        code: target,
        klt: '101',
        fqt: klineFqt,
        limit: fetchLimit,
        ttlMs: 10 * 60 * 1000,
        timeoutMs: 12_000,
        fallbackToTencent: true,
      })
    : []

  const targetCandlesAsOf = sliceAsOf(targetCandles)

  const fvTarget = enabled.has(2) ? buildDailyShapeFeature({ candles: targetCandlesAsOf, lastDays: s2LastDays }) : []

  const targetPatternHits = enabled.has(4) ? detectKlinePatterns(targetCandlesAsOf) : []
  const targetPatternIds = enabled.has(4) ? new Set(targetPatternHits.map((x) => x.id)) : new Set<string>()

  const passStd4 = (
    candles: Candle[],
  ): {
    ok: boolean
    overlap: number
    ratio: number
    matches: Array<{ id: string; name: string; kind: 'strong' | 'reversal' | 'range_ready' }>
  } => {
    if (!enabled.has(4)) return { ok: true, overlap: 0, ratio: 0, matches: [] }
    if (!targetPatternIds.size) return { ok: false, overlap: 0, ratio: 0, matches: [] }
    const cand = detectKlinePatterns(candles)
    if (!cand.length) return { ok: false, overlap: 0, ratio: 0, matches: [] }

    const matches = cand
      .filter((x) => targetPatternIds.has(x.id))
      .sort((a, b) => b.score - a.score)
      .map((x) => ({ id: x.id, name: x.name, kind: x.kind }))
    const overlap = matches.length
    const ratio = overlap / Math.max(1, targetPatternIds.size)
    return { ok: overlap >= s4MinOverlap, overlap, ratio, matches }
  }

  if (enabled.size === 1 && enabled.has(4)) {
    const want = top
    const picked: Array<SimilarStock & { idx: number; ratio: number }> = []
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
            limit: fetchLimit,
            ttlMs: 10 * 60 * 1000,
            timeoutMs: 12_000,
            fallbackToTencent: true,
          })
          const candlesAsOf = sliceAsOf(candles)
          const s4 = passStd4(candlesAsOf)
          if (!s4.ok) continue

          if (pickedSet.has(code)) continue
          pickedSet.add(code)
          picked.push({
            symbol: code,
            name: typeof nameByCode.get(code) === 'string' ? String(nameByCode.get(code)) : undefined,
            score: clamp01(0.5 + s4.ratio * 0.5),
            idx,
            ratio: s4.ratio,
            s4Matches: s4.matches,
          })
        } catch {
          continue
        }
      }
    })

    await Promise.all(workers)
    const out = picked
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, top)
      .map((x) => ({ symbol: x.symbol, name: x.name, score: x.score, s4Matches: x.s4Matches }))
    return { target, candidates: candidates.length, top: out, meta: buildMeta() }
  }

  if (enabled.size === 1 && enabled.has(5)) {
    const want = top
    const picked: Array<SimilarStock & { idx: number; pScore: number }> = []
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
            limit: fetchLimit,
            ttlMs: 10 * 60 * 1000,
            timeoutMs: 12_000,
            fallbackToTencent: true,
          })
          const candlesAsOf = sliceAsOf(candles)
          const hits = detectKlinePatterns(candlesAsOf)
          const hit = hits.find((h) => h.id === 'roucuo_line')
          if (!hit) continue

          if (pickedSet.has(code)) continue
          pickedSet.add(code)
          picked.push({
            symbol: code,
            name: typeof nameByCode.get(code) === 'string' ? String(nameByCode.get(code)) : undefined,
            score: clamp01(0.5 + hit.score * 0.5),
            idx,
            pScore: hit.score,
          })
        } catch {
          continue
        }
      }
    })

    await Promise.all(workers)
    const out = picked
      .sort((a, b) => b.pScore - a.pScore)
      .slice(0, top)
      .map((x) => ({ symbol: x.symbol, name: x.name, score: x.score }))
    return { target, candidates: candidates.length, top: out, meta: buildMeta() }
  }

  const passStd3 = (candles: Candle[]): boolean => {
    const cs = sliceAsOf(candles)
    const xs = cs.slice(-1 * (s3LastDays + 1))
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

  if (enabled.size === 1 && enabled.has(3)) {
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
            limit: fetchLimit,
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
    return { target, candidates: candidates.length, top: out, meta: buildMeta() }
  }

  const rows = await mapLimit<string, SimilarStock | null>(
    candidates,
    enabled.has(2) || enabled.has(3) ? 4 : 2,
    async (code) => {
    try {
      const candles = await getCandlesCached({
        code,
        klt: '101',
        fqt: klineFqt,
        limit: fetchLimit,
        ttlMs: 10 * 60 * 1000,
        timeoutMs: 12_000,
        fallbackToTencent: true,
      })
      const candlesAsOf = sliceAsOf(candles)

      if (enabled.has(5)) {
        if (!passStd5(candlesAsOf)) return null
      }
      if (enabled.has(3)) {
        if (!passStd3(candlesAsOf)) return null
      }

      const s4 = passStd4(candlesAsOf)
      if (!s4.ok) return null

      if (enabled.has(2)) {
        const fv = buildDailyShapeFeature({ candles: candlesAsOf, lastDays: s2LastDays })
        if (!fv.length || !fvTarget.length) return null
        const s = cosine(fvTarget, fv)
        const sim = clamp01((s + 1) / 2)
        if (sim < s2MinSimilarity) return null
        return {
          symbol: code,
          name: typeof nameByCode.get(code) === 'string' ? String(nameByCode.get(code)) : undefined,
          score: sim,
          s4Matches: enabled.has(4) ? s4.matches : undefined,
        } satisfies SimilarStock
      }

      const cap = capYuanByCode.get(code) ?? 0
      return {
        symbol: code,
        name: typeof nameByCode.get(code) === 'string' ? String(nameByCode.get(code)) : undefined,
        score: clamp01(cap / Math.max(1, capLimitYuan)),
        s4Matches: enabled.has(4) ? s4.matches : undefined,
      } satisfies SimilarStock
    } catch {
      return null
    }
    },
  )

  const scored = rows.filter((x): x is SimilarStock => x !== null).sort((a, b) => b.score - a.score)
  return { target, candidates: candidates.length, top: scored.slice(0, top), meta: buildMeta() }
}
