import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { StockItem } from '@/types/stock'

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
}): JSX.Element {
  const [draft, setDraft] = useState('')

  const bySymbol = useMemo(() => {
    return new Map(props.universe.map((s) => [s.symbol.toUpperCase(), s]))
  }, [props.universe])

  const items = useMemo(() => {
    return props.symbols.map((s) => ({ symbol: s.toUpperCase(), meta: bySymbol.get(s.toUpperCase()) }))
  }, [props.symbols, bySymbol])

  const count = props.symbols.length

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
                  <div className="truncate text-xs text-slate-400">{meta?.name ?? '—'}</div>
                </button>
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

