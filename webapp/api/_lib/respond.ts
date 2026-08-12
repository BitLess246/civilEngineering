// Shared plumbing for the calculation endpoints. Edge runtime.

import { authConfig, bearer, identify, type Caller } from './auth'
import { claimRun, quotaConfig, type QuotaVerdict } from './quota'
import { TICKET_HEADER } from './ticket'

export const json = (body: unknown, status = 200, extra?: Record<string, string>): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      // Same-origin only. These endpoints are called by this app's own pages;
      // there is no third party to open them to, and the calculation is the
      // product.
      'cache-control': 'no-store',
      ...extra,
    },
  })

/**
 * Method check, auth, entitlement, and body parse, IN THAT ORDER.
 *
 * The order is the point. An unauthenticated caller never gets a parse error
 * that tells them what the body should look like, and an out-of-allowance
 * caller never gets a calculation performed on the way to being refused.
 *
 * `route` is the TRIAL ROUTE this endpoint serves — the path in
 * `GUEST_TRIAL_ROUTES` that the page lives at. Each handler passes its own
 * constant. It deliberately cannot come from the request: a caller who could
 * name their own route would simply name a fresh one per request and never run
 * out.
 *
 * Returns either a ready `Response` to send back, or the parsed input plus the
 * headers the successful reply should carry.
 */
export async function guard<T>(
  req: Request,
  env: Record<string, string | undefined>,
  route: string,
): Promise<{ error: Response } | { input: T; caller: Caller; headers: Record<string, string> }> {
  if (req.method === 'OPTIONS') return { error: new Response(null, { status: 204 }) }
  if (req.method !== 'POST') return { error: json({ error: 'method' }, 405) }

  const cfg = authConfig(env)
  if (!cfg) {
    // Deliberately loud. A deployment missing these silently computing for
    // anyone is worse than one that refuses and says why in the logs.
    console.error('calc api: SUPABASE_URL / SUPABASE_ANON_KEY not set')
    return { error: json({ error: 'unconfigured' }, 503) }
  }

  const token = bearer(req.headers.get('authorization'))
  if (!token) return { error: json({ error: 'unauthenticated' }, 401) }
  const caller = await identify(token, cfg)
  if (!caller) return { error: json({ error: 'unauthenticated' }, 401) }

  // Members are not on the counter — `accessFor` gives a signed-in user
  // everything, and asking would spend a database round trip to learn nothing.
  const headers: Record<string, string> = {}
  if (caller.kind === 'guest') {
    const verdict = await claimRun(req, route, quotaConfig(env, cfg.supabaseUrl, cfg.anonKey))
    if (!verdict.ok) return { error: refusal(verdict, route) }
    if (verdict.ticket) headers[TICKET_HEADER] = verdict.ticket
    // Surfaced so a deployment whose gate is inert is VISIBLE in a response,
    // not only in a log nobody reads. It says which failure, never the salt or
    // the subject.
    if (verdict.degraded) headers['x-calc-quota'] = `degraded; ${verdict.degraded}`
  }

  let input: T
  try { input = (await req.json()) as T } catch { return { error: json({ error: 'body' }, 400) } }
  if (input === null || typeof input !== 'object') return { error: json({ error: 'body' }, 400) }

  return { input, caller, headers }
}

/**
 * 402 Payment Required — the honest status for "this needs an account".
 *
 * Not 401: the caller IS authenticated, as a guest, and sending another token
 * would not help. Not 403 either, which would suggest the resource is closed to
 * them permanently rather than after signing up. The body names the route so
 * the page can show the paywall for the calculator actually refused.
 */
function refusal(verdict: Extract<QuotaVerdict, { ok: false }>, route: string): Response {
  return json({ error: 'trial-exhausted', reason: verdict.reason, route, used: verdict.used }, 402)
}

/** Run a solver, turning a throw into a 400 rather than a 500 — bad numbers in
 *  a request are the caller's problem, and the message is the engine's own. */
export function solve<I, R>(fn: (i: I) => R, input: I, headers?: Record<string, string>): Response {
  try {
    return json(fn(input), 200, headers)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'calculation failed'
    return json({ error: message }, 400)
  }
}
