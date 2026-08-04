// ─────────────────────────────────────────────────────────────────────────
// GUEST TRIALS — the client half of the server-backed counter.
//
// `trialQuota` decides WHAT a guest may do. This decides WHERE the count comes
// from, and it is the reason clearing site data no longer hands out a fresh
// allowance: localStorage is now a CACHE beside a server-side count, not the
// record itself.
//
// THE MERGE RULE IS `max`, PER ROUTE. Not "server wins" and not "newest wins":
//   • server-wins would throw away runs made while offline;
//   • local-wins is the bug we are fixing;
//   • max is monotone, so no ordering of syncs, tabs or reloads can ever
//     LOWER a count. That is the only property worth having here.
//
// FAILURE IS OPEN, ON PURPOSE. If the function is missing, unconfigured or
// unreachable, the guest keeps their local allowance and the app works. The
// alternative — refusing to run a free calculator because a counter endpoint
// is down — breaks the shop window to defend a five-run courtesy. That choice
// is also the honest one: this was never a security boundary (every
// calculation runs in the visitor's own browser), and the comment at the top
// of `trialQuota` says so at more length.
// ─────────────────────────────────────────────────────────────────────────

import { getClient, isAuthConfigured } from './auth/authClient'
import { GUEST_TRIAL_ROUTES } from './trialQuota'

/** Usage map, `route → runs used`, the shape `trialQuota` already speaks. */
export type Usage = Readonly<Record<string, number>>

const FUNCTION_NAME = 'guest-quota'

/**
 * Per-route maximum of two usage maps.
 *
 * Pure and exported for its own test: this is the rule that decides whether a
 * cleared browser gets a fresh allowance, so it should be provable rather than
 * inlined in a hook.
 */
export function mergeUsage(a: Usage = {}, b: Usage = {}): Record<string, number> {
  const out: Record<string, number> = {}
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = sane(a[key]), y = sane(b[key])
    out[key] = Math.max(x, y)
  }
  return out
}

/** A count we are willing to believe: a non-negative whole number. */
function sane(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
}

/** Anything the server sent that is not a `{ route: count }` map is discarded. */
function parseUsage(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, number> = {}
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    const c = sane(n)
    if (c > 0) out[k] = c
  }
  return out
}

/** What a call to the server produced. */
export type RemoteResult =
  /** The server answered; `usage` is its record for this visitor. */
  | { kind: 'ok'; usage: Record<string, number> }
  /** No server to ask, or it could not answer. The caller keeps counting locally. */
  | { kind: 'unavailable'; reason: string }

async function call(body: Record<string, unknown>): Promise<RemoteResult> {
  if (!isAuthConfigured()) return { kind: 'unavailable', reason: 'not-configured' }
  const client = getClient()
  if (!client) return { kind: 'unavailable', reason: 'not-configured' }
  try {
    const { data, error } = await client.functions.invoke(FUNCTION_NAME, { body })
    if (error) return { kind: 'unavailable', reason: error.message || 'invoke-failed' }
    const payload = data as { usage?: unknown; error?: unknown } | null
    if (!payload || payload.error) {
      return { kind: 'unavailable', reason: String(payload?.error ?? 'empty') }
    }
    return { kind: 'ok', usage: parseUsage(payload.usage) }
  } catch (e) {
    return { kind: 'unavailable', reason: e instanceof Error ? e.message : 'threw' }
  }
}

/**
 * Ask the server what it already knows about this visitor.
 *
 * Sends the whole trial-route list in one request rather than one call per
 * page: the answer is needed before the first gate decision, and twenty-eight
 * round trips at start-up would be worse than the problem being solved.
 */
export const peekRemote = (): Promise<RemoteResult> =>
  call({ action: 'peek', routes: [...GUEST_TRIAL_ROUTES] })

/**
 * Record one run against a route and return the server's updated record.
 *
 * The RESULT is what to trust, not a local increment: the server may already
 * have counted runs this browser has no memory of, which is the entire point.
 */
export const consumeRemote = (route: string): Promise<RemoteResult> =>
  call({ action: 'consume', route })
