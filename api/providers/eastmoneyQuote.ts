import { fetchJson, fetchText } from './http.js'

type EastmoneyStockGetResponse = {
  data?: {
    f14?: string
    f58?: string
    f127?: string
    f116?: number
    f117?: number
    f20?: number
    f21?: number
    f9?: number
    f162?: number
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

function guessSecid(code: string): string {
  const c = String(code ?? '').trim()
  if (!/^\d{6}$/.test(c)) return `0.${c}`
  if (c.startsWith('6') || c.startsWith('9')) return `1.${c}`
  return `0.${c}`
}

export async function getEastmoneyQuote(input: {
  code: string
  timeoutMs?: number
}): Promise<{ name?: string; industry?: string; marketCapYuan?: number; floatMarketCapYuan?: number; pe?: number }> {
  const secid = guessSecid(input.code)
  const q = new URLSearchParams()
  q.set('secid', secid)
  q.set('fields', 'f58,f14,f127,f116,f117,f20,f21,f9,f162')
  q.set('ut', 'bd1d9ddb04089700cf9c27f6f7426281')
  const url = `https://push2.eastmoney.com/api/qt/stock/get?${q.toString()}`

  let payload: EastmoneyStockGetResponse
  try {
    payload = await fetchJson<EastmoneyStockGetResponse>(url, {
      timeoutMs: input.timeoutMs ?? 12_000,
      headers: { referer: 'https://quote.eastmoney.com' },
    })
  } catch {
    const text = await fetchText(`https://r.jina.ai/${url}`, {
      timeoutMs: input.timeoutMs ?? 12_000,
      headers: { accept: 'text/plain,*/*;q=0.8' },
    })
    payload = parseLooseJson<EastmoneyStockGetResponse>(text)
  }

  const d = payload.data ?? {}

  const name =
    typeof d.f58 === 'string'
      ? d.f58.trim()
      : typeof d.f14 === 'string'
        ? d.f14.trim()
        : undefined

  const industry = typeof d.f127 === 'string' ? d.f127.trim() : undefined

  const marketCapYuan =
    typeof d.f116 === 'number'
      ? d.f116
      : typeof d.f20 === 'number'
        ? d.f20
        : undefined
  const floatMarketCapYuan =
    typeof d.f117 === 'number'
      ? d.f117
      : typeof d.f21 === 'number'
        ? d.f21
        : undefined

  const pe =
    typeof d.f9 === 'number'
      ? d.f9
      : typeof d.f162 === 'number'
        ? d.f162 / 100
        : undefined

  return {
    name,
    industry,
    marketCapYuan: Number.isFinite(marketCapYuan as number) ? marketCapYuan : undefined,
    floatMarketCapYuan: Number.isFinite(floatMarketCapYuan as number) ? floatMarketCapYuan : undefined,
    pe: Number.isFinite(pe as number) ? pe : undefined,
  }
}
