// ─────────────────────────────────────────────────────────────────────────
// OPENING A PADDLE CHECKOUT — the browser half of buying a plan.
//
// The I/O shell around `paddleConfig`: it loads Paddle.js once and opens the
// overlay for a tier and billing period. The rules live next door and are
// tested; what is here is the part that needs a real browser.
//
// WHAT THIS DOES NOT DO: grant anybody anything. A completed checkout tells us
// only that the customer's browser reached the end of the flow — they can shut
// the tab first, and a `checkout.completed` event can be forged by anyone with
// devtools. The plan is granted by supabase/functions/billing-webhook, which
// verifies Paddle's signature and writes app_metadata with the service-role
// key. This module's only lasting job is to attach `user_id` so that webhook
// knows whose account to credit.
//
// THE `user_id` IS THE WHOLE INTEGRATION. Paddle copies a checkout's
// customData onto the transaction and then onto the subscription created from
// it, and every later renewal inherits it — so this one field is what links a
// Paddle subscription to a Supabase account for the life of the subscription.
// A checkout opened without it produces a payment that the webhook rejects as
// `no-user`: money taken, no plan granted. Hence `requireUserId` below, and
// hence the pricing page sends signed-out visitors to sign up first.
// ─────────────────────────────────────────────────────────────────────────
import { initializePaddle, type Paddle } from '@paddle/paddle-js'
import type { BillingPeriod } from '../plans'
import { PADDLE_CONFIG, type PaidPlanId } from './paddleConfig'

/** Kept module-level so a second button press reuses the first load. */
let loading: Promise<Paddle | null> | null = null

/**
 * Load Paddle.js, at most once per page.
 *
 * `initializePaddle` refuses a second call, so the promise is cached rather
 * than the resolved instance — two rapid clicks must not race into two loads.
 */
export function loadPaddle(): Promise<Paddle | null> {
  if (!PADDLE_CONFIG) return Promise.resolve(null)
  if (loading) return loading
  loading = initializePaddle({
    token: PADDLE_CONFIG.token,
    environment: PADDLE_CONFIG.environment,
  })
    // `initializePaddle` resolves undefined rather than rejecting on some
    // failures; both mean the same thing to every caller, so they collapse.
    .then((p) => p ?? null)
    .catch((err) => {
      // Let the next attempt try again: the usual cause is a transient network
      // failure fetching Paddle's script, and caching that rejection forever
      // would mean one bad moment disables checkout until a reload.
      loading = null
      console.error('[billing] Paddle.js failed to load', err)
      return null
    })
  return loading
}

export interface CheckoutRequest {
  plan: PaidPlanId
  period: BillingPeriod
  /** Supabase user id. Required — see the header. */
  userId: string
  /** Prefills the checkout so a signed-in customer does not retype it. */
  email?: string | null
  /** Where Paddle sends the browser after a successful payment. */
  successUrl?: string
}

export type CheckoutOutcome =
  | { ok: true }
  | { ok: false; reason: 'not-configured' | 'no-user' | 'load-failed' | 'open-failed' }

/**
 * Open the overlay checkout for a plan.
 *
 * Resolves as soon as the overlay is handed to Paddle. It does NOT resolve
 * "the customer paid" — that answer arrives at the webhook, and treating this
 * return value as a purchase is the mistake the header warns about.
 */
export async function openPlanCheckout(req: CheckoutRequest): Promise<CheckoutOutcome> {
  if (!PADDLE_CONFIG) return { ok: false, reason: 'not-configured' }
  if (!req.userId) return { ok: false, reason: 'no-user' }

  const priceId = PADDLE_CONFIG.prices[req.plan][req.period]
  const paddle = await loadPaddle()
  if (!paddle) return { ok: false, reason: 'load-failed' }

  try {
    paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      // Snake_case because the webhook reads `data.custom_data.user_id`;
      // Paddle passes these keys through verbatim.
      customData: { user_id: req.userId },
      ...(req.email ? { customer: { email: req.email } } : {}),
      settings: {
        variant: 'one-page',
        ...(req.successUrl ? { successUrl: req.successUrl } : {}),
      },
    })
    return { ok: true }
  } catch (err) {
    console.error('[billing] could not open checkout', err)
    return { ok: false, reason: 'open-failed' }
  }
}

/** What to tell a customer when a checkout could not be opened. */
export function checkoutErrorMessage(reason: Exclude<CheckoutOutcome, { ok: true }>['reason']): string {
  switch (reason) {
    case 'not-configured':
      return 'Checkout is not available on this deployment yet.'
    case 'no-user':
      return 'Please sign in first — a plan has to be attached to an account.'
    case 'load-failed':
      return 'The payment window could not load. Check your connection, or disable an ad blocker, and try again.'
    case 'open-failed':
      return 'Something went wrong opening the payment window. Please try again.'
  }
}
