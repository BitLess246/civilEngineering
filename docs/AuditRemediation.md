# Audit remediation plan — August 2026

Twenty findings from three independent read-only audits (engine correctness,
security/authorization, application reliability). Every finding was re-verified
against source before being recorded. This file is the working plan: tick items
off here as they ship, and keep the evidence line so the next person can see
what "done" was measured against.

**Evidence vocabulary.** *Reproduced* = the failure was observed running.
*Computed* = numbers evaluated against the shipped modules. *Traced* = the
mechanism was established by reading, not observed.

---

## Status board

| ID | Finding | Sev | Evidence | State |
|----|---------|-----|----------|-------|
| E1 | Steel column §H1-1 collapses biaxial bending to one strong-axis term | critical | computed | ✅ #577 |
| E2 | Steel column K hardcoded 1.0 with a first-order analysis | critical | computed | ✅ #577 |
| R1 | One malformed entry bricks all seven planning routes | critical | reproduced | ✅ #579 |
| R2 | No error boundary anywhere | critical | mechanical | ✅ #579 |
| R3 | Two tabs silently overwrite each other's schedule | critical | traced | ☐ |
| S1 | Plan project-limit bypassed by one bulk INSERT | high | reproduced | ✅ #580 |
| E3 | RC column P–M ignores biaxial interaction | high | computed | ✅ #578 |
| R5 | `/truss` is a gated feature with no gate | high | reproduced | ✅ #581 |
| R4 | Full storage silently refuses the save and reverts the edit | high | traced | ☐ |
| S2 | Guest subject derived from a caller-chosen header | medium | reproduced | ✅ #587 |
| S3 | `claim_guest_run` takes its own caps from the caller | medium | reproduced | ✅ #587 |
| S4 | Stale webhook retry can restore a cancelled plan | medium | read | ☐ |
| R6 | Every Model Space solver failure is invisible | medium | verified | ☐ |
| R8 | Calculation fetch has no timeout | medium | read | ☐ |
| R7 | Unknown URLs render an empty shell; `/about` missing | medium | verified | ☐ |
| E4 | ValidationMap row C003 is an algebraic tautology | medium | verified | ☐ |
| S5 | No rate limiting; members never metered | low-med | verified | ☐ |
| R9 | `update()` is not a functional update | low | latent | ☐ |
| S6 | `guest-quota` CORS lets any site burn a visitor's trial | low | read | ☐ |
| E5 | `Cv1` uses the superseded AISC 360-10 form (conservative) | low | read | ☐ |

