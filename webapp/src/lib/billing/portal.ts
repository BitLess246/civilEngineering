// ─────────────────────────────────────────────────────────────────────────
// CUSTOMER PORTAL — the browser's side of "manage my subscription".
//
// Thin on purpose. Everything that decides anything happens in the
// `billing-portal` Edge Function: which customer the caller is, and whether
// they may have a session at all. This asks, and navigates.
//
// The session URL is SINGLE-USE and short-lived, so it is never stored,
// remembered or prefetched — a "Manage" button that quietly mints a session on
// mount would hand out a dead link by the time it was clicked.
// ─────────────────────────────────────────────────────────────────────────
import { getClient } from '../auth/authClient'

const FUNCTION_NAME = 'billing-portal'

export type PortalResult =
  | { ok: true; url: string; cancelUrl: string | null }
  /**
   * `no-customer` is not an error and must not be shown as one: it is simply
   * an account that has never bought anything. Every other reason is a fault
   * on our side, phrased for someone who only wanted to cancel.
   */
  | { ok: false; reason: 'no-customer' | 'unauthenticated' | 'unavailable' }

/** Why a portal session could not be opened. */
export type PortalFailure = Exclude<PortalResult, { ok: true }>['reason']

interface PortalPayload {
  url?: unknown
  cancelUrl?: unknown
  error?: unknown
}

/**
 * Ask for a portal session for the SIGNED-IN user.
 *
 * Takes no arguments, and that is a design decision rather than an oversight:
 * the function resolves the customer from the caller's own record, so there is
 * nothing here that could point it at anybody else's billing.
 */
export async function openPortalSession(): Promise<PortalResult> {
  const client = getClient()
  if (!client) return { ok: false, reason: 'unauthenticated' }

  try {
    // supabase-js attaches the session's access token; the function rejects
    // the request outright without one.
    const { data, error } = await client.functions.invoke(FUNCTION_NAME, { body: {} })

    if (error) {
      // A non-2xx arrives here as an error with the body attached. The reason
      // token is what distinguishes "nothing to manage" from "we are broken",
      // and those need different words on screen.
      const reason = await reasonFromError(error)
      return { ok: false, reason }
    }

    const payload = data as PortalPayload | null
    const url = typeof payload?.url === 'string' ? payload.url : ''
    if (!url.startsWith('https://')) return { ok: false, reason: 'unavailable' }

    const cancelUrl = typeof payload?.cancelUrl === 'string' && payload.cancelUrl.startsWith('https://')
      ? payload.cancelUrl
      : null
    return { ok: true, url, cancelUrl }
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}

/** Recover the function's `error` token from a FunctionsHttpError, if it sent one. */
async function reasonFromError(error: unknown): Promise<PortalFailure> {
  const ctx = (error as { context?: { json?: () => Promise<unknown>; status?: number } })?.context
  try {
    const body = (await ctx?.json?.()) as { error?: unknown } | undefined
    const token = typeof body?.error === 'string' ? body.error : ''
    if (token === 'no-customer') return 'no-customer'
    if (token === 'unauthenticated') return 'unauthenticated'
  } catch {
    // Body already consumed or not JSON — fall through to the generic reason.
  }
  return ctx?.status === 401 ? 'unauthenticated' : 'unavailable'
}

/** What to tell someone whose portal would not open. */
export function portalMessage(reason: PortalFailure): string {
  switch (reason) {
    case 'no-customer':
      return 'You have no paid subscription yet, so there is nothing to manage.'
    case 'unauthenticated':
      return 'Please sign in again — your session has expired.'
    case 'unavailable':
      return 'The billing portal could not be opened. Please try again, or email us and we will handle it for you.'
  }
}
