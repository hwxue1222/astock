import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '@/components/TopBar'
import { cn } from '@/lib/utils'

type MaStock = {
  code: string
  name: string
  mktcapYi: number
  netAssetsYi: number | null
  maCount: number
  latestMaTitle: string
  latestMaDate: string
}

type ScanResult = {
  success: boolean
  scanned: number
  found: number
  stocks: MaStock[]
  error?: string
}

export default function MaScanner() {
  const navigate = useNavigate()
  const [stocks, setStocks] = useState<MaStock[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)

  const handleScan = async () => {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/stocks/scan-ma')
      const data = await res.json()
      if (!data.success) {
        setResult({ success: false, scanned: 0, found: 0, stocks: [], error: data.error })
        setLoading(false)
        return
      }
      setResult(data as ScanResult)
      setStocks(data.stocks ?? [])
    } catch (e: unknown) {
      setResult({
        success: false,
        scanned: 0,
        found: 0,
        stocks: [],
        error: e instanceof Error ? e.message : '请求失败',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <TopBar
        title="🐍 蛇吞象并购扫描"
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
              <div className="text-sm font-semibold text-slate-100">🐍 蛇吞象并购扫描</div>
              <div className="text-xs text-slate-400">
                {result
                  ? `扫描 ${result.scanned} 只小市值股，发现 ${result.found} 只近期有并购公告`
                  : '扫描市值较小的股票，发现近期有并购/收购/重组公告的标的'}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={handleScan}
                className={cn(
                  'inline-flex items-center rounded-lg px-3 py-2 text-xs font-semibold text-white',
                  loading
                    ? 'cursor-not-allowed bg-slate-700'
                    : 'bg-amber-600 hover:bg-amber-500',
                )}
              >
                {loading ? (
                  <>
                    <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    扫描中…
                  </>
                ) : (
                  '🐍 扫描蛇吞象'
                )}
              </button>
            </div>
          </div>

          {result?.error ? (
            <div className="mx-4 mt-3 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-xs text-red-200">
              ❌ 扫描失败: {result.error}
            </div>
          ) : null}

          {result && !result.error && result.found > 0 ? (
            <div className="mx-4 mt-3 rounded-lg border border-amber-800 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
              ✅ 扫描完成: 从 {result.scanned} 只小市值股中发现 {result.found} 只有近期并购公告
            </div>
          ) : result && !result.error ? (
            <div className="mx-4 mt-3 rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
              ℹ️ 扫描完成: {result.scanned} 只小市值股中未发现近期并购公告
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-slate-900/40 text-xs text-slate-300">
                <tr>
                  <th className="px-4 py-3">序号</th>
                  <th className="px-4 py-3">代码</th>
                  <th className="px-4 py-3">市值(亿)</th>
                  <th className="px-4 py-3">净资产(亿)</th>
                  <th className="px-4 py-3">并购公告数</th>
                  <th className="px-4 py-3">最近并购公告</th>
                  <th className="px-4 py-3">日期</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-4 text-slate-400" colSpan={8}>
                      扫描中，请稍候…（约需10-30秒）
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
                      <td className="px-4 py-3 text-slate-200">{s.mktcapYi.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        {s.netAssetsYi !== null ? (
                          <span
                            className={cn(
                              'font-semibold',
                              s.netAssetsYi > s.mktcapYi ? 'text-amber-400' : 'text-slate-200',
                            )}
                          >
                            {s.netAssetsYi.toFixed(2)}
                            {s.netAssetsYi > s.mktcapYi && ' 🐍'}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-lg bg-amber-900 px-2 py-0.5 text-xs font-bold text-amber-200">
                          {s.maCount}
                        </span>
                      </td>
                      <td className="max-w-xs px-4 py-3 text-xs text-slate-300" title={s.latestMaTitle}>
                        <div className="truncate">{s.latestMaTitle}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{s.latestMaDate}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => navigate(`/stocks/${encodeURIComponent(s.code)}`)}
                          className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800"
                        >
                          详情
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-4 text-slate-400" colSpan={8}>
                      点击"🐍 扫描蛇吞象"按钮开始扫描
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
