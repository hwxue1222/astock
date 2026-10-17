import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { fetchJson } from './http.js'

const execFileAsync = promisify(execFile)

export interface TrendCandle {
  ts: string
  open: number
  close: number
  high: number
  low: number
  volume: number
  amount?: number
  avgPrice?: number
}

interface EastmoneyTrendResponse {
  data?: {
    name?: string
    market?: number
    trends?: string[]
  }
}

function secidForAshare(code: string): string {
  const c = String(code ?? '').trim()
  if (c.startsWith('6') || c.startsWith('688')) return `1.${c}`
  return `0.${c}`
}

function parseTrendRow(row: string): TrendCandle | null {
  const parts = String(row).split(',')
  if (parts.length < 8) return null
  const ts = String(parts[0] ?? '').trim()
  const open = Number(parts[1])
  const close = Number(parts[2])
  const high = Number(parts[3])
  const low = Number(parts[4])
  const volume = Number(parts[5])
  const amount = Number(parts[6])
  const avgPrice = Number(parts[7])
  if (!ts || !Number.isFinite(open) || !Number.isFinite(close)) return null
  return {
    ts,
    open,
    close,
    high: Number.isFinite(high) ? high : Math.max(open, close),
    low: Number.isFinite(low) ? low : Math.min(open, close),
    volume: Number.isFinite(volume) ? volume : 0,
    amount: Number.isFinite(amount) ? amount : undefined,
    avgPrice: Number.isFinite(avgPrice) ? avgPrice : undefined,
  }
}

export async function getEastmoneyTrend(input: {
  code: string
  ndays?: number
  timeoutMs?: number
}): Promise<{ code: string; name?: string; bars: TrendCandle[]; source: string }> {
  const secid = secidForAshare(input.code)
  const q = new URLSearchParams()
  q.set('fields1', 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13')
  q.set('fields2', 'f51,f52,f53,f54,f55,f56,f57,f58')
  q.set('secid', secid)
  q.set('ndays', String(Math.max(1, Math.min(5, Number(input.ndays ?? 1) || 1))))
  q.set('iscr', '0')

  const url = `https://push2.eastmoney.com/api/qt/stock/trends2/get?${q.toString()}`
  try {
    const payload = await fetchJson<EastmoneyTrendResponse>(url, {
      timeoutMs: input.timeoutMs ?? 20_000,
      headers: { referer: 'https://quote.eastmoney.com' },
    })
    const rows = payload.data?.trends ?? []
    const bars = rows.map(parseTrendRow).filter((x): x is TrendCandle => Boolean(x))
    if (bars.length) {
      return {
        code: input.code,
        name: payload.data?.name,
        bars,
        source: 'eastmoney_trends2',
      }
    }
  } catch {
    // fall through
  }

  const allow = String(process.env.ALLOW_PYTHON_PROVIDER ?? '1').toLowerCase()
  if (!(allow === '1' || allow === 'true' || allow === 'yes')) {
    throw new Error('HTTP provider failed and python provider disabled')
  }

  const scriptsDir = path.resolve(process.cwd(), '..', 'scripts')
  const code = [
    'import json,sys',
    'from pathlib import Path',
    'scripts_dir = sys.argv[1]',
    'sys.path.insert(0, scripts_dir)',
    'from ashare.eastmoney import fetch_trends_1m',
    'stock_code = sys.argv[2]',
    'ndays = int(sys.argv[3])',
    'out = fetch_trends_1m(stock_code, ndays=ndays)',
    'print(json.dumps(out, ensure_ascii=False))',
  ].join('\n')

  const out = await execFileAsync('python3', ['-c', code, scriptsDir, input.code, String(input.ndays ?? 1)], {
    maxBuffer: 10 * 1024 * 1024,
  })
  const raw = String(out.stdout || '').trim()
  const parsed = JSON.parse(raw || 'null') as { name?: string; candles?: Array<Record<string, unknown>> } | null
  if (!parsed?.candles?.length) {
    throw new Error(`Python provider returned empty trend result: ${raw.slice(0, 120)}`)
  }

  const bars = parsed.candles
    .map((row): TrendCandle | null => {
      const ts = String(row.ts ?? '')
      const open = Number(row.open)
      const close = Number(row.close)
      const high = Number(row.high)
      const low = Number(row.low)
      const volume = Number(row.volume)
      const amount = Number(row.amount)
      const avgPrice = Number(row.avg_price)
      if (!ts || !Number.isFinite(open) || !Number.isFinite(close)) return null
      return {
        ts,
        open,
        close,
        high: Number.isFinite(high) ? high : Math.max(open, close),
        low: Number.isFinite(low) ? low : Math.min(open, close),
        volume: Number.isFinite(volume) ? volume : 0,
        amount: Number.isFinite(amount) ? amount : undefined,
        avgPrice: Number.isFinite(avgPrice) ? avgPrice : undefined,
      }
    })
    .filter((x): x is TrendCandle => Boolean(x))

  return {
    code: input.code,
    name: parsed.name,
    bars,
    source: 'python_ashare_eastmoney_trends',
  }
}
