import { describe, expect, it } from 'vitest'
import { buildRiskSignals } from './riskEngine.js'
import type { MajorEvent } from './types.js'

function isoDaysAgo(days: number): string {
  const d = new Date('2026-01-31T00:00:00.000Z')
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString()
}

describe('buildRiskSignals', () => {
  it('marks HIGH when recent DEBT_DEFAULT exists', () => {
    const now = new Date('2026-01-31T00:00:00.000Z')
    const events: MajorEvent[] = [
      {
        id: 'e1',
        symbol: 'AAA',
        title: 'Debt default reported',
        summary: 'Company missed coupon payment.',
        sourceName: 'MockWire',
        sourceUrl: 'https://example.com',
        publishedAt: isoDaysAgo(2),
        eventType: 'DEBT_DEFAULT',
      },
      {
        id: 'e2',
        symbol: 'AAA',
        title: 'Earnings release',
        summary: 'Quarterly results.',
        sourceName: 'MockWire',
        sourceUrl: 'https://example.com',
        publishedAt: isoDaysAgo(10),
        eventType: 'EARNINGS',
      },
    ]

    const res = buildRiskSignals({ symbol: 'AAA', events, now })
    expect(res.overallLevel).toBe('HIGH')
    expect(res.signals.some((s) => s.id === 'sig_AAA_DEBT_DEFAULT')).toBe(true)
  })

  it('downgrades old HIGH signals to LOW/ MEDIUM by recency', () => {
    const now = new Date('2026-01-31T00:00:00.000Z')
    const events: MajorEvent[] = [
      {
        id: 'e1',
        symbol: 'AAA',
        title: 'Regulatory inquiry',
        sourceName: 'MockWire',
        publishedAt: isoDaysAgo(40),
        eventType: 'REGULATORY',
      },
    ]
    const res = buildRiskSignals({ symbol: 'AAA', events, now })
    expect(res.overallLevel).toBe('LOW')
  })

  it('forces overall HIGH when any event is marked HIGH', () => {
    const now = new Date('2026-01-31T00:00:00.000Z')
    const events: MajorEvent[] = [
      {
        id: 'e1',
        symbol: 'AAA',
        title: 'Tender ban',
        sourceName: 'MockWire',
        publishedAt: isoDaysAgo(120),
        eventType: 'OTHER',
        riskLevel: 'HIGH',
      },
    ]
    const res = buildRiskSignals({ symbol: 'AAA', events, now })
    expect(res.overallLevel).toBe('HIGH')
  })
})
