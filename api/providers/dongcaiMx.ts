/**
 * 东方财富妙想金融数据 — TypeScript 原生封装
 *
 * 通过 agent-gw 网关调用妙想数据后端（与 dongcai_cli.py 等价），
 * 使 Vercel serverless 环境也能使用妙想能力（仅需 KIMI_API_KEY）。
 *
 * 优雅降级：凭证缺失或网关不可达时返回 null，不影响主流程。
 */

const DEFAULT_BASE_URL = 'https://agent-gw.kimi.com/coding'

interface MxToolResult {
  is_success?: string
  data_preview?: string
  notice?: string
  [key: string]: unknown
}

function resolveBaseUrl(): string {
  return (process.env.AGENT_GW_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '')
}

function resolveTokens(): string[] {
  const candidates = [
    process.env.KIMI_API_KEY ?? '',
    process.env.AGENT_GW_TOKEN ?? '',
  ]
  return [...new Set(candidates.map((t) => t.trim()).filter(Boolean))]
}

async function postTool(token: string, body: unknown, timeoutMs: number): Promise<MxToolResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(`${resolveBaseUrl()}/v1/tools`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!resp.ok) {
      const text = (await resp.text()).slice(0, 300)
      throw new Error(`HTTP ${resp.status}: ${text}`)
    }
    return (await resp.json()) as MxToolResult
  } finally {
    clearTimeout(timer)
  }
}

/** 依次尝试候选凭证；全部失败返回 null */
async function callWithAuth(body: unknown, timeoutMs: number): Promise<MxToolResult | null> {
  const tokens = resolveTokens()
  for (const token of tokens) {
    try {
      return await postTool(token, body, timeoutMs)
    } catch {
      // try next token
    }
  }
  return null
}

/**
 * 调用妙想数据工具
 * @param apiName 如 mx_stocks_screener / mx_finance_data / mx_finance_search
 * @param params  工具参数（query 等）
 */
export async function callMxTool(
  apiName: string,
  params: Record<string, unknown>,
  timeoutMs = 60_000,
): Promise<MxToolResult | null> {
  const fullName = apiName.startsWith('dongcai_') ? apiName : `dongcai_${apiName}`
  return callWithAuth(
    {
      method: 'call_data_source_tool',
      params: {
        data_source_name: 'dongcai',
        api_name: fullName,
        params,
      },
    },
    timeoutMs,
  )
}

/** 妙想是否可用（有凭证） */
export function isMxAvailable(): boolean {
  return resolveTokens().length > 0
}

/**
 * 妙想智能选股：自然语言筛选 A 股
 */
export async function mxScreenStocks(query: string): Promise<{ preview: string } | null> {
  const r = await callMxTool('mx_stocks_screener', { query, select_type: 'stock' }, 90_000)
  if (!r) return null
  return { preview: typeof r.data_preview === 'string' ? r.data_preview : JSON.stringify(r) }
}

/**
 * 妙想财务数据查询：自然语言查询个股财务指标
 */
export async function mxFinanceData(query: string): Promise<{ preview: string } | null> {
  const r = await callMxTool('mx_finance_data', { query }, 90_000)
  if (!r) return null
  return { preview: typeof r.data_preview === 'string' ? r.data_preview : JSON.stringify(r) }
}

/**
 * 妙想金融资讯搜索：新闻/研报/评级
 */
export async function mxFinanceSearch(query: string): Promise<{ preview: string } | null> {
  const r = await callMxTool('mx_finance_search', { query }, 60_000)
  if (!r) return null
  return { preview: typeof r.data_preview === 'string' ? r.data_preview : JSON.stringify(r) }
}

/**
 * 妙想个股综合诊断（基本面+资金面+风险面 Markdown 报告）
 */
export async function mxStockDiagnosis(query: string): Promise<{ preview: string } | null> {
  const r = await callMxTool('stock_diagnosis', { query }, 120_000)
  if (!r) return null
  return { preview: typeof r.data_preview === 'string' ? r.data_preview : JSON.stringify(r) }
}
