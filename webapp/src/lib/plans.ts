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
// PRICED IN US DOLLARS, because Paddle is the merchant of record and PADDLE
// HAS NO PHP. Its 33 payment currencies do not include the Philippine peso, and
// a Philippine-registered seller transacts in USD — so pesos were never an
// option here, whatever the earlier Xendit plan assumed. The figures below are
// the BASE price; Paddle converts them to a buyer's local currency at checkout,
// and the pricing page reads those converted amounts back out of Paddle rather
// than quoting a number nobody will be charged.
//
// NO PAYMENTS ARE TAKEN YET. The billing webhook exists (supabase/functions/
// billing-webhook) and verifies real Paddle signatures, but nothing starts a
// payment, so `CHECKOUT_ENABLED` is still false and every account is `free`.
// The pricing page says so plainly rather than showing a button that pretends.
// ─────────────────────────────────────────────────────────────────────────

export type PlanId = 'guest' | 'free' | 'pro' | 'max'

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
  /** Soil-investigation management: boreholes, lab tests, parameters, report. */
  | 'soil-investigation'

/** How often a paid plan is billed. */
export type BillingPeriod = 'monthly' | 'annual'

/**
 * The currency these figures are denominated in.
 *
 * USD because Paddle cannot charge PHP — see the header. The rule that made the
 * old peso pricing right still holds and is the reason the pricing page asks
 * Paddle what a visitor will actually pay: the currency the customer is SHOWN
 * must be the currency they are CHARGED. A page quoting dollars while the card
 * statement reads something else is a support ticket at best, a chargeback at
 * worst.
 */
export const CURRENCY = 'USD'

/** Headline discount for paying yearly. */
export const ANNUAL_DISCOUNT = 0.10

export interface Plan {
  id: PlanId
  name: string
  /** Price per month when billed monthly, in USD. 0 = free; null = guest. */
  priceMonthly: number | null
  /**
   * Total charged once per year, in USD — already discounted, not a rate.
   *
   * Stored rather than computed from `priceMonthly · 12 · 0.9` so the number a
   * customer is charged is the number written here, and rounding to a tidy
   * figure cannot drift from what the page displays. A test pins each one to
   * within a tenth of a percent of the headline discount.
   */
  priceAnnual: number | null
  tagline: string
  features: readonly Feature[]
  /** Hard ceiling on model size, or null for no limit. */
  maxMembers: number | null
  /** Runs per calculator; null = unlimited. */
  calculatorRuns: number | null
  /** Saved projects the account may keep; 0 = cannot save, null = no limit. */
  maxProjects: number | null
  /** Shown as bullet points on the pricing page. */
  highlights: readonly string[]
}

/** Everything a paid tier unlocks — listed once so the tiers cannot drift. */
const ALL_FEATURES: readonly Feature[] = [
  'model-space', 'design-pipeline', 'optimizer', 'reports',
  'estimating', 'scheduling', 'nonlinear', 'saved-projects', 'soil-investigation',
]

/**
 * The tiers, cheapest first.
 *
 * The shape of the ladder: Guest and Free are deliberately the SAME product —
 * the single-purpose calculators — and differ only in that Free has an account
 * behind it, which removes the trial counter and lets a few projects be saved.
 * Nobody should have to pay to finish a beam check. The paid tiers are where
 * the project-scale tools live: Pro carries the 3D Model Space and everything
 * built on it, and Max adds the analyses that are heaviest to run and rarest to
 * need — nonlinear/dynamic solves and construction scheduling.
 */
