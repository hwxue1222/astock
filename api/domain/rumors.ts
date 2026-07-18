import { getEastmoneyGubaPosts } from '../providers/eastmoneyGuba.js'

export type RumorKeyword = { keyword: string; count: number }
export type RumorTopic = { topic: string; count: number }
export type RumorPost = {
  id: string
  title: string
  url: string
  publishedAt: string
  matchedKeywords: string[]
  readCount: number | null
  replyCount: number | null
}

export type RumorStats = {
  totalPosts: number
  negativePosts: number
  negativeRatio: number
}

const NEGATIVE_KEYWORDS = [
  '违规',
  '减持',
  '处罚',
  '立案',
  '调查',
  '问询',
  '监管',
  '警示',
  '诉讼',
  '仲裁',
  '索赔',
  '造假',
  '虚假',
  '信披',
  '延迟披露',
  '停标',
  '暂停中标',
  '禁止投标',
  '黑名单',
  '拉黑',
  '失信',
  '爆雷',
  '踩雷',
  '退市',
  'ST',
]

const STOP_TOKENS = new Set([
  '公司',
  '股吧',
  '今天',
  '明天',
  '怎么',
  '现在',
  '真的',
  '一个',
  '这个',
  '还是',
  '就是',
  '不会',
  '可以',
  '已经',
  '感觉',
  '大家',
  '我们',
  '你们',
  '他们',
  '什么',
  '自己',
  '不是',
  '没有',
  '因为',
  '所以',
  '如果',
  '但是',
  '然后',
  '而且',
  '这种',
  '那种',
  '这股',
  '股价',
  '涨停',
  '跌停',
  '大盘',
  '主力',
  '庄家',
  '散户',
  '割肉',
  '回本',
  '索赔',
])

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs))
}

function matchKeywords(title: string): string[] {
  const t = String(title ?? '')
  const hits = NEGATIVE_KEYWORDS.filter((k) => t.includes(k))
  return uniq(hits)
}

function extractTopics(title: string): string[] {
  const t = String(title ?? '')
    .replace(/\s+/g, '')
    .replace(/[0-9A-Za-z_]+/g, '')
  const chunks = t.match(/[\u4e00-\u9fff]{2,12}/g) ?? []
  const out: string[] = []
  for (const ch of chunks) {
    const s = String(ch)
    for (let n = 2; n <= 4; n += 1) {
      if (s.length < n) continue
      for (let i = 0; i <= s.length - n; i += 1) {
        const token = s.slice(i, i + n)
        if (STOP_TOKENS.has(token)) continue
        if (NEGATIVE_KEYWORDS.includes(token)) continue
        out.push(token)
      }
    }
  }
  return uniq(out)
}

function weightForPost(input: { readCount: number | null; replyCount: number | null }): number {
  const r = input.readCount ?? 0
  const c = input.replyCount ?? 0
  const w = 1 + Math.log1p(Math.max(0, r)) / 4 + Math.log1p(Math.max(0, c))
  return Number.isFinite(w) ? w : 1
}

export async function getRumorsOverview(input: {
  code: string
  limit: number
}): Promise<{
  symbol: string
  source: string
  keywords: RumorKeyword[]
  topics: RumorTopic[]
  stats: RumorStats
  posts: RumorPost[]
}> {
  const postsRaw = await getEastmoneyGubaPosts({ code: input.code, limit: input.limit })
  const counts = new Map<string, number>()
  const topicCounts = new Map<string, number>()

  const posts: RumorPost[] = postsRaw.map((p) => {
    const matchedKeywords = matchKeywords(p.title)
    for (const k of matchedKeywords) counts.set(k, (counts.get(k) ?? 0) + 1)

    const w = weightForPost({ readCount: p.readCount, replyCount: p.replyCount })
    const topics = extractTopics(p.title)
    for (const t of topics) topicCounts.set(t, (topicCounts.get(t) ?? 0) + Math.max(1, Math.round(w)))

    return {
      ...p,
      matchedKeywords,
      readCount: p.readCount,
      replyCount: p.replyCount,
    }
  })

  const keywords = Array.from(counts.entries())
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)

  const topics = Array.from(topicCounts.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 16)

  const totalPosts = posts.length
  const negativePosts = posts.filter((p) => p.matchedKeywords.length > 0).length
  const negativeRatio = totalPosts ? negativePosts / totalPosts : 0

  return {
    symbol: input.code,
    source: 'eastmoney_guba',
    keywords,
    topics,
    stats: { totalPosts, negativePosts, negativeRatio },
    posts,
  }
}
