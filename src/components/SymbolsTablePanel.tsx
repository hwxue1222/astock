import { Plus, Trash2, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { getKline, getQuote, getRatios, getSurvey } from '@/lib/stockApi'
import { cn } from '@/lib/utils'
import { useStockStore } from '@/stores/stockStore'
import type { StockItem, StockKlineResponse, StockRatiosResponse } from '@/types/stock'

const PHASE_ORDER: Record<string, number> = {
  '吸筹中': 0,
  '出现生命线': 1,
  '洗盘中': 2,
  '准备拉升': 3,
  '出货中': 4,
  '': 99,
}

const PHASE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '— 空白 —' },
  { value: '吸筹中', label: '吸筹中' },
  { value: '出现生命线', label: '出现生命线' },
  { value: '洗盘中', label: '洗盘中' },
  { value: '准备拉升', label: '准备拉升' },
  { value: '出货中', label: '出货中' },
]

const PHASE_CLASS: Record<string, string> = {
  '吸筹中': 'border-slate-700 bg-slate-900 text-slate-300',
  '出现生命线': 'border-sky-700 bg-sky-950 text-sky-200',
  '洗盘中': 'border-amber-700 bg-amber-950 text-amber-200',
  '准备拉升': 'border-emerald-700 bg-emerald-950 text-emerald-200',
  '出货中': 'border-red-800 bg-red-950 text-red-200',
  '': 'border-slate-800 bg-slate-950 text-slate-500',
}

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

