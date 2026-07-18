import { ExternalLink, RefreshCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { getThsClassicArticleStocks } from '@/lib/stockApi'
import type { StockItem, ThsClassicStatsResponse } from '@/types/stock'

export default function ThsClassicStatsPanel(props: {
  data: ThsClassicStatsResponse | null
  universe?: StockItem[]
  loading: boolean
  error: string | null
  onRefresh: () => void
}): JSX.Element {
  const [loadingByRank, setLoadingByRank] = useState<Record<number, boolean>>({})
  const [codesByRank, setCodesByRank] = useState<Record<number, string[]>>({})
  const [errorByRank, setErrorByRank] = useState<Record<number, string>>({})

  const nameByCode = useMemo(() => {
    const u = props.universe ?? []
    return new Map(u.map((x) => [String(x.symbol).toUpperCase(), String(x.name ?? '').trim()]))
  }, [props.universe])

  useEffect(() => {
    const items = props.data?.items?.slice(0, 3) ?? []
    if (!items.length) return
    const ac = new AbortController()

    void (async () => {
      for (const it of items) {
        if (ac.signal.aborted) return
        if (!it.url) continue
        if (codesByRank[it.rank]?.length) continue
        if (loadingByRank[it.rank]) continue
        setLoadingByRank((m) => ({ ...m, [it.rank]: true }))
        setErrorByRank((m) => {
          const next = { ...m }
          delete next[it.rank]
          return next
        })

        try {
          const res = await getThsClassicArticleStocks(it.url, { limit: 10 }, ac.signal)
          const codes = (res.codes ?? [])
            .map((x) => String(x).toUpperCase())
            .filter((x) => /^\d{6}$/.test(x))
          setCodesByRank((m) => ({ ...m, [it.rank]: codes }))
        } catch (e: unknown) {
          setErrorByRank((m) => ({ ...m, [it.rank]: e instanceof Error ? e.message : String(e) }))
        } finally {
          setLoadingByRank((m) => ({ ...m, [it.rank]: false }))
        }
      }
    })()

    return () => ac.abort()
  }, [props.data, codesByRank, loadingByRank])

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
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="grid gap-3 sm:grid-cols-3">
              {props.data.items.slice(0, 3).map((it) => (
                <div
                  key={it.rank}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 px-3 py-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-red-600 text-xs font-semibold text-white">
                        {it.rank}
                      </div>
                      <div className="text-xs text-slate-400">{it.timeText}</div>
                    </div>

                    <div className="mt-3 min-w-0">
                      {it.url ? (
                        <a
                          href={it.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-sm font-semibold leading-snug text-slate-100 hover:underline"
                        >
                          {it.title}
                        </a>
                      ) : (
                        <div className="text-sm font-semibold leading-snug text-slate-100">{it.title}</div>
                      )}
                      <div className="mt-2 text-xs text-slate-500">
                        来源：同花顺 classic
                        {it.articleTimeText ? ` · 文章时间：${it.articleTimeText}` : ''}
                        {it.articleSourceText ? ` · ${it.articleSourceText}` : ''}
                      </div>

                      <div className="mt-2">
                        {loadingByRank[it.rank] ? (
                          <div className="text-xs text-slate-500">正在解析股票清单…</div>
                        ) : errorByRank[it.rank] ? (
                          <div className="text-xs text-red-200">解析失败：{errorByRank[it.rank]}</div>
                        ) : codesByRank[it.rank]?.length ? (
                          <div className="flex flex-wrap gap-2">
                            {codesByRank[it.rank].map((code) => (
                              <div
                                key={code}
                                className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
                              >
                                {code}
                                {nameByCode.get(code) ? <span className="text-slate-400"> · {nameByCode.get(code)}</span> : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500">暂无股票清单</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-400">暂无数据</div>
        )}
      </div>
    </div>
  )
}
