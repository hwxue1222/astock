type Candle = {
  ts: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type StrongPatternId =
  | 'red_three_soldiers'
  | 'rising_three_methods'
  | 'bullish_engulfing'
  | 'long_lower_shadow'
  | 'golden_needle_bottom'
  | 'gap_up_parallel_bullish'
  | 'long_yang_heavy_cannon'
  | 'one_yang_through_three_lines'
  | 'ma_bullish_alignment'
  | 'bollinger_breakout'
  | 'ma_confluence_breakout'
  | 'platform_breakout'
  | 'small_step_up'
  | 'double_needles_bottom'
  | 'double_bottom_w'
  | 'cup_with_handle'
  | 'fish_leap_dragon_gate'

export type StrongPatternHit = {
  id: StrongPatternId
  name: string
  score: number
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function safeDiv(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0
  return a / b
}

function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN)
  if (period <= 0) return out
  let sum = 0
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

function std(values: number[]): number {
  if (!values.length) return 0
  const m = values.reduce((a, b) => a + b, 0) / values.length
  const v = values.reduce((acc, x) => acc + (x - m) ** 2, 0) / values.length
  return Math.sqrt(v)
}

function lastN<T>(arr: T[], n: number): T[] {
  return arr.slice(Math.max(0, arr.length - n))
}

function candleBody(c: Candle): number {
  return Math.abs(c.close - c.open)
}

function candleRange(c: Candle): number {
  return c.high - c.low
}

function lowerShadow(c: Candle): number {
  return Math.min(c.open, c.close) - c.low
}

function upperShadow(c: Candle): number {
  return c.high - Math.max(c.open, c.close)
}

function pctChange(prevClose: number, close: number): number {
  return safeDiv(close - prevClose, prevClose) * 100
}

function trendPct(candles: Candle[], lookback: number): number {
  const list = lastN(candles, lookback + 1)
  if (list.length < lookback + 1) return 0
  const first = list[0]
  const last = list[list.length - 1]
  return safeDiv(last.close - first.close, first.close) * 100
}

function avgVolume(candles: Candle[], lookback: number): number {
  const list = lastN(candles, lookback)
  if (!list.length) return 0
  return list.reduce((a, b) => a + (b.volume || 0), 0) / list.length
}

function detectBullishEngulfing(candles: Candle[]): StrongPatternHit | null {
  if (candles.length < 2) return null
  const a = candles[candles.length - 2]
  const b = candles[candles.length - 1]
  if (!(a.close < a.open && b.close > b.open)) return null
  if (!(b.open <= a.close && b.close >= a.open)) return null
  const bodyRatio = safeDiv(candleBody(b), candleRange(b))
  const score = clamp(0.55 + bodyRatio * 0.35, 0, 0.95)
  return { id: 'bullish_engulfing', name: '阳包阴', score }
}

function detectLongLowerShadow(candles: Candle[]): StrongPatternHit | null {
  if (!candles.length) return null
  const c = candles[candles.length - 1]
  const r = candleRange(c)
  if (r <= 0) return null
  const body = candleBody(c)
  const low = lowerShadow(c)
  const up = upperShadow(c)
  const lowRatio = low / r
  const bodyRatio = safeDiv(body, r)
  if (!(lowRatio >= 0.45 && low >= body * 1.8 && up <= r * 0.35)) return null
  const score = clamp(0.55 + lowRatio * 0.35 + (1 - bodyRatio) * 0.1, 0, 0.95)
  return { id: 'long_lower_shadow', name: '长下影线', score }
}

function detectGoldenNeedleBottom(candles: Candle[]): StrongPatternHit | null {
  const longLower = detectLongLowerShadow(candles)
  if (!longLower) return null
  const down = trendPct(candles, 20)
  if (down > -3) return null
  const score = clamp(longLower.score + 0.08, 0, 0.95)
  return { id: 'golden_needle_bottom', name: '金针扣底', score }
}

function detectRedThreeSoldiers(candles: Candle[]): StrongPatternHit | null {
  if (candles.length < 4) return null
  const a = candles[candles.length - 3]
  const b = candles[candles.length - 2]
  const c = candles[candles.length - 1]
  const p = candles[candles.length - 4]
  if (!(a.close > a.open && b.close > b.open && c.close > c.open)) return null
  if (!(a.close > p.close && b.close > a.close && c.close > b.close)) return null
  const ua = safeDiv(upperShadow(a), candleRange(a))
  const ub = safeDiv(upperShadow(b), candleRange(b))
  const uc = safeDiv(upperShadow(c), candleRange(c))
  if (Math.max(ua, ub, uc) > 0.35) return null
  const bodies = [a, b, c].map(candleBody)
  if (!(bodies[1] >= bodies[0] * 0.75 && bodies[2] >= bodies[1] * 0.75)) return null
  const avgUp = (pctChange(p.close, a.close) + pctChange(a.close, b.close) + pctChange(b.close, c.close)) / 3
  const score = clamp(0.65 + clamp(avgUp / 10, 0, 0.25), 0, 0.95)
  return { id: 'red_three_soldiers', name: '红三兵', score }
}

function detectRisingThreeMethods(candles: Candle[]): StrongPatternHit | null {
  if (candles.length < 6) return null
  const x0 = candles[candles.length - 5]
  const x1 = candles[candles.length - 4]
  const x2 = candles[candles.length - 3]
  const x3 = candles[candles.length - 2]
  const x4 = candles[candles.length - 1]
  if (!(x0.close > x0.open && x4.close > x4.open)) return null
  if (candleBody(x0) < candleRange(x0) * 0.5) return null
  const inside = [x1, x2, x3].every((c) => c.high <= x0.high && c.low >= x0.low)
  if (!inside) return null
  const small = [x1, x2, x3].every((c) => candleBody(c) <= candleBody(x0) * 0.55)
  if (!small) return null
  if (!(x4.close > x0.close && x4.high > x0.high)) return null
  const score = clamp(0.7 + clamp(pctChange(x0.close, x4.close) / 10, 0, 0.2), 0, 0.95)
  return { id: 'rising_three_methods', name: '上升三法', score }
}

function detectGapUpParallelBullish(candles: Candle[]): StrongPatternHit | null {
  if (candles.length < 3) return null
  const a = candles[candles.length - 2]
  const b = candles[candles.length - 1]
  if (!(a.close > a.open && b.close > b.open)) return null
  const gap = b.low > a.high || b.open > a.high
  if (!gap) return null
  const bodySimilarity =
    1 -
    clamp(
      Math.abs(candleBody(a) - candleBody(b)) / Math.max(candleBody(a), candleBody(b), 1e-9),
      0,
      1,
    )
  const score = clamp(0.65 + bodySimilarity * 0.25, 0, 0.95)
  return { id: 'gap_up_parallel_bullish', name: '向上跳空并列阳线', score }
}

function detectLongYangHeavyCannon(candles: Candle[]): StrongPatternHit | null {
  if (candles.length < 21) return null
  const last = candles[candles.length - 1]
  const prev = candles[candles.length - 2]
  if (!(last.close > last.open && prev.close < prev.open)) return null
  const body = candleBody(last)
  const r = candleRange(last)
  if (!(r > 0 && body >= r * 0.6)) return null
  const volRatio = safeDiv(last.volume || 0, avgVolume(candles.slice(0, -1), 20))
  if (volRatio < 1.4) return null
  if (upperShadow(last) > r * 0.25) return null
  const score = clamp(0.7 + clamp((volRatio - 1.4) / 2, 0, 0.2), 0, 0.95)
  return { id: 'long_yang_heavy_cannon', name: '长阳重炮', score }
}

function detectOneYangThroughThreeLines(candles: Candle[]): StrongPatternHit | null {
  if (candles.length < 25) return null
  const closes = candles.map((c) => c.close)
  const ma5 = sma(closes, 5)
  const ma10 = sma(closes, 10)
  const ma20 = sma(closes, 20)
  const i = candles.length - 1
  const last = candles[i]
  const prev = candles[i - 1]
  if (!(last.close > last.open)) return null
  const prevBelow =
    prev.close < (ma5[i - 1] || Infinity) &&
    prev.close < (ma10[i - 1] || Infinity) &&
    prev.close < (ma20[i - 1] || Infinity)
  const lastAbove = last.close > (ma5[i] || -Infinity) && last.close > (ma10[i] || -Infinity) && last.close > (ma20[i] || -Infinity)
  if (!(prevBelow && lastAbove)) return null
  const score = clamp(0.65 + clamp(pctChange(prev.close, last.close) / 10, 0, 0.25), 0, 0.95)
  return { id: 'one_yang_through_three_lines', name: '一阳穿三线', score }
}

function detectMaBullishAlignment(candles: Candle[]): StrongPatternHit | null {
  if (candles.length < 70) return null
  const closes = candles.map((c) => c.close)
  const ma5 = sma(closes, 5)
  const ma10 = sma(closes, 10)
  const ma20 = sma(closes, 20)
  const ma60 = sma(closes, 60)
  const i = candles.length - 1
  const ok = (ma5[i] || 0) > (ma10[i] || 0) && (ma10[i] || 0) > (ma20[i] || 0) && (ma20[i] || 0) > (ma60[i] || 0)
  if (!ok) return null
  if (candles[i].close < (ma5[i] || -Infinity)) return null
  const spread = safeDiv((ma5[i] || 0) - (ma60[i] || 0), ma60[i] || 1)
  const score = clamp(0.62 + clamp(spread / 0.12, 0, 0.25), 0, 0.95)
  return { id: 'ma_bullish_alignment', name: '均线多头', score }
}

function detectBollingerBreakout(candles: Candle[]): StrongPatternHit | null {
  if (candles.length < 25) return null
  const closes = candles.map((c) => c.close)
  const ma20 = sma(closes, 20)
  const i = candles.length - 1
  const window = closes.slice(i - 19, i + 1)
  if (window.length !== 20) return null
  const sd = std(window)
  const mid = ma20[i]
  if (!Number.isFinite(mid)) return null
  const upper = mid + 2 * sd
  const last = candles[i]
  if (last.close <= upper) return null
  const dist = safeDiv(last.close - upper, upper)
  const score = clamp(0.62 + clamp(dist / 0.06, 0, 0.28), 0, 0.95)
  return { id: 'bollinger_breakout', name: '布林突破', score }
}

function detectMaConfluenceBreakout(candles: Candle[]): StrongPatternHit | null {
  if (candles.length < 30) return null
  const closes = candles.map((c) => c.close)
  const ma5 = sma(closes, 5)
  const ma10 = sma(closes, 10)
  const ma20 = sma(closes, 20)
  const i = candles.length - 1
  const last = candles[i]
  const m5 = ma5[i]
  const m10 = ma10[i]
  const m20 = ma20[i]
  if (![m5, m10, m20].every((x) => Number.isFinite(x))) return null
  const maxM = Math.max(m5, m10, m20)
  const minM = Math.min(m5, m10, m20)
  const tight = safeDiv(maxM - minM, minM || 1) <= 0.015
  if (!tight) return null
  if (!(last.close > maxM && last.close > last.open)) return null
  const score = clamp(0.65 + clamp(safeDiv(last.close - maxM, maxM) / 0.05, 0, 0.25), 0, 0.95)
  return { id: 'ma_confluence_breakout', name: '均线粘合', score }
}

function detectPlatformBreakout(candles: Candle[]): StrongPatternHit | null {
  if (candles.length < 35) return null
  const lookback = 20
  const last = candles[candles.length - 1]
  const prev = candles.slice(candles.length - 1 - lookback, candles.length - 1)
  if (prev.length !== lookback) return null
  const highs = prev.map((c) => c.high)
  const closes = prev.map((c) => c.close)
  const maxHigh = Math.max(...highs)
  const mean = closes.reduce((a, b) => a + b, 0) / closes.length
  const flat = safeDiv(std(closes), mean || 1) <= 0.02
  if (!flat) return null
  if (!(last.close > maxHigh && last.close > last.open)) return null
  const score = clamp(0.66 + clamp(safeDiv(last.close - maxHigh, maxHigh) / 0.06, 0, 0.25), 0, 0.95)
  return { id: 'platform_breakout', name: '平台突破', score }
}

function detectSmallStepUp(candles: Candle[]): StrongPatternHit | null {
  if (candles.length < 8) return null
  const list = candles.slice(-6)
  const upDays = list.filter((c) => c.close >= c.open).length
  if (upDays < 4) return null
  const pct = safeDiv(list[list.length - 1].close - list[0].close, list[0].close) * 100
  if (!(pct > 0.5 && pct < 10)) return null
  const ranges = list.map((c) => safeDiv(candleRange(c), c.open))
  if (Math.max(...ranges) > 0.08) return null
  const score = clamp(0.6 + clamp(pct / 12, 0, 0.28), 0, 0.92)
  return { id: 'small_step_up', name: '碎步小阳', score }
}

function detectDoubleNeedlesBottom(candles: Candle[]): StrongPatternHit | null {
  if (candles.length < 25) return null
  const window = candles.slice(-22)
  const lows = window.map((c) => c.low)
  const minLow = Math.min(...lows)
  const idxs = window
    .map((c, i) => ({ i, c }))
    .filter(({ c }) => safeDiv(c.low - minLow, minLow || 1) <= 0.03)
    .map(({ i }) => i)
  if (idxs.length < 2) return null
  const a = idxs[0]
  const b = idxs[idxs.length - 1]
  if (b - a < 3) return null
  const ca = window[a]
  const cb = window[b]
  const needleA = lowerShadow(ca) >= candleBody(ca) * 1.5
  const needleB = lowerShadow(cb) >= candleBody(cb) * 1.5
  if (!(needleA || needleB)) return null
  const score = clamp(0.62 + (needleA && needleB ? 0.18 : 0.1), 0, 0.92)
  return { id: 'double_needles_bottom', name: '双针探底', score }
}

function detectDoubleBottomW(candles: Candle[]): StrongPatternHit | null {
  if (candles.length < 45) return null
  const window = candles.slice(-40)
  const closes = window.map((c) => c.close)
  const minClose = Math.min(...closes)
  const troughs = closes
    .map((x, i) => ({ i, x }))
    .filter(({ x }) => safeDiv(x - minClose, minClose || 1) <= 0.03)
    .map(({ i }) => i)
  if (troughs.length < 2) return null
  const a = troughs[0]
  const b = troughs[troughs.length - 1]
  if (b - a < 6) return null
  const midHigh = Math.max(...closes.slice(a, b + 1))
  const last = window[window.length - 1]
  if (last.close <= midHigh) return null
  const score = clamp(0.65 + clamp(safeDiv(last.close - midHigh, midHigh) / 0.08, 0, 0.25), 0, 0.95)
  return { id: 'double_bottom_w', name: 'W 底', score }
}

function detectFishLeapDragonGate(candles: Candle[]): StrongPatternHit | null {
  if (candles.length < 80) return null
  const last = candles[candles.length - 1]
  const win = candles.slice(-61, -1)
  if (win.length < 30) return null
  const maxHigh = Math.max(...win.map((c) => c.high))
  if (!(last.close > last.open && last.close > maxHigh && candleBody(last) >= candleRange(last) * 0.55)) return null
  const volRatio = safeDiv(last.volume || 0, avgVolume(candles.slice(0, -1), 20))
  const score = clamp(0.7 + clamp((volRatio - 1.0) / 3, 0, 0.2), 0, 0.95)
  return { id: 'fish_leap_dragon_gate', name: '鱼跃龙门', score }
}

function detectCupWithHandle(candles: Candle[]): StrongPatternHit | null {
  if (candles.length < 120) return null
  const tail = candles.slice(-100)
  const closes = tail.map((c) => c.close)
  const leftHigh = Math.max(...closes.slice(0, 30))
  const midLow = Math.min(...closes.slice(20, 70))
  const rightHigh = Math.max(...closes.slice(60))
  if (!(safeDiv(leftHigh - midLow, leftHigh) >= 0.12)) return null
  if (!(safeDiv(leftHigh - rightHigh, leftHigh) <= 0.07)) return null
  const handle = closes.slice(-12)
  const handleDrop = safeDiv(Math.max(...handle) - Math.min(...handle), Math.max(...handle) || 1)
  if (handleDrop > 0.15) return null
  const last = tail[tail.length - 1]
  const handleHigh = Math.max(...handle.slice(0, -1))
  if (last.close <= handleHigh) return null
  const score = clamp(0.62 + clamp(safeDiv(last.close - handleHigh, handleHigh) / 0.06, 0, 0.25), 0, 0.92)
  return { id: 'cup_with_handle', name: '杯柄形态', score }
}

export function detectStrongPatterns(candles: Candle[]): StrongPatternHit[] {
  const list = (candles ?? []).filter((c) =>
    [c.open, c.close, c.high, c.low].every((x) => Number.isFinite(x)) && c.ts,
  )
  if (list.length < 5) return []
  const hits: Array<StrongPatternHit | null> = [
    detectRisingThreeMethods(list),
    detectRedThreeSoldiers(list),
    detectBullishEngulfing(list),
    detectLongLowerShadow(list),
    detectGoldenNeedleBottom(list),
    detectGapUpParallelBullish(list),
    detectLongYangHeavyCannon(list),
    detectOneYangThroughThreeLines(list),
    detectMaBullishAlignment(list),
    detectBollingerBreakout(list),
    detectMaConfluenceBreakout(list),
    detectPlatformBreakout(list),
    detectSmallStepUp(list),
    detectDoubleNeedlesBottom(list),
    detectDoubleBottomW(list),
    detectCupWithHandle(list),
    detectFishLeapDragonGate(list),
  ]

  return hits
    .filter((x): x is StrongPatternHit => Boolean(x))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
}

