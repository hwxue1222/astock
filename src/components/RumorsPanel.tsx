import { useEffect, useMemo, useState } from 'react'
import { getRumors } from '@/lib/stockApi'
import { formatIsoToLocal } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { RumorsResponse } from '@/types/stock'

const NEGATIVE = new Set([
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
])

export default function RumorsPanel(props: { symbol: string }) {
  const [data, setData] = useState<RumorsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [runKey, setRunKey] = useState(0)
  const [onlyNegative, setOnlyNegative] = useState(false)

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    getRumors(props.symbol, { limit: 40 }, ac.signal)
      .then((d) => {
        if (ac.signal.aborted) return
        setData(d)
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setError(e instanceof Error ? e.message : String(e))
        setData(null)
      })
      .finally(() => {
        if (ac.signal.aborted) return
        setLoading(false)
      })
    return () => ac.abort()
  }, [props.symbol, runKey])

  const hot = useMemo(() => data?.keywords ?? [], [data?.keywords])
  const topics = useMemo(() => data?.topics ?? [], [data?.topics])
  const posts = useMemo(() => data?.posts ?? [], [data?.posts])

  const shownPosts = useMemo(() => {
    if (!onlyNegative) return posts
    return posts.filter((p) => p.matchedKeywords?.length)
  }, [posts, onlyNegative])

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">留言蜚语（社区）</div>
          <div className="text-xs text-slate-400">来源：东方财富股吧 · 非公告信息，仅供参考</div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={onlyNegative} onChange={(e) => setOnlyNegative(e.target.checked)} />
            只看负面
          </label>
          <button
            type="button"
            onClick={() => setRunKey((x) => x + 1)}
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
          >
            刷新
          </button>
        </div>
      </div>

      <div className="mt-3">
        {loading ? (
          <div className="text-sm text-slate-400">加载中…</div>
        ) : error ? (
          <div className="text-sm text-red-200">{error}</div>
        ) : (
          <>
            {data?.stats ? (
              <div className="mb-3 rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-slate-400">
                    近帖数：<span className="text-slate-200">{data.stats.totalPosts}</span>
                    {' · '}负面贴：<span className="text-red-200">{data.stats.negativePosts}</span>
                    {' · '}负面占比：
                    <span className="text-red-200">{(data.stats.negativeRatio * 100).toFixed(0)}%</span>
                  </div>
                  <div className="text-xs text-slate-500">按标题关键词统计（非严格情绪模型）</div>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-900">
                  <div
                    className="h-2 bg-red-500/60"
                    style={{ width: `${Math.min(100, Math.max(0, data.stats.negativeRatio * 100))}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {hot.length ? (
                hot.map((k) => (
                  <span
                    key={k.keyword}
                    className={cn(
                      'rounded-lg border px-2 py-1 text-xs',
                      NEGATIVE.has(k.keyword)
                        ? 'border-red-500/30 bg-red-500/10 text-red-200'
                        : 'border-slate-800 bg-slate-900 text-slate-200',
                    )}
                  >
                    {k.keyword} · {k.count}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500">未发现明显负面关键词</span>
              )}
            </div>

            {topics.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {topics.slice(0, 12).map((t) => (
                  <span
                    key={t.topic}
                    className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-300"
                  >
                    {t.topic} · {t.count}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-3 space-y-2">
              {shownPosts.slice(0, 12).map((p) => (
                <a
                  key={p.id}
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 hover:bg-slate-900"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate text-sm font-semibold text-slate-100">{p.title}</div>
                    <div className="shrink-0 text-xs text-slate-500">
                      {typeof p.replyCount === 'number' ? `评${p.replyCount}` : '评—'}
                      {' · '}
                      {typeof p.readCount === 'number' ? `阅${p.readCount}` : '阅—'}
                      {' · '}
                      {formatIsoToLocal(p.publishedAt)}
                    </div>
                  </div>
                  {p.matchedKeywords?.length ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.matchedKeywords.slice(0, 6).map((w) => (
                        <span
                          key={w}
                          className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs text-red-200"
                        >
                          {w}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </a>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
