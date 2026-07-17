import { cn } from '@/lib/utils'
import type { StockRatiosResponse } from '@/types/stock'
import { formatCompactNumber, formatRatio } from '@/lib/format'

export default function RatiosPanel(props: {
  data: StockRatiosResponse | null
  loading: boolean
  error: string | null
  asOf: 'latest' | 'previous'
  onChangeAsOf: (asOf: 'latest' | 'previous') => void
  expandedKeys: Record<string, boolean>
  onToggleExpanded: (key: string) => void
}) {
  function valueHint(key: string): string {
    const f = props.data?.fields
    if (!f) return '数值：—'
    const netAssets = formatCompactNumber(f.netAssets)
    const totalAssets = formatCompactNumber(f.totalAssets)
    const revenue = formatCompactNumber(f.revenue)
    const cash = formatCompactNumber(f.cash)
    const marketCap = formatCompactNumber(f.marketCap)

    if (key === 'net_assets_over_total_assets') {
      return `数值：净资产 ${netAssets} / 总资产 ${totalAssets}`
    }
    if (key === 'revenue_over_market_cap') {
      return `数值：营收 ${revenue} / 总市值 ${marketCap}`
    }
    if (key === 'total_assets_over_market_cap') {
      return `数值：总资产 ${totalAssets} / 总市值 ${marketCap}`
    }
    if (key === 'cash_over_market_cap') {
      return `数值：货币资金 ${cash} / 总市值 ${marketCap}`
    }
    return '数值：—'
  }

  return (
    <div className="flex h-[calc(100vh-64px-16px)] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="text-sm font-semibold text-slate-100">财务比率</div>
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
          <button
            type="button"
            onClick={() => props.onChangeAsOf('latest')}
            className={cn(
              'px-3 py-1.5 text-xs',
              props.asOf === 'latest'
                ? 'bg-slate-800 text-slate-100'
                : 'text-slate-300 hover:bg-slate-800/60',
            )}
          >
            最新
          </button>
          <button
            type="button"
            onClick={() => props.onChangeAsOf('previous')}
            className={cn(
              'px-3 py-1.5 text-xs',
              props.asOf === 'previous'
                ? 'bg-slate-800 text-slate-100'
                : 'text-slate-300 hover:bg-slate-800/60',
            )}
          >
            上一期
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {props.loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
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
        ) : props.data ? (
          <div className="space-y-3">
            {props.data.ratios.map((r) => {
              const expanded = !!props.expandedKeys[r.key]
              return (
                <div
                  key={r.key}
                  className="rounded-xl border border-slate-800 bg-slate-950"
                >
                  <button
                    type="button"
                    onClick={() => props.onToggleExpanded(r.key)}
                    className="w-full px-4 py-3 text-left hover:bg-slate-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-100">
                          {r.label}
                        </div>
                        <div className="text-xs text-slate-500">
                          数据日期：{r.asOfDate}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {valueHint(r.key)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-slate-100 tabular-nums">
                          {formatRatio(r.value, r.unitHint)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {r.unitHint === '%' ? '占比' : '倍数'}
                        </div>
                      </div>
                    </div>
                  </button>
                  {expanded ? (
                    <div className="border-t border-slate-800 px-4 py-3 text-xs text-slate-400">
                      <div>口径：{r.formula}</div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div className="rounded-lg bg-slate-900/60 p-2">
                          市值：{formatCompactNumber(props.data?.fields.marketCap)}
                        </div>
                        <div className="rounded-lg bg-slate-900/60 p-2">
                          总资产：{formatCompactNumber(props.data?.fields.totalAssets)}
                        </div>
                        <div className="rounded-lg bg-slate-900/60 p-2">
                          净资产：{formatCompactNumber(props.data?.fields.netAssets)}
                        </div>
                        <div className="rounded-lg bg-slate-900/60 p-2">
                          现金：{formatCompactNumber(props.data?.fields.cash)}
                        </div>
                        <div className="rounded-lg bg-slate-900/60 p-2">
                          营收：{formatCompactNumber(props.data?.fields.revenue)}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-sm text-slate-400">请选择标的</div>
        )}
      </div>
    </div>
  )
}
