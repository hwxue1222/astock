import { fetchText } from './http.js'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type TencentKlinePeriod = 'day' | 'week' | 'month'
export type TencentAdjust = 'qfq' | 'none'

export interface TencentCandle {
  ts: string
  open: number
  close: number
  high: number
  low: number
  volume: number
}

type TencentPayload = {
  code?: number
  data?: Record<
    string,
    {
      day?: string[][]
      week?: string[][]
      month?: string[][]
      qfqday?: string[][]
      qfqweek?: string[][]
      qfqmonth?: string[][]
    }
  >
}

function symbolForAshare(code: string): string {
  const c = String(code ?? '').trim()
  if (c.startsWith('6') || c.startsWith('688')) return `sh${c}`
  if (c.startsWith('0') || c.startsWith('3')) return `sz${c}`
  if (c.startsWith('92') || c.startsWith('83') || c.startsWith('43')) return `bj${c}`
  return `sh${c}`
}

function parseRow(row: string[]): TencentCandle | null {
  if (!row || row.length < 6) return null
  const ts = String(row[0] ?? '')
  const open = Number(row[1])
  const close = Number(row[2])
  const high = Number(row[3])
  const low = Number(row[4])
  const volume = Number(row[5])
  if (!ts || !Number.isFinite(open) || !Number.isFinite(close)) return null
  return {
    ts,
    open,
    close,
    high: Number.isFinite(high) ? high : Math.max(open, close),
    low: Number.isFinite(low) ? low : Math.min(open, close),
    volume: Number.isFinite(volume) ? volume : 0,
  }
}

export async function getTencentKline(input: {
  code: string
  period: TencentKlinePeriod
  adjust: TencentAdjust
  limit: number
}): Promise<{ code: string; candles: TencentCandle[]; source: string }> {
  const symbol = symbolForAshare(input.code)
  const limit = Math.max(20, Math.min(800, input.limit))
  const adjust = input.adjust === 'qfq' ? 'qfq' : 'none'
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},${input.period},,,${limit},${adjust}`

  const headers = { referer: 'https://gu.qq.com' }
  const text = await fetchText(url, { timeoutMs: 25_000, headers }).catch(() => '')
  let payload: TencentPayload | null = null
  const trimmed = text.trim()
  if (trimmed && !trimmed.startsWith('<')) {
    try {
      payload = JSON.parse(trimmed) as TencentPayload
    } catch {
      payload = null
    }
  }

  if (!payload) {
    const args = ['-L', '--max-time', '25', '-H', 'user-agent: Mozilla/5.0', '-H', 'referer: https://gu.qq.com', url]
    const out = await execFileAsync('curl', args, { maxBuffer: 10 * 1024 * 1024 })
    const t = String(out.stdout || '').trim()
    if (!t || t.startsWith('<')) throw new Error('Tencent kline returned non-JSON response')
    payload = JSON.parse(t) as TencentPayload
  }

  const data = payload.data?.[symbol]
  const key = `${adjust === 'qfq' ? 'qfq' : ''}${input.period}` as
    | 'day'
    | 'week'
    | 'month'
    | 'qfqday'
    | 'qfqweek'
    | 'qfqmonth'

  const rows = (data?.[key] ?? []) as string[][]
  const candles = rows.map(parseRow).filter((x): x is TencentCandle => Boolean(x))
  candles.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0))
  return {
    code: input.code,
    candles,
    source: 'tencent_fqkline',
  }
}
