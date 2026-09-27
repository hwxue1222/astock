import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getBoardConstituents, getKline } from '@/lib/stockApi'
import { cn } from '@/lib/utils'
import { useStockStore } from '@/stores/stockStore'
import type { BoardConstituent, StockKlineResponse } from '@/types/stock'

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

function formatYi(yuan?: number): string {
  if (yuan === undefined) return '—'
  if (!Number.isFinite(yuan)) return '—'
  return `${(yuan / 1e8).toFixed(1)}亿`
}

function sparklinePoints(closes: number[], w = 110, h = 28): string {
  if (closes.length < 2) return ''
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const dx = w / (closes.length - 1)
  const denom = Math.max(1e-9, max - min)
  return closes
    .map((v, i) => {
      const x = i * dx
      const y = h - ((v - min) / denom) * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
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
  const [page, setPage] = useState(1)

  const [klineBySymbol, setKlineBySymbol] = useState<Record<string, StockKlineResponse>>({})

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

  function limitUpThreshold(symbol: string): number {
    const code = normalizeCode(symbol)
    if (code.startsWith('300') || code.startsWith('301') || code.startsWith('688') || code.startsWith('689')) return 19.5
    return 9.5
  }

  const sorted = useMemo(() => {
    const xs = [...filtered]
    xs.sort((a, b) => {
      const ap = typeof a.changePct === 'number' && Number.isFinite(a.changePct) ? a.changePct : -Infinity
      const bp = typeof b.changePct === 'number' && Number.isFinite(b.changePct) ? b.changePct : -Infinity
      const aLu = ap >= limitUpThreshold(a.symbol)
      const bLu = bp >= limitUpThreshold(b.symbol)
      if (aLu !== bLu) return aLu ? -1 : 1
      if (ap !== bp) return bp - ap
      const amc = typeof a.marketCapYuan === 'number' && Number.isFinite(a.marketCapYuan) ? a.marketCapYuan : 0
      const bmc = typeof b.marketCapYuan === 'number' && Number.isFinite(b.marketCapYuan) ? b.marketCapYuan : 0
      if (amc !== bmc) return bmc - amc
      return String(a.symbol).localeCompare(String(b.symbol))
    })
    return xs
  }, [filtered])

  const pageSize = 10
  const totalPages = useMemo(() => Math.max(1, Math.ceil(sorted.length / pageSize)), [sorted.length])
  const visible = useMemo(() => {
    const p = Math.max(1, Math.min(totalPages, page))
    const start = (p - 1) * pageSize
    return sorted.slice(start, start + pageSize)
  }, [sorted, page, totalPages])

  useEffect(() => {
    setPage(1)
  }, [q, boardCode])

  useEffect(() => {
    const ac = new AbortController()
    const uniq = Array.from(new Set(visible.map((x) => normalizeCode(x.symbol)).filter((x) => /^\d{6}$/.test(x))))

    void (async () => {
      for (const sym of uniq) {
        if (ac.signal.aborted) return
        try {
          const k = await getKline(sym, { klt: '101', fqt: '1', limit: 22 }, ac.signal).catch(() => null)
          if (ac.signal.aborted) return
          if (k) setKlineBySymbol((m) => ({ ...m, [sym]: k }))
        } catch {
          continue
        }
      }
    })()

    return () => ac.abort()
  }, [visible])

  function rowPct(symbol: string): number | undefined {
    const candles = klineBySymbol[symbol]?.candles ?? []
    if (candles.length < 2) return undefined
    const last = candles[candles.length - 1]
    const prev = candles[candles.length - 2]
    if (!prev.close) return undefined
    return ((last.close - prev.close) / prev.close) * 100
  }

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
          <div className="text-xs text-slate-500">成分股 {sorted.length}/{items.length}</div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className={cn(
                'rounded-lg border px-2 py-2 text-xs font-semibold',
                page <= 1
                  ? 'cursor-not-allowed border-slate-900 bg-slate-950 text-slate-600'
                  : 'border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800',
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
                'rounded-lg border px-2 py-2 text-xs font-semibold',
                page >= totalPages
                  ? 'cursor-not-allowed border-slate-900 bg-slate-950 text-slate-600'
                  : 'border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800',
              )}
            >
              下一页
            </button>
          </div>
        </div>

        <div className="mt-3">
          {loading ? <div className="text-sm text-slate-400">加载中…</div> : null}
          {error ? <div className="text-sm text-red-200">{error}</div> : null}

          {!loading && !error ? (
            <div className="overflow-hidden rounded-xl border border-slate-800">
              <div className="grid grid-cols-12 bg-slate-900/70 px-3 py-2 text-[11px] text-slate-400">
                <div className="col-span-2">代码</div>
                <div className="col-span-4">名称</div>
                <div className="col-span-2 text-right">市值</div>
                <div className="col-span-2 text-right">走势</div>
                <div className="col-span-1 text-right">涨跌幅</div>
                <div className="col-span-1 text-right">操作</div>
              </div>
              <div className="divide-y divide-slate-800">
                {visible.map((it) => {
                  const code = normalizeCode(it.symbol)
                  const inWatchlist = watchlistSet.has(code.toUpperCase())
                  const pct = typeof it.changePct === 'number' && Number.isFinite(it.changePct) ? it.changePct : rowPct(code)
                  const pctCls = pct === undefined ? 'text-slate-400' : pct >= 0 ? 'text-red-200' : 'text-emerald-200'
                  const k = klineBySymbol[code]
                  const closes = (k?.candles ?? []).map((c) => c.close).filter((x) => Number.isFinite(x))
                  const mc = it.marketCapYuan
                  const isLimitUp = pct !== undefined ? pct >= limitUpThreshold(code) : false

                  return (
                    <div key={it.symbol} className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-xs">
                      <button
                        type="button"
                        onClick={() => navigate(`/stocks/${encodeURIComponent(code)}`)}
                        className="col-span-2 truncate text-left font-semibold text-slate-100 hover:opacity-90"
                      >
                        {code}
                      </button>
                      <div className="col-span-4 min-w-0 truncate text-slate-300">
                        <span className="truncate">{it.name ?? '—'}</span>
                        {isLimitUp ? (
                          <span className="ml-2 inline-flex items-center rounded-md border border-red-800 bg-red-950 px-1.5 py-0.5 text-[10px] font-semibold text-red-200">
                            涨停
                          </span>
                        ) : null}
                      </div>
                      <div className="col-span-2 whitespace-nowrap text-right text-slate-300 tabular-nums">{formatYi(mc)}</div>
                      <div className="col-span-2 flex justify-end">
                        <svg width="110" height="28" viewBox="0 0 110 28" className="block">
                          <polyline
                            fill="none"
                            stroke="rgb(148 163 184)"
                            strokeWidth="1.5"
                            points={sparklinePoints(closes)}
                          />
                        </svg>
                      </div>
                      <div className={cn('col-span-1 whitespace-nowrap text-right tabular-nums', pctCls)}>{formatPct(pct)}</div>
                      <div className="col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => toggleWatchlist(code)}
                          className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-800"
                        >
                          {inWatchlist ? '已在自选' : '加入自选'}
                        </button>
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
