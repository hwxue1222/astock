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

export interface EastmoneyCashflowRow {
  REPORT_DATE?: string
  NOTICE_DATE?: string
  NETCASH_OPERATE?: number
}

export interface EastmoneyMainopRow {
  REPORT_DATE?: string
  MAINOP_TYPE?: string
  ITEM_NAME?: string
  MAIN_BUSINESS_INCOME?: number
  MBI_RATIO?: number
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

/**
 * 查询经营活动现金流净额（最新/上一期）
 */
export async function getEastmoneyOperatingCashflow(input: {
  code: string
  asOf: 'latest' | 'previous'
}): Promise<{ asOfDate: string; operatingCashflow?: number }> {
  const rows = await getReportRows<EastmoneyCashflowRow>({
    reportName: 'RPT_DMSK_FN_CASHFLOW',
    code: input.code,
    pageSize: 2,
  })

  const idx = input.asOf === 'previous' ? 1 : 0
  const r = rows[idx] ?? rows[0] ?? {}

  return {
    asOfDate: String(r.REPORT_DATE ?? r.NOTICE_DATE ?? '').slice(0, 10),
    operatingCashflow: typeof r.NETCASH_OPERATE === 'number' ? r.NETCASH_OPERATE : undefined,
  }
}

const OVERSEAS_KEYWORDS = ['境外', '国外', '海外']

function isOverseasItem(name: string): boolean {
  return OVERSEAS_KEYWORDS.some((k) => name.includes(k))
}

/**
 * 查询主营构成中的境内外业务收入（按地区分类，MAINOP_TYPE=3）
 * 返回最新一期（或上一期）的国内/国外收入金额与占比
 */
export async function getEastmoneyRegionalComposition(input: {
  code: string
  asOf: 'latest' | 'previous'
}): Promise<{
  asOfDate: string
  domesticRevenue?: number
  overseasRevenue?: number
  domesticRatio?: number
  overseasRatio?: number
} | null> {
  const rows = await getReportRows<EastmoneyMainopRow>({
    reportName: 'RPT_F10_FN_MAINOP',
    code: input.code,
    pageSize: 80,
  })

  if (!rows.length) return null

  // 按报告期分组（接口按 REPORT_DATE 倒序返回）
  const dates = [...new Set(rows.map((r) => r.REPORT_DATE ?? '').filter(Boolean))]
  const idx = input.asOf === 'previous' ? 1 : 0
  const targetDate = dates[idx] ?? dates[0]
  if (!targetDate) return null

  const regionRows = rows.filter(
    (r) =>
      r.REPORT_DATE === targetDate &&
      String(r.MAINOP_TYPE ?? '') === '3' &&
      typeof r.MAIN_BUSINESS_INCOME === 'number',
  )

  if (!regionRows.length) return null

  let domesticRevenue = 0
  let overseasRevenue = 0
  let domesticRatio = 0
  let overseasRatio = 0

  for (const r of regionRows) {
    const name = String(r.ITEM_NAME ?? '')
    const income = r.MAIN_BUSINESS_INCOME ?? 0
    const ratio = typeof r.MBI_RATIO === 'number' ? r.MBI_RATIO : 0
    if (isOverseasItem(name)) {
      overseasRevenue += income
      overseasRatio += ratio
    } else {
      domesticRevenue += income
      domesticRatio += ratio
    }
  }

  return {
    asOfDate: targetDate.slice(0, 10),
    domesticRevenue,
    overseasRevenue,
    domesticRatio,
    overseasRatio,
  }
}
