import { cacheFilePath, readJsonCache, writeJsonCache } from './fsCache.js'
import { getEastmoneyClist } from './eastmoneyClist.js'

export type UniverseStock = {
  symbol: string
  name: string
  exchange?: 'SH' | 'SZ' | 'BJ'
}

type UniverseDataset = {
  ts: number
  items: UniverseStock[]
}

function exchangeForCode(code: string): UniverseStock['exchange'] | undefined {
  const c = String(code).trim()
  if (c.startsWith('6')) return 'SH'
  if (c.startsWith('0') || c.startsWith('3')) return 'SZ'
  if (c.startsWith('8') || c.startsWith('4') || c.startsWith('9')) return 'BJ'
  return undefined
}

export async function getAshareUniverseFromEastmoney(input?: {
  ttlSeconds?: number
  timeoutMs?: number
}): Promise<UniverseDataset> {
  const ttlSeconds = input?.ttlSeconds ?? 6 * 3600
  const timeoutMs = input?.timeoutMs ?? 12_000

  const cachePath = cacheFilePath('ashare_universe_eastmoney.json')
  const cached = await readJsonCache<UniverseDataset>(cachePath, { ttlSeconds })
  if (cached?.items?.length) return cached

  const pageSize = 200
  const first = await getEastmoneyClist({
    page: 1,
    pageSize,
    sort: 'mktcap_desc',
    timeoutMs,
  })

  const total = Number.isFinite(first.total) ? first.total : 0
  const pages = total > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 35
  const maxPages = Math.min(Math.max(1, pages), 60)

  const byCode = new Map<string, UniverseStock>()
  for (const it of first.items) {
    byCode.set(it.code, {
      symbol: it.code,
      name: it.name,
      exchange: exchangeForCode(it.code),
    })
  }

  for (let p = 2; p <= maxPages; p += 1) {
    const out = await getEastmoneyClist({
      page: p,
      pageSize,
      sort: 'mktcap_desc',
      timeoutMs,
    })
    for (const it of out.items) {
      if (!byCode.has(it.code)) {
        byCode.set(it.code, {
          symbol: it.code,
          name: it.name,
          exchange: exchangeForCode(it.code),
        })
      }
    }
  }

  const items = Array.from(byCode.values()).filter((x) => x.symbol && x.name)
  const ds: UniverseDataset = { ts: Math.floor(Date.now() / 1000), items }
  if (items.length) await writeJsonCache(cachePath, ds)
  return ds
}

