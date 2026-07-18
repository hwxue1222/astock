import type {
  KlineFqt,
  KlineKlt,
  SimilarStocksResponse,
  MajorEvent,
  RiskSignalsResponse,
  RumorsResponse,
  StockItem,
  StockKlineResponse,
  StockRatiosResponse,
  StockQuoteResponse,
  ThsClassicStatsResponse,
  ThsClassicArticleStocksResponse,
} from '@/types/stock'

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Request failed: ${res.status}`)
  }
  return (await res.json()) as T
}

export async function getUniverse(signal?: AbortSignal): Promise<StockItem[]> {
  const data = await fetchJson<{ success: boolean; stocks: StockItem[] }>(
    '/api/stocks/universe',
    signal,
  )
  return data.stocks
}

export async function getEvents(
  symbol: string,
  input: { days: number; types: string[] },
  signal?: AbortSignal,
): Promise<MajorEvent[]> {
  const q = new URLSearchParams()
  q.set('days', String(input.days))
  if (input.types.length) q.set('type', input.types.join(','))
  const data = await fetchJson<{ success: boolean; events: MajorEvent[] }>(
    `/api/stocks/${encodeURIComponent(symbol)}/events?${q.toString()}`,
    signal,
  )
  return data.events
}

export async function getRatios(
  symbol: string,
  asOf: 'latest' | 'previous',
  signal?: AbortSignal,
): Promise<StockRatiosResponse> {
  const q = new URLSearchParams()
  q.set('asOf', asOf)
  const data = await fetchJson<{ success: boolean } & StockRatiosResponse>(
    `/api/stocks/${encodeURIComponent(symbol)}/ratios?${q.toString()}`,
    signal,
  )
  return data
}

export async function getRiskSignals(
  symbol: string,
  days: number,
  signal?: AbortSignal,
): Promise<RiskSignalsResponse> {
  const q = new URLSearchParams()
  q.set('days', String(days))
  const data = await fetchJson<{ success: boolean } & RiskSignalsResponse>(
    `/api/stocks/${encodeURIComponent(symbol)}/risk-signals?${q.toString()}`,
    signal,
  )
  return data
}

export async function getKline(
  symbol: string,
  input: { klt: KlineKlt; fqt: KlineFqt; limit: number },
  signal?: AbortSignal,
): Promise<StockKlineResponse> {
  const q = new URLSearchParams()
  q.set('klt', input.klt)
  q.set('fqt', input.fqt)
  q.set('limit', String(input.limit))
  const data = await fetchJson<{ success: boolean } & StockKlineResponse>(
    `/api/stocks/${encodeURIComponent(symbol)}/kline?${q.toString()}`,
    signal,
  )
  return data
}

export async function getQuote(symbol: string, signal?: AbortSignal): Promise<StockQuoteResponse> {
  const data = await fetchJson<{ success: boolean } & StockQuoteResponse>(
    `/api/stocks/${encodeURIComponent(symbol)}/quote`,
    signal,
  )
  return data
}

export async function getSimilarStocks(
  symbol: string,
  input: {
    days: number
    top: number
    klt: KlineKlt
    fqt: KlineFqt
    enabled?: Array<1 | 2 | 3>
    s1MaxMarketCapYi?: number
    s2LastDays?: number
    s2TurnoverSpikeMultiple?: number
    s2PreselectTop?: number
    s2MinSimilarity?: number
    s3ChangePct?: number
    s3VolumeMultiple?: number
    candidates?: string[]
  },
  signal?: AbortSignal,
): Promise<SimilarStocksResponse> {
  const q = new URLSearchParams()
  q.set('days', String(input.days))
  q.set('top', String(input.top))
  q.set('klt', input.klt)
  q.set('fqt', input.fqt)
  if (input.enabled?.length) q.set('enabled', input.enabled.join(','))
  if (typeof input.s1MaxMarketCapYi === 'number') q.set('s1MaxMarketCapYi', String(input.s1MaxMarketCapYi))
  if (typeof input.s2LastDays === 'number') q.set('s2LastDays', String(input.s2LastDays))
  if (typeof input.s2TurnoverSpikeMultiple === 'number')
    q.set('s2TurnoverSpikeMultiple', String(input.s2TurnoverSpikeMultiple))
  if (typeof input.s2PreselectTop === 'number') q.set('s2PreselectTop', String(input.s2PreselectTop))
  if (typeof input.s2MinSimilarity === 'number') q.set('s2MinSimilarity', String(input.s2MinSimilarity))
  if (typeof input.s3ChangePct === 'number') q.set('s3ChangePct', String(input.s3ChangePct))
  if (typeof input.s3VolumeMultiple === 'number') q.set('s3VolumeMultiple', String(input.s3VolumeMultiple))
  if (input.candidates?.length) q.set('candidates', input.candidates.join(','))
  const data = await fetchJson<{ success: boolean } & SimilarStocksResponse>(
    `/api/stocks/${encodeURIComponent(symbol)}/similar?${q.toString()}`,
    signal,
  )
  return data
}

export async function getRumors(
  symbol: string,
  input: { limit: number },
  signal?: AbortSignal,
): Promise<RumorsResponse> {
  const q = new URLSearchParams()
  q.set('limit', String(input.limit))
  const data = await fetchJson<{ success: boolean } & RumorsResponse>(
    `/api/stocks/${encodeURIComponent(symbol)}/rumors?${q.toString()}`,
    signal,
  )
  return data
}

export async function getThsClassicStats(signal?: AbortSignal): Promise<ThsClassicStatsResponse> {
  const data = await fetchJson<{ success: boolean } & ThsClassicStatsResponse>('/api/stocks/ths-classic', signal)
  return data
}

export async function getThsClassicArticleStocks(
  url: string,
  input?: { limit?: number },
  signal?: AbortSignal,
): Promise<ThsClassicArticleStocksResponse> {
  const q = new URLSearchParams()
  q.set('url', url)
  if (typeof input?.limit === 'number') q.set('limit', String(input.limit))
  const data = await fetchJson<{ success: boolean } & ThsClassicArticleStocksResponse>(
    `/api/stocks/ths-classic/stocks?${q.toString()}`,
    signal,
  )
  return data
}
