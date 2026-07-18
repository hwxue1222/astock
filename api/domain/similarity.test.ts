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

  it('throws when Eastmoney gainers/losers list is unavailable', async () => {
    getEastmoneyClistMock.mockRejectedValue(new Error('Empty reply from server'))

    await expect(
      findSimilarStocks({
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
      }),
    ).rejects.toThrow('Empty reply from server')
    expect(getSinaSpotDatasetMock).not.toHaveBeenCalled()
  })
})
