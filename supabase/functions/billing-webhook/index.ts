// ─────────────────────────────────────────────────────────────────────────
// BILLING WEBHOOK — the server half of checkout, and the only place a plan is
// ever granted.
//
// Runs on Supabase Edge Functions (Deno). It lives here rather than in the SPA
// because it needs two things the browser must never hold: the webhook signing
// secret (without which any POST could claim a payment) and the service_role
// key (which can write another user's metadata).
//
// DEPLOY WITHOUT JWT VERIFICATION — the provider is not a signed-in user:
//     supabase functions deploy billing-webhook --no-verify-jwt
// The signature check below is what authenticates the caller instead.
//
// Secrets (supabase secrets set …):
//   BILLING_PROVIDER      paddle | stripe | paymongo
//   BILLING_WEBHOOK_SECRET  the endpoint's signing secret
//   BILLING_MODE          test | live      (PayMongo only; picks te= vs li=)
//   BILLING_PRICE_MAP     pri_abc=pro,pri_def=max
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  (injected by the platform)
//
// The pure logic is in ../_shared and is covered by the app's vitest suite;
// this file is the I/O shell around it, kept deliberately thin.
// ─────────────────────────────────────────────────────────────────────────
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { SIGNATURE_HEADER, verifySignature, type Provider } from '../_shared/signature.ts'
import { parseEvent, parsePriceMap } from '../_shared/events.ts'

const env = (k: string) => Deno.env.get(k)

/** Never echo the reason for a rejection — it tells a prober what to fix. */
const deny = (status = 400) => new Response('rejected', { status })

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const provider = env('BILLING_PROVIDER') as Provider | undefined
  if (provider !== 'paddle' && provider !== 'stripe' && provider !== 'paymongo') {
    console.error('BILLING_PROVIDER is not set to a known provider')
    return deny(500)
  }

  // Read the body ONCE, as text. Verification must run over the exact bytes the
  // provider signed — re-serialising parsed JSON changes key order and spacing
  // and the digest will not match.
  const rawBody = await req.text()
  const header = req.headers.get(SIGNATURE_HEADER[provider])

  const sig = await verifySignature(provider, {
    rawBody,
    header,
    secret: env('BILLING_WEBHOOK_SECRET'),
    mode: env('BILLING_MODE') === 'test' ? 'test' : 'live',
  })
  if (!sig.ok) {
    console.warn('signature rejected:', sig.reason)
    return deny(sig.reason === 'no-secret' ? 500 : 401)
  }

  let payload: unknown
  try { payload = JSON.parse(rawBody) } catch { return deny() }

  const outcome = parseEvent(provider, payload, parsePriceMap(env('BILLING_PRICE_MAP')))
  if (outcome.kind === 'reject') {
    // Loud, because every one of these is a misconfiguration on our side — a
    // price id missing from BILLING_PRICE_MAP, or a checkout that forgot to
    // attach the user id. Silence here means paying customers not getting what
    // they bought.
    console.error('unusable event:', outcome.why, outcome.detail ?? '')
    return deny(422)
  }
  if (outcome.kind === 'ignore') return new Response('ignored', { status: 200 })

  const url = env('SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) { console.error('service role credentials missing'); return deny(500) }
  const admin = createClient(url, key, { auth: { persistSession: false } })

  // Idempotency: providers retry until they get a 2xx, and a retry must not
  // re-apply a change that has since been superseded by a later event. The
  // last applied event id is kept alongside the plan, and a repeat is a no-op.
  const { data: existing, error: readErr } = await admin.auth.admin.getUserById(outcome.userId)
  if (readErr || !existing?.user) {
    console.error('no such user:', outcome.userId, readErr?.message ?? '')
    return deny(404)
  }
  // THE PLAN LIVES IN app_metadata. `updateUser({ data })` from the browser
  // writes user_metadata, so a plan kept there could be granted by the account
  // itself; app_metadata is writable only with the service-role key, which is
  // held here and nowhere else. The client reads app_metadata with no fallback.
  const meta = (existing.user.app_metadata ?? {}) as Record<string, unknown>
  if (meta.billing_event_id === outcome.eventId) {
    return new Response('already applied', { status: 200 })
  }

  const { error } = await admin.auth.admin.updateUserById(outcome.userId, {
    // SPREAD, never replace: app_metadata also carries Supabase's own
    // `provider` and `providers` fields, and dropping those breaks sign-in.
    app_metadata: {
      ...meta,
      plan: outcome.plan,
      billing_event_id: outcome.eventId,
      billing_updated_at: new Date().toISOString(),
      // The provider's ids, kept so `billing-portal` can open the customer
      // portal later. Written only when the event carried them, so an event
      // without ids cannot blank out what an earlier one established —
      // otherwise a customer would lose the ability to cancel.
      ...(outcome.customerId ? { paddle_customer_id: outcome.customerId } : {}),
      ...(outcome.subscriptionId ? { paddle_subscription_id: outcome.subscriptionId } : {}),
    },
  })
  if (error) {
    // 5xx so the provider retries — a dropped write here is a customer who paid
    // and did not get their plan.
    console.error('failed to write plan:', error.message)
    return new Response('retry', { status: 500 })
  }

  console.log(`plan=${outcome.plan} user=${outcome.userId} event=${outcome.eventId}`)
  return new Response('ok', { status: 200 })
})
