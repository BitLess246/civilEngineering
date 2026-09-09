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
//   GUEST_QUOTA_ORIGINS  origins allowed to CONSUME, comma-separated. Exact
//                      (`https://app.example.com`) or one wildcard label
//                      (`https://*.vercel.app`, which is what keeps preview
//                      deployments working). Unset ⇒ `consume` is refused and
//                      the client falls back to its local count — the same
//                      fail-closed stance as a missing salt.
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
import { parseOrigins, originAllowed, corsOrigin } from '../_shared/originAllow.ts'

const env = (k: string) => Deno.env.get(k)

const DEFAULT_LIMIT = 5

// PEEK is open from any origin: it reveals nothing about anyone — you must
// already BE the visitor to get their own count — and pinning an origin would
// break every preview deployment.
//
// CONSUME is not, and the reason is that this endpoint carries AMBIENT
// AUTHORITY. `_shared/cors.ts` argues, correctly, that `*` is right for the
// billing endpoints because each needs a bearer token only the signed-in tab
// holds, so a hostile page gains nothing; it also says to revisit that the
// moment an endpoint accepts ambient authority. This is that endpoint, and it
// always was: the subject is a salted digest of the CLIENT IP, which the
// browser supplies automatically, exactly like a cookie. A third-party page
// could therefore spend a visitor's whole free trial on a site the visitor has
// never opened, just by fetching this URL while they read something else.
//
// CORS is a BROWSER mechanism, so this stops the drive-by case and not a
// determined script — curl sends any Origin it likes. That is the threat that
// was described, and the header above says in full why the counter is not a
// security boundary in the first place.
const CORS_HEADERS = 'authorization, content-type, apikey, x-client-info'

const corsFor = (origin: string | null, allow: string[]) => ({
  // Reflect an allowlisted origin so `consume` works from it; otherwise the
  // wildcard, which is all `peek` needs and which no credentialed request can
  // use even if one is added later.
  'access-control-allow-origin': corsOrigin(origin, allow),
  'access-control-allow-headers': CORS_HEADERS,
  'access-control-allow-methods': 'POST, OPTIONS',
  // Tell caches the answer varies by Origin, or a proxy will serve one
  // visitor's reflected origin to the next.
  'vary': 'Origin',
})

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin')
  const allow = parseOrigins(env('GUEST_QUOTA_ORIGINS'))
  const CORS = corsFor(origin, allow)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'content-type': 'application/json' },
    })

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

  // The write needs a caller we recognise. `peek` does not: it is read-only and
  // tells the caller only what the caller already is.
  if (action === 'consume' && !originAllowed(origin, allow)) {
    if (allow.length === 0) console.error('GUEST_QUOTA_ORIGINS is not set; refusing to consume')
    // 403, not 429: the client's `unavailable` path falls back to the LOCAL
    // count, which is the pre-server behaviour and the right degradation.
    return json({ error: 'origin' }, 403)
  }

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
