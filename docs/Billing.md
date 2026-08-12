# Billing — how a payment becomes a plan

**Provider: Paddle**, as merchant of record. Paddle bills the customer, handles
sales tax and VAT in every jurisdiction, and pays out a balance — which is why
there is no tax logic anywhere in this repo.

## Why any of this needs a server

A plan is read from Supabase **`app_metadata.plan`**, and the feature gate
trusts that field. So the only question that matters is **who is allowed to
write it**.

Not the browser, on two counts. `updateUser({ data })` from a page writes
`user_metadata`, so a plan kept there could be granted by the account itself —
hence `app_metadata`, which only the service-role key can write. And a "user
upgraded" request sent from a page can be forged by the person sending it, since
they control the code. It has to be Paddle telling us, over a channel we can
prove came from them: an HMAC computed with a secret only Paddle and our server
share. That secret cannot live in a `VITE_*` variable, which is why there is a
Supabase Edge Function.

```
  browser                  Paddle                   Edge Function            Supabase
  ───────                  ──────                   ─────────────            ────────
  "Choose Pro"
  Paddle.Checkout.open()
    customData:{user_id} ──▶ overlay checkout
                             (customer pays)
                                  │
                                  └── POST webhook ──▶ verify HMAC
                                      + signature       parse event
                                                        map price → plan
                                                        write app_metadata ──▶ plan: "pro"
                                                                                  │
  gate reads user.plan ◀──────────────────────────────────── session ─────────────┘
```

The browser's only lasting contribution is `customData.user_id`. Everything
else it does is presentation.

## The two halves

### Receiving payment — `supabase/functions/`

`billing-webhook/` verifies the signature, maps the event to a plan, and writes
it with the service-role key. Idempotent: the applied event id is stored next to
the plan, so a Paddle retry is a no-op.

`_shared/` holds the pure logic, covered by the app's vitest suite:

- `signature.ts` — HMAC-SHA256 verification for **Paddle**, Stripe and PayMongo.
  Constant-time digest comparison, a ±300 s replay window checked in both
  directions, and rejection on a missing secret.
- `events.ts` — provider event → `set-plan` / `ignore` / `reject`.

**Two rules the tests pin.** *An unrecognised price never resolves to a plan* —
a typo in `BILLING_PRICE_MAP` makes the webhook reject loudly rather than
silently granting a tier nobody paid for. *Anything that is not an active paid
state resolves down to `free`* — the dangerous direction is leaving a paid tier
standing after the money stopped. `past_due` is deliberately treated as active:
Paddle is still retrying the card, and cutting someone off mid-retry loses a
customer who meant to pay.

Everything here **fails closed**, the opposite of `authClient`/`usePlan`, which
fail open so an unconfigured fork stays usable. The asymmetry is deliberate: the
cost of being wrong is "nobody can use the app" in one case and "anyone can
grant themselves a paid plan" in the other.

### Starting payment — `webapp/src/lib/billing/`

`paddleConfig.ts` reads the six `VITE_PADDLE_*` variables and decides whether
this deploy may open a checkout. Pure, and tested against every failure mode.
`CHECKOUT_ENABLED` comes from here — it is a fact about the deploy, not a
constant. **Half-configured counts as off**, so a missing price id shows the
coming-soon notice rather than a Buy button that dies when pressed.

It also refuses a `live_` token in `sandbox` and a `test_` token in
`production`. The two are not equally bad: a live token during testing charges a
real card, and no error message gets that money back.

`paddleCheckout.ts` loads Paddle.js once and opens the overlay with
`customData: { user_id }`. It grants nothing — a completed checkout only means
the browser reached the end of the flow.

## Setup

### 1. Create the catalog

```bash
cd webapp
PADDLE_ENV=sandbox PADDLE_API_KEY=pdl_sdbx_… npx tsx ../scripts/seed-paddle-catalog.ts
```

