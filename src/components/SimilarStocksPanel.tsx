import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSimilarStocks } from '@/lib/stockApi'
import { cn } from '@/lib/utils'
import { useStockStore } from '@/stores/stockStore'
import type { KlineFqt, KlineKlt, SimilarStocksResponse } from '@/types/stock'

type SimilarInput = Parameters<typeof getSimilarStocks>[1]

export default function SimilarStocksPanel(props: {
  targetSymbol: string
  klt: KlineKlt
  fqt: KlineFqt
  days: number
}) {
  const navigate = useNavigate()
  const standards = useStockStore((s) => s.similarStandards)
  const setStandard = useStockStore((s) => s.setSimilarStandard)
  const addToWatchlist = useStockStore((s) => s.addToWatchlist)
  const watchlist = useStockStore((s) => s.watchlist)
  const standardSymbol = useStockStore((s) => s.standardSymbol)
  const setStandardSymbol = useStockStore((s) => s.setStandardSymbol)
  const clearStandardSymbol = useStockStore((s) => s.clearStandardSymbol)
  const similarLast = useStockStore((s) => s.similarLast)
  const setSimilarLast = useStockStore((s) => s.setSimilarLast)

  const watchlistSet = useMemo(() => new Set(watchlist.map((x) => String(x).toUpperCase())), [watchlist])

  const [standardDraft, setStandardDraft] = useState<string>(() => String(standardSymbol ?? '').toUpperCase())

  useEffect(() => {
    setStandardDraft(String(standardSymbol ?? '').toUpperCase())
  }, [standardSymbol])

  const standardDraftCode = String(standardDraft ?? '').match(/(\d{6})/)?.[1] ?? ''
  const compareSymbol = standardSymbol ?? props.targetSymbol

  const data: SimilarStocksResponse | null = similarLast?.data ?? null
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [request, setRequest] = useState<{ symbol: string; input: SimilarInput; key: string } | null>(null)

  const currentPlannedKey = useMemo(() => {
    const enabled: Array<1 | 2 | 3> = [
      standards.s1.enabled ? 1 : null,
      standards.s2.enabled ? 2 : null,
      standards.s3.enabled ? 3 : null,
    ].filter((x): x is 1 | 2 | 3 => x !== null)

    const input: SimilarInput = {
      days: props.days,
      top: 10,
      klt: props.klt,
      fqt: props.fqt,
      enabled,
      s1MaxMarketCapYi: standards.s1.maxMarketCapYi,
      s2LastDays: standards.s2.lastDays,
      s2MinSimilarity: standards.s2.minSimilarity,
      s3LastDays: standards.s3.lastDays,
      s3ChangePct: standards.s3.changePct,
      s3VolumeMultiple: standards.s3.volumeMultiple,
    }

    return JSON.stringify({ symbol: compareSymbol, input })
  }, [compareSymbol, props.days, props.fqt, props.klt, standards])

  useEffect(() => {
    if (!request) return
    const ac = new AbortController()
    setLoading(true)
    setError(null)

    getSimilarStocks(request.symbol, request.input, ac.signal)
      .then((d) => {
        if (ac.signal.aborted) return
        setSimilarLast({ key: request.key, data: d, atISO: new Date().toISOString() })
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (ac.signal.aborted) return
        setLoading(false)
      })
    return () => ac.abort()
  }, [request, setSimilarLast])

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
            inputMode="numeric"
            value={String(standards.s1.maxMarketCapYi)}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, '')
              const v = raw ? Number(raw) : 0
              setStandard('s1', { maxMarketCapYi: v })
            }}
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
          <div className="text-xs text-slate-400">日 K 线形态与对比股相似 ≥</div>
          <input
            inputMode="numeric"
            value={String(Math.round(standards.s2.minSimilarity * 100))}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, '')
              const pct = raw ? Math.max(0, Math.min(100, Number(raw))) : 0
              setStandard('s2', { minSimilarity: pct / 100 })
            }}
            className="w-16 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          />
          <div className="text-xs text-slate-400">%</div>
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
          <div className="text-xs text-slate-400">最近</div>
          <input
            inputMode="numeric"
            value={String(standards.s3.lastDays)}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, '')
              const v = raw ? Math.max(1, Math.min(10, Number(raw))) : 1
              setStandard('s3', { lastDays: v })
            }}
            className="w-16 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          />
          <div className="text-xs text-slate-400">日内任一天涨跌幅 ≥</div>
          <input
            inputMode="decimal"
            value={String(standards.s3.changePct)}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9.]/g, '')
              const normalized = raw
                ? raw
                    .replace(/^0+(\d)/, '$1')
                    .replace(/\.(?=.*\.)/g, '')
                : ''
              const v = normalized ? Number(normalized) : 0
              setStandard('s3', { changePct: v })
            }}
            className="w-20 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          />
          <div className="text-xs text-slate-400">% 且 成交量 ≥ 前一日 ×</div>
          <input
            inputMode="decimal"
            value={String(standards.s3.volumeMultiple)}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9.]/g, '')
              const normalized = raw
                ? raw
                    .replace(/^0+(\d)/, '$1')
                    .replace(/\.(?=.*\.)/g, '')
                : ''
              const v = normalized ? Number(normalized) : 0
              setStandard('s3', { volumeMultiple: v })
            }}
            className="w-16 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          />
        </div>
      </div>

      <div className="mt-2 text-xs text-slate-500">候选范围：涨幅榜前100 + 跌幅榜前100</div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const enabled: Array<1 | 2 | 3> = [
              standards.s1.enabled ? 1 : null,
              standards.s2.enabled ? 2 : null,
              standards.s3.enabled ? 3 : null,
            ].filter((x): x is 1 | 2 | 3 => x !== null)

            const input: SimilarInput = {
              days: props.days,
              top: 10,
              klt: props.klt,
              fqt: props.fqt,
              enabled,
              s1MaxMarketCapYi: standards.s1.maxMarketCapYi,
              s2LastDays: standards.s2.lastDays,
              s2MinSimilarity: standards.s2.minSimilarity,
              s3LastDays: standards.s3.lastDays,
              s3ChangePct: standards.s3.changePct,
              s3VolumeMultiple: standards.s3.volumeMultiple,
            }
            const key = JSON.stringify({ symbol: compareSymbol, input })
            setRequest({ symbol: compareSymbol, input, key })
          }}
          className="inline-flex flex-1 items-center justify-center rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-white"
        >
          计算相似股清单
        </button>
      </div>

      {data && similarLast?.key !== currentPlannedKey ? (
        <div className="mt-2 text-xs text-slate-500">当前参数已变更；列表为上次计算结果</div>
      ) : null}

      <div className="mt-3">
        {loading ? (
          <div className="text-sm text-slate-400">计算中…</div>
        ) : error ? (
          <div className="text-sm text-red-200">{error}</div>
        ) : data?.top?.length ? (
          <div className="space-y-2">
            {data.top.map((it) => (
              <div
                key={it.symbol}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2',
                )}
              >
                <button
                  type="button"
                  onClick={() => navigate(`/stocks/${encodeURIComponent(it.symbol)}`)}
                  className="min-w-0 flex-1 text-left hover:opacity-95"
                >
                  <div className="truncate text-sm font-semibold text-slate-100">
                    {it.symbol}
                    {it.name ? <span className="text-slate-400"> · {it.name}</span> : null}
                  </div>
                  <div className="text-xs text-slate-500">score: {(it.score * 100).toFixed(1)}%</div>
                </button>

                {watchlistSet.has(it.symbol.toUpperCase()) ? (
                  <div className="shrink-0 text-xs text-slate-500">已在自选</div>
                ) : (
                  <button
                    type="button"
                    onClick={() => addToWatchlist(it.symbol)}
                    className="shrink-0 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    加入自选
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1 text-sm text-slate-400">
            <div>暂无结果</div>
            {standards.s2.enabled && standards.s2.minSimilarity >= 0.8 ? (
              <div className="text-xs text-slate-500">标准2阈值偏高；可先把相似度降到 60%~70% 试试</div>
            ) : null}
            {standards.s1.enabled || standards.s3.enabled ? (
              <div className="text-xs text-slate-500">也可能是叠加条件过严；可先只勾选一个标准验证</div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
