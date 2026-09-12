import { cacheFilePath, readJsonCache, writeJsonCache } from './fsCache.js'
import { fetchJson } from './http.js'

export type SinaMarketCenterRow = {
  symbol?: string
  code?: string
  name?: string
  mktcap?: number
  nmc?: number
  changepercent?: number
}

export async function getSinaMarketCenterNode(input: {
  node: string
  pn?: number
  pz?: number
  sort?: string
  asc?: 0 | 1
  ttlSeconds?: number
  timeoutMs?: number
}): Promise<SinaMarketCenterRow[]> {
  const node = String(input.node ?? '').trim()
  if (!node) return []
  const pn = Math.max(1, Math.min(50, input.pn ?? 1))
  const pz = Math.max(5, Math.min(200, input.pz ?? 200))
  const sort = String(input.sort ?? '').trim() || 'nmc'
  const asc = input.asc === 1 ? 1 : 0
  const ttlSeconds = Math.max(30, Math.min(24 * 3600, input.ttlSeconds ?? 6 * 3600))

  const cachePath = cacheFilePath(`sina_market_center_${encodeURIComponent(node)}_${pn}_${pz}_${sort}_${asc}.json`)
  const cached = await readJsonCache<SinaMarketCenterRow[]>(cachePath, { ttlSeconds })
  if (cached?.length) return cached

  const q = new URLSearchParams()
  q.set('num', String(pz))
  q.set('page', String(pn))
  q.set('node', node)
  q.set('sort', sort)
  q.set('asc', String(asc))

  const url = `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?${q.toString()}`
  const rows = await fetchJson<SinaMarketCenterRow[]>(url, {
    timeoutMs: input.timeoutMs ?? 12_000,
    headers: { referer: 'https://vip.stock.finance.sina.com.cn/' },
  })
  const out = Array.isArray(rows) ? rows : []
  await writeJsonCache(cachePath, out)
  return out
}

