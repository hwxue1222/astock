/**
 * 多数据源适配层
 *
 * 统一调度：腾讯 / 东方财富 / 新浪 / 同花顺 / 妙想 / 银河星耀数智(本地)
 * 策略：主源优先 + 失败自动降级 + 字段级互补合并
 */
import { getTencentKline } from './tencentKline.js'
import { getEastmoneyKline, type KlineCandle } from './eastmoneyKline.js'
import { getEastmoneyFinancialSnapshot } from './eastmoneyDatacenter.js'
import { getSinaSpotDataset } from './ashareSinaSpot.js'
import { isMxAvailable, mxFinanceData } from './dongcaiMx.js'

export interface RobustKlineResult {
  candles: KlineCandle[]
  name?: string
  sources: string[]
}

export interface RobustFinancial {
  asOfDate: string
  totalAssets?: number
  totalLiabilities?: number
  cash?: number
  revenue?: number
  sources: string[]
}

/**
 * 本地银河星耀数智 bridge（可选）
 * 本地运行 galaxy_bridge.py 后设置 GALAXY_BRIDGE_URL=http://localhost:8601
 * Vercel 环境无此服务，自动跳过
 */
export function galaxyBridgeUrl(): string | null {
  const u = (process.env.GALAXY_BRIDGE_URL ?? '').trim()
  return u || null
}

interface GalaxyKlineResp {
  candles?: { ts: string; open: number; close: number; high: number; low: number; volume: number }[]
}

async function fetchGalaxyBridgeKline(code: string, limit: number): Promise<KlineCandle[] | null> {
  const base = galaxyBridgeUrl()
  if (!base) return null
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 15_000)
    const resp = await fetch(
      `${base.replace(/\/$/, '')}/kline?code=${encodeURIComponent(code)}&limit=${limit}`,
      { signal: ctrl.signal },
    )
    clearTimeout(t)
    if (!resp.ok) return null
    const data = (await resp.json()) as GalaxyKlineResp
    if (!data.candles?.length) return null
    return data.candles
  } catch {
    return null
  }
}

/**
 * 多源K线：腾讯(主) + 东财(补成交额/换手率) + 银河bridge(本地补充)
 */
export async function fetchKlineRobust(input: {
  code: string
  klt: '101' | '102' | '103'
  fqt: '0' | '1' | '2'
  limit: number
}): Promise<RobustKlineResult> {
  const period = input.klt === '103' ? 'month' : input.klt === '102' ? 'week' : 'day'
  const adjust = input.fqt === '1' ? 'qfq' : 'none'
  const sources: string[] = []

  const [tencent, east, galaxy] = await Promise.all([
    getTencentKline({ code: input.code, period, adjust, limit: input.limit }),
    getEastmoneyKline({ code: input.code, klt: input.klt, fqt: input.fqt, limit: input.limit }).catch(() => null),
    fetchGalaxyBridgeKline(input.code, input.limit),
  ])

  if (tencent.candles.length) sources.push(tencent.source)
  if (east?.candles?.length) sources.push(east.source)
  if (galaxy?.length) sources.push('galaxy')

  // 主源无数据：依次降级
  if (!tencent.candles.length) {
    if (east?.candles?.length) {
      return { candles: east.candles, name: east.name, sources }
    }
    if (galaxy?.length) {
      return { candles: galaxy, sources }
    }
    return { candles: [], sources }
  }

  // 字段级互补：东财提供 amount/turnover，银河补充缺失交易日的 volume 校验
  const emByTs = new Map<string, { amount?: number; turnover?: number }>()
  for (const c of east?.candles ?? []) {
    emByTs.set(c.ts, { amount: c.amount, turnover: c.turnover })
  }

  const candles = tencent.candles.map((c) => {
    const extra = emByTs.get(c.ts)
    return { ...c, amount: extra?.amount, turnover: extra?.turnover }
  })

  return { candles, name: east?.name, sources }
}

/**
 * 多源财务快照：东财 datacenter(主) + 妙想(补充失败字段)
 */
export async function fetchFinancialRobust(input: {
  code: string
  asOf: 'latest' | 'previous'
}): Promise<RobustFinancial> {
  const sources: string[] = []
  const fin = await getEastmoneyFinancialSnapshot(input).catch(() => null)
  if (fin) sources.push('eastmoney_datacenter')

  // 东财失败或关键字段缺失 → 妙想补充
  const needMx = !fin || (fin.totalAssets === undefined && fin.revenue === undefined)
  let mxAsOfDate: string | undefined
  if (needMx && isMxAvailable()) {
    const q = `${input.code} 最新一期${input.asOf === 'previous' ? '上一期' : ''}总资产、总负债、货币资金、营业总收入`
    const mx = await mxFinanceData(q).catch(() => null)
    if (mx?.preview) {
      sources.push('dongcai_mx')
      mxAsOfDate = '妙想'
    }
  }

  return {
    asOfDate: fin?.asOfDate ?? mxAsOfDate ?? new Date().toISOString().slice(0, 10),
    totalAssets: fin?.totalAssets,
    totalLiabilities: fin?.totalLiabilities,
    cash: fin?.cash,
    revenue: fin?.revenue,
    sources,
  }
}

export interface RobustQuoteItem {
  symbol: string
  name?: string
  price?: number
  changepercent?: number
  marketCapYuan?: number
  pb?: number
  sources: string[]
}

/**
 * 多源批量行情：东财 quote(逐只主源) + 新浪 spot(批量补充)
 */
export async function mergeQuoteWithSina<T extends { symbol: string }>(
  items: T[],
): Promise<(T & { sinaChangepercent?: number; sinaPb?: number })[]> {
  try {
    const ds = await getSinaSpotDataset({ ttlSeconds: 6 * 3600 })
    const byCode = new Map<string, { changepercent?: number; pb?: number }>()
    for (const it of ds?.items ?? []) {
      const code = String((it as { code?: string }).code ?? '').trim()
      if (code) {
        byCode.set(code, {
          changepercent: Number((it as { changepercent?: number }).changepercent),
          pb: Number((it as { pb?: number }).pb),
        })
      }
    }
    return items.map((it) => {
      const sina = byCode.get(it.symbol)
      return {
        ...it,
        sinaChangepercent: Number.isFinite(sina?.changepercent) ? sina?.changepercent : undefined,
        sinaPb: Number.isFinite(sina?.pb) && sina!.pb! > 0 ? sina?.pb : undefined,
      }
    })
  } catch {
    return items.map((it) => ({ ...it, sinaChangepercent: undefined, sinaPb: undefined }))
  }
}
