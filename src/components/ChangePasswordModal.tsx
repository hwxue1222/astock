import { useState } from 'react'
import { getStoredPassword, PWD_STORAGE_KEY, AUTH_STORAGE_KEY } from './PasswordGate'

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const stored = getStoredPassword()
    if (currentPwd !== stored) {
      setError('当前密码错误')
      return
    }
    if (newPwd.length < 4) {
      setError('新密码至少4位')
      return
    }
    if (newPwd !== confirmPwd) {
      setError('两次输入的新密码不一致')
      return
    }

    localStorage.setItem(PWD_STORAGE_KEY, newPwd)
    localStorage.removeItem(AUTH_STORAGE_KEY)
    setSuccess(true)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-lg font-semibold text-slate-100">🔒 修改密码</div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
              ✅ 密码修改成功！请重新登录。
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
            >
              重新登录
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-slate-400">当前密码</label>
              <input
                type="password"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">新密码</label>
              <input
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">确认新密码</label>
              <input
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                required
              />
            </div>
            {error && (
              <div className="text-xs text-red-400">{error}</div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-800 py-2 text-sm text-slate-300 hover:bg-slate-700"
              >
                取消
              </button>
              <button
                type="submit"
                className="flex-1 rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white hover:bg-sky-500"
              >
                确认修改
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
