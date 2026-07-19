import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { getKline, getQuote, getRatios } from '@/lib/stockApi'
import { cn } from '@/lib/utils'
import type { StockItem, StockKlineResponse, StockRatiosResponse } from '@/types/stock'

function normalizeAshareCode(input: string): string {
  const raw = String(input ?? '').trim().toUpperCase()
  const m = raw.match(/(\d{6})/)
  return m ? m[1] : ''
}

function formatYi(yuan?: number): string {
  if (yuan === undefined) return '—'
  if (!Number.isFinite(yuan)) return '—'
  return `${(yuan / 1e8).toFixed(1)}亿`
}

function formatTurnover(turnover?: number): string {
  if (turnover === undefined) return '—'
  if (!Number.isFinite(turnover)) return '—'
  return `${turnover.toFixed(2)}%`
}

function formatPct(pct?: number): string {
  if (pct === undefined) return '—'
  if (!Number.isFinite(pct)) return '—'
  const s = pct >= 0 ? '+' : ''
  return `${s}${pct.toFixed(2)}%`
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

export default function SymbolsTablePanel(props: {
  title: string
  symbols: string[]
  universe: StockItem[]
  emptyText: string
  addPlaceholder: string
  onAdd: (symbol: string) => void
  onRemove: (symbol: string) => void
  onOpen: (symbol: string) => void
}): JSX.Element {
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)

  const [klineBySymbol, setKlineBySymbol] = useState<Record<string, StockKlineResponse>>({})
  const [ratiosBySymbol, setRatiosBySymbol] = useState<Record<string, StockRatiosResponse>>({})
  const [quoteBySymbol, setQuoteBySymbol] = useState<
    Record<string, { name?: string; industry?: string; marketCapYuan?: number; floatMarketCapYuan?: number; pe?: number }>
  >({})

  const bySymbol = useMemo(() => new Map(props.universe.map((s) => [s.symbol.toUpperCase(), s])), [props.universe])
  const items = useMemo(() => props.symbols.map((s) => ({ symbol: s.toUpperCase(), meta: bySymbol.get(s.toUpperCase()) })), [
    props.symbols,
    bySymbol,
  ])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter(({ symbol, meta }) => {
      const name = (meta?.name ?? quoteBySymbol[symbol]?.name ?? '').toLowerCase()
      const industry = (quoteBySymbol[symbol]?.industry ?? '').toLowerCase()
      return symbol.toLowerCase().includes(needle) || name.includes(needle) || industry.includes(needle)
    })
  }, [items, q, quoteBySymbol])

  const pageSize = 10
  const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / pageSize)), [filtered.length])
  const visible = useMemo(() => {
    const p = Math.max(1, Math.min(totalPages, page))
    const start = (p - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, totalPages])

  useEffect(() => {
    setPage(1)
  }, [q, props.symbols.length])

  useEffect(() => {
    const ac = new AbortController()
    const uniq = Array.from(new Set(visible.map((x) => x.symbol).filter((x) => /^\d{6}$/.test(x))))

    void (async () => {
      for (const sym of uniq) {
        if (ac.signal.aborted) return
        try {
          const [q, r, k] = await Promise.all([
            getQuote(sym, ac.signal).catch(() => null),
            getRatios(sym, 'latest', ac.signal).catch(() => null),
            getKline(sym, { klt: '101', fqt: '1', limit: 22 }, ac.signal).catch(() => null),
          ])
          if (ac.signal.aborted) return
          if (q)
            setQuoteBySymbol((m) => ({
              ...m,
              [sym]: {
                name: q.name,
                industry: q.industry,
                marketCapYuan: q.marketCapYuan,
                floatMarketCapYuan: q.floatMarketCapYuan,
                pe: q.pe,
              },
            }))
          if (r) setRatiosBySymbol((m) => ({ ...m, [sym]: r }))
          if (k) setKlineBySymbol((m) => ({ ...m, [sym]: k }))
        } catch {
          continue
        }
      }
    })()

    return () => ac.abort()
  }, [visible])

  const count = props.symbols.length

  function rowStats(symbol: string): { pct?: number; turnover?: number; amount?: number } {
    const candles = klineBySymbol[symbol]?.candles ?? []
    if (candles.length < 2) return {}
    const last = candles[candles.length - 1]
    const prev = candles[candles.length - 2]
    const pct = prev.close ? ((last.close - prev.close) / prev.close) * 100 : undefined
    return { pct, turnover: (last as { turnover?: number }).turnover, amount: (last as { amount?: number }).amount }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">{props.title}</div>
          <div className="text-xs text-slate-500">共 {count} 只</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索代码/名称/行业"
            className="w-40 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-500"
          />

          <div className="flex items-center gap-2">
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

          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={props.addPlaceholder}
            className="w-40 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-500"
          />
          <button
            type="button"
            onClick={() => {
              const sym = normalizeAshareCode(draft)
              if (!sym) return
              props.onAdd(sym)
              setDraft('')
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            添加
          </button>
        </div>
      </div>

      <div className="p-2">
        {filtered.length ? (
          <div className="overflow-hidden rounded-xl border border-slate-800">
            <div className="grid grid-cols-13 bg-slate-900/70 px-3 py-2 text-[11px] text-slate-400">
              <div className="col-span-2">代码</div>
              <div className="col-span-3">名称</div>
              <div className="col-span-2">行业</div>
              <div className="col-span-1 text-right">涨跌</div>
              <div className="col-span-1 text-right">换手</div>
              <div className="col-span-2 text-right">成交额</div>
              <div className="col-span-1 text-right">市值</div>
              <div className="col-span-1 text-right">走势</div>
              <div className="col-span-1 text-right">操作</div>
            </div>
            <div className="divide-y divide-slate-800">
              {visible.map(({ symbol, meta }) => {
                const stats = rowStats(symbol)
                const pct = stats.pct
                const pctCls = pct === undefined ? 'text-slate-400' : pct >= 0 ? 'text-red-200' : 'text-emerald-200'
                const industry = quoteBySymbol[symbol]?.industry
                const name = meta?.name ?? quoteBySymbol[symbol]?.name
                const mktCap = quoteBySymbol[symbol]?.marketCapYuan ?? ratiosBySymbol[symbol]?.fields?.marketCap
                const closes = (klineBySymbol[symbol]?.candles ?? []).map((c) => c.close).filter((x) => Number.isFinite(x))
                return (
                  <div key={symbol} className="grid grid-cols-13 items-center gap-2 px-3 py-2 text-xs">
                    <button
                      type="button"
                      onClick={() => props.onOpen(symbol)}
                      className="col-span-2 truncate text-left font-semibold text-slate-100 hover:underline"
                    >
                      {symbol}
                    </button>
                    <div className="col-span-3 min-w-0 truncate text-slate-300">{name ?? '—'}</div>
                    <div className="col-span-2 min-w-0 truncate text-slate-300">{industry ?? '—'}</div>
                    <div className={cn('col-span-1 text-right', pctCls)}>{formatPct(pct)}</div>
                    <div className="col-span-1 text-right text-slate-300">{formatTurnover(stats.turnover)}</div>
                    <div className="col-span-2 text-right text-slate-300">{formatYi(stats.amount)}</div>
                    <div className="col-span-1 text-right text-slate-300">{formatYi(mktCap)}</div>

                    <div className="col-span-1 flex justify-end">
                      <svg width="110" height="28" viewBox="0 0 110 28" className="block">
                        <polyline
                          fill="none"
                          stroke="rgb(148 163 184)"
                          strokeWidth="1.5"
                          points={sparklinePoints(closes)}
                        />
                      </svg>
                    </div>

                    <div className="col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => props.onRemove(symbol)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                        aria-label="移除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-800 p-4 text-sm text-slate-400">{props.emptyText}</div>
        )}
      </div>
    </div>
  )
}
