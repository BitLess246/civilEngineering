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

## Deploying the functions

**Merging to `main` deploys them.** `.github/workflows/supabase-functions.yml`
runs on any push touching `supabase/functions/**`, and can be run by hand from
the Actions tab (**Deploy Supabase Edge Functions** → *Run workflow*) for the
case the path filter cannot see — deploying a function whose source has not
changed.

It runs the vitest suite and `tsc -b` first, then deploys every directory under
`supabase/functions/` except `_shared`. New functions are picked up
automatically.

The `supabase functions deploy …` commands quoted throughout this document are
still correct and still work from a linked CLI. They are now the manual path
rather than the only one.

**`--no-verify-jwt` is applied to `billing-webhook` and nothing else.** The flag
removes the gateway's authentication and leaves a function reachable by anyone,
which is right for a webhook that authenticates by signature and wrong for
everything else — `billing-change-plan` without it would let a stranger move
somebody else's subscription. `_shared/deploy.test.ts` reads the workflow and
fails if the list ever grows.

Note that `guest-quota` keeps JWT verification ON even though signed-out
visitors call it: a guest reaches it with the project's **publishable** key,
which satisfies the gateway. Verified against the live project — `billing-portal`
with no auth returns a bodiless gateway 401, while the same call carrying the
publishable key reaches the function and gets its own `{"error":"unauthenticated"}`
back.

**One-time setup:** a repository secret `SUPABASE_ACCESS_TOKEN` (Supabase
dashboard → account menu → Access Tokens). The project ref in the workflow is
not a secret — it is the hostname of every API call this app makes.

**Function secrets are untouched by a deploy.** `GUEST_TRIAL_SALT`, the Paddle
keys and the rest live in Supabase (Project Settings → Edge Functions → Secrets)
and survive a redeploy, so nothing has to be re-entered.

**Migrations are NOT run by this workflow**, deliberately. Applying SQL to a
live database on merge is a different risk from replacing a stateless function.

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

### Managing a subscription — `billing-portal`

The mirror image of the webhook, and the difference matters: the webhook is
called by **Paddle** and cannot verify a JWT, so its signature check is what
authenticates it. `billing-portal` is called by a **signed-in user**, so it is
deployed *with* JWT verification and checks the token again itself.

```bash
supabase functions deploy billing-portal        # note: NO --no-verify-jwt
supabase secrets set PADDLE_API_KEY=pdl_… PADDLE_ENV=sandbox
```

It mints a Paddle customer-portal session — invoices, payment method,
cancellation — and returns one URL. Two rules hold it up:

**The customer id comes from the caller's own record, never from the request.**
The function does not read the body at all. A portal URL is a key to somebody's
billing history and saved cards; if a caller could name the customer, any
signed-in user could open any other customer's portal by guessing a `ctm_…`.

**Only the URL comes back.** Paddle's response also carries the customer id, the
session id and the full deep-link table. The browser needs none of it.

Sessions are single-use and time-limited, so nothing is cached — every click
mints a new one.

The ids this depends on (`paddle_customer_id`, `paddle_subscription_id`) are
written into `app_metadata` by the webhook, and only when an event actually
carries them, so a later event cannot blank out what an earlier one
established. They are kept on a **downgrade too**: somebody who cancelled still
needs their final invoice, and taking away portal access at that moment is how
a cancellation becomes a support ticket.

`PADDLE_ENV` defaults to **production** here, the opposite of the web app's
fail-closed reading. Deliberate: guessing sandbox for a live deployment would
403 real subscribers trying to cancel, while guessing production with a sandbox
key only 403s a test account.

### Changing plan — `billing-change-plan`

Same shape as `billing-portal` — JWT-verified, ids from the caller's own record
— and it exists so a subscriber moving Pro → Max changes **the subscription
they already have** rather than opening a second checkout and paying for both
until they notice.

```bash
supabase functions deploy billing-change-plan   # NO --no-verify-jwt
```

**The browser may choose the target price and nothing else.** The id is checked
against the catalog before it goes anywhere, so a caller can only ask for a tier
we sell at the price we advertise. Which subscription is changed comes from
`app_metadata`, so there is no input that could point it at somebody else's.

**The direction decides the money**, and it is computed from Paddle's own
subscription (not our metadata, which lags and holds no billing period):

| Move | Mode | Why |
|---|---|---|
| Pro → Max, monthly → annual | `prorated_immediately` | They asked for more and expect to pay the difference now. |
| Max → Pro, annual → monthly | `prorated_next_billing_period` | Immediate proration would *refund* the unused remainder mid-period, which is not what "downgrade" means to either side. |

