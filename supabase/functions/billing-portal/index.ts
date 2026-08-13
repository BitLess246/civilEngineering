// ─────────────────────────────────────────────────────────────────────────
// BILLING PORTAL — mints a Paddle customer-portal session for the caller.
//
// The counterpart to `billing-webhook`, and its mirror image in one important
// way: the webhook is called by PADDLE and so cannot verify a JWT, while this
// is called by a SIGNED-IN USER and must verify one before it does anything.
//
//     supabase functions deploy billing-portal
//
// No `--no-verify-jwt` here. The platform checks the token, and the code
// checks it again to get the user — belt and braces, because the cost of being
// wrong is handing someone else's billing history to whoever asked.
//
// Secrets (supabase secrets set …):
//   PADDLE_API_KEY   pdl_… — server-side key. NEVER a VITE_ variable.
//   PADDLE_ENV       sandbox | production   (defaults to production)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  (injected by the platform)
//
// WHY THE SERVICE-ROLE KEY: the customer id lives in `app_metadata`, which is
// not readable with the anon key. It is in app_metadata precisely because the
// browser must not be able to write it — see billing-webhook.
// ─────────────────────────────────────────────────────────────────────────
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { apiBase, customerIdFor, portalUrls, type BillingMetadata } from '../_shared/portal.ts'
import { preflight, jsonWithCors as json } from '../_shared/cors.ts'

const env = (k: string) => Deno.env.get(k)

/**
 * Errors are named, not described.
 *
 * The browser needs to tell "you have nothing to manage" apart from "something
 * broke", because those need different words on screen. It does not need our
 * internal detail, so the reason is a short token and the specifics go to the
 * log where only we can read them.
 */
const fail = (reason: string, status: number) => json({ error: reason }, status)

Deno.serve(async (req: Request): Promise<Response> => {
  // BEFORE the method check: supabase-js sends an OPTIONS preflight, and
  // answering it with 405 is how this function became unreachable from a
  // browser without anything appearing in the logs. See _shared/cors.ts.
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return fail('method-not-allowed', 405)

  const url = env('SUPABASE_URL'), serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  const apiKey = env('PADDLE_API_KEY')
  if (!url || !serviceKey || !apiKey) {
    console.error('billing-portal is missing configuration')
    return fail('not-configured', 500)
  }

  // ── 1. Who is asking? Before anything else. ──────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return fail('unauthenticated', 401)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: got, error: authErr } = await admin.auth.getUser(token)
  const user = got?.user
  if (authErr || !user) return fail('unauthenticated', 401)

  // ── 2. Which customer are they? From THEIR record, never from the body. ──
  // The request body is not read at all. That is the point: there is no input
  // that could steer this at another customer's portal.
  const lookup = customerIdFor(user.app_metadata as BillingMetadata | undefined)
  if (!lookup.ok) return fail('no-customer', 404)

  // ── 3. Mint a session. Single-use and short-lived, so never cached. ──────
  const res = await fetch(
    `${apiBase(env('PADDLE_ENV'))}/customers/${lookup.customerId}/portal-sessions`,
    {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ subscription_ids: lookup.subscriptionIds }),
    },
  )

  if (!res.ok) {
    // The body can name the customer id, so it is logged, not returned.
    console.error(`paddle portal-sessions ${res.status}:`, await res.text())
    return fail('provider-error', 502)
  }

  const parsed = portalUrls(await res.json())
  if (!parsed.ok) {
    console.error('paddle returned a portal session with no usable overview url')
    return fail('provider-error', 502)
  }

  console.log(`portal session for user=${user.id}`)
  return json({ url: parsed.overview, cancelUrl: parsed.cancel })
})
