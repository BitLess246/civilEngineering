// ─────────────────────────────────────────────────────────────────────────
// WEBHOOK EVENT → PLAN CHANGE.
//
// Turns a verified provider event into "set user X to plan Y", or into an
// explicit refusal. Pure and provider-shaped-input only, so every branch is
// testable without a network or a Supabase project.
//
// TWO RULES THAT ARE NOT NEGOTIABLE:
//
//   1. An unrecognised price/product NEVER resolves to a plan. Defaulting to
//      anything means a misconfigured price id silently grants a tier nobody
//      paid for. It returns `unknown-price` and the caller rejects loudly.
//
//   2. A cancellation, refund or failed payment resolves DOWNWARD, to 'free'.
//      The dangerous direction is leaving a paid tier in place after the money
//      stopped, so anything that is not an active paid state is treated as
//      not-paid rather than ignored.
// ─────────────────────────────────────────────────────────────────────────

/** Plan ids, mirrored from webapp/src/lib/plans.ts. */
export type PlanId = 'guest' | 'free' | 'pro' | 'max'

export type EventOutcome =
  | {
    kind: 'set-plan'
    userId: string
    plan: PlanId
    eventId: string
    /**
     * The provider's customer id, when the event carries one.
     *
     * Stored so the customer portal can be opened later. Without it there is
     * no way to get from a signed-in account to its billing record, and the
     * only route to "cancel my subscription" is an email to support.
     */
    customerId?: string
    /** The provider's subscription id, for per-subscription portal deep links. */
    subscriptionId?: string
  }
  /** Understood, but nothing to do (e.g. an event type we do not act on). */
  | { kind: 'ignore'; eventId: string; why: string }
  /** Malformed or unmappable — the caller must NOT treat this as success. */
  | { kind: 'reject'; why: 'no-user' | 'unknown-price' | 'unparseable' | 'no-event-id'; detail?: string }

/** price/product id → plan. Supplied from env so ids are not baked into code. */
export type PriceMap = Record<string, PlanId>

/**
 * Parse `PRICE_MAP` env: `pri_abc=pro,pri_def=max`.
 *
 * Entries naming an unknown plan are dropped rather than trusted, so a typo
 * like `pri_abc=professional` fails closed at the mapping step instead of
 * producing a user with a nonsense tier.
 */
export function parsePriceMap(raw: string | undefined): PriceMap {
  const out: PriceMap = {}
  if (!raw) return out
  for (const pair of raw.split(',')) {
    const i = pair.indexOf('=')
    if (i <= 0) continue
    const id = pair.slice(0, i).trim()
    const plan = pair.slice(i + 1).trim()
    if (id && (plan === 'pro' || plan === 'max' || plan === 'free')) out[id] = plan
  }
  return out
}

/** Subscription states that mean "currently paying". */
const ACTIVE = new Set(['active', 'trialing', 'past_due'])

/**
 * `past_due` counts as active on purpose: the provider is still retrying the
 * card, and cutting someone off during a retry window over an expired card is
 * how you lose a customer who fully intended to pay. The provider will send a
 * cancellation if the retries run out, and that downgrades.
 */
export const isActiveStatus = (s: string): boolean => ACTIVE.has(s)

// ── Paddle ────────────────────────────────────────────────────────────────
interface PaddleEvent {
  event_id?: string
  event_type?: string
  data?: {
    /** `sub_…` on subscription events, `txn_…` on transaction events. */
    id?: string
    status?: string
    customer_id?: string
    /** Present on transaction events; the subscription the payment belongs to. */
    subscription_id?: string
    custom_data?: { user_id?: string } | null
    items?: { price?: { id?: string } | null }[] | null
  }
}

/**
 * TWO EVENT FAMILIES, TWO RULES — and conflating them was a real bug.
 *
 * `subscription.*` events carry a lifecycle status, so they decide a plan in
 * both directions: active grants, anything else drops to `free`.
 *
 * `transaction.completed` carries `status: "completed"`, which is not a
 * subscription status at all. Running it through the same check made
 * `isActiveStatus('completed')` false, so **a successful payment downgraded
 * the payer to `free`** — and because Paddle does not order the two events,
 * that could land after the `subscription.created` that granted the tier.
 *
 * So a transaction only ever GRANTS. Money arriving is not evidence that
 * anything should be taken away, and every genuine downgrade — cancellation,
 * failed retries, a pause — arrives as a subscription event.
 */
