import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getIndustryRotationForecast } from '@/lib/stockApi'
import { cn } from '@/lib/utils'
import type { IndustryRotationForecastResponse } from '@/types/stock'

function monthLabel(m: number): string {
  return `${m}月`
}

function formatPct(v?: number): string {
  if (v === undefined) return '—'
  if (!Number.isFinite(v)) return '—'
  const s = v >= 0 ? '+' : ''
  return `${s}${v.toFixed(2)}%`
}

function formatWan(v?: number): string {
  if (v === undefined) return '—'
  if (!Number.isFinite(v)) return '—'
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(0)}万`
}

export default function IndustryRotationForecastPanel(): JSX.Element {
  const navigate = useNavigate()
  const [years, setYears] = useState(10)
  const [industries, setIndustries] = useState(18)
  const [stocksPerIndustry, setStocksPerIndustry] = useState(3)
  const [top, setTop] = useState(8)
  const [months, setMonths] = useState<number[]>([9, 10, 11, 12])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<IndustryRotationForecastResponse | null>(null)

  const monthsText = useMemo(() => months.map(monthLabel).join('、'), [months])

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-100">行业轮动预测（资金流入 + 过去{years}年季节性）</div>
          <div className="mt-1 text-xs text-slate-500">仅供研究，不构成投资建议</div>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={() => {
            const ac = new AbortController()
            setLoading(true)
            setError(null)
            getIndustryRotationForecast(
              {
                months,
                years,
                top,
                industries,
                stocksPerIndustry,
              },
              ac.signal,
            )
              .then((d) => setData(d))
              .catch((e: unknown) => {
                setError(e instanceof Error ? e.message : String(e))
                setData(null)
              })
              .finally(() => setLoading(false))
            return () => ac.abort()
          }}
          className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-white disabled:opacity-60"
        >
          预测{monthsText}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="text-xs text-slate-400">参数</div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-400">年数</div>
          <input
            type="number"
            min={3}
            max={15}
            value={years}
            onChange={(e) => setYears(Math.max(3, Math.min(15, Number(e.target.value) || 10)))}
            className="w-16 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-400">行业数</div>
          <input
            type="number"
            min={6}
            max={30}
            value={industries}
            onChange={(e) => setIndustries(Math.max(6, Math.min(30, Number(e.target.value) || 18)))}
            className="w-16 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-400">每行业样本股</div>
          <input
            type="number"
            min={2}
            max={8}
            value={stocksPerIndustry}
            onChange={(e) => setStocksPerIndustry(Math.max(2, Math.min(8, Number(e.target.value) || 3)))}
            className="w-16 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-400">每月显示Top</div>
          <input
            type="number"
            min={3}
            max={15}
            value={top}
            onChange={(e) => setTop(Math.max(3, Math.min(15, Number(e.target.value) || 8)))}
            className="w-16 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {[9, 10, 11, 12].map((m) => {
            const checked = months.includes(m)
            return (
              <label key={m} className="flex items-center gap-2 text-xs text-slate-200">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    setMonths((cur) => {
                      const next = e.target.checked ? Array.from(new Set([...cur, m])) : cur.filter((x) => x !== m)
                      return next.length ? next.sort((a, b) => a - b) : [m]
                    })
                  }}
                />
                {monthLabel(m)}
              </label>
            )
          })}
        </div>
      </div>

      {loading ? <div className="mt-3 text-sm text-slate-400">计算中…（首次会更慢，后续有缓存）</div> : null}
      {error ? <div className="mt-3 text-sm text-red-200">{error}</div> : null}

      {data ? (
        <div className="mt-3 space-y-4">
          <div className="text-xs text-slate-500">
            更新日期 {data.asOfDate} · 分析行业 {data.meta.analyzedIndustries}/{data.meta.industryCount} · 数据源 {data.meta.source}
          </div>

          {data.months.map((mm) => (
            <div key={mm.month} className="overflow-hidden rounded-xl border border-slate-800">
              <div className="flex items-center justify-between bg-slate-900/70 px-3 py-2">
                <div className="text-xs font-semibold text-slate-200">{monthLabel(mm.month)} 热度Top {mm.top.length}</div>
                <div className="text-xs text-slate-500">score = 资金强度 + 季节性综合</div>
              </div>
              <div className="divide-y divide-slate-800">
                {mm.top.map((it, idx) => (
                  <div key={`${mm.month}-${it.name}`} className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-xs">
                    <div className="col-span-1 text-slate-500">{idx + 1}</div>
                    <div className="col-span-3 min-w-0 truncate text-slate-200">
                      <span className="truncate font-semibold text-slate-100">{it.name}</span>
                      {it.flowNetInflowRatePct !== undefined ? (
                        <span className="ml-2 inline-flex items-center rounded-md border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
                          资金 {formatPct(it.flowNetInflowRatePct)}
                        </span>
                      ) : null}
                    </div>
                    <div className="col-span-2 whitespace-nowrap text-right text-slate-300">score {it.score.toFixed(1)}</div>
                    <div className="col-span-2 whitespace-nowrap text-right text-slate-300">季节性 {formatPct(it.seasonalityAvgReturnPct)}</div>
                    <div className="col-span-2 whitespace-nowrap text-right text-slate-300">胜率 {formatPct(it.seasonalityPosRatePct)}</div>
                    <div className="col-span-2 flex flex-wrap justify-end gap-2">
                      {it.leaders.slice(0, 3).map((x) => (
                        <button
                          key={x.symbol}
                          type="button"
                          onClick={() => navigate(`/stocks/${encodeURIComponent(x.symbol)}`)}
                          className={cn(
                            'inline-flex items-center rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-800',
                          )}
                          title={x.name ? `${x.symbol} ${x.name}` : x.symbol}
                        >
                          {x.symbol}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

