import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getBoardConstituents } from '@/lib/stockApi'
import { cn } from '@/lib/utils'
import { useStockStore } from '@/stores/stockStore'
import type { BoardConstituent } from '@/types/stock'

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

function formatPct(v?: number): string {
  if (v === undefined) return '—'
  if (!Number.isFinite(v)) return '—'
  const s = v >= 0 ? '+' : ''
  return `${s}${v.toFixed(2)}%`
}

function normalizeCode(s: string): string {
  const m = String(s ?? '').match(/(\d{6})/)
  return m ? m[1] : String(s ?? '')
}

export default function ConceptFlowDetail(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const { boardCode: rawBoardCode } = useParams()
  const [sp] = useSearchParams()

  const boardCode = String(rawBoardCode ?? '').trim()
  const boardType = (sp.get('boardType') === 'theme' ? 'theme' : 'concept') as 'concept' | 'theme'
  const days = clampInt(sp.get('days'), 3, 60, 14)

  const stateName = (location.state as { boardName?: string } | null)?.boardName

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<BoardConstituent[]>([])
  const [q, setQ] = useState('')

  const watchlist = useStockStore((s) => s.watchlist)
  const toggleWatchlist = useStockStore((s) => s.toggleWatchlist)
  const watchlistSet = useMemo(() => new Set(watchlist.map((x) => x.toUpperCase())), [watchlist])

  useEffect(() => {
    if (!/^BK\d{4}$/.test(boardCode)) {
      setError('无效板块代码')
      setItems([])
      return
    }

    const ac = new AbortController()
    setLoading(true)
    setError(null)
    getBoardConstituents(boardCode, { top: 200 }, ac.signal)
      .then((d) => {
        if (ac.signal.aborted) return
        setItems(d.items ?? [])
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setError(e instanceof Error ? e.message : String(e))
        setItems([])
      })
      .finally(() => {
        if (ac.signal.aborted) return
        setLoading(false)
      })
    return () => ac.abort()
  }, [boardCode])

  const filtered = useMemo(() => {
    const kw = q.trim().toUpperCase()
    if (!kw) return items
    return items.filter((x) => {
      const sym = String(x.symbol ?? '').toUpperCase()
      const name = String(x.name ?? '').toUpperCase()
      return sym.includes(kw) || name.includes(kw)
    })
  }, [items, q])

  const title = stateName || (boardType === 'theme' ? '主题板块' : '概念板块')

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-100">{title}</div>
            <div className="mt-1 text-xs text-slate-500">
              {boardCode} · 来自 {boardType === 'theme' ? '主题' : '概念'}资金流向榜（近{days}日）
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const qs = sp.toString()
                const backUrl = `/concept-flow${qs ? `?${qs}` : ''}`
                navigate(backUrl)
              }}
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
            >
              返回榜单
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索股票代码/名称"
            className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
          />
          <div className="text-xs text-slate-500">成分股 {filtered.length}/{items.length}</div>
        </div>

        <div className="mt-3">
          {loading ? <div className="text-sm text-slate-400">加载中…</div> : null}
          {error ? <div className="text-sm text-red-200">{error}</div> : null}

          {!loading && !error ? (
            <div className="overflow-hidden rounded-xl border border-slate-800">
              <div className="grid grid-cols-12 bg-slate-900/70 px-3 py-2 text-[11px] text-slate-400">
                <div className="col-span-3">代码</div>
                <div className="col-span-5">名称</div>
                <div className="col-span-2 text-right">涨跌幅</div>
                <div className="col-span-2 text-right">操作</div>
              </div>
              <div className="divide-y divide-slate-800">
                {filtered.map((it) => {
                  const code = normalizeCode(it.symbol)
                  const inWatchlist = watchlistSet.has(code.toUpperCase())
                  return (
                    <div key={it.symbol} className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-xs">
                      <button
                        type="button"
                        onClick={() => navigate(`/stocks/${encodeURIComponent(code)}`)}
                        className="col-span-3 text-left font-semibold text-slate-100 hover:opacity-90"
                      >
                        {code}
                      </button>
                      <div className="col-span-5 min-w-0 truncate text-slate-300">{it.name ?? '—'}</div>
                      <div className={cn('col-span-2 text-right tabular-nums', (it.changePct ?? 0) >= 0 ? 'text-red-200' : 'text-emerald-200')}>
                        {formatPct(it.changePct)}
                      </div>
                      <div className="col-span-2 flex justify-end">
                        {inWatchlist ? (
                          <button
                            type="button"
                            onClick={() => toggleWatchlist(code)}
                            className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-800"
                          >
                            已在自选
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleWatchlist(code)}
                            className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-800"
                          >
                            加入自选
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
