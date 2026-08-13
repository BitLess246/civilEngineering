// ─────────────────────────────────────────────────────────────────────────
// BILLING HISTORY — one page of the caller's own transactions.
//
// The fourth billing function, and the same shape as the other two that a user
// calls: the platform verifies the JWT, the code verifies it again, and the
// customer id comes from the caller's `app_metadata` rather than the request.
//
//     supabase functions deploy billing-history        # NO --no-verify-jwt
//
// Secrets: PADDLE_API_KEY, PADDLE_ENV (see billing-portal).
//
// THE ONLY INPUT IS A CURSOR. `after` is a `txn_…` id and nothing else can be
// asked for — no customer, no filter, no page size. Paddle's list endpoint
// returns EVERY transaction in the account when it is not scoped, so the scope
// is built in `historyQuery` from an id this function looked up itself, and a
// forged cursor can at worst page past the caller's own history.
//
// Read-only, and deliberately less than the portal: no invoice downloads, no
// card changes, no cancellation. Those need a portal session, and a summary a
// customer can glance at should not require minting one.
// ─────────────────────────────────────────────────────────────────────────
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { apiBase, customerIdFor, type BillingMetadata } from '../_shared/portal.ts'
import { historyQuery, readHistory } from '../_shared/history.ts'

const env = (k: string) => Deno.env.get(k)

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const fail = (reason: string, status: number) => json({ error: reason }, status)

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return fail('method-not-allowed', 405)

  const url = env('SUPABASE_URL'), serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  const apiKey = env('PADDLE_API_KEY')
  if (!url || !serviceKey || !apiKey) {
    console.error('billing-history is missing configuration')
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

  // ── 2. The cursor, and only the cursor. ──────────────────────────────────
  let body: { after?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    // An empty body means "the first page", which is the common case.
  }
  const after = typeof body.after === 'string' ? body.after : null

  // ── 3. Whose history? From their record. ─────────────────────────────────
  const lookup = customerIdFor(user.app_metadata as BillingMetadata | undefined)
  if (!lookup.ok) {
    // Not an error: an account that has never bought anything simply has no
    // history, and the profile page renders nothing rather than a failure.
    return json({ items: [], hasMore: false })
  }

  const built = historyQuery(lookup.customerId, after)
  if (!built.ok) return json({ items: [], hasMore: false })

  const res = await fetch(`${apiBase(env('PADDLE_ENV'))}/transactions?${built.query}`, {
    headers: { 'authorization': `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    console.error(`paddle list-transactions ${res.status}:`, await res.text())
    return fail('provider-error', 502)
  }

  const page = readHistory(await res.json())
  console.log(`history user=${user.id} rows=${page.items.length} more=${page.hasMore}`)
  return json(page)
})
