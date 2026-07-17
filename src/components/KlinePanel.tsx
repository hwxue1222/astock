import { useEffect, useMemo, useState } from 'react'
import KlineChart from '@/components/KlineChart'
import { formatIsoToLocal } from '@/lib/format'
import { getKline } from '@/lib/stockApi'
import type { KlineFqt, KlineKlt, StockKlineResponse } from '@/types/stock'

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
            onChange={(e) => props.onChange({ klt: e.target.value as KlineKlt, fqt: props.fqt, limit: props.limit })}
            className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          >
            <option value="101">日线</option>
            <option value="102">周线</option>
            <option value="103">月线</option>
          </select>
          <select
            value={props.fqt}
            onChange={(e) => props.onChange({ klt: props.klt, fqt: e.target.value as KlineFqt, limit: props.limit })}
            className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          >
            <option value="1">前复权</option>
            <option value="0">不复权</option>
          </select>
          <select
            value={String(props.limit)}
            onChange={(e) => props.onChange({ klt: props.klt, fqt: props.fqt, limit: Number(e.target.value) })}
            className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          >
            <option value="120">120</option>
            <option value="180">180</option>
            <option value="260">260</option>
          </select>
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

