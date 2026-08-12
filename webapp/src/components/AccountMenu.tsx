import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth/authContext'
import { usePlan } from '../lib/auth/usePlan'
import { CHECKOUT_ENABLED } from '../lib/billing/paddleConfig'

/**
 * Who am I, and how do I get out.
 *
 * The app previously showed "Log in / Sign up" whether or not you were signed
 * in, so there was no way to tell — and no way to sign out. This is the fix.
 *
 * `dark` renders it for the ink-navy home nav; the default suits the light
 * workbench header.
 */
export function AccountMenu({ dark }: { dark?: boolean }) {
  const { user, loading, configured, signOut } = useAuth()
  const plan = usePlan()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  // Close on an outside click or Escape. Without this the panel stays open
  // behind whatever you clicked next, which reads as a stuck menu.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const linkCls = dark
    ? 'px-2 py-1.5 text-[12.5px] font-semibold text-[#b6c2d0] hover:text-white'
    : 'px-2 py-1 text-[12px] font-semibold text-[#5c6675] hover:text-[#0f4c92]'
  const cta = dark
    ? 'rounded-md bg-[#0f4c92] px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[#135caf]'
    : 'rounded-md bg-[#0f4c92] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#0d3f78]'

  // Nothing to offer when the deployment has no auth configured — showing a
  // sign-in button that cannot work is worse than showing none.
  if (!configured) return null

  // Hold the space during the session lookup rather than flashing "Log in" at
  // someone who IS signed in.
  if (loading) {
    return <span className={dark ? 'px-2 text-[12.5px] text-[#7d8ea3]' : 'px-2 text-[12px] text-[#a39d8d]'}>…</span>
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link to="/signin" className={linkCls}>Log in</Link>
        <Link to="/signup" className={cta}>Sign up</Link>
      </div>
    )
  }

  const label = user.name?.trim() || user.email || 'Account'
  const initial = label.charAt(0).toUpperCase()

  return (
    <div className="relative" ref={box}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        aria-expanded={open} aria-haspopup="menu"
        className={`flex items-center gap-2 rounded-md px-1.5 py-1 ${
          dark ? 'hover:bg-white/10' : 'hover:bg-[#f4f3ef]'}`}>
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#0f4c92] text-[11px] font-bold text-white">
          {initial}
        </span>
        <span className={`hidden max-w-[140px] truncate text-[12px] font-semibold sm:inline ${
          dark ? 'text-white' : 'text-[#0f1b2a]'}`}>{label}</span>
        <span className={`hidden rounded px-1.5 py-px font-mono text-[9.5px] font-semibold uppercase sm:inline ${
          dark ? 'bg-white/15 text-white' : 'bg-[#eaf1f9] text-[#0f4c92]'}`}>{plan.name}</span>
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3"
          className={dark ? 'text-[#b6c2d0]' : 'text-[#8b8574]'}><polyline points="6 9 12 15 18 9" /></svg>
      </button>

      {open && (
        <div role="menu"
          className="absolute right-0 z-50 mt-1.5 w-60 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-3.5 py-2.5">
            <p className="truncate text-[12.5px] font-semibold text-[#0f1b2a]">{label}</p>
            {user.email && user.email !== label && (
              <p className="truncate text-[11px] text-slate-500">{user.email}</p>
            )}
            <p className="mt-1 text-[11px] text-slate-500">
              On the <strong className="text-[#0f4c92]">{plan.name}</strong> plan
              {!user.emailVerified && <span className="text-amber-700"> · email not verified</span>}
            </p>
          </div>
          <nav className="py-1 text-[12.5px]">
            <Link to="/profile" onClick={() => setOpen(false)}
              className="block px-3.5 py-1.5 text-slate-700 hover:bg-[#f4f3ef] hover:text-[#0f4c92]">
              Profile and letterhead
            </Link>
            <Link to="/pricing" onClick={() => setOpen(false)}
              className="block px-3.5 py-1.5 text-slate-700 hover:bg-[#f4f3ef] hover:text-[#0f4c92]">
              {CHECKOUT_ENABLED && plan.id !== 'max' ? 'Upgrade plan' : 'Plans and pricing'}
            </Link>
            <Link to="/contact" onClick={() => setOpen(false)}
              className="block px-3.5 py-1.5 text-slate-700 hover:bg-[#f4f3ef] hover:text-[#0f4c92]">
              Contact support
            </Link>
          </nav>
          <div className="border-t border-slate-100 py-1">
            <button type="button"
              onClick={async () => { setOpen(false); await signOut(); nav('/') }}
              className="block w-full px-3.5 py-1.5 text-left text-[12.5px] font-semibold text-red-700 hover:bg-red-50">
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