`on_payment_failure` stays at `prevent_change`: a declined card on an upgrade
leaves the subscription exactly where it was. `apply_change` would hand over the
higher tier against a past-due transaction — extending credit, decided by a
button on a pricing page.

**Two calls, on purpose.** The page previews (`PATCH …/preview`, changes
nothing) and shows Paddle's own figure, then commits the identical body. What a
switch costs depends on where the customer is in their period, any credit
balance and their tax — quoting a number we worked out ourselves is how an
upgrade becomes a chargeback. When Paddle's response carries no figure the
screen says Paddle will confirm the amount rather than inventing one.

It grants nothing: the tier still arrives through `billing-webhook` on the
resulting `subscription.updated`.

**`BILLING_PRICE_MAP` gains an optional period suffix** for this —
`pri_x=pro:monthly` — so one variable stays the single list of prices. The
webhook ignores the suffix (a test pins that), and a price with no period still
maps to its tier; it just cannot be ranked for a term switch, which then lands
on the side that charges nothing today.

### CORS — why none of the three worked at first

`supabase-js` sends `authorization` and `content-type`, which makes the request
non-simple, so **the browser sends an OPTIONS preflight first**. All three
user-facing functions answered it with `405 method-not-allowed` and no
`Access-Control-Allow-Origin`, so the browser never sent the real request:
`functions.invoke` threw a network error and the page showed its generic
failure. Nothing in the logs, nothing wrong with the auth, nothing wrong with
Paddle — the call never left the tab.

`_shared/cors.ts` answers the preflight with 204 **before the method check**,
and every response carries the headers, failures included; an error the browser
cannot read is an error the page cannot explain. `billing-webhook` is
deliberately untouched: its caller is Paddle's server, which sends no Origin.

The wildcard origin is safe **only** because these endpoints carry no cookies —
they require a bearer token that only the signed-in tab holds. If any of them
ever accepts cookie auth, that decision has to change in the same commit.

### Showing what was charged — `billing-history`

```bash
supabase functions deploy billing-history       # NO --no-verify-jwt
```

Read-only, and the fourth function with the same shape. **The only input is a
cursor** — a `txn_…` id for the next page. Nothing else can be asked for: not
the customer, not the filter, not the page size.

**The `customer_id` filter is the security guarantee, not a convenience.** A
`GET /transactions` without one returns every transaction in the account, so
`historyQuery` refuses to build a query string without a customer id, and that
id is looked up from the caller's own record. There is no path through the
module that produces an unscoped request.

