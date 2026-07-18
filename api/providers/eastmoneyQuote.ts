import { fetchJson } from './http.js'

type EastmoneyStockGetResponse = {
  data?: {
    f116?: number
    f117?: number
    f20?: number
    f21?: number
  }
}

function guessSecid(code: string): string {
  const c = String(code ?? '').trim()
  if (!/^\d{6}$/.test(c)) return `0.${c}`
  if (c.startsWith('6') || c.startsWith('9')) return `1.${c}`
  return `0.${c}`
}

export async function getEastmoneyMarketCaps(input: {
  code: string
  timeoutMs?: number
}): Promise<{ marketCapYuan?: number; floatMarketCapYuan?: number }> {
  const secid = guessSecid(input.code)
  const q = new URLSearchParams()
  q.set('secid', secid)
  q.set('fields', 'f116,f117,f20,f21')
  const url = `https://push2.eastmoney.com/api/qt/stock/get?${q.toString()}`

  const payload = await fetchJson<EastmoneyStockGetResponse>(url, {
    timeoutMs: input.timeoutMs ?? 12_000,
    headers: { referer: 'https://quote.eastmoney.com' },
  })

  const d = payload.data ?? {}
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

  return {
    marketCapYuan: Number.isFinite(marketCapYuan as number) ? marketCapYuan : undefined,
    floatMarketCapYuan: Number.isFinite(floatMarketCapYuan as number) ? floatMarketCapYuan : undefined,
  }
}

