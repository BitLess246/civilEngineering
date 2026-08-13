// ─────────────────────────────────────────────────────────────────────────
// CHANGING PLAN — the pure half of "switch me from Pro to Max".
//
// Until now the only way to move between tiers was a second checkout, which
// leaves a customer paying for two subscriptions at once and having to cancel
// the first themselves. Paddle's `PATCH /subscriptions/{id}` replaces the line
// items on the EXISTING subscription instead, and prorates the difference.
//
// WHAT LIVES HERE: which proration mode a given move deserves, and how to read
// Paddle's preview. Both are decisions that can be wrong in a way that costs
// somebody money, so they are separated from the fetch and tested.
//
// THE DIRECTION DECIDES THE MONEY, and getting it backwards is not a cosmetic
// bug:
//
//   • UPGRADE (Pro → Max, or monthly → annual) — `prorated_immediately`. The
//     customer asked for more and expects to pay the difference now. Anything
//     else hands over the better tier before it is paid for.
//
//   • DOWNGRADE (Max → Pro, or annual → monthly) — `prorated_next_billing_period`.
//     Applying it immediately would REFUND the unused remainder mid-period,
//     which is not what "downgrade at renewal" means to either party and is
//     awkward to unwind if they change their mind.
//
// `on_payment_failure` stays at Paddle's default, `prevent_change`: if the card
// declines on an upgrade, the subscription must stay where it was. `apply_change`
// would grant the higher tier against a past-due transaction — extending credit
// to a stranger, decided by a button on a pricing page.
//
// AMOUNTS ARE STRINGS IN THE CURRENCY'S LOWEST UNIT here, exactly as they are
// in `webapp/src/lib/billing/localizedPrices.ts`; this module passes them
// through untouched and the browser formats them.
// ─────────────────────────────────────────────────────────────────────────
import type { PlanId } from './events.ts'

/** How often a paid plan is billed — mirrored from webapp/src/lib/plans.ts. */
export type BillingPeriod = 'monthly' | 'annual'

/** Paddle's proration modes, as far as this code uses them. */
export type ProrationMode = 'prorated_immediately' | 'prorated_next_billing_period'

/** What one catalog price is: the tier it grants, and how often it bills. */
export interface CatalogEntry {
  plan: PlanId
  /**
   * Absent for a price whose period was never recorded.
   *
   * `BILLING_PRICE_MAP` originally held `pri_x=pro` and the webhook never
   * needed more, so entries written before this feature carry no period. The
   * decision below refuses rather than guesses when it matters.
   */
  period?: BillingPeriod
}

export type PlanCatalog = Record<string, CatalogEntry>

/**
 * Parse `BILLING_PRICE_MAP` into the fuller catalog.
 *
 * Accepts BOTH the original `pri_abc=pro` and the extended `pri_abc=pro:annual`,
 * so the secret can gain periods without a flag day — the webhook keeps reading
 * the same variable through `parsePriceMap`, which ignores the suffix.
 */
export function parsePlanCatalog(raw: string | undefined): PlanCatalog {
  const out: PlanCatalog = {}
  if (!raw) return out
  for (const pair of raw.split(',')) {
    const i = pair.indexOf('=')
    if (i <= 0) continue
    const id = pair.slice(0, i).trim()
    const value = pair.slice(i + 1).trim()
    const [planRaw, periodRaw] = value.split(':').map((s) => s.trim())
    if (!id) continue
    if (planRaw !== 'pro' && planRaw !== 'max' && planRaw !== 'free') continue
    const period = periodRaw === 'monthly' || periodRaw === 'annual' ? periodRaw : undefined
    out[id] = period ? { plan: planRaw, period } : { plan: planRaw }
  }
  return out
}

/** Paid tiers, cheapest first — the ladder a move is measured against. */
const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, max: 2 }
const PERIOD_RANK: Record<BillingPeriod, number> = { monthly: 1, annual: 2 }

export type ChangeDecision =
  | { ok: true; mode: ProrationMode; direction: 'upgrade' | 'downgrade' }
  | {
    ok: false
    reason:
      /** The target is not a price we sell. Never forwarded to Paddle. */
      | 'unknown-price'
      /** The subscription's current price is not in the catalog — see below. */
      | 'unknown-current-price'
      /** Already on it; there is nothing to charge for. */
      | 'same-price'
  }

/**
 * Decide how a move should be billed.
 *
 * REFUSES when the CURRENT price is not in the catalog, rather than assuming a
 * direction. That happens with an archived or hand-made price, and both guesses
 * are bad: assume upgrade and a downgrade issues an immediate refund; assume
 * downgrade and an upgrade hands over the higher tier free until renewal. The
 * caller turns this into "use the billing portal for this one", which is a
 * worse experience than a working button and a better one than a wrong charge.
 *
 * A price with no recorded period is treated as period-less: a move between two
 * such prices on the same tier cannot be ranked, and lands on the safe side —
 * `downgrade`, which never charges immediately.
 */
