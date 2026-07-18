import { useEffect, useState } from 'react'
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
}) {
  const navigate = useNavigate()
  const standards = useStockStore((s) => s.similarStandards)
  const setStandard = useStockStore((s) => s.setSimilarStandard)
  const addManyToWatchlist = useStockStore((s) => s.addManyToWatchlist)
  const standardSymbol = useStockStore((s) => s.standardSymbol)
  const setStandardSymbol = useStockStore((s) => s.setStandardSymbol)
  const clearStandardSymbol = useStockStore((s) => s.clearStandardSymbol)

  const [standardDraft, setStandardDraft] = useState<string>(() => String(standardSymbol ?? '').toUpperCase())

  useEffect(() => {
    setStandardDraft(String(standardSymbol ?? '').toUpperCase())
  }, [standardSymbol])

  const standardDraftCode = String(standardDraft ?? '').match(/(\d{6})/)?.[1] ?? ''
  const compareSymbol = standardSymbol ?? props.targetSymbol

  const [data, setData] = useState<SimilarStocksResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [runKey, setRunKey] = useState(0)

  useEffect(() => {
    if (runKey === 0) return
    const ac = new AbortController()
    setLoading(true)
    setError(null)

    const enabled: Array<1 | 2 | 3> = [
      standards.s1.enabled ? 1 : null,
      standards.s2.enabled ? 2 : null,
      standards.s3.enabled ? 3 : null,
    ].filter((x): x is 1 | 2 | 3 => x !== null)

    getSimilarStocks(
      compareSymbol,
      {
        days: props.days,
        top: 10,
        klt: props.klt,
        fqt: props.fqt,
        enabled,
        s1MaxMarketCapYi: standards.s1.maxMarketCapYi,
        s2LastDays: standards.s2.lastDays,
        s2TurnoverSpikeMultiple: standards.s2.turnoverSpikeMultiple,
        s2PreselectTop: standards.s2.preselectTop,
        s3LastDays: standards.s3.lastDays,
        s3RangeRatioMin: standards.s3.rangeRatioMin,
        s3RangeRatioMax: standards.s3.rangeRatioMax,
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
  }, [compareSymbol, props.klt, props.fqt, props.days, runKey, standards])

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <div className="text-sm font-semibold text-slate-100">相似股票</div>

      <div className="mt-3 space-y-2 rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="text-xs font-semibold text-slate-200">选股标准</div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs text-slate-400">对比股票</div>
          <input
            value={standardDraft}
            onChange={(e) => setStandardDraft(e.target.value)}
            placeholder="输入6位股票代码"
            className="w-40 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200"
          />
          <button
            type="button"
            disabled={!standardDraftCode}
            onClick={() => {
              if (!standardDraftCode) return
              setStandardSymbol(standardDraftCode)
            }}
            className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-60"
          >
            设为对比
          </button>
          <button
            type="button"
            disabled={!standardSymbol}
            onClick={() => clearStandardSymbol()}
            className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-60"
          >
            清除
          </button>
          <div className="text-xs font-semibold text-slate-100">{compareSymbol}</div>
        </div>

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

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-200">
            <input
              type="checkbox"
              checked={standards.s2.enabled}
              onChange={(e) => setStandard('s2', { enabled: e.target.checked })}
            />
            标准2
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
          <div className="text-xs text-slate-400">日 K 线形态与对比股相似</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-200">
            <input
              type="checkbox"
              checked={standards.s3.enabled}
              onChange={(e) => setStandard('s3', { enabled: e.target.checked })}
            />
            标准3
          </label>
          <div className="text-xs text-slate-400">近</div>
          <input
            type="number"
            value={standards.s3.lastDays}
            min={3}
            max={30}
            step={1}
            onChange={(e) => setStandard('s3', { lastDays: Number(e.target.value) })}
            className="w-16 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          />
          <div className="text-xs text-slate-400">日波动比(候选/标准) ∈</div>
          <input
            type="number"
            value={standards.s3.rangeRatioMin}
            min={0.1}
            step={0.1}
            onChange={(e) => setStandard('s3', { rangeRatioMin: Number(e.target.value) })}
            className="w-16 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          />
          <div className="text-xs text-slate-400">~</div>
          <input
            type="number"
            value={standards.s3.rangeRatioMax}
            min={0.1}
            step={0.1}
            onChange={(e) => setStandard('s3', { rangeRatioMax: Number(e.target.value) })}
            className="w-16 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          />
        </div>
      </div>

      <div className="mt-2 text-xs text-slate-500">候选范围：全市场（优先实时市场列表，失败时回退最近缓存）</div>

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
            加入自选
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
            {data.top.map((it) => (
              <button
                key={it.symbol}
                type="button"
                onClick={() => navigate(`/stocks/${encodeURIComponent(it.symbol)}`)}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-left hover:bg-slate-900',
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-100">
                    {it.symbol}
                    {it.name ? <span className="text-slate-400"> · {it.name}</span> : null}
                  </div>
                  <div className="text-xs text-slate-500">score: {(it.score * 100).toFixed(1)}%</div>
                </div>
                <div className="text-xs text-slate-500">查看</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-400">暂无结果</div>
        )}
      </div>
    </div>
  )
}
