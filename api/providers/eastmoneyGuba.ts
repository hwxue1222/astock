import path from 'node:path'
import { cacheFilePath, readJsonCache, writeJsonCache } from './fsCache.js'
import { fetchText } from './http.js'

export type GubaPost = {
  id: string
  title: string
  url: string
  publishedAt: string
  readCount: number | null
  replyCount: number | null
}

function decodeHtml(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, d) => {
      const n = Number(d)
      if (!Number.isFinite(n)) return ''
      try {
        return String.fromCodePoint(n)
      } catch {
        return ''
      }
    })
}

function absUrl(href: string): string {
  const h = String(href ?? '').trim()
  if (h.startsWith('//')) return `https:${h}`
  if (h.startsWith('/')) return `https://guba.eastmoney.com${h}`
  return h
}

function toIsoFromMmddHm(s: string, now = new Date()): string {
  const m = String(s).trim().match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/)
  if (!m) return now.toISOString()
  const mm = Number(m[1])
  const dd = Number(m[2])
  const hh = Number(m[3])
  const mi = Number(m[4])

  const y = now.getUTCFullYear()
  const dt = new Date(Date.UTC(y, mm - 1, dd, hh, mi, 0))
  if (dt.getTime() > now.getTime() + 24 * 3600 * 1000) {
    dt.setUTCFullYear(y - 1)
  }
  return dt.toISOString()
}

export async function getEastmoneyGubaPosts(input: {
  code: string
  limit: number
  pages?: number
  ttlSeconds?: number
}): Promise<GubaPost[]> {
  const limit = Math.max(10, Math.min(60, input.limit))
  const pages = Math.max(1, Math.min(3, input.pages ?? 2))
  const ttlSeconds = Math.max(10, Math.min(3600, input.ttlSeconds ?? 180))

  const cachePath = cacheFilePath(`guba_${input.code}.json`)
  const cached = await readJsonCache<GubaPost[]>(cachePath, { ttlSeconds })
  if (cached?.length) return cached.slice(0, limit)

  const urls = Array.from({ length: pages }, (_, i) => {
    const page = i + 1
    return page === 1
      ? `https://guba.eastmoney.com/list,${encodeURIComponent(input.code)},f.html`
      : `https://guba.eastmoney.com/list,${encodeURIComponent(input.code)},f_${page}.html`
  })

  const htmls = await Promise.all(
    urls.map((url) =>
      fetchText(url, {
        timeoutMs: 25_000,
        headers: { referer: 'https://guba.eastmoney.com/' },
      }).catch(() => ''),
    ),
  )

  const rowRe =
    /<tr class="listitem">[\s\S]*?<div class="read">([^<]*)<\/div>[\s\S]*?<div class="reply">([^<]*)<\/div>[\s\S]*?<div class="title"><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<div class="update">([^<]+)<\/div>[\s\S]*?<\/tr>/g

  const out: GubaPost[] = []
  const now = new Date()
  for (const html of htmls) {
    if (!html) continue
    for (const m of html.matchAll(rowRe)) {
      const readCount = (() => {
        const s = String(m[1] ?? '').trim()
        const n = Number(s)
        return Number.isFinite(n) ? n : null
      })()
      const replyCount = (() => {
        const s = String(m[2] ?? '').trim()
        const n = Number(s)
        return Number.isFinite(n) ? n : null
      })()

      const href = absUrl(m[3])
      const rawTitle = decodeHtml(String(m[4] ?? '').replace(/<[^>]+>/g, '')).trim()
      const publishedAt = toIsoFromMmddHm(m[5], now)
    if (!href || !rawTitle) continue

      const id = (() => {
        const mm = href.match(/,(\d+)\.html$/)
        return mm ? `guba_${input.code}_${mm[1]}` : `guba_${input.code}_${rawTitle.slice(0, 16)}`
      })()

      out.push({ id, title: rawTitle, url: href, publishedAt, readCount, replyCount })
      if (out.length >= limit * 3) break
    }
  }

  const uniq = new Map<string, GubaPost>()
  for (const p of out) {
    if (!uniq.has(p.id)) uniq.set(p.id, p)
  }
  const merged = Array.from(uniq.values()).sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
  await writeJsonCache(cachePath, merged)
  return merged.slice(0, limit)
}
