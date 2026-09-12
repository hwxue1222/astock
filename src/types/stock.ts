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
  amount?: number
  turnover?: number
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

export interface RumorKeyword {
  keyword: string
  count: number
}

export interface RumorTopic {
  topic: string
  count: number
}

export interface RumorStats {
  totalPosts: number
  negativePosts: number
  negativeRatio: number
}

export interface RumorPost {
  id: string
  title: string
  url: string
  publishedAt: string
  matchedKeywords: string[]
  readCount: number | null
  replyCount: number | null
}

export interface RumorsResponse {
  symbol: string
  source: string
  keywords: RumorKeyword[]
  topics: RumorTopic[]
  stats: RumorStats
  posts: RumorPost[]
}

export interface ThsClassicStatItem {
  rank: 1 | 2 | 3
  title: string
  timeText: string
  url?: string
  articleTimeText?: string | null
  articleSourceText?: string | null
}

export interface ThsClassicStatsResponse {
  sourceName: '同花顺 classic'
  sourceUrl: string
  fetchedAtISO: string
  items: ThsClassicStatItem[]
}

export interface ThsClassicArticleStocksResponse {
  url: string
  codes: string[]
}

export interface StockQuoteResponse {
  symbol: string
  name?: string
  industry?: string
  marketCapYuan?: number
  floatMarketCapYuan?: number
  pe?: number
}

export interface StockSurveyResponse {
  symbol: string
  controllerType?: string
  controller?: string
}

export interface StockQuotesResponse {
  items: StockQuoteResponse[]
}

export type IndustryRotationForecastItem = {
  name: string
  category?: string
  score: number
  seasonalityAvgReturnPct?: number
  seasonalityPosRatePct?: number
  flowNetInflowWan?: number
  flowNetInflowRatePct?: number
  leaders: Array<{ symbol: string; name?: string }>
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

export type IndustryMonthlyFlowSeasonalityResponse = {
  years: number
  baselineYears: number[]
  baselineTop5ByMonth: Array<{
    month: number
    top: Array<{
      boardCode: string
      name: string
      avgNetInflowYi: number
      positiveYearRatePct: number
      yearsUsed: number
    }>
  }>
  y2026JanAugTop5ByMonth: Array<{
    month: number
    top: Array<{
      boardCode: string
      name: string
      netInflowYi: number
    }>
  }>
  y2026SepDecForecastTop3ByMonth: Array<{
    month: number
    top: Array<{
      boardCode: string
      name: string
      score: number
      seasonalityAvgNetInflowYi?: number
      y2026YtdNetInflowYi?: number
      leaders: Array<{ symbol: string; name?: string }>
    }>
  }>
  meta: {
    boardsTotal: number
    boardsUsed: number
    asOfDate: string
    computeMs: number
    partial?: boolean
    source: string
  }
}

export type IndustryMoneyflowItem = {
  name: string
  avgPrice: number
  changePct: number
  inflowWan: number
  outflowWan: number
  netInflowWan: number
  netInflowRate: number
  leadingSymbol?: string
  leadingName?: string
}

export interface IndustryMoneyflowResponse {
  items: IndustryMoneyflowItem[]
}

export interface MarketBreadthResponse {
  asOfDate: string
  total: number
  up: number
  down: number
  flat: number
  unknown: number
  meta?: {
    source?: string
    ts?: number
  }
}
