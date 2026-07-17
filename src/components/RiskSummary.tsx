import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RiskSignalsResponse } from '@/types/stock'
import { formatIsoToLocal, riskLevelClass, riskLevelLabel } from '@/lib/format'

function iconForLevel(level: RiskSignalsResponse['overallLevel']) {
  if (level === 'HIGH') return ShieldAlert
  if (level === 'MEDIUM') return AlertTriangle
  return ShieldCheck
}

export default function RiskSummary(props: {
  data: RiskSignalsResponse | null
  loading: boolean
  error: string | null
  expandedSignalIds: Record<string, boolean>
  onToggleSignalExpanded: (id: string) => void
  onFocusEvent: (eventId: string) => void
}) {
  if (props.loading) {
    return (
      <div className="space-y-3">
        <div className="h-28 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/40" />
        <div className="h-40 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/40" />
      </div>
    )
  }

  if (props.error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
        {props.error}
      </div>
    )
  }

  if (!props.data) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
        请选择标的
      </div>
    )
  }

  const Icon = iconForLevel(props.data.overallLevel)

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-100">总体风险</div>
            <div className="mt-1 text-xs text-slate-500">
              事件驱动信号 · 更新于 {formatIsoToLocal(props.data.updatedAt)}
            </div>
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold',
              riskLevelClass(props.data.overallLevel),
            )}
          >
            <Icon className="h-5 w-5" />
            {riskLevelLabel(props.data.overallLevel)}
          </span>
        </div>
        <div className="mt-3 text-xs text-slate-400">
          触发信号 {props.data.signals.length} 条
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950">
        <div className="border-b border-slate-800 px-4 py-3">
          <div className="text-sm font-semibold text-slate-100">风险信号（事件驱动）</div>
        </div>
        <div className="p-2">
          {props.data.signals.length ? (
            <div className="space-y-2">
              {props.data.signals.map((s) => {
                const expanded = !!props.expandedSignalIds[s.id]
                const firstEvent = s.relatedEventIds[0]
                return (
                  <div key={s.id} className="rounded-xl border border-slate-800 bg-slate-950">
                    <button
                      type="button"
                      onClick={() => {
                        props.onToggleSignalExpanded(s.id)
                        if (firstEvent) props.onFocusEvent(firstEvent)
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-slate-900"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-100">
                            {s.title}
                          </div>
                          <div className="mt-1 line-clamp-1 text-xs text-slate-400">
                            {s.reason}
                          </div>
                        </div>
                        <div className="text-right">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-lg px-2 py-0.5 text-xs',
                              riskLevelClass(s.level),
                            )}
                          >
                            {riskLevelLabel(s.level)}
                          </span>
                          <div className="mt-1 text-xs text-slate-500">
                            {formatIsoToLocal(s.occurredAt)}
                          </div>
                        </div>
                      </div>
                    </button>
                    {expanded ? (
                      <div className="border-t border-slate-800 px-4 py-3 text-xs text-slate-400">
                        <div>触发依据：{s.reason}</div>
                        {s.relatedEventIds.length ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {s.relatedEventIds.map((id) => (
                              <button
                                key={id}
                                type="button"
                                onClick={() => props.onFocusEvent(id)}
                                className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                              >
                                定位事件
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="px-4 py-6 text-sm text-slate-400">暂无信号</div>
          )}
        </div>
      </div>
    </div>
  )
}

