import { useEffect, useMemo, useState } from 'react'
import { getMarketBreadth } from '@/lib/stockApi'
import { cn } from '@/lib/utils'
import type { MarketBreadthResponse } from '@/types/stock'

export default function MarketBreadthPanel(): JSX.Element {
  const [data, setData] = useState<MarketBreadthResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    getMarketBreadth(ac.signal)
      .then((d) => setData(d))
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        const err = e as { name?: unknown; message?: unknown }
        const name = typeof err?.name === 'string' ? err.name : ''
        const msg = typeof err?.message === 'string' ? err.message : String(e)
        if (name === 'AbortError' || msg.toLowerCase().includes('aborted')) return
        setError(msg)
      })
      .finally(() => {
        if (ac.signal.aborted) return
        setLoading(false)
      })
    return () => ac.abort()
  }, [])

  const pctUp = useMemo(() => {
    if (!data?.total) return 0
    return (data.up / data.total) * 100
  }, [data])

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">市场涨跌统计</div>
          <div className="text-xs text-slate-500">{data?.asOfDate ? `数据日：${data.asOfDate}` : '数据日：—'}</div>
        </div>
        {data?.meta?.source ? <div className="text-xs text-slate-500">{data.meta.source}</div> : null}
      </div>

      <div className="mt-3">
        {loading ? <div className="text-sm text-slate-400">加载中…</div> : null}
        {error ? <div className="text-sm text-red-200">{error}</div> : null}

        {!loading && !error && data ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                <div className="text-xs text-slate-500">上涨</div>
                <div className="mt-1 text-lg font-semibold text-red-200">{data.up}</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                <div className="text-xs text-slate-500">下跌</div>
                <div className="mt-1 text-lg font-semibold text-emerald-200">{data.down}</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                <div className="text-xs text-slate-500">平盘</div>
                <div className="mt-1 text-lg font-semibold text-slate-200">{data.flat}</div>
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <div>上涨占比</div>
                <div className="text-slate-300">{pctUp.toFixed(1)}%</div>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-900">
                <div
                  className={cn('h-full bg-red-200')}
                  style={{ width: `${Math.max(0, Math.min(100, pctUp))}%` }}
                />
              </div>
              <div className="mt-2 text-[11px] text-slate-500">合计：{data.total}，未知：{data.unknown}</div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

