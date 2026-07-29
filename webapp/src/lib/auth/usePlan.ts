import { useCallback, useMemo } from 'react'
import { useAuth } from './authContext'
import { isAuthConfigured } from './authClient'
import { planOf, type Feature, type Plan } from '../plans'
import { gateAction, gateSolve, type GateVerdict, type SolverKind } from '../featureGate'

/**
 * The signed-in account's plan.
 *
 * WHEN AUTH IS NOT CONFIGURED, EVERYTHING IS UNLOCKED. That is deliberate and
 * matches `RequireAuth`: a deployment with no Supabase keys (a fork, CI, a
 * preview build) must stay fully usable rather than becoming a demo of a
 * paywall nobody can get past. The failure direction is "open", because the
 * alternative is a brick.
 *
 * Otherwise the plan comes from server-side user metadata via `AuthUser.plan`,
 * and an unrecognised value falls back to `guest` — the least privileged.
 */
export function usePlan(): Plan {
  const { user } = useAuth()
  return useMemo(() => {
    if (!isAuthConfigured()) return planOf('max')
    return planOf(user ? (user.plan ?? 'free') : 'guest')
  }, [user])
}

export interface PlanGate {
  plan: Plan
  /** May this feature be used at all? */
  allows: (f: Feature) => boolean
  /** Verdict for a non-solver action, with a message when refused. */
  action: (f: Feature) => GateVerdict
  /** Verdict for a solver job on a model of `members` members. */
  solve: (kind: SolverKind, members: number) => GateVerdict
}

/** The plan plus the three questions pages actually ask of it. */
export function usePlanGate(): PlanGate {
  const plan = usePlan()
  const allows = useCallback((f: Feature) => plan.features.includes(f), [plan])
  const action = useCallback((f: Feature) => gateAction(f, plan), [plan])
  const solve = useCallback((kind: SolverKind, members: number) => gateSolve(kind, plan, members), [plan])
  return useMemo(() => ({ plan, allows, action, solve }), [plan, allows, action, solve])
}
