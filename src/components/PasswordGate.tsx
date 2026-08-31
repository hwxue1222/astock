import { useState, useEffect } from 'react'

const PASSWORD = 'astock'
const STORAGE_KEY = 'astock_auth'

export default function PasswordGate({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === '1') {
      setAuthenticated(true)
    }
    setLoading(false)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input === PASSWORD) {
      localStorage.setItem(STORAGE_KEY, '1')
      setAuthenticated(true)
      setError(false)
    } else {
      setError(true)
      setInput('')
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="text-sm text-slate-400">加载中…</div>
      </div>
    )
  }

  if (authenticated) {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-8">
        <div className="mb-6 text-center">
          <div className="mb-2 text-2xl font-bold text-slate-100">🔒 5阶段策略</div>
          <div className="text-sm text-slate-400">请输入访问密码</div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                setError(false)
              }}
              placeholder="密码"
              autoFocus
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-sky-500"
            />
            {error && (
              <div className="mt-2 text-xs text-red-400">密码错误，请重试</div>
            )}
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
          >
            进入
          </button>
        </form>
      </div>
    </div>
  )
}
