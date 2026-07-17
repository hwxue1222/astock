import { fetchJson } from './http.js'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'

const execFileAsync = promisify(execFile)

export type KlineKlt = '101' | '102' | '103'
export type KlineFqt = '0' | '1' | '2'

export interface KlineCandle {
  ts: string
  open: number
  close: number
  high: number
  low: number
  volume: number
  amount?: number
  pctChg?: number
  chg?: number
  turnover?: number
}

interface EastmoneyKlineResponse {
  data?: {
    name?: string
    market?: number
    klines?: string[]
  }
}

function secidForAshare(code: string): string {
  const c = String(code ?? '').trim()
  if (c.startsWith('6') || c.startsWith('688')) return `1.${c}`
  return `0.${c}`
}

function parseRow(row: string): KlineCandle | null {
  const parts = String(row).split(',')
  if (parts.length < 6) return null
  const ts = parts[0]
  const open = Number(parts[1])
  const close = Number(parts[2])
  const high = Number(parts[3])
  const low = Number(parts[4])
  const volume = Number(parts[5])
  if (!ts || !Number.isFinite(open) || !Number.isFinite(close)) return null
  const amount = parts[6] !== undefined ? Number(parts[6]) : undefined
  const pctChg = parts[8] !== undefined ? Number(parts[8]) : undefined
  const chg = parts[9] !== undefined ? Number(parts[9]) : undefined
  const turnover = parts[10] !== undefined ? Number(parts[10]) : undefined
  return {
    ts,
    open,
    close,
    high,
    low,
    volume: Number.isFinite(volume) ? volume : 0,
    amount: Number.isFinite(amount as number) ? (amount as number) : undefined,
    pctChg: Number.isFinite(pctChg as number) ? (pctChg as number) : undefined,
    chg: Number.isFinite(chg as number) ? (chg as number) : undefined,
    turnover: Number.isFinite(turnover as number) ? (turnover as number) : undefined,
  }
}

export async function getEastmoneyKline(input: {
  code: string
  klt: KlineKlt
  fqt: KlineFqt
  limit: number
}): Promise<{ code: string; name?: string; candles: KlineCandle[]; source: string }> {
  const secid = secidForAshare(input.code)
  const q = new URLSearchParams()
  q.set('secid', secid)
  q.set('fields1', 'f1,f2,f3,f4,f5,f6')
  q.set('fields2', 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61')
  q.set('klt', input.klt)
  q.set('fqt', input.fqt)
  q.set('end', '20500101')
  q.set('lmt', String(Math.max(20, Math.min(800, input.limit))))

  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?${q.toString()}`
  try {
    const payload = await fetchJson<EastmoneyKlineResponse>(url, {
      timeoutMs: 25_000,
      headers: { referer: 'https://quote.eastmoney.com' },
    })

    const rows = payload.data?.klines ?? []
    const candles = rows.map(parseRow).filter((x): x is KlineCandle => Boolean(x))
    if (candles.length) {
      return {
        code: input.code,
        name: payload.data?.name,
        candles,
        source: 'eastmoney_push2his_kline',
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
    'from ashare.eastmoney import fetch_kline',
    'stock_code = sys.argv[2]',
    'klt = sys.argv[3]',
    'fqt = sys.argv[4]',
    'limit = int(sys.argv[5])',
    'out = fetch_kline(stock_code, klt=klt, fqt=fqt, limit=limit)',
    'print(json.dumps(out, ensure_ascii=False))',
  ].join('\n')

  let parsed: unknown = null
  let lastStdout = ''
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const out = await execFileAsync(
      'python3',
      ['-c', code, scriptsDir, input.code, input.klt, input.fqt, String(input.limit)],
      { maxBuffer: 10 * 1024 * 1024 },
    )
    lastStdout = String(out.stdout || '').trim()
    try {
      parsed = JSON.parse(lastStdout || 'null')
    } catch {
      parsed = null
    }
    if (parsed && typeof parsed === 'object') break
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Python provider returned empty result: ${lastStdout.slice(0, 120)}`)
  }

  const parsedObj = parsed as {
    name?: string
    candles?: Array<Record<string, unknown>>
  }
  const candles = (parsedObj.candles ?? [])
    .map((c): KlineCandle | null => {
      const ts = String(c.ts ?? '')
      const open = Number(c.open)
      const close = Number(c.close)
      const high = Number(c.high)
      const low = Number(c.low)
      const volume = Number(c.volume)
      if (!ts || !Number.isFinite(open) || !Number.isFinite(close)) return null
      return {
        ts,
        open,
        close,
        high: Number.isFinite(high) ? high : Math.max(open, close),
        low: Number.isFinite(low) ? low : Math.min(open, close),
        volume: Number.isFinite(volume) ? volume : 0,
        amount: typeof c.amount === 'number' ? (c.amount as number) : undefined,
        pctChg: typeof c.pct_chg === 'number' ? (c.pct_chg as number) : undefined,
        chg: typeof c.chg === 'number' ? (c.chg as number) : undefined,
        turnover: typeof c.turnover === 'number' ? (c.turnover as number) : undefined,
      }
    })
    .filter((x): x is KlineCandle => Boolean(x))

  return {
    code: input.code,
    name: parsedObj.name,
    candles,
    source: 'python_ashare_eastmoney',
  }
}
