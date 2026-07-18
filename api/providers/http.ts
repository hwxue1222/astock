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
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        headers: {
          'user-agent': 'Mozilla/5.0',
          ...(input?.headers ?? {}),
        },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (e: unknown) {
      const allow = String(process.env.ALLOW_CURL_FALLBACK ?? '1').toLowerCase()
      if (!(allow === '1' || allow === 'true' || allow === 'yes')) throw e
      const timeoutSeconds = Math.max(5, Math.ceil((input?.timeoutMs ?? 15_000) / 1000))
      const headers = {
        'user-agent': 'Mozilla/5.0',
        ...(input?.headers ?? {}),
      }
      const args = ['-L', '--max-time', String(timeoutSeconds)]
      for (const [k, v] of Object.entries(headers)) {
        args.push('-H', `${k}: ${v}`)
      }
      args.push(url)
      const out = await execFileAsync('curl', args, { maxBuffer: 10 * 1024 * 1024 })
      return out.stdout
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
  return JSON.parse(text) as T
}
