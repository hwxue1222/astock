import { describe, expect, it } from 'vitest'

import { detectKlinePatterns, hasPatternInLastNDays } from './klineStrongPatterns.js'

type Candle = {
  ts: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

function isoDay(start: Date, offsetDays: number): string {
  const d = new Date(start)
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

describe('detectKlinePatterns', () => {
  it('detects roucuo_line on tight consolidation with drying volume after uptrend', () => {
    const start = new Date('2026-01-01T00:00:00Z')
    const candles: Candle[] = []

    for (let i = 0; i < 54; i += 1) {
      const close = 10 + 0.2 * i
      const open = close * 0.995
      const high = close * 1.01
      const low = open * 0.99
      candles.push({
        ts: isoDay(start, i),
        open,
        high,
        low,
        close,
        volume: 1_000_000,
      })
    }

    const base = candles[candles.length - 1].close
    const vols = [650_000, 610_000, 560_000, 510_000, 460_000, 410_000]
    for (let j = 0; j < 6; j += 1) {
      const i = 54 + j
      const close = base * (1 + (j % 2 === 0 ? 0.0006 : -0.0004))
      const open = base * (1 + (j % 2 === 0 ? -0.0003 : 0.0005))
      const high = base * 1.012
      const low = base * 0.988
      candles.push({
        ts: isoDay(start, i),
        open,
        high,
        low,
        close,
        volume: vols[j],
      })
    }

    const hits = detectKlinePatterns(candles)
    const hit = hits.find((h) => h.id === 'roucuo_line')
    expect(hit).toBeTruthy()
    expect(hit?.kind).toBe('range_ready')
    expect(typeof hit?.score).toBe('number')
  })
})

describe('hasPatternInLastNDays', () => {
  it('finds roucuo_line within last N days even if latest does not match', () => {
    const start = new Date('2026-01-01T00:00:00Z')
    const candles: Candle[] = []

    for (let i = 0; i < 54; i += 1) {
      const close = 10 + 0.2 * i
      const open = close * 0.995
      const high = close * 1.01
      const low = open * 0.99
      candles.push({
        ts: isoDay(start, i),
        open,
        high,
        low,
        close,
        volume: 1_000_000,
      })
    }

    const base = candles[candles.length - 1].close
    const vols = [650_000, 610_000, 560_000, 510_000, 460_000, 410_000]
    for (let j = 0; j < 6; j += 1) {
      const i = 54 + j
      const close = base * (1 + (j % 2 === 0 ? 0.0006 : -0.0004))
      const open = base * (1 + (j % 2 === 0 ? -0.0003 : 0.0005))
      const high = base * 1.012
      const low = base * 0.988
      candles.push({
        ts: isoDay(start, i),
        open,
        high,
        low,
        close,
        volume: vols[j],
      })
    }

    const lastClose = candles[candles.length - 1].close
    for (let k = 0; k < 5; k += 1) {
      const i = 60 + k
      const close = lastClose * (1.03 + k * 0.002)
      const open = lastClose * (1.01 + k * 0.002)
      const high = close * 1.02
      const low = open * 0.98
      candles.push({
        ts: isoDay(start, i),
        open,
        high,
        low,
        close,
        volume: 1_800_000,
      })
    }

    const nowHits = detectKlinePatterns(candles)
    expect(nowHits.some((h) => h.id === 'roucuo_line')).toBe(false)
    expect(hasPatternInLastNDays(candles, 'roucuo_line', 15)).toBe(true)
  })
})
