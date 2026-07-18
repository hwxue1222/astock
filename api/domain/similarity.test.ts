import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getEastmoneyClistMock, getSinaSpotDatasetMock, getEastmoneyKlineMock } = vi.hoisted(() => ({
  getEastmoneyClistMock: vi.fn(),
  getSinaSpotDatasetMock: vi.fn(),
  getEastmoneyKlineMock: vi.fn(),
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
  getTencentKline: vi.fn(),
}))

import { findSimilarStocks } from './similarity.ts'

describe('findSimilarStocks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('falls back to cached Sina full-market data when Eastmoney clist is unavailable', async () => {
    getEastmoneyClistMock.mockRejectedValue(new Error('Empty reply from server'))
    getSinaSpotDatasetMock.mockResolvedValue({
      items: [
        { code: '300001', name: 'Alpha', mktcap: 1_200_000 },
        { code: '300002', name: 'Beta', mktcap: 1_490_000 },
        { code: '300003', name: 'Gamma', mktcap: 2_000_000 },
      ],
    })

    const res = await findSimilarStocks({
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
      s3DailyDays: 5,
      s3MonthlyMonths: 24,
      s3MinSimilarity: 0.8,
    })

    expect(getSinaSpotDatasetMock).toHaveBeenCalledWith({
      preferNetwork: false,
      ttlSeconds: 7 * 24 * 3600,
    })
    expect(res.candidates).toBe(2)
    expect(res.top.map((it) => it.symbol)).toEqual(['300002', '300001'])
    expect(res.top.map((it) => it.name)).toEqual(['Beta', 'Alpha'])
  })

  it('standard2 keeps only candidates with combined monthly+daily similarity >= threshold', async () => {
    getEastmoneyKlineMock.mockImplementation(async (args: any) => {
      const limit = Number(args?.limit ?? 30)
      const code = String(args?.code ?? '')
      const dir = code === '300999' || code === '300001' ? 1 : -1
      const out = Array.from({ length: limit }, (_, i) => {
        const base = 100 + dir * i
        return {
          ts: String(i),
          open: base,
          high: base + 1,
          low: base - 1,
          close: base + 0.5,
          volume: 1000 + i,
        }
      })
      return { candles: out }
    })

    const res = await findSimilarStocks({
      targetSymbol: '300999',
      klt: '101',
      fqt: '1',
      days: 160,
      top: 10,
      candidateSymbols: ['300001', '300002'],
      enabled: [3],
      s1MaxMarketCapYi: 150,
      s2LastDays: 5,
      s2TurnoverSpikeMultiple: 2,
      s2PreselectTop: 20,
      s3DailyDays: 5,
      s3MonthlyMonths: 24,
      s3MinSimilarity: 0.8,
    })

    expect(res.candidates).toBe(2)
    expect(res.top.map((it) => it.symbol)).toEqual(['300001'])
  })
})
