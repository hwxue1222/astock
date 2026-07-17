export type EventType =
  | 'REGULATORY'
  | 'LITIGATION'
  | 'EARNINGS'
  | 'MNA'
  | 'SUSPEND_RESUME'
  | 'DEBT_DEFAULT'
  | 'OTHER'

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

export interface StockItem {
  symbol: string
  name: string
  exchange?: string
}

export interface MajorEvent {
  id: string
  symbol: string
  title: string
  summary?: string
  sourceName: string
  sourceUrl?: string
  publishedAt: string
  eventType: EventType
  riskLevel?: RiskLevel
}

export interface RiskSignal {
  id: string
  symbol: string
  level: RiskLevel
  title: string
  reason: string
  relatedEventIds: string[]
  occurredAt: string
  direction: 'NEGATIVE' | 'UNCERTAIN'
}

export interface RatioItem {
  key:
    | 'net_assets_over_total_assets'
    | 'revenue_over_market_cap'
    | 'total_assets_over_market_cap'
    | 'cash_over_market_cap'
  label: string
  value: number
  unitHint: '%' | 'x'
  asOfDate: string
  formula: string
}

export interface StockRatiosResponse {
  symbol: string
  asOf: 'latest' | 'previous'
  ratios: RatioItem[]
  fields: {
    netAssets?: number
    totalAssets?: number
    revenue?: number
    cash?: number
    marketCap?: number
  }
}

export interface RiskSignalsResponse {
  symbol: string
  updatedAt: string
  overallLevel: RiskLevel
  signals: RiskSignal[]
}

export type KlineKlt = '101' | '102' | '103'
export type KlineFqt = '0' | '1' | '2'

export interface KlineCandle {
  ts: string
  open: number
  close: number
  high: number
  low: number
  volume: number
}

export interface StockKlineResponse {
  symbol: string
  name?: string
  klt: KlineKlt
  fqt: KlineFqt
  candles: KlineCandle[]
  meta?: {
    source?: string
  }
}

export interface SimilarStockItem {
  symbol: string
  name: string | undefined
  score: number
}

export interface SimilarStocksResponse {
  target: string
  candidates: number
  top: SimilarStockItem[]
  meta?: {
    window?: number
    source?: string
  }
}
