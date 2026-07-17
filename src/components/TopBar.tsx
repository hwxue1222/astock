import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, ArrowLeft, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StockItem } from '@/types/stock'

export default function TopBar(props: {
  title: string
  universe: StockItem[]
  selectedSymbol: string | null
  onSelectSymbol: (symbol: string) => void
  updatedAt?: string | null
  onBack?: (() => void) | null
  onOpenDetail?: (() => void) | null
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)

  const items = useMemo(() => {
    const query = q.trim().toLowerCase()
    const base = props.universe
    if (!query) return base.slice(0, 8)
    return base
      .filter((s) => {
        return (
          s.symbol.toLowerCase().includes(query) ||
          s.name.toLowerCase().includes(query)
        )
      })
      .slice(0, 12)
  }, [q, props.universe])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const el = boxRef.current
      if (!el) return
      if (e.target instanceof Node && el.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  return (
    <div className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4">
        {props.onBack ? (
          <button
            type="button"
            onClick={props.onBack}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-900 hover:text-slate-100"
            aria-label="返回"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : null}

        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-100">
            {props.title}
          </div>
          <div className="truncate text-xs text-slate-400">
            real data mode
            {props.selectedSymbol ? ` · ${props.selectedSymbol}` : ''}
          </div>
        </div>

        <div className="flex-1" />

        <div ref={boxRef} className="relative w-[420px] max-w-[52vw]">
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-slate-100 shadow-sm">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              placeholder="输入股票代码/名称"
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-500"
            />
          </div>

          {open ? (
            <div className="absolute mt-2 w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-lg">
              <div className="max-h-[360px] overflow-y-auto">
                {items.length ? (
                  items.map((s) => (
                    <button
                      key={s.symbol}
                      type="button"
                      onClick={() => {
                        props.onSelectSymbol(s.symbol)
                        setQ('')
                        setOpen(false)
                      }}
                      className={cn(
                        'flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-900',
                        props.selectedSymbol === s.symbol
                          ? 'bg-slate-900/60'
                          : '',
                      )}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm text-slate-100">
                          {s.symbol}
                          <span className="text-slate-400"> · {s.name}</span>
                        </div>
                        <div className="text-xs text-slate-500">
                          {s.exchange ?? '—'}
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">选择</div>
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-4 text-sm text-slate-400">
                    无匹配结果
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="hidden items-center gap-3 text-xs text-slate-400 md:flex">
          <div className="whitespace-nowrap">
            {props.updatedAt ? `更新于 ${props.updatedAt}` : '—'}
          </div>
          {props.onOpenDetail ? (
            <button
              type="button"
              onClick={props.onOpenDetail}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-slate-200 hover:bg-slate-800"
            >
              查看详情
              <ExternalLink className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
