import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import EventsFeed from '@/components/EventsFeed'
import KlinePanel from '@/components/KlinePanel'
import RatiosPanel from '@/components/RatiosPanel'
import RumorsPanel from '@/components/RumorsPanel'
import RiskSummary from '@/components/RiskSummary'
import TopBar from '@/components/TopBar'
import { formatIsoToLocal } from '@/lib/format'
import { getEvents, getQuote, getRatios, getRiskSignals, getUniverse } from '@/lib/stockApi'
import { useStockStore } from '@/stores/stockStore'
import type {
  MajorEvent,
  RiskSignalsResponse,
  StockItem,
  StockRatiosResponse,
} from '@/types/stock'

export default function StockDetail() {
  const navigate = useNavigate()
  const params = useParams()
  const routeSymbol = String(params.symbol ?? '').toUpperCase()

  const selectedSymbol = useStockStore((s) => s.selectedSymbol)
  const watchlist = useStockStore((s) => s.watchlist)
  const blacklist = useStockStore((s) => s.blacklist)
  const rangeDays = useStockStore((s) => s.rangeDays)
  const eventTypes = useStockStore((s) => s.eventTypes)
  const ratiosAsOf = useStockStore((s) => s.ratiosAsOf)
  const klineKlt = useStockStore((s) => s.klineKlt)
  const klineFqt = useStockStore((s) => s.klineFqt)
  const klineLimit = useStockStore((s) => s.klineLimit)
  const expandedRatioKeys = useStockStore((s) => s.expandedRatioKeys)
  const expandedSignalIds = useStockStore((s) => s.expandedSignalIds)
  const setSelectedSymbol = useStockStore((s) => s.setSelectedSymbol)
  const setRangeDays = useStockStore((s) => s.setRangeDays)
  const setEventTypes = useStockStore((s) => s.setEventTypes)
  const setRatiosAsOf = useStockStore((s) => s.setRatiosAsOf)
  const toggleRatioExpanded = useStockStore((s) => s.toggleRatioExpanded)
  const toggleSignalExpanded = useStockStore((s) => s.toggleSignalExpanded)
  const setKline = useStockStore((s) => s.setKline)
  const addToWatchlist = useStockStore((s) => s.addToWatchlist)
  const addToBlacklist = useStockStore((s) => s.addToBlacklist)

  const [universe, setUniverse] = useState<StockItem[]>([])
  const [quoteName, setQuoteName] = useState<string | null>(null)

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

  useEffect(() => {
    const ac = new AbortController()
    getUniverse(ac.signal)
      .then(setUniverse)
      .catch(() => {})
    return () => ac.abort()
  }, [])

  useEffect(() => {
    if (!routeSymbol) return
    const ac = new AbortController()
    getQuote(routeSymbol, ac.signal)
      .then((q) => setQuoteName(q.name ? String(q.name) : null))
      .catch(() => setQuoteName(null))
    return () => ac.abort()
  }, [routeSymbol])

  useEffect(() => {
    if (!routeSymbol) return
    if (selectedSymbol !== routeSymbol) setSelectedSymbol(routeSymbol)
  }, [routeSymbol, selectedSymbol, setSelectedSymbol])

  useEffect(() => {
    if (!routeSymbol) return
    const ac = new AbortController()

    setEventsLoading(true)
    setEventsError(null)
    getEvents(
      routeSymbol,
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
    getRiskSignals(routeSymbol, rangeDays, ac.signal)
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
    getRatios(routeSymbol, ratiosAsOf, ac.signal)
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
  }, [routeSymbol, rangeDays, eventTypes, ratiosAsOf])

  useEffect(() => {
    if (!highlightEventId) return
    const el = document.getElementById(`evt-${highlightEventId}`)
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [highlightEventId])

  const updatedAt = useMemo(() => {
    const raw = signals?.updatedAt
    return raw ? formatIsoToLocal(raw) : null
  }, [signals?.updatedAt])

  const selectedMeta = useMemo(() => {
    const sym = routeSymbol
    if (!sym) return null
    return universe.find((s) => s.symbol.toUpperCase() === sym) ?? null
  }, [routeSymbol, universe])

  const displayName = selectedMeta?.name ?? quoteName

  const title = `个股详情`

  const inWatchlist = useMemo(() => {
    const s = routeSymbol.toUpperCase()
    return watchlist.map((x) => x.toUpperCase()).includes(s)
  }, [watchlist, routeSymbol])

  const inBlacklist = useMemo(() => {
    const s = routeSymbol.toUpperCase()
    return blacklist.map((x) => x.toUpperCase()).includes(s)
  }, [blacklist, routeSymbol])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <TopBar
        title={title}
        universe={universe}
        selectedSymbol={routeSymbol}
        onSelectSymbol={(s) => {
          setHighlightEventId(null)
          navigate(`/stocks/${encodeURIComponent(s)}`)
        }}
        updatedAt={updatedAt}
        onBack={() => navigate('/')}
        onOpenDetail={null}
      />

      <div className="mx-auto max-w-[1440px] px-4 py-4">
        <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-950 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-slate-100">
                {routeSymbol}
                {displayName ? (
                  <span className="text-slate-400"> · {displayName}</span>
                ) : null}
                {selectedMeta?.exchange ? (
                  <span className="text-slate-500"> · {selectedMeta.exchange}</span>
                ) : null}
              </div>
              <div className="mt-1 text-xs text-slate-500">事件时间线 · 信号解释 · 财务比率口径</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={inWatchlist}
                onClick={() => addToWatchlist(routeSymbol)}
                className={
                  inWatchlist
                    ? 'rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-500'
                    : 'rounded-lg border border-slate-800 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-white'
                }
              >
                {inWatchlist ? '已在自选' : '加入自选'}
              </button>
              <button
                type="button"
                disabled={inBlacklist}
                onClick={() => addToBlacklist(routeSymbol)}
                className={
                  inBlacklist
                    ? 'rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-500'
                    : 'rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800'
                }
              >
                {inBlacklist ? '已在黑名单' : '加入黑名单'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr,360px]">
          <div className="space-y-4">
            <KlinePanel
              symbol={routeSymbol}
              klt={klineKlt}
              fqt={klineFqt}
              limit={klineLimit}
              onChange={(next) => setKline(next)}
            />
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
            <RumorsPanel symbol={routeSymbol} />
          </div>

          <div className="space-y-4">
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
      </div>
    </div>
  )
}