export const PLANS: readonly Plan[] = [
  {
    id: 'guest',
    name: 'Guest',
    priceMonthly: null,
    priceAnnual: null,
    tagline: 'Try every calculator without an account.',
    features: [],
    maxMembers: 0,
    calculatorRuns: 5,
    maxProjects: 0,
    highlights: [
      '5 runs of each single-purpose calculator',
      'Full documentation and validation pages',
      'No account, no email required',
    ],
  },
  {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    priceAnnual: 0,
    tagline: 'The same calculators, without the trial counter.',
    features: ['saved-projects'],
    maxMembers: 0,
    calculatorRuns: null,
    maxProjects: 3,
    highlights: [
      'Unlimited use of every calculator',
      'Save up to 3 projects to your account',
      'Worked solutions and PDF calc sheets on every page',
      'Full documentation and validation pages',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 19,
    priceAnnual: 205,
    tagline: 'The 3D Model Space and the tools built on it.',
    features: ['model-space', 'design-pipeline', 'optimizer', 'reports', 'estimating', 'saved-projects', 'soil-investigation'],
    maxMembers: 400,
    calculatorRuns: null,
    maxProjects: null,
    highlights: [
      '3D Model Space, up to 400 members',
      'Full design pipeline — slabs, beams, columns, footings',
      'Section optimiser',
      'Estimating and take-off',
      'Structure reports and PDF drawings',
      'Unlimited saved projects',
    ],
  },
  {
    id: 'max',
    name: 'Max',
    priceMonthly: 49,
    priceAnnual: 529,
    tagline: 'Everything, including the nonlinear and dynamic solvers.',
    features: ALL_FEATURES,
    maxMembers: null,
    calculatorRuns: null,
    maxProjects: null,
    highlights: [
      'Everything in Pro, with no model-size limit',
      'Nonlinear analysis — pushover, biaxial pushover, time history',
      'Construction scheduling and the critical path',
      'Priority on new engines as they ship',
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

/**
 * Whether an account holding `projects` saved projects may save another.
 * `maxProjects: 0` (guest) cannot save at all; `null` means no limit.
 */
export function withinProjectLimit(plan: PlanId | Plan, projects: number): boolean {
  const p = typeof plan === 'string' ? planOf(plan) : plan
  if (p.maxProjects === null) return true
  return projects < p.maxProjects
}

/** Price for a plan on a given billing period, in USD. */
export function priceFor(plan: PlanId | Plan, period: BillingPeriod): number | null {
  const p = typeof plan === 'string' ? planOf(plan) : plan
  return period === 'annual' ? p.priceAnnual : p.priceMonthly
}

/**
 * What a plan works out to per month on a given period.
 *
 * The number to put next to an annual price: "$17.08/month, billed annually" is
 * the comparison a customer is actually making, and making them divide by
 * twelve is how a good deal goes unnoticed.
 */
export function monthlyEquivalent(plan: PlanId | Plan, period: BillingPeriod): number | null {
  const price = priceFor(plan, period)
  if (price === null) return null
  return period === 'annual' ? price / 12 : price
}

/** Dollars saved over a year by paying annually. 0 when there is nothing to save. */
export function annualSaving(plan: PlanId | Plan): number {
  const p = typeof plan === 'string' ? planOf(plan) : plan
  if (!p.priceMonthly || !p.priceAnnual) return 0
  return Math.max(0, p.priceMonthly * 12 - p.priceAnnual)
}

/** The actual discount achieved by a plan's annual price, as a fraction. */
export function annualDiscountOf(plan: PlanId | Plan): number {
  const p = typeof plan === 'string' ? planOf(plan) : plan
  if (!p.priceMonthly || !p.priceAnnual) return 0
  return 1 - p.priceAnnual / (p.priceMonthly * 12)
}

/**
 * Dollar amount for display — `$19`, or `$17.08` when there are cents.
 *
 * Whole dollars lose the trailing `.00` because every headline price is whole;
 * the cents appear only where they are real, which is the per-month equivalent
 * of an annual plan ($205 ÷ 12). Rounding THAT to `$17` would advertise a
 * number nobody is charged — the same mistake, one decimal place down, that
 * quoting the wrong currency makes.
 *
 * Fixed to en-US rather than the visitor's locale so the grouping matches the
 * amount Paddle's checkout shows for the base currency; a price that reads
 * differently in two places invites a double-take at the wrong moment.
 */
export const formatUsd = (amount: number): string => {
  const cents = Math.round(amount * 100)
  const body = (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return `$${body}`
}

/** The cheapest plan that includes a feature, or null if none does. */
export function lowestPlanWith(feature: Feature): Plan | null {
  const ranked = [...PLANS].sort((a, b) => (a.priceMonthly ?? Infinity) - (b.priceMonthly ?? Infinity))
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
    return target.priceMonthly === 0
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
    case 'soil-investigation': return 'the soil-investigation module'
  }
}

// `CHECKOUT_ENABLED` used to live here, hard-coded false, because a static SPA
// cannot verify a payment webhook. That reasoning still stands and is why the
// flag MOVED rather than being deleted: the webhook now exists
// (supabase/functions/billing-webhook), so the answer is no longer a constant
// but a fact about the deploy — are the Paddle token and price ids present?
//
// It is exported from `billing/paddleConfig` for that reason. This module stays
// pure and env-free; importing it here would drag `import.meta.env` into every
// test that only wanted to know what a plan costs.
