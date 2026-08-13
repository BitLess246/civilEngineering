// ─────────────────────────────────────────────────────────────────────────
// CHANGING PLAN — the browser's side of "switch me to Max".
//
// Thin, like `portal.ts`: the `billing-change-plan` Edge Function decides
// everything that matters — whose subscription, which direction, how it is
// prorated — because none of that can be trusted to code the customer can edit.
// This asks, and turns the answer into a sentence.
//
// TWO STEPS ON PURPOSE. `previewPlanChange` asks Paddle what the move costs and
// changes nothing; `commitPlanChange` applies it. The confirm screen in between
// is not ceremony — the prorated figure depends on where the customer is in
// their billing period, any credit balance and their tax, and none of that is
// guessable from the pricing page. Quoting Paddle's own number is the
// difference between an upgrade and a support ticket.
//
// IT GRANTS NOTHING. A committed change means Paddle accepted it; the tier
// arrives when `billing-webhook` writes `app_metadata` from the resulting
// `subscription.updated`. Hence the wording after a switch: the plan follows
// shortly, and the session has to be refreshed to see it — the same honesty the
// post-checkout banner uses.
// ─────────────────────────────────────────────────────────────────────────
import { getClient } from '../auth/authClient'
import { formatMoney, fromLowestUnit } from './localizedPrices'

const FUNCTION_NAME = 'billing-change-plan'

/** An amount as Paddle states it: an integer string in the lowest unit. */
export interface Money {
  amount: string
  currencyCode: string
}

export interface PlanChange {
  /** What is charged today. Null on a downgrade, which charges nothing now. */
  immediate: Money | null
  /** What the subscription costs per period from here on. */
  recurring: Money | null
  /** ISO timestamp of the next renewal, when Paddle states one. */
  nextBilledAt: string | null
  direction: 'upgrade' | 'downgrade'
  /** False for a preview, true once the change has actually been applied. */
  committed: boolean
}

export type ChangeResult =
  | { ok: true; change: PlanChange }
  | { ok: false; reason: ChangeFailure }

export type ChangeFailure =
  /** The account has never bought anything, or has no live subscription. */
  | 'no-subscription'
  /** Paused or cancelled — Paddle will not take an item change. */
  | 'not-changeable'
  /** The card was declined; `prevent_change` means nothing moved. */
  | 'payment-failed'
  /** The subscription is on a price this deploy does not know. */
  | 'unknown-current-price'
  | 'same-price'
  | 'unauthenticated'
  | 'unavailable'

/** Ask what a move would cost. Changes nothing. */
export const previewPlanChange = (priceId: string): Promise<ChangeResult> =>
  request(priceId, false)

/** Apply the move. Only ever called from a confirm button. */
export const commitPlanChange = (priceId: string): Promise<ChangeResult> =>
  request(priceId, true)

