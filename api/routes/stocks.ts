import { Router, type Request, type Response } from 'express'
import { getMockEvents, getMockFields, getMockUniverse } from '../domain/mockData.js'
import { buildRatiosResponse } from '../domain/ratios.js'
import { buildRiskSignals } from '../domain/riskEngine.js'
import { eventRiskLevel } from '../domain/eventRisk.js'
import {
  getSinaSpotDataset,
  pickMarketCapYuanFromDataset,
} from '../providers/ashareSinaSpot.js'
import { getEastmoneyFinancialSnapshot } from '../providers/eastmoneyDatacenter.js'
import { getEastmoneyAnnouncements } from '../providers/eastmoneyNotices.js'
import { getEastmoneyKline } from '../providers/eastmoneyKline.js'
import { getTencentKline } from '../providers/tencentKline.js'
import { findSimilarStocks } from '../domain/similarity.js'
import { getEastmoneyF10News } from '../providers/eastmoneyNews.js'
import { getRumorsOverview } from '../domain/rumors.js'
import { getThsClassicArticleStocks, getThsClassicStats } from '../providers/thsClassic.js'
import { getEastmoneyQuote } from '../providers/eastmoneyQuote.js'
import { getSinaIndustryMoneyflow } from '../providers/sinaMoneyflowIndustry.js'

const router = Router()

function isMockMode(): boolean {
  const v = process.env.MOCK_DATA
  if (!v) return false
  const s = String(v).toLowerCase()
  return s === '1' || s === 'true' || s === 'yes'
}

function isRealDataRequired(): boolean {
  const v = process.env.REAL_DATA_REQUIRED
  if (!v) return true
  const s = String(v).toLowerCase()
  return s === '1' || s === 'true' || s === 'yes'
}

