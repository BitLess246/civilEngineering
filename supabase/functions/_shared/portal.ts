// ─────────────────────────────────────────────────────────────────────────
// CUSTOMER PORTAL — the pure half of "let me manage my subscription".
//
// Paddle hosts the portal UI; our only job is to mint a session for the RIGHT
// customer and hand back one URL. That decision is what lives here, away from
// the fetch, because it is the part that can be wrong in a way that matters.
//
// THE RULE THE WHOLE THING RESTS ON: the customer id comes from the caller's
// OWN account record, never from the request body. A portal URL is a key to
// somebody's billing history, saved cards and cancellation controls — if a
// caller could name the customer, any signed-in user could read any other
// customer's billing by guessing a `ctm_…`. `customerIdFor` takes the metadata
// of an already-authenticated user for exactly that reason: there is no code
// path here that accepts an id from outside.
//
// Sessions are single-use and short-lived, so nothing is cached: every click
// mints a new one.
// ─────────────────────────────────────────────────────────────────────────

/** Where Paddle's API lives, per environment. */
export const PADDLE_API = {
  sandbox: 'https://sandbox-api.paddle.com',
  production: 'https://api.paddle.com',
} as const

export type PaddleEnv = keyof typeof PADDLE_API

/** `production` unless explicitly told otherwise — see `apiBase`. */
export function paddleEnv(raw: string | undefined): PaddleEnv {
  return raw === 'sandbox' ? 'sandbox' : 'production'
}

/**
 * The API base for an environment name.
 *
 * Defaults to PRODUCTION when the variable is missing or misspelled, which is
 * the opposite of the web app's fail-closed reading and deliberate. Here the
 * wrong guess is harmless-but-visible: pointing at production with a sandbox
 * key returns 403 and nobody's portal opens. Guessing SANDBOX for a live
 * deployment would instead 403 for real paying customers who are trying to
 * cancel — the failure that generates chargebacks.
 */
export const apiBase = (raw: string | undefined): string => PADDLE_API[paddleEnv(raw)]

/** The bits of a Supabase user's app_metadata this cares about. */
export interface BillingMetadata {
  paddle_customer_id?: unknown
  paddle_subscription_id?: unknown
}

export type CustomerLookup =
  | { ok: true; customerId: string; subscriptionIds: string[] }
  /** The account has never completed a checkout, so Paddle knows nothing of it. */
  | { ok: false; reason: 'no-customer' }

/**
 * Resolve the Paddle customer for an authenticated user.
 *
 * Rejects anything that is not a `ctm_…` string. A blank or malformed value
 * must not be forwarded: Paddle answers a missing customer id with a 400 whose
 * message means nothing to the person who clicked the button, and "you have no
 * subscription yet" is both truer and more useful.
 */
export function customerIdFor(meta: BillingMetadata | null | undefined): CustomerLookup {
  const customerId = typeof meta?.paddle_customer_id === 'string' ? meta.paddle_customer_id.trim() : ''
  if (!customerId.startsWith('ctm_')) return { ok: false, reason: 'no-customer' }

  const sub = typeof meta?.paddle_subscription_id === 'string' ? meta.paddle_subscription_id.trim() : ''
  // An empty list is valid — the portal still opens on the account overview.
  // Passing a malformed id instead would fail the whole request.
  return { ok: true, customerId, subscriptionIds: sub.startsWith('sub_') ? [sub] : [] }
}

/** Paddle's create-portal-session response, as much of it as is used. */
interface PortalResponse {
  data?: {
    urls?: {
      general?: { overview?: string }
      subscriptions?: { id?: string; cancel_subscription?: string }[]
    }
  }
}

export type PortalUrls =
  | { ok: true; overview: string; cancel: string | null }
  | { ok: false; reason: 'malformed' }

/**
 * Pull the two URLs worth returning out of Paddle's response.
 *
 * `overview` is the portal home. `cancel` is the deep link straight to the
 * cancellation screen for the subscription, when there is one — offered
 * because burying cancellation is a dark pattern, and because a customer who
 * cannot find the button emails support instead, which costs more than the
 * subscription was worth.
 *
 * Everything else in the response — the session id, the customer id, the rest
 * of the deep-link table — stays on the server. The browser needs a URL.
 */
export function portalUrls(body: unknown): PortalUrls {
  const urls = (body as PortalResponse)?.data?.urls
  const overview = urls?.general?.overview
  if (typeof overview !== 'string' || !overview.startsWith('https://')) {
    return { ok: false, reason: 'malformed' }
  }
  const cancel = urls?.subscriptions?.[0]?.cancel_subscription
  return {
    ok: true,
    overview,
    cancel: typeof cancel === 'string' && cancel.startsWith('https://') ? cancel : null,
  }
}
