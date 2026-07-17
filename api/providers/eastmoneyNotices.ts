import type { EventType, MajorEvent } from '../domain/types.js'
import { fetchJson } from './http.js'

interface EastmoneyNoticeItem {
  art_code?: string
  title?: string
  title_ch?: string
  notice_date?: string
  display_time?: string
}

interface EastmoneyNoticesResponse {
  data?: {
    list?: EastmoneyNoticeItem[]
  }
}

function pickTitle(it: EastmoneyNoticeItem): string {
  const t = String(it.title_ch ?? it.title ?? '').trim()
  return t || '公告'
}

function pickPublishedAt(it: EastmoneyNoticeItem): string {
  const raw = String(it.display_time ?? it.notice_date ?? '').trim()
  if (!raw) return new Date().toISOString()
  const normalized = raw.replace(/\.(\d+)$/, '')
  const s = normalized.replace(/\//g, '-').replace(' ', 'T')
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) return d.toISOString()
  const d2 = new Date(normalized)
  return Number.isNaN(d2.getTime()) ? new Date().toISOString() : d2.toISOString()
}

function classify(title: string): EventType {
  const t = title
  if (/问询|监管|处罚|立案|调查|警示|通报|责令|整改/.test(t)) return 'REGULATORY'
  if (/停标|暂停投标|禁止投标|投标资格|黑名单|拉黑|失信/.test(t)) return 'REGULATORY'
  if (/诉讼|仲裁|起诉|判决|执行|索赔/.test(t)) return 'LITIGATION'
  if (/年报|季报|中报|业绩|快报|预告|财务报告|审计/.test(t)) return 'EARNINGS'
  if (/并购|重组|收购|合并|资产置换|重大资产/.test(t)) return 'MNA'
  if (/停牌|复牌|暂停上市|终止上市/.test(t)) return 'SUSPEND_RESUME'
  if (/债|违约|展期|逾期|兑付|回售|担保|质押违约/.test(t)) return 'DEBT_DEFAULT'
  return 'OTHER'
}

export async function getEastmoneyAnnouncements(input: {
  code: string
  pageSize: number
}): Promise<MajorEvent[]> {
  const pageSize = Math.max(10, Math.min(60, input.pageSize))

  async function fetchOnce(size: number): Promise<EastmoneyNoticesResponse> {
    const q = new URLSearchParams()
    q.set('sr', '-1')
    q.set('page_size', String(size))
    q.set('page_index', '1')
    q.set('ann_type', 'A')
    q.set('client_source', 'web')
    q.set('stock_list', input.code)
    const url = `https://np-anotice-stock.eastmoney.com/api/security/ann?${q.toString()}`
    return await fetchJson<EastmoneyNoticesResponse>(url, {
      timeoutMs: 25_000,
      headers: { referer: 'https://data.eastmoney.com/' },
    })
  }

  let payload: EastmoneyNoticesResponse
  try {
    payload = await fetchOnce(pageSize)
  } catch {
    payload = await fetchOnce(Math.min(20, pageSize))
  }

  const list = payload.data?.list ?? []
  const events: MajorEvent[] = list
    .map((it): MajorEvent | null => {
      const id = String(it.art_code ?? '').trim()
      if (!id) return null
      const title = pickTitle(it)
      const publishedAt = pickPublishedAt(it)
      const eventType = classify(title)
      const sourceUrl = `https://data.eastmoney.com/notices/detail/${input.code}/${id}.html`
      return {
        id,
        symbol: input.code,
        title,
        summary: undefined,
        sourceName: 'Eastmoney Notice',
        sourceUrl,
        publishedAt,
        eventType,
      }
    })
    .filter((x): x is MajorEvent => Boolean(x))

  events.sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt))
  return events
}
