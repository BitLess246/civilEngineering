// ─────────────────────────────────────────────────────────────────────────
// PADDLE CONFIGURATION — is checkout wired up, and to which environment?
//
// Pure, and separated from the code that loads Paddle.js so the rules can be
// tested without a browser or a network. It answers one question: given a set
// of environment variables, may this build open a checkout, and with what?
//
// IT FAILS CLOSED, IN BOTH DIRECTIONS.
//
//   1. Anything missing or malformed → `null`, and the pricing page shows what
//      the plans include with no button. A half-configured deploy must not put
//      a Buy button on screen that dies when it is pressed.
//
//   2. A SANDBOX TOKEN WITH `production`, OR A LIVE TOKEN WITH `sandbox`, IS
//      REJECTED rather than passed through. Paddle scopes tokens and price ids
//      per environment, so a mismatch cannot work — but the two failures are
//      not symmetric. A live token on a page that thinks it is sandbox is the
//      one that charges a real card during testing, and no error message
//      recovers that money. Refusing to boot is the cheap side of the trade.
//
// The token here is PUBLIC by design — Paddle client-side tokens are meant to
// ship in the bundle, and can only open checkouts and read prices. The API key
// (`pdl_…`), which can move money, must never appear in a VITE_ variable.
// ─────────────────────────────────────────────────────────────────────────
import type { BillingPeriod, PlanId } from '../plans'

/** The tiers that can actually be bought. Guest and Free have no price. */
export type PaidPlanId = Extract<PlanId, 'pro' | 'max'>

export const PAID_PLANS: readonly PaidPlanId[] = ['pro', 'max']

export type PaddleEnvironment = 'sandbox' | 'production'

export interface PaddleConfig {
  /** Client-side token — `test_…` in sandbox, `live_…` in production. */
  token: string
  environment: PaddleEnvironment
  /** Paddle price id per tier and billing period. */
  prices: Record<PaidPlanId, Record<BillingPeriod, string>>
}

/** Why a build has no checkout — surfaced in dev, never shown to a customer. */
export type ConfigProblem =
  | { kind: 'absent' }
  | { kind: 'bad-environment'; value: string }
  | { kind: 'token-environment-mismatch'; environment: PaddleEnvironment }
  | { kind: 'missing-price'; keys: string[] }
  | { kind: 'malformed-price'; keys: string[] }

export type ConfigResult =
  | { ok: true; config: PaddleConfig }
  | { ok: false; problem: ConfigProblem }

/** Env var name for a tier/period price id, e.g. `VITE_PADDLE_PRICE_PRO_ANNUAL`. */
export const priceEnvKey = (plan: PaidPlanId, period: BillingPeriod): string =>
  `VITE_PADDLE_PRICE_${plan.toUpperCase()}_${period.toUpperCase()}`

const trimmed = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * Read and validate the Paddle settings out of an env bag.
 *
 * Takes the bag as an argument rather than reading `import.meta.env` directly
 * so every branch is reachable from a test — the module that actually opens a
 * checkout passes the real one in.
 */
export function readPaddleConfig(env: Record<string, unknown>): ConfigResult {
  const token = trimmed(env.VITE_PADDLE_CLIENT_TOKEN)
  const rawEnvironment = trimmed(env.VITE_PADDLE_ENV)

  // Nothing set at all is the ordinary state of a fork or a fresh clone, not a
  // misconfiguration, so it is reported as its own kind and logged as info.
  if (!token && !rawEnvironment) return { ok: false, problem: { kind: 'absent' } }

  if (rawEnvironment !== 'sandbox' && rawEnvironment !== 'production') {
    return { ok: false, problem: { kind: 'bad-environment', value: rawEnvironment } }
  }
  const environment: PaddleEnvironment = rawEnvironment

  // Paddle's own prefixes: `test_` for sandbox, `live_` for production. An
  // empty token also lands here, which is right — a missing token cannot match
  // the environment it claims.
  const expected = environment === 'sandbox' ? 'test_' : 'live_'
  if (!token.startsWith(expected)) {
    return { ok: false, problem: { kind: 'token-environment-mismatch', environment } }
  }

  const prices = {} as Record<PaidPlanId, Record<BillingPeriod, string>>
  const missing: string[] = []
  const malformed: string[] = []

  for (const plan of PAID_PLANS) {
    prices[plan] = {} as Record<BillingPeriod, string>
    for (const period of ['monthly', 'annual'] as const) {
      const key = priceEnvKey(plan, period)
      const id = trimmed(env[key])
      if (!id) { missing.push(key); continue }
      // `pri_` is the price prefix; a product id (`pro_`) pasted here opens a
      // checkout that fails at Paddle rather than in our code, so catch it now.
      if (!id.startsWith('pri_')) { malformed.push(key); continue }
      prices[plan][period] = id
    }
  }

  if (missing.length) return { ok: false, problem: { kind: 'missing-price', keys: missing } }
  if (malformed.length) return { ok: false, problem: { kind: 'malformed-price', keys: malformed } }

  return { ok: true, config: { token, environment, prices } }
}

/** A developer-facing sentence for a problem. Never rendered to a customer. */
export function describeProblem(problem: ConfigProblem): string {
  switch (problem.kind) {
    case 'absent':
      return 'Paddle is not configured (VITE_PADDLE_CLIENT_TOKEN, VITE_PADDLE_ENV) — checkout is off.'
    case 'bad-environment':
      return `VITE_PADDLE_ENV must be "sandbox" or "production", got "${problem.value}".`
    case 'token-environment-mismatch':
      return `VITE_PADDLE_CLIENT_TOKEN does not match VITE_PADDLE_ENV=${problem.environment} `
        + `(expected a ${problem.environment === 'sandbox' ? 'test_' : 'live_'} token).`
    case 'missing-price':
      return `Paddle price ids are missing: ${problem.keys.join(', ')}.`
    case 'malformed-price':
      return `These are not price ids (they must start with "pri_"): ${problem.keys.join(', ')}.`
  }
}

/**
 * This build's configuration, or null.
 *
 * Read once at module load: the values are compiled into the bundle by Vite and
 * cannot change while the tab is open, so re-reading would only invite the
 * illusion that they can.
 */
const RESULT = readPaddleConfig(import.meta.env as unknown as Record<string, unknown>)

export const PADDLE_CONFIG: PaddleConfig | null = RESULT.ok ? RESULT.config : null

/**
 * Whether the app may open a checkout.
 *
 * The successor to the hard-coded `CHECKOUT_ENABLED` in `plans.ts`. It is now
 * a fact about the deploy rather than a constant, but the discipline it
 * encoded still holds: the ONLY thing that grants a plan is the billing
 * webhook, which holds the signing secret and the service-role key. This flag
 * decides whether a button is shown, never what a customer is entitled to.
 */
export const CHECKOUT_ENABLED: boolean = RESULT.ok

// One line in the console when checkout is off for a reason other than "nobody
// configured it", so a broken staging deploy announces itself rather than
// silently showing the coming-soon notice.
if (!RESULT.ok && RESULT.problem.kind !== 'absent') {
  console.error(`[billing] ${describeProblem(RESULT.problem)}`)
}
