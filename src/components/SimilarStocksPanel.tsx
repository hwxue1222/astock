import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSimilarStocks } from '@/lib/stockApi'
import { cn } from '@/lib/utils'
import { useStockStore } from '@/stores/stockStore'
import type { KlineFqt, KlineKlt, SimilarStocksResponse } from '@/types/stock'

export default function SimilarStocksPanel(props: {
  targetSymbol: string
  klt: KlineKlt
  fqt: KlineFqt
  days: number
  mode?: 'mixed' | 'kline'
}) {
  const navigate = useNavigate()
  const standards = useStockStore((s) => s.similarStandards)
  const setStandard = useStockStore((s) => s.setSimilarStandard)
  const addManyToWatchlist = useStockStore((s) => s.addManyToWatchlist)

  const mode = props.mode ?? 'mixed'

  const [data, setData] = useState<SimilarStocksResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [runKey, setRunKey] = useState(0)

  const watchlist = useStockStore((s) => s.watchlist)
  const addToWatchlist = useStockStore((s) => s.addToWatchlist)
  const watchlistSet = useMemo(() => new Set(watchlist.map((x) => String(x).toUpperCase())), [watchlist])

  useEffect(() => {
    if (runKey === 0) return
    const ac = new AbortController()
    setLoading(true)
    setError(null)

    const enabled: Array<1 | 2 | 3> = [
      mode === 'mixed' && standards.s1.enabled ? 1 : null,
      standards.s2.enabled ? 2 : null,
      standards.s3.enabled ? 3 : null,
    ].filter((x): x is 1 | 2 | 3 => x !== null)

    if (mode === 'kline' && !enabled.includes(2) && !enabled.includes(3)) {
      setError('请至少勾选“标准1”或“标准2”')
      setData(null)
      setLoading(false)
      return () => ac.abort()
    }

    getSimilarStocks(
      props.targetSymbol,
      {
        days: props.days,
        top: 10,
        klt: props.klt,
        fqt: props.fqt,
        enabled,
        s1MaxMarketCapYi: mode === 'mixed' ? standards.s1.maxMarketCapYi : undefined,
        s2LastDays: standards.s2.lastDays,
        s2TurnoverSpikeMultiple: standards.s2.turnoverSpikeMultiple,
        s2PreselectTop: standards.s2.preselectTop,
        s3DailyDays: standards.s3.dailyDays,
        s3MonthlyMonths: standards.s3.monthlyMonths,
        s3MinSimilarity: standards.s3.minSimilarity,
      },
      ac.signal,
    )
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
  }, [props.targetSymbol, props.klt, props.fqt, props.days, runKey, standards])

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <div className="text-sm font-semibold text-slate-100">相似选股</div>

      <div className="mt-3 space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="text-xs font-semibold text-slate-200">选股标准</div>

        {mode === 'mixed' ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-200">
              <input
                type="checkbox"
                checked={standards.s1.enabled}
                onChange={(e) => setStandard('s1', { enabled: e.target.checked })}
              />
              标准1
            </label>
            <div className="text-xs text-slate-400">总市值 ≤</div>
            <input
              type="number"
              value={standards.s1.maxMarketCapYi}
              min={1}
              step={1}
              onChange={(e) => setStandard('s1', { maxMarketCapYi: Number(e.target.value) })}
              className="w-24 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
            />
            <div className="text-xs text-slate-400">亿</div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-200">
            <input
              type="checkbox"
              checked={standards.s2.enabled}
              onChange={(e) => setStandard('s2', { enabled: e.target.checked })}
            />
            标准1
          </label>
          <div className="text-xs text-slate-400">近</div>
          <input
            type="number"
            value={standards.s2.lastDays}
            min={3}
            max={15}
            step={1}
            onChange={(e) => setStandard('s2', { lastDays: Number(e.target.value) })}
            className="w-16 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          />
          <div className="text-xs text-slate-400">日内有涨停/跌停 + 成交量突增 ≥</div>
          <input
            type="number"
            value={standards.s2.turnoverSpikeMultiple}
            min={1.2}
            step={0.1}
            onChange={(e) => setStandard('s2', { turnoverSpikeMultiple: Number(e.target.value) })}
            className="w-20 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          />
          <div className="text-xs text-slate-400">倍</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-200">
            <input
              type="checkbox"
              checked={standards.s3.enabled}
              onChange={(e) => setStandard('s3', { enabled: e.target.checked })}
            />
            标准2
          </label>
          <div className="text-xs text-slate-400">与</div>
          <div className="text-xs font-semibold text-slate-100">{props.targetSymbol}</div>
          <div className="text-xs text-slate-400">股票 K 线形态近似 ≥</div>
          <input
            type="number"
            value={Math.round(standards.s3.minSimilarity * 100)}
            min={50}
            max={99}
            step={1}
            onChange={(e) => setStandard('s3', { minSimilarity: Number(e.target.value) / 100 })}
            className="w-16 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          />
          <div className="text-xs text-slate-400">%（近</div>
          <input
            type="number"
            value={standards.s3.monthlyMonths}
            min={6}
            max={60}
            step={1}
            onChange={(e) => setStandard('s3', { monthlyMonths: Number(e.target.value) })}
            className="w-16 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          />
          <div className="text-xs text-slate-400">个月月线 + 近</div>
          <input
            type="number"
            value={standards.s3.dailyDays}
            min={3}
            max={20}
            step={1}
            onChange={(e) => setStandard('s3', { dailyDays: Number(e.target.value) })}
            className="w-16 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          />
          <div className="text-xs text-slate-400">日日线）</div>
        </div>
      </div>

      <div className="mt-2 text-xs text-slate-500">
        标准1=近N日涨跌停事件+成交量突增过滤并按近N日形态相似打分；标准2=月线(近N个月)+日线(近N日)综合相似度阈值 · 候选范围：全市场（失败时回退最近缓存）
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRunKey((x) => x + 1)}
          className="inline-flex flex-1 items-center justify-center rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-white"
        >
          计算相似股清单
        </button>
        {data?.top?.length ? (
          <button
            type="button"
            onClick={() => addManyToWatchlist(data.top.map((x) => x.symbol))}
            className="whitespace-nowrap rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            全部加入自选
          </button>
        ) : null}
      </div>

      <div className="mt-3">
        {loading ? (
          <div className="text-sm text-slate-400">计算中…</div>
        ) : error ? (
          <div className="text-sm text-red-200">{error}</div>
        ) : data?.top?.length ? (
          <div className="space-y-2">
            {data.top.map((it) => {
              const already = watchlistSet.has(String(it.symbol).toUpperCase())
              return (
                <div
                  key={it.symbol}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => navigate(`/stocks/${encodeURIComponent(it.symbol)}`)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-sm font-semibold text-slate-100">
                      {it.symbol}
                      {it.name ? <span className="text-slate-400"> · {it.name}</span> : null}
                    </div>
                    <div className="text-xs text-slate-500">score: {(it.score * 100).toFixed(1)}%</div>
                  </button>
                  <div className="flex items-center gap-2">
                    {already ? (
                      <div className="text-xs text-slate-500">已在自选</div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => addToWatchlist(it.symbol)}
                        className="whitespace-nowrap rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                      >
                        加入自选
                      </button>
                    )}
                    <div className="text-xs text-slate-500">查看</div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-sm text-slate-400">暂无结果</div>
        )}
      </div>
    </div>
  )
}
