import { fetchJson } from './http.js'

function emCode(symbol: string): string {
  const code = String(symbol ?? '').trim()
  if (code.startsWith('6') || code.startsWith('688')) return `SH${code}`
  return `SZ${code}`
}

function collectStrings(node: unknown, out: Set<string>, depth: number): void {
  if (depth > 6) return
  if (typeof node === 'string') {
    const s = node.trim()
    if (!s) return
    if (s.startsWith('http')) return
    if (s.length > 40) return
    if (/^\d{6,}$/.test(s)) return
    out.add(s)
    return
  }
  if (Array.isArray(node)) {
    for (const it of node) collectStrings(it, out, depth + 1)
    return
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    for (const v of Object.values(obj)) collectStrings(v, out, depth + 1)
  }
}

export async function getEastmoneyCoreConceptionTags(input: {
  code: string
  timeoutMs?: number
}): Promise<string[]> {
  const fullCode = emCode(input.code)
  if (!fullCode) return []
  const url = `https://emweb.securities.eastmoney.com/PC_HSF10/CoreConception/CoreConceptionAjax?code=${encodeURIComponent(fullCode)}`
  const payload = await fetchJson<unknown>(url, {
    timeoutMs: input.timeoutMs ?? 20_000,
    headers: { referer: 'https://emweb.securities.eastmoney.com/' },
  })
  const set = new Set<string>()
  collectStrings(payload, set, 0)
  return Array.from(set)
}

