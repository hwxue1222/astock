import { fetchJson } from './http.js'

type EastmoneyClistResponse = {
  data?: {
    diff?: Array<Record<string, unknown>>
  }
}

export type EastmoneyBoard = {
  code: string
  name: string
}

export type EastmoneyBoardConstituent = {
  symbol: string
  name?: string
  marketCapYuan?: number
}

function normalizeBk(code: string): string {
  const s = String(code ?? '').trim().toUpperCase()
  if (!s) return ''
  const m = s.match(/BK\d{4}/)
  return m ? m[0] : s
}

export async function getEastmoneyIndustryBoards(input?: {
  timeoutMs?: number
}): Promise<EastmoneyBoard[]> {
  const q = new URLSearchParams()
  q.set('pn', '1')
  q.set('pz', '500')
  q.set('po', '1')
  q.set('np', '1')
  q.set('fltt', '2')
  q.set('invt', '2')
  q.set('fid', 'f62')
  q.set('fs', 'm:90+t:1')
  q.set('fields', 'f12,f14')
  q.set('ut', 'bd1d9ddb04089700cf9c27f6f7426281')
  const url = `https://push2.eastmoney.com/api/qt/clist/get?${q.toString()}`

  const payload = await fetchJson<EastmoneyClistResponse>(url, {
    timeoutMs: input?.timeoutMs ?? 12_000,
    headers: { referer: 'https://quote.eastmoney.com' },
  })

  const diff = payload.data?.diff ?? []
  const out: EastmoneyBoard[] = []
  for (const it of diff) {
    const code = normalizeBk(String(it.f12 ?? ''))
    const name = String(it.f14 ?? '').trim()
    if (!/^BK\d{4}$/.test(code) || !name) continue
    out.push({ code, name })
  }
  return out
}

export async function getEastmoneyBoardConstituents(input: {
  boardCode: string
  top: number
  timeoutMs?: number
}): Promise<EastmoneyBoardConstituent[]> {
  const board = normalizeBk(input.boardCode)
  if (!/^BK\d{4}$/.test(board)) return []

  const q = new URLSearchParams()
  q.set('pn', '1')
  q.set('pz', String(Math.max(1, Math.min(200, input.top))))
  q.set('po', '1')
  q.set('np', '1')
  q.set('fltt', '2')
  q.set('invt', '2')
  q.set('fid', 'f20')
  q.set('fs', `b:${board}`)
  q.set('fields', 'f12,f14,f20')
  q.set('ut', 'bd1d9ddb04089700cf9c27f6f7426281')
  const url = `https://push2.eastmoney.com/api/qt/clist/get?${q.toString()}`

  const payload = await fetchJson<EastmoneyClistResponse>(url, {
    timeoutMs: input.timeoutMs ?? 12_000,
    headers: { referer: 'https://quote.eastmoney.com' },
  })
  const diff = payload.data?.diff ?? []
  const out: EastmoneyBoardConstituent[] = []
  for (const it of diff) {
    const symbol = String(it.f12 ?? '').trim()
    if (!/^\d{6}$/.test(symbol)) continue
    const name = typeof it.f14 === 'string' ? it.f14.trim() : undefined
    const mc = Number(it.f20)
    out.push({ symbol, name, marketCapYuan: Number.isFinite(mc) ? mc : undefined })
  }
  out.sort((a, b) => (b.marketCapYuan ?? 0) - (a.marketCapYuan ?? 0))
  return out.slice(0, Math.max(1, Math.min(200, input.top)))
}

type EastmoneyFflowDayKlineResponse = {
  data?: {
    code?: string
    name?: string
    klines?: string[]
  }
}

export type EastmoneyBoardFlowDaily = {
  date: string
  mainNetInflowYuan: number
}

function parseFloatSafe(x: string): number {
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}

export async function getEastmoneyBoardFlowDayKline(input: {
  boardCode: string
  limit: number
  timeoutMs?: number
}): Promise<{ boardCode: string; boardName?: string; rows: EastmoneyBoardFlowDaily[] }>{
  const board = normalizeBk(input.boardCode)
  if (!/^BK\d{4}$/.test(board)) return { boardCode: board, rows: [] }

  const lmt = Math.max(20, Math.min(100000, Math.trunc(input.limit)))
  const q = new URLSearchParams()
  q.set('lmt', String(lmt))
  q.set('klt', '101')
  q.set('secid', `90.${board}`)
  q.set('fields1', 'f1,f2,f3,f7')
  q.set('fields2', 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65')
  q.set('ut', 'bd1d9ddb04089700cf9c27f6f7426281')
  q.set('invt', '2')
  const url = `https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?${q.toString()}`

  const payload = await fetchJson<EastmoneyFflowDayKlineResponse>(url, {
    timeoutMs: input.timeoutMs ?? 15_000,
    headers: { referer: 'https://quote.eastmoney.com' },
  })

  const klines = payload.data?.klines ?? []
  const rows: EastmoneyBoardFlowDaily[] = []
  for (const line of klines) {
    const parts = String(line ?? '').split(',')
    if (parts.length < 3) continue
    const date = String(parts[0] ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const main = parseFloatSafe(String(parts[1] ?? '0'))
    rows.push({ date, mainNetInflowYuan: main })
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return { boardCode: board, boardName: payload.data?.name, rows }
}