`draft` and `ready` are excluded — in-flight internal states, and a `draft` on
screen reads as a charge that never happened. `past_due` is deliberately
INCLUDED and is the only status phrased as an instruction ("Payment failed —
update your card"): it is the one row a customer can act on.

Unlike `PricePreview`, a transaction carries **no pre-formatted total** — only
the integer and a currency code — so amounts go through the same lowest-unit
conversion the pricing page uses. `grand_total` wins over `total` because it is
net of any credit balance, and a history that disagrees with a bank statement is
worse than none. A row whose amount does not parse is dropped rather than shown
as zero.

The panel renders **nothing** when there is no history, and it is deliberately
less than the portal: no downloads, no card changes, no cancellation. Those need
a portal session, and a summary somebody glances at should not mint one.

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

### Quoting a price — `localizedPrices.ts` / `useLocalizedPrices.ts`

`/pricing` asks Paddle.js `PricePreview` what this visitor will be charged, in
one request covering all four price ids, and renders that instead of the USD
base. No country is sent: Paddle infers it from the request IP, the same way the
overlay does, so the page and the checkout cannot disagree. A country selector
was deliberately not built — it lets a visitor shop for the cheapest market and
then meet their own country's price at checkout, which is the mismatch this
closes.

**What is quoted and what is derived.** `formattedTotals.total` is passed
through untouched — it is the amount charged, so nothing reformats it. The
per-month figure (annual ÷ 12) and the annual saving are ours, computed from the
raw integer totals of the two prices Paddle just quoted, never from the USD
base; the percentage comes from the same pair, so it cannot drift from the
amount beside it if regional overrides are ever added.

**Amounts arrive in the currency's lowest unit**, and `1900` is $19.00 but also
¥1,900 — the yen has no minor unit. The divisor comes from `Intl` rather than a
hand-kept list, so JPY/KRW/CLP (0 decimals) and the three-decimal dinars are all
right without this code knowing they exist.

It fails quiet, not closed: a blocked Paddle.js, an offline visitor or a deploy
with no token leaves an empty table and the page renders the USD base, which is
a true statement about the price rather than a spinner where a number should be.

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

**That setting also decides what `/pricing` shows.** With conversion off, a
`PricePreview` for any country comes back in USD and the page quotes dollars —
correct, just not localized. It is the one thing standing between the code and a
buyer seeing their own currency before they click, and it is switched in the
dashboard, not in this repo.

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
| `BILLING_PRICE_MAP` | `priceId=plan` pairs. **All four ids**, since annual and monthly both resolve to the same tier. Many ids mapping to one tier is expected. Add the period — `pri_x=pro:monthly` — so `billing-change-plan` can tell an upgrade from a downgrade; the webhook ignores the suffix. |
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

## Verified end to end, 13 August 2026

The first real sandbox checkout ran on that date, and everything downstream of
it was exercised for the first time:

| Step | Evidence |
|---|---|
| Checkout | Pro annual, `$205.00` inc. `$21.96` VAT, Test Mode, email pre-filled |
| Webhook → `app_metadata` | `plan=pro`, plus `paddle_customer_id`, `paddle_subscription_id`, `billing_event_id` |
| The gate | PRO badge, "Your current plan" on the Pro card |
| `billing-history` | `Aug 13, 2026 · Paid · $205.00` |
| `billing-change-plan` | Preview: "charged $323.99 today, then $529.00 from August 13, 2027" — $529 − $205 prorated to the day, so the direction and the mode are right. Not committed. |
| `billing-portal` | Opens `sandbox-customer-portal.paddle.com/subscriptions/sub_…` |

**Two things had to be fixed to get there.** A missing **default payment link**
in Checkout settings made the overlay open on "Something went wrong" — exactly
as this document warned. And every user-facing function answered the CORS
preflight with 405 (see below), so none of them could be called from a browser
at all.

## Still to do

**Automatic currency conversion is off in the sandbox account**, so the
localized pricing above currently resolves to USD for every country. Verified by
forcing `currencyCode: 'JPY'` on the preview, which rendered ¥2,722/month and
¥32,666 billed yearly with no decimal places — the code path works; the
dashboard switch has not been flipped.

**The profile page quotes the tier's monthly list price** (`Pro · $19/month`)
even for an annual subscriber paying $205 a year. It reads the plan table, not
the subscription, so it is a label rather than a statement about this account's
billing — worth reconciling with the real subscription now that one exists.

---

## Going live — the cutover

**Sandbox and live are separate universes.** Client tokens, API keys, price ids
and webhook secrets are all environment-scoped, and none of the sandbox values
mean anything in production. Going live is not a switch; it is building the
whole thing a second time and swapping the app onto it.

Nothing in the code changes. Everything below is configuration.

### Before you start — the gates

| Gate | Who | Notes |
|---|---|---|
| **Paddle seller verification** | Paddle | A live account cannot take payment until the business, identity, payout bank account and website are approved. Days, not minutes, and the usual long pole. |
| Live API key | You | `pdl_live_…` with `product.write` + `price.write` for the seed, and `subscription.read/write` + `transaction.read` for the three user-facing functions. |
| Live client token | You | `live_…`. Public by design; it ships in the bundle. |
| Vercel environment access | You | Production currently has **no** `VITE_PADDLE_*` variables at all, which is why the deployed site shows the coming-soon notice. |

### The ordering rule

**The server side goes first, always. The front end goes last.**

The dangerous state is a front end offering live prices while the webhook still
maps sandbox ids: every payment then rejects as `unknown-price`, which is
**money taken and no plan granted** — the one failure this system is otherwise
built to avoid. Doing it in the order below means the worst case mid-cutover is
a checkout that will not open, which costs a sale rather than a customer.

`paddleConfig` backs this up: it refuses a `test_` token with
`VITE_PADDLE_ENV=production`, so a half-swapped front end shows the coming-soon
notice instead of charging a real card against the wrong environment.

### The checklist

**1. Create the live catalog.**

```bash
cd webapp
PADDLE_ENV=production PADDLE_API_KEY=pdl_live_… npx tsx ../scripts/seed-paddle-catalog.ts
```

Amounts are integers in cents — `1900`, never `19`. Re-running creates
duplicates; Paddle has no upsert for products. Keep the printed output: it
carries both the `BILLING_PRICE_MAP` line and the four `VITE_PADDLE_PRICE_*`
lines.

Seed the same figures the page advertises: $19 / $49 monthly, $205 / $529
annually. Tests pin the four headline prices and hold each annual price within a
tenth of a percentage point of the advertised 10% discount, so `plans.ts` and
the catalog cannot drift apart unnoticed — if the live prices differ, change
`plans.ts` in the same PR or the suite will say so.

**2. Point the functions at production.**

```bash
supabase secrets set --project-ref <ref> \
  PADDLE_ENV=production \
  PADDLE_API_KEY=pdl_live_… \
  BILLING_PRICE_MAP='<live pri_…>=pro:monthly,<live pri_…>=pro:annual,<live pri_…>=max:monthly,<live pri_…>=max:annual'
```

`PADDLE_ENV` defaults to production in `portal.ts` if unset, but set it
explicitly — the default exists to fail safe, not to be relied on.

**3. New notification destination**, in the **live** dashboard: same URL
(`https://<ref>.supabase.co/functions/v1/billing-webhook`), same four events
(`subscription.created/updated/canceled`, `transaction.completed`), then

```bash
supabase secrets set --project-ref <ref> BILLING_WEBHOOK_SECRET=<live pdl_ntfset_…>
```

The functions read secrets at runtime, so no redeploy is needed for 2 or 3 —
**unless** the shared code changed, in which case redeploy before touching the
secret (see the note under step 5).

**4. Live checkout settings.** Both bit us in sandbox and neither is inherited:

- **Checkout → Checkout settings → default payment link.** Missing is what
  makes the overlay open on "Something went wrong".
- **Checkout → Website approval.** Sandbox auto-approves; production does not.
  Approve the real domain.
- **Business account → Currencies → automatic currency conversion**, if buyers
  should see their own currency rather than the USD base.

**5. Only now, the front end.** Six variables in the Vercel project
(Production scope), then redeploy:

```
VITE_PADDLE_CLIENT_TOKEN=live_…
VITE_PADDLE_ENV=production
VITE_PADDLE_PRICE_PRO_MONTHLY=pri_…
VITE_PADDLE_PRICE_PRO_ANNUAL=pri_…
VITE_PADDLE_PRICE_MAX_MONTHLY=pri_…
VITE_PADDLE_PRICE_MAX_ANNUAL=pri_…
```

They are compiled into the bundle by Vite, so a redeploy is the only way they
take effect. All six or none: half-configured counts as off.

> **If `_shared/` code changed since the last deploy, redeploy the functions
> before step 2, not after.** Setting a secret in a format the deployed parser
> does not understand breaks the live path immediately — that is precisely how
> the `:period` suffix nearly took the webhook down on 13 August 2026.

### Verifying, with real money

**Production has no test cards.** Verification is one real payment on a real
card, then a refund from the dashboard. Do it in this order, and stop at the
first thing that does not match:

1. `/pricing` opens a checkout showing the live price and Test Mode **absent**.
2. Pay. The transaction appears in the live dashboard.
3. The Edge Function log shows `plan=pro user=… event=…`.
4. `app_metadata.plan` is `pro`, with `paddle_customer_id` and
   `paddle_subscription_id` beside it.
5. Sign out and back in — the gate opens. (The session carries the old
   metadata until it is refreshed; this is expected, and the post-payment
   banner says so.)
6. The profile page lists the payment; the portal opens; a switch preview
   quotes a sane proration.
7. Refund the transaction. Confirm the account drops to `free` after the
   cancellation event.

### Two things that will look like bugs and are not

**Accounts carry sandbox ids.** Any account that bought during sandbox testing
has a sandbox `ctm_…`/`sub_…` in `app_metadata`. Against a live API key those
do not resolve, so the portal, history and switch buttons error **for those
accounts only**. Clear the fields, or let the account buy again for real. It is
easy to mistake for a broken deployment on cutover day.

**Prices read in USD everywhere** until automatic currency conversion is on
(step 4). The page and the checkout agree, so nothing is wrong — it is simply
not the localized experience the code supports.

### Rolling back

Reverse order: clear the six Vercel variables and redeploy. `CHECKOUT_ENABLED`
goes false, the pricing page returns to the coming-soon notice, and no card
details are collected anywhere. The functions can keep their live secrets
meanwhile — with nothing opening checkouts, they have nothing to do. Anyone who
already paid keeps their plan, because the plan lives in `app_metadata` and
nothing above touches it.

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
