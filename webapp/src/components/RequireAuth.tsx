import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth/authContext'
import { canRun } from '../lib/trialQuota'

/**
 * Route gate. Sends a visitor to sign-in when the route needs an account.
 *
 * Waits for `loading` to clear first: redirecting on a not-yet-known session
 * would bounce a signed-in user to the sign-in page on every refresh.
 *
 * When auth is NOT configured on the deployment, nothing is gated — otherwise a
 * missing env var would lock the whole app behind a form that cannot work.
 * That is the deliberate failure direction: a misconfigured deploy stays
 * usable rather than becoming a brick.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, configured, access } = useAuth()
  const loc = useLocation()
  if (!configured) return <>{children}</>
  if (loading) {
    return (
      <div className="mx-auto max-w-md px-5 py-20 text-center text-sm text-slate-500">Checking your session…</div>
    )
  }
  const verdict = access(loc.pathname)
  if (verdict.kind === 'members-only' || verdict.kind === 'trial-exhausted') {
    return <Navigate to="/signin" replace state={{ from: loc.pathname + loc.search }} />
  }
  if (!canRun(verdict)) return <Navigate to="/signin" replace state={{ from: loc.pathname }} />
  return <>{children}</>
}
