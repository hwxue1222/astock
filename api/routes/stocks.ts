import { Router, type Request, type Response } from 'express'
import { getMockEvents, getMockFields, getMockUniverse } from '../domain/mockData.js'
import { buildRatiosResponse } from '../domain/ratios.js'
import { buildRiskSignals } from '../domain/riskEngine.js'
import { eventRiskLevel } from '../domain/eventRisk.js'
import {
  getSinaSpotDataset,
  pickMarketCapYuanFromDataset,
} from '../providers/ashareSinaSpot.js'
import { getAshareUniverseFromEastmoney } from '../providers/ashareUniverseEastmoney.js'
import {
  getEastmoneyFinancialSnapshot,
  getEastmoneyOperatingCashflow,
  getEastmoneyRegionalComposition,
} from '../providers/eastmoneyDatacenter.js'
import { getEastmoneyQuote } from '../providers/eastmoneyQuote.js'
import { getEastmoneyTrend } from '../providers/eastmoneyTrend.js'
import { getEastmoneyF10News } from '../providers/eastmoneyNews.js'
import { getEastmoneyAnnouncements } from '../providers/eastmoneyNotices.js'
import { getRumorsOverview } from '../domain/rumors.js'
import { findSimilarStocks, screenStocks } from '../domain/similarity.js'
import { getThsClassicArticleStocks, getThsClassicStats } from '../providers/thsClassic.js'
import { getEastmoneyCompanySurvey } from '../providers/eastmoneySurvey.js'
import { getSinaIndustryMoneyflow } from '../providers/sinaMoneyflowIndustry.js'
import { buildIndustryRotationForecast } from '../domain/industryRotation.js'
import { buildIndustryMonthlyFlowSeasonality } from '../domain/industryFlowSeasonality.js'
import { buildBoardFlowRolling } from '../domain/boardFlowRolling.js'
import { getEastmoneyBoardConstituents } from '../providers/eastmoneyBoards.js'
import { cacheFilePath, readJsonCache, writeJsonCache } from '../providers/fsCache.js'
import { fetchKlineRobust, fetchFinancialRobust, mergeQuoteWithSina, galaxyBridgeUrl } from '../providers/multiSource.js'
import { mxStockDiagnosis, mxScreenStocks, isMxAvailable } from '../providers/dongcaiMx.js'

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

  try {
    const ds = await getAshareUniverseFromEastmoney({ ttlSeconds: 6 * 3600, timeoutMs: 10_000 })
    if (ds.items.length) {
      res.status(200).json({
        success: true,
        stocks: ds.items,
        meta: { source: 'eastmoney_clist' },
      })
      return
    }
  } catch {
    void 0
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

router.get('/quotes', async (req: Request, res: Response): Promise<void> => {
  const raw = req.query.symbols
  const limit = Number(req.query.limit ?? 6)

  const list = (Array.isArray(raw) ? raw.join(',') : String(raw ?? ''))
    .split(',')
    .map((s) => normalizeAshareCode(String(s)))
    .filter((s) => /^\d{6}$/.test(s))

  const uniq = Array.from(new Set(list)).slice(0, 200)
  if (!uniq.length) {
    res.status(400).json({ success: false, error: 'Missing symbols' })
    return
  }

  const concurrency = Number.isFinite(limit) ? Math.max(1, Math.min(12, limit)) : 6

  const items = await mapLimit(uniq, concurrency, async (code) => {
    try {
      const out = await getEastmoneyQuote({ code, timeoutMs: 12_000 })
      return { symbol: code, ...out }
    } catch {
      return { symbol: code }
    }
  })

  // 新浪批量行情合并：补充涨跌幅/PB 交叉验证（东财单源失败时兜底）
  const merged = await mergeQuoteWithSina(items)

  res.status(200).json({ success: true, items: merged })
})

router.get('/rotation/forecast', async (req: Request, res: Response): Promise<void> => {
  const monthsRaw = String(req.query.months ?? '9,10,11,12')
  const years = Number(req.query.years ?? 10)
  const top = Number(req.query.top ?? 8)
  const industries = Number(req.query.industries ?? 10)
  const stocksPerIndustry = Number(req.query.stocksPerIndustry ?? 2)
  const boardType = String(req.query.boardType ?? '').trim().toLowerCase()
  const fenleiQuery = Number(req.query.fenlei)
  let fenlei: 0 | 1 = fenleiQuery === 1 ? 1 : 0
  if (boardType === 'concept') fenlei = 1
  if (boardType === 'industry') fenlei = 0
  const ttlSeconds = Number(req.query.ttlSeconds ?? 6 * 3600)
  const maxComputeMs = Number(req.query.maxComputeMs ?? (process.env.VERCEL ? 8000 : 25000))

  const months = monthsRaw
    .split(',')
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x))

  try {
    const out = await buildIndustryRotationForecast({
      months,
      years,
      top,
      industries,
      stocksPerIndustry,
      fenlei,
      ttlSeconds,
      maxComputeMs,
    })
    res.status(200).json({ success: true, ...out })
  } catch (e: unknown) {
    res.status(502).json({
      success: false,
      error: 'Industry rotation forecast unavailable (real data required)',
      detail: errorMessage(e),
    })
  }
})

