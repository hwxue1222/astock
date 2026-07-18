import { useEffect, useMemo, useState } from 'react'
import { getIndustryMoneyflow } from '@/lib/stockApi'
import { cn } from '@/lib/utils'
import type { IndustryMoneyflowItem } from '@/types/stock'

function formatWan(n: number | undefined): string {
  if (n === undefined) return '—'
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(0)}万`
}

function formatPct(n: number | undefined): string {
  if (n === undefined) return '—'
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(2)}%`
}

export default function IndustryMoneyflowPanel(): JSX.Element {
  const [items, setItems] = useState<IndustryMoneyflowItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    getIndustryMoneyflow(ac.signal, { fenlei: 0 })
      .then((d) => setItems(d.items ?? []))
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

  const rows = useMemo(() => items.slice(0, 20), [items])

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">行业资金流向</div>
          <div className="text-xs text-slate-500">来源：新浪资金流向</div>
        </div>
      </div>

      <div className="mt-3">
        {loading ? <div className="text-sm text-slate-400">加载中…</div> : null}
        {error ? <div className="text-sm text-red-200">{error}</div> : null}

        {!loading && !error ? (
          <div className="overflow-hidden rounded-xl border border-slate-800">
            <div className="grid grid-cols-12 bg-slate-900/70 px-3 py-2 text-[11px] text-slate-400">
              <div className="col-span-3">板块</div>
              <div className="col-span-2 text-right">涨跌幅</div>
              <div className="col-span-2 text-right">流入</div>
              <div className="col-span-2 text-right">流出</div>
              <div className="col-span-2 text-right">净流入</div>
              <div className="col-span-1 text-right">净流入率</div>
            </div>
            <div className="divide-y divide-slate-800">
              {rows.map((r) => {
                const positive = r.netInflowWan >= 0
                return (
                  <div key={r.name} className="grid grid-cols-12 items-center px-3 py-2 text-xs">
                    <div className="col-span-3 min-w-0">
                      <div className="truncate font-semibold text-slate-100">{r.name}</div>
                      {r.leadingName ? (
                        <div className="truncate text-[11px] text-slate-500">领涨：{r.leadingName}</div>
                      ) : null}
                    </div>
                    <div className={cn('col-span-2 text-right', r.changePct >= 0 ? 'text-red-200' : 'text-emerald-200')}>
                      {formatPct(r.changePct)}
                    </div>
                    <div className="col-span-2 text-right text-slate-300">{formatWan(r.inflowWan)}</div>
                    <div className="col-span-2 text-right text-slate-300">{formatWan(r.outflowWan)}</div>
                    <div className={cn('col-span-2 text-right', positive ? 'text-red-200' : 'text-emerald-200')}>
                      {formatWan(r.netInflowWan)}
                    </div>
                    <div className={cn('col-span-1 text-right', positive ? 'text-red-200' : 'text-emerald-200')}>
                      {formatPct(r.netInflowRate)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
