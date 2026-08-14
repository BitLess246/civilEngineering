// ─────────────────────────────────────────────────────────────────────────
// GUEST QUOTA — the server half of the trial counter.
//
// The count used to live only in localStorage, so clearing site data handed
// out a fresh allowance on every calculator. This function keeps the durable
// copy, keyed by a salted digest of request metadata (see
// ../_shared/guestSubject.ts, which argues the derivation and its limits).
//
// It runs here rather than in the SPA because it needs two things the browser
// must never hold: the subject SALT (without which the stored digests are
// reversible to IP addresses) and the SERVICE ROLE key (the table is
// deliberately unreachable by anon and authenticated alike).
//
// Deploy normally — JWT verification ON is correct. A guest has no session but
// the SPA always sends the anon key, which is a valid JWT:
//     supabase functions deploy guest-quota
//
// Secrets (supabase secrets set …):
//   GUEST_TRIAL_SALT   ≥24 chars of random. `openssl rand -hex 32`.
//   GUEST_TRIAL_LIMIT  optional; runs per calculator. Defaults to 5.
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY   (injected by the platform)
//
// THIS IS NOT A SECURITY BOUNDARY, and the app says so in three other places
// already: every calculation runs in the visitor's own browser and there is no
// server to withhold it from them. What this closes is the specific, trivial
// reset — clear the cache, get five more — that made the counter meaningless.
// ─────────────────────────────────────────────────────────────────────────
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  clientIp, normalizeRoute, subjectHash, saltUsable, ROUTE_CAP_PER_SUBJECT,
} from '../_shared/guestSubject.ts'

const env = (k: string) => Deno.env.get(k)

const DEFAULT_LIMIT = 5

// Allowed from any origin: the endpoint reveals nothing about anyone (you must
// already be the visitor to get their own count) and pinning an origin here
// would break every preview deployment.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  const salt = env('GUEST_TRIAL_SALT')
  if (!saltUsable(salt)) {
    // Fail rather than hash with a default. An unsalted digest of an IPv4
    // address is reversible in minutes, so a weak salt would turn this table
    // into a log of who visited from where — a far worse outcome than a
    // counter that does not work yet.
    console.error('GUEST_TRIAL_SALT is missing or too short; refusing to hash')
    return json({ error: 'unconfigured' }, 503)
  }

  const limit = Math.max(1, Number(env('GUEST_TRIAL_LIMIT') ?? DEFAULT_LIMIT) || DEFAULT_LIMIT)

  let body: { action?: unknown; route?: unknown; routes?: unknown; run?: unknown }
  try { body = await req.json() } catch { return json({ error: 'body' }, 400) }

  const action = body.action === 'consume' ? 'consume' : 'peek'

  // The token naming this ARRIVAL, minted by `calcRun.startRun()` on the client
  // and sent by BOTH halves of the counter so one visit is charged once. Bounds
  // and charset match what `claim_guest_run` is willing to remember; anything
  // else becomes null, which charges every request rather than granting
  // anything. Stripping it is therefore strictly worse for the caller, which is
  // the direction a client-supplied value has to fail in.
  const run = typeof body.run === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(body.run)
    ? body.run
    : null

  // `peek` asks about several routes at once (the whole trial list on page
  // load); `consume` is always exactly one.
  const rawRoutes = action === 'consume'
    ? [body.route]
    : Array.isArray(body.routes) ? body.routes.slice(0, ROUTE_CAP_PER_SUBJECT) : [body.route]
  const routes = [...new Set(rawRoutes.map(normalizeRoute).filter((r): r is string => r !== null))]
  if (routes.length === 0) return json({ error: 'route' }, 400)

  const ip = clientIp(req.headers)
  if (!ip) {
    // No address means no subject. Say so and let the client fall back to its
    // local count rather than filing everybody under one shared row.
    return json({ error: 'no-subject' }, 422)
  }

  const subject = await subjectHash(salt, ip)

  const url = env('SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing')
    return json({ error: 'unconfigured' }, 503)
  }
  const db = createClient(url, key, { auth: { persistSession: false } })

  try {
    if (action === 'consume') {
      const route = routes[0]
      // ── ONE ARRIVAL, ONE RUN, ACROSS BOTH HALVES ────────────────────────
      // This used to call `consume_guest_trial`, which only ever adds one. The
      // calculation endpoint on Vercel calls `claim_guest_run`, which also adds
      // one — and both key the SAME (subject, route) row, deliberately, since
      // the subject derivations are pinned identical by `subject.test.ts`. So a
      // guest arriving at one of the three API-served calculators was charged
      // TWICE for a single visit and got two runs out of five.
      //
      // Both halves now go through `claim_guest_run` and both send the SAME run
      // token, so the second call finds the token in `recent_runs` and is
      // allowed WITHOUT being charged. That is the mechanism the function was
      // built around — it exists so a page recomputing on every keystroke costs
      // one run — and this is simply another caller of the same run.
      //
      // The ~25 browser-only calculators never reach the Vercel endpoint at
      // all, so for them this call is the only one and charges normally. That
      // is why the fix is here rather than "stop counting in guest-quota":
      // dropping the write would leave every browser-only calculator unmetered.
      const { data: claim, error: rpcErr } = await db.rpc('claim_guest_run', {
        p_subject: subject, p_route: route, p_run: run,
        p_limit: limit, p_cap: ROUTE_CAP_PER_SUBJECT,
      })
      if (rpcErr) throw rpcErr

      // PostgREST returns a RETURNS TABLE function as an array of rows.
      const row = Array.isArray(claim) ? claim[0] : null
      if (row?.reason === 'route-cap') return json({ error: 'route-cap' }, 429)
      // `exhausted` is NOT an error here. The client needs the usage map to
      // draw the paywall, and it derives "exhausted" from the count itself —
      // returning 4xx would send it down the `unavailable` path, which falls
      // back to the LOCAL count and shows the visitor runs they do not have.
    }

    const { data, error } = await db
      .from('guest_trials').select('route, used').eq('subject', subject)
    if (error) throw error
    return json({ usage: usageOf(data), limit })
  } catch (e) {
    // Log the detail, return none. The client treats any failure as "server
    // unknown" and falls back to its local count.
    console.error('guest-quota:', e instanceof Error ? e.message : e)
    return json({ error: 'server' }, 500)
  }
})

/** Rows → the `{ route: used }` shape the client's trialQuota already speaks. */
function usageOf(rows: { route: string; used: number }[] | null): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows ?? []) out[r.route] = r.used
  return out
}