The API key needs `product.write` and `price.write`
([sandbox](https://sandbox-vendors.paddle.com/authentication-v2) /
[live](https://vendors.paddle.com/authentication-v2)). The script prints both
the `BILLING_PRICE_MAP` line and the four `VITE_PADDLE_PRICE_*` lines ready to
paste. **Re-running creates duplicates** — Paddle has no upsert for products.

| Plan | Interval | Amount (cents) |
|---|---|---|
| Pro monthly | month | `1900` |
| Pro annual | year | `20500` |
| Max monthly | month | `4900` |
| Max annual | year | `52900` |

**Paddle amounts are in cents**, so $19 is `1900`. A factor-of-100 error here is
the classic payments bug, and it is wrong in both directions.

### 2. Configure the web app

Six variables in `webapp/.env` (or the Vercel project) — see `.env.example`:

```
VITE_PADDLE_CLIENT_TOKEN=test_…      # public by design; NOT the pdl_… API key
VITE_PADDLE_ENV=sandbox
VITE_PADDLE_PRICE_PRO_MONTHLY=pri_…
VITE_PADDLE_PRICE_PRO_ANNUAL=pri_…
VITE_PADDLE_PRICE_MAX_MONTHLY=pri_…
VITE_PADDLE_PRICE_MAX_ANNUAL=pri_…
```

Also, in the Paddle dashboard: approve the domain under **Checkout > Website
approval** (automatic in sandbox), and set a **default payment link** under
**Checkout > Checkout settings**. A missing default payment link is the usual
cause of a checkout that opens to "Something went wrong".

Turn on **Business account > Currencies > automatic currency conversion** so
buyers see their own currency. Prices are set in USD because **Paddle has no
PHP** — the peso is not among its 33 payment currencies, and a Philippine seller
transacts in USD.

### 3. Deploy the webhook

```bash
supabase functions deploy billing-webhook --no-verify-jwt

supabase secrets set \
  BILLING_PROVIDER=paddle \
  BILLING_WEBHOOK_SECRET=pdl_ntfset_… \
  BILLING_PRICE_MAP='pri_promo=pro,pri_proyr=pro,pri_maxmo=max,pri_maxyr=max'
```

`--no-verify-jwt` is required: the caller is Paddle, not a signed-in user. The
signature check authenticates it instead. `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are injected by the platform — do not set them by
hand, and never put the service-role key in the web app.

| Secret | Notes |
|---|---|
| `BILLING_PROVIDER` | `paddle` |
| `BILLING_WEBHOOK_SECRET` | the notification destination's secret key |
| `BILLING_PRICE_MAP` | `priceId=plan` pairs. **All four ids**, since annual and monthly both resolve to the same tier. Many ids mapping to one tier is expected. |
| `BILLING_MODE` | PayMongo only — ignore for Paddle |

### 4. Point Paddle at it

**Notifications > New destination**, URL
`https://<project-ref>.supabase.co/functions/v1/billing-webhook`, subscribed to:

- `subscription.created`, `subscription.updated`, `subscription.canceled`
- `transaction.completed`

### 5. The user id — the step everything depends on

The webhook cannot know who paid unless checkout carries the Supabase user id.
`openPlanCheckout` attaches `customData: { user_id }`, and Paddle copies it onto
the transaction, then onto the subscription, and onto every renewal after that —
so this one field links a Paddle subscription to an account for its whole life.

Without it the event is rejected with `no-user`: **money taken, no plan
granted.** That is why the pricing page sends signed-out visitors to sign in
before it will open a checkout.

## Testing in sandbox

[Test cards](https://developer.paddle.com/sdks/sandbox#test-cards) — any future
expiry, any CVC:

| Case | Number |
|---|---|
| Success, no 3DS | `4242 4242 4242 4242` |
| Success, with 3DS | `4000 0038 0000 0446` |
| Declined | `4000 0000 0000 0002` |

The checkout renders in a cross-domain iframe, so **no browser automation can
fill it in** — this step is done by a human, every time.

After paying, check in order: the transaction appears in the Paddle dashboard →
the Edge Function log shows `plan=pro user=… event=…` → the account's
`app_metadata.plan` changed → the user signs out and back in and the gate opens.
The session carries the old metadata until it is refreshed, which is why the
pricing page's post-payment banner says so rather than promising an instant
change.

## Still to do

**Nobody can cancel from inside the app.** Paddle's customer portal needs a
session minted with the API key, which means another Edge Function
(`billing-portal`) and a link from `/profile`. Until it exists, cancellations go
through support by email. This is the next billing phase and should not wait —
"how do I cancel" is the first question a subscriber asks.

**Displayed prices are the USD base, not the converted local amount.** Paddle
converts at checkout, so a buyer outside the US sees a different currency there
than on `/pricing`. Paddle.js `PricePreview` returns the localized figure and
would close that gap.

**Plan changes are not handled in-app** — upgrading Pro → Max means a second
checkout rather than a proration-aware subscription update.

### Confirm before going live

**One real event through the pipe.** The Paddle field paths in `fromPaddle` are
the documented ones, but send one sandbox event through and confirm
`custom_data.user_id` and `items[0].price.id` arrive where it expects. It fails
closed, so a wrong guess denies a paying customer — visible and fixable —
rather than granting a free one.

**Amounts in cents.** Every Paddle amount is an integer number of cents. Create
prices as `1900`, never `19`.

**Currency is settled.** `/pricing` is priced in USD and matches the catalog:
$19 / $49 monthly, $205 / $529 annually. A test pins each annual price to within
a tenth of a percentage point of the advertised 10% discount, and another pins
the four headline figures, so the page and the Paddle catalog cannot drift apart
unnoticed.

**Sandbox and live are separate universes.** Tokens, price ids and webhook
secrets are all environment-scoped. Going live means a new catalog, a new
notification destination, a new secret and all six `VITE_` values changed
together.

---

## Appendix — the other providers

`signature.ts` and `events.ts` still support **Stripe** and **PayMongo**, and
the tests still cover them. They are not the chosen path; this is kept so the
work is not lost if Paddle ever falls through.

The reason it might: Paddle cannot charge PHP, and **GCash is likely the
dominant payment method for Philippine engineers**. If local wallet payment
turns out to matter more than tax handling, PayMongo becomes the argument again
— it settles in pesos and supports GCash, Maya and QRPh, at the cost of owning
tax compliance ourselves.

If that route is ever taken: recurring billing is **not on by default** — email
`support@paymongo.com` to activate *Subscriptions and Card Vaulting*, and ask
about GCash recurring in the same message, since it is a separate arrangement.
PayMongo amounts are in **centavos**, and `fromPaymongo`'s field paths were
written from the documented envelope rather than a captured event, so they need
verifying against a real one before they can be trusted.

Attaching the user id differs per provider:

- **Paddle** — `customData: { user_id }`
- **Stripe** — `client_reference_id`, or subscription `metadata.user_id`
- **PayMongo** — `metadata: { user_id }` on the checkout session
