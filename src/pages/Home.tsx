import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SimilarStocksPanel from '@/components/SimilarStocksPanel'
import SymbolListCard from '@/components/SymbolListCard'
import ThsClassicStatsPanel from '@/components/ThsClassicStatsPanel'
import TopBar from '@/components/TopBar'
import { formatIsoToLocal } from '@/lib/format'
import { getThsClassicStats, getUniverse } from '@/lib/stockApi'
import { useStockStore } from '@/stores/stockStore'
import type { StockItem, ThsClassicStatsResponse } from '@/types/stock'

export default function Home() {
  const navigate = useNavigate()
  const watchlist = useStockStore((s) => s.watchlist)
  const blacklist = useStockStore((s) => s.blacklist)
  const standardSymbol = useStockStore((s) => s.standardSymbol)
  const setStandardSymbol = useStockStore((s) => s.setStandardSymbol)
  const clearStandardSymbol = useStockStore((s) => s.clearStandardSymbol)
  const klineKlt = useStockStore((s) => s.klineKlt)
  const klineFqt = useStockStore((s) => s.klineFqt)
  const klineLimit = useStockStore((s) => s.klineLimit)
  const addToWatchlist = useStockStore((s) => s.addToWatchlist)
  const toggleWatchlist = useStockStore((s) => s.toggleWatchlist)
  const addToBlacklist = useStockStore((s) => s.addToBlacklist)
  const toggleBlacklist = useStockStore((s) => s.toggleBlacklist)

  const [universe, setUniverse] = useState<StockItem[]>([])
  const [universeError, setUniverseError] = useState<string | null>(null)

  const [ths, setThs] = useState<ThsClassicStatsResponse | null>(null)
  const [thsLoading, setThsLoading] = useState(false)
  const [thsError, setThsError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    setUniverseError(null)
    getUniverse(ac.signal)
      .then((stocks) => {
        setUniverse(stocks)
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setUniverseError(e instanceof Error ? e.message : String(e))
      })
    return () => ac.abort()
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

  const title = universeError
    ? '股票风险分析看板（数据源异常）'
    : '股票风险分析看板'

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

      <div className="mx-auto max-w-[1440px] px-4 py-4">
        <div className="space-y-4">
          <ThsClassicStatsPanel
            data={ths}
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

          <div className="grid gap-4 lg:grid-cols-3">
            <SimilarStocksPanel
              targetSymbol={standardSymbol ?? '002829'}
              standardSymbol={standardSymbol}
              onSetStandardSymbol={setStandardSymbol}
              onClearStandardSymbol={clearStandardSymbol}
              watchlist={watchlist}
              onAddToWatchlist={addToWatchlist}
              mode="kline"
              klt={klineKlt}
              fqt={klineFqt}
              days={klineLimit}
            />
            <SymbolListCard
              title="自选股"
              symbols={watchlist}
              universe={universe}
              emptyText="添加自选以便快速跟踪"
              addPlaceholder="输入6位股票代码"
              onAdd={(s) => addToWatchlist(s)}
              onRemove={(s) => toggleWatchlist(s)}
              onOpen={(s) => navigate(`/stocks/${encodeURIComponent(s)}`)}
            />
            <SymbolListCard
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
        </div>
      </div>
    </div>
  )
}
