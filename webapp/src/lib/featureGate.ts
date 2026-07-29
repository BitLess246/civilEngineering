// ─────────────────────────────────────────────────────────────────────────
// FEATURE GATE — which plan may run which piece of heavy work.
//
// `plans.ts` says what a tier INCLUDES. This says where those entitlements bite:
// it maps every solver job and every gated action onto the feature it needs, so
// the decision is made once, in a pure function, rather than as scattered
// `plan === 'pro'` checks inside a 5,000-line page.
//
// WHAT THIS IS NOT: a security boundary — the same warning `trialQuota` carries,
// and here it matters more. Every calculation in this app runs IN THE BROWSER,
// in a Web Worker on the user's own machine. There is no server to ask. Anyone
// with devtools can flip a plan object and run the optimiser, and no amount of
// client-side code can prevent that. This gate exists to present a coherent
// product — to tell an honest user what their plan includes and what it does
// not — NOT to protect compute. Protecting compute would mean moving the solver
// behind an authenticated API, which is a different project.
//
// Saying so plainly here is the point: the risk is that someone later reads
// these checks as enforcement and stops there.
// ─────────────────────────────────────────────────────────────────────────
import { PLANS, planOf, planAllows, upgradeMessage, withinModelLimit, type Feature, type Plan, type PlanId } from './plans'

/**
 * Every job kind `useSolver` can dispatch.
 *
 * Mirrors `SolverRequest['kind']` in `engine/solverWorker.ts`. It is duplicated
 * rather than imported so this module stays free of the worker's type graph —
 * and a guard test reads the worker source and fails if the two ever diverge,
 * because a new solver kind silently defaulting to "allowed" is exactly the
 * failure this table exists to prevent.
 */
export type SolverKind =
  | 'analyze' | 'design' | 'optimize' | 'modal'
  | 'pushover' | 'biaxialPushover' | 'timeHistory' | 'nonlinearTH'

/**
 * The feature each solver job needs.
 *
 * `null` would mean "no feature required"; nothing maps to it today, and the
 * type keeps the option explicit rather than letting an unmapped kind fall
 * through as allowed.
 */
export const SOLVER_FEATURE: Record<SolverKind, Feature | null> = {
  // Linear analysis and modal extraction are the Model Space itself — Pro.
  analyze: 'model-space',
  modal: 'model-space',
  // The automated design pass over the whole structure — Pro.
  design: 'design-pipeline',
  // Section optimisation runs the pipeline repeatedly — Pro.
  optimize: 'optimizer',
  // Every nonlinear/dynamic solve — pushover, biaxial pushover, and both
  // time-history paths (modal superposition and direct integration) — Max.
  // These are the longest-running jobs in the app, which is why they sit at
  // the top tier rather than being withheld arbitrarily.
  pushover: 'nonlinear',
  biaxialPushover: 'nonlinear',
  timeHistory: 'nonlinear',
  nonlinearTH: 'nonlinear',
}

/** Why a job was refused, or that it may proceed. */
export type GateVerdict =
  | { allowed: true }
  /** The plan does not include the feature at all. */
  | { allowed: false; reason: 'feature'; feature: Feature; message: string }
  /** The plan includes it, but the model is over the tier's size ceiling. */
  | { allowed: false; reason: 'model-limit'; limit: number; members: number; message: string }

/**
 * Whether `plan` may run a solver job on a model of `members` members.
 *
 * Feature first, then size: being told "the optimiser is a Pro feature" is more
 * useful than "your model is too big" when both are true, because the size
 * limit would not be the thing standing in the way once the feature is bought.
 */
export function gateSolve(kind: SolverKind, plan: PlanId | Plan, members: number): GateVerdict {
  const p = typeof plan === 'string' ? planOf(plan) : plan
  const feature = SOLVER_FEATURE[kind]
  if (feature && !planAllows(p, feature)) {
    return {
      allowed: false, reason: 'feature', feature,
      message: upgradeMessage(p.id, feature) ?? 'That feature is not on your plan.',
    }
  }
  if (!withinModelLimit(p, members)) {
    // maxMembers is non-null here: withinModelLimit only returns false when it is
    const limit = p.maxMembers ?? 0
    return {
      allowed: false, reason: 'model-limit', limit, members,
      message: modelLimitMessage(p, members),
    }
  }
  return { allowed: true }
}

/**
 * The sentence shown when a model outgrows its tier.
 *
 * The zero-limit case never actually surfaces: a plan with `maxMembers: 0` also
 * lacks `model-space`, so `gateSolve` refuses on the feature first and returns
 * the upgrade message instead. It is written anyway so the function is total
 * rather than relying on that ordering holding forever.
 */
export function modelLimitMessage(plan: PlanId | Plan, members: number): string {
  const p = typeof plan === 'string' ? planOf(plan) : plan
  const limit = p.maxMembers
  if (limit === null) return ''
  if (limit === 0) return `The ${p.name} plan does not include the 3D Model Space.`
  const next = PLANS.find((q) => (q.maxMembers ?? Infinity) > limit)
  return `The ${p.name} plan analyses models up to ${limit} members; this one has ${members}.`
    + (next ? ` ${next.name} removes the limit.` : '')
}

/**
 * The feature each gated route prefix needs.
 *
 * Keyed by the SAME prefixes `trialQuota.GATED_PREFIXES` uses to require a
 * session, because the two answer different halves of one question — "must I
 * sign in?" and "is it on my plan?" — and a prefix that has one but not the
 * other is a page that either lets the wrong people in or turns away the right
 * ones. A test asserts the key sets match exactly.
 */
export const ROUTE_FEATURE: Record<string, Feature> = {
  '/model': 'model-space',
  '/frame': 'model-space',
  '/truss': 'model-space',
  '/seismic-wizard': 'model-space',
  '/estimate': 'estimating',
  '/schedule': 'scheduling',
}

/**
 * The feature a route needs, or null when it needs none.
 *
 * Longest prefix wins, so a future '/model-lite' cannot be captured by
 * '/model'. Matching is on a path SEGMENT boundary for the same reason.
 */
export function featureForRoute(route: string): Feature | null {
  const path = route.split('?')[0]
  let best: { len: number; feature: Feature } | null = null
  for (const [prefix, feature] of Object.entries(ROUTE_FEATURE)) {
    if (path === prefix || path.startsWith(prefix + '/')) {
      if (!best || prefix.length > best.len) best = { len: prefix.length, feature }
    }
  }
  return best?.feature ?? null
}

/** Verdict for opening a route under a plan. */
export function gateRoute(route: string, plan: PlanId | Plan): GateVerdict {
  const feature = featureForRoute(route)
  if (!feature) return { allowed: true }
  return gateAction(feature, plan)
}

/**
 * Whether a non-solver action is on the plan — PDF export, saving a project.
 *
 * Split from `gateSolve` because these carry no model-size condition: exporting
 * a report you were allowed to produce should not fail on member count.
 */
export function gateAction(feature: Feature, plan: PlanId | Plan): GateVerdict {
  const p = typeof plan === 'string' ? planOf(plan) : plan
  if (planAllows(p, feature)) return { allowed: true }
  return {
    allowed: false, reason: 'feature', feature,
    message: upgradeMessage(p.id, feature) ?? 'That feature is not on your plan.',
  }
}
