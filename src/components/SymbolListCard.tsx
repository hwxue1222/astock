import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { getKline, getQuote, getRatios } from '@/lib/stockApi'
import { formatCompactNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { StockItem } from '@/types/stock'
import type { StockKlineResponse, StockRatiosResponse } from '@/types/stock'

function normalizeAshareCode(input: string): string {
  const raw = String(input ?? '').trim().toUpperCase()
  const m = raw.match(/(\d{6})/)
  return m ? m[1] : ''
}

export default function SymbolListCard(props: {
  title: string
  symbols: string[]
  universe: StockItem[]
  emptyText: string
  addPlaceholder: string
  onAdd: (symbol: string) => void
  onRemove: (symbol: string) => void
  onOpen: (symbol: string) => void
  showBasics?: boolean
}): JSX.Element {
  const [draft, setDraft] = useState('')
  const [klineBySymbol, setKlineBySymbol] = useState<Record<string, StockKlineResponse>>({})
  const [ratiosBySymbol, setRatiosBySymbol] = useState<Record<string, StockRatiosResponse>>({})
  const [quoteBySymbol, setQuoteBySymbol] = useState<
    Record<string, { name?: string; marketCapYuan?: number; floatMarketCapYuan?: number; pe?: number }>
  >({})

  const bySymbol = useMemo(() => {
    return new Map(props.universe.map((s) => [s.symbol.toUpperCase(), s]))
  }, [props.universe])

  const items = useMemo(() => {
    return props.symbols.map((s) => ({ symbol: s.toUpperCase(), meta: bySymbol.get(s.toUpperCase()) }))
  }, [props.symbols, bySymbol])

  const count = props.symbols.length

  useEffect(() => {
    if (!props.showBasics) return
    const ac = new AbortController()
    const uniq = Array.from(new Set(props.symbols.map((s) => String(s).toUpperCase()).filter((x) => /^\d{6}$/.test(x))))

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
              [sym]: { name: q.name, marketCapYuan: q.marketCapYuan, floatMarketCapYuan: q.floatMarketCapYuan, pe: q.pe },
            }))
          if (r) setRatiosBySymbol((m) => ({ ...m, [sym]: r }))
          if (k) setKlineBySymbol((m) => ({ ...m, [sym]: k }))
        } catch {
          continue
        }
      }
    })()

    return () => ac.abort()
  }, [props.showBasics, props.symbols])

  function formatYi(yuan?: number): string {
    if (yuan === undefined) return '—'
    if (!Number.isFinite(yuan)) return '—'
    return `${(yuan / 1e8).toFixed(1)}亿`
  }

  function formatPe(pe?: number): string {
    if (pe === undefined) return '—'
    if (!Number.isFinite(pe)) return '—'
    return pe.toFixed(1)
  }

  function sparklinePoints(closes: number[], w = 96, h = 28): string {
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

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">{props.title}</div>
          <div className="text-xs text-slate-500">共 {count} 只</div>
        </div>

        <div className="flex items-center gap-2">
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
        {items.length ? (
          <div className="space-y-2">
            {items.map(({ symbol, meta }) => (
              <div
                key={symbol}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 hover:bg-slate-900',
                )}
              >
                <button
                  type="button"
                  onClick={() => props.onOpen(symbol)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-sm font-semibold text-slate-100">{symbol}</div>
                  <div className="truncate text-xs text-slate-400">{meta?.name ?? quoteBySymbol[symbol]?.name ?? '—'}</div>

                  {props.showBasics ? (
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      <div>市值：{formatYi(quoteBySymbol[symbol]?.marketCapYuan ?? ratiosBySymbol[symbol]?.fields?.marketCap)}</div>
                      <div>流通：{formatYi(quoteBySymbol[symbol]?.floatMarketCapYuan)}</div>
                      <div>PE：{formatPe(quoteBySymbol[symbol]?.pe)}</div>
                      <div>货币：{formatCompactNumber(ratiosBySymbol[symbol]?.fields?.cash)}</div>
                      <div>总资：{formatCompactNumber(ratiosBySymbol[symbol]?.fields?.totalAssets)}</div>
                      <div>净资：{formatCompactNumber(ratiosBySymbol[symbol]?.fields?.netAssets)}</div>
                    </div>
                  ) : null}
                </button>

                {props.showBasics ? (
                  <div className="shrink-0">
                    <svg width="96" height="28" viewBox="0 0 96 28" className="block">
                      <polyline
                        fill="none"
                        stroke="rgb(148 163 184)"
                        strokeWidth="1.5"
                        points={sparklinePoints(
                          (klineBySymbol[symbol]?.candles ?? []).map((c) => c.close).filter((x) => Number.isFinite(x)),
                        )}
                      />
                    </svg>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => props.onRemove(symbol)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                  aria-label="移除"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-800 p-4 text-sm text-slate-400">
            {props.emptyText}
          </div>
        )}
      </div>
    </div>
  )
}
