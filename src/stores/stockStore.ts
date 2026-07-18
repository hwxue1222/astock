import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EventType, KlineFqt, KlineKlt, SimilarStocksResponse } from '@/types/stock'

type RatiosAsOf = 'latest' | 'previous'

interface StockState {
  selectedSymbol: string | null
  standardSymbol: string | null
  watchlist: string[]
  blacklist: string[]
  rangeDays: number
  eventTypes: EventType[]
  ratiosAsOf: RatiosAsOf
  expandedRatioKeys: Record<string, boolean>
  expandedSignalIds: Record<string, boolean>
  klineKlt: KlineKlt
  klineFqt: KlineFqt
  klineLimit: number
  similarStandards: {
    s1: { enabled: boolean; maxMarketCapYi: number }
    s2: { enabled: boolean; lastDays: number; minSimilarity: number }
    s3: { enabled: boolean; lastDays: number; changePct: number; volumeMultiple: number }
  }
  similarLast: { key: string; data: SimilarStocksResponse; atISO: string } | null
  thsClassicParsedByUrl: Record<string, { codes: string[]; atISO: string }>
  setSelectedSymbol: (symbol: string) => void
  setStandardSymbol: (symbol: string) => void
  clearStandardSymbol: () => void
  toggleWatchlist: (symbol: string) => void
  addToWatchlist: (symbol: string) => void
  addManyToWatchlist: (symbols: string[]) => void
  toggleBlacklist: (symbol: string) => void
  addToBlacklist: (symbol: string) => void
  setRangeDays: (days: number) => void
  setEventTypes: (types: EventType[]) => void
  setRatiosAsOf: (asOf: RatiosAsOf) => void
  toggleRatioExpanded: (key: string) => void
  toggleSignalExpanded: (id: string) => void
  setKline: (next: { klt: KlineKlt; fqt: KlineFqt; limit: number }) => void
  setSimilarStandard: <K extends keyof StockState['similarStandards']>(
    key: K,
    next: Partial<StockState['similarStandards'][K]>,
  ) => void
  setSimilarLast: (next: StockState['similarLast']) => void
  clearSimilarLast: () => void
  setThsClassicParsed: (input: { url: string; codes: string[] }) => void
  clearThsClassicParsed: (input: { url: string }) => void
}

function uniqueUpper(list: string[]): string[] {
  const out: string[] = []
  for (const s of list) {
    const v = s.toUpperCase()
    if (!out.includes(v)) out.push(v)
  }
  return out
}

