# Calculation endpoints

Vercel **Edge** functions that run the steel solvers server-side. Reached at
`/api/steel/{beam,column,connection}` from this same deployment, so there is no
CORS and no second host to keep alive.

## Why they exist

Before these, `calcApi.ts` short-circuited to a dynamic import and ran the
engine **in the visitor's browser** — the "computing…" chip implied a server
that was never there. The design code shipped in the bundle, and there was
nowhere to put an entitlement check.

## Why the SPA rewrite excludes `/api/`

`vercel.json` rewrites `/((?!api/).*)` rather than `/(.*)`. Without the
exclusion a missing function is answered with `index.html` and a **200**, so
the client tries to parse the HTML shell as a calculation result. With it, a
missing function is a clean **404**, which `calcApi` treats as "not deployed"
and degrades to computing in-browser.

## Environment

Set in the Vercel project (Settings → Environment Variables). Either spelling
works; the `VITE_`-prefixed ones already exist for the client build:

| Variable | Purpose | Missing ⇒ |
|---|---|---|
| `SUPABASE_URL` or `VITE_SUPABASE_URL` | introspecting a member's access token | `503 unconfigured` |
| `SUPABASE_ANON_KEY` or `VITE_SUPABASE_ANON_KEY` | recognising a guest's token | `503 unconfigured` |
| `GUEST_TRIAL_SALT` | salting the guest subject digest | **the trial gate is inert** |
| `GUEST_TRIAL_LIMIT` | runs per calculator (default 5) | default used |

**`GUEST_TRIAL_SALT` is not optional in practice.** Without it no subject can
be derived, so `claimRun` allows everything and every guest has an unlimited
allowance. It fails open rather than closed on purpose — see below — but it
logs on every request and tags the response `x-calc-quota: degraded; no-salt`,
so a deployment in that state is visible rather than silently generous. Use at
least 24 characters of random: `openssl rand -hex 32`. It can be the same value
as the `guest-quota` function's salt, and **must** be if you want one visitor to
have one allowance across both — the digests key the same table rows.

**No service-role key is needed or wanted here.** The endpoints reach the
`guest_trials` table only through `claim_guest_run`, a `SECURITY DEFINER`
function that `anon` may execute; the table itself stays unreachable. A
service-role key in this environment would bypass RLS for every other table
too, to buy nothing.

Missing Supabase config ⇒ `503 unconfigured`, logged loudly. Computing for
anyone because the env was forgotten is the worse failure.

## Authentication

Every call must carry a Supabase JWT — a member's access token, or the anon key
for a guest. Without one: `401`. `identify()` fails **closed**: if Supabase
cannot be reached, nobody is authenticated.

That alone is a *key* boundary, not an *entitlement* one — the anon key is
public by design, so it identifies a guest without saying which guest, or
whether they have anything left. The entitlement check below is the other half.

## The trial gate

A guest gets **five runs per calculator**, and this is where that is enforced.
Members skip it entirely (`accessFor` gives a signed-in user everything), and
the endpoint never asks the database about them.

**A run is one arrival at the page, not one computation.** The pages recompute
on a 250 ms debounce as you type, so charging per request would spend five runs
in about a second. The browser mints an opaque token per arrival and sends it as
`x-calc-run`; `claim_guest_run` counts *distinct* tokens per (subject, route),
under a row lock so two tabs cannot both be admitted on the last one.

Replaying one token indefinitely is therefore one run — the same thing leaving
a tab open has always been. What is now impossible is what used to be trivial:
clearing site data, or editing React state, to get a sixth.

Refusal is **402** with `{ error: 'trial-exhausted', route, used }`. Not 401 —
the caller *is* authenticated and a different token would not help. `calcApi`
turns it into a `TrialExhaustedError` and the page shows a sign-up prompt; it
deliberately does **not** fall back to computing in-browser, which would route
around the gate using the gate's own client.

### Tickets

The first request of a run pays a round trip to Postgres and gets back
`x-calc-ticket`: an HMAC over (subject, route, run, expiry), keyed off the
salt. Later requests of the same run present it and are verified with one hash
— no database. It is bound to the subject, so a leaked ticket is worthless to
anyone else, and it expires; when it does, the endpoint re-claims with the same
run token, which `claim_guest_run` recognises and admits **without charging**.
A long session costs one lookup per TTL, not one run.

### Why the quota fails open

`identify()` fails closed because that is authentication. The quota fails open:
an unreachable counter means the calculator still works. Refusing a free
calculator because a courtesy counter is down breaks the shop window to defend
five runs, and the caller is authenticated either way. Every such decision is
logged and reported in `x-calc-quota`.

What this does **not** claim to be: proof of identity. A different browser, a
VPN or a phone on mobile data is a new subject, and an office behind one NAT
shares an allowance per browser family. See
`supabase/functions/_shared/guestSubject.ts` for the derivation and its limits.

## Local development

`vite dev` does not serve `/api/*`, so calculations fall back to the browser —
which is why the fallback in `calcApi.ts` stays. To exercise the real endpoints
locally, run `vercel dev` instead.

The migration's behaviour is provable without Supabase — start any Postgres and
run the three files in order:

```sh
psql -v ON_ERROR_STOP=1 -f supabase/migrations/20260804000000_guest_trials.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/20260812000000_guest_run_claims.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/claim_guest_run.spec.sql
```
