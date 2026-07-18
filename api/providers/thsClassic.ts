import path from 'node:path'
import { readJsonCache, writeJsonCache } from './fsCache.js'

async function fetchHtmlDecoded(url: string, input?: { timeoutMs?: number; headers?: Record<string, string> }): Promise<string> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), input?.timeoutMs ?? 12_000)
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        'user-agent': 'Mozilla/5.0',
        ...(input?.headers ?? {}),
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const ab = await res.arrayBuffer()
    const buf = Buffer.from(ab)
    const head = buf.subarray(0, Math.min(buf.length, 4096)).toString('latin1')
    const ct = res.headers.get('content-type') || ''
    const charsetMatch = `${ct};${head}`.match(/charset\s*=\s*([a-zA-Z0-9_-]+)/i)
    const charset = charsetMatch ? charsetMatch[1].toLowerCase() : ''

    const tryDecoders = [] as Array<{ name: string; dec: TextDecoder }>
    const utf8 = new TextDecoder('utf-8', { fatal: false })
    const gb = new TextDecoder('gb18030', { fatal: false })

    if (charset.includes('gb')) {
      tryDecoders.push({ name: 'gb18030', dec: gb }, { name: 'utf-8', dec: utf8 })
    } else {
      tryDecoders.push({ name: 'utf-8', dec: utf8 }, { name: 'gb18030', dec: gb })
    }

    let best = ''
    let bestScore = -1
    for (const d of tryDecoders) {
      const s = d.dec.decode(buf)
      const bad = (s.match(/\uFFFD/g) ?? []).length
      const score = -bad
      if (score > bestScore) {
        bestScore = score
        best = s
      }
    }

    return best
  } finally {
    clearTimeout(t)
  }
}

export type ThsClassicStatItem = {
  rank: 1 | 2 | 3
  title: string
  timeText: string
  url?: string
  articleTimeText?: string | null
  articleSourceText?: string | null
}

export type ThsClassicStats = {
  sourceName: '同花顺 classic'
  sourceUrl: string
  articleTimeText: string | null
  articleSourceText: string | null
  fetchedAtISO: string
  items: ThsClassicStatItem[]
}

function stripTags(s: string): string {
  return String(s)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeUrl(href: string, base: string): string {
  const h = String(href ?? '').trim()
  if (!h) return ''
  if (h.startsWith('http://') || h.startsWith('https://')) return h
  if (h.startsWith('//')) return `https:${h}`
  if (h.startsWith('/')) return `${base.replace(/\/$/, '')}${h}`
  return `${base.replace(/\/$/, '')}/${h}`
}

function pickSection(html: string): string {
  const key = '今日点击排行'
  const idx = html.indexOf(key)
  if (idx < 0) return html
  return html.slice(idx, Math.min(html.length, idx + 80_000))
}

function parseClassic(html: string): Omit<ThsClassicStats, 'fetchedAtISO'> {
  const sourceUrl = 'https://www.10jqka.com.cn/classic/'
  const text = String(html ?? '')
  const plain = stripTags(text)

  const metaMatch = plain.match(
    /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s*来源[：:]\s*(\S{2,40})/,
  )
  const articleTimeText = metaMatch ? metaMatch[1] : null
  const articleSourceText = metaMatch ? metaMatch[2].trim() : null

  const section = pickSection(text)
  const liMatches = section.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) ?? []
  const items: ThsClassicStatItem[] = []

  for (const li of liMatches) {
    if (items.length >= 3) break
    const timeMatch = li.match(/\b(\d{1,2}:\d{2})\b/)
    const timeText = timeMatch ? timeMatch[1] : ''
    if (!timeText) continue

    const aMatch = li.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
    const href = aMatch ? aMatch[1] : ''
    const aText = aMatch ? aMatch[2] : ''

    let title = stripTags(aText || li)
    title = title.replace(/\b\d{1,2}:\d{2}\b/g, '').trim()
    title = title.replace(/^\d+\s*/, '').trim()
    if (!title) continue

    items.push({
      rank: (items.length + 1) as 1 | 2 | 3,
      title,
      timeText,
      url: href ? normalizeUrl(href, 'https://www.10jqka.com.cn') : undefined,
    })
  }

  return {
    sourceName: '同花顺 classic',
    sourceUrl,
    articleTimeText,
    articleSourceText,
    items,
  }
}

async function enrichItemMeta(items: ThsClassicStatItem[], timeoutMs: number): Promise<void> {
  for (const it of items) {
    const url = it.url
    if (!url) continue
    try {
      const html = await fetchHtmlDecoded(url, {
        timeoutMs,
        headers: {
          referer: 'https://www.10jqka.com.cn/classic/',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.6',
        },
      })
      const plain = stripTags(html)
      const metaMatch = plain.match(
        /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s*来源[：:]\s*(\S{2,40})/,
      )
      it.articleTimeText = metaMatch ? metaMatch[1] : null
      it.articleSourceText = metaMatch ? metaMatch[2].trim() : null
    } catch {
      it.articleTimeText = null
      it.articleSourceText = null
    }
  }
}

export async function getThsClassicStats(input?: {
  ttlSeconds?: number
  timeoutMs?: number
}): Promise<ThsClassicStats> {
  const cachePath = path.join(process.cwd(), '.cache', 'ths_classic_stats.json')
  const ttlSeconds = input?.ttlSeconds ?? 5 * 60
  const cached = await readJsonCache<ThsClassicStats>(cachePath, { ttlSeconds })
  if (cached?.items?.length) return cached

  let html = ''
  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      html = await fetchHtmlDecoded('https://www.10jqka.com.cn/classic/', {
        timeoutMs: input?.timeoutMs ?? 12_000,
        headers: {
          referer: 'https://www.10jqka.com.cn/',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.6',
        },
      })
      break
    } catch (e) {
      lastError = e
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)))
    }
  }

  if (!html) {
    const stale = await readJsonCache<ThsClassicStats>(cachePath, { ttlSeconds: 7 * 24 * 3600 })
    if (stale?.items?.length) return stale
    throw lastError
  }

  const parsed = parseClassic(html)
  if (parsed.items.length) {
    await enrichItemMeta(parsed.items, Math.max(6_000, Math.floor((input?.timeoutMs ?? 12_000) * 0.8)))
  }
  const out: ThsClassicStats = { ...parsed, fetchedAtISO: new Date().toISOString() }
  if (out.items.length) await writeJsonCache(cachePath, out)
  return out
}
