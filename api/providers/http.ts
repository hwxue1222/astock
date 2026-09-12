import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function fetchText(
  url: string,
  input?: { timeoutMs?: number; headers?: Record<string, string> },
): Promise<string> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), input?.timeoutMs ?? 15_000)
  try {
    const headers = {
      'user-agent': 'Mozilla/5.0',
      ...(input?.headers ?? {}),
    }
    try {
      const res = await fetch(url, { signal: ac.signal, headers })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (e: unknown) {
      try {
        const res = await fetch(`https://r.jina.ai/${url}`, { signal: ac.signal, headers })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return await res.text()
      } catch {
        const allow = String(process.env.ALLOW_CURL_FALLBACK ?? '1').toLowerCase()
        const isVercel = String(process.env.VERCEL ?? '').length > 0
        if (isVercel) throw e
        if (!(allow === '1' || allow === 'true' || allow === 'yes')) throw e
        const timeoutSeconds = Math.max(5, Math.ceil((input?.timeoutMs ?? 15_000) / 1000))
        const args = ['-L', '--max-time', String(timeoutSeconds)]
        for (const [k, v] of Object.entries(headers)) {
          args.push('-H', `${k}: ${v}`)
        }
        args.push(url)
        const out = await execFileAsync('curl', args, { maxBuffer: 10 * 1024 * 1024 })
        return out.stdout
      }
    }
  } finally {
    clearTimeout(t)
  }
}

export async function fetchJson<T>(
  url: string,
  input?: { timeoutMs?: number; headers?: Record<string, string> },
): Promise<T> {
  const text = await fetchText(url, input)
  const s = String(text ?? '')

  const direct = s.trim()
  try {
    return JSON.parse(direct) as T
  } catch {
    void 0
  }

  function extractFirstJsonValue(raw: string): string | null {
    const a = raw.indexOf('[')
    const o = raw.indexOf('{')
    const i = a < 0 ? o : o < 0 ? a : Math.min(a, o)
    if (i < 0) return null

    const open = raw[i]
    const close = open === '[' ? ']' : '}'
    let depth = 0
    let inStr = false
    let esc = false

    for (let p = i; p < raw.length; p += 1) {
      const ch = raw[p]
      if (inStr) {
        if (esc) {
          esc = false
        } else if (ch === '\\') {
          esc = true
        } else if (ch === '"') {
          inStr = false
        }
        continue
      }

      if (ch === '"') {
        inStr = true
        continue
      }
      if (ch === open) depth += 1
      else if (ch === close) depth -= 1
      if (depth === 0) return raw.slice(i, p + 1)
    }
    return null
  }

  const extracted = extractFirstJsonValue(s)
  if (extracted) {
    return JSON.parse(extracted) as T
  }

  throw new Error('Invalid JSON response')
}
