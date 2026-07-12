import { useEffect } from 'react'

// Lightweight auth dialog. Accounts aren't wired to a backend yet, so this is
// an honest "coming soon" placeholder rather than a non-functional form.
export function AuthModal({ mode, onClose }: { mode: 'login' | 'signup'; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const isSignup = mode === 'signup'
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm border border-slate-200 bg-white" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <span className="text-sm font-bold uppercase tracking-wider text-slate-800">
            {isSignup ? 'Create account' : 'Log in'}
          </span>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">✕</button>
        </div>
        <div className="space-y-3 p-5">
          <label className="flex flex-col text-xs font-medium text-slate-600">
            Email
            <input type="email" disabled placeholder="you@example.com"
              className="mt-1 cursor-not-allowed bg-slate-50 text-slate-500" />
          </label>
          <label className="flex flex-col text-xs font-medium text-slate-600">
            Password
            <input type="password" disabled placeholder="••••••••"
              className="mt-1 cursor-not-allowed bg-slate-50 text-slate-500" />
          </label>
          <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Accounts &amp; saved projects are coming soon. All tools work without an account today.
          </div>
          <button disabled
            className="w-full cursor-not-allowed bg-slate-300 px-4 py-2 text-sm font-semibold text-white">
            {isSignup ? 'Sign up' : 'Log in'} — soon
          </button>
        </div>
      </div>
    </div>
  )
}
