import fs from 'node:fs/promises'
import path from 'node:path'

export async function readJsonCache<T>(
  filePath: string,
  input: { ttlSeconds: number },
): Promise<T | null> {
  if (!Number.isFinite(input.ttlSeconds) || input.ttlSeconds <= 0) return null
  try {
    const st = await fs.stat(filePath)
    const ageSeconds = (Date.now() - st.mtimeMs) / 1000
    if (ageSeconds > input.ttlSeconds) return null
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function writeJsonCache(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmp = `${filePath}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data))
  await fs.rename(tmp, filePath)
}

