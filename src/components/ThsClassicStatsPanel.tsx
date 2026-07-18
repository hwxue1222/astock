import { ExternalLink, RefreshCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { getKline, getQuote, getRatios, getThsClassicArticleStocks } from '@/lib/stockApi'
import { useStockStore } from '@/stores/stockStore'
import type { StockItem, ThsClassicStatsResponse } from '@/types/stock'

export default function ThsClassicStatsPanel(props: {
  data: ThsClassicStatsResponse | null
  universe: StockItem[]
  loading: boolean
  error: string | null
  onRefresh: () => void
}): JSX.Element {
  const addToWatchlist = useStockStore((s) => s.addToWatchlist)
  const watchlist = useStockStore((s) => s.watchlist)
  const parsedByUrl = useStockStore((s) => s.thsClassicParsedByUrl)
  const setParsed = useStockStore((s) => s.setThsClassicParsed)
  const watchlistSet = useMemo(() => new Set(watchlist.map((x) => String(x).toUpperCase())), [watchlist])

  const nameByCode = useMemo(() => {
    return new Map(props.universe.map((x) => [String(x.symbol).toUpperCase(), String(x.name ?? '').trim()]))
  }, [props.universe])

  const [loadingByRank, setLoadingByRank] = useState<Record<number, boolean>>({})
  const [errorByRank, setErrorByRank] = useState<Record<number, string>>({})

  const [quoteByCode, setQuoteByCode] = useState<
    Record<string, { name?: string; marketCapYuan?: number; floatMarketCapYuan?: number; pe?: number }>
  >({})
  const [fieldsByCode, setFieldsByCode] = useState<
    Record<string, { cash?: number; totalAssets?: number; netAssets?: number }>
  >({})
  const [klineByCode, setKlineByCode] = useState<Record<string, { closes: number[] }>>({})

  function formatYi(yuan?: number): string {
    if (yuan === undefined) return '—'
    if (!Number.isFinite(yuan)) return '—'
    return `${(yuan / 1e8).toFixed(1)}亿`
  }

  function formatPe(pe?: number): string {
    if (pe === undefined) return '—'
    if (!Number.isFinite(pe)) return '—'
    return pe.toFixed(1)
  }

  function sparklinePoints(closes: number[], w = 90, h = 22): string {
    if (closes.length < 2) return ''
    const min = Math.min(...closes)
    const max = Math.max(...closes)
    const dx = w / (closes.length - 1)
    const denom = Math.max(1e-9, max - min)
    return closes
      .map((v, i) => {
        const x = i * dx
        const y = h - ((v - min) / denom) * h
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }
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

                    <div className="mt-2">
                      {loadingByRank[it.rank] ? <div className="text-xs text-slate-500">解析中…</div> : null}
                      {errorByRank[it.rank] ? (
                        <div className="text-xs text-red-200">解析失败：{errorByRank[it.rank]}</div>
                      ) : null}
                      {(parsedByUrl[it.url]?.codes ?? []).length ? (
                        <div className="mt-2 space-y-1">
                          {(parsedByUrl[it.url]?.codes ?? []).map((code) => {
                            const already = watchlistSet.has(code)
                            const name = nameByCode.get(code)
                            const q = quoteByCode[code]
                            const f = fieldsByCode[code]
                            return (
                              <div key={code} className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-xs text-slate-200">
                                    <span className="font-semibold">{code}</span>
                                    {name ? <span className="text-slate-400"> · {name}</span> : null}
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                                    <div>市值：{formatYi(q?.marketCapYuan)}</div>
                                    <div>流通：{formatYi(q?.floatMarketCapYuan)}</div>
                                    <div>PE：{formatPe(q?.pe)}</div>
                                    <div>货币：{formatYi(f?.cash)}</div>
                                    <div>总资：{formatYi(f?.totalAssets)}</div>
                                    <div>净资：{formatYi(f?.netAssets)}</div>
                                  </div>
                                </div>
                                <div className="shrink-0">
                                  <svg width="90" height="22" viewBox="0 0 90 22" className="block">
                                    <polyline
                                      fill="none"
                                      stroke="rgb(148 163 184)"
                                      strokeWidth="1.5"
                                      points={sparklinePoints(klineByCode[code]?.closes ?? [])}
                                    />
                                  </svg>
                                </div>
                                {already ? (
                                  <div className="shrink-0 text-xs text-slate-500">已在自选</div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => addToWatchlist(code)}
                                    className="shrink-0 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                                  >
                                    加入自选
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500">未解析</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs text-slate-400">{it.timeText}</div>
                  {it.url ? (
                    <button
                      type="button"
                      disabled={loadingByRank[it.rank]}
                      onClick={async () => {
                        setLoadingByRank((m) => ({ ...m, [it.rank]: true }))
                        setErrorByRank((m) => {
                          const next = { ...m }
                          delete next[it.rank]
                          return next
                        })
                        try {
                          const res = await getThsClassicArticleStocks(it.url, { limit: 10 })
                          const codes = (res.codes ?? [])
                            .map((x) => String(x).toUpperCase())
                            .filter((x) => /^\d{6}$/.test(x))
                          setParsed({ url: it.url, codes })

                          const uniq = Array.from(new Set(codes))
                          for (const code of uniq) {
                            void getQuote(code)
                              .then((q) => {
                                setQuoteByCode((m) => ({
                                  ...m,
                                  [code]: {
                                    name: q.name,
                                    marketCapYuan: q.marketCapYuan,
                                    floatMarketCapYuan: q.floatMarketCapYuan,
                                    pe: q.pe,
                                  },
                                }))
                              })
                              .catch(() => void 0)

                            void getRatios(code, 'latest')
                              .then((r) => {
                                setFieldsByCode((m) => ({
                                  ...m,
                                  [code]: {
                                    cash: r.fields?.cash,
                                    totalAssets: r.fields?.totalAssets,
                                    netAssets: r.fields?.netAssets,
                                  },
                                }))
                              })
                              .catch(() => void 0)

                            void getKline(code, { klt: '101', fqt: '1', limit: 22 })
                              .then((k) => {
                                const closes = (k.candles ?? [])
                                  .map((c) => c.close)
                                  .filter((x) => Number.isFinite(x))
                                setKlineByCode((m) => ({ ...m, [code]: { closes } }))
                              })
                              .catch(() => void 0)
                          }
                        } catch (e: unknown) {
                          setErrorByRank((m) => ({ ...m, [it.rank]: e instanceof Error ? e.message : String(e) }))
                        } finally {
                          setLoadingByRank((m) => ({ ...m, [it.rank]: false }))
                        }
                      }}
                      className="mt-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-60"
                    >
                      {loadingByRank[it.rank]
                        ? '解析中…'
                        : (parsedByUrl[it.url]?.codes ?? []).length
                          ? '重新解析'
                          : '解析(10股)'}
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
