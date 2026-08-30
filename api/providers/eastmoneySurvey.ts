import { fetchJson } from './http.js'

type EastmoneyCompanySurveyResponse = {
  ResultCode?: number
  data?: {
    gsjj?: Array<{
     实际控制人类型?: string
      实际控制人?: string
    }>
  }
}

function guessCodePrefix(code: string): string {
  const c = String(code ?? '').trim()
  if (!/^\d{6}$/.test(c)) return ''
  if (c.startsWith('6') || c.startsWith('9')) return `SH${c}`
  return `SZ${c}`
}

export async function getEastmoneyCompanySurvey(input: {
  code: string
  timeoutMs?: number
}): Promise<{ controllerType?: string; controller?: string }> {
  const fullCode = guessCodePrefix(input.code)
  if (!fullCode) return {}

  const url = `https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/CompanySurveyAjax?code=${fullCode}`

  try {
    const payload = await fetchJson<EastmoneyCompanySurveyResponse>(url, {
      timeoutMs: input.timeoutMs ?? 12_000,
      headers: { referer: 'https://emweb.securities.eastmoney.com' },
    })

    const gsjj = payload?.data?.gsjj?.[0]
    if (!gsjj) return {}

    const controllerType = gsjj['实际控制人类型'] || undefined
    const controller = gsjj['实际控制人'] || undefined

    return { controllerType, controller }
  } catch {
    return {}
  }
}
