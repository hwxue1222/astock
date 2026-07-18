import { describe, expect, it } from 'vitest'
import { eventRiskLevel } from './eventRisk.js'
import type { MajorEvent } from './types.js'

describe('eventRiskLevel', () => {
  it('marks HIGH when summary mentions tender ban', () => {
    const e: MajorEvent = {
      id: 'e1',
      symbol: '300444',
      title: '完成自查和整改',
      summary: '公司本部被国家电网全部品类暂停中标一年，暂停截止日为2027年5月31日。',
      sourceName: 'Mock',
      publishedAt: '2026-07-16T00:00:00.000Z',
      eventType: 'OTHER',
    }
    expect(eventRiskLevel(e)).toBe('HIGH')
  })
})

