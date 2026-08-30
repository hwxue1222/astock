import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '@/components/TopBar'
import type { StockItem } from '@/types/stock'

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

export default function LifelineMonitor() {
  const navigate = useNavigate()
  const [stocks, setStocks] = useState<LifelineStock[]>([])
  const [loading, setLoading] = useState(true)

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
        <div className="mb-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
          <div className="text-sm font-semibold text-slate-100">生命线选股监控</div>
          <div className="text-xs text-slate-400">
            最近3天出现生命线（阳线+放量≥3倍）| 共 {stocks.length} 只 | 数据日期: 2026-08-28
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-slate-400">加载中…</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {stocks.map((s, i) => (
              <div
                key={s.code}
                className="rounded-xl border border-slate-800 bg-slate-950 p-4 transition-transform hover:-translate-y-0.5"
                style={{ borderLeftWidth: '4px', borderLeftColor: s.ll_vol_ratio >= 5 ? '#f59e0b' : '#0ea5e9' }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-base font-bold text-slate-100">{s.code.split('.')[0]}</div>
                    <div className="text-xs text-slate-400">{s.name}</div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold text-white ${
                      s.ll_vol_ratio >= 5 ? 'bg-amber-500' : 'bg-sky-500'
                    }`}
                  >
                    放量 {s.ll_vol_ratio.toFixed(2)}x
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-slate-900 p-2 text-center">
                    <div className="text-[11px] text-slate-400">生命线日期</div>
                    <div className="text-sm font-semibold text-slate-100">{s.ll_date}</div>
                  </div>
                  <div className="rounded-lg bg-slate-900 p-2 text-center">
                    <div className="text-[11px] text-slate-400">收盘价</div>
                    <div className="text-sm font-semibold text-emerald-400">{s.ll_close.toFixed(2)}</div>
                  </div>
                  <div className="rounded-lg bg-slate-900 p-2 text-center">
                    <div className="text-[11px] text-slate-400">开盘价</div>
                    <div className="text-sm font-semibold text-slate-100">{s.ll_open.toFixed(2)}</div>
                  </div>
                  <div className="rounded-lg bg-slate-900 p-2 text-center">
                    <div className="text-[11px] text-slate-400">成交量</div>
                    <div className="text-sm font-semibold text-amber-400">
                      {s.ll_volume >= 100000000
                        ? (s.ll_volume / 100000000).toFixed(1) + '亿'
                        : s.ll_volume >= 10000
                        ? (s.ll_volume / 10000).toFixed(0) + '万'
                        : s.ll_volume}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(`/stocks/${encodeURIComponent(s.code.split('.')[0])}`)}
                  className="mt-3 w-full rounded-lg border border-slate-800 bg-slate-900 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                >
                  查看详情
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
