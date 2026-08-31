import { useEffect, useMemo, useRef } from 'react'
import type { KlineCandle } from '@/types/stock'

function hiDpi(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } {
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const w = Math.max(1, Math.floor(rect.width * dpr))
  const h = Math.max(1, Math.floor(rect.height * dpr))
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unsupported')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, w: rect.width, h: rect.height }
}

function calcMA(period: number, closes: number[]): (number | null)[] {
  const result: (number | null)[] = []
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(null)
      continue
    }
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) {
      sum += closes[j]
    }
    result.push(sum / period)
  }
  return result
}

const MA_CONFIG = [
  { period: 5, color: 'rgba(255,255,255,0.85)', label: 'MA5' },
  { period: 10, color: 'rgba(250,204,21,0.85)', label: 'MA10' },
  { period: 20, color: 'rgba(168,85,247,0.85)', label: 'MA20' },
]

export default function KlineChart(props: {
  candles: KlineCandle[]
  height?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const model = useMemo(() => {
    const c = props.candles
    if (!c.length) return null
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    let maxVol = 1
    for (const x of c) {
      if (Number.isFinite(x.low)) min = Math.min(min, x.low)
      if (Number.isFinite(x.high)) max = Math.max(max, x.high)
      if (Number.isFinite(x.volume)) maxVol = Math.max(maxVol, x.volume)
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null
    return { min, max, maxVol }
  }, [props.candles])

  const mas = useMemo(() => {
    const closes = props.candles.map((c) => c.close)
    return MA_CONFIG.map((cfg) => calcMA(cfg.period, closes))
  }, [props.candles])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!model) return

    const ro = new ResizeObserver(() => {
      draw()
    })
    ro.observe(canvas)

    function draw() {
      const { ctx, w, h } = hiDpi(canvas)
      const width = w
      const height = h

      ctx.clearRect(0, 0, width, height)

      const padX = 8
      const padTop = 8
      const padBottom = 44
      const volH = Math.max(48, Math.floor(height * 0.25))
      const priceH = Math.max(80, height - volH - padTop - padBottom)

      const c = props.candles
      const n = c.length
      const xStep = (width - padX * 2) / Math.max(1, n)
      const bodyW = Math.max(1, Math.min(10, xStep * 0.6))
      const midX = (i: number) => padX + i * xStep + xStep / 2

      const yPrice = (p: number) => {
        return padTop + (1 - (p - model.min) / (model.max - model.min)) * priceH
      }

      const yVolBase = padTop + priceH + padBottom + volH
      const yVol = (v: number) => {
        return yVolBase - (v / model.maxVol) * volH
      }

      // ── 1. 水平网格线 ──
      ctx.strokeStyle = 'rgba(148,163,184,0.25)'
      ctx.lineWidth = 1
      for (let k = 0; k <= 3; k += 1) {
        const y = padTop + (priceH * k) / 3
        ctx.beginPath()
        ctx.moveTo(padX, y)
        ctx.lineTo(width - padX, y)
        ctx.stroke()
      }

      // ── 2. 计算时间轴标签位置（先算，用于纵向网格线）──
      const axisY = padTop + priceH + Math.floor(padBottom / 2) + volH
      const minPxGap = 70
      const labelCount = Math.max(2, Math.floor((width - padX * 2) / minPxGap))
      const step = Math.max(1, Math.floor(n / labelCount))
      const labelXs: number[] = []
      for (let idx = 0; idx < n; idx += step) {
        labelXs.push(midX(idx))
      }

      // ── 3. 纵向网格线（对应每个时间轴标签位置）──
      ctx.strokeStyle = 'rgba(148,163,184,0.12)'
      ctx.lineWidth = 1
      for (const x of labelXs) {
        ctx.beginPath()
        ctx.moveTo(x, padTop)
        ctx.lineTo(x, axisY)
        ctx.stroke()
      }

      // ── 4. K 线与成交量 ──
      for (let i = 0; i < n; i += 1) {
        const x = midX(i)
        const it = c[i]
        const up = it.close >= it.open
        const color = up ? 'rgba(239,68,68,0.95)' : 'rgba(34,197,94,0.95)'
        const yO = yPrice(it.open)
        const yC = yPrice(it.close)
        const yH = yPrice(it.high)
        const yL = yPrice(it.low)

        ctx.strokeStyle = color
        ctx.beginPath()
        ctx.moveTo(x, yH)
        ctx.lineTo(x, yL)
        ctx.stroke()

        ctx.fillStyle = color
        const top = Math.min(yO, yC)
        const bottom = Math.max(yO, yC)
        const bodyH = Math.max(1, bottom - top)
        ctx.fillRect(x - bodyW / 2, top, bodyW, bodyH)

        const v = Math.max(0, it.volume)
        const vy = yVol(v)
        ctx.fillStyle = up ? 'rgba(239,68,68,0.55)' : 'rgba(34,197,94,0.55)'
        ctx.fillRect(x - bodyW / 2, vy, bodyW, yVolBase - vy)
      }

      // ── 5. 均线 MA5 / MA10 / MA20 ──
      for (let mi = 0; mi < mas.length; mi++) {
        const values = mas[mi]
        const cfg = MA_CONFIG[mi]
        ctx.strokeStyle = cfg.color
        ctx.lineWidth = 1.5
        ctx.beginPath()
        let started = false
        for (let i = 0; i < n; i++) {
          const v = values[i]
          if (v === null) continue
          const x = midX(i)
          const y = yPrice(v)
          if (!started) {
            ctx.moveTo(x, y)
            started = true
          } else {
            ctx.lineTo(x, y)
          }
        }
        ctx.stroke()
      }

      // ── 6. 均线图例（右上角）──
      const legendX = width - padX - 4
      const legendY = padTop + 4
      ctx.font = 'bold 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'top'
      for (let i = 0; i < MA_CONFIG.length; i++) {
        const cfg = MA_CONFIG[i]
        const y = legendY + i * 16
        // 颜色短线
        ctx.strokeStyle = cfg.color
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(legendX - 34, y + 6)
        ctx.lineTo(legendX - 20, y + 6)
        ctx.stroke()
        // 文字
        ctx.fillStyle = cfg.color
        ctx.fillText(cfg.label, legendX, y)
      }

      // ── 7. 底部时间轴：横线 + 竖线标记 + 日期标签 ──
      const labelY = height - 10

      // 时间轴横线
      ctx.strokeStyle = 'rgba(148,163,184,0.35)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(padX, axisY)
      ctx.lineTo(width - padX, axisY)
      ctx.stroke()

      ctx.font = 'bold 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'

      for (let idx = 0; idx < n; idx += step) {
        const x = midX(idx)
        const dateStr = c[idx].ts // YYYY-MM-DD
        const label = `${dateStr.slice(5, 7)}/${dateStr.slice(8, 10)}` // MM/DD

        // 竖线标记（小竖线从轴线向下延伸）
        ctx.strokeStyle = 'rgba(148,163,184,0.6)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, axisY)
        ctx.lineTo(x, axisY + 5)
        ctx.stroke()

        // 文字描边增强对比度
        ctx.strokeStyle = 'rgba(0,0,0,0.8)'
        ctx.lineWidth = 3
        ctx.strokeText(label, x, labelY)

        // 文字填充
        ctx.fillStyle = 'rgba(255,255,255,0.95)'
        ctx.fillText(label, x, labelY)
      }
    }

    draw()
    return () => ro.disconnect()
  }, [model, mas, props.candles])

  return (
    <canvas
      ref={canvasRef}
      style={{ height: props.height ?? 280, width: '100%' }}
      className="rounded-xl border border-slate-800 bg-slate-950"
    />
  )
}
