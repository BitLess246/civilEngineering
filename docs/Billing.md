# Billing — how a payment becomes a plan

## Why any of this needs a server

A plan is read from Supabase `user_metadata.plan`, and the feature gate trusts
that field. So the only question that matters is **who is allowed to write it**.

It cannot be the browser. A "user upgraded" request sent from a page can be
forged by the person sending it — they control the code. It has to be the
payment provider telling us, over a channel we can prove came from them. That
proof is an HMAC computed with a secret only the provider and our server share,
which is why the secret cannot live in a `VITE_*` variable, and why there is a
Supabase Edge Function.

```
  browser                provider                 Edge Function            Supabase
  ───────                ────────                 ─────────────            ────────
  "Buy Pro"  ─────────▶  hosted checkout
                         (customer pays)
                              │
                              └── POST webhook ──▶ verify HMAC
                                  + signature       parse event
                                                    map price → plan
                                                    write metadata ──────▶ plan: "pro"
                                                                              │
  gate reads user.plan ◀──────────────────────────────────────── session ─────┘
```

## What is built (this phase)

`supabase/functions/billing-webhook/` — verifies the signature, maps the event
to a plan, writes it with the service-role key. Idempotent: the applied event id
is stored next to the plan, so a provider retry is a no-op.

`supabase/functions/_shared/` — the pure logic, covered by the app's vitest
suite (48 tests):

- `signature.ts` — HMAC-SHA256 verification for **Paddle**, **Stripe** and
  **PayMongo**. Constant-time digest comparison, a ±300 s replay window checked
  in both directions, and rejection on a missing secret.
- `events.ts` — provider event → `set-plan` / `ignore` / `reject`.

### Two rules the tests pin

**An unrecognised price never resolves to a plan.** A typo in `BILLING_PRICE_MAP`
makes the webhook reject loudly rather than silently granting a tier nobody paid
for.

**Anything that is not an active paid state resolves down to `free`.** The
dangerous direction is leaving a paid tier standing after the money stopped.
`past_due` is deliberately treated as active — the provider is still retrying
the card, and cutting someone off mid-retry loses a customer who meant to pay.

Everything here **fails closed**, the opposite of `authClient`/`usePlan`, which
fail open so an unconfigured fork stays usable. The asymmetry is deliberate: the
cost of being wrong is "nobody can use the app" in one case and "anyone can
grant themselves a paid plan" in the other.

## Setup

### 1. Deploy the function

```bash
supabase functions deploy billing-webhook --no-verify-jwt
```

`--no-verify-jwt` is required: the caller is the payment provider, not a
signed-in user. The signature check is what authenticates it instead.

### 2. Set the secrets

```bash
supabase secrets set \
  BILLING_PROVIDER=paymongo \
  BILLING_WEBHOOK_SECRET=whsk_... \
  BILLING_MODE=test \
  BILLING_PRICE_MAP='plan_pro_id=pro,plan_max_id=max'
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform —
do not set them by hand, and never put the service-role key in the web app.

| Secret | Notes |
|---|---|
| `BILLING_PROVIDER` | `paddle`, `stripe` or `paymongo` |
| `BILLING_WEBHOOK_SECRET` | the endpoint's signing secret |
| `BILLING_MODE` | `test` or `live`. **PayMongo only** — it sends both a test (`te=`) and a live (`li=`) digest, and this picks which is authoritative. Accepting either would let a test-mode secret approve a live payment. |
| `BILLING_PRICE_MAP` | `priceId=plan` pairs. Get the ids from the provider dashboard. |

### 3. Point the provider at it

Webhook URL: `https://<project-ref>.supabase.co/functions/v1/billing-webhook`

Subscribe to subscription lifecycle events (created / updated / cancelled) and,
for PayMongo, `payment.paid` and `payment.failed`.

### 4. Attach the user id at checkout

**This is the step that everything else depends on.** The webhook has no way to
know who paid unless checkout carries the Supabase user id:

- **Paddle** — `customData: { user_id: <id> }`
- **Stripe** — `client_reference_id`, or subscription `metadata.user_id`
- **PayMongo** — `metadata: { user_id: <id> }` on the checkout session

Without it the event is rejected with `no-user` and nothing is granted.

## Still to do

**Checkout itself is not wired up.** `CHECKOUT_ENABLED` in `webapp/src/lib/plans.ts`
is still pinned `false` by a test, and the pricing page still says paid plans are
not open. This phase built the half that receives and verifies payment; the half
that *starts* one is next, and needs:

- a `billing-checkout` Edge Function that creates a session with
  `metadata.user_id` attached (PayMongo has no static link that can carry
  per-user metadata, so this cannot be a plain URL in an env var)
- checkout buttons on `/pricing` and a `/billing/success` return page
- `CHECKOUT_ENABLED` derived from configuration rather than hard-coded

### Confirm before going live

**PayMongo field paths are unverified.** `fromPaymongo` was written from the
documented envelope shape, not from a captured event. Send one test event
through and confirm `metadata.user_id` and the price identifier arrive where it
expects. It fails closed, so a wrong guess denies a paying customer — visible
and fixable — rather than granting a free one. The Paddle and Stripe shapes are
the standard documented ones but deserve the same one-event check.

**Recurring billing on PayMongo.** Confirm subscriptions are available on your
account before committing to a monthly plan. If only one-off payments are
available, monthly billing needs a different design (scheduled charges against a
saved payment method), which is materially more work than this.

**Currency.** PayMongo settles in PHP; `/pricing` currently shows USD. Pick one
and make the pricing page and the provider agree — a customer seeing $19 and
being charged ₱1,100 is a support ticket at best.

**Business registration.** PayMongo onboards registered Philippine businesses.
Worth confirming eligibility before building the rest of the flow.