function isStateOwned(controllerType?: string, controller?: string): boolean {
  if (!controllerType && !controller) return false
  const text = `${controllerType || ''} ${controller || ''}`
  const keywords = ['国有', '国资', '政府', '中央', '国资委', '地方国资', '国务院', '财政部']
  return keywords.some((k) => text.includes(k))
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
  onMoveUp?: (symbol: string) => void
  onMoveDown?: (symbol: string) => void
}): JSX.Element {
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [sortByPhase, setSortByPhase] = useState(false)

  const [klineBySymbol, setKlineBySymbol] = useState<Record<string, StockKlineResponse>>({})
  const [ratiosBySymbol, setRatiosBySymbol] = useState<Record<string, StockRatiosResponse>>({})
  const [quoteBySymbol, setQuoteBySymbol] = useState<
    Record<string, { name?: string; industry?: string; marketCapYuan?: number; floatMarketCapYuan?: number; pe?: number }>
  >({})
  const [stateOwnedBySymbol, setStateOwnedBySymbol] = useState<Record<string, boolean>>({})

  const phaseOverrides = useStockStore((s) => s.phaseOverrides)
  const setPhaseOverride = useStockStore((s) => s.setPhaseOverride)
  const clearPhaseOverride = useStockStore((s) => s.clearPhaseOverride)

  const bySymbol = useMemo(() => new Map(props.universe.map((s) => [s.symbol.toUpperCase(), s])), [props.universe])
  const items = useMemo(() => props.symbols.map((s) => ({ symbol: s.toUpperCase(), meta: bySymbol.get(s.toUpperCase()) })), [
    props.symbols,
    bySymbol,
  ])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let list = items
    if (needle) {
      list = items.filter(({ symbol, meta }) => {
        const name = (meta?.name ?? quoteBySymbol[symbol]?.name ?? '').toLowerCase()
        const industry = (quoteBySymbol[symbol]?.industry ?? '').toLowerCase()
        return symbol.toLowerCase().includes(needle) || name.includes(needle) || industry.includes(needle)
      })
    }
    if (sortByPhase) {
      list = [...list].sort((a, b) => {
        const pa = phaseOverrides[a.symbol] ?? ''
        const pb = phaseOverrides[b.symbol] ?? ''
        return (PHASE_ORDER[pa] ?? 99) - (PHASE_ORDER[pb] ?? 99)
      })
    }
    return list
  }, [items, q, quoteBySymbol, sortByPhase, phaseOverrides])

  const pageSize = 10
  const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / pageSize)), [filtered.length])
  const visible = useMemo(() => {
    const p = Math.max(1, Math.min(totalPages, page))
    const start = (p - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, totalPages])

  useEffect(() => {
    setPage(1)
  }, [q, props.symbols.length, sortByPhase])

  useEffect(() => {
    const ac = new AbortController()
    const uniq = Array.from(new Set(visible.map((x) => x.symbol).filter((x) => /^\d{6}$/.test(x))))

    void (async () => {
      for (const sym of uniq) {
        if (ac.signal.aborted) return
        try {
          const [q, r, k, s] = await Promise.all([
            getQuote(sym, ac.signal).catch(() => null),
            getRatios(sym, 'latest', ac.signal).catch(() => null),
            getKline(sym, { klt: '101', fqt: '1', limit: 22 }, ac.signal).catch(() => null),
            getSurvey(sym, ac.signal).catch(() => null),
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
          if (s) setStateOwnedBySymbol((m) => ({ ...m, [sym]: isStateOwned(s.controllerType, s.controller) }))
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

          <button
            type="button"
            onClick={() => setSortByPhase((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-semibold',
              sortByPhase
                ? 'border-sky-700 bg-sky-950 text-sky-200'
                : 'border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800',
            )}
            title="按五阶段顺序排序"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            阶段排序
          </button>

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
            <div className="grid grid-cols-12 bg-slate-900/70 px-3 py-1.5 text-[11px] text-slate-400">
              <div className="col-span-1 whitespace-nowrap">阶段</div>
              <div className="col-span-2 whitespace-nowrap">代码</div>
              <div className="col-span-2 whitespace-nowrap">名称</div>
              <div className="col-span-1 whitespace-nowrap text-right">换手</div>
              <div className="col-span-1 whitespace-nowrap text-right">市值</div>
              <div className="col-span-2 whitespace-nowrap text-right">走势</div>
              <div className="col-span-1 whitespace-nowrap text-right">涨跌</div>
              <div className="col-span-1 whitespace-nowrap text-right">成交额</div>
              <div className="col-span-1 whitespace-nowrap text-right">操作</div>
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
                const phase = phaseOverrides[symbol] ?? ''
                const isState = stateOwnedBySymbol[symbol] ?? false
                return (
                  <div key={symbol} className="grid grid-cols-12 items-center gap-2 px-3 py-1.5 text-xs">
                    <div className="col-span-1">
                      <select
                        value={phaseOverrides[symbol] ?? ''}
                        onChange={(e) => {
                          const v = e.target.value
                          if (v) setPhaseOverride(symbol, v)
                          else clearPhaseOverride(symbol)
                        }}
                        className={cn(
                          'w-full cursor-pointer rounded-md border bg-transparent px-1 py-0.5 text-[10px] font-semibold outline-none',
                          PHASE_CLASS[phase] || PHASE_CLASS[''],
                        )}
                      >
                        {PHASE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => props.onOpen(symbol)}
                      className="col-span-2 truncate text-left font-semibold text-slate-100 hover:underline"
                    >
                      {symbol}
                    </button>
                    <div className="col-span-2 min-w-0 truncate text-slate-300">
                      <span className="truncate">{name ?? '—'}</span>
                      {isState ? (
                        <span className="ml-1 inline-flex items-center rounded-md border border-amber-800 bg-amber-950 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
                          国资
                        </span>
                      ) : null}
                      {industry ? (
                        <span className="ml-1 inline-flex max-w-28 items-center truncate rounded-md border border-slate-800 bg-slate-900 px-2 py-0.5 align-middle text-[10px] font-semibold text-slate-200">
                          {industry}
                        </span>
                      ) : null}
                    </div>
                    <div className="col-span-1 whitespace-nowrap text-right text-slate-300">{formatTurnover(stats.turnover)}</div>
                    <div className="col-span-1 whitespace-nowrap text-right text-slate-300">{formatYi(mktCap)}</div>

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

                    <div className={cn('col-span-1 whitespace-nowrap text-right', pctCls)}>{formatPct(pct)}</div>
                    <div className="col-span-1 whitespace-nowrap text-right text-slate-300">{formatYi(stats.amount)}</div>

                    <div className="col-span-1 flex justify-end gap-0.5">
                      {props.onMoveUp ? (
                        <button
                          type="button"
                          onClick={() => props.onMoveUp!(symbol)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                          title="上移"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      {props.onMoveDown ? (
                        <button
                          type="button"
                          onClick={() => props.onMoveDown!(symbol)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                          title="下移"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
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
