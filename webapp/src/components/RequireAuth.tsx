import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth/authContext'
import { usePlan } from '../lib/auth/usePlan'
import { canRun } from '../lib/trialQuota'
import { gateRoute, featureForRoute } from '../lib/featureGate'
import { featureLabel } from '../lib/plans'
import { UpgradeGate } from './UpgradeNotice'

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
  const plan = usePlan()
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

  // Signed in, but is it on the plan? Shown as a page rather than a redirect:
  // bouncing someone away from a link they followed, with no explanation, is
  // the worst version of a paywall. They came here on purpose — say what this
  // page does and what would open it.
  const planVerdict = gateRoute(loc.pathname, plan)
  if (!planVerdict.allowed) {
    const feature = featureForRoute(loc.pathname)
    return (
      <UpgradeGate
        title={feature ? `${featureLabel(feature)[0].toUpperCase()}${featureLabel(feature).slice(1)}` : 'Not on your plan'}
        message={planVerdict.message}
        blurb={`You are on the ${plan.name} plan. Every single-purpose calculator stays available on it.`}
      />
    )
  }
  return <>{children}</>
}
