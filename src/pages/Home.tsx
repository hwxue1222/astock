import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import SimilarStocksPanel from '@/components/SimilarStocksPanel'
import ThsClassicStatsPanel from '@/components/ThsClassicStatsPanel'
import IndustryMoneyflowPanel from '@/components/IndustryMoneyflowPanel'
import MarketBreadthPanel from '@/components/MarketBreadthPanel'
import SymbolsTablePanel from '@/components/SymbolsTablePanel'
import TopBar from '@/components/TopBar'
import { formatIsoToLocal } from '@/lib/format'
import { getThsClassicStats, getUniverse } from '@/lib/stockApi'
import { useStockStore } from '@/stores/stockStore'
import type { StockItem, ThsClassicStatsResponse } from '@/types/stock'

type TabKey = 'overview' | 'watchlist' | 'lifeline' | 'similar'

type LifelineStock = {
  code: string
  name: string
  ll_date: string
  ll_close: number
  ll_open: number
  ll_low: number
  ll_volume: number
  ll_vol_ratio: number
}

const TAB_LIST: { key: TabKey; label: string }[] = [
  { key: 'overview', label: '📊 宏观概览' },
  { key: 'watchlist', label: '⭐ 自选股' },
  { key: 'lifeline', label: '🎯 生命线选股' },
  { key: 'similar', label: '🔍 相似股票' },
]

