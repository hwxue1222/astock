import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EventsFeed from '@/components/EventsFeed'
import RatiosPanel from '@/components/RatiosPanel'
import RiskSummary from '@/components/RiskSummary'
import TopBar from '@/components/TopBar'
import WatchlistPanel from '@/components/WatchlistPanel'
import { formatIsoToLocal } from '@/lib/format'
import { getEvents, getRatios, getRiskSignals, getUniverse } from '@/lib/stockApi'
import { useStockStore } from '@/stores/stockStore'
import type {
  MajorEvent,
  RiskLevel,
  RiskSignalsResponse,
  StockItem,
  StockRatiosResponse,
} from '@/types/stock'

export default function Home() {
  const navigate = useNavigate()
  const selectedSymbol = useStockStore((s) => s.selectedSymbol)
  const watchlist = useStockStore((s) => s.watchlist)
  const rangeDays = useStockStore((s) => s.rangeDays)
  const eventTypes = useStockStore((s) => s.eventTypes)
  const ratiosAsOf = useStockStore((s) => s.ratiosAsOf)
  const expandedRatioKeys = useStockStore((s) => s.expandedRatioKeys)
  const expandedSignalIds = useStockStore((s) => s.expandedSignalIds)
  const setSelectedSymbol = useStockStore((s) => s.setSelectedSymbol)
  const toggleWatchlist = useStockStore((s) => s.toggleWatchlist)
  const setRangeDays = useStockStore((s) => s.setRangeDays)
  const setEventTypes = useStockStore((s) => s.setEventTypes)
  const setRatiosAsOf = useStockStore((s) => s.setRatiosAsOf)
  const toggleRatioExpanded = useStockStore((s) => s.toggleRatioExpanded)
  const toggleSignalExpanded = useStockStore((s) => s.toggleSignalExpanded)

  const [universe, setUniverse] = useState<StockItem[]>([])
  const [universeError, setUniverseError] = useState<string | null>(null)

  const [events, setEvents] = useState<MajorEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState<string | null>(null)

  const [signals, setSignals] = useState<RiskSignalsResponse | null>(null)
  const [signalsLoading, setSignalsLoading] = useState(false)
  const [signalsError, setSignalsError] = useState<string | null>(null)

  const [ratios, setRatios] = useState<StockRatiosResponse | null>(null)
  const [ratiosLoading, setRatiosLoading] = useState(false)
  const [ratiosError, setRatiosError] = useState<string | null>(null)

  const [highlightEventId, setHighlightEventId] = useState<string | null>(null)

  const [riskBySymbol, setRiskBySymbol] = useState<Record<string, RiskLevel | undefined>>({})
  const [lastEventTimeBySymbol, setLastEventTimeBySymbol] = useState<Record<string, string | undefined>>({})

  const updatedAt = useMemo(() => {
    const raw = signals?.updatedAt
    return raw ? formatIsoToLocal(raw) : null
  }, [signals?.updatedAt])

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const sym = (q.get('symbol') ?? '').trim().toUpperCase()
    if (!sym) return
    setHighlightEventId(null)
    setSelectedSymbol(sym)
  }, [setSelectedSymbol])

  useEffect(() => {
    if (!selectedSymbol) return
    const url = new URL(window.location.href)
    url.searchParams.set('symbol', selectedSymbol)
    window.history.replaceState(null, '', url.toString())
  }, [selectedSymbol])

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

  useEffect(() => {
    if (selectedSymbol) return
    if (!universe.length) return
    const pick = (watchlist[0] ?? universe[0]?.symbol ?? '').toUpperCase()
    if (pick) setSelectedSymbol(pick)
  }, [selectedSymbol, universe, watchlist, setSelectedSymbol])

  useEffect(() => {
    if (!selectedSymbol) return
    const ac = new AbortController()

    setEventsLoading(true)
    setEventsError(null)
    getEvents(
      selectedSymbol,
      { days: rangeDays, types: eventTypes as unknown as string[] },
      ac.signal,
    )
      .then((list) => {
        if (ac.signal.aborted) return
        setEvents(list)
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setEventsError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (ac.signal.aborted) return
        setEventsLoading(false)
      })

    setSignalsLoading(true)
    setSignalsError(null)
    getRiskSignals(selectedSymbol, rangeDays, ac.signal)
      .then((data) => {
        if (ac.signal.aborted) return
        setSignals(data)
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setSignalsError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (ac.signal.aborted) return
        setSignalsLoading(false)
      })

    setRatiosLoading(true)
    setRatiosError(null)
    getRatios(selectedSymbol, ratiosAsOf, ac.signal)
      .then((data) => {
        if (ac.signal.aborted) return
        setRatios(data)
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setRatiosError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (ac.signal.aborted) return
        setRatiosLoading(false)
      })

    return () => ac.abort()
  }, [selectedSymbol, rangeDays, eventTypes, ratiosAsOf])

  useEffect(() => {
    if (!highlightEventId) return
    const el = document.getElementById(`evt-${highlightEventId}`)
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [highlightEventId])

  const watchlistKey = useMemo(() => watchlist.slice(0, 12).join('|'), [watchlist])

  useEffect(() => {
    if (!watchlist.length) return
    const ac = new AbortController()

    Promise.all(
      watchlist.slice(0, 12).map(async (sym) => {
        const [sig, evts] = await Promise.all([
          getRiskSignals(sym, 90, ac.signal),
          getEvents(sym, { days: 90, types: [] }, ac.signal),
        ])
        return { sym, sig, evts }
      }),
    )
      .then((rows) => {
        if (ac.signal.aborted) return
        const riskMap: Record<string, RiskLevel | undefined> = {}
        const timeMap: Record<string, string | undefined> = {}
        for (const r of rows) {
          riskMap[r.sym] = r.sig.overallLevel
          const t = r.evts[0]?.publishedAt
          timeMap[r.sym] = t ? formatIsoToLocal(t) : undefined
        }
        setRiskBySymbol(riskMap)
        setLastEventTimeBySymbol(timeMap)
      })
      .catch(() => {})

    return () => ac.abort()
  }, [watchlistKey, watchlist])

  const title = universeError
    ? '股票风险分析看板（数据源异常）'
    : '股票风险分析看板'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <TopBar
        title={title}
        universe={universe}
        selectedSymbol={selectedSymbol}
        onSelectSymbol={(s) => {
          setHighlightEventId(null)
          setSelectedSymbol(s)
        }}
        updatedAt={updatedAt}
        onBack={null}
        onOpenDetail={
          selectedSymbol
            ? () => navigate(`/stocks/${encodeURIComponent(selectedSymbol)}`)
            : null
        }
      />

      <div className="mx-auto max-w-[1440px] px-4 py-4">
        <div className="grid gap-4 lg:grid-cols-[280px,1fr,360px]">
          <div className="hidden lg:block">
            <WatchlistPanel
              universe={universe}
              watchlist={watchlist}
              selectedSymbol={selectedSymbol}
              riskBySymbol={riskBySymbol}
              lastEventTimeBySymbol={lastEventTimeBySymbol}
              onSelect={(s) => {
                setHighlightEventId(null)
                setSelectedSymbol(s)
              }}
              onToggleWatchlist={toggleWatchlist}
              onOpenDashboard={() => navigate('/watchlist')}
            />
          </div>

          <div className="space-y-4">
            <RiskSummary
              data={signals}
              loading={signalsLoading}
              error={signalsError}
              expandedSignalIds={expandedSignalIds}
              onToggleSignalExpanded={toggleSignalExpanded}
              onFocusEvent={(id) => setHighlightEventId(id)}
            />
            <EventsFeed
              events={events}
              loading={eventsLoading}
              error={eventsError}
              rangeDays={rangeDays}
              onChangeRangeDays={(d) => {
                setHighlightEventId(null)
                setRangeDays(d)
              }}
              selectedTypes={eventTypes}
              onChangeTypes={(t) => {
                setHighlightEventId(null)
                setEventTypes(t)
              }}
              highlightEventId={highlightEventId}
              onHighlightEvent={setHighlightEventId}
            />
          </div>

          <div className="hidden lg:block">
            <RatiosPanel
              data={ratios}
              loading={ratiosLoading}
              error={ratiosError}
              asOf={ratiosAsOf}
              onChangeAsOf={(asOf) => setRatiosAsOf(asOf)}
              expandedKeys={expandedRatioKeys}
              onToggleExpanded={toggleRatioExpanded}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:hidden">
          <RatiosPanel
            data={ratios}
            loading={ratiosLoading}
            error={ratiosError}
            asOf={ratiosAsOf}
            onChangeAsOf={(asOf) => setRatiosAsOf(asOf)}
            expandedKeys={expandedRatioKeys}
            onToggleExpanded={toggleRatioExpanded}
          />
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
            自选列表仅在大屏展示（MVP）
          </div>
        </div>
      </div>
    </div>
  )
}