async function request(priceId: string, commit: boolean): Promise<ChangeResult> {
  const client = getClient()
  if (!client) return { ok: false, reason: 'unauthenticated' }

  try {
    const { data, error } = await client.functions.invoke(FUNCTION_NAME, {
      // The subscription is NOT named here. The function resolves it from the
      // caller's own record — see its header.
      body: { priceId, ...(commit ? { commit: true } : {}) },
    })
    if (error) return { ok: false, reason: await reasonFromError(error) }

    const change = readChange(data)
    return change ? { ok: true, change } : { ok: false, reason: 'unavailable' }
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

/** A `Money` from the payload, or null — a half-read amount is not shown. */
function readMoney(v: unknown): Money | null {
  if (!isRecord(v)) return null
  const amount = typeof v.amount === 'string' ? v.amount : ''
  const currencyCode = typeof v.currencyCode === 'string' ? v.currencyCode : ''
  if (!amount || !currencyCode || !Number.isFinite(Number(amount))) return null
  return { amount, currencyCode }
}

/**
 * Read the function's payload.
 *
 * Only `direction` is required: the money may legitimately be absent — a
 * downgrade has no immediate charge, and an applied update carries no preview
 * — and the sentence below copes with that. A payload with no direction is not
 * an answer to the question that was asked, so it is treated as a failure.
 */
export function readChange(data: unknown): PlanChange | null {
  if (!isRecord(data)) return null
  const direction = data.direction === 'upgrade' || data.direction === 'downgrade'
    ? data.direction
    : null
  if (!direction) return null
  return {
    immediate: readMoney(data.immediate),
    recurring: readMoney(data.recurring),
    nextBilledAt: typeof data.nextBilledAt === 'string' && data.nextBilledAt ? data.nextBilledAt : null,
    direction,
    committed: data.committed === true,
  }
}

/** Recover the function's `error` token, if it sent one. */
async function reasonFromError(error: unknown): Promise<ChangeFailure> {
  const ctx = (error as { context?: { json?: () => Promise<unknown>; status?: number } })?.context
  try {
    const body = (await ctx?.json?.()) as { error?: unknown } | undefined
    const token = typeof body?.error === 'string' ? body.error : ''
    // `no-customer` and `no-subscription` are the same thing to a customer:
    // there is no live subscription to move.
    if (token === 'no-customer' || token === 'no-subscription') return 'no-subscription'
    if (token === 'not-changeable') return 'not-changeable'
    if (token === 'payment-failed') return 'payment-failed'
    if (token === 'unknown-current-price') return 'unknown-current-price'
    if (token === 'same-price') return 'same-price'
    if (token === 'unauthenticated') return 'unauthenticated'
  } catch {
    // Body already consumed or not JSON — fall through.
  }
  return ctx?.status === 401 ? 'unauthenticated' : 'unavailable'
}

/** Money as a display string, using the currency Paddle quoted. */
const show = (m: Money): string => formatMoney(fromLowestUnit(Number(m.amount), m.currencyCode), m.currencyCode)

/** `2026-09-13T00:00:00Z` → `September 13, 2026`; empty for anything unreadable. */
export function showDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

/**
 * The sentence on the confirm screen.
 *
 * Written to be true when Paddle told us nothing. Every figure is optional, and
 * the fallback says who will confirm the amount rather than inventing one —
 * "you will be charged $0.00" because a field moved is the version of this that
 * ends in a chargeback.
 */
export function describeChange(change: PlanChange): string {
  const when = showDate(change.nextBilledAt)
  const then = change.recurring ? show(change.recurring) : ''

  if (change.direction === 'upgrade') {
    const now = change.immediate ? `You will be charged ${show(change.immediate)} today` : 'Paddle will confirm the amount due today'
    if (then && when) return `${now}, then ${then} from ${when}.`
    if (then) return `${now}, then ${then} per billing period.`
    return `${now}.`
  }

  // A downgrade is billed at the renewal, so today's answer is "nothing".
  if (then && when) return `Nothing to pay today. From ${when} you will pay ${then}.`
  if (when) return `Nothing to pay today. The change takes effect on ${when}.`
  return 'Nothing to pay today. The change takes effect at your next renewal.'
}

/** What to tell someone whose plan change did not go through. */
export function changeMessage(reason: ChangeFailure): string {
  switch (reason) {
    case 'no-subscription':
      return 'You have no active subscription to change. Choose a plan to start one.'
    case 'not-changeable':
      return 'This subscription is paused or cancelled, so it cannot be switched. Manage it in the billing portal, or start a new plan.'
    case 'payment-failed':
      return 'Your card was declined, so nothing has changed — you are still on your current plan. Update your payment method in the billing portal and try again.'
    case 'unknown-current-price':
      return 'Your subscription is on a price this app no longer lists. Use the billing portal, or email us and we will move you over.'
    case 'same-price':
      return 'You are already on that plan.'
    case 'unauthenticated':
      return 'Please sign in again — your session has expired.'
    case 'unavailable':
      return 'The plan change could not be completed. Please try again, or email us and we will handle it for you.'
  }
}
