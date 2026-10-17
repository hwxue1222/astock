import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  fetchMock,
  getEastmoneyClistMock,
  getSinaSpotDatasetMock,
  getEastmoneyKlineMock,
  getTencentKlineMock,
  detectKlinePatternsMock,
  hasPatternInLastNDaysMock,
  getEastmoneyQuoteMock,
  getEastmoneyCoreConceptionTagsMock,
  getEastmoneyF10NewsMock,
  getEastmoneyAnnouncementsMock,
} = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  getEastmoneyClistMock: vi.fn(),
  getSinaSpotDatasetMock: vi.fn(),
  getEastmoneyKlineMock: vi.fn(),
  getTencentKlineMock: vi.fn(),
  detectKlinePatternsMock: vi.fn(),
  hasPatternInLastNDaysMock: vi.fn(),
  getEastmoneyQuoteMock: vi.fn(),
  getEastmoneyCoreConceptionTagsMock: vi.fn(),
  getEastmoneyF10NewsMock: vi.fn(),
  getEastmoneyAnnouncementsMock: vi.fn(),
}))

vi.mock('../providers/eastmoneyClist.js', () => ({
  getEastmoneyClist: getEastmoneyClistMock,
}))

vi.mock('../providers/ashareSinaSpot.js', () => ({
  getSinaSpotDataset: getSinaSpotDatasetMock,
}))

vi.mock('../providers/eastmoneyKline.js', () => ({
  getEastmoneyKline: getEastmoneyKlineMock,
}))

vi.mock('../providers/tencentKline.js', () => ({
  getTencentKline: getTencentKlineMock,
}))

vi.mock('./klineStrongPatterns.js', () => ({
  detectKlinePatterns: detectKlinePatternsMock,
  hasPatternInLastNDays: hasPatternInLastNDaysMock,
}))

vi.mock('../providers/eastmoneyQuote.js', () => ({
  getEastmoneyQuote: getEastmoneyQuoteMock,
}))

vi.mock('../providers/eastmoneyCoreConception.js', () => ({
  getEastmoneyCoreConceptionTags: getEastmoneyCoreConceptionTagsMock,
}))

vi.mock('../providers/eastmoneyNews.js', () => ({
  getEastmoneyF10News: getEastmoneyF10NewsMock,
}))

vi.mock('../providers/eastmoneyNotices.js', () => ({
  getEastmoneyAnnouncements: getEastmoneyAnnouncementsMock,
}))

import { findSimilarStocks } from './similarity.js'

const originalFetch = global.fetch
vi.stubGlobal('fetch', fetchMock)

const baseCandles = [
  { ts: '2026-09-22', open: 10, high: 10.2, low: 9.8, close: 10, volume: 100 },
  { ts: '2026-09-23', open: 10, high: 10.3, low: 9.9, close: 10.1, volume: 105 },
  { ts: '2026-09-24', open: 10.1, high: 10.4, low: 10, close: 10.2, volume: 110 },
  { ts: '2026-09-25', open: 10.2, high: 10.5, low: 10.1, close: 10.3, volume: 115 },
  { ts: '2026-09-26', open: 10.3, high: 10.6, low: 10.2, close: 10.4, volume: 120 },
  { ts: '2026-09-29', open: 10.4, high: 11.5, low: 10.3, close: 11.45, volume: 260 },
  { ts: '2026-09-30', open: 11.45, high: 11.7, low: 11.2, close: 11.55, volume: 265 },
  { ts: '2026-10-01', open: 11.55, high: 11.8, low: 11.4, close: 11.65, volume: 250 },
] as const

const allStandards = [1, 2, 3, 4, 5, 6, 7] as const
const allCombinations = allStandards.flatMap((_, idx) => {
  const start = 1 << idx
  return Array.from({ length: 1 << idx }, () => null)
    .map((_, localIdx) => start + localIdx)
    .filter((mask, selfIdx, arr) => arr.indexOf(mask) === selfIdx)
})
  .map((mask) => allStandards.filter((_, bit) => (mask & (1 << bit)) !== 0))
  .filter((combo, idx, arr) => arr.findIndex((x) => x.join(',') === combo.join(',')) === idx)

