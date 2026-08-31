import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '@/components/TopBar'
import { useStockStore } from '@/stores/stockStore'
import { cn } from '@/lib/utils'
import type { KlineCandle } from '@/types/stock'

type Candidate = {
  code: string
  name: string
  changepercent: number
}

type TurnoverCheck = {
  high_days: number
  total_days: number
  avg_turnover: number
}

type LifelineStock = {
  code: string
  name: string
  ll_date: string
  ll_close: number
  ll_open: number
  ll_low: number
  ll_volume: number
  ll_vol_ratio: number
  ll_pct_chg: number
  turnover_check?: TurnoverCheck
}

type ScanState = {
  status: 'idle' | 'running' | 'stopped' | 'done'
  total: number
  processed: number
  found: number
  currentCode: string
  error: string | null
}

const CONCURRENCY = 5
const KLINE_DAYS = 200

function formatVolume(v: number): string {
  if (v >= 100000000) return (v / 100000000).toFixed(1) + '亿'
  if (v >= 10000) return (v / 10000).toFixed(0) + '万'
  return String(v)
}

function detectLifeline(candles: KlineCandle[]): { candle: KlineCandle; volRatio: number; pctChg: number } | null {
  if (candles.length < 5) return null

  const recent5 = candles.slice(-5)

  for (let i = 0; i < recent5.length; i++) {
    const c = recent5[i]
    const globalIdx = candles.length - recent5.length + i

    if (c.close <= c.open) continue

    const pctChg = ((c.close - c.open) / c.open) * 100
    if (pctChg < 0.1 || pctChg > 7) continue

    if (globalIdx < 3) continue
    const prev3 = [candles[globalIdx - 1], candles[globalIdx - 2], candles[globalIdx - 3]]
    const maxPrev3 = Math.max(...prev3.map((x) => x.volume))
    if (maxPrev3 <= 0) continue

    const volRatio = c.volume / maxPrev3
    if (volRatio < 3) continue

    return { candle: c, volRatio, pctChg }
  }

  return null
}

function checkTurnover(candles: KlineCandle[]): TurnoverCheck | null {
  const recent = candles.slice(-60)
  if (recent.length < 30) return null

  let highDays = 0
  let totalTurnover = 0

  for (const c of recent) {
    const t = c.turnover ?? 0
    if (t >= 2) highDays++
    totalTurnover += t
  }

  return {
    high_days: highDays,
    total_days: recent.length,
    avg_turnover: totalTurnover / recent.length,
  }
}

const CACHE_KEY = 'lifeline_scan_results'