export function planChangeDecision(
  currentPriceId: string,
  targetPriceId: string,
  catalog: PlanCatalog,
): ChangeDecision {
  const target = catalog[targetPriceId]
  if (!target) return { ok: false, reason: 'unknown-price' }
  const current = catalog[currentPriceId]
  if (!current) return { ok: false, reason: 'unknown-current-price' }
  if (currentPriceId === targetPriceId) return { ok: false, reason: 'same-price' }

  const planDelta = (PLAN_RANK[target.plan] ?? 0) - (PLAN_RANK[current.plan] ?? 0)
  const periodDelta = current.period && target.period
    ? PERIOD_RANK[target.period] - PERIOD_RANK[current.period]
    : 0

  // The tier decides first: Pro annual → Max monthly is an upgrade in tier and
  // a shortening of term, and the tier is what the customer is buying.
  const up = planDelta > 0 || (planDelta === 0 && periodDelta > 0)
  return up
    ? { ok: true, mode: 'prorated_immediately', direction: 'upgrade' }
    : { ok: true, mode: 'prorated_next_billing_period', direction: 'downgrade' }
}

/** The request body for both the preview and the commit — identical by design. */
export function changeBody(targetPriceId: string, mode: ProrationMode): Record<string, unknown> {
  return {
    // A FULL REPLACEMENT of the subscription's line items, not an addition.
    // Fetching the current items and appending would leave the customer billed
    // for both tiers at once — the expensive version of this mistake.
    items: [{ price_id: targetPriceId, quantity: 1 }],
    proration_billing_mode: mode,
    // Paddle's default, stated rather than assumed: a declined card leaves the
    // subscription exactly where it was.
    on_payment_failure: 'prevent_change',
  }
}

/** An amount as Paddle states it: an integer string in the lowest unit. */
export interface Money {
  amount: string
  currencyCode: string
}

/** The numbers a confirm screen needs. Any of them may be unknown. */
export interface ChangeSummary {
  /** What is charged now. Null on a downgrade, which charges nothing today. */
  immediate: Money | null
  /** What the subscription costs per period from here on. */
  recurring: Money | null
  /** ISO timestamp of the next renewal, when Paddle states one. */
  nextBilledAt: string | null
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * Pull one total out of a transaction preview.
 *
 * Paddle carries totals in two places — `details.totals` and a top-level
 * `totals` that also holds `grand_total`, `credit` and `balance`. `grand_total`
 * is what the card is actually charged (it is net of any credit balance), so it
 * wins where present; the plain `total` is the fallback.
 *
 * Returns null rather than 0 when nothing parses. A confirm screen that says
 * "you will be charged $0.00" because a field moved is worse than one that says
 * Paddle will confirm the amount.
 */
function moneyFrom(tx: unknown, fallbackCurrency: string): Money | null {
  if (!isRecord(tx)) return null
  const details = isRecord(tx.details) ? tx.details : null
  const detailTotals = details && isRecord(details.totals) ? details.totals : null
  const topTotals = isRecord(tx.totals) ? tx.totals : null

  const amount = str(topTotals?.grand_total) || str(detailTotals?.grand_total)
    || str(topTotals?.total) || str(detailTotals?.total)
  if (!amount || !Number.isFinite(Number(amount))) return null

  const currencyCode = str(tx.currency_code) || str(topTotals?.currency_code) || fallbackCurrency
  if (!currencyCode) return null
  return { amount, currencyCode }
}

/**
 * Read a preview (or an applied update) into the three figures worth showing.
 *
 * Every field is optional in the response — `immediate_transaction` is null on
 * a downgrade, and an applied update carries no preview at all — so this is
 * built to come back mostly empty without complaining.
 */
export function summarizeChange(body: unknown): ChangeSummary {
  const data = isRecord(body) && isRecord(body.data) ? body.data : null
  if (!data) return { immediate: null, recurring: null, nextBilledAt: null }

  const currency = str(data.currency_code)
  const nextBilledAt = str(data.next_billed_at)

  return {
    immediate: moneyFrom(data.immediate_transaction, currency),
    recurring: moneyFrom(data.recurring_transaction_details, currency)
      ?? moneyFrom(data.next_transaction, currency),
    nextBilledAt: nextBilledAt || null,
  }
}

/** The subscription's current price id, from a `GET /subscriptions/{id}`. */
export function currentPriceOf(body: unknown): string {
  const data = isRecord(body) && isRecord(body.data) ? body.data : null
  const items = data && Array.isArray(data.items) ? data.items : []
  for (const item of items) {
    if (!isRecord(item)) continue
    // A subscription can carry more than one item; the first priced one is the
    // tier. This app sells no addons, and `changeBody` replaces the whole array
    // — if addons are ever added, both need revisiting together.
    const price = isRecord(item.price) ? item.price : null
    const id = str(price?.id)
    if (id) return id
  }
  return ''
}

/** Whether a subscription is in a state that can be changed at all. */
export function isChangeableStatus(body: unknown): boolean {
  const data = isRecord(body) && isRecord(body.data) ? body.data : null
  const status = str(data?.status)
  // `paused` and `canceled` subscriptions cannot take an item change; Paddle
  // answers 400 and the message means nothing to the person who clicked.
  return status === 'active' || status === 'trialing' || status === 'past_due'
}