router.get('/moneyflow/industry/seasonality', async (req: Request, res: Response): Promise<void> => {
  const years = Number(req.query.years ?? 10)
  const top = Number(req.query.top ?? 5)
  const boardLimit = Number(req.query.boardLimit ?? 180)
  const ttlSeconds = Number(req.query.ttlSeconds ?? 7 * 24 * 3600)
  const maxComputeMs = Number(req.query.maxComputeMs ?? (process.env.VERCEL ? 9000 : 45000))

  try {
    const out = await buildIndustryMonthlyFlowSeasonality({
      years,
      topPerMonth: top,
      boardLimit,
      ttlSeconds,
      maxComputeMs,
    })
    res.status(200).json({ success: true, ...out })
  } catch (e: unknown) {
    res.status(502).json({
      success: false,
      error: 'Industry monthly flow seasonality unavailable (real data required)',
      detail: errorMessage(e),
    })
  }
})

router.get('/moneyflow/boards/rolling', async (req: Request, res: Response): Promise<void> => {
  const boardType = String(req.query.boardType ?? 'concept').trim().toLowerCase() === 'theme' ? 'theme' : 'concept'
  const days = Number(req.query.days ?? 14)
  const top = Number(req.query.top ?? 20)
  const boardLimit = Number(req.query.boardLimit ?? 200)
  const ttlSeconds = Number(req.query.ttlSeconds ?? 20 * 60)
  const maxComputeMs = Number(req.query.maxComputeMs ?? (process.env.VERCEL ? 8000 : 25000))

  try {
    const out = await buildBoardFlowRolling({
      boardType,
      days,
      top,
      boardLimit,
      ttlSeconds,
      maxComputeMs,
    })
    res.status(200).json({ success: true, ...out })
  } catch (e: unknown) {
    res.status(502).json({
      success: false,
      error: 'Board rolling moneyflow unavailable (real data required)',
      detail: errorMessage(e),
    })
  }
})