afterAll(() => {
  global.fetch = originalFetch
})

describe('findSimilarStocks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.GALAXY_BRIDGE_URL

    getEastmoneyKlineMock.mockResolvedValue({ candles: baseCandles })
    getTencentKlineMock.mockResolvedValue({ candles: [] })
    detectKlinePatternsMock.mockReturnValue([
      { id: 'roucuo_line', name: '揉搓线', kind: 'range_ready', score: 0.95 },
      { id: 'breakout', name: '强势突破', kind: 'strong', score: 0.9 },
    ])
    hasPatternInLastNDaysMock.mockReturnValue(true)
    getEastmoneyQuoteMock.mockImplementation(async ({ code }: { code: string }) => ({
      name: `AI${code}`,
      industry: 'AI产业',
    }))
    getEastmoneyCoreConceptionTagsMock.mockResolvedValue(['人工智能'])
    getEastmoneyF10NewsMock.mockResolvedValue([])
    getEastmoneyAnnouncementsMock.mockResolvedValue([])
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/stateowned?')) {
        return {
          ok: true,
          async json() {
            return {
              items: [
                { code: '000001', isStateOwned: true, evidence: ['mock'] },
                { code: '000002', isStateOwned: true, evidence: ['mock'] },
                { code: '000003', isStateOwned: true, evidence: ['mock'] },
              ],
            }
          },
        }
      }
      throw new Error(`Unexpected fetch url: ${String(url)}`)
    })
  })

  it('falls back to cached Sina dataset when Eastmoney list is unavailable', async () => {
    getEastmoneyClistMock.mockRejectedValue(new Error('Empty reply from server'))
    getSinaSpotDatasetMock.mockResolvedValue({
      items: [
        { code: '600001', name: 'A', mktcap: 100_000 },
        { code: '600002', name: 'B', mktcap: 200_000 },
      ],
    })

    const out = await findSimilarStocks({
      targetSymbol: '300999',
      klt: '101',
      fqt: '1',
      days: 160,
      top: 5,
      enabled: [1],
      s1MaxMarketCapYi: 150,
      s2LastDays: 5,
      s2TurnoverSpikeMultiple: 2,
      s2PreselectTop: 20,
      s3LastDays: 5,
      s3ChangePct: 9.98,
      s3VolumeMultiple: 2,
    })

    expect(out.candidates).toBeGreaterThan(0)
    expect(getSinaSpotDatasetMock).toHaveBeenCalled()
  })

  it.each(allCombinations.map((enabled) => [enabled] as const))('runs for enabled standards %s', async (enabled) => {
    if (enabled.includes(6)) {
      process.env.GALAXY_BRIDGE_URL = 'http://mock-bridge.test'
    }

    const out = await findSimilarStocks({
      targetSymbol: '600000',
      klt: '101',
      fqt: '1',
      days: 160,
      top: 5,
      anchorDate: enabled.includes(2) ? '2026-09-30' : undefined,
      candidateSymbols: ['000001', '000002', '000003'],
      enabled: enabled as Array<1 | 2 | 3 | 4 | 5 | 6 | 7>,
      s1MaxMarketCapYi: 150,
      s2LastDays: 5,
      s2TurnoverSpikeMultiple: 2,
      s2PreselectTop: 20,
      s2MinSimilarity: 0,
      s3LastDays: 5,
      s3ChangePct: 9,
      s3VolumeMultiple: 2,
      s4MinOverlap: 1,
      s5LookbackDays: 15,
      s7Keywords: enabled.includes(7) ? ['AI'] : undefined,
      s7Strict: true,
    })

    expect(out.top.length).toBeGreaterThan(0)
    expect(out.top[0]?.symbol).toMatch(/^\d{6}$/)

    if (enabled.includes(6)) {
      expect(fetchMock).toHaveBeenCalled()
    }
  })
})
