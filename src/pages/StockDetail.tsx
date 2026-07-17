import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import EventsFeed from '@/components/EventsFeed'
import KlinePanel from '@/components/KlinePanel'
import RatiosPanel from '@/components/RatiosPanel'
import RiskSummary from '@/components/RiskSummary'
import SimilarStocksPanel from '@/components/SimilarStocksPanel'
import TopBar from '@/components/TopBar'
import { formatIsoToLocal } from '@/lib/format'
import { getEvents, getRatios, getRiskSignals, getUniverse } from '@/lib/stockApi'
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
  const standardSymbol = useStockStore((s) => s.standardSymbol)
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
  const setStandardSymbol = useStockStore((s) => s.setStandardSymbol)
  const clearStandardSymbol = useStockStore((s) => s.clearStandardSymbol)

  const [universe, setUniverse] = useState<StockItem[]>([])

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

  const title = `个股详情`

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
                {selectedMeta?.name ? (
                  <span className="text-slate-400"> · {selectedMeta.name}</span>
                ) : null}
                {selectedMeta?.exchange ? (
                  <span className="text-slate-500"> · {selectedMeta.exchange}</span>
                ) : null}
              </div>
              <div className="mt-1 text-xs text-slate-500">事件时间线 · 信号解释 · 财务比率口径</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs text-slate-400">
                标准股：
                <span className="text-slate-200">{standardSymbol ?? '未设置'}</span>
              </div>
              <button
                type="button"
                onClick={() => setStandardSymbol(routeSymbol)}
                className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
              >
                设为标准
              </button>
              {standardSymbol ? (
                <button
                  type="button"
                  onClick={() => clearStandardSymbol()}
                  className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
                >
                  清除标准
                </button>
              ) : null}
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

          <div className="space-y-4">
            <RiskSummary
              data={signals}
              loading={signalsLoading}
              error={signalsError}
              expandedSignalIds={expandedSignalIds}
              onToggleSignalExpanded={toggleSignalExpanded}
              onFocusEvent={(id) => setHighlightEventId(id)}
            />
            <RatiosPanel
              data={ratios}
              loading={ratiosLoading}
              error={ratiosError}
              asOf={ratiosAsOf}
              onChangeAsOf={(asOf) => setRatiosAsOf(asOf)}
              expandedKeys={expandedRatioKeys}
              onToggleExpanded={toggleRatioExpanded}
            />
            <SimilarStocksPanel
              targetSymbol={standardSymbol ?? routeSymbol}
              klt={klineKlt}
              fqt={klineFqt}
              days={klineLimit}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
