import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '@/components/TopBar'
import { formatCompactNumber, formatRatio, riskLevelClass, riskLevelLabel } from '@/lib/format'
import { getRatios, getRiskSignals, getUniverse } from '@/lib/stockApi'
import { cn } from '@/lib/utils'
import { useStockStore } from '@/stores/stockStore'
import type { RiskSignalsResponse, StockItem, StockRatiosResponse } from '@/types/stock'

type Row = {
  symbol: string
  name?: string
  exchange?: string
  signals?: RiskSignalsResponse
  ratios?: StockRatiosResponse
  error?: string
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const workers = new Array(Math.max(1, limit)).fill(null).map(async () => {
    while (i < items.length) {
      const idx = i
      i += 1
      out[idx] = await fn(items[idx], idx)
    }
  })
  await Promise.all(workers)
  return out
}

export default function WatchlistDashboard() {
  const navigate = useNavigate()
  const watchlist = useStockStore((s) => s.watchlist)
  const standardSymbol = useStockStore((s) => s.standardSymbol)
  const clearStandardSymbol = useStockStore((s) => s.clearStandardSymbol)
  const setSelectedSymbol = useStockStore((s) => s.setSelectedSymbol)

  const [universe, setUniverse] = useState<StockItem[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const universeBySymbol = useMemo(() => {
    return new Map(universe.map((s) => [s.symbol.toUpperCase(), s]))
  }, [universe])

  useEffect(() => {
    const ac = new AbortController()
    getUniverse(ac.signal)
      .then((stocks) => setUniverse(stocks))
      .catch(() => setUniverse([]))
    return () => ac.abort()
  }, [])

  useEffect(() => {
    const list = watchlist.map((s) => s.toUpperCase())
    const ac = new AbortController()
    setLoading(true)
    setError(null)

    const symbols = list.slice(0, 20)

    mapLimit(symbols, 4, async (symbol) => {
      const meta = universeBySymbol.get(symbol)
      try {
        const [signals, ratios] = await Promise.all([
          getRiskSignals(symbol, 90, ac.signal),
          getRatios(symbol, 'latest', ac.signal),
        ])
        return {
          symbol,
          name: meta?.name,
          exchange: meta?.exchange,
          signals,
          ratios,
        } satisfies Row
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        return {
          symbol,
          name: meta?.name,
          exchange: meta?.exchange,
          error: msg,
        } satisfies Row
      }
    })
      .then((r) => {
        if (ac.signal.aborted) return
        setRows(r)
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setError(e instanceof Error ? e.message : String(e))
        setRows([])
      })
      .finally(() => {
        if (ac.signal.aborted) return
        setLoading(false)
      })

    return () => ac.abort()
  }, [watchlist, universeBySymbol])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <TopBar
        title="自选看板"
        universe={universe}
        selectedSymbol={null}
        onSelectSymbol={(s) => {
          setSelectedSymbol(s)
          navigate('/')
        }}
        updatedAt={null}
        onBack={() => navigate('/')}
        onOpenDetail={null}
      />

      <div className="mx-auto max-w-[1440px] px-4 py-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-950">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">自选股 Dashboard</div>
              <div className="text-xs text-slate-400">显示前 20 只自选股（真实数据）</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs text-slate-400">
                标准股：<span className="text-slate-200">{standardSymbol ?? '未设置'}</span>
              </div>
              {standardSymbol ? (
                <button
                  type="button"
                  onClick={() => navigate(`/stocks/${encodeURIComponent(standardSymbol)}`)}
                  className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
                >
                  查看标准
                </button>
              ) : null}
              {standardSymbol ? (
                <button
                  type="button"
                  onClick={() => clearStandardSymbol()}
                  className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
                >
                  清除
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  const url = new URL(window.location.href)
                  url.searchParams.set('t', String(Date.now()))
                  window.history.replaceState(null, '', url.toString())
                  navigate(0)
                }}
                className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
              >
                刷新
              </button>
            </div>
          </div>

          {error ? (
            <div className="px-4 py-4 text-sm text-red-200">{error}</div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-900/40 text-xs text-slate-300">
                <tr>
                  <th className="px-4 py-3">标的</th>
                  <th className="px-4 py-3">风险</th>
                  <th className="px-4 py-3">净资产/总资产</th>
                  <th className="px-4 py-3">营收/市值</th>
                  <th className="px-4 py-3">总资产/市值</th>
                  <th className="px-4 py-3">货币资金/市值</th>
                  <th className="px-4 py-3">市值</th>
                  <th className="px-4 py-3">数据期末</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-4 text-slate-400" colSpan={8}>
                      加载中…
                    </td>
                  </tr>
                ) : rows.length ? (
                  rows.map((r) => {
                    const risk = r.signals?.overallLevel
                    const ratios = r.ratios?.ratios ?? []
                    const ratioMap = new Map(ratios.map((x) => [x.key, x]))
                    const asOfDate = ratios[0]?.asOfDate
                    const marketCap = r.ratios?.fields.marketCap
                    return (
                      <tr
                        key={r.symbol}
                        className="border-t border-slate-800 hover:bg-slate-900/40"
                      >
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSymbol(r.symbol)
                              navigate(`/stocks/${encodeURIComponent(r.symbol)}`)
                            }}
                            className="text-left"
                          >
                            <div className="text-sm font-semibold text-slate-100">
                              {r.symbol}
                              <span className="text-slate-500">{r.exchange ? ` · ${r.exchange}` : ''}</span>
                            </div>
                            <div className="text-xs text-slate-400">{r.name ?? '—'}</div>
                          </button>
                        </td>

                        <td className="px-4 py-3">
                          {r.error ? (
                            <span className="text-xs text-red-200">数据失败</span>
                          ) : risk ? (
                            <span
                              className={cn(
                                'inline-flex items-center rounded-lg px-2 py-0.5 text-xs',
                                riskLevelClass(risk),
                              )}
                            >
                              {riskLevelLabel(risk)}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-slate-200">
                          {ratioMap.get('net_assets_over_total_assets')
                            ? formatRatio(
                                ratioMap.get('net_assets_over_total_assets')!.value,
                                ratioMap.get('net_assets_over_total_assets')!.unitHint,
                              )
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-200">
                          {ratioMap.get('revenue_over_market_cap')
                            ? formatRatio(
                                ratioMap.get('revenue_over_market_cap')!.value,
                                ratioMap.get('revenue_over_market_cap')!.unitHint,
                              )
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-200">
                          {ratioMap.get('total_assets_over_market_cap')
                            ? formatRatio(
                                ratioMap.get('total_assets_over_market_cap')!.value,
                                ratioMap.get('total_assets_over_market_cap')!.unitHint,
                              )
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-200">
                          {ratioMap.get('cash_over_market_cap')
                            ? formatRatio(
                                ratioMap.get('cash_over_market_cap')!.value,
                                ratioMap.get('cash_over_market_cap')!.unitHint,
                              )
                            : '—'}
                        </td>

                        <td className="px-4 py-3 text-slate-300">
                          {marketCap ? formatCompactNumber(marketCap) : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-400">{asOfDate ?? '—'}</td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td className="px-4 py-4 text-slate-400" colSpan={8}>
                      暂无自选股
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
