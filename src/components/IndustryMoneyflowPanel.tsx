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
  const [mode, setMode] = useState<'all' | 'pos' | 'neg'>('all')
  const [page, setPage] = useState(1)
  const pageSize = 10

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

  const filtered = useMemo(() => {
    const xs =
      mode === 'pos'
        ? items.filter((x) => x.netInflowRate >= 0)
        : mode === 'neg'
          ? items.filter((x) => x.netInflowRate < 0)
          : items
    return xs
  }, [items, mode])

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filtered.length / pageSize))
  }, [filtered.length])

  const rows = useMemo(() => {
    const p = Math.max(1, Math.min(totalPages, page))
    const start = (p - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, totalPages])

  useEffect(() => {
    setPage(1)
  }, [mode])

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">行业资金流向</div>
          <div className="text-xs text-slate-500">来源：新浪资金流向</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode('all')}
            className={cn(
              'rounded-lg border px-2 py-1 text-xs font-semibold',
              mode === 'all'
                ? 'border-slate-700 bg-slate-800 text-slate-100'
                : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800',
            )}
          >
            全部
          </button>
          <button
            type="button"
            onClick={() => setMode('pos')}
            className={cn(
              'rounded-lg border px-2 py-1 text-xs font-semibold',
              mode === 'pos'
                ? 'border-slate-700 bg-slate-800 text-slate-100'
                : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800',
            )}
          >
            仅正
          </button>
          <button
            type="button"
            onClick={() => setMode('neg')}
            className={cn(
              'rounded-lg border px-2 py-1 text-xs font-semibold',
              mode === 'neg'
                ? 'border-slate-700 bg-slate-800 text-slate-100'
                : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800',
            )}
          >
            仅负
          </button>

          <div className="ml-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className={cn(
                'rounded-lg border px-2 py-1 text-xs font-semibold',
                page <= 1
                  ? 'cursor-not-allowed border-slate-900 bg-slate-950 text-slate-600'
                  : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800',
              )}
            >
              上一页
            </button>
            <div className="text-xs text-slate-500">
              {Math.min(totalPages, Math.max(1, page))}/{totalPages}
            </div>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className={cn(
                'rounded-lg border px-2 py-1 text-xs font-semibold',
                page >= totalPages
                  ? 'cursor-not-allowed border-slate-900 bg-slate-950 text-slate-600'
                  : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800',
              )}
            >
              下一页
            </button>
          </div>
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

        {!loading && !error && !rows.length ? <div className="text-sm text-slate-400">暂无数据</div> : null}
      </div>
    </div>
  )
}
