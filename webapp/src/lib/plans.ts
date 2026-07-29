// ─────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION PLANS AND ENTITLEMENTS — what each tier may do.
//
// Pure and tested, for the same reason `trialQuota` is: these rules decide what
// a paying customer gets, so they belong in one inspectable place rather than
// scattered as `plan === 'pro'` checks across pages.
//
// The model is FEATURE-based, not route-based. Routes answer "may I open this
// page?" (`trialQuota`); features answer "may I do this thing?" — export a PDF,
// run the optimiser, build a model past N members. Those are different
// questions and conflating them is how a paywall ends up inconsistent, with a
// page reachable but its main button dead for no stated reason.
//
// NO PAYMENTS ARE TAKEN. Nothing here charges anyone or claims to. A plan is
// read from the user's Supabase metadata, so it can be set by hand today and by
// a checkout webhook later; until that webhook exists every account is `free`.
// The pricing page says so plainly rather than showing a button that pretends.
// ─────────────────────────────────────────────────────────────────────────

export type PlanId = 'guest' | 'free' | 'pro'

export type Feature =
  /** The 3D model space at all. */
  | 'model-space'
  /** Run the full design pipeline (slabs → beams → columns → footings). */
  | 'design-pipeline'
  /** Section optimisation. */
  | 'optimizer'
  /** Generate a printable/PDF report. */
  | 'reports'
  /** Estimating and take-off. */
  | 'estimating'
  /** Construction scheduling. */
  | 'scheduling'
  /** Nonlinear analysis — pushover, time history, buckling. */
  | 'nonlinear'
  /** Save projects to the account. */
  | 'saved-projects'

export interface Plan {
  id: PlanId
  name: string
  /** Monthly price in USD. 0 = free; null = not purchasable (guest). */
  price: number | null
  tagline: string
  features: readonly Feature[]
  /** Hard ceiling on model size, or null for no limit. */
  maxMembers: number | null
  /** Runs per calculator; null = unlimited. */
  calculatorRuns: number | null
  /** Shown as bullet points on the pricing page. */
  highlights: readonly string[]
}

/** Everything a paid tier unlocks — listed once so the tiers cannot drift. */
const ALL_FEATURES: readonly Feature[] = [
  'model-space', 'design-pipeline', 'optimizer', 'reports',
  'estimating', 'scheduling', 'nonlinear', 'saved-projects',
]

export const PLANS: readonly Plan[] = [
  {
    id: 'guest',
    name: 'Guest',
    price: null,
    tagline: 'Try the calculators without an account.',
    features: [],
    maxMembers: 0,
    calculatorRuns: 5,
    highlights: [
      '5 runs of each single-purpose calculator',
      'Full documentation and validation pages',
      'No account, no email required',
    ],
  },
  {
    id: 'free',
    name: 'Free',
    price: 0,
    tagline: 'Everything a student or a single check needs.',
    features: ['model-space', 'design-pipeline', 'saved-projects'],
    maxMembers: 50,
    calculatorRuns: null,
    highlights: [
      'Unlimited use of every calculator',
      '3D Model Space, up to 50 members',
      'Full design pipeline on those models',
      'Save projects to your account',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 19,
    tagline: 'For production work on real buildings.',
    features: ALL_FEATURES,
    maxMembers: null,
    calculatorRuns: null,
    highlights: [
      'Unlimited model size',
      'Section optimiser',
      'Nonlinear analysis — pushover, time history, buckling',
      'Printable and PDF reports',
      'Estimating, take-off and construction scheduling',
    ],
  },
]

const byId = new Map(PLANS.map((p) => [p.id, p]))

/** Look up a plan; unknown ids fall back to `guest`, the least-privileged. */
export const planOf = (id: string | null | undefined): Plan =>
  byId.get((id ?? '') as PlanId) ?? byId.get('guest')!

/** Whether a plan includes a feature. */
export const planAllows = (plan: PlanId | Plan, feature: Feature): boolean =>
  (typeof plan === 'string' ? planOf(plan) : plan).features.includes(feature)

/**
 * Whether a model of `members` members is within the plan's ceiling.
 * `maxMembers: 0` (guest) blocks any model at all; `null` means no limit.
 */
export function withinModelLimit(plan: PlanId | Plan, members: number): boolean {
  const p = typeof plan === 'string' ? planOf(plan) : plan
  if (p.maxMembers === null) return true
  return members <= p.maxMembers
}

/** The cheapest plan that includes a feature, or null if none does. */
export function lowestPlanWith(feature: Feature): Plan | null {
  const ranked = [...PLANS].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
  return ranked.find((p) => p.features.includes(feature)) ?? null
}

/**
 * A sentence explaining what to do about a blocked feature.
 *
 * Returned from here rather than written at each call site so the wording stays
 * consistent, and so it always names the plan that actually unlocks the thing
 * instead of a generic "upgrade to continue".
 */
export function upgradeMessage(current: PlanId, feature: Feature): string | null {
  if (planAllows(current, feature)) return null
  const target = lowestPlanWith(feature)
  if (!target) return 'That feature is not available on any plan yet.'
  if (current === 'guest') {
    return target.price === 0
      ? `Create a free account to use ${featureLabel(feature)}.`
      : `${featureLabel(feature)} needs the ${target.name} plan — create an account to get started.`
  }
  return `${featureLabel(feature)} is part of the ${target.name} plan.`
}

/** Human name for a feature, used in the messages above. */
export function featureLabel(f: Feature): string {
  switch (f) {
    case 'model-space': return 'the 3D Model Space'
    case 'design-pipeline': return 'the design pipeline'
    case 'optimizer': return 'the section optimiser'
    case 'reports': return 'report export'
    case 'estimating': return 'estimating and take-off'
    case 'scheduling': return 'construction scheduling'
    case 'nonlinear': return 'nonlinear analysis'
    case 'saved-projects': return 'saved projects'
  }
}

/**
 * Whether checkout is live.
 *
 * Hard-coded false, and deliberately a named constant rather than a comment: a
 * static SPA cannot verify a payment webhook, so a paid plan cannot be sold
 * from the browser alone. Until a server exists to do that, the pricing page
 * shows what a plan WOULD include and says checkout is not open, instead of a
 * button that looks like it charges a card and does not.
 */
export const CHECKOUT_ENABLED = false