**Found while deploying, not in the audit — R10, the double-charged arrival.**
✅ SHIPPED (#588). `guest-quota` called `consume_guest_trial` while the
calculation endpoint called `claim_guest_run`, and both key the same
`(subject, route)` row by design. One arrival at any of the three API-served
calculators (`calcRoutes.ts`) therefore cost TWO runs of five. Latent only
because `guest-quota` has never been deployed. Both halves now go through
`claim_guest_run` with the same run token, so the second claim is admitted
free. Two concurrency bugs on the insert path came with it — see Phase 5.

Informational, no ticket: `supabase/.temp/linked-project.json` is committed (not
a secret); `modelSpaceSession` can pair a new model with old inputs if the
second `setItem` hits quota; the stale `/bolted-connection` redirect comment at
`trialQuota.ts:64`.

---

## The finding behind the findings

E1, E2 and E3 are **one structural defect appearing three times**: the L7
standalone engines are correct and well-tested, and the L6 pipeline that
consumes them drops information on the way in.

| Function | State | Reached by the pipeline? |
|---|---|---|
| `weakAxisFlexure` | correct, tested | No — standalone page only (`calcLocal.ts:54`) |
| `breslerReciprocal` | correct, tested | **No non-test caller at all** |
| `columnKFactors` | correct, tested | No — display only (`ModelSpace.tsx:1899`) |

`F3MemberResult` carries full per-axis `My[]`/`Mz[]` arrays, but the pipeline
reads only the scalar `Mmax = max(|My|,|Mz|)` (`frame3d.ts:817`) — a **display**
summary used as a **design** input.

**This is why 4067 tests stayed green.** Every function passes its own isolated
unit test; nothing tests the composition. Phase 2 below exists to close that
class of gap permanently, and matters more than any single fix in this file.

---

## Phase 1 — the two unconservative steel defects (E1, E2) — ✅ SHIPPED (#577)

Landed as described below. Verified numbers reproduced the audit's predictions
exactly: W310x52 0.645 → **1.692**, W250x49.1 0.606 → **1.336**, W200x46.1
0.803 → **1.505**; φPn 960 → **510 kN** at K_sway = 1.57 (1.88×). 4078 tests
green, no existing test broke — which is itself the finding: nothing was pinning
the old steel-column numbers.

**Follow-up left open:** the new `Muy`, `phiMny`, `Kx`, `Ky` and `braced` fields
are on `SteelColumnScheduleRow` but not yet rendered in the Model Space schedule
or the PDF report. A capacity that depends on a bracing assumption should print
the assumption.

### Original plan


Both live in `designSteelColumnRow` (`webapp/src/engine/pipeline.ts:367-390`).
Both are fixed by passing values that already exist and already pass their
tests. **No new engineering.**

### E1 — biaxial §H1-1

Today: `Mu = mr.Mmax` compared against strong-axis `phiMn`, with `Muy` left at
its `0` default. `Mmax` is the larger of two *orthogonal* moments, so the
smaller is discarded — and when the weak-axis moment is the larger it is
divided by strong-axis capacity (φMnx/φMny ≈ 2–4 for a W-shape).

Fix: take separate per-axis envelopes and pass both terms. Per
`modelBridge.ts:116` — *"Iz (strong axis) is the section's Ix; Iy is the weak
axis"* — the mapping is `Mz` → strong, `My` → weak.

```ts
const Mz = Math.max(...mr.Mz.map(Math.abs))          // strong axis
const My = Math.max(...mr.My.map(Math.abs))          // weak axis
const weak = weakAxisFlexure(shape, props, Fy)        // §F6, already written
const comb = combinedLoading(Pu, axial.phiPn, Mz, phiMnx, My, weak.phiMny)
```

`combinedLoading` already accepts `(… Muy = 0, phiMny = Infinity)`, so the
signature needs no change.

Evidence to reproduce after the fix — Pu = 300 kN, Mweak = 60, Mstrong = 20,
Fy = 248, L = 3.5 m:

| Shape | today | correct §H1-1 |
|---|---|---|
| W310x52 | 0.645 → PASS | **1.692 → FAIL** |
| W250x49.1 | 0.606 → PASS | **1.336 → FAIL** |
| W200x46.1 | 0.803 → PASS | **1.505 → FAIL** |

Also check `designSteelBeamRow` (`pipeline.ts:340`) for the same `Mmax`
collapse — lower risk under gravity, same defect in kind.

### E2 — effective length

Today: `columnAxial(shape, Fy, mr.L, 1.0, 1.0)`. AISC 360-16 allows K = 1.0
only under the Direct Analysis Method, which needs a second-order analysis,
notional loads `Ni = 0.002αYi` (§C2.2b) and reduced stiffness `0.8τb EI`
(§C2.3). None are present: `pDelta` defaults to `false`
(`ModelSpace.tsx:1038`), there is no notional-load implementation anywhere, and
no τb on the steel path.

Fix: thread the already-computed `columnKFactors(model)` into the pipeline.

**Default to the sway K.** The app cannot verify that a frame is braced, and
DAM is not implemented, so sway is the honest default; a `bracedFrame` option
lets a user who knows better opt into the braced value. Sway is also the
conservative direction, which is the right way to be wrong in a design tool.

Report the K actually used on `SteelColumnScheduleRow` so it prints on the
schedule — a capacity that depends on an assumption must show the assumption.

| Shape | GA, GB | φPn at K=1 | φPn at K_sway | overstated |
|---|---|---|---|---|
| W310x52 | 1, 3 | 960 kN | 511 kN | 1.88× |
| W310x52 | 3, 3 | 960 kN | 370 kN | 2.60× |
| W360x79 | 1, 10 | 1386 kN | 466 kN | 2.97× |

---

## Phase 2 — composition tests — ✅ partly shipped (#577)

`pipelineComposition.test.ts` landed with Phase 1 and covers the steel column:
biaxial raises the ratio, a weak-axis moment costs more than the same strong-axis
one, sway is weaker than braced, K maps to the axis it restrains, and a source
guard asserts the row never reads `mr.Mmax`. **Still to do:** the same treatment
for the RC column (Phase 3) and the beam row.

The highest-value work in this file. Every function involved in E1/E2/E3 passes
its own unit test; the defect is in how the pipeline wires them together, and
nothing tests that.

- A column carrying equal Mx and Mz **must** report strictly higher utilisation
  than the same column carrying Mx alone. (Catches E1 and E3.)
- A sway column **must** report lower φPn than the same column braced.
  (Catches E2.)
- Every design row's inputs must trace to a per-axis envelope, never to
  `Mmax` — a guard test that greps the pipeline source for `\.Mmax` in a design
  path, in the style `featureGate.ts:26-30` already uses to keep the
  solver-kind table honest.

---

## Phase 3 — E3, RC column biaxial — ✅ SHIPPED (#578)

`pmCapacityBiaxial` replaces the single-eccentricity check. Bresler's reciprocal
load above 0.1 f′c Ag, a linear (α = 1) load contour below it where the
reciprocal form turns unconservative. `breslerReciprocal` finally has a caller.

Verified — reproduces the audit's predictions exactly:

| Pu | Mx | Mz | before | after | method |
|---|---|---|---|---|---|
| 1500 | 180 | 120 | 0.504 | **0.638** | bresler |
| 1200 | 150 | 150 | 0.413 | **0.603** | bresler |
| 2000 | 120 | 90 | 0.499 | **0.591** | bresler |

**One judgement call worth knowing.** `Pny` needs the section on its side, so
`b` and `h` swap — but the bar LAYOUT does not swap with them. A `two-face`
cage has its bars on the faces perpendicular to `h`; bending about the other
axis sees those bars spread ALONG the depth rather than concentrated at its
extremes. Re-using `two-face` on the swapped section would put them at the
extremes, giving a longer lever arm and overstating `Pny` — unconservative. The
weak-axis evaluation therefore always uses the `all-around` distribution, which
is both the closer physical model and the conservative one.

Follow-up: `Muy` and `biaxialMethod` are on `ColumnScheduleRow` but not yet
rendered in the schedule or PDF report — same gap as Phase 1.

### Original plan


`pipeline.ts:660` repeats the `Mmax` collapse, then evaluates capacity at the
single eccentricity `e = Mu/Pu`. `pmAt` is strictly uniaxial — the compression
block runs across `b` and every lever arm is `(h/2 − d)` — so a governing
moment about the `b` axis is checked against the deeper `h` section.

Fix: per-axis envelopes, then `breslerReciprocal(Pnx, Pny, Po)` for
`Pu ≥ 0.1 f′c Ag`, falling back to the load-contour method below that (Bresler
is unreliable there). The `b`↔`h` swap must be applied when evaluating `Pny`.

500×500 tied, f′c 28, 12⌀25, Pu = 1200, Mx = Mz = 150: today 0.413, correct
0.603 — capacity overstated **1.46×**.

This matters specifically because the layer above is *correct*: orthogonal
effects 100%+30% (NSCP §208.8.1) ship via `buildECases`, so the solver
deliberately produces simultaneous Mx and Mz and the design layer throws one
away.

---

## Phase 4 — data loss (R1, R2, R4, R3) — R1 + R2 ✅ SHIPPED (#579)

**R1 and R2 are done.** `isScheduleProject` is hoisted out of `extractProject`
and called in `readStored`, matching what both sibling stores have always done;
`migrate()` now actually reads `stored.version` and refuses a record from a
newer build. `ErrorBoundary` is mounted inside `AppShell`, keyed on the
location.

Proof both ways round: the seven new store tests **fail on the old code** with
exactly the audit's `TypeError: Cannot read properties of undefined (reading
'name')`, and pass after. Then reproduced end to end in a browser — planting
`{"version":1,"savedAt":"x","project":{}}` in localStorage and reloading now
leaves the app up, the sidebar present, the healthy project intact at 32 rows,
and all seven planning routes rendering.

**R3 and R4 remain** — save-conflict detection and quota surfacing. More design
than patch; see below.

### Original plan


**R1** — `engine/schedule/store.ts:79-104`. `readStored` wraps only
`JSON.parse`; the shape is never checked, and `list()` then dereferences
`stored.project.meta.name` *outside* the try. `useScheduleProject` calls
`list()`/`load()` in `useState` **initialisers**, so the throw kills the tree on
mount and the user can never reach the UI that would delete the bad entry.

Both sibling stores already have the guard — `engine/projects/store.ts:107`,
*"One corrupt entry must not take the whole listing down."* Hoist the existing
`ok` predicate from `extractProject` (`store.ts:166-173`) into
`isScheduleProject` and call it in `readStored`. Also make `migrate()` actually
read `stored.version`, which the header already claims it does.

**R2** — no `ErrorBoundary` anywhere. One class component with
`getDerivedStateFromError`, wrapping `<TrialGate>` *inside* `AppShell` so the
fallback keeps the sidebar and the user can navigate away. Key it on
`useLocation().key` so it resets on navigation.

**R4** — `useScheduleProject.ts:70` and `useProjects.ts:127` call `save()` then
`setState()`, so a `QuotaExceededError` reverts the edit silently. Make
`save()` return a verdict instead of throwing, and surface it — both callers
already have somewhere to put a message. Silently swallowing is fine for a
cache and **not** fine for the user's document.

**R3** — two tabs overwrite. `store.save` already returns `savedAt` and nothing
reads it back. Hold a watermark ref, refuse a write whose on-disk `savedAt` is
newer than the one this tab loaded, and add a `storage` listener to reload when
another tab writes the active project.

---

## Phase 5 — entitlement and gates (S1, R5, S3, S2)

**S1 — ✅ SHIPPED (#580).** `20260804010000_projects.sql:76-109`.
`project_count()` is `STABLE`, so in a multi-row INSERT it returns the same
pre-statement value for every row; PostgREST emits exactly that shape for a
JSON-array body. Reproduced: four single-row inserts stop at 3, one bulk insert
admits 100. `VOLATILE` does not help — the rows are invisible for MVCC
command-id reasons, not caching ones.

Shipped as `20260813000000_project_limit_trigger.sql`: a constraint trigger
firing `after insert`, where the new rows are visible to an ordinary count. The
RLS policy is unchanged — `auth.uid() = user_id` is the ownership boundary, and
its count survives as a fast path that refuses the ordinary single-row save
with 42501 before a row is written. The trigger is what makes the ceiling true;
the policy is what makes the common refusal cheap.

Evidence, three layers:

- `project_limit.spec.sql` — 18 assertions against a throwaway Postgres 16,
  run as a non-superuser so RLS is live. It fails on the pre-fix schema with
  exactly the reported symptom (`one bulk insert of 100 is refused — got not
  blocked`) and passes with the migration loaded. Covers the cases a
  heavy-handed fix would break: a legitimate bulk of exactly 3 is allowed, 2
  existing + a bulk of 1 is allowed, an UPDATE at 100 rows on a lapsed free
  plan still succeeds.
- `plans.limits.test.ts` — structural guards. The numeric assertions in that
  file all passed while the ceiling was bypassable, so the new block instead
  pins that the trigger fires AFTER INSERT, counts with a plain query rather
  than `project_count()`, and that the ownership half of the policy is intact.
- `supabaseRemote.test.ts` — the trigger raises `check_violation` with
  `project limit reached`, which `isLimitRefusal` now translates to
  `ProjectLimitError`. Without that, a bulk refusal reached the user as a raw
  SQLSTATE.

Left alone deliberately: `auth.uid() is null` skips the check, since only the
service role can get there (`anon` fails `auth.uid() = user_id` against NULL).
A restore or a support fix should not meet the paywall.

**R5 — ✅ SHIPPED (#581).** `/truss` and `/model` are in `GATED_PREFIXES` and
mapped to the Pro-and-up `model-space` feature in `ROUTE_FEATURE`, and neither
was wrapped in `RequireAuth`. `TrialGate` does not cover the gap and should not:
it passes `members-only` through untouched so that one component owns the
question, which means a gated route without `RequireAuth` has no gate at all.

Upgraded from *verified* to **reproduced**. Driven signed-out in a headless
browser against a dev server with auth configured:

- `/truss` rendered the 3D canvas and a results table of solved member forces
  (`825.8`, `94.7`, …). It has no in-page plan gate of any kind, so the full
  truss solver was running for an anonymous visitor.
- `/model` rendered the entire workbench — *Analyze*, *Design all*, *Export
  PDF*. The solve itself is separately refused in-page by `gate.solve`, since a
  guest plan carries `maxMembers: 0`, so the exposure there is the UI rather
  than the solver.

After the fix both redirect to `/signin`, matching `/schedule`, while
`/beam-design` (trial) and `/docs` (public) are untouched. `RequireAuth` is
mounted OUTSIDE `Suspense` so the lazy chunk is never fetched for a visitor who
is about to be redirected.

The guard test lives in `trialQuota.test.ts` and runs both directions: no gated
route may lack `RequireAuth`, and no route may carry it without being listed —
the second catches the opposite failure, where a trial route grows a gate and
the five free runs the pricing page promises become a sign-in wall. Reverting
`App.tsx` fails it with `gated routes with no RequireAuth: /model, /truss`.

**Note for whoever picks up S5:** a signed-in Free user now meets the upgrade
page on `/truss` where the page used to be open to everyone. That is the
finding, not a regression — but it is a user-visible entitlement change.

**S3, S2 — ✅ SHIPPED (#587), which unblocks `GUEST_TRIAL_SALT`.** Both were
moot while the gate was inert (documented fail-open, `quota.ts:84-91`) and both
would have gone live the moment the salt landed, so they went first.

**S3 — the RPC took its ceilings from the caller.** `20260813010000_guest_run_caps.sql`
clamps `p_limit` and `p_cap` against server-side `guest_run_limit()` /
`guest_route_cap()`: a caller may ask for *less*, never more. The arguments stay
in the signature so the deployed Edge function keeps working mid-rollout.

Verified on Postgres 16 — `guest_run_caps.spec.sql`, 25 assertions. Against the
old function it fails with `a limit of two billion still buys five runs — got 6,
want 5`; against the new one, six arrivals asking for `p_limit: 2000000000` get
exactly five. `claim_guest_run.spec.sql` still passes unchanged, which is the
point: clamping the ceilings must not change anything below them.

One correction to the original finding, worth keeping. *"Bound total row
growth"* is not something clamping `p_cap` achieves — `p_cap` is per subject,
and subjects are 64 hex characters anyone may invent, so it never bounded the
table at all. `guest_trials_full()` is the bound that does apply: a whole-table
ceiling read from `pg_class.reltuples` (an estimate, deliberately — a `count(*)`
on the insert path would be a sequential scan). It **fails open**: over the
ceiling a new subject computes but is not counted, and the endpoint reports
`degraded: table-full`. A full table is our problem, not the visitor's.

**S2 — two caller-chosen inputs reached the subject.**

- `cf-connecting-ip` and `x-real-ip` were consulted as fallbacks. Nothing in
  front of either deployment sets them, so the only way one arrives is from the
  caller: a fallback that can only ever return an attacker-chosen value. Both
  are gone; `x-vercel-forwarded-for` is now preferred over `x-forwarded-for`.
- The **User-Agent is no longer part of the digest**, taking the 36× multiplier
  with it. `uaFamily` bucketed the UA into 6 engines × 6 platforms, all 36
  reachable by editing one header — a five-run allowance was really 180, and
  the row growth was multiplied by the same factor. The accepted cost is the one
  the module header already states: an office behind one NAT now shares five
  runs rather than five per browser family.

**A claim in the original finding that did not survive checking.** S2 was
written as though `x-forwarded-for` were spoofable on Vercel. It is not — Vercel's
docs state the platform "overwrites this header and does not forward external
IPs to prevent spoofing", except on Enterprise with a trusted proxy. Preferring
`x-vercel-forwarded-for` is still the right call (it is the header a
trusted-proxy setting could never loosen), but it closes a hole that was not
open. The two that were open are the ones above.

Removing an input changes every digest, so existing `guest_trials` rows are
orphaned and swept by `prune_guest_trials`. That costs one fresh allowance per
existing guest — free right now, and not free after the salt is set, which is
why it went in this PR.

---

## Phase 6 — billing and abuse (S4, S5, S6)

**S4** — `billing-webhook/index.ts:88-92` compares only the last applied
`billing_event_id`, with no ordering check. A retried `subscription.created`
landing after a `subscription.canceled` restores the paid plan permanently.
Store `occurred_at` and refuse anything not newer; thread `occurredAt` through
`EventOutcome` from `fromPaddle`.

**S5** — no rate limiting anywhere, and members are never metered (by design),
while sign-up is self-service. Cache `identify()` by token hash (or verify the
JWT locally against JWKS) so garbage tokens are not amplified 1:1 into your own
auth endpoint, and add a per-subject/per-user token bucket in front of
`solve()`. Vercel's firewall rules are the zero-code option.

**S6** — `guest-quota` sets `access-control-allow-origin: '*'`, so a
third-party page can drive `consume` against the visitor's own subject.
Restrict `consume` to an origin allowlist, or retire it now that
`claim_guest_run` supersedes it.

---

## Phase 7 — UX dead ends (R6, R8, R7, R9)

- **R6** — eight `.catch(e => console.error(...))` in `ModelSpace.tsx` with no
  error state. One `solveErr` state, set in each catch, cleared at the top of
  each run, rendered beside the existing mesh-error strips.
- **R8** — `calcApi.ts:94` has no timeout. `AbortSignal.timeout(15_000)` turns a
  hang into the same safe degradation as a network error, no other change.
- **R7** — add `path="*"`, and either build `/about` or drop it from
  `PUBLIC_ROUTES`.
- **R9** — `update()` clones the project from this render's closure; make it
  functional before the next feature trips over it.

---

## Phase 8 — validation integrity (E4) and the unaudited remainder

**E4** — `columnDesign.test.ts:140` asserts `breslerReciprocal` against its own
algebra, so both sides evaluate the identical expression and the test's
discriminating power is exactly zero. It validates a function with no non-test
caller, and `ValidationMap.md:44` records it as biaxial coverage the codebase
does not have.

Replace with a worked example from PCA Notes on ACI 318 or McCormac/Brown Ch.
10 to ±3%, and mark the row honestly until a real cross-check exists.

**Then re-audit the rest.** One ValidationMap row was inspected and it was a
tautology validating dead code; the remaining ~180 should be treated as suspect
until individually checked, the 🔶 rows first.

### Never audited — treat as unexamined

- **L7** — all footings (isolated, combined, flexible, eccentric, pile cap),
  retaining wall, stair, water tank, slab DDM, torsion, development length,
  shear wall, wood, prestressed beam (PCI/PTI entirely unchecked).
- **L8 beyond the bearing factors** — soil nail, micropile, shotcrete facing,
  rock anchor, slope stability, settlement, lateral pile.
- **All of L5 dynamics** — modal Jacobi extraction, response spectrum SRSS/CQC
  and §208.6.4.2 scaling, both time-history paths, buckling, pushover, floor
  vibration. Frequencies were never checked against a closed form.
- **`shell.ts`** — no patch test, no plate closed form.
- Accessibility and input handling across ~50 pages.
- `remoteStore.ts` sync/conflict logic.
- Deployment config — whether `x-forwarded-for` is spoofable on this Vercel
  project (decides whether S2 is a 36× multiplier or a full bypass), email
  confirmation, JWT expiry, platform rate limits, pg_cron for pruning.

---

## Verified sound — do not re-audit

**Engine.** The L3 solvers are **exact** against closed forms, computed against
the shipped modules: cantilever δ = PL³/3EI, base moment PL, fixed-fixed FEM
wL²/12, reaction wL/2, midspan −wL⁴/384EI and wL²/24. P-Δ amplification tracks
1/(1−P/Pcr) with the residual explained by the single-element Pcr error. Unit
handling at the `modelBridge → frame3d` boundary is internally consistent — the
missing-1000 defect is **not** present, and `kLocal`'s `(phiY, phiZ)` order
matches its call site. Dozens of constants verified against the clause they
cite (ACI punching shear, Branson's Ie, the ACI 318-14 `Cm = 0.6 − 0.4(M1/M2)`
sign convention, AISC slenderness limits and §H1-1 breakpoints, Vesić factors,
NSCP §208 Cs bounds and ΔM = 0.7RΔs, Table 203-1). `Infinity` is used
deliberately as a fail-safe sentinel so a zero-capacity denominator *fails* the
check rather than leaking NaN.

**Security.** Webhook signature verification is sound — over the raw body,
rejects when the secret is unset, rejects stale *and* future timestamps. The
plan lives in `app_metadata` end to end; a browser cannot grant itself one.
`guest_trials` is genuinely unreachable (RLS with zero policies *plus* revoked
grants). All five `SECURITY DEFINER` functions pin `search_path`. The run-ticket
HMAC is domain-separated and field-unambiguous. No secret uses a `VITE_` prefix.
Cross-tenant read/write is properly closed — S1 is a quantity bypass, not a
tenancy one.

**Reliability.** `useCalcResult` has no out-of-order hazard: cleanup sets
`cancelled` and both branches check it. Worker lifecycle in `useSolver` is
clean; all eight call sites attach `.catch`. Both sibling stores validate shape
on read. Every route is classified and there are no dead links.