function normalizeAshareCode(symbol: string): string {
  const raw = String(symbol ?? '').trim().toUpperCase()
  if (!raw) return ''
  const m = raw.match(/(\d{6})/)
  return m ? m[1] : raw
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

router.get('/universe', async (req: Request, res: Response): Promise<void> => {
  if (isMockMode() && !isRealDataRequired()) {
    res.status(200).json({ success: true, stocks: getMockUniverse(), meta: { source: 'mock' } })
    return
  }

  {
    const ds = await getSinaSpotDataset({ ttlSeconds: 6 * 3600 })
    const items = (ds?.items ?? [])
      .map((r) => ({
        symbol: String(r.code ?? '').trim(),
        name: String(r.name ?? '').trim(),
        exchange: String(r.symbol ?? '').slice(0, 2).toUpperCase() || undefined,
      }))
      .filter((s) => s.symbol && s.name)

    if (items.length) {
      res.status(200).json({
        success: true,
        stocks: items,
        meta: { source: 'sina_spot_cache' },
      })
      return
    }
  }

  res.status(502).json({
    success: false,
    error: 'Universe provider unavailable (real data required)',
  })
})

router.get('/moneyflow/industry', async (req: Request, res: Response): Promise<void> => {
  try {
    const fenlei = Number(req.query.fenlei ?? 0)
    const items = await getSinaIndustryMoneyflow({
      fenlei: fenlei === 1 ? 1 : 0,
      limit: 30,
      ttlSeconds: 120,
      timeoutMs: 12_000,
    })
    res.status(200).json({ success: true, items })
  } catch (e: unknown) {
    res.status(502).json({
      success: false,
      error: 'Industry moneyflow unavailable (real data required)',
      detail: errorMessage(e),
    })
  }
})

router.get('/breadth', async (req: Request, res: Response): Promise<void> => {
  try {
    const ds = await getSinaSpotDataset({ ttlSeconds: 6 * 3600 })
    const items = ds?.items ?? []
    let up = 0
    let down = 0
    let flat = 0
    let unknown = 0
    for (const it of items) {
      const v = Number((it as { changepercent?: unknown }).changepercent)
      if (!Number.isFinite(v)) {
        unknown += 1
        continue
      }
      if (v > 0) up += 1
      else if (v < 0) down += 1
      else flat += 1
    }

    const ts = typeof ds?.ts === 'number' ? ds.ts : Math.floor(Date.now() / 1000)
    const shDate = new Date(ts * 1000)
    const shWeekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', weekday: 'short' }).format(shDate)
    const offsetDays = shWeekday === 'Sat' ? 1 : shWeekday === 'Sun' ? 2 : 0
    const tradeDate = new Date(shDate.getTime() - offsetDays * 24 * 3600 * 1000)
    const asOfDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(tradeDate)
    res.status(200).json({
      success: true,
      asOfDate,
      total: up + down + flat,
      up,
      down,
      flat,
      unknown,
      meta: { source: 'sina_spot_cache', ts },
    })
  } catch (e: unknown) {
    res.status(502).json({
      success: false,
      error: 'Market breadth unavailable (real data required)',
      detail: errorMessage(e),
    })
  }
})

router.get('/ths-classic', async (req: Request, res: Response): Promise<void> => {
  try {
    const out = await getThsClassicStats({ ttlSeconds: 5 * 60, timeoutMs: 12_000 })
    res.status(200).json({ success: true, ...out })
  } catch (e: unknown) {
    res.status(502).json({
      success: false,
      error: 'THS classic unavailable (real data required)',
      detail: errorMessage(e),
    })
  }
})

router.get('/ths-classic/stocks', async (req: Request, res: Response): Promise<void> => {
  const url = String(req.query.url ?? '').trim()
  const limit = Number(req.query.limit ?? 10)
  try {
    const out = await getThsClassicArticleStocks({
      url,
      limit: Number.isFinite(limit) ? limit : 10,
      ttlSeconds: 30 * 60,
      timeoutMs: 12_000,
    })
    res.status(200).json({ success: true, ...out })
  } catch (e: unknown) {
    res.status(502).json({
      success: false,
      error: 'THS classic article unavailable (real data required)',
      detail: errorMessage(e),
    })
  }
})

router.get('/:symbol/quote', async (req: Request, res: Response): Promise<void> => {
  const symbol = String(req.params.symbol ?? '').toUpperCase()
  const code = normalizeAshareCode(symbol)
  try {
    const out = await getEastmoneyQuote({ code, timeoutMs: 12_000 })
    res.status(200).json({ success: true, symbol: code, ...out })
  } catch (e: unknown) {
    res.status(502).json({
      success: false,
      error: 'Quote provider unavailable (real data required)',
      detail: errorMessage(e),
    })
  }
})

router.get(
  '/:symbol/events',
  async (req: Request, res: Response): Promise<void> => {
    const symbol = String(req.params.symbol ?? '').toUpperCase()
    const days = Number(req.query.days ?? 90)
    const typeRaw = req.query.type
    const type = Array.isArray(typeRaw)
      ? typeRaw.map(String)
      : typeRaw
        ? String(typeRaw).split(',').map((s) => s.trim())
        : []

    const code = normalizeAshareCode(symbol)

    if (isMockMode() && !isRealDataRequired()) {
      const all = getMockEvents(symbol)
      const from = new Date()
      from.setUTCDate(from.getUTCDate() - (Number.isFinite(days) ? days : 90))
      const filtered = all.filter((e) => new Date(e.publishedAt) >= from)
      const byType = type.length
        ? filtered.filter((e) => type.includes(e.eventType))
        : filtered

      res.status(200).json({ success: true, symbol, events: byType, meta: { source: 'mock' } })
      return
    }

    let ann: Awaited<ReturnType<typeof getEastmoneyAnnouncements>> = []
    try {
      ann = await getEastmoneyAnnouncements({ code, pageSize: 30 })
    } catch (e: unknown) {
      void e
    }

    const news = await getEastmoneyF10News({ code, limit: 20 }).catch(() => [])

    const events = [...ann, ...news]
    if (!events.length) {
      res.status(502).json({
        success: false,
        error: 'Events provider unavailable (real data required)',
      })
      return
    }

    const from = new Date()
    from.setUTCDate(from.getUTCDate() - (Number.isFinite(days) ? days : 90))
    const filtered = events
      .filter((e) => new Date(e.publishedAt) >= from)
      .map((e) => ({ ...e, riskLevel: eventRiskLevel(e) }))
    const uniq = new Map<string, (typeof filtered)[number]>()
    for (const e of filtered) {
      const key = e.sourceUrl ? `url:${e.sourceUrl}` : `t:${e.title}::${e.publishedAt}`
      if (!uniq.has(key)) uniq.set(key, e)
    }
    const merged = Array.from(uniq.values()).sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
    const byType = type.length
      ? merged.filter((e) => type.includes(e.eventType))
      : merged

    res.status(200).json({
      success: true,
      symbol: code,
      events: byType,
      meta: {
        source: 'eastmoney_notice+eastmoney_news',
      },
    })
  },
)

router.get(
  '/:symbol/ratios',
  async (req: Request, res: Response): Promise<void> => {
    const symbol = String(req.params.symbol ?? '').toUpperCase()
    const asOf = req.query.asOf === 'previous' ? 'previous' : 'latest'

    if (isMockMode() && !isRealDataRequired()) {
      const fields = getMockFields(symbol, asOf)
      const payload = buildRatiosResponse({
        symbol,
        asOf,
        asOfDate: fields.asOfDate,
        fields: {
          netAssets: fields.netAssets,
          totalAssets: fields.totalAssets,
          revenue: fields.revenue,
          cash: fields.cash,
          marketCap: fields.marketCap,
        },
      })
      res.status(200).json({ success: true, ...payload, meta: { source: 'mock' } })
      return
    }

    {
      try {
        const code = normalizeAshareCode(symbol)
        const [fin, ds] = await Promise.all([
          getEastmoneyFinancialSnapshot({ code, asOf }),
          getSinaSpotDataset({ ttlSeconds: 6 * 3600 }),
        ])

        const marketCap = ds ? pickMarketCapYuanFromDataset(ds, code) : undefined
        const totalAssets = fin.totalAssets
        const totalLiabilities = fin.totalLiabilities
        const netAssets =
          typeof totalAssets === 'number' && typeof totalLiabilities === 'number'
            ? totalAssets - totalLiabilities
            : undefined

        const payload = buildRatiosResponse({
          symbol,
          asOf,
          asOfDate: fin.asOfDate,
          fields: {
            netAssets,
            totalAssets,
            revenue: fin.revenue,
            cash: fin.cash,
            marketCap,
          },
        })

        res.status(200).json({
          success: true,
          ...payload,
          meta: {
            source: 'eastmoney_datacenter',
          },
        })
        return
      } catch (e: unknown) {
        void e
      }
    }

    res.status(502).json({
      success: false,
      error: 'Ratios provider unavailable (real data required)',
    })
  },
)

router.get(
  '/:symbol/risk-signals',
  async (req: Request, res: Response): Promise<void> => {
    const symbol = String(req.params.symbol ?? '').toUpperCase()
    const days = Number(req.query.days ?? 90)

    if (isMockMode() && !isRealDataRequired()) {
      const all = getMockEvents(symbol)
      const from = new Date()
      from.setUTCDate(from.getUTCDate() - (Number.isFinite(days) ? days : 90))
      const filtered = all.filter((e) => new Date(e.publishedAt) >= from)
      const payload = buildRiskSignals({ symbol, events: filtered })
      res.status(200).json({ success: true, ...payload, meta: { source: 'mock' } })
      return
    }

    const code = normalizeAshareCode(symbol)
    const [ann, news] = await Promise.all([
      getEastmoneyAnnouncements({ code, pageSize: 30 }).catch(() => []),
      getEastmoneyF10News({ code, limit: 20 }).catch(() => []),
    ])
    const events = [...ann, ...news]
    if (!events.length) {
      res.status(502).json({
        success: false,
        error: 'Events provider unavailable (real data required)',
      })
      return
    }

    const from = new Date()
    from.setUTCDate(from.getUTCDate() - (Number.isFinite(days) ? days : 90))
    const filtered = events
      .filter((e) => new Date(e.publishedAt) >= from)
      .map((e) => ({ ...e, riskLevel: eventRiskLevel(e) }))
    const payload = buildRiskSignals({ symbol: code, events: filtered })

    res.status(200).json({
      success: true,
      ...payload,
      meta: {
        source: 'eastmoney_notice+eastmoney_news',
      },
    })
  },
)

router.get(
  '/:symbol/kline',
  async (req: Request, res: Response): Promise<void> => {
    const symbol = String(req.params.symbol ?? '').toUpperCase()
    const code = normalizeAshareCode(symbol)
    const kltRaw = String(req.query.klt ?? '101')
    const fqtRaw = String(req.query.fqt ?? '1')
    const limit = Number(req.query.limit ?? 200)

    const klt = (kltRaw === '102' || kltRaw === '103' ? kltRaw : '101') as '101' | '102' | '103'
    const fqt = (fqtRaw === '0' || fqtRaw === '2' ? fqtRaw : '1') as '0' | '1' | '2'

    try {
      const period = klt === '103' ? 'month' : klt === '102' ? 'week' : 'day'
      const adjust = fqt === '1' ? 'qfq' : 'none'

      const lmt = Number.isFinite(limit) ? limit : 200
      const [tencent, east] = await Promise.all([
        getTencentKline({ code, period, adjust, limit: lmt }),
        getEastmoneyKline({ code, klt, fqt, limit: lmt }).catch(() => null),
      ])

      if (!tencent.candles.length) {
        if (east?.candles?.length) {
          res.status(200).json({
            success: true,
            symbol: code,
            name: east.name,
            klt,
            fqt,
            candles: east.candles,
            meta: { source: east.source },
          })
          return
        }
        res.status(200).json({
          success: true,
          symbol: code,
          name: undefined,
          klt,
          fqt,
          candles: [],
          meta: { source: tencent.source },
        })
        return
      }

      const emByTs = new Map<string, { amount?: number; turnover?: number }>()
      for (const c of east?.candles ?? []) {
        emByTs.set(c.ts, { amount: c.amount, turnover: c.turnover })
      }

      const candles = tencent.candles.map((c) => {
        const extra = emByTs.get(c.ts)
        return {
          ...c,
          amount: extra?.amount,
          turnover: extra?.turnover,
        }
      })

      res.status(200).json({
        success: true,
        symbol: code,
        name: undefined,
        klt,
        fqt,
        candles,
        meta: { source: east?.source ? `${tencent.source}+${east.source}` : tencent.source },
      })
    } catch (e: unknown) {
      res.status(502).json({
        success: false,
        error: 'Kline provider unavailable (real data required)',
        detail: process.env.NODE_ENV === 'development' ? errorMessage(e) : undefined,
      })
    }
  },
)

router.get(
  '/:symbol/similar',
  async (req: Request, res: Response): Promise<void> => {
    const symbol = String(req.params.symbol ?? '').toUpperCase()
    const code = normalizeAshareCode(symbol)
    const days = Number(req.query.days ?? 160)
    const top = Number(req.query.top ?? 10)
    const klt = '101' as const
    const fqt = '1' as const
    const maxCandidates = Number(req.query.maxCandidates ?? 60)

    const enabledRaw = String(req.query.enabled ?? '2')
    const enabled = enabledRaw
      .split(',')
      .map((x) => Number(String(x).trim()))
      .filter((x): x is 1 | 2 | 3 => x === 1 || x === 2 || x === 3)
    const enabledUniq = Array.from(new Set(enabled))

    const s1MaxMarketCapYi = Number(req.query.s1MaxMarketCapYi ?? 150)
    const s2LastDays = Number(req.query.s2LastDays ?? 5)
    const s2TurnoverSpikeMultiple = Number(req.query.s2TurnoverSpikeMultiple ?? 2)
    const s2PreselectTop = Number(req.query.s2PreselectTop ?? 30)
    const s2MinSimilarity = Number(req.query.s2MinSimilarity ?? 0)
    const s3LastDays = Number(req.query.s3LastDays ?? 5)
    const s3ChangePct = Number(req.query.s3ChangePct ?? 9.98)
    const s3VolumeMultiple = Number(req.query.s3VolumeMultiple ?? 2)

    const candRaw = String(req.query.candidates ?? '').trim()
    const candidates = candRaw
      ? candRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined

    try {
      const out = await findSimilarStocks({
        targetSymbol: code,
        klt,
        fqt,
        days: Number.isFinite(days) ? days : 160,
        top: Number.isFinite(top) ? top : 10,
        candidateSymbols: candidates,
        maxCandidates: Number.isFinite(maxCandidates) ? maxCandidates : 60,
        enabled: enabledUniq.length ? enabledUniq : [2],
        s1MaxMarketCapYi: Number.isFinite(s1MaxMarketCapYi) ? s1MaxMarketCapYi : 150,
        s2LastDays: Number.isFinite(s2LastDays) ? s2LastDays : 5,
        s2TurnoverSpikeMultiple: Number.isFinite(s2TurnoverSpikeMultiple) ? s2TurnoverSpikeMultiple : 2,
        s2PreselectTop: Number.isFinite(s2PreselectTop) ? s2PreselectTop : 30,
        s2MinSimilarity: Number.isFinite(s2MinSimilarity) ? s2MinSimilarity : 0,
        s3LastDays: Number.isFinite(s3LastDays) ? s3LastDays : 5,
        s3ChangePct: Number.isFinite(s3ChangePct) ? s3ChangePct : 9.98,
        s3VolumeMultiple: Number.isFinite(s3VolumeMultiple) ? s3VolumeMultiple : 2,
      })
      res.status(200).json({ success: true, ...out, meta: { ...out.meta, source: 'kline_volume_similarity' } })
    } catch (e: unknown) {
      res.status(502).json({
        success: false,
        error: 'Similar search unavailable (real data required)',
        detail: process.env.NODE_ENV === 'development' ? errorMessage(e) : undefined,
      })
    }
  },
)

router.get(
  '/:symbol/rumors',
  async (req: Request, res: Response): Promise<void> => {
    const symbol = String(req.params.symbol ?? '').toUpperCase()
    const code = normalizeAshareCode(symbol)
    const limit = Number(req.query.limit ?? 40)

    try {
      const out = await getRumorsOverview({
        code,
        limit: Number.isFinite(limit) ? limit : 40,
      })
      res.status(200).json({ success: true, ...out })
    } catch (e: unknown) {
      res.status(502).json({
        success: false,
        error: 'Rumors provider unavailable (real data required)',
        detail: process.env.NODE_ENV === 'development' ? errorMessage(e) : undefined,
      })
    }
  },
)

export default router
