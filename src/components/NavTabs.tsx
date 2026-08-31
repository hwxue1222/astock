import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import ChangePasswordModal from './ChangePasswordModal'

type TabKey = 'overview' | 'watchlist' | 'lifeline' | 'similar'

const TAB_LIST: { key: TabKey; label: string }[] = [
  { key: 'overview', label: '📊 宏观概览' },
  { key: 'watchlist', label: '⭐ 自选股' },
  { key: 'lifeline', label: '🎯 5阶段策略' },
  { key: 'similar', label: '🔍 相似股票' },
]

export default function NavTabs(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const [showPwdModal, setShowPwdModal] = useState(false)

  // 判断当前激活的标签（仅在首页 / 路径下高亮）
  const activeTab: TabKey | null = (() => {
    if (location.pathname !== '/') return null
    const stateTab = (location.state as { activeTab?: string } | null)?.activeTab
    if (stateTab && TAB_LIST.some((t) => t.key === stateTab)) return stateTab as TabKey
    return 'overview'
  })()

  return (
    <>
      <div className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-2">
          {TAB_LIST.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                if (tab.key === 'lifeline') {
                  navigate('/lifeline')
                } else {
                  navigate('/', { state: { activeTab: tab.key } })
                }
              }}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200',
              )}
            >
              {tab.label}
            </button>
          ))}
          <div className="ml-auto">
            <button
              type="button"
              onClick={() => setShowPwdModal(true)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              🔒 修改密码
            </button>
          </div>
        </div>
      </div>
      {showPwdModal && <ChangePasswordModal onClose={() => setShowPwdModal(false)} />}
    </>
  )
}
