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

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` or `VITE_SUPABASE_URL` | introspecting a member's access token |
| `SUPABASE_ANON_KEY` or `VITE_SUPABASE_ANON_KEY` | recognising a guest's token |

**No service-role key is needed or wanted here.** These endpoints read no
tables. If a later change makes them write one, that key belongs in the
function's env and nowhere else — never in a `VITE_` variable, which is inlined
into the browser bundle.

Missing config ⇒ `503 unconfigured`, logged loudly. Computing for anyone
because the env was forgotten is the worse failure.

## What the auth check is, and is not

Every call must carry a Supabase JWT — a member's access token, or the anon key
for a guest. Without one: `401`.

It is a **key** boundary, not an **entitlement** boundary. The anon key is
public by design. What it buys: the engine no longer has to reach the browser,
calls are attributable and rate-limitable at the edge, and there is somewhere
to put a real check. The trial allowance is still decided client-side by
`TrialGate` against the server-backed count from the `guest-quota` Supabase
function. Moving that decision in here is the next step.

## Local development

`vite dev` does not serve `/api/*`, so calculations fall back to the browser —
which is why the fallback in `calcApi.ts` stays. To exercise the real endpoints
locally, run `vercel dev` instead.