router.get('/boards/:boardCode/stocks', async (req: Request, res: Response): Promise<void> => {
  const boardCode = String(req.params.boardCode ?? '').trim()
  const top = Number(req.query.top ?? 200)
  const cappedTop = Number.isFinite(top) ? Math.max(1, Math.min(200, top)) : 200
  const cacheKey = `board_constituents_${boardCode}_top${cappedTop}.json`
  const cachePath = cacheFilePath(cacheKey)

  const cached = await readJsonCache<{ boardCode: string; items: unknown[] }>(cachePath, { ttlSeconds: 24 * 3600 })
  if (cached?.items?.length) {
    res.status(200).json({ success: true, ...cached, stale: false })
    return
  }
  try {
    const items = await getEastmoneyBoardConstituents({
      boardCode,
      top: cappedTop,
      timeoutMs: 15_000,
    })
    const payload = { boardCode, items }
    await writeJsonCache(cachePath, payload)
    res.status(200).json({ success: true, ...payload, stale: false })
  } catch (e: unknown) {
    const stale = await readJsonCache<{ boardCode: string; items: unknown[] }>(cachePath, { ttlSeconds: 365 * 24 * 3600 })
    if (stale?.items?.length) {
      res.status(200).json({ success: true, ...stale, stale: true, warning: errorMessage(e) })
      return
    }
    res.status(502).json({
      success: false,
      error: 'Board constituents unavailable (real data required)',
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

router.get('/:symbol/survey', async (req: Request, res: Response): Promise<void> => {
  const symbol = String(req.params.symbol ?? '').toUpperCase()
  const code = normalizeAshareCode(symbol)
  try {
    const out = await getEastmoneyCompanySurvey({ code, timeoutMs: 12_000 })
    res.status(200).json({ success: true, symbol: code, ...out })
  } catch (e: unknown) {
    res.status(502).json({
      success: false,
      error: 'Survey provider unavailable (real data required)',
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
        const [fin, cashflow, composition, ds] = await Promise.all([
          getEastmoneyFinancialSnapshot({ code, asOf }),
          getEastmoneyOperatingCashflow({ code, asOf }).catch(() => null),
          getEastmoneyRegionalComposition({ code, asOf }).catch(() => null),
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
            operatingCashflow: cashflow?.operatingCashflow,
            domesticRevenue: composition?.domesticRevenue,
            overseasRevenue: composition?.overseasRevenue,
            domesticRatio: composition?.domesticRatio,
            overseasRatio: composition?.overseasRatio,
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
      const lmt = Number.isFinite(limit) ? limit : 200
      const robust = await fetchKlineRobust({ code, klt, fqt, limit: lmt })

      res.status(200).json({
        success: true,
        symbol: code,
        name: robust.name,
        klt,
        fqt,
        candles: robust.candles,
        meta: { source: robust.sources.join('+') || 'none' },
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
  '/screener',
  async (req: Request, res: Response): Promise<void> => {
    const top = Number(req.query.top ?? 10)
    const maxCandidates = Number(req.query.maxCandidates ?? 600)

    const enabledRaw = String(req.query.enabled ?? '1,3,5')
    const enabled = enabledRaw
      .split(',')
      .map((x) => Number(String(x).trim()))
      .filter((x): x is 1 | 3 | 5 | 6 | 7 => x === 1 || x === 3 || x === 5 || x === 6 || x === 7)
    const enabledUniq = Array.from(new Set(enabled))

    const s1MaxMarketCapYi = Number(req.query.s1MaxMarketCapYi ?? 150)
    const s3LastDays = Number(req.query.s3LastDays ?? 5)
    const s3ChangePct = Number(req.query.s3ChangePct ?? 9.98)
    const s3VolumeMultiple = Number(req.query.s3VolumeMultiple ?? 2)
    const s5LookbackDays = Number(req.query.s5LookbackDays ?? 15)

    const kwRaw = String(req.query.s7Keywords ?? '').trim()
    const s7Keywords = kwRaw
      ? kwRaw
          .split(/[\n,，;；\s]+/)
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 30)
      : undefined

    const s7StrictRaw = String(req.query.s7Strict ?? '1').trim().toLowerCase()
    const s7Strict = s7StrictRaw === '1' || s7StrictRaw === 'true' || s7StrictRaw === 'yes'

    const anchorDateRaw = typeof req.query.anchorDate === 'string' ? req.query.anchorDate.trim() : ''
    const anchorDate = /^\d{4}-\d{2}-\d{2}$/.test(anchorDateRaw) ? anchorDateRaw : undefined

    try {
      const out = await screenStocks({
        klt: '101',
        fqt: '1',
        top: Number.isFinite(top) ? top : 10,
        maxCandidates: Number.isFinite(maxCandidates) ? maxCandidates : 600,
        anchorDate,
        enabled: enabledUniq.length ? (enabledUniq as Array<1 | 3 | 5 | 6 | 7>) : [1, 3, 5],
        s1MaxMarketCapYi: Number.isFinite(s1MaxMarketCapYi) ? s1MaxMarketCapYi : 150,
        s3LastDays: Number.isFinite(s3LastDays) ? s3LastDays : 5,
        s3ChangePct: Number.isFinite(s3ChangePct) ? s3ChangePct : 9.98,
        s3VolumeMultiple: Number.isFinite(s3VolumeMultiple) ? s3VolumeMultiple : 2,
        s5LookbackDays: Number.isFinite(s5LookbackDays) ? s5LookbackDays : 15,
        s7Keywords,
        s7Strict,
      })
      res.status(200).json({ success: true, ...out, meta: { ...out.meta, source: 'screener' } })
    } catch (e: unknown) {
      res.status(502).json({
        success: false,
        error: 'Screener unavailable (real data required)',
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
      .filter(
        (x): x is 1 | 2 | 3 | 4 | 5 | 6 | 7 =>
          x === 1 || x === 2 || x === 3 || x === 4 || x === 5 || x === 6 || x === 7,
      )
    const enabledUniq = Array.from(new Set(enabled))

    const s1MaxMarketCapYi = Number(req.query.s1MaxMarketCapYi ?? 150)
    const s2LastDays = Number(req.query.s2LastDays ?? 5)
    const s2TurnoverSpikeMultiple = Number(req.query.s2TurnoverSpikeMultiple ?? 2)
    const s2PreselectTop = Number(req.query.s2PreselectTop ?? 30)
    const s2MinSimilarity = Number(req.query.s2MinSimilarity ?? 0)
    const s3LastDays = Number(req.query.s3LastDays ?? 5)
    const s3ChangePct = Number(req.query.s3ChangePct ?? 9.98)
    const s3VolumeMultiple = Number(req.query.s3VolumeMultiple ?? 2)
    const s4MinOverlap = Number(req.query.s4MinOverlap ?? 1)
    const s5LookbackDays = Number(req.query.s5LookbackDays ?? 15)

    const kwRaw = String(req.query.s7Keywords ?? '').trim()
    const s7Keywords = kwRaw
      ? kwRaw
          .split(/[\n,，;；\s]+/)
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 30)
      : undefined

    const s7StrictRaw = String(req.query.s7Strict ?? '1').trim().toLowerCase()
    const s7Strict = s7StrictRaw === '1' || s7StrictRaw === 'true' || s7StrictRaw === 'yes'

    const anchorDateRaw = typeof req.query.anchorDate === 'string' ? req.query.anchorDate.trim() : ''
    const anchorDate = /^\d{4}-\d{2}-\d{2}$/.test(anchorDateRaw) ? anchorDateRaw : undefined

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
        anchorDate,
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
        s4MinOverlap: Number.isFinite(s4MinOverlap) ? s4MinOverlap : 1,
        s5LookbackDays: Number.isFinite(s5LookbackDays) ? s5LookbackDays : 15,
        s7Keywords,
        s7Strict,
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

// ── 生命线选股扫描 ──
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items]
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const item = queue.shift()!
      try {
        await fn(item)
      } catch {
        // 忽略单个错误
      }
    }
  })
  await Promise.all(workers)
}

router.get('/scan-lifeline', async (req: Request, res: Response): Promise<void> => {
  const maxCandidates = Number(req.query.maxCandidates ?? 1000)
  const maxScan = Number.isFinite(maxCandidates) && maxCandidates > 0 ? Math.min(maxCandidates, 1000) : 1000

  try {
    // 1. 获取全A股列表
    const ds = await getSinaSpotDataset({ ttlSeconds: 6 * 3600 })
    const allStocks = ds?.items ?? []

    if (!allStocks.length) {
      res.status(502).json({ success: false, error: 'Universe unavailable' })
      return
    }

    // 2. 涨跌幅初筛：0.1% ~ 7%，按涨幅排序取前N只
    const candidates = allStocks
      .map((s) => ({
        code: String(s.code ?? '').trim(),
        name: String(s.name ?? '').trim(),
        changepercent: Number(s.changepercent),
      }))
      .filter((s) => s.code && Number.isFinite(s.changepercent) && s.changepercent > 0)
      .sort((a, b) => b.changepercent - a.changepercent)
      .slice(0, maxScan)

    // 3. 返回候选列表（前端负责获取K线检测生命线）
    res.status(200).json({
      success: true,
      scanned: candidates.length,
      total_universe: allStocks.length,
      candidates,
      meta: {
        sources: 'sina_spot+kline(腾讯/东财多源)',
        galaxyBridge: galaxyBridgeUrl() ? 'connected' : 'offline(本地启动 scripts/galaxy_bridge.py 可增强)',
        mxAvailable: isMxAvailable(),
      },
    })
  } catch (e: unknown) {
    res.status(502).json({
      success: false,
      error: 'Scan failed',
      detail: process.env.NODE_ENV === 'development' ? errorMessage(e) : undefined,
    })
  }
})

router.get('/scan-ma', async (req: Request, res: Response): Promise<void> => {
  const maxScan = Number(req.query.maxScan ?? 80)
  const limit = Number.isFinite(maxScan) && maxScan > 0 ? Math.min(maxScan, 200) : 80
  const daysBack = Number(req.query.days ?? 60)

  try {
    // 1. 获取全A股列表（含市值）
    const ds = await getSinaSpotDataset({ ttlSeconds: 6 * 3600 })
    const allStocks = ds?.items ?? []

    if (!allStocks.length) {
      res.status(502).json({ success: false, error: 'Universe unavailable' })
      return
    }

    // 2. 按市值从小到大排序，取前 limit 只（小市值更容易"蛇吞象"）
    const candidates = allStocks
      .filter((s) => {
        const code = String(s.code ?? '').trim()
        const m = Number(s.mktcap)
        return code && Number.isFinite(m) && m > 0
      })
      .sort((a, b) => Number(a.mktcap) - Number(b.mktcap))
      .slice(0, limit)
      .map((s) => ({
        code: String(s.code).trim(),
        name: String(s.name ?? '').trim(),
        mktcapWan: Number(s.mktcap),
      }))

    // 3. 并发获取公告（5并发），筛选MNA
    const results: {
      code: string
      name: string
      mktcapYi: number
      netAssetsYi: number | null
      maCount: number
      latestMaTitle: string
      latestMaDate: string
    }[] = []

    const since = new Date()
    since.setUTCDate(since.getUTCDate() - (Number.isFinite(daysBack) ? daysBack : 60))

    await runWithConcurrency(candidates, 5, async (c) => {
      try {
        const events = await getEastmoneyAnnouncements({ code: c.code, pageSize: 15 })
        const maEvents = events.filter(
          (e) => e.eventType === 'MNA' && new Date(e.publishedAt) >= since,
        )
        if (maEvents.length === 0) return

        // 获取市值（元）和净资产
        const [quote, fin] = await Promise.all([
          getEastmoneyQuote({ code: c.code, timeoutMs: 8_000 }).catch(() => null),
          getEastmoneyFinancialSnapshot({ code: c.code, asOf: 'latest' }).catch(() => null),
        ])

        const mktcapYuan = quote?.marketCapYuan
        const netAssetsYuan =
          fin?.totalAssets && fin?.totalLiabilities
            ? fin.totalAssets - fin.totalLiabilities
            : null

        results.push({
          code: c.code,
          name: c.name,
          mktcapYi: mktcapYuan ? mktcapYuan / 100_000_000 : c.mktcapWan * 10_000 / 100_000_000,
          netAssetsYi: netAssetsYuan ? netAssetsYuan / 100_000_000 : null,
          maCount: maEvents.length,
          latestMaTitle: maEvents[0].title,
          latestMaDate: maEvents[0].publishedAt.slice(0, 10),
        })
      } catch {
        // ignore
      }
    })

    res.status(200).json({
      success: true,
      scanned: candidates.length,
      found: results.length,
      stocks: results,
    })
  } catch (e: unknown) {
    res.status(502).json({
      success: false,
      error: 'M&A scan failed',
      detail: process.env.NODE_ENV === 'development' ? errorMessage(e) : undefined,
    })
  }
})

/**
 * 妙想个股综合诊断：基本面+资金面+风险面 Markdown 报告
 * 与本地5阶段分析互补（妙想覆盖财务质量和风险，5阶段管技术择时）
 */
router.get('/mx/diagnosis', async (req: Request, res: Response): Promise<void> => {
  const symbol = String(req.query.symbol ?? '').trim()
  if (!symbol) {
    res.status(400).json({ success: false, error: 'Missing symbol' })
    return
  }
  if (!isMxAvailable()) {
    res.status(503).json({ success: false, error: '妙想数据源不可用（缺少 KIMI_API_KEY）' })
    return
  }
  try {
    const code = normalizeAshareCode(symbol)
    const out = await mxStockDiagnosis(`${code} 综合诊断`)
    if (!out) {
      res.status(502).json({ success: false, error: '妙想诊断失败' })
      return
    }
    res.status(200).json({ success: true, symbol: code, report: out.preview, source: 'dongcai_mx' })
  } catch (e: unknown) {
    res.status(502).json({
      success: false,
      error: '妙想诊断异常',
      detail: process.env.NODE_ENV === 'development' ? errorMessage(e) : undefined,
    })
  }
})

router.get('/:symbol/mx/main-force', async (req: Request, res: Response): Promise<void> => {
  const symbol = String(req.params.symbol ?? '').trim()
  const code = normalizeAshareCode(symbol)
  if (!code) {
    res.status(400).json({ success: false, error: 'Missing symbol' })
    return
  }
  if (!isMxAvailable()) {
    res.status(503).json({ success: false, error: '妙想数据源不可用（缺少 KIMI_API_KEY）' })
    return
  }

  const lookbackDays = Math.max(5, Math.min(20, Math.floor(Number(req.query.lookbackDays ?? 5) || 5)))
  const cachePath = cacheFilePath(`mx_main_force_v3_${code}_d${lookbackDays}.json`)
  const cached = await readJsonCache<{ symbol: string; lookbackDays: number; report: string; source: 'dongcai_mx' }>(cachePath, {
    ttlSeconds: 30 * 60,
  })
  if (cached?.report) {
    res.status(200).json({ success: true, ...cached })
    return
  }

  try {
    const [quote, kline] = await Promise.all([
      getEastmoneyQuote({ code, timeoutMs: 8_000 }).catch(() => null),
      fetchKlineRobust({
        code,
        klt: '101',
        fqt: '1',
        limit: Math.max(30, lookbackDays + 12),
      }).catch(() => ({ candles: [], sources: [] })),
    ])

    const candles = (kline.candles ?? []).filter((row) => Number.isFinite(row.close) && Number.isFinite(row.volume))
    const recent = candles.slice(-1 * lookbackDays)
    if (recent.length < lookbackDays) {
      res.status(502).json({ success: false, error: 'K线数据不足' })
      return
    }

    const avg = (vals: number[]): number => (vals.length ? vals.reduce((sum, v) => sum + v, 0) / vals.length : 0)
    const ma = (rows: Array<{ close: number }>, end: number, days: number): number => {
      const slice = rows.slice(Math.max(0, end - days + 1), end + 1)
      return avg(slice.map((row) => row.close))
    }
    const latest = recent[recent.length - 1]
    const prevDay = recent[recent.length - 2] ?? recent[0]
    const startClose = recent[0]?.close ?? latest.close
    const highestClose = Math.max(...recent.map((row) => row.close))
    const lowestLow = Math.min(...recent.map((row) => row.low))
    const drawdownPct = highestClose > 0 ? ((latest.close / highestClose) - 1) * 100 : 0
    const windowChangePct = startClose > 0 ? ((latest.close / startClose) - 1) * 100 : 0
    const positiveDays = recent.filter((row, idx) => idx > 0 && row.close > recent[idx - 1].close).length
    const latestMa5 = ma(candles, candles.length - 1, 5)
    const latestMa10 = ma(candles, candles.length - 1, 10)
    const prevMa5 = ma(candles, Math.max(0, candles.length - 2), 5)
    const avgVolume5 = avg(recent.slice(-5).map((row) => row.volume))
    const latestCloseVsMa5Pct = latestMa5 > 0 ? ((latest.close / latestMa5) - 1) * 100 : 0
    const latestCloseVsMa10Pct = latestMa10 > 0 ? ((latest.close / latestMa10) - 1) * 100 : 0
    const ma5SlopePct = prevMa5 > 0 ? ((latestMa5 / prevMa5) - 1) * 100 : 0
    const prevDayChangePct = prevDay.open > 0 ? ((prevDay.close / prevDay.open) - 1) * 100 : 0
    const prevDayRangePct = prevDay.open > 0 ? ((prevDay.high - prevDay.low) / prevDay.open) * 100 : 0
    const latestVsPrevClosePct = prevDay.close > 0 ? ((latest.close / prevDay.close) - 1) * 100 : 0
    const latestBodyPct = latest.open > 0 ? (Math.abs(latest.close - latest.open) / latest.open) * 100 : 0
    const latestRangePct = latest.open > 0 ? ((latest.high - latest.low) / latest.open) * 100 : 0
    const latestUpperShadowPct = latest.open > 0 ? ((latest.high - Math.max(latest.open, latest.close)) / latest.open) * 100 : 0
    const latestLowerShadowPct = latest.open > 0 ? ((Math.min(latest.open, latest.close) - latest.low) / latest.open) * 100 : 0
    const latestClosePositionPct = latest.high > latest.low ? ((latest.close - latest.low) / (latest.high - latest.low)) * 100 : 50
    const latestVolumeVsAvg5Pct = avgVolume5 > 0 ? ((latest.volume / avgVolume5) - 1) * 100 : 0
    const supportRef = Math.min(prevDay.low, latest.low)
    const resistanceRef = Math.max(prevDay.high, latest.high)
    const trendSummary = recent
      .slice(0, Math.max(0, recent.length - 1))
      .map((row) => `${row.ts}: O${row.open.toFixed(2)} H${row.high.toFixed(2)} L${row.low.toFixed(2)} C${row.close.toFixed(2)} V${row.volume}`)
      .join('; ')
    const candleSummary = recent
      .map((row) => `${row.ts}: O${row.open.toFixed(2)} H${row.high.toFixed(2)} L${row.low.toFixed(2)} C${row.close.toFixed(2)} V${row.volume}`)
      .join('; ')
    const name = quote?.name?.trim() || code

    const prompt = [
      `请只分析 A 股 ${code} ${name} 的“主力还在不在”。`,
      `请严格基于最近${lookbackDays}个交易日的日K技术面判断，不要使用资金流、消息面或盘口臆测。`,
      `请先概括前段走势，再重点分析前一个交易日与最新一日的日K细节，包括实体、上下影、量能、均线位置、支撑阻力与强弱变化，再判断主力还在不在，最后给后续操作建议。`,
      `最近${lookbackDays}日日K：${candleSummary}。`,
      `前段走势（不含最新一日）：${trendSummary || '无'}。`,
      `前一个交易日日K：${prevDay.ts}: O${prevDay.open.toFixed(2)} H${prevDay.high.toFixed(2)} L${prevDay.low.toFixed(2)} C${prevDay.close.toFixed(2)} V${prevDay.volume}，单日涨跌=${prevDayChangePct.toFixed(2)}%，振幅=${prevDayRangePct.toFixed(2)}%。`,
      `最新一日日K：${latest.ts}: O${latest.open.toFixed(2)} H${latest.high.toFixed(2)} L${latest.low.toFixed(2)} C${latest.close.toFixed(2)} V${latest.volume}，相对前收变化=${latestVsPrevClosePct.toFixed(2)}%，实体=${latestBodyPct.toFixed(2)}%，振幅=${latestRangePct.toFixed(2)}%，上影=${latestUpperShadowPct.toFixed(2)}%，下影=${latestLowerShadowPct.toFixed(2)}%，收盘位于当日区间=${latestClosePositionPct.toFixed(2)}%。`,
      `区间统计：区间涨跌幅=${windowChangePct.toFixed(2)}%，相对区间高点回撤=${drawdownPct.toFixed(2)}%，区间低点=${lowestLow.toFixed(2)}，近${lookbackDays}日上涨天数=${positiveDays}/${Math.max(1, lookbackDays - 1)}。`,
      `均线与量能：收盘相对MA5=${latestCloseVsMa5Pct.toFixed(2)}%，收盘相对MA10=${latestCloseVsMa10Pct.toFixed(2)}%，MA5斜率=${ma5SlopePct.toFixed(2)}%，最新量能相对近5日均量=${latestVolumeVsAvg5Pct.toFixed(2)}%。`,
      `关键价位：短线支撑参考=${supportRef.toFixed(2)}，短线压力参考=${resistanceRef.toFixed(2)}。`,
      '如果前段趋势仍完整、前一交易日只是强势整理或缩量回踩、最新一日能重新站回关键均线并守住支撑，可判断为主力还在；如果前一交易日已经明显转弱、破位或放量走坏，且最新一日不能修复结构，则判断为主力转弱或主力离场。',
      '输出格式固定为7行：',
      '1. 结论：主力还在/主力转弱/主力离场',
      '2. 前段走势：用1句话概括最近一段是上升、震荡整理还是转弱',
      '3. 前一日K线：用1句话说明前一个交易日的实体、影线和量能对主力是否还在意味着什么',
      '4. 最新一日K线：用1句话说明最新一日是修复、确认转弱还是诱多/试盘，并点出量价配合',
      '5. 结构依据：用1-2句解释当前结构、均线、回撤、支撑阻力和强弱变化',
      '6. 关键价位：给出1句，明确短线支撑和压力分别看哪里',
      '7. 操作建议：给出简洁建议，如继续观察/等站回均线/跌破止损/不追高，并补一句风险提示',
    ].join('\n')

    const out = await mxStockDiagnosis(prompt)
    if (!out?.preview) {
      res.status(502).json({ success: false, error: '妙想主力解读失败' })
      return
    }

    const payload = {
      symbol: code,
      lookbackDays,
      report: out.preview,
      source: 'dongcai_mx' as const,
    }
    await writeJsonCache(cachePath, payload)
    res.status(200).json({ success: true, ...payload })
  } catch (e: unknown) {
    res.status(502).json({
      success: false,
      error: '妙想主力解读异常',
      detail: process.env.NODE_ENV === 'development' ? errorMessage(e) : undefined,
    })
  }
})

router.get('/:symbol/mx/intraday', async (req: Request, res: Response): Promise<void> => {
  const symbol = String(req.params.symbol ?? '').trim()
  const code = normalizeAshareCode(symbol)
  if (!code) {
    res.status(400).json({ success: false, error: 'Missing symbol' })
    return
  }
  if (!isMxAvailable()) {
    res.status(503).json({ success: false, error: '妙想数据源不可用（缺少 KIMI_API_KEY）' })
    return
  }

  const cachePath = cacheFilePath(`mx_intraday_v1_${code}.json`)
  const cached = await readJsonCache<{ symbol: string; report: string; source: 'dongcai_mx_intraday' }>(cachePath, {
    ttlSeconds: 10 * 60,
  })
  if (cached?.report) {
    res.status(200).json({ success: true, ...cached })
    return
  }

  try {
    const [quote, trend] = await Promise.all([
      getEastmoneyQuote({ code, timeoutMs: 8_000 }).catch(() => null),
      getEastmoneyTrend({ code, ndays: 1, timeoutMs: 12_000 }).catch(() => ({ bars: [], source: '' })),
    ])

    const bars = (trend.bars ?? []).filter((row) => Number.isFinite(row.close) && Number.isFinite(row.volume))
    if (bars.length < 30) {
      res.status(502).json({ success: false, error: '分时数据不足' })
      return
    }

    const avg = (vals: number[]): number => (vals.length ? vals.reduce((sum, v) => sum + v, 0) / vals.length : 0)
    const hhmm = (ts: string): string => {
      const m = String(ts).match(/(\d{2}:\d{2})$/)
      return m ? m[1] : String(ts)
    }
    const findMaxBy = <T,>(items: T[], pick: (item: T) => number): T | null => {
      let best: T | null = null
      let bestVal = Number.NEGATIVE_INFINITY
      for (const item of items) {
        const v = pick(item)
        if (Number.isFinite(v) && v > bestVal) {
          best = item
          bestVal = v
        }
      }
      return best
    }
    const findMinBy = <T,>(items: T[], pick: (item: T) => number): T | null => {
      let best: T | null = null
      let bestVal = Number.POSITIVE_INFINITY
      for (const item of items) {
        const v = pick(item)
        if (Number.isFinite(v) && v < bestVal) {
          best = item
          bestVal = v
        }
      }
      return best
    }

    const name = quote?.name?.trim() || code
    const openBar = bars[0]
    const lastBar = bars[bars.length - 1]
    const morningBars = bars.filter((row) => hhmm(row.ts) <= '11:30')
    const afternoonBars = bars.filter((row) => hhmm(row.ts) >= '13:00')
    const afterTwoBars = bars.filter((row) => hhmm(row.ts) >= '14:00')
    const morningHighBar = findMaxBy(morningBars.length ? morningBars : bars, (row) => row.high) ?? lastBar
    const dayHighBar = findMaxBy(bars, (row) => row.high) ?? lastBar
    const dayLowBar = findMinBy(bars, (row) => row.low) ?? openBar
    const maxVolBar = findMaxBy(bars, (row) => row.volume) ?? lastBar
    const maxVolAfterTwoBar = findMaxBy(afterTwoBars.length ? afterTwoBars : afternoonBars, (row) => row.volume)
    const noonOpenBar = afternoonBars[0] ?? lastBar
    const closeAvgPrice = lastBar.avgPrice ?? avg(bars.map((row) => row.close))
    const closeVsAvgPct = closeAvgPrice > 0 ? ((lastBar.close / closeAvgPrice) - 1) * 100 : 0
    const morningAboveAvgCount = morningBars.filter((row) => (row.avgPrice ?? row.close) <= row.close).length
    const afternoonAboveAvgCount = afternoonBars.filter((row) => (row.avgPrice ?? row.close) <= row.close).length
    const morningAboveAvgPct = morningBars.length ? (morningAboveAvgCount / morningBars.length) * 100 : 0
    const afternoonAboveAvgPct = afternoonBars.length ? (afternoonAboveAvgCount / afternoonBars.length) * 100 : 0
    const openToHighPct = openBar.open > 0 ? ((dayHighBar.high / openBar.open) - 1) * 100 : 0
    const highToClosePct = dayHighBar.high > 0 ? ((lastBar.close / dayHighBar.high) - 1) * 100 : 0
    const noonToClosePct = noonOpenBar.close > 0 ? ((lastBar.close / noonOpenBar.close) - 1) * 100 : 0
    const openToClosePct = openBar.open > 0 ? ((lastBar.close / openBar.open) - 1) * 100 : 0
    const avgVolumeMorning = avg(morningBars.map((row) => row.volume))
    const avgVolumeAfternoon = avg(afternoonBars.map((row) => row.volume))
    const last30Bars = bars.slice(-30)
    const timelineSummary = bars
      .map((row) => `${hhmm(row.ts)} C${row.close.toFixed(2)} A${(row.avgPrice ?? row.close).toFixed(2)} V${Math.round(row.volume)}`)
      .join('; ')
    const last30Summary = last30Bars
      .map((row) => `${hhmm(row.ts)} C${row.close.toFixed(2)} A${(row.avgPrice ?? row.close).toFixed(2)} V${Math.round(row.volume)}`)
      .join('; ')

    const prompt = [
      `请只分析 A 股 ${code} ${name} 当天的1分钟分时图，不要掺入消息面、财务面和主观臆测。`,
      '请像短线复盘一样，先从分时里拆出最重要的3个细节，再合起来定性，最后给下一交易日剧本和风控位。',
      `开盘到收盘关键统计：开盘=${openBar.open.toFixed(2)}，收盘=${lastBar.close.toFixed(2)}，全天涨跌=${openToClosePct.toFixed(2)}%，全天最高=${dayHighBar.high.toFixed(2)}@${hhmm(dayHighBar.ts)}，全天最低=${dayLowBar.low.toFixed(2)}@${hhmm(dayLowBar.ts)}。`,
      `冲高回落结构：开盘到高点涨幅=${openToHighPct.toFixed(2)}%，高点回落到收盘=${highToClosePct.toFixed(2)}%，午后首根价格=${noonOpenBar.close.toFixed(2)}，午后到收盘变化=${noonToClosePct.toFixed(2)}%。`,
      `均价线与强弱：收盘相对全天均价=${closeVsAvgPct.toFixed(2)}%，上午在均价线上方分钟占比=${morningAboveAvgPct.toFixed(2)}%，下午在均价线上方分钟占比=${afternoonAboveAvgPct.toFixed(2)}%。`,
      `量能结构：全天最大分钟量=${Math.round(maxVolBar.volume)}@${hhmm(maxVolBar.ts)}，14:00后最大分钟量=${Math.round(maxVolAfterTwoBar?.volume ?? 0)}@${maxVolAfterTwoBar ? hhmm(maxVolAfterTwoBar.ts) : '无'}，上午均量=${Math.round(avgVolumeMorning)}，下午均量=${Math.round(avgVolumeAfternoon)}。`,
      `上午高点细节：${hhmm(morningHighBar.ts)} 触及 ${morningHighBar.high.toFixed(2)}，该分钟收=${morningHighBar.close.toFixed(2)}，均价=${(morningHighBar.avgPrice ?? morningHighBar.close).toFixed(2)}。`,
      `全天分时序列：${timelineSummary}。`,
      `尾盘30分钟序列：${last30Summary}。`,
      '输出格式固定为6行：',
      '1. 分时结论：1句话判断是试盘、承接、兑现、出货、回封失败还是转强确认',
      '2. 细节1：抓最关键的第一次试盘/冲高/回落细节，点出具体时间和价位',
      '3. 细节2：抓量能最大的关键分钟或14点后的动作，说明是承接还是兑现',
      '4. 细节3：结合均价线和尾盘，说明全天筹码主动性偏买还是偏卖',
      '5. 明日剧本：给出强、弱两种剧本，明确什么走势算确认转强，什么走势算继续走弱',
      '6. 关键价位与风控：给出短线支撑、压力、失效位和一句风险提示',
    ].join('\n')

    const out = await mxStockDiagnosis(prompt)
    if (!out?.preview) {
      res.status(502).json({ success: false, error: '妙想分时解读失败' })
      return
    }

    const payload = {
      symbol: code,
      report: out.preview,
      source: 'dongcai_mx_intraday' as const,
    }
    await writeJsonCache(cachePath, payload)
    res.status(200).json({ success: true, ...payload })
  } catch (e: unknown) {
    res.status(502).json({
      success: false,
      error: '妙想分时解读异常',
      detail: process.env.NODE_ENV === 'development' ? errorMessage(e) : undefined,
    })
  }
})

/**
 * 妙想智能选股：自然语言条件筛选（与5阶段技术筛选互补，做基本面预筛）
 */
router.get('/mx/screen', async (req: Request, res: Response): Promise<void> => {
  const query = String(req.query.q ?? '').trim()
  if (!query) {
    res.status(400).json({ success: false, error: 'Missing q' })
    return
  }
  if (!isMxAvailable()) {
    res.status(503).json({ success: false, error: '妙想数据源不可用（缺少 KIMI_API_KEY）' })
    return
  }
  try {
    const out = await mxScreenStocks(query)
    if (!out) {
      res.status(502).json({ success: false, error: '妙想选股失败' })
      return
    }
    res.status(200).json({ success: true, query, result: out.preview, source: 'dongcai_mx' })
  } catch (e: unknown) {
    res.status(502).json({
      success: false,
      error: '妙想选股异常',
      detail: process.env.NODE_ENV === 'development' ? errorMessage(e) : undefined,
    })
  }
})

export default router
