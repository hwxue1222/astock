import { fetchJson } from './http.js'

export interface EastmoneyDatacenterResponse<T> {
  result?: {
    data?: T[]
    pages?: number
  }
}

async function getReportRows<T>(input: {
  reportName: string
  code: string
  pageSize: number
}): Promise<T[]> {
  const q = new URLSearchParams()
  q.set('reportName', input.reportName)
  q.set('columns', 'ALL')
  q.set('pageNumber', '1')
  q.set('pageSize', String(input.pageSize))
  q.set('sortColumns', 'REPORT_DATE')
  q.set('sortTypes', '-1')
  q.set('filter', `(SECURITY_CODE="${input.code}")`)

  const url = `https://datacenter.eastmoney.com/api/data/v1/get?${q.toString()}`
  const payload = await fetchJson<EastmoneyDatacenterResponse<T>>(url, {
    timeoutMs: 20_000,
    headers: { referer: 'https://datacenter.eastmoney.com' },
  })
  return payload.result?.data ?? []
}

export interface EastmoneyBalanceRow {
  REPORT_DATE?: string
  NOTICE_DATE?: string
  TOTAL_ASSETS?: number
  TOTAL_LIABILITIES?: number
  MONETARYFUNDS?: number
}

export interface EastmoneyIncomeRow {
  REPORT_DATE?: string
  NOTICE_DATE?: string
  TOTAL_OPERATE_INCOME?: number
}

export async function getEastmoneyFinancialSnapshot(input: {
  code: string
  asOf: 'latest' | 'previous'
}): Promise<{
  asOfDate: string
  totalAssets?: number
  totalLiabilities?: number
  cash?: number
  revenue?: number
}> {
  const [balance, income] = await Promise.all([
    getReportRows<EastmoneyBalanceRow>({
      reportName: 'RPT_DMSK_FN_BALANCE',
      code: input.code,
      pageSize: 2,
    }),
    getReportRows<EastmoneyIncomeRow>({
      reportName: 'RPT_DMSK_FN_INCOME',
      code: input.code,
      pageSize: 2,
    }),
  ])

  const idx = input.asOf === 'previous' ? 1 : 0
  const b = balance[idx] ?? balance[0] ?? {}
  const i = income[idx] ?? income[0] ?? {}
  const asOfDate =
    String(b.REPORT_DATE ?? i.REPORT_DATE ?? b.NOTICE_DATE ?? i.NOTICE_DATE ?? '').slice(
      0,
      10,
    )

  return {
    asOfDate: asOfDate || new Date().toISOString().slice(0, 10),
    totalAssets: typeof b.TOTAL_ASSETS === 'number' ? b.TOTAL_ASSETS : undefined,
    totalLiabilities: typeof b.TOTAL_LIABILITIES === 'number' ? b.TOTAL_LIABILITIES : undefined,
    cash: typeof b.MONETARYFUNDS === 'number' ? b.MONETARYFUNDS : undefined,
    revenue: typeof i.TOTAL_OPERATE_INCOME === 'number' ? i.TOTAL_OPERATE_INCOME : undefined,
  }
}