export function fromPaddle(evt: unknown, prices: PriceMap): EventOutcome {
  const e = evt as PaddleEvent
  const eventId = e?.event_id
  if (!eventId) return { kind: 'reject', why: 'no-event-id' }
  const type = e.event_type ?? ''
  const isSubscription = type.startsWith('subscription.')
  const isPayment = type === 'transaction.completed'
  if (!isSubscription && !isPayment) {
    return { kind: 'ignore', eventId, why: `unhandled type ${type}` }
  }
  const userId = e.data?.custom_data?.user_id
  if (!userId) return { kind: 'reject', why: 'no-user', detail: type }

  // Carried through on every outcome that grants a plan, so the account ends
  // up holding what the portal needs. `id` is the subscription's own id on a
  // subscription event; a transaction names it separately.
  const customerId = e.data?.customer_id
  const subscriptionId = isSubscription ? e.data?.id : e.data?.subscription_id
  const ids = {
    ...(customerId ? { customerId } : {}),
    ...(subscriptionId ? { subscriptionId } : {}),
  }

  if (isSubscription && !isActiveStatus(e.data?.status ?? '')) {
    // Still records the ids: a cancelled subscriber must keep their portal
    // access, or they cannot see the final invoice or resubscribe.
    return { kind: 'set-plan', userId, plan: 'free', eventId, ...ids }
  }

  const priceId = e.data?.items?.[0]?.price?.id
  const plan = priceId ? prices[priceId] : undefined
  if (!plan) return { kind: 'reject', why: 'unknown-price', detail: priceId ?? '(none)' }
  return { kind: 'set-plan', userId, plan, eventId, ...ids }
}

// ── Stripe ────────────────────────────────────────────────────────────────
interface StripeEvent {
  id?: string
  type?: string
  data?: {
    object?: {
      status?: string
      client_reference_id?: string | null
      metadata?: { user_id?: string } | null
      items?: { data?: { price?: { id?: string } | null }[] } | null
    }
  }
}

export function fromStripe(evt: unknown, prices: PriceMap): EventOutcome {
  const e = evt as StripeEvent
  const eventId = e?.id
  if (!eventId) return { kind: 'reject', why: 'no-event-id' }
  const type = e.type ?? ''
  if (!type.startsWith('customer.subscription.')) {
    return { kind: 'ignore', eventId, why: `unhandled type ${type}` }
  }
  const obj = e.data?.object
  // checkout sets client_reference_id; subscription objects carry metadata
  const userId = obj?.metadata?.user_id || obj?.client_reference_id || undefined
  if (!userId) return { kind: 'reject', why: 'no-user', detail: type }

  const status = obj?.status ?? ''
  if (!isActiveStatus(status)) return { kind: 'set-plan', userId, plan: 'free', eventId }

  const priceId = obj?.items?.data?.[0]?.price?.id
  const plan = priceId ? prices[priceId] : undefined
  if (!plan) return { kind: 'reject', why: 'unknown-price', detail: priceId ?? '(none)' }
  return { kind: 'set-plan', userId, plan, eventId }
}

// ── PayMongo ──────────────────────────────────────────────────────────────
//
// Envelope: { data: { id, type: 'event', attributes: { type, data: {…} } } }
// where the INNER `attributes.type` is the event name ('payment.paid',
// 'subscription.updated', …) and `attributes.data` is the resource.
//
// ⚠ THE FIELD PATHS BELOW ARE WRITTEN FROM THE DOCUMENTED ENVELOPE AND HAVE NOT
// BEEN CHECKED AGAINST A REAL PAYMONGO EVENT. Send one test event through
// before going live and confirm `metadata.user_id` and the price identifier
// arrive where this expects them. Everything here fails CLOSED — an
// unrecognised shape returns `reject`, never a plan — so a wrong guess denies a
// paid customer (visible, fixable) rather than granting a free one (silent).
interface PaymongoEvent {
  data?: {
    id?: string
    attributes?: {
      type?: string
      data?: {
        id?: string
        attributes?: {
          status?: string
          metadata?: { user_id?: string } | null
          /** Set on subscription resources; absent on one-off payments. */
          plan_id?: string
          /** Line items on a checkout session / payment. */
          line_items?: { id?: string }[] | null
        }
      }
    }
  }
}

export function fromPaymongo(evt: unknown, prices: PriceMap): EventOutcome {
  const e = evt as PaymongoEvent
  const eventId = e?.data?.id
  if (!eventId) return { kind: 'reject', why: 'no-event-id' }
  const type = e.data?.attributes?.type ?? ''
  const acted = type.startsWith('subscription.') || type === 'payment.paid' || type === 'payment.failed'
  if (!acted) return { kind: 'ignore', eventId, why: `unhandled type ${type}` }

  const res = e.data?.attributes?.data?.attributes
  const userId = res?.metadata?.user_id
  if (!userId) return { kind: 'reject', why: 'no-user', detail: type }

  // A failed payment or an inactive subscription drops to free, same as the
  // other providers — the risky direction is leaving a paid tier standing.
  const status = res?.status ?? ''
  if (type === 'payment.failed' || (type.startsWith('subscription.') && !isActiveStatus(status))) {
    return { kind: 'set-plan', userId, plan: 'free', eventId }
  }

  const priceId = res?.plan_id ?? res?.line_items?.[0]?.id
  const plan = priceId ? prices[priceId] : undefined
  if (!plan) return { kind: 'reject', why: 'unknown-price', detail: priceId ?? '(none)' }
  return { kind: 'set-plan', userId, plan, eventId }
}

export const parseEvent = (
  provider: 'paddle' | 'stripe' | 'paymongo', evt: unknown, prices: PriceMap,
): EventOutcome => (
  provider === 'paddle' ? fromPaddle(evt, prices)
    : provider === 'stripe' ? fromStripe(evt, prices)
      : fromPaymongo(evt, prices)
)
