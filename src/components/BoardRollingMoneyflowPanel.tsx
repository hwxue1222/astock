import { useEffect, useMemo, useState } from 'react'
import { getBoardFlowRolling } from '@/lib/stockApi'
import { cn } from '@/lib/utils'
import type { BoardFlowRollingResponse } from '@/types/stock'

function formatYi(v: number | undefined): string {
  if (v === undefined) return '—'
  if (!Number.isFinite(v)) return '—'
  const s = v >= 0 ? '+' : ''
  return `${s}${v.toFixed(2)}亿`
}

export default function BoardRollingMoneyflowPanel(): JSX.Element {
  const [boardType, setBoardType] = useState<'concept' | 'theme'>('concept')
  const [top, setTop] = useState(20)
  const [days, setDays] = useState(14)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<BoardFlowRollingResponse | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    getBoardFlowRolling(
      {
        boardType,
        days,
        top,
      },
      ac.signal,
    )
      .then((d) => {
        if (ac.signal.aborted) return
        setData(d)
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setError(e instanceof Error ? e.message : String(e))
        setData(null)
      })
      .finally(() => {
        if (ac.signal.aborted) return
        setLoading(false)
      })
    return () => ac.abort()
  }, [boardType, days, top])

  const titleText = useMemo(() => {
    const t = boardType === 'theme' ? '主题' : '概念'
    return `${t}板块资金流向（最近${days}个交易日）`
  }, [boardType])

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">{titleText}</div>
          <div className="text-xs text-slate-500">来源：东方财富板块资金流</div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setBoardType('concept')}
              className={cn(
                'rounded-lg border px-2 py-1 text-xs font-semibold',
                boardType === 'concept'
                  ? 'border-sky-700 bg-sky-950 text-sky-200'
                  : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800',
              )}
            >
              概念
            </button>
            <button
              type="button"
              onClick={() => setBoardType('theme')}
              className={cn(
                'rounded-lg border px-2 py-1 text-xs font-semibold',
                boardType === 'theme'
                  ? 'border-sky-700 bg-sky-950 text-sky-200'
                  : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800',
              )}
            >
              主题
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-slate-400">最近</div>
            <input
              type="number"
              min={3}
              max={60}
              value={days}
              onChange={(e) => setDays(Math.max(3, Math.min(60, Number(e.target.value) || 14)))}
              className="w-16 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
            />
            <div className="text-xs text-slate-400">日</div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-slate-400">Top</div>
            <input
              type="number"
              min={5}
              max={60}
              value={top}
              onChange={(e) => setTop(Math.max(5, Math.min(60, Number(e.target.value) || 20)))}
              className="w-16 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
            />
          </div>
        </div>
      </div>

      <div className="mt-3">
        {loading ? <div className="text-sm text-slate-400">加载中…</div> : null}
        {error ? <div className="text-sm text-red-200">{error}</div> : null}

        {data && !loading && !error ? (
          <div className="space-y-2">
            <div className="text-xs text-slate-500">
              统计区间 {data.items[0]?.startDate ?? '—'} ~ {data.items[0]?.endDate ?? '—'} · 计算 {Math.round(data.meta.computeMs)}ms
              {data.meta.fallback ? <span className="ml-2 text-amber-200">（{data.meta.fallback}）</span> : null}
              {data.meta.partial ? <span className="ml-2 text-amber-200">（部分计算）</span> : null}
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-800">
              <div className="grid grid-cols-12 bg-slate-900/70 px-3 py-2 text-[11px] text-slate-400">
                <div className="col-span-1">#</div>
                <div className="col-span-5">板块</div>
                <div className="col-span-3 text-right">14日主力净流入</div>
                <div className="col-span-3 text-right">最新一日净流入</div>
              </div>
              <div className="divide-y divide-slate-800">
                {data.items.map((it, idx) => (
                  <div key={it.boardCode} className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-xs">
                    <div className="col-span-1 text-slate-500">{idx + 1}</div>
                    <div className="col-span-5 min-w-0 truncate text-slate-100">
                      <span className="font-semibold">{it.name}</span>
                      <span className="ml-2 text-[11px] text-slate-500">{it.boardCode}</span>
                    </div>
                    <div
                      className={cn(
                        'col-span-3 whitespace-nowrap text-right tabular-nums',
                        it.sumMainNetInflowYi >= 0 ? 'text-red-200' : 'text-emerald-200',
                      )}
                    >
                      {formatYi(it.sumMainNetInflowYi)}
                    </div>
                    <div
                      className={cn(
                        'col-span-3 whitespace-nowrap text-right tabular-nums',
                        (it.lastMainNetInflowYi ?? 0) >= 0 ? 'text-red-200' : 'text-emerald-200',
                      )}
                    >
                      {formatYi(it.lastMainNetInflowYi)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
