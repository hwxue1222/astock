import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getBoardFlowRolling } from '@/lib/stockApi'
import { cn } from '@/lib/utils'
import type { BoardFlowRollingResponse } from '@/types/stock'

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

function formatYi(v: number | undefined): string {
  if (v === undefined) return '—'
  if (!Number.isFinite(v)) return '—'
  const s = v >= 0 ? '+' : ''
  return `${s}${v.toFixed(2)}亿`
}

export default function ConceptFlow(): JSX.Element {
  const navigate = useNavigate()
  const [sp, setSp] = useSearchParams()

  const boardType = (sp.get('boardType') === 'theme' ? 'theme' : 'concept') as 'concept' | 'theme'
  const days = clampInt(sp.get('days'), 3, 60, 14)
  const top = clampInt(sp.get('top'), 1, 200, 20)

  const [daysDraft, setDaysDraft] = useState(String(days))
  const [topDraft, setTopDraft] = useState(String(top))

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<BoardFlowRollingResponse | null>(null)

  useEffect(() => {
    setDaysDraft(String(days))
  }, [days])

  useEffect(() => {
    setTopDraft(String(top))
  }, [top])

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    getBoardFlowRolling({ boardType, days, top }, ac.signal)
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

  const title = boardType === 'theme' ? '主题板块资金流向' : '概念板块资金流向'
  const subtitle = useMemo(() => {
    const range = data?.items?.[0] ? `${data.items[0].startDate} ~ ${data.items[0].endDate}` : ''
    return `最近${days}个交易日 · ${range}`.trim()
  }, [data?.items, days])

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-100">{title}</div>
            <div className="mt-1 text-xs text-slate-500">{subtitle || '来源：东方财富板块资金流'}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(sp)
                  next.set('boardType', 'concept')
                  setSp(next, { replace: true })
                }}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 text-xs font-semibold',
                  boardType === 'concept'
                    ? 'border-sky-700 bg-sky-950 text-sky-200'
                    : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800',
                )}
              >
                概念
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(sp)
                  next.set('boardType', 'theme')
                  setSp(next, { replace: true })
                }}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 text-xs font-semibold',
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
                value={daysDraft}
                onChange={(e) => {
                  const raw = e.target.value
                  setDaysDraft(raw)
                  if (raw === '') return
                  const next = new URLSearchParams(sp)
                  next.set('days', String(clampInt(raw, 3, 60, 14)))
                  setSp(next, { replace: true })
                }}
                onBlur={() => {
                  if (daysDraft.trim() === '') setDaysDraft(String(days))
                }}
                className="w-16 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
              />
              <div className="text-xs text-slate-400">日</div>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-xs text-slate-400">Top</div>
              <input
                type="number"
                min={1}
                max={200}
                value={topDraft}
                onChange={(e) => {
                  const raw = e.target.value
                  setTopDraft(raw)
                  if (raw === '') return
                  const next = new URLSearchParams(sp)
                  next.set('top', String(clampInt(raw, 1, 200, 20)))
                  setSp(next, { replace: true })
                }}
                onBlur={() => {
                  if (topDraft.trim() === '') setTopDraft(String(top))
                }}
                className="w-16 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
              />
            </div>
          </div>
        </div>

        <div className="mt-3">
          {loading ? <div className="text-sm text-slate-400">加载中…</div> : null}
          {error ? <div className="text-sm text-red-200">{error}</div> : null}

          {data && !loading && !error ? (
            <div className="overflow-hidden rounded-xl border border-slate-800">
              <div className="grid grid-cols-12 bg-slate-900/70 px-3 py-2 text-[11px] text-slate-400">
                <div className="col-span-1">#</div>
                <div className="col-span-5">板块</div>
                <div className="col-span-3 text-right">{days}日主力净流入</div>
                <div className="col-span-3 text-right">最新一日净流入</div>
              </div>
              <div className="divide-y divide-slate-800">
                {data.items.map((it, idx) => (
                  <button
                    key={it.boardCode}
                    type="button"
                    onClick={() => {
                      navigate(`/concept-flow/${encodeURIComponent(it.boardCode)}?${sp.toString()}`, {
                        state: { boardName: it.name },
                      })
                    }}
                    className="grid w-full grid-cols-12 items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-900/40"
                  >
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
                        it.lastMainNetInflowYi >= 0 ? 'text-red-200' : 'text-emerald-200',
                      )}
                    >
                      {formatYi(it.lastMainNetInflowYi)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
