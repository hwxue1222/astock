type Candle = {
  ts: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type KlinePatternKind = 'strong' | 'reversal' | 'range_ready'

export type KlinePatternId =
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
  | 'hammer_bottom'
  | 'morning_star'
  | 'piercing_line'
  | 'tweezer_bottom'
  | 'bullish_harami'
  | 'macd_golden_cross'
  | 'rsi_oversold_rebound'
  | 'false_breakdown_reclaim'
  | 'bollinger_squeeze'
  | 'volume_dry_up'
  | 'tight_range'
  | 'volatility_contraction'
  | 'ascending_triangle'
  | 'flag_consolidation'
  | 'inside_days_cluster'

export type KlinePatternHit = {
  id: KlinePatternId
  name: string
  kind: KlinePatternKind
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

function ema(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN)
  if (period <= 0 || !values.length) return out
  const k = 2 / (period + 1)
  let prev = values[0]
  out[0] = prev
  for (let i = 1; i < values.length; i += 1) {
    const v = values[i]
    const cur = Number.isFinite(v) ? v * k + prev * (1 - k) : prev
    out[i] = cur
    prev = cur
  }
  return out
}

function rsi(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN)
  if (values.length < period + 1) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i += 1) {
    const d = values[i] - values[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  gain /= period
  loss /= period
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  for (let i = period + 1; i < values.length; i += 1) {
    const d = values[i] - values[i - 1]
    const g = d > 0 ? d : 0
    const l = d < 0 ? -d : 0
    gain = (gain * (period - 1) + g) / period
    loss = (loss * (period - 1) + l) / period
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
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

function detectBullishEngulfing(candles: Candle[]): KlinePatternHit | null {
  if (candles.length < 2) return null
  const a = candles[candles.length - 2]
  const b = candles[candles.length - 1]
  if (!(a.close < a.open && b.close > b.open)) return null
  if (!(b.open <= a.close && b.close >= a.open)) return null
  const bodyRatio = safeDiv(candleBody(b), candleRange(b))
  const score = clamp(0.55 + bodyRatio * 0.35, 0, 0.95)
  return { id: 'bullish_engulfing', name: '阳包阴', kind: 'strong', score }
}

function detectLongLowerShadow(candles: Candle[]): KlinePatternHit | null {
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
  return { id: 'long_lower_shadow', name: '长下影线', kind: 'strong', score }
}

function detectGoldenNeedleBottom(candles: Candle[]): KlinePatternHit | null {
  const longLower = detectLongLowerShadow(candles)
  if (!longLower) return null
  const down = trendPct(candles, 20)
  if (down > -3) return null
  const score = clamp(longLower.score + 0.08, 0, 0.95)
  return { id: 'golden_needle_bottom', name: '金针扣底', kind: 'strong', score }
}

function detectRedThreeSoldiers(candles: Candle[]): KlinePatternHit | null {
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
  return { id: 'red_three_soldiers', name: '红三兵', kind: 'strong', score }
}

function detectRisingThreeMethods(candles: Candle[]): KlinePatternHit | null {
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
  return { id: 'rising_three_methods', name: '上升三法', kind: 'strong', score }
}

function detectGapUpParallelBullish(candles: Candle[]): KlinePatternHit | null {
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
  return { id: 'gap_up_parallel_bullish', name: '向上跳空并列阳线', kind: 'strong', score }
}

function detectLongYangHeavyCannon(candles: Candle[]): KlinePatternHit | null {
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
  return { id: 'long_yang_heavy_cannon', name: '长阳重炮', kind: 'strong', score }
}

function detectOneYangThroughThreeLines(candles: Candle[]): KlinePatternHit | null {
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
  return { id: 'one_yang_through_three_lines', name: '一阳穿三线', kind: 'strong', score }
}

function detectMaBullishAlignment(candles: Candle[]): KlinePatternHit | null {
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
  return { id: 'ma_bullish_alignment', name: '均线多头', kind: 'strong', score }
}

function detectBollingerBreakout(candles: Candle[]): KlinePatternHit | null {
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
  return { id: 'bollinger_breakout', name: '布林突破', kind: 'strong', score }
}

function detectMaConfluenceBreakout(candles: Candle[]): KlinePatternHit | null {
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
  return { id: 'ma_confluence_breakout', name: '均线粘合', kind: 'strong', score }
}

function detectPlatformBreakout(candles: Candle[]): KlinePatternHit | null {
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
  return { id: 'platform_breakout', name: '平台突破', kind: 'strong', score }
}

function detectSmallStepUp(candles: Candle[]): KlinePatternHit | null {
  if (candles.length < 8) return null
  const list = candles.slice(-6)
  const upDays = list.filter((c) => c.close >= c.open).length
  if (upDays < 4) return null
  const pct = safeDiv(list[list.length - 1].close - list[0].close, list[0].close) * 100
  if (!(pct > 0.5 && pct < 10)) return null
  const ranges = list.map((c) => safeDiv(candleRange(c), c.open))
  if (Math.max(...ranges) > 0.08) return null
  const score = clamp(0.6 + clamp(pct / 12, 0, 0.28), 0, 0.92)
  return { id: 'small_step_up', name: '碎步小阳', kind: 'strong', score }
}

function detectDoubleNeedlesBottom(candles: Candle[]): KlinePatternHit | null {
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
  return { id: 'double_needles_bottom', name: '双针探底', kind: 'strong', score }
}

function detectDoubleBottomW(candles: Candle[]): KlinePatternHit | null {
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
  return { id: 'double_bottom_w', name: 'W 底', kind: 'strong', score }
}

function detectFishLeapDragonGate(candles: Candle[]): KlinePatternHit | null {
  if (candles.length < 80) return null
  const last = candles[candles.length - 1]
  const win = candles.slice(-61, -1)
  if (win.length < 30) return null
  const maxHigh = Math.max(...win.map((c) => c.high))
  if (!(last.close > last.open && last.close > maxHigh && candleBody(last) >= candleRange(last) * 0.55)) return null
  const volRatio = safeDiv(last.volume || 0, avgVolume(candles.slice(0, -1), 20))
  const score = clamp(0.7 + clamp((volRatio - 1.0) / 3, 0, 0.2), 0, 0.95)
  return { id: 'fish_leap_dragon_gate', name: '鱼跃龙门', kind: 'strong', score }
}

function detectCupWithHandle(candles: Candle[]): KlinePatternHit | null {
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
  return { id: 'cup_with_handle', name: '杯柄形态', kind: 'strong', score }
}

function detectHammerBottom(candles: Candle[]): KlinePatternHit | null {
  if (candles.length < 8) return null
  const c = candles[candles.length - 1]
  const r = candleRange(c)
  if (r <= 0) return null
  const body = candleBody(c)
  const low = lowerShadow(c)
  const up = upperShadow(c)
  const downTrend = trendPct(candles, 20) <= -2
  if (!downTrend) return null
  if (!(low >= body * 2.2 && up <= r * 0.35 && safeDiv(body, r) <= 0.4)) return null
  const score = clamp(0.58 + clamp(low / Math.max(1e-9, r) - 0.45, 0, 0.25), 0, 0.92)
  return { id: 'hammer_bottom', name: '锤子线(反转)', kind: 'reversal', score }
}

function detectPiercingLine(candles: Candle[]): KlinePatternHit | null {
  if (candles.length < 2) return null
  const a = candles[candles.length - 2]
  const b = candles[candles.length - 1]
  if (!(a.close < a.open && b.close > b.open)) return null
  const mid = (a.open + a.close) / 2
  if (!(b.open <= a.close && b.close >= mid && b.close <= a.open)) return null
  if (trendPct(candles, 20) > -2) return null
  const score = clamp(0.6 + clamp(safeDiv(b.close - mid, Math.max(1e-9, a.open - a.close)) / 0.6, 0, 0.25), 0, 0.92)
  return { id: 'piercing_line', name: '曙光初现(反转)', kind: 'reversal', score }
}

function detectBullishHarami(candles: Candle[]): KlinePatternHit | null {
  if (candles.length < 2) return null
  const a = candles[candles.length - 2]
  const b = candles[candles.length - 1]
  if (!(a.close < a.open && b.close > b.open)) return null
  const aLo = Math.min(a.open, a.close)
  const aHi = Math.max(a.open, a.close)
  const bLo = Math.min(b.open, b.close)
  const bHi = Math.max(b.open, b.close)
  if (!(bLo >= aLo && bHi <= aHi)) return null
  if (trendPct(candles, 20) > -2) return null
  const score = clamp(0.55 + clamp(1 - safeDiv(candleBody(b), Math.max(1e-9, candleBody(a))), 0, 0.3), 0, 0.9)
  return { id: 'bullish_harami', name: '孕线(反转)', kind: 'reversal', score }
}

function detectTweezerBottom(candles: Candle[]): KlinePatternHit | null {
  if (candles.length < 3) return null
  const a = candles[candles.length - 2]
  const b = candles[candles.length - 1]
  const lowDiff = safeDiv(Math.abs(a.low - b.low), Math.max(1e-9, Math.min(a.low, b.low)))
  if (lowDiff > 0.006) return null
  if (!(a.close < a.open && b.close >= b.open)) return null
  if (trendPct(candles, 20) > -2) return null
  const score = clamp(0.58 + clamp(0.006 - lowDiff, 0, 0.006) / 0.006 * 0.25, 0, 0.9)
  return { id: 'tweezer_bottom', name: '镊子底(反转)', kind: 'reversal', score }
}

function detectMorningStar(candles: Candle[]): KlinePatternHit | null {
  if (candles.length < 3) return null
  const a = candles[candles.length - 3]
  const b = candles[candles.length - 2]
  const c = candles[candles.length - 1]
  if (!(a.close < a.open && c.close > c.open)) return null
  if (candleBody(a) < candleRange(a) * 0.5) return null
  if (candleBody(c) < candleRange(c) * 0.45) return null
  if (candleBody(b) > candleBody(a) * 0.55) return null
  const midA = (a.open + a.close) / 2
  if (c.close < midA) return null
  if (trendPct(candles, 20) > -2) return null
  const score = clamp(0.66 + clamp(pctChange(a.close, c.close) / 12, 0, 0.22), 0, 0.95)
  return { id: 'morning_star', name: '早晨之星(反转)', kind: 'reversal', score }
}

function detectMacdGoldenCross(candles: Candle[]): KlinePatternHit | null {
  if (candles.length < 40) return null
  const closes = candles.map((c) => c.close)
  const fast = ema(closes, 12)
  const slow = ema(closes, 26)
  const macd = closes.map((_, i) => (fast[i] || 0) - (slow[i] || 0))
  const signal = ema(macd, 9)
  const i = candles.length - 1
  if (![macd[i], signal[i], macd[i - 1], signal[i - 1]].every((x) => Number.isFinite(x))) return null
  const crossedUp = (macd[i - 1] as number) <= (signal[i - 1] as number) && (macd[i] as number) > (signal[i] as number)
  if (!crossedUp) return null
  const hist = (macd[i] as number) - (signal[i] as number)
  const score = clamp(0.62 + clamp(hist / Math.max(1e-9, Math.abs(signal[i] as number) + 1e-6), 0, 0.28), 0, 0.92)
  return { id: 'macd_golden_cross', name: 'MACD金叉(反转)', kind: 'reversal', score }
}

function detectRsiOversoldRebound(candles: Candle[]): KlinePatternHit | null {
  if (candles.length < 20) return null
  const closes = candles.map((c) => c.close)
  const r = rsi(closes, 14)
  const i = candles.length - 1
  const r0 = r[i - 2]
  const r1 = r[i - 1]
  const r2 = r[i]
  if (![r0, r1, r2].every((x) => Number.isFinite(x))) return null
  const oversold = (r0 as number) <= 30 || (r1 as number) <= 30
  const rebound = (r2 as number) >= (r1 as number) + 3
  if (!(oversold && rebound)) return null
  const score = clamp(0.6 + clamp(((r2 as number) - 30) / 25, 0, 0.25), 0, 0.9)
  return { id: 'rsi_oversold_rebound', name: 'RSI超卖反弹(反转)', kind: 'reversal', score }
}

function detectFalseBreakdownReclaim(candles: Candle[]): KlinePatternHit | null {
  if (candles.length < 35) return null
  const lookback = 20
  const prev = candles.slice(-1 * (lookback + 2), -1)
  const last = candles[candles.length - 1]
  if (prev.length < lookback + 1) return null
  const priorLow = Math.min(...prev.slice(0, lookback).map((c) => c.low))
  const breakdownDay = prev[prev.length - 1]
  const dippedBelow = breakdownDay.low < priorLow * 0.998
  const reclaimed = last.close >= priorLow && last.close > last.open
  if (!(dippedBelow && reclaimed)) return null
  const score = clamp(0.62 + clamp(safeDiv(last.close - priorLow, priorLow) / 0.06, 0, 0.25), 0, 0.92)
  return { id: 'false_breakdown_reclaim', name: '假跌破回收(反转)', kind: 'reversal', score }
}

function detectBollingerSqueeze(candles: Candle[]): KlinePatternHit | null {
  if (candles.length < 35) return null
  const closes = candles.map((c) => c.close)
  const i = candles.length - 1
  const win = closes.slice(i - 19, i + 1)
  if (win.length !== 20) return null
  const mid = win.reduce((a, b) => a + b, 0) / win.length
  const sd = std(win)
  const upper = mid + 2 * sd
  const lower = mid - 2 * sd
  const width = safeDiv(upper - lower, mid || 1)
  if (!(width > 0 && width <= 0.07)) return null
  const score = clamp(0.6 + clamp((0.07 - width) / 0.07, 0, 0.28), 0, 0.9)
  return { id: 'bollinger_squeeze', name: '布林收口(震荡待涨)', kind: 'range_ready', score }
}

function detectVolumeDryUp(candles: Candle[]): KlinePatternHit | null {
  if (candles.length < 35) return null
  const v5 = avgVolume(candles, 5)
  const v20 = avgVolume(candles.slice(0, -5), 20)
  if (!(v20 > 0 && v5 > 0 && v5 <= v20 * 0.62)) return null
  const score = clamp(0.58 + clamp((v20 * 0.62 - v5) / Math.max(1e-9, v20 * 0.62), 0, 0.28), 0, 0.9)
  return { id: 'volume_dry_up', name: '量能萎缩(震荡待涨)', kind: 'range_ready', score }
}

function detectTightRange(candles: Candle[]): KlinePatternHit | null {
  if (candles.length < 20) return null
  const win = candles.slice(-12)
  const closes = win.map((c) => c.close)
  const mean = closes.reduce((a, b) => a + b, 0) / closes.length
  const vol = safeDiv(std(closes), mean || 1)
  if (!(vol > 0 && vol <= 0.012)) return null
  const score = clamp(0.6 + clamp((0.012 - vol) / 0.012, 0, 0.25), 0, 0.9)
  return { id: 'tight_range', name: '窄幅整理(震荡待涨)', kind: 'range_ready', score }
}

function detectVolatilityContraction(candles: Candle[]): KlinePatternHit | null {
  if (candles.length < 40) return null
  const recent = candles.slice(-10)
  const prior = candles.slice(-20, -10)
  if (recent.length !== 10 || prior.length !== 10) return null
  const r0 = recent.map((c) => safeDiv(c.high - c.low, c.open || 1))
  const r1 = prior.map((c) => safeDiv(c.high - c.low, c.open || 1))
  const a0 = r0.reduce((a, b) => a + b, 0) / r0.length
  const a1 = r1.reduce((a, b) => a + b, 0) / r1.length
  if (!(a1 > 0 && a0 > 0 && a0 <= a1 * 0.7)) return null
  const score = clamp(0.58 + clamp((a1 * 0.7 - a0) / Math.max(1e-9, a1 * 0.7), 0, 0.28), 0, 0.9)
  return { id: 'volatility_contraction', name: '波动收敛(震荡待涨)', kind: 'range_ready', score }
}

function detectAscendingTriangle(candles: Candle[]): KlinePatternHit | null {
  if (candles.length < 45) return null
  const win = candles.slice(-25)
  const highs = win.map((c) => c.high)
  const lows = win.map((c) => c.low)
  const maxH = Math.max(...highs)
  const flatHigh = highs.filter((h) => safeDiv(Math.abs(h - maxH), maxH || 1) <= 0.01).length >= 5
  if (!flatHigh) return null
  const firstLow = lows.slice(0, 8).reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY)
  const lastLow = lows.slice(-8).reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY)
  const rising = lastLow > firstLow * 1.02
  if (!rising) return null
  const score = clamp(0.62 + clamp(safeDiv(lastLow - firstLow, firstLow) / 0.08, 0, 0.25), 0, 0.92)
  return { id: 'ascending_triangle', name: '上升三角(震荡待涨)', kind: 'range_ready', score }
}

function detectFlagConsolidation(candles: Candle[]): KlinePatternHit | null {
  if (candles.length < 30) return null
  const pre = candles.slice(-18, -8)
  const cons = candles.slice(-8)
  if (pre.length !== 10 || cons.length !== 8) return null
  const prePct = safeDiv(pre[pre.length - 1].close - pre[0].close, pre[0].close) * 100
  if (prePct < 9) return null
  const consCloses = cons.map((c) => c.close)
  const consMean = consCloses.reduce((a, b) => a + b, 0) / consCloses.length
  const consVol = safeDiv(std(consCloses), consMean || 1)
  if (consVol > 0.02) return null
  const vCons = avgVolume(cons, 8)
  const vPre = avgVolume(pre, 10)
  if (!(vPre > 0 && vCons <= vPre * 0.85)) return null
  const score = clamp(0.62 + clamp((prePct - 9) / 20, 0, 0.22), 0, 0.92)
  return { id: 'flag_consolidation', name: '旗形整理(震荡待涨)', kind: 'range_ready', score }
}

function detectInsideDaysCluster(candles: Candle[]): KlinePatternHit | null {
  if (candles.length < 10) return null
  const xs = candles.slice(-6)
  let inside = 0
  for (let i = 1; i < xs.length; i += 1) {
    const prev = xs[i - 1]
    const cur = xs[i]
    if (cur.high <= prev.high && cur.low >= prev.low) inside += 1
  }
  if (inside < 3) return null
  const score = clamp(0.58 + clamp((inside - 3) / 3, 0, 0.25), 0, 0.9)
  return { id: 'inside_days_cluster', name: '内包整理(震荡待涨)', kind: 'range_ready', score }
}

export function detectKlinePatterns(candles: Candle[]): KlinePatternHit[] {
  const list = (candles ?? []).filter((c) =>
    [c.open, c.close, c.high, c.low].every((x) => Number.isFinite(x)) && c.ts,
  )
  if (list.length < 5) return []
  const hits: Array<KlinePatternHit | null> = [
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
    detectHammerBottom(list),
    detectMorningStar(list),
    detectPiercingLine(list),
    detectTweezerBottom(list),
    detectBullishHarami(list),
    detectMacdGoldenCross(list),
    detectRsiOversoldRebound(list),
    detectFalseBreakdownReclaim(list),
    detectBollingerSqueeze(list),
    detectVolumeDryUp(list),
    detectTightRange(list),
    detectVolatilityContraction(list),
    detectAscendingTriangle(list),
    detectFlagConsolidation(list),
    detectInsideDaysCluster(list),
  ]

  return hits
    .filter((x): x is KlinePatternHit => Boolean(x))
    .sort((a, b) => b.score - a.score)
    .slice(0, 25)
}

export function detectStrongPatterns(candles: Candle[]): KlinePatternHit[] {
  return detectKlinePatterns(candles).filter((x) => x.kind === 'strong')
}
