import { useEffect, useMemo, useState } from 'react'
import KlineChart from '@/components/KlineChart'
import { formatIsoToLocal, formatYiFromYuan } from '@/lib/format'
import { detectKlineStrongPatterns } from '@/lib/klinePatterns'
import { getKline } from '@/lib/stockApi'
import { cn } from '@/lib/utils'
import type { KlineFqt, KlineKlt, StockKlineResponse } from '@/types/stock'

function formatTurnover(turnover: number | undefined): string {
  if (turnover === undefined) return '—'
  if (!Number.isFinite(turnover)) return '—'
  return `${turnover.toFixed(2)}%`
}

function periodLabel(klt: KlineKlt): string {
  if (klt === '102') return '周线'
  if (klt === '103') return '月线'
  return '日线'
}

function fqtLabel(fqt: KlineFqt): string {
  if (fqt === '0') return '不复权'
  if (fqt === '2') return '后复权'
  return '前复权'
}

const BASE_LIMIT_OPTIONS = [60, 90, 120, 180, 260, 360, 520, 900] as const

function clampLimitToOptions(limit: number): number {
  if (!Number.isFinite(limit)) return 180
  const list = [...BASE_LIMIT_OPTIONS]
  if (list.includes(limit as (typeof BASE_LIMIT_OPTIONS)[number])) return limit
  let best = list[0]
  let bestDist = Math.abs(limit - best)
  for (const x of list) {
    const d = Math.abs(limit - x)
    if (d < bestDist) {
      best = x
      bestDist = d
    }
  }
  return best
}

export default function KlinePanel(props: {
  symbol: string
  klt: KlineKlt
  fqt: KlineFqt
  limit: number
  onChange: (next: { klt: KlineKlt; fqt: KlineFqt; limit: number }) => void
}) {
  const [data, setData] = useState<StockKlineResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const limitOptions = useMemo(() => {
    const normalized = clampLimitToOptions(props.limit)
    const set = new Set<number>([normalized, ...BASE_LIMIT_OPTIONS])
    return Array.from(set).sort((a, b) => a - b)
  }, [props.limit])

  const selectedLimit = useMemo(() => clampLimitToOptions(props.limit), [props.limit])
  const limitIndex = useMemo(() => limitOptions.findIndex((x) => x === selectedLimit), [limitOptions, selectedLimit])
  const canZoomIn = limitIndex > 0
  const canZoomOut = limitIndex >= 0 && limitIndex < limitOptions.length - 1

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    getKline(props.symbol, { klt: props.klt, fqt: props.fqt, limit: props.limit }, ac.signal)
      .then((d) => {
        if (ac.signal.aborted) return
        setData(d)
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setError(e instanceof Error ? e.message : String(e))
        setData(null)
      })
      .finally(() => {
        if (ac.signal.aborted) return
        setLoading(false)
      })
    return () => ac.abort()
  }, [props.symbol, props.klt, props.fqt, props.limit])

  const latest = useMemo(() => {
    const c = data?.candles ?? []
    if (c.length < 2) return null
    const last = c[c.length - 1]
    const prev = c[c.length - 2]
    const pct = prev.close ? ((last.close - prev.close) / prev.close) * 100 : 0
    return {
      last,
      pct,
    }
  }, [data?.candles])

  const strongPatterns = useMemo(() => {
    return data?.candles?.length ? detectKlineStrongPatterns(data.candles) : []
  }, [data?.candles])

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">K 线 & 成交量</div>
          <div className="text-xs text-slate-400">
            {periodLabel(props.klt)} · {fqtLabel(props.fqt)}
            {data?.meta?.source ? ` · ${data.meta.source}` : ''}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={props.klt}
            onChange={(e) => props.onChange({ klt: e.target.value as KlineKlt, fqt: props.fqt, limit: selectedLimit })}
            className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          >
            <option value="101">日线</option>
            <option value="102">周线</option>
            <option value="103">月线</option>
          </select>
          <select
            value={props.fqt}
            onChange={(e) => props.onChange({ klt: props.klt, fqt: e.target.value as KlineFqt, limit: selectedLimit })}
            className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          >
            <option value="1">前复权</option>
            <option value="0">不复权</option>
          </select>

          <button
            type="button"
            disabled={!canZoomIn}
            onClick={() => {
              if (!canZoomIn) return
              const next = limitOptions[Math.max(0, limitIndex - 1)]
              props.onChange({ klt: props.klt, fqt: props.fqt, limit: next })
            }}
            className={cn(
              'rounded-lg border px-2 py-1 text-xs font-semibold',
              canZoomIn
                ? 'border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800'
                : 'cursor-not-allowed border-slate-900 bg-slate-950 text-slate-600',
            )}
          >
            -
          </button>
          <select
            value={String(selectedLimit)}
            onChange={(e) => props.onChange({ klt: props.klt, fqt: props.fqt, limit: Number(e.target.value) })}
            className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          >
            {limitOptions.map((x) => (
              <option key={x} value={String(x)}>
                {x}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={!canZoomOut}
            onClick={() => {
              if (!canZoomOut) return
              const next = limitOptions[Math.min(limitOptions.length - 1, limitIndex + 1)]
              props.onChange({ klt: props.klt, fqt: props.fqt, limit: next })
            }}
            className={cn(
              'rounded-lg border px-2 py-1 text-xs font-semibold',
              canZoomOut
                ? 'border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800'
                : 'cursor-not-allowed border-slate-900 bg-slate-950 text-slate-600',
            )}
          >
            +
          </button>
        </div>
      </div>

      <div className="mt-3">
        {loading ? (
          <div className="text-sm text-slate-400">加载中…</div>
        ) : error ? (
          <div className="text-sm text-red-200">{error}</div>
        ) : data?.candles?.length ? (
          <>
            <KlineChart candles={data.candles} />
            {strongPatterns.length ? (
              <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-200">强势形态（自动识别）</div>
                  <div className="text-[11px] text-slate-500">仅供参考</div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {strongPatterns.map((p) => (
                    <span
                      key={p.id}
                      title={`${p.reason} · 置信度 ${(p.score * 100).toFixed(0)}%`}
                      className={cn(
                        'inline-flex items-center rounded-lg border px-2 py-1 text-[11px] font-semibold',
                        p.score >= 0.8
                          ? 'border-amber-700 bg-amber-950/40 text-amber-200'
                          : p.score >= 0.7
                            ? 'border-sky-700 bg-sky-950/40 text-sky-200'
                            : 'border-slate-800 bg-slate-900 text-slate-200',
                      )}
                    >
                      {p.name}
                      <span className="ml-1 text-[10px] opacity-70">{(p.score * 100).toFixed(0)}%</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {latest ? (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <div>
                  最新：<span className="text-slate-200">{latest.last.close.toFixed(2)}</span>
                </div>
                <div>
                  涨跌：
                  <span className={latest.pct >= 0 ? 'text-red-200' : 'text-emerald-200'}>
                    {latest.pct >= 0 ? '+' : ''}
                    {latest.pct.toFixed(2)}%
                  </span>
                </div>
                <div>
                  换手率：<span className="text-slate-200">{formatTurnover(latest.last.turnover)}</span>
                </div>
                <div>
                  成交额：<span className="text-slate-200">{formatYiFromYuan(latest.last.amount)}</span>
                </div>
                <div>
                  日期：<span className="text-slate-200">{formatIsoToLocal(`${latest.last.ts}T00:00:00Z`)}</span>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="text-sm text-slate-400">暂无数据</div>
        )}
      </div>
    </div>
  )
}