export default function LifelineMonitor() {
  const navigate = useNavigate()
  const [stocks, setStocks] = useState<LifelineStock[]>([])
  const [loading, setLoading] = useState(true)
  const [scanState, setScanState] = useState<ScanState>({
    status: 'idle',
    total: 0,
    processed: 0,
    found: 0,
    currentCode: '',
    error: null,
  })

  const abortRef = useRef(false)

  const watchlist = useStockStore((s) => s.watchlist)
  const addToWatchlist = useStockStore((s) => s.addToWatchlist)

  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const parsed = JSON.parse(cached) as LifelineStock[]
        parsed.sort((a, b) => b.ll_vol_ratio - a.ll_vol_ratio)
        setStocks(parsed)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  const saveToCache = useCallback((data: LifelineStock[]) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data))
    } catch {
      // ignore
    }
  }, [])

  const handleScan = async () => {
    abortRef.current = false
    setStocks([])
    setScanState({
      status: 'running',
      total: 0,
      processed: 0,
      found: 0,
      currentCode: '',
      error: null,
    })

    try {
      const res = await fetch('/api/stocks/scan-lifeline')
      const data = await res.json()

      if (!data.success) {
        setScanState((prev) => ({ ...prev, status: 'stopped', error: data.error || '获取候选列表失败' }))
        return
      }

      const candidates: Candidate[] = data.candidates ?? []
      if (!candidates.length) {
        setScanState((prev) => ({ ...prev, status: 'done', total: 0 }))
        return
      }

      setScanState((prev) => ({ ...prev, total: candidates.length }))

      const queue = [...candidates]

      const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length > 0) {
          if (abortRef.current) break

          const candidate = queue.shift()!
          setScanState((prev) => ({ ...prev, currentCode: candidate.code }))

          try {
            const klineRes = await fetch(`/api/stocks/${encodeURIComponent(candidate.code)}/kline?limit=${KLINE_DAYS}`)
            const klineData = await klineRes.json()

            if (!klineData.success || !klineData.candles?.length) {
              setScanState((prev) => ({ ...prev, processed: prev.processed + 1 }))
              continue
            }

            const candles: KlineCandle[] = klineData.candles
            const ll = detectLifeline(candles)

            if (ll) {
              const stock: LifelineStock = {
                code: candidate.code,
                name: candidate.name,
                ll_date: ll.candle.ts,
                ll_close: ll.candle.close,
                ll_open: ll.candle.open,
                ll_low: ll.candle.low,
                ll_volume: ll.candle.volume,
                ll_vol_ratio: ll.volRatio,
                ll_pct_chg: ll.pctChg,
                turnover_check: checkTurnover(candles) ?? undefined,
              }

              setStocks((prev) => {
                const next = [...prev, stock].sort((a, b) => b.ll_vol_ratio - a.ll_vol_ratio)
                saveToCache(next)
                return next
              })
              setScanState((prev) => ({
                ...prev,
                found: prev.found + 1,
                processed: prev.processed + 1,
              }))
            } else {
              setScanState((prev) => ({ ...prev, processed: prev.processed + 1 }))
            }
          } catch {
            setScanState((prev) => ({ ...prev, processed: prev.processed + 1 }))
          }
        }
      })

      await Promise.all(workers)

      if (!abortRef.current) {
        setScanState((prev) => ({ ...prev, status: 'done', currentCode: '' }))
      }
    } catch (e: unknown) {
      setScanState((prev) => ({
        ...prev,
        status: 'stopped',
        error: e instanceof Error ? e.message : '扫描失败',
      }))
    }
  }

  const handleStop = () => {
    abortRef.current = true
    setScanState((prev) => ({ ...prev, status: 'stopped', currentCode: '' }))
  }

  const handleClear = () => {
    setStocks([])
    localStorage.removeItem(CACHE_KEY)
  }

  const isInWatchlist = (code: string) => {
    return watchlist.map((x) => x.toUpperCase()).includes(code.toUpperCase())
  }

  const progressPct = scanState.total > 0 ? Math.round((scanState.processed / scanState.total) * 100) : 0

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <TopBar
        title="生命线选股监控"
        universe={[]}
        selectedSymbol={null}
        onSelectSymbol={(s) => navigate(`/stocks/${encodeURIComponent(s)}`)}
        updatedAt={null}
        onBack={() => navigate('/')}
        onOpenDetail={null}
      />

      <div className="mx-auto max-w-[1440px] px-4 py-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-950">
          <div className="flex flex-col gap-3 border-b border-slate-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-100">生命线选股监控</div>
              <div className="text-xs text-slate-400">
                {scanState.status === 'running'
                  ? `扫描中: ${scanState.processed}/${scanState.total} (${progressPct}%) | 当前: ${scanState.currentCode} | 命中 ${scanState.found} 只`
                  : scanState.status === 'done'
                    ? `扫描完成: ${scanState.processed}/${scanState.total} | 命中 ${scanState.found} 只生命线股票`
                    : `最近5天出现生命线（阳线+放量≥3倍+涨幅0.1%~7%）| 共 ${stocks.length} 只`}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {scanState.status === 'running' ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="inline-flex items-center rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500"
                >
                  <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  停止扫描
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleScan}
                  className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  🚀 扫描全A股
                </button>
              )}
              {stocks.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
                >
                  🗑 清空结果
                </button>
              )}
            </div>
          </div>

          {scanState.status === 'running' && scanState.total > 0 && (
            <div className="border-b border-slate-800 px-4 py-3">
              <div className="h-2 w-full rounded-full bg-slate-800">
                <div
                  className="h-2 rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-slate-400">
                正在分析: {scanState.currentCode || '等待中...'}
              </div>
            </div>
          )}

          {scanState.error ? (
            <div className="mx-4 mt-3 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-xs text-red-200">
              ❌ 扫描失败: {scanState.error}
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-900/40 text-xs text-slate-300">
                <tr>
                  <th className="px-4 py-3">序号</th>
                  <th className="px-4 py-3">代码</th>
                  <th className="px-4 py-3">生命线日期</th>
                  <th className="px-4 py-3">收盘价</th>
                  <th className="px-4 py-3">涨跌幅</th>
                  <th className="px-4 py-3">成交量</th>
                  <th className="px-4 py-3">放量倍数</th>
                  <th className="px-4 py-3">换手率检查</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading && scanState.status === 'idle' ? (
                  <tr>
                    <td className="px-4 py-4 text-slate-400" colSpan={9}>
                      加载中…
                    </td>
                  </tr>
                ) : stocks.length ? (
                  stocks.map((s, i) => (
                    <tr key={s.code} className="border-t border-slate-800 hover:bg-slate-900/40">
                      <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-slate-100">{s.code}</div>
                        <div className="text-xs text-slate-400">{s.name}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-200">{s.ll_date}</td>
                      <td className="px-4 py-3 text-emerald-400">{s.ll_close.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span className={cn('text-xs font-semibold', s.ll_pct_chg >= 0 ? 'text-red-300' : 'text-emerald-300')}>
                          {s.ll_pct_chg >= 0 ? '+' : ''}
                          {s.ll_pct_chg.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-amber-400">{formatVolume(s.ll_volume)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-bold text-white ${s.ll_vol_ratio >= 5 ? 'bg-amber-500' : 'bg-sky-500'}`}>
                          {s.ll_vol_ratio.toFixed(2)}x
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {s.turnover_check ? (
                          <div className="space-y-0.5">
                            <div className="text-slate-300">平均: {s.turnover_check.avg_turnover.toFixed(2)}%</div>
                            <div className={cn(s.turnover_check.high_days <= 3 ? 'text-emerald-400' : 'text-red-400')}>
                              {s.turnover_check.high_days}/{s.turnover_check.total_days} 天≥2%
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => navigate(`/stocks/${encodeURIComponent(s.code)}`)}
                            className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800"
                          >
                            详情
                          </button>
                          <button
                            type="button"
                            onClick={() => addToWatchlist(s.code)}
                            disabled={isInWatchlist(s.code)}
                            className={cn(
                              'rounded-lg px-2.5 py-1 text-xs',
                              isInWatchlist(s.code)
                                ? 'cursor-not-allowed border border-slate-800 bg-slate-900 text-slate-500'
                                : 'border border-emerald-800 bg-emerald-950 text-emerald-200 hover:bg-emerald-900',
                            )}
                          >
                            {isInWatchlist(s.code) ? '已加' : '+自选'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-4 text-slate-400" colSpan={9}>
                      {scanState.status === 'running'
                        ? '正在扫描中，请稍候…'
                        : '暂无生命线股票，点击"扫描全A股"按钮开始扫描'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