export default function Home() {
  const navigate = useNavigate()
  const location = useLocation()
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [lifelineStocks, setLifelineStocks] = useState<LifelineStock[]>([])
  const [lifelineLoading, setLifelineLoading] = useState(false)
  const [showPickTip, setShowPickTip] = useState(false)
  const watchlist = useStockStore((s) => s.watchlist)
  const blacklist = useStockStore((s) => s.blacklist)
  const addToWatchlist = useStockStore((s) => s.addToWatchlist)
  const toggleWatchlist = useStockStore((s) => s.toggleWatchlist)
  const addToBlacklist = useStockStore((s) => s.addToBlacklist)
  const toggleBlacklist = useStockStore((s) => s.toggleBlacklist)
  const standardSymbol = useStockStore((s) => s.standardSymbol)
  const klineKlt = useStockStore((s) => s.klineKlt)
  const klineFqt = useStockStore((s) => s.klineFqt)
  const klineLimit = useStockStore((s) => s.klineLimit)

  const [universe, setUniverse] = useState<StockItem[]>([])
  const [universeError, setUniverseError] = useState<string | null>(null)

  const [ths, setThs] = useState<ThsClassicStatsResponse | null>(null)
  const [thsLoading, setThsLoading] = useState(false)
  const [thsError, setThsError] = useState<string | null>(null)

  // 监听路由 state，自动切换到指定标签
  useEffect(() => {
    const tab = (location.state as any)?.activeTab
    if (tab && ['overview', 'watchlist', 'lifeline', 'similar'].includes(tab)) {
      setActiveTab(tab)
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  // 加载生命线数据
  useEffect(() => {
    setLifelineLoading(true)
    fetch('/watchlist_lifeline.json')
      .then((res) => res.json())
      .then((data: LifelineStock[]) => {
        data.sort((a, b) => b.ll_vol_ratio - a.ll_vol_ratio)
        setLifelineStocks(data)
      })
      .catch(() => setLifelineStocks([]))
      .finally(() => setLifelineLoading(false))
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    let retryTimer: number | null = null

    const run = (attempt: number) => {
      setUniverseError(null)
      getUniverse(ac.signal)
        .then((stocks) => {
          if (ac.signal.aborted) return
          setUniverse(stocks)
        })
        .catch((e: unknown) => {
          if (ac.signal.aborted) return
          const msg = e instanceof Error ? e.message : String(e)
          setUniverseError(msg)
          if (attempt < 3) {
            const delayMs = attempt === 1 ? 800 : attempt === 2 ? 2000 : 5000
            retryTimer = window.setTimeout(() => run(attempt + 1), delayMs)
          }
        })
    }

    run(1)
    return () => {
      ac.abort()
      if (retryTimer) window.clearTimeout(retryTimer)
    }
  }, [])

  const updatedAt = useMemo(() => {
    return ths?.fetchedAtISO ? formatIsoToLocal(ths.fetchedAtISO) : null
  }, [ths?.fetchedAtISO])

  useEffect(() => {
    const ac = new AbortController()
    setThsLoading(true)
    setThsError(null)
    getThsClassicStats(ac.signal)
      .then((d) => {
        if (ac.signal.aborted) return
        setThs(d)
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setThsError(e instanceof Error ? e.message : String(e))
        setThs(null)
      })
      .finally(() => {
        if (ac.signal.aborted) return
        setThsLoading(false)
      })
    return () => ac.abort()
  }, [])

  const title = universeError && universe.length === 0 ? '股票风险分析看板（搜索数据异常）' : '股票风险分析看板'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <TopBar
        title={title}
        universe={universe}
        selectedSymbol={null}
        onSelectSymbol={(s) => {
          navigate(`/stocks/${encodeURIComponent(s)}`)
        }}
        updatedAt={updatedAt}
        onBack={null}
        onOpenDetail={null}
      />

      {/* 顶部导航标签 */}
      <div className="mx-auto max-w-[1440px] px-4 pt-4">
        <div className="flex flex-wrap gap-2 rounded-xl border border-slate-800 bg-slate-950 p-2">
          {TAB_LIST.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-[1440px] px-4 py-4">
        {/* 📊 宏观概览 */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <ThsClassicStatsPanel
              data={ths}
              universe={universe}
              loading={thsLoading}
              error={thsError}
              onRefresh={() => {
                const ac = new AbortController()
                setThsLoading(true)
                setThsError(null)
                getThsClassicStats(ac.signal)
                  .then((d) => setThs(d))
                  .catch((e: unknown) => {
                    setThsError(e instanceof Error ? e.message : String(e))
                    setThs(null)
                  })
                  .finally(() => setThsLoading(false))
              }}
            />
            <MarketBreadthPanel />
            <IndustryMoneyflowPanel />
          </div>
        )}

        {/* ⭐ 自选股 */}
        {activeTab === 'watchlist' && (
          <div className="space-y-4">
            <SymbolsTablePanel
              title="自选股"
              symbols={watchlist}
              universe={universe}
              emptyText="添加自选以便快速跟踪"
              addPlaceholder="输入6位股票代码"
              onAdd={(s) => addToWatchlist(s)}
              onRemove={(s) => toggleWatchlist(s)}
              onOpen={(s) => navigate(`/stocks/${encodeURIComponent(s)}`)}
            />
            <SymbolsTablePanel
              title="黑名单"
              symbols={blacklist}
              universe={universe}
              emptyText="添加黑名单以便在看板中对照"
              addPlaceholder="输入6位股票代码"
              onAdd={(s) => addToBlacklist(s)}
              onRemove={(s) => toggleBlacklist(s)}
              onOpen={(s) => navigate(`/stocks/${encodeURIComponent(s)}`)}
            />
          </div>
        )}

        {/* 🎯 生命线选股 */}
        {activeTab === 'lifeline' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-950">
              <div className="flex flex-col gap-3 border-b border-slate-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-100">🎯 生命线选股监控</div>
                  <div className="text-xs text-slate-400">
                    最近3天出现生命线（阳线+放量≥3倍）| 共 {lifelineStocks.length} 只
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPickTip(!showPickTip)}
                    className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                  >
                    🚀 选股
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
                  >
                    刷新
                  </button>
                </div>
              </div>

              {showPickTip && (
                <div className="mx-4 mt-3 rounded-lg border border-amber-800 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
                  请在本地运行 <code className="rounded bg-slate-900 px-1 py-0.5 text-slate-200">lifeline_scan.py</code> 脚本进行A股扫描选股，
                  扫描结果将保存到 <code className="rounded bg-slate-900 px-1 py-0.5 text-slate-200">watchlist_lifeline.json</code>，
                  然后点击"刷新"即可更新列表。
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-900/40 text-xs text-slate-300">
                    <tr>
                      <th className="px-4 py-3">序号</th>
                      <th className="px-4 py-3">代码</th>
                      <th className="px-4 py-3">生命线日期</th>
                      <th className="px-4 py-3">收盘价</th>
                      <th className="px-4 py-3">开盘价</th>
                      <th className="px-4 py-3">最低价</th>
                      <th className="px-4 py-3">成交量</th>
                      <th className="px-4 py-3">放量倍数</th>
                      <th className="px-4 py-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lifelineLoading ? (
                      <tr>
                        <td className="px-4 py-4 text-slate-400" colSpan={9}>
                          加载中…
                        </td>
                      </tr>
                    ) : lifelineStocks.length ? (
                      lifelineStocks.map((s, i) => (
                        <tr
                          key={s.code}
                          className="border-t border-slate-800 hover:bg-slate-900/40"
                        >
                          <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-semibold text-slate-100">
                              {s.code.split('.')[0]}
                            </div>
                            <div className="text-xs text-slate-400">{s.name}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-200">{s.ll_date}</td>
                          <td className="px-4 py-3 text-emerald-400">{s.ll_close.toFixed(2)}</td>
                          <td className="px-4 py-3 text-slate-200">{s.ll_open.toFixed(2)}</td>
                          <td className="px-4 py-3 text-slate-200">{s.ll_low.toFixed(2)}</td>
                          <td className="px-4 py-3 text-amber-400">
                            {s.ll_volume >= 100000000
                              ? (s.ll_volume / 100000000).toFixed(1) + '亿'
                              : s.ll_volume >= 10000
                              ? (s.ll_volume / 10000).toFixed(0) + '万'
                              : s.ll_volume}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-bold text-white ${
                                s.ll_vol_ratio >= 5 ? 'bg-amber-500' : 'bg-sky-500'
                              }`}
                            >
                              {s.ll_vol_ratio.toFixed(2)}x
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() =>
                                navigate(`/stocks/${encodeURIComponent(s.code.split('.')[0])}`)
                              }
                              className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800"
                            >
                              查看详情
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-4 py-4 text-slate-400" colSpan={9}>
                          暂无生命线股票，点击"选股"按钮扫描A股
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 🔍 相似股票 */}
        {activeTab === 'similar' && (
          <div className="space-y-4">
            <SimilarStocksPanel
              targetSymbol={standardSymbol ?? '002829'}
              klt={klineKlt}
              fqt={klineFqt}
              days={klineLimit}
            />
          </div>
        )}
      </div>
    </div>
  )
}
