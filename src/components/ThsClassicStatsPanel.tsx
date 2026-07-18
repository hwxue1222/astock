import { ExternalLink, RefreshCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { getThsClassicArticleStocks } from '@/lib/stockApi'
import { useStockStore } from '@/stores/stockStore'
import type { ThsClassicStatsResponse } from '@/types/stock'

export default function ThsClassicStatsPanel(props: {
  data: ThsClassicStatsResponse | null
  loading: boolean
  error: string | null
  onRefresh: () => void
}): JSX.Element {
  const addManyToWatchlist = useStockStore((s) => s.addManyToWatchlist)
  const [extractingRank, setExtractingRank] = useState<1 | 2 | 3 | null>(null)
  const [addedByRank, setAddedByRank] = useState<Record<number, string[]>>({})

  const existing = useStockStore((s) => s.watchlist)
  const watchlistSet = useMemo(() => new Set(existing.map((x) => String(x).toUpperCase())), [existing])

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">同花顺 classic · 今日点击排行</div>
          <div className="mt-1 text-xs text-slate-500">展示前三条，并标注来源与文章时间</div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://www.10jqka.com.cn/classic/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
          >
            打开来源
            <ExternalLink className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={props.onRefresh}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
          >
            <RefreshCcw className="h-4 w-4" />
            刷新
          </button>
        </div>
      </div>

      <div className="mt-3">
        {props.loading ? (
          <div className="text-sm text-slate-400">加载中…</div>
        ) : props.error ? (
          <div className="text-sm text-red-200">{props.error}</div>
        ) : props.data?.items?.length ? (
          <div className="space-y-2">
            {props.data.items.slice(0, 3).map((it) => (
              <div
                key={it.rank}
                className="flex items-start justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-red-600 text-xs font-semibold text-white">
                    {it.rank}
                  </div>
                  <div className="min-w-0">
                    {it.url ? (
                      <a
                        href={it.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-sm font-semibold text-slate-100 hover:underline"
                      >
                        {it.title}
                      </a>
                    ) : (
                      <div className="truncate text-sm font-semibold text-slate-100">{it.title}</div>
                    )}
                    <div className="mt-1 text-xs text-slate-500">
                      来源：同花顺 classic
                      {it.articleTimeText ? ` · 文章时间：${it.articleTimeText}` : ''}
                      {it.articleSourceText ? ` · ${it.articleSourceText}` : ''}
                    </div>

                    {addedByRank[it.rank]?.length ? (
                      <div className="mt-1 text-xs text-slate-500">
                        已加入自选：{addedByRank[it.rank].join('、')}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs text-slate-400">{it.timeText}</div>
                  {it.url ? (
                    <button
                      type="button"
                      disabled={extractingRank === it.rank}
                      onClick={async () => {
                        setExtractingRank(it.rank)
                        try {
                          const res = await getThsClassicArticleStocks(it.url, { limit: 10 })
                          const codes = (res.codes ?? [])
                            .map((x) => String(x).toUpperCase())
                            .filter((x) => /^\d{6}$/.test(x))
                          const newOnes = codes.filter((c) => !watchlistSet.has(c))
                          if (newOnes.length) addManyToWatchlist(newOnes)
                          setAddedByRank((m) => ({ ...m, [it.rank]: codes }))
                        } catch {
                          setAddedByRank((m) => ({ ...m, [it.rank]: [] }))
                        } finally {
                          setExtractingRank(null)
                        }
                      }}
                      className="mt-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-60"
                    >
                      {extractingRank === it.rank ? '提取中…' : '加入自选(10股)'}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-400">暂无数据</div>
        )}
      </div>
    </div>
  )
}
