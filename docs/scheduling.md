# Project Scheduling module — PERT / CPM & progress tracking

A Primavera/MS-Project-style planning module for the civil-engineering webapp:
Work-Breakdown-Structure, activities with FS/FF/SS/SF dependencies, Critical
Path Method, PERT probabilistic analysis, progress tracking, earned value,
resource loading, Gantt / network diagrams, and reports.

## Architecture note — this is a client-side module

The original brief specified Next.js + Prisma + PostgreSQL + API routes. **This
repository has none of those.** It is a **Vite + React 19 + TypeScript**
single-page app; every calculator is a *pure, typed engine module* under
`webapp/src/engine/` with a matching `*.test.ts`, rendered by a page under
`webapp/src/pages/`, and persisted in the browser (localStorage / file
import-export). The scheduling module follows the same architecture rather than
introducing a backend:

| Brief asked for        | Delivered here (existing stack)                          |
|------------------------|----------------------------------------------------------|
| Prisma / PostgreSQL    | JSON-serialisable `ScheduleProject`, localStorage + import/export |
| Next.js API routes     | Pure in-browser engine functions (no network round-trip) |
| Server scheduling job  | Synchronous engines (fast; can move to a worker if needed) |
| PDF / Excel export     | `jspdf` + `jspdf-autotable` / `exceljs` (already deps)    |

This keeps the module consistent with the other 30+ tools, deployable as static
files, and offline-capable — the same reasons the structural engines are pure.

## Engine layers

```
webapp/src/engine/schedule/
  model.ts        # types: Activity, Dependency, WbsNode, WorkingCalendar,
                  #        Resource, Baseline, ScheduleProject (all JSON-safe)
  calendar.ts     # working-day date arithmetic (workweek + holidays)
  cpm.ts          # Critical Path Method: topo-order, forward/backward, floats
  pert.ts         # PERT: TE/variance + normal-approx completion probability
  earnedValue.ts  # EVM: PV/EV/AC → SPI/CPI/…/TCPI + earned-schedule time SV
  progress.ts     # %-complete roll-up, status derivation, dashboard summary,
                  #        baseline variance
  *.test.ts       # hand-calc-verified vitest coverage for each engine
```

Everything the engines produce is on an **abstract working-day axis** (offset 0 =
project start). `calendar.ts` projects those offsets onto real dates, skipping
non-working weekdays and holidays. Separating the numeric solve from calendar
mapping keeps CPM exactly testable against textbook hand calculations.

## CPM algorithm (`cpm.ts`)

Activity-on-node network. For a predecessor **P** and successor **Q** with lag
**L** (working units; negative = lead), the four relations impose:

| Relation | Forward-pass lower bound        | Backward-pass upper bound        |
|----------|---------------------------------|----------------------------------|
| FS       | `ES(Q) ≥ EF(P) + L`             | `LF(P) ≤ LS(Q) − L`              |
| SS       | `ES(Q) ≥ ES(P) + L`             | `LS(P) ≤ LS(Q) − L`              |
| FF       | `EF(Q) ≥ EF(P) + L`             | `LF(P) ≤ LF(Q) − L`              |
| SF       | `EF(Q) ≥ ES(P) + L`             | `LS(P) ≤ LF(Q) − L`              |

1. **Topological order** — Kahn's algorithm; a cycle raises `ScheduleCycleError`
   (with the offending loop, from a DFS back-edge trace). `wouldCreateCycle()`
   lets the UI reject an illegal link *before* it is committed.
2. **Forward pass** (topo order) → `ES`, `EF = ES + duration`. Early start is
   floored at the project start (a lead cannot precede day 0). Project duration =
   `max EF`.
3. **Backward pass** (reverse topo order) → `LF`, `LS = LF − duration`,
   initialised to the project finish (computed `max EF`, or an imposed target).
4. **Floats** — Total `TF = LS − ES = LF − EF`; Free float from the minimum
   successor gap (early-date based, so independent of the imposed finish).
