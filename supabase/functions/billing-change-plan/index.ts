// ─────────────────────────────────────────────────────────────────────────
// CHANGE PLAN — moves a subscriber between tiers on their EXISTING subscription.
//
// Third of the three billing functions, and it shares `billing-portal`'s shape:
// called by a signed-in user, so the JWT is verified by the platform AND again
// here, and every id that decides whose money moves comes from the caller's own
// account record.
//
//     supabase functions deploy billing-change-plan       # NO --no-verify-jwt
//
// Secrets (supabase secrets set …):
//   PADDLE_API_KEY      pdl_… — server-side key. NEVER a VITE_ variable.
//   PADDLE_ENV          sandbox | production   (defaults to production)
//   BILLING_PRICE_MAP   the same variable the webhook reads, with the optional
//                       `:period` suffix — `pri_x=pro:monthly,…`. Without the
//                       periods a term switch cannot be ranked and is billed at
//                       the next renewal; see planChange.ts.
//
// WHAT THE BROWSER MAY DECIDE: which price to move TO, and nothing else. That
// is safe because the target is validated against the catalog before it goes
// anywhere — a caller can only ask for a tier we actually sell, at the price we
// advertise it at. WHICH SUBSCRIPTION IS CHANGED IS NOT THE BROWSER'S TO SAY:
// it comes from the caller's `app_metadata`, so there is no input that could
// point this at somebody else's subscription.
//
// IT DOES NOT GRANT THE PLAN. A successful update means Paddle accepted the
// change; the tier still arrives through `billing-webhook` on the resulting
// `subscription.updated`, which is the only thing that writes `app_metadata`.
// That ordering is why the UI tells the customer their plan follows shortly
// rather than showing them the new tier immediately.
// ─────────────────────────────────────────────────────────────────────────
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { apiBase, customerIdFor, type BillingMetadata } from '../_shared/portal.ts'
import {
  parsePlanCatalog, planChangeDecision, changeBody, summarizeChange,
  currentPriceOf, isChangeableStatus,
} from '../_shared/planChange.ts'
import { preflight, jsonWithCors as json } from '../_shared/cors.ts'

const env = (k: string) => Deno.env.get(k)

/** Named reasons, not sentences — the browser picks the wording. */
const fail = (reason: string, status: number) => json({ error: reason }, status)

Deno.serve(async (req: Request): Promise<Response> => {
  // BEFORE the method check — see _shared/cors.ts.
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return fail('method-not-allowed', 405)

  const url = env('SUPABASE_URL'), serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  const apiKey = env('PADDLE_API_KEY')
  if (!url || !serviceKey || !apiKey) {
    console.error('billing-change-plan is missing configuration')
    return fail('not-configured', 500)
  }
  const catalog = parsePlanCatalog(env('BILLING_PRICE_MAP'))
  if (!Object.keys(catalog).length) {
    console.error('billing-change-plan has an empty BILLING_PRICE_MAP')
    return fail('not-configured', 500)
  }

  // ── 1. Who is asking? ────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return fail('unauthenticated', 401)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: got, error: authErr } = await admin.auth.getUser(token)
  const user = got?.user
  if (authErr || !user) return fail('unauthenticated', 401)

  // ── 2. What are they asking for? The target price, and preview-or-commit. ─
  let body: { priceId?: unknown; commit?: unknown }
  try {
    body = await req.json()
  } catch {
    return fail('bad-request', 400)
  }
  const targetPriceId = typeof body.priceId === 'string' ? body.priceId.trim() : ''
  // Preview is the DEFAULT. `commit` has to be asked for explicitly, so a
  // malformed or truncated request can only ever cost a preview.
  const commit = body.commit === true
  if (!targetPriceId || !catalog[targetPriceId]) return fail('unknown-price', 422)

  // ── 3. Whose subscription? From their record, never from the request. ────
  const lookup = customerIdFor(user.app_metadata as BillingMetadata | undefined)
  if (!lookup.ok) return fail('no-customer', 404)
  const subscriptionId = lookup.subscriptionIds[0]
  if (!subscriptionId) return fail('no-subscription', 404)

  const base = apiBase(env('PADDLE_ENV'))
  const headers = {
    'authorization': `Bearer ${apiKey}`,
    'content-type': 'application/json',
  }

  // ── 4. What are they on now? Paddle is the authority, not our metadata. ──
  // `app_metadata.plan` says the tier but not the term, and it lags by however
  // long the last webhook took. The subscription itself cannot be stale.
  const current = await fetch(`${base}/subscriptions/${subscriptionId}`, { headers })
  if (!current.ok) {
    console.error(`paddle get-subscription ${current.status}:`, await current.text())
    return fail('provider-error', 502)
  }
  const currentBody = await current.json()
  if (!isChangeableStatus(currentBody)) return fail('not-changeable', 409)

  const decision = planChangeDecision(currentPriceOf(currentBody), targetPriceId, catalog)
  if (!decision.ok) return fail(decision.reason, 422)

  // ── 5. Preview, or commit. Same body either way — that is the point. ─────
  const path = commit
    ? `${base}/subscriptions/${subscriptionId}`
    : `${base}/subscriptions/${subscriptionId}/preview`
  const res = await fetch(path, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(changeBody(targetPriceId, decision.mode)),
  })

  if (!res.ok) {
    const detail = await res.text()
    // Can name the customer and the subscription, so it is logged, not returned.
    console.error(`paddle subscription-${commit ? 'update' : 'preview'} ${res.status}:`, detail)
    // A declined card on an immediate upgrade lands here, thanks to
    // `on_payment_failure: prevent_change`: the subscription is untouched and
    // the customer needs to hear about their card, not about our server.
    if (res.status === 400 && detail.includes('transaction_payment_failed')) {
      return fail('payment-failed', 402)
    }
    return fail('provider-error', 502)
  }

  const summary = summarizeChange(await res.json())
  console.log(
    `plan ${commit ? 'change' : 'preview'} user=${user.id} `
    + `sub=${subscriptionId} price=${targetPriceId} ${decision.direction}`,
  )
  return json({ ...summary, direction: decision.direction, committed: commit })
})
