import type { RatioItem, StockRatiosResponse } from './types.js'

function safeDiv(n: number | undefined, d: number | undefined): number | undefined {
  if (n === undefined || d === undefined) return undefined
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return undefined
  return n / d
}

export function buildRatiosResponse(input: {
  symbol: string
  asOf: 'latest' | 'previous'
  asOfDate: string
  fields: {
    netAssets?: number
    totalAssets?: number
    revenue?: number
    cash?: number
    marketCap?: number
  }
}): StockRatiosResponse {
  const { symbol, asOf, asOfDate, fields } = input

  const netAssetsOverTotalAssets = safeDiv(fields.netAssets, fields.totalAssets)
  const revenueOverMarketCap = safeDiv(fields.revenue, fields.marketCap)
  const totalAssetsOverMarketCap = safeDiv(fields.totalAssets, fields.marketCap)
  const cashOverMarketCap = safeDiv(fields.cash, fields.marketCap)

  const ratios: RatioItem[] = [
    {
      key: 'net_assets_over_total_assets',
      label: '净资产/总资产',
      value: netAssetsOverTotalAssets ?? NaN,
      unitHint: '%',
      asOfDate,
      formula: '净资产 ÷ 总资产',
    },
    {
      key: 'revenue_over_market_cap',
      label: '营收/总市值',
      value: revenueOverMarketCap ?? NaN,
      unitHint: 'x',
      asOfDate,
      formula: '营收 ÷ 总市值',
    },
    {
      key: 'total_assets_over_market_cap',
      label: '总资产/总市值',
      value: totalAssetsOverMarketCap ?? NaN,
      unitHint: 'x',
      asOfDate,
      formula: '总资产 ÷ 总市值',
    },
    {
      key: 'cash_over_market_cap',
      label: '货币资金/总市值',
      value: cashOverMarketCap ?? NaN,
      unitHint: 'x',
      asOfDate,
      formula: '货币资金 ÷ 总市值',
    },
  ]

  return {
    symbol,
    asOf,
    ratios,
    fields,
  }
}

