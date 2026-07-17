import { describe, expect, it } from 'vitest'
import { buildRatiosResponse } from './ratios.js'

describe('buildRatiosResponse', () => {
  it('computes ratios with correct units', () => {
    const res = buildRatiosResponse({
      symbol: 'TEST',
      asOf: 'latest',
      asOfDate: '2024-12-31',
      fields: {
        netAssets: 40,
        totalAssets: 100,
        revenue: 50,
        cash: 10,
        marketCap: 200,
      },
    })

    const net = res.ratios.find((r) => r.key === 'net_assets_over_total_assets')
    const rev = res.ratios.find((r) => r.key === 'revenue_over_market_cap')
    const assets = res.ratios.find((r) => r.key === 'total_assets_over_market_cap')
    const cash = res.ratios.find((r) => r.key === 'cash_over_market_cap')

    expect(net?.unitHint).toBe('%')
    expect(net?.value).toBeCloseTo(0.4, 8)

    expect(rev?.unitHint).toBe('x')
    expect(rev?.value).toBeCloseTo(0.25, 8)

    expect(assets?.value).toBeCloseTo(0.5, 8)
    expect(cash?.value).toBeCloseTo(0.05, 8)
  })

  it('returns NaN when data is missing', () => {
    const res = buildRatiosResponse({
      symbol: 'TEST',
      asOf: 'latest',
      asOfDate: '2024-12-31',
      fields: {
        totalAssets: 100,
      },
    })
    const rev = res.ratios.find((r) => r.key === 'revenue_over_market_cap')
    expect(Number.isNaN(rev?.value ?? 0)).toBe(true)
  })
})

