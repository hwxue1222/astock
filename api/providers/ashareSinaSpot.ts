import fs from 'node:fs/promises'
import path from 'node:path'
import { fetchJson } from './http.js'
import { cacheFilePath, readJsonCache, writeJsonCache } from './fsCache.js'

export interface SinaSpotRow {
  symbol?: string
  code?: string
  name?: string
  mktcap?: number
  changepercent?: number
}

export interface SinaSpotDataset {
  ts?: number
  items?: SinaSpotRow[]
}

function defaultExternalCachePath(): string {
  return path.resolve(process.cwd(), '..', 'scripts', 'ashare', '_cache', 'ashare_spot_sina.json')
}

function internalCachePath(): string {
  return cacheFilePath('ashare_spot_sina.json')
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p)
    return true
  } catch {
    return false
  }
}

async function loadDatasetFromDisk(): Promise<SinaSpotDataset | null> {
  const fromEnv = process.env.ASHARE_SINA_CACHE_PATH
  if (fromEnv && (await fileExists(fromEnv))) {
    const raw = await fs.readFile(fromEnv, 'utf-8')
    return JSON.parse(raw) as SinaSpotDataset
  }

  const ext = defaultExternalCachePath()
  if (await fileExists(ext)) {
    const raw = await fs.readFile(ext, 'utf-8')
    return JSON.parse(raw) as SinaSpotDataset
  }

  const internal = internalCachePath()
  if (await fileExists(internal)) {
    const raw = await fs.readFile(internal, 'utf-8')
    return JSON.parse(raw) as SinaSpotDataset
  }

  return null
}

async function fetchFullDatasetFromNetwork(): Promise<SinaSpotDataset> {
  const base =
    'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData'

  const pageSize = 200
  const maxPages = 80
  const items: SinaSpotRow[] = []
  const seen = new Set<string>()

  for (let pn = 1; pn <= maxPages; pn += 1) {
    const q = new URLSearchParams()
    q.set('page', String(pn))
    q.set('num', String(pageSize))
    q.set('sort', 'symbol')
    q.set('asc', '1')
    q.set('node', 'hs_a')
    const url = `${base}?${q.toString()}`

    const rows = await fetchJson<unknown>(url, {
      timeoutMs: 20_000,
      headers: { referer: 'https://vip.stock.finance.sina.com.cn' },
    })

    if (!Array.isArray(rows) || rows.length === 0) break

    let newCount = 0
    for (const r of rows) {
      if (!r || typeof r !== 'object') continue
      const row = r as Record<string, unknown>
      const code = String(row.code ?? '').trim()
      if (!code) continue
      if (seen.has(code)) continue
      seen.add(code)
      items.push({
        symbol: typeof row.symbol === 'string' ? row.symbol : undefined,
        code,
        name: typeof row.name === 'string' ? row.name : undefined,
        mktcap: typeof row.mktcap === 'number' ? row.mktcap : undefined,
        changepercent: typeof row.changepercent === 'number' ? row.changepercent : undefined,
      })
      newCount += 1
    }

    if (newCount === 0) break
  }

  return { ts: Math.floor(Date.now() / 1000), items }
}

let mem: { loadedAtMs: number; dataset: SinaSpotDataset } | null = null

export async function getSinaSpotDataset(input?: {
  preferNetwork?: boolean
  ttlSeconds?: number
}): Promise<SinaSpotDataset | null> {
  const ttlSeconds = input?.ttlSeconds ?? 3600
  if (mem) {
    const age = (Date.now() - mem.loadedAtMs) / 1000
    if (age <= ttlSeconds) return mem.dataset
  }

  const disk = await loadDatasetFromDisk()
  if (disk?.items?.length) {
    const ts = typeof disk.ts === 'number' ? disk.ts : 0
    const ageSeconds = ts > 0 ? Date.now() / 1000 - ts : Infinity
    if (ageSeconds <= ttlSeconds) {
      mem = { loadedAtMs: Date.now(), dataset: disk }
      return disk
    }
  }

  if (input?.preferNetwork === false) return null

  const cached = await readJsonCache<SinaSpotDataset>(internalCachePath(), { ttlSeconds })
  if (cached?.items?.length) {
    mem = { loadedAtMs: Date.now(), dataset: cached }
    return cached
  }

  try {
    const fetched = await fetchFullDatasetFromNetwork()
    await writeJsonCache(internalCachePath(), fetched)
    mem = { loadedAtMs: Date.now(), dataset: fetched }
    return fetched
  } catch {
    return null
  }
}

export function pickMarketCapYuanFromDataset(
  dataset: SinaSpotDataset,
  code: string,
): number | undefined {
  const items = dataset.items ?? []
  for (const it of items) {
    if (String(it.code ?? '').trim() === code) {
      const raw = it.mktcap
      if (!Number.isFinite(raw as number)) return undefined
      const v = Number(raw)
      return v * 10_000
    }
  }
  return undefined
}
