import { fetchJson } from './http.js'
import type { MajorEvent } from '../domain/types.js'

type EastmoneyF10NewsItem = {
  uniqueUrl?: string
  url?: string
  title?: string
  source?: string | null
  showDateTime?: number
  summary?: string
}

type EastmoneyF10NewsResponse = {
  gszx?: {
    code?: number
    message?: string
    data?: {
      items?: EastmoneyF10NewsItem[]
    }
  }
}

function emCode(symbol: string): string {
  const code = String(symbol ?? '').trim()
  if (code.startsWith('6') || code.startsWith('688')) return `SH${code}`
  return `SZ${code}`
}

function toIsoFromMs(ms: number | undefined): string | null {
  if (!ms || !Number.isFinite(ms)) return null
  try {
    return new Date(ms).toISOString()
  } catch {
    return null
  }
}

export async function getEastmoneyF10News(input: {
  code: string
  limit: number
}): Promise<MajorEvent[]> {
  const limit = Math.max(5, Math.min(50, input.limit))
  const url = `https://emweb.securities.eastmoney.com/PC_HSF10/NewsBulletin/PageAjax?code=${encodeURIComponent(
    emCode(input.code),
  )}`

  const payload = await fetchJson<EastmoneyF10NewsResponse>(url, {
    timeoutMs: 25_000,
    headers: { referer: 'https://emweb.securities.eastmoney.com/' },
  })

  const items = payload.gszx?.data?.items ?? []

  return items.slice(0, limit).map((it) => {
    const ts = toIsoFromMs(it.showDateTime)
    const title = String(it.title ?? '').trim()
    const link = String(it.url ?? it.uniqueUrl ?? '').trim() || undefined

    const suffix = link ? link.split('/').pop() : ''
    const sid = suffix ? suffix.replace(/[^0-9A-Za-z_-]/g, '') : ''

    return {
      id: `news_${input.code}_${sid || title}`,
      symbol: input.code,
      title: title || '新闻',
      summary: it.summary ? String(it.summary).trim() : undefined,
      sourceName: it.source ? String(it.source) : '东方财富-个股资讯',
      sourceUrl: link,
      publishedAt: ts ?? new Date().toISOString(),
      eventType: 'OTHER',
    }
  })
}
