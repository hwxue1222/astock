import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getEastmoneyClistMock, getSinaSpotDatasetMock } = vi.hoisted(() => ({
  getEastmoneyClistMock: vi.fn(),
  getSinaSpotDatasetMock: vi.fn(),
}))

vi.mock('../providers/eastmoneyClist.js', () => ({
  getEastmoneyClist: getEastmoneyClistMock,
}))

vi.mock('../providers/ashareSinaSpot.js', () => ({
  getSinaSpotDataset: getSinaSpotDatasetMock,
}))

vi.mock('../providers/eastmoneyKline.js', () => ({
  getEastmoneyKline: vi.fn(),
}))

vi.mock('../providers/tencentKline.js', () => ({
  getTencentKline: vi.fn(),
}))

import { findSimilarStocks } from './similarity.js'

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
      s3ChangePct: 9.98,
      s3VolumeMultiple: 2,
    })

    expect(getSinaSpotDatasetMock).toHaveBeenCalledWith({
      preferNetwork: false,
      ttlSeconds: 7 * 24 * 3600,
    })
    expect(res.candidates).toBe(2)
    expect(res.top.map((it) => it.symbol)).toEqual(['300002', '300001'])
    expect(res.top.map((it) => it.name)).toEqual(['Beta', 'Alpha'])
  })
})
