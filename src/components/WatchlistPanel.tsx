import { Plus, Star, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RiskLevel, StockItem } from '@/types/stock'
import { riskLevelClass, riskLevelLabel } from '@/lib/format'

export default function WatchlistPanel(props: {
  universe: StockItem[]
  watchlist: string[]
  selectedSymbol: string | null
  riskBySymbol: Record<string, RiskLevel | undefined>
  lastEventTimeBySymbol: Record<string, string | undefined>
  onSelect: (symbol: string) => void
  onToggleWatchlist: (symbol: string) => void
  onOpenDashboard?: (() => void) | null
}) {
  const bySymbol = new Map(props.universe.map((s) => [s.symbol, s]))
  const items = props.watchlist
    .map((symbol) => ({ symbol, meta: bySymbol.get(symbol) }))
    .filter((x) => !!x.meta)

  return (
    <div className="flex h-[calc(100vh-64px-16px)] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="text-sm font-semibold text-slate-100">自选</div>
        <div className="flex items-center gap-2">
          {props.onOpenDashboard ? (
            <button
              type="button"
              onClick={props.onOpenDashboard}
              className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
            >
              看板
            </button>
          ) : null}
          {props.selectedSymbol ? (
            <button
              type="button"
              onClick={() => props.onToggleWatchlist(props.selectedSymbol as string)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              添加
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {items.length ? (
          <div className="space-y-2">
            {items.map(({ symbol, meta }) => {
              const risk = props.riskBySymbol[symbol]
              const time = props.lastEventTimeBySymbol[symbol]
              return (
                <button
                  key={symbol}
                  type="button"
                  onClick={() => props.onSelect(symbol)}
                  className={cn(
                    'w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-left hover:bg-slate-900',
                    props.selectedSymbol === symbol ? 'bg-slate-900/70' : '',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-100">
                        {symbol}
                      </div>
                      <div className="truncate text-xs text-slate-400">
                        {meta?.name ?? '—'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 text-slate-600" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          props.onToggleWatchlist(symbol)
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                        aria-label="移除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-lg px-2 py-0.5 text-xs',
                        risk ? riskLevelClass(risk) : 'bg-slate-800/60 text-slate-300',
                      )}
                    >
                      {risk ? riskLevelLabel(risk) : '未评估'}
                    </span>
                    <span className="text-xs text-slate-500">
                      {time ? `最近事件：${time}` : '最近事件：—'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-800 p-4 text-sm text-slate-400">
            添加自选以便快速切换
          </div>
        )}
      </div>
    </div>
  )
}
