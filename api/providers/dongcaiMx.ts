/**
 * Kimi / 东方财富妙想能力封装
 *
 * 支持两条链路：
 * 1. AGENT_GW_TOKEN -> 继续走 agent-gw 的 dongcai 数据工具
 * 2. KIMI_API_KEY   -> 走 Kimi 官方 OpenAI 兼容 chat/completions
 *
 * 优先使用 agent-gw；若只有普通 Kimi API Key，则退化为通用大模型问答。
 */

const DEFAULT_AGENT_GW_BASE_URL = 'https://agent-gw.kimi.com/coding'
const DEFAULT_KIMI_BASE_URL_GLOBAL = 'https://api.moonshot.ai/v1'
const DEFAULT_KIMI_BASE_URL_CN = 'https://api.moonshot.cn/v1'
const DEFAULT_KIMI_MODEL = 'kimi-k3'

interface MxToolResult {
  is_success?: string
  data_preview?: string
  notice?: string
  [key: string]: unknown
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>
    }
  }>
}

function resolveAgentGwBaseUrl(): string {
  return (process.env.AGENT_GW_BASE_URL || DEFAULT_AGENT_GW_BASE_URL).replace(/\/$/, '')
}

function resolveAgentGwToken(): string {
  return String(process.env.AGENT_GW_TOKEN ?? '').trim()
}

function resolveKimiApiKey(): string {
  return String(process.env.KIMI_API_KEY ?? process.env.MOONSHOT_API_KEY ?? '').trim()
}

function resolveKimiModel(): string {
  return (
    String(process.env.KIMI_MODEL ?? process.env.MOONSHOT_MODEL ?? DEFAULT_KIMI_MODEL).trim() || DEFAULT_KIMI_MODEL
  )
}

function resolveKimiBaseUrls(): string[] {
  const configured = [
    process.env.KIMI_BASE_URL ?? '',
    process.env.MOONSHOT_BASE_URL ?? '',
  ]
    .map((x) => String(x).trim().replace(/\/$/, ''))
    .filter(Boolean)

  return [...new Set([...configured, DEFAULT_KIMI_BASE_URL_GLOBAL, DEFAULT_KIMI_BASE_URL_CN])]
}

function extractAssistantText(payload: ChatCompletionResponse): string {
  const content = payload.choices?.[0]?.message?.content
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n')
      .trim()
  }
  return ''
}

async function postAgentTool(token: string, body: unknown, timeoutMs: number): Promise<MxToolResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(`${resolveAgentGwBaseUrl()}/v1/tools`, {
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

async function postKimiChat(input: {
  apiKey: string
  baseUrl: string
  system: string
  user: string
  timeoutMs: number
  temperature?: number
}): Promise<{ preview: string } | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), input.timeoutMs)
  try {
    const resp = await fetch(`${input.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: resolveKimiModel(),
        temperature: input.temperature ?? 0.2,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
      }),
      signal: controller.signal,
    })
    if (!resp.ok) {
      const text = (await resp.text()).slice(0, 300)
      throw new Error(`HTTP ${resp.status}: ${text}`)
    }
    const payload = (await resp.json()) as ChatCompletionResponse
    const preview = extractAssistantText(payload)
    return preview ? { preview } : null
  } finally {
    clearTimeout(timer)
  }
}

async function callWithAgentGw(body: unknown, timeoutMs: number): Promise<MxToolResult | null> {
  const token = resolveAgentGwToken()
  if (!token) return null
  try {
    return await postAgentTool(token, body, timeoutMs)
  } catch {
    return null
  }
}

function buildRegularChatPrompt(
  apiName: string,
  params: Record<string, unknown>,
): { system: string; user: string; temperature?: number } {
  const query = String(params.query ?? '').trim()
  switch (apiName) {
    case 'mx_stocks_screener':
      return {
        system:
          '你是A股选股助手。当前是通用Kimi模式，不直接连接东方财富选股数据库。请基于用户条件给出可执行的筛选思路、候选方向、关键观察指标，并明确哪些结论需要用户自行用实时行情验证。输出用简洁Markdown。',
        user: query || '请给出A股选股思路。',
        temperature: 0.3,
      }
    case 'mx_finance_data':
      return {
        system:
          '你是A股财务分析助手。若用户询问财务指标、资产负债、现金流、营收等，请结合常见财务口径给出解释与分析框架。若缺少真实数据库数值，请明确说明，并避免编造具体财务数据。',
        user: query || '请做财务分析。',
        temperature: 0.2,
      }
    case 'mx_finance_search':
      return {
        system:
          '你是金融资讯整理助手。若没有联网检索结果，请不要伪造“最新研报/新闻”原文，而是给出应关注的信息维度、可能的机构观点框架和检索建议；若用户问题本身提供了事实，则优先围绕这些事实做总结。',
        user: query || '请做金融资讯整理。',
        temperature: 0.3,
      }
    case 'stock_diagnosis':
    default:
      return {
        system:
          '你是A股个股诊断助手。优先基于用户已提供的数据和事实进行分析，不要编造实时行情或未提供的财务数据。结论要清楚，风险与观察点要分开写，允许使用Markdown。',
        user: query || '请做个股诊断。',
        temperature: 0.2,
      }
  }
}

async function callWithRegularKimi(
  apiName: string,
  params: Record<string, unknown>,
  timeoutMs: number,
): Promise<MxToolResult | null> {
  const apiKey = resolveKimiApiKey()
  if (!apiKey) return null
  const prompt = buildRegularChatPrompt(apiName, params)
  for (const baseUrl of resolveKimiBaseUrls()) {
    try {
      const out = await postKimiChat({
        apiKey,
        baseUrl,
        system: prompt.system,
        user: prompt.user,
        timeoutMs,
        temperature: prompt.temperature,
      })
      if (out?.preview) return { is_success: 'true', data_preview: out.preview }
    } catch {
      // try next base url
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
  const viaAgentGw = await callWithAgentGw(
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
  if (viaAgentGw) return viaAgentGw
  return callWithRegularKimi(apiName, params, timeoutMs)
}

/** 妙想是否可用（有凭证） */
export function isMxAvailable(): boolean {
  return Boolean(resolveAgentGwToken() || resolveKimiApiKey())
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
