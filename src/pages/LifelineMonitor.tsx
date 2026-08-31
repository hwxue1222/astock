import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '@/components/TopBar'
import { useStockStore } from '@/stores/stockStore'
import { cn } from '@/lib/utils'

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
  turnover_check?: {
    high_days: number
    total_days: number
    avg_turnover: number
  }
}

type ScanResult = {
  success: boolean
  scanned: number
  total_universe: number
  found: number
  stocks: LifelineStock[]
  error?: string
}

function formatVolume(v: number): string {
  if (v >= 100000000) return (v / 100000000).toFixed(1) + '亿'
  if (v >= 10000) return (v / 10000).toFixed(0) + '万'
  return String(v)
}

export default function LifelineMonitor() {
  const navigate = useNavigate()
  const [stocks, setStocks] = useState<LifelineStock[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  const watchlist = useStockStore((s) => s.watchlist)
  const addToWatchlist = useStockStore((s) => s.addToWatchlist)

  // 加载本地缓存的扫描结果
  useEffect(() => {
    fetch('/watchlist_lifeline.json')
      .then((res) => res.json())
      .then((data: LifelineStock[]) => {
        data.sort((a, b) => b.ll_vol_ratio - a.ll_vol_ratio)
        setStocks(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleScan = async () => {
    setScanning(true)
    setScanError(null)
    setScanResult(null)
    try {
      const res = await fetch('/api/scan-lifeline')
      const data = await res.json()
      if (!data.success) {
        setScanError(data.error || '扫描失败')
        setScanning(false)
        return
      }
      setScanResult(data as ScanResult)
      // 更新列表显示
      const found = (data.stocks ?? []) as LifelineStock[]
      found.sort((a: LifelineStock, b: LifelineStock) => b.ll_vol_ratio - a.ll_vol_ratio)
      setStocks(found)
    } catch (e: unknown) {
      setScanError(e instanceof Error ? e.message : '网络请求失败')
    } finally {
      setScanning(false)
    }
  }

  const isInWatchlist = (code: string) => {
    return watchlist.map((x) => x.toUpperCase()).includes(code.toUpperCase())
  }

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
                {scanResult
                  ? `扫描 ${scanResult.scanned} 只候选股（全市场 ${scanResult.total_universe} 只），命中 ${scanResult.found} 只`
                  : `最近5天出现生命线（阳线+放量≥3倍+涨幅0.1%~7%）| 共 ${stocks.length} 只`}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={scanning}
                onClick={handleScan}
                className={cn(
                  'inline-flex items-center rounded-lg px-3 py-2 text-xs font-semibold text-white',
                  scanning
                    ? 'cursor-not-allowed bg-slate-700'
                    : 'bg-emerald-600 hover:bg-emerald-500',
                )}
              >
                {scanning ? (
                  <>
                    <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    扫描中…
                  </>
                ) : (
                  '🚀 扫描全A股'
                )}
              </button>
            </div>
          </div>

          {scanError ? (
            <div className="mx-4 mt-3 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-xs text-red-200">
              ❌ 扫描失败: {scanError}
            </div>
          ) : null}

          {scanResult && !scanError ? (
            <div className="mx-4 mt-3 rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200">
              ✅ 扫描完成: 从 {scanResult.total_universe} 只股票中筛选出 {scanResult.scanned} 只候选股，
              命中 {scanResult.found} 只生命线股票
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
                {loading && !scanning ? (
                  <tr>
                    <td className="px-4 py-4 text-slate-400" colSpan={9}>
                      加载中…
                    </td>
                  </tr>
                ) : stocks.length ? (
                  stocks.map((s, i) => (
                    <tr
                      key={s.code}
                      className="border-t border-slate-800 hover:bg-slate-900/40"
                    >
                      <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-slate-100">
                          {s.code}
                        </div>
                        <div className="text-xs text-slate-400">{s.name}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-200">{s.ll_date}</td>
                      <td className="px-4 py-3 text-emerald-400">{s.ll_close.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'text-xs font-semibold',
                            s.ll_pct_chg >= 0 ? 'text-red-300' : 'text-emerald-300',
                          )}
                        >
                          {s.ll_pct_chg >= 0 ? '+' : ''}
                          {s.ll_pct_chg.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-amber-400">{formatVolume(s.ll_volume)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-bold text-white ${
                            s.ll_vol_ratio >= 5 ? 'bg-amber-500' : 'bg-sky-500'
                          }`}
                        >
                          {s.ll_vol_ratio.toFixed(2)}x
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {s.turnover_check ? (
                          <div className="space-y-0.5">
                            <div className="text-slate-300">
                              平均: {s.turnover_check.avg_turnover}%
                            </div>
                            <div
                              className={cn(
                                s.turnover_check.high_days <= 3
                                  ? 'text-emerald-400'
                                  : 'text-red-400',
                              )}
                            >
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
                            onClick={() =>
                              navigate(`/stocks/${encodeURIComponent(s.code)}`)
                            }
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
                      暂无生命线股票，点击"扫描全A股"按钮开始扫描
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
