import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '@/components/TopBar'

type LifelineStock = {
  code: string
  name: string
  ll_date: string
  ll_close: number
  ll_open: number
  ll_low: number
  ll_volume: number
  ll_vol_ratio: number
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
  const [showTip, setShowTip] = useState(false)

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

  const handlePick = () => {
    setShowTip(true)
    setTimeout(() => setShowTip(false), 5000)
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
                最近3天出现生命线（阳线+放量≥3倍）| 共 {stocks.length} 只
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handlePick}
                className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                🚀 选股
              </button>
              <button
                type="button"
                onClick={() => navigate(0)}
                className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
              >
                刷新
              </button>
            </div>
          </div>

          {showTip ? (
            <div className="mx-4 mt-3 rounded-lg border border-amber-800 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
              请在本地运行 <code className="rounded bg-slate-900 px-1 py-0.5 text-slate-200">lifeline_scan.py</code> 脚本进行A股扫描选股，
              扫描结果将保存到 <code className="rounded bg-slate-900 px-1 py-0.5 text-slate-200">watchlist_lifeline.json</code>，
              然后点击"刷新"即可更新列表。
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-900/40 text-xs text-slate-300">
                <tr>
                  <th className="px-4 py-3">序号</th>
                  <th className="px-4 py-3">代码</th>
                  <th className="px-4 py-3">生命线日期</th>
                  <th className="px-4 py-3">收盘价</th>
                  <th className="px-4 py-3">开盘价</th>
                  <th className="px-4 py-3">最低价</th>
                  <th className="px-4 py-3">成交量</th>
                  <th className="px-4 py-3">放量倍数</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
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
                          {s.code.split('.')[0]}
                        </div>
                        <div className="text-xs text-slate-400">{s.name}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-200">{s.ll_date}</td>
                      <td className="px-4 py-3 text-emerald-400">{s.ll_close.toFixed(2)}</td>
                      <td className="px-4 py-3 text-slate-200">{s.ll_open.toFixed(2)}</td>
                      <td className="px-4 py-3 text-slate-200">{s.ll_low.toFixed(2)}</td>
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
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/stocks/${encodeURIComponent(s.code.split('.')[0])}`)
                          }
                          className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800"
                        >
                          查看详情
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-4 text-slate-400" colSpan={9}>
                      暂无生命线股票，点击"选股"按钮扫描A股
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
