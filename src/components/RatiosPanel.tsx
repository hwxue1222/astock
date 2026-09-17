import { cn } from '@/lib/utils'
import type { StockRatiosResponse } from '@/types/stock'
import { formatRatio, formatYiFromYuan } from '@/lib/format'

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
    const netAssets = formatYiFromYuan(f.netAssets)
    const totalAssets = formatYiFromYuan(f.totalAssets)
    const revenue = formatYiFromYuan(f.revenue)
    const cash = formatYiFromYuan(f.cash)
    const marketCap = formatYiFromYuan(f.marketCap)

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

  const f = props.data?.fields
  const hasCashflow = typeof f?.operatingCashflow === 'number'
  const hasComposition =
    typeof f?.domesticRevenue === 'number' || typeof f?.overseasRevenue === 'number'

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
                          市值：{formatYiFromYuan(props.data?.fields.marketCap)}
                        </div>
                        <div className="rounded-lg bg-slate-900/60 p-2">
                          总资产：{formatYiFromYuan(props.data?.fields.totalAssets)}
                        </div>
                        <div className="rounded-lg bg-slate-900/60 p-2">
                          净资产：{formatYiFromYuan(props.data?.fields.netAssets)}
                        </div>
                        <div className="rounded-lg bg-slate-900/60 p-2">
                          现金：{formatYiFromYuan(props.data?.fields.cash)}
                        </div>
                        <div className="rounded-lg bg-slate-900/60 p-2">
                          营收：{formatYiFromYuan(props.data?.fields.revenue)}
                        </div>
                        <div className="rounded-lg bg-slate-900/60 p-2">
                          经营现金流：{formatYiFromYuan(props.data?.fields.operatingCashflow)}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}

            {/* 经营现金流 & 国内外业务 */}
            {hasCashflow || hasComposition ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950">
                <div className="border-b border-slate-800 px-4 py-2.5">
                  <span className="text-xs font-semibold text-slate-200">
                    💰 经营现金流与国内外业务
                  </span>
                </div>
                <div className="space-y-2 px-4 py-3 text-xs">
                  {hasCashflow ? (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">经营现金流净额</span>
                      <span
                        className={cn(
                          'font-semibold tabular-nums',
                          (f?.operatingCashflow ?? 0) >= 0
                            ? 'text-emerald-400'
                            : 'text-red-400',
                        )}
                      >
                        {formatYiFromYuan(f?.operatingCashflow)}
                      </span>
                    </div>
                  ) : null}

                  {hasComposition ? (
                    <>
                      <div className="flex items-center justify-between border-t border-slate-800/60 pt-2">
                        <span className="text-slate-400">🌏 国内业务</span>
                        <span className="text-slate-200 tabular-nums">
                          {formatYiFromYuan(f?.domesticRevenue)}
                          {typeof f?.domesticRatio === 'number' ? (
                            <span className="ml-1.5 text-slate-500">
                              ({(f.domesticRatio * 100).toFixed(1)}%)
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">✈️ 国外业务</span>
                        <span className="text-slate-200 tabular-nums">
                          {formatYiFromYuan(f?.overseasRevenue)}
                          {typeof f?.overseasRatio === 'number' ? (
                            <span className="ml-1.5 text-slate-500">
                              ({(f.overseasRatio * 100).toFixed(1)}%)
                            </span>
                          ) : null}
                        </span>
                      </div>
                      {/* 国内外占比条形图 */}
                      {typeof f?.domesticRatio === 'number' &&
                      typeof f?.overseasRatio === 'number' ? (
                        <div className="pt-1">
                          <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-800">
                            <div
                              className="bg-sky-500"
                              style={{
                                width: `${Math.min(100, Math.max(0, f.domesticRatio * 100))}%`,
                              }}
                            />
                            <div
                              className="bg-amber-500"
                              style={{
                                width: `${Math.min(100, Math.max(0, f.overseasRatio * 100))}%`,
                              }}
                            />
                          </div>
                          <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                            <span>■ 国内 {(f.domesticRatio * 100).toFixed(1)}%</span>
                            <span>国外 {(f.overseasRatio * 100).toFixed(1)}% ■</span>
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="text-slate-500">暂无国内外业务拆分数据</div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-slate-400">请选择标的</div>
        )}
      </div>
    </div>
  )
}
