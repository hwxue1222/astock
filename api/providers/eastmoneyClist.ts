import path from 'node:path'
import { readJsonCache, writeJsonCache } from './fsCache.js'
import { fetchJson, fetchText } from './http.js'

export type EastmoneyClistItem = {
  code: string
  name: string
  marketCapYuan: number
  pctChg?: number
}

type EastmoneyClistResponse = {
  data?: {
    diff?: Array<{ f12?: string; f14?: string; f20?: number; f3?: number }>
    total?: number
  }
}

function parseLooseJson<T>(text: string): T {
  const s = String(text ?? '')
  const i = s.indexOf('{')
  const j = s.lastIndexOf('}')
  if (i < 0 || j < 0 || j <= i) throw new Error('Invalid JSON payload')
  const raw = s.slice(i, j + 1)
  return JSON.parse(raw) as T
}

const ASHARE_FS = 'm:0+t:6,m:0+t:13,m:1+t:2,m:1+t:23'

export async function getEastmoneyClist(input: {
  page: number
  pageSize: number
  sort: 'mktcap_desc' | 'mktcap_asc' | 'pctchg_desc'
  timeoutMs?: number
}): Promise<{ total: number; items: EastmoneyClistItem[] }> {
  const pn = Math.max(1, Math.min(200, input.page))
  const pz = Math.max(5, Math.min(200, input.pageSize))
  const po = input.sort === 'mktcap_asc' ? 0 : 1
  const fid = input.sort === 'pctchg_desc' ? 'f3' : 'f20'

  const cachePath = path.join(process.cwd(), '.cache', `eastmoney_clist_${input.sort}_${pn}_${pz}.json`)
  const cached = await readJsonCache<{ total: number; items: EastmoneyClistItem[] }>(cachePath, {
    ttlSeconds: 10 * 60,
  })
  if (cached?.items?.length) return cached

  const q = new URLSearchParams()
  q.set('pn', String(pn))
  q.set('pz', String(pz))
  q.set('po', String(po))
  q.set('np', '1')
  q.set('fltt', '2')
  q.set('invt', '2')
  q.set('fid', fid)
  q.set('fs', ASHARE_FS)
  q.set('fields', 'f12,f14,f20,f3')
  q.set('ut', 'bd1d9ddb04089700cf9c27f6f7426281')

  const url = `https://push2.eastmoney.com/api/qt/clist/get?${q.toString()}`
  let payload: EastmoneyClistResponse | null = null
  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      payload = await fetchJson<EastmoneyClistResponse>(url, {
        timeoutMs: input.timeoutMs ?? 12_000,
        headers: { referer: 'https://quote.eastmoney.com' },
      })
      break
    } catch (e) {
      lastError = e
      try {
        const text = await fetchText(`https://r.jina.ai/${url}`, {
          timeoutMs: input.timeoutMs ?? 12_000,
          headers: { accept: 'text/plain,*/*;q=0.8' },
        })
        payload = parseLooseJson<EastmoneyClistResponse>(text)
        break
      } catch {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)))
      }
    }
  }

  if (!payload) {
    const stale = await readJsonCache<{ total: number; items: EastmoneyClistItem[] }>(cachePath, {
      ttlSeconds: 7 * 24 * 3600,
    })
    if (stale?.items?.length) return stale
    throw lastError
  }

  const total = typeof payload.data?.total === 'number' ? payload.data.total : 0
  const diff = payload.data?.diff ?? []
  const items = diff
    .map((x) => ({
      code: String(x.f12 ?? '').trim(),
      name: String(x.f14 ?? '').trim(),
      marketCapYuan: typeof x.f20 === 'number' ? x.f20 : NaN,
      pctChg: typeof x.f3 === 'number' ? x.f3 : undefined,
    }))
    .filter((x) => /^\d{6}$/.test(x.code) && x.name && Number.isFinite(x.marketCapYuan) && x.marketCapYuan > 0)

  const out = { total, items }
  if (items.length) await writeJsonCache(cachePath, out)
  return out
}
