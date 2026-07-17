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
      const padBottom = 10
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

      ctx.strokeStyle = 'rgba(148,163,184,0.25)'
      ctx.lineWidth = 1
      for (let k = 0; k <= 3; k += 1) {
        const y = padTop + (priceH * k) / 3
        ctx.beginPath()
        ctx.moveTo(padX, y)
        ctx.lineTo(width - padX, y)
        ctx.stroke()
      }

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
    }

    draw()
    return () => ro.disconnect()
  }, [model, props.candles])

  return (
    <canvas
      ref={canvasRef}
      style={{ height: props.height ?? 280, width: '100%' }}
      className="rounded-xl border border-slate-800 bg-slate-950"
    />
  )
}