export const useStockStore = create<StockState>()(
  persist(
    (set, get) => ({
      selectedSymbol: null,
      standardSymbol: '002829',
      watchlist: ['600519', '000001', '300750'],
      blacklist: [],
      rangeDays: 30,
      eventTypes: [],
      ratiosAsOf: 'latest',
      klineKlt: '101',
      klineFqt: '1',
      klineLimit: 180,
      similarStandards: {
        s1: { enabled: false, maxMarketCapYi: 150 },
        s2: { enabled: false, lastDays: 5, minSimilarity: 0.8 },
        s3: { enabled: false, lastDays: 5, changePct: 9.98, volumeMultiple: 2 },
      },
      similarLast: null,
      thsClassicParsedByUrl: {},
      expandedRatioKeys: {
        net_assets_over_total_assets: false,
        revenue_over_market_cap: false,
        total_assets_over_market_cap: false,
        cash_over_market_cap: false,
      },
      expandedSignalIds: {},
      setSelectedSymbol: (symbol) => {
        set({ selectedSymbol: symbol.toUpperCase() })
      },
      setStandardSymbol: (symbol) => {
        set({ standardSymbol: symbol.toUpperCase() })
      },
      clearStandardSymbol: () => {
        set({ standardSymbol: null })
      },
      toggleWatchlist: (symbol) => {
        const s = symbol.toUpperCase()
        const list = get().watchlist
        if (list.includes(s)) {
          set({ watchlist: list.filter((x) => x !== s) })
          return
        }
        set({ watchlist: uniqueUpper([...list, s]) })
      },
      addToWatchlist: (symbol) => {
        const s = symbol.toUpperCase()
        const list = get().watchlist
        if (list.includes(s)) return
        set({ watchlist: uniqueUpper([...list, s]) })
      },
      addManyToWatchlist: (symbols) => {
        const list = get().watchlist
        const merged = uniqueUpper([...list, ...symbols])
        set({ watchlist: merged })
      },
      toggleBlacklist: (symbol) => {
        const s = symbol.toUpperCase()
        const list = get().blacklist
        if (list.includes(s)) {
          set({ blacklist: list.filter((x) => x !== s) })
          return
        }
        set({ blacklist: uniqueUpper([...list, s]) })
      },
      addToBlacklist: (symbol) => {
        const s = symbol.toUpperCase()
        const list = get().blacklist
        if (list.includes(s)) return
        set({ blacklist: uniqueUpper([...list, s]) })
      },
      setRangeDays: (days) => {
        set({ rangeDays: days })
      },
      setEventTypes: (types) => {
        set({ eventTypes: types })
      },
      setRatiosAsOf: (asOf) => {
        set({ ratiosAsOf: asOf })
      },
      toggleRatioExpanded: (key) => {
        const map = get().expandedRatioKeys
        set({ expandedRatioKeys: { ...map, [key]: !map[key] } })
      },
      toggleSignalExpanded: (id) => {
        const map = get().expandedSignalIds
        set({ expandedSignalIds: { ...map, [id]: !map[id] } })
      },
      setKline: (next) => {
        set({ klineKlt: next.klt, klineFqt: next.fqt, klineLimit: next.limit })
      },
      setSimilarStandard: (key, next) => {
        const current = get().similarStandards
        set({ similarStandards: { ...current, [key]: { ...current[key], ...next } } })
      },
      setSimilarLast: (next) => {
        set({ similarLast: next })
      },
      clearSimilarLast: () => {
        set({ similarLast: null })
      },
      setThsClassicParsed: ({ url, codes }) => {
        const u = String(url ?? '').trim()
        if (!u) return
        const list = (codes ?? []).map((x) => String(x).toUpperCase()).filter((x) => /^\d{6}$/.test(x))
        const map = get().thsClassicParsedByUrl
        set({ thsClassicParsedByUrl: { ...map, [u]: { codes: Array.from(new Set(list)), atISO: new Date().toISOString() } } })
      },
      clearThsClassicParsed: ({ url }) => {
        const u = String(url ?? '').trim()
        if (!u) return
        const map = get().thsClassicParsedByUrl
        if (!map[u]) return
        const next = { ...map }
        delete next[u]
        set({ thsClassicParsedByUrl: next })
      },
    }),
    {
      name: 'stock-risk-dashboard.v1',
      version: 14,
      migrate: (persisted: unknown, version) => {
        if (!persisted || typeof persisted !== 'object') return persisted
        if (version >= 14) return persisted
        const p = persisted as Partial<StockState>
        const isAshareCode = (s: string) => /^\d{6}$/.test(s)
        const watchlist = Array.isArray(p.watchlist)
          ? p.watchlist.map((x) => String(x).toUpperCase()).filter(isAshareCode)
          : []
        const blacklist = Array.isArray((p as { blacklist?: unknown }).blacklist)
          ? (p as { blacklist: unknown[] }).blacklist
              .map((x) => String(x).toUpperCase())
              .filter(isAshareCode)
          : []
        const selectedSymbolRaw = p.selectedSymbol ? String(p.selectedSymbol).toUpperCase() : null
        const selectedSymbol = selectedSymbolRaw && isAshareCode(selectedSymbolRaw) ? selectedSymbolRaw : null
        const standardSymbolRaw = p.standardSymbol ? String(p.standardSymbol).toUpperCase() : null
        const standardSymbol = standardSymbolRaw && isAshareCode(standardSymbolRaw) ? standardSymbolRaw : '002829'
        return {
          ...p,
          selectedSymbol,
          standardSymbol,
          watchlist: watchlist.length ? watchlist : ['600519', '000001', '300750'],
          blacklist,
          klineKlt: '101',
          klineFqt: '1',
          klineLimit: 180,
          similarStandards: {
            s1: { enabled: false, maxMarketCapYi: 150 },
            s2: { enabled: false, lastDays: 5, minSimilarity: 0.8 },
            s3: { enabled: false, lastDays: 5, changePct: 9.98, volumeMultiple: 2 },
          },
          similarLast: null,
          thsClassicParsedByUrl: {},
        }
      },
    },
  ),
)
