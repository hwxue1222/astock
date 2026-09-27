import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import ChangePasswordModal from './ChangePasswordModal'

type TabKey = 'overview' | 'watchlist' | 'lifeline' | 'rotation' | 'similar' | 'conceptFlow'

const HOME_TAB_STORAGE_KEY = 'home:activeTab'

const TAB_LIST: { key: TabKey; label: string }[] = [
  { key: 'overview', label: '📊 宏观概览' },
  { key: 'watchlist', label: '⭐ 自选股' },
  { key: 'lifeline', label: '🎯 5阶段策略' },
  { key: 'rotation', label: '🔥 行业轮动' },
  { key: 'similar', label: '🔍 相似股票' },
  { key: 'conceptFlow', label: '🧩 概念资金流' },
]

function normalizeHomeTab(v: unknown): 'overview' | 'watchlist' | 'lifeline' | 'rotation' | 'similar' | null {
  const s = typeof v === 'string' ? v : ''
  if (s === 'overview' || s === 'watchlist' || s === 'lifeline' || s === 'rotation' || s === 'similar') return s
  return null
}

export default function NavTabs(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const [showPwdModal, setShowPwdModal] = useState(false)
  const [homeTab, setHomeTab] = useState<'overview' | 'watchlist' | 'lifeline' | 'rotation' | 'similar'>('overview')

  useEffect(() => {
    if (location.pathname !== '/') return
    try {
      const persisted = normalizeHomeTab(window.localStorage.getItem(HOME_TAB_STORAGE_KEY))
      if (persisted) setHomeTab(persisted)
    } catch {
      void 0
    }
  }, [location.pathname])

  const activeTab: TabKey | null = (() => {
    if (location.pathname === '/concept-flow' || location.pathname.startsWith('/concept-flow/')) return 'conceptFlow'
    if (location.pathname === '/lifeline' || location.pathname === '/lifeline-monitor') return 'lifeline'
    if (location.pathname === '/watchlist') return 'watchlist'
    if (location.pathname !== '/') return null
    const stateTab = normalizeHomeTab((location.state as { activeTab?: string } | null)?.activeTab)
    if (stateTab) return stateTab
    return homeTab
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
                } else if (tab.key === 'conceptFlow') {
                  navigate('/concept-flow?boardType=concept&days=14&top=20')
                } else {
                  try {
                    window.localStorage.setItem(HOME_TAB_STORAGE_KEY, tab.key)
                  } catch {
                    void 0
                  }
                  setHomeTab(tab.key)
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
          <div className="ml-auto flex items-center gap-2">
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
