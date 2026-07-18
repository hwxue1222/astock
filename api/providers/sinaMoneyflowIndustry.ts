import { cacheFilePath, readJsonCache, writeJsonCache } from './fsCache.js'
import { fetchJson } from './http.js'

export type SinaIndustryMoneyflowItem = {
  name: string
  avgPrice: number
  changePct: number
  inflowWan: number
  outflowWan: number
  netInflowWan: number
  netInflowRate: number
  leadingSymbol?: string
  leadingName?: string
}

type SinaMoneyflowRow = {
  name?: string
  avg_price?: string
  avg_changeratio?: string
  inamount?: string
  outamount?: string
  netamount?: string
  ratioamount?: string
  ts_symbol?: string
  ts_name?: string
}

export async function getSinaIndustryMoneyflow(input?: {
  ttlSeconds?: number
  fenlei?: 0 | 1
  limit?: number
  timeoutMs?: number
}): Promise<SinaIndustryMoneyflowItem[]> {
  const ttlSeconds = Math.max(10, Math.min(3600, input?.ttlSeconds ?? 120))
  const fenlei = input?.fenlei ?? 0
  const limit = Math.max(5, Math.min(100, input?.limit ?? 30))

  const cachePath = cacheFilePath(`sina_moneyflow_industry_${fenlei}.json`)
  const cached = await readJsonCache<SinaIndustryMoneyflowItem[]>(cachePath, { ttlSeconds })
  if (cached?.length) return cached.slice(0, limit)

  const url = `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/MoneyFlow.ssl_bkzj_bk?fenlei=${fenlei}`
  const rows = await fetchJson<SinaMoneyflowRow[]>(url, {
    timeoutMs: input?.timeoutMs ?? 12_000,
    headers: { referer: 'https://vip.stock.finance.sina.com.cn/moneyflow/' },
  })

  const items = (Array.isArray(rows) ? rows : [])
    .map((r): SinaIndustryMoneyflowItem | null => {
      const name = typeof r.name === 'string' ? r.name.trim() : ''
      const avgPrice = Number(r.avg_price)
      const changePct = Number(r.avg_changeratio) * 100
      const inflowWan = Number(r.inamount) / 10_000
      const outflowWan = Number(r.outamount) / 10_000
      const netInflowWan = Number(r.netamount) / 10_000
      const netInflowRate = Number(r.ratioamount) * 100
      if (!name) return null
      if (![avgPrice, changePct, inflowWan, outflowWan, netInflowWan, netInflowRate].every(Number.isFinite)) return null
      return {
        name,
        avgPrice,
        changePct,
        inflowWan,
        outflowWan,
        netInflowWan,
        netInflowRate,
        leadingSymbol: typeof r.ts_symbol === 'string' ? r.ts_symbol.trim() : undefined,
        leadingName: typeof r.ts_name === 'string' ? r.ts_name.trim() : undefined,
      }
    })
    .filter((x): x is SinaIndustryMoneyflowItem => x !== null)

  await writeJsonCache(cachePath, items)
  return items.slice(0, limit)
}