5. **Critical path** — activities with `TF ≤ ε`. An imposed finish tighter than
   the computed duration drives floats negative (an accelerated / infeasible
   target) rather than hiding the conflict.

Milestones are simply zero-duration activities (`EF = ES`).

## PERT algorithm (`pert.ts`)

Per activity, from the three-point estimate (Optimistic, Most-likely,
Pessimistic):

```
TE = (O + 4M + P) / 6          σ² = ((P − O) / 6)²          σ = (P − O) / 6
```

The network is scheduled with each `TE` as its CPM duration. Project expected
duration = the resulting critical-path length; project variance = Σσ² of the
activities on the critical path; `σ = √Σσ²`. Completion probability for a target
`T` uses the normal approximation `P[finish ≤ T] = Φ((T − TE)/σ)` with a
high-accuracy `erf` (A&S 7.1.26) and inverse `Φ⁻¹` (Acklam) so we can also
answer "what date carries 90 % confidence?" (`durationForProbability`).

## Progress & earned value (`progress.ts`, `earnedValue.ts`)

**EVM** at a data date, per PMBOK:

```
PV = Σ BACᵢ·plannedᵢ   EV = Σ BACᵢ·%compᵢ   AC = Σ ACᵢ
SV = EV − PV   CV = EV − AC   SPI = EV/PV   CPI = EV/AC
EAC = BAC/CPI   VAC = BAC − EAC   ETC = EAC − AC   TCPI = (BAC−EV)/(BAC−AC)
```

BAC/AC are unit-agnostic (currency, or duration/man-days for a cost-free
schedule view). Ratios with a zero denominator are returned as `null`
(undefined, not 0). Time-based schedule variance uses the **Earned Schedule**
method: the project-time offset where the PV curve equals the current EV, minus
the data date (>0 ⇒ ahead). `progress.ts` derives each activity's status
(completed / in-progress / delayed / not-started, honouring an explicit
`blocked`), rolls duration-weighted planned-vs-actual %, and reports SPI,
forecast duration, remaining work, and baseline start/finish/duration variance.

## Roadmap (one PR per phase)

- **Phase 1 — engine core** ✅: model, calendar, CPM, PERT + 50 tests.
- **Phase 2 — progress & earned value** *(this PR)*: %-complete roll-up, status
  derivation, PV/EV/AC → SPI/CPI/SV/CV/BAC/EAC/VAC/ETC/TCPI, earned-schedule
  time variance, baseline variance + 24 tests.
- **Phase 3 — persistence**: `ScheduleProject` store (localStorage, schema
  version), JSON import/export, sample projects.
- **Phase 4 — WBS + activity grid UI**: add/edit/delete/reorder/collapse, live
  CPM recompute, dependency editor with cycle prevention.
- **Phase 5 — Gantt chart**: baseline/actual/forecast bars, critical highlight,
  zoom (day→year), milestones, dependency arrows.
- **Phase 6 — AON network diagram**: draggable nodes, critical-path styling.
- **Phase 7 — dashboard**: progress vs plan, SPI/CPI, variance, EAC, EVM charts.
- **Phase 8 — resource loading**: labor/equipment/material, over-allocation.
- **Phase 9 — reports**: schedule / critical-path / EVM / progress / resource →
  PDF, Excel, CSV.
- **Phase 10 — daily-report integration & delay analysis** + user docs.

## Known limitations / future extensions

- CPM solves in whole working days on one project calendar; per-activity
  calendars and hour-granular durations map through `hoursPerDay` in a later
  phase. Lags are measured in working units, not calendar-spanning.
- PERT project variance is summed over the flagged critical path — exact for a
  single dominant chain, conservative when parallel critical chains exist (a
  full probabilistic path merge is a future refinement).
- Activity date/imposed constraints (SNET/FNLT/MSO) are modelled at the project
  level (imposed finish) for now; per-activity constraints come with the UI.
