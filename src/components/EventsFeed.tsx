import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EventType, MajorEvent, RiskLevel } from '@/types/stock'
import { formatIsoToLocal } from '@/lib/format'

const EVENT_TYPES: Array<{ key: EventType; label: string }> = [
  { key: 'REGULATORY', label: '监管' },
  { key: 'LITIGATION', label: '诉讼' },
  { key: 'EARNINGS', label: '财报' },
  { key: 'MNA', label: '并购' },
  { key: 'SUSPEND_RESUME', label: '停复牌' },
  { key: 'DEBT_DEFAULT', label: '违约' },
  { key: 'OTHER', label: '其他' },
]

function riskLabel(level: RiskLevel): string {
  if (level === 'HIGH') return '高风险'
  if (level === 'MEDIUM') return '中风险'
  return '低风险'
}

function riskClass(level: RiskLevel): string {
  if (level === 'HIGH') return 'border-red-500/30 bg-red-500/15 text-red-200'
  if (level === 'MEDIUM') return 'border-amber-500/30 bg-amber-500/15 text-amber-200'
  return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200'
}

export default function EventsFeed(props: {
  events: MajorEvent[]
  loading: boolean
  error: string | null
  rangeDays: number
  onChangeRangeDays: (days: number) => void
  selectedTypes: EventType[]
  onChangeTypes: (types: EventType[]) => void
  highlightEventId: string | null
  onHighlightEvent: (id: string | null) => void
}) {
  const ranges = [7, 30, 90]

  function toggleType(t: EventType) {
    const set = new Set(props.selectedTypes)
    if (set.has(t)) set.delete(t)
    else set.add(t)
    props.onChangeTypes(Array.from(set))
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
        <div className="text-sm font-semibold text-slate-100">重大事件新闻流</div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
            {ranges.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => props.onChangeRangeDays(d)}
                className={cn(
                  'px-3 py-1.5 text-xs',
                  props.rangeDays === d
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-300 hover:bg-slate-800/60',
                )}
              >
                最近{d}天
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="border-b border-slate-800 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {EVENT_TYPES.map((t) => {
            const active = props.selectedTypes.includes(t.key)
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => toggleType(t.key)}
                className={cn(
                  'rounded-lg border px-2 py-1 text-xs',
                  active
                    ? 'border-slate-600 bg-slate-800 text-slate-100'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900',
                )}
              >
                {t.label}
              </button>
            )
          })}
          {props.selectedTypes.length ? (
            <button
              type="button"
              onClick={() => props.onChangeTypes([])}
              className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-400 hover:bg-slate-900"
            >
              清除筛选
            </button>
          ) : null}
        </div>
      </div>

      <div className="max-h-[calc(100vh-64px-16px-220px)] overflow-y-auto p-4">
        {props.loading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-xl border border-slate-800 bg-slate-900/40"
              />
            ))}
          </div>
        ) : props.error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {props.error}
          </div>
        ) : props.events.length ? (
          <div className="space-y-3">
            {props.events.map((e) => {
              const highlighted = props.highlightEventId === e.id
              return (
                <div
                  key={e.id}
                  id={`evt-${e.id}`}
                  className={cn(
                    'rounded-xl border border-slate-800 bg-slate-950 p-4',
                    highlighted ? 'ring-2 ring-blue-500/40' : '',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-0.5 text-xs text-slate-300">
                          {e.eventType}
                        </span>
                        {e.riskLevel ? (
                          <span
                            className={cn(
                              'rounded-lg border px-2 py-0.5 text-xs',
                              riskClass(e.riskLevel),
                            )}
                          >
                            {riskLabel(e.riskLevel)}
                          </span>
                        ) : null}
                        <span className="text-xs text-slate-500">{e.sourceName}</span>
                        <span className="text-xs text-slate-500">
                          {formatIsoToLocal(e.publishedAt)}
                        </span>
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-100">
                        {e.title}
                      </div>
                      {e.summary ? (
                        <div className="mt-1 line-clamp-3 text-sm text-slate-400">
                          {e.summary}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {e.sourceUrl ? (
                        <a
                          href={e.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
                        >
                          原文
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : null}
                      {highlighted ? (
                        <button
                          type="button"
                          onClick={() => props.onHighlightEvent(null)}
                          className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs text-slate-400 hover:bg-slate-900"
                        >
                          取消定位
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => props.onHighlightEvent(e.id)}
                          className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs text-slate-400 hover:bg-slate-900"
                        >
                          定位
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-800 p-4 text-sm text-slate-400">
            所选条件下暂无重大事件
          </div>
        )}
      </div>
    </div>
  )
}
