import type { MajorEvent, StockItem } from './types.js'

export function getMockUniverse(): StockItem[] {
  return [
    { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' },
    { symbol: 'TSLA', name: 'Tesla, Inc.', exchange: 'NASDAQ' },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ' },
    { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ' },
    { symbol: '600519.SS', name: 'Kweichow Moutai', exchange: 'SSE' },
  ]
}

function daysAgoIso(daysAgo: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - daysAgo)
  d.setUTCHours(2, 0, 0, 0)
  return d.toISOString()
}

export function getMockEvents(symbol: string): MajorEvent[] {
  const s = symbol.toUpperCase()

  const common: MajorEvent[] = [
    {
      id: `evt_${s}_earn_${daysAgoIso(6)}`,
      symbol: s,
      title: 'Earnings release: guidance updated',
      summary: 'Company reported quarterly results and updated forward guidance.',
      sourceName: 'MockWire',
      sourceUrl: 'https://example.com/mock/earnings',
      publishedAt: daysAgoIso(6),
      eventType: 'EARNINGS',
    },
    {
      id: `evt_${s}_other_${daysAgoIso(18)}`,
      symbol: s,
      title: 'Major supply chain update',
      summary: 'Operations update potentially affecting near-term delivery.',
      sourceName: 'MockWire',
      sourceUrl: 'https://example.com/mock/supply',
      publishedAt: daysAgoIso(18),
      eventType: 'OTHER',
    },
  ]

  const bySymbol: Record<string, MajorEvent[]> = {
    TSLA: [
      {
        id: `evt_${s}_reg_${daysAgoIso(2)}`,
        symbol: s,
        title: 'Regulatory inquiry reported',
        summary: 'Reports indicate an inquiry regarding safety and compliance.',
        sourceName: 'MockWire',
        sourceUrl: 'https://example.com/mock/reg',
        publishedAt: daysAgoIso(2),
        eventType: 'REGULATORY',
      },
      {
        id: `evt_${s}_lit_${daysAgoIso(14)}`,
        symbol: s,
        title: 'Litigation update: class action filing',
        summary: 'A class action lawsuit filing has been reported by media.',
        sourceName: 'MockWire',
        sourceUrl: 'https://example.com/mock/litigation',
        publishedAt: daysAgoIso(14),
        eventType: 'LITIGATION',
      },
    ],
    AAPL: [
      {
        id: `evt_${s}_mna_${daysAgoIso(9)}`,
        symbol: s,
        title: 'Acquisition rumor: strategic assets',
        summary: 'Market rumor around a potential acquisition in AI tools space.',
        sourceName: 'MockWire',
        sourceUrl: 'https://example.com/mock/mna',
        publishedAt: daysAgoIso(9),
        eventType: 'MNA',
      },
    ],
    NVDA: [
      {
        id: `evt_${s}_reg_${daysAgoIso(11)}`,
        symbol: s,
        title: 'Export controls discussion intensifies',
        summary: 'Policy discussions could impact certain product shipments.',
        sourceName: 'MockWire',
        sourceUrl: 'https://example.com/mock/export',
        publishedAt: daysAgoIso(11),
        eventType: 'REGULATORY',
      },
    ],
    MSFT: [
      {
        id: `evt_${s}_other_${daysAgoIso(4)}`,
        symbol: s,
        title: 'Cloud outage incident reported',
        summary: 'Service disruption reported; root cause analysis in progress.',
        sourceName: 'MockWire',
        sourceUrl: 'https://example.com/mock/outage',
        publishedAt: daysAgoIso(4),
        eventType: 'OTHER',
      },
    ],
    '600519.SS': [
      {
        id: `evt_${s}_earn_${daysAgoIso(3)}`,
        symbol: s,
        title: 'Quarterly report: revenue and margin update',
        summary: 'Company released quarterly report with updated revenue and margin.',
        sourceName: 'MockWire',
        sourceUrl: 'https://example.com/mock/report',
        publishedAt: daysAgoIso(3),
        eventType: 'EARNINGS',
      },
    ],
  }

  const list = [...(bySymbol[s] ?? []), ...common]
  list.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
  return list
}

export function getMockFields(
  symbol: string,
  asOf: 'latest' | 'previous',
): {
  asOfDate: string
  netAssets?: number
  totalAssets?: number
  revenue?: number
  cash?: number
  marketCap?: number
} {
  const s = symbol.toUpperCase()
  const factor = asOf === 'latest' ? 1 : 0.92

  const bySymbol: Record<
    string,
    {
      asOfDate: string
      netAssets: number
      totalAssets: number
      revenue: number
      cash: number
      marketCap: number
    }
  > = {
    AAPL: {
      asOfDate: '2024-12-31',
      netAssets: 62_000_000_000,
      totalAssets: 395_000_000_000,
      revenue: 390_000_000_000,
      cash: 60_000_000_000,
      marketCap: 3_100_000_000_000,
    },
    TSLA: {
      asOfDate: '2024-12-31',
      netAssets: 80_000_000_000,
      totalAssets: 125_000_000_000,
      revenue: 96_000_000_000,
      cash: 29_000_000_000,
      marketCap: 620_000_000_000,
    },
    NVDA: {
      asOfDate: '2024-12-31',
      netAssets: 65_000_000_000,
      totalAssets: 110_000_000_000,
      revenue: 90_000_000_000,
      cash: 28_000_000_000,
      marketCap: 2_800_000_000_000,
    },
    MSFT: {
      asOfDate: '2024-12-31',
      netAssets: 230_000_000_000,
      totalAssets: 530_000_000_000,
      revenue: 245_000_000_000,
      cash: 75_000_000_000,
      marketCap: 3_000_000_000_000,
    },
    '600519.SS': {
      asOfDate: '2024-12-31',
      netAssets: 240_000_000_000,
      totalAssets: 320_000_000_000,
      revenue: 150_000_000_000,
      cash: 80_000_000_000,
      marketCap: 2_200_000_000_000,
    },
  }

  const base = bySymbol[s]
  if (!base) {
    return {
      asOfDate: asOf === 'latest' ? '2024-12-31' : '2024-09-30',
    }
  }

  return {
    asOfDate: asOf === 'latest' ? base.asOfDate : '2024-09-30',
    netAssets: Math.round(base.netAssets * factor),
    totalAssets: Math.round(base.totalAssets * factor),
    revenue: Math.round(base.revenue * factor),
    cash: Math.round(base.cash * factor),
    marketCap: Math.round(base.marketCap * factor),
  }
}
