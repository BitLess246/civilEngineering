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
  validate.ts     # project integrity checks (refs, cycles, durations, percents)
  baseline.ts     # capture the CPM schedule as dated snapshots + date variance
  store.ts        # persistence: swappable backend, save/load/list + JSON I/O
  sample.ts       # worked RC-building fixture (UI seed + end-to-end test)
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

## Persistence (`validate.ts`, `store.ts`, `baseline.ts`, `sample.ts`)

`validateProject` returns a flat list of integrity issues (errors block, warnings
advise): duplicate ids, unresolved predecessor / calendar / WBS / resource
references, dependency cycles, WBS-parent cycles, negative durations, milestone-
with-duration, out-of-range percents. `store.ts` persists projects one key each
(`schedule:project:<id>`) over a **swappable `StorageBackend`** — browser
localStorage in the app, an in-memory backend in tests — wrapped with
`SCHEDULE_SCHEMA_VERSION` so old saves migrate on read. `exportProjectJSON` /
`importProjectJSON` round-trip a project (import validates and rejects corrupt or
inconsistent data). `baseline.ts` captures the live CPM schedule as dated
snapshots and reports per-activity start/finish/duration variance. `sample.ts` is
a worked RC-building schedule used as the UI seed and an end-to-end fixture.

## UI (separate routes, store-shared project)

The scheduling views are **separate routes** (`/schedule`, later
`/schedule/gantt`, `/schedule/network`, …), each in the sidebar under a
"Planning" group. They share the active project through the localStorage store,
not React context — `useScheduleProject` (`lib/`) loads the active project (an
id under `schedule:active`), auto-saves every edit, and exposes new/sample/
open/import/export; `useScheduleSolve` memoises validate → CPM → calendar-date
projection, guarding cycles so a half-built project never throws. Pages follow
the drawing-sheet design system (`components/calc.tsx`, AppShell). The Phase-4
`/schedule` page is the WBS-grouped activity grid: inline edit, add/delete,
row reorder + WBS collapse, a cycle-prevented dependency editor, live CPM
columns (dates + total float + critical tag) and an expandable ES/EF/LS/LF/float
+ PERT panel per row.

## Roadmap (one PR per phase)

- **Phase 1 — engine core** ✅: model, calendar, CPM, PERT + 50 tests.
- **Phase 2 — progress & earned value** ✅: %-complete roll-up, status
  derivation, PV/EV/AC → SPI/CPI/SV/CV/BAC/EAC/VAC/ETC/TCPI, earned-schedule
  time variance, baseline variance + 24 tests.
- **Phase 3 — persistence** ✅: project integrity validation, a
  schema-versioned `ScheduleProject` store over a swappable backend
  (localStorage / in-memory), JSON import/export, baseline capture + date
  variance, and a worked RC-building sample fixture + 25 tests.
- **Phase 4 — WBS + activity grid UI** ✅: the `/schedule` page +
  `useScheduleProject` / `useScheduleSolve` hooks — add/edit/delete/reorder,
  WBS-group collapse, live CPM recompute, cycle-prevented dependency editor,
  project new/sample/import/export. Drag-and-drop reorder is a later polish
  (up/down buttons ship now).
- **Phase 5 — Gantt chart** ✅: `/schedule/gantt` + pure timeline
  geometry in `lib/gantt.ts` (zoom day→year, date→pixel, ticks, bar widths;
  tested). Status-coloured bars with a %-complete fill, critical highlight,
  milestone diamonds, optional baseline underlay, dependency connectors and a
  data-date line. Arrow routing is a simple elbow (polish later).
- **Phase 6 — AON network diagram** ✅: `/schedule/network` + pure
  layered-DAG layout in `lib/network.ts` (longest-path columns, rows, critical
  edges — an edge is critical only when both endpoints are critical **and** the
  link is binding; tested). SVG nodes carry ES/EF and total float, the critical
  path is brick red, dependency links are bezier arrows, and nodes are
  **draggable** (view-only — moving a node never touches the schedule).
- **Phase 7 — dashboard** ✅: `/schedule/dashboard` composes the engine
  `projectProgress` + `earnedValue` at a user-chosen data date — KPIs (actual vs
  planned %, schedule variance, SPI, days ahead/behind, forecast finish date),
  a status breakdown, a planned-vs-actual **S-curve** (pure `lib/progressCurve.ts`,
  tested), **cost EVM** (BAC from resource rates + an actual-cost input →
  PV/EV/AC/SV/CV/CPI/EAC/VAC/ETC/TCPI), and critical/delayed/upcoming lists.
  Date↔offset conversions live in the tested `lib/scheduleDates.ts` (inclusive
  data-date offset + forecast finish, consistent with `finishDate`).
- **Phase 8 — resource loading** ✅: `/schedule/resources` — per-resource
  daily load (assignment quantity spread over the activity's scheduled span) with
  a load histogram and **over-allocation** flagged where daily demand exceeds
  `availablePerDay`; pure tested `lib/resourceLoad.ts`.
- **Phase 9 — reports** ✅: `/schedule/reports` — pure
  `lib/scheduleReport.ts` builds a sectioned payload (schedule, critical path,
  progress + value, resource loading) which the exporters render uniformly:
  `lib/scheduleCsv.ts` (inline), `lib/schedulePdf.ts` (jsPDF + autotable) and
  `lib/scheduleExcel.ts` (ExcelJS, one sheet per section), the last two
  lazy-loaded. Each exporter splits a node-testable `build*` from the browser
  download wrapper, so PDF/Excel generation is unit-tested (real bytes). The
  project cost-EVM roll-up is shared with the dashboard via `earnedValue.projectEvm`.
- **Phase 10 — daily-report integration & delay analysis** *(this PR)*:
  `/schedule/daily` — capture/restore baselines, a per-activity daily-progress
  log (% complete, actual start/finish, remarks) that updates the schedule's
  actuals and recomputes live, and **delay analysis** (pure tested
  `lib/delayAnalysis.ts`): per-activity finish slip vs the baseline, **critical
  delays** flagged when a slipped activity is on the critical path, and a
  project-slip summary.

## Known limitations / future extensions

- CPM solves in whole working days on one project calendar; per-activity
  calendars and hour-granular durations map through `hoursPerDay` in a later
  phase. Lags are measured in working units, not calendar-spanning.
- PERT project variance is summed over the flagged critical path — exact for a
  single dominant chain, conservative when parallel critical chains exist (a
  full probabilistic path merge is a future refinement).
- Activity date/imposed constraints (SNET/FNLT/MSO) are modelled at the project
  level (imposed finish) for now; per-activity constraints come with the UI.
- **Delay analysis** flags *critical* delays (slip on the critical path) but does
  not yet classify delays by cause (weather / owner / contractor — no cause field
  on the model), nor export a dedicated delay report (delays are screen-only);
  the schedule reflects the current plan vs baseline, and recorded actuals drive
  progress/EVM rather than re-scheduling successors. Daily-report **photo
  attachments** are deferred (no file storage in this client-side app). Resource
  **levelling** (auto re-sequencing) and baseline **rename/delete/compare** UI
  are future work — over-allocation detection and capture/select ship today.
