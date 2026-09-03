# Civil Engineering Toolkit

A browser-based structural and geotechnical engineering workbench for Philippine
practice — 3D modelling, finite-element analysis, and code-checked design to
**NSCP 2015 / ACI 318-14 / AISC 360**, with every calculation printing a worked
solution and a PDF report.

The application lives in **[`webapp/`](webapp/)** (React 19 + Vite + TypeScript).

```bash
cd webapp
npm install
npm run dev      # dev server
npm test         # vitest run (5,345 tests across 280 files)
npx tsc -b       # typecheck
npm run build    # typecheck + production build
```

## What runs where

**The calculation engine runs in your browser.** Every solver, design check and
take-off in `webapp/src/engine/` is a pure TypeScript module — the frame and
shell FE, the RC and steel design pipeline, the geotechnical engines, the bar
detailing and the quantity roll-up all execute client-side, and a model is
analysed and designed without a round trip.

Four things do leave the browser, and it is worth being exact about them:

| what | where it goes | when |
|---|---|---|
| Sign-in, profile, plan | Supabase | Only if you have an account |
| Billing and the guest trial | Paddle + five Supabase Edge Functions | On checkout, plan change, or when a guest's trial is metered |
| Saved projects | Supabase, **on an explicit sync** | Never automatically — `save()` writes to `localStorage` immediately; moving a model between machines is a deliberate action, not a timer |
| Steel beam / column / bolted-connection capacities | Vercel Edge functions at `/api/steel/*` | On those three pages, with an in-browser fallback when the service is unreachable |

Nothing else is transmitted. The 3D Model Space pipeline — analysis, design,
detailing, drawings, take-off — never calls a server.

## 3D Model Space (`/model`)

- Node / member / plate modelling with sections, supports, releases, rigid end
  zones, member offsets, tension-only and compression-only members, and rigid
  floor diaphragms.
- **3D frame solver** (`engine/frame3d.ts`): direct stiffness, second-order
  **P-Δ**, spring supports, thermal loads, Timoshenko shear deformation, and
  ACI §6.6.3.1.1 cracked-section stiffness modifiers.
- **Loads**: gravity (self-weight, slab tributary, SDL/LL by occupancy),
  **seismic** static lateral force (NSCP 208) with accidental torsion,
  orthogonal 100%+30% effects and the vertical component, and **wind** —
  §207B MWFRS directional storey forces plus §207E.4 Components & Cladding.
- **Dynamics**: modal analysis, response spectrum (SRSS/CQC with §208.6.4.2
  scaling), modal and direct-integration time history with Rayleigh damping,
  linearised buckling, and an elastic spectrum from an uploaded accelerogram.
- **Nonlinear static (pushover)**: event-to-event plastic hinges with P–M
  interaction, axial and shear hinges, second-order P-Δ.
- **Flat-shell FE** (CST membrane + DKT bending) with n×n auto-meshing and
  per-element stress/moment recovery; slab reinforcement sized from the shell
  moment field via **Wood-Armer**.
- **Checks and diagnostics**: mesh validation, NSCP Table 208-9/208-10
  irregularity auto-flags, storey drift, and §424.2 service deflections
  integrated from each member's own moment diagram.

### Design pipeline

Strictly downstream of the analysis — it consumes member forces and never
reaches back into the solver.

- **RC**: beams (singly/doubly reinforced), columns (P–M, tie detailing,
  SMF/IMF seismic confinement and the §418.7.3.2 strong-column/weak-beam
  check), isolated, eccentric and combined footings, pile caps, two-way slabs
  (DDM), shear walls.
- **Steel**: AISC W/WT/HSS design (§F2 flexure with per-member `Lb`, §E3 axial,
  §H1 combined), a section auto-optimizer, base plates, shear tabs, moment
  connections, block shear and prying.
- **Detailing**: full bar cages in 3D — beams, columns, footings, slabs and
  stairs — placed from the same design the schedules print, lapped at stock
  bar length and staggered per §25.5.2.
- **Drawings and reports**: framing plans, per-member elevations and sections,
  bar schedules, and a printable calculation report.
- **Take-off / BOQ**: costed concrete, rebar and per-shape structural-steel
  quantities.

## The tool suite

Thirty-eight standalone calculators sit alongside the model space, each with its
own worked solution and PDF report:

- **Concrete** (11) — beam, T-beam, prestressed beam, column, slab, stair,
  lintel, water tank, torsion, development & splice, punching shear.
- **Geotechnical** (11) — retaining wall, earth pressure, bearing capacity,
  soil-nail wall (FHWA GEC-7), micropile (FHWA-NHI-05-039), rock anchor
  (PTI DC35.1), shotcrete facing, slope stability by method of slices
  (Fellenius / Bishop / Janbu), settlement, laterally loaded piles (Broms + p-y),
  soil investigation.
- **Analysis & modelling** (5) — 3D model space, frame analysis, beam analysis,
  truss space, slab load path.
- **Steel & connections** (4) — steel beam, steel column, bolted and welded
  connections.
- **Foundations** (3) — foundation design, pile cap, combined footing.
- **Seismic & loads** (2) — NSCP §208 seismic wizard, load combinations.
- **Timber** (1) and **Plumbing & sanitary** (1).

Plus **project scheduling** (`/schedule`: a CPM/PERT scheduler with activities,
dependencies, calendars, resources, baselines and earned-value reporting, which
Model Space can generate a schedule straight into), the **validation dashboard**
(`/validation`) and an in-app documentation browser (`/docs`).

## Accounts, plans and the guest trial

Sign-in, profile and per-plan project limits run on Supabase, with the limits
enforced by a database trigger rather than by the client. Billing is Paddle,
handled by five Supabase Edge Functions (`billing-webhook`, `billing-portal`,
`billing-change-plan`, `billing-history`, `guest-quota`). Visitors get a metered
free trial before signing up. See [`docs/Billing.md`](docs/Billing.md).

## Design codes

- **NSCP 2015** (National Structural Code of the Philippines)
- **ACI 318-14** (reinforced concrete)
- **AISC 360** (structural steel)
- FHWA GEC-7, FHWA-NHI-05-039, PTI DC35.1 and IS 3370 / ACI 350 for the
  specialist geotechnical and liquid-retaining tools.

Engine modules cite the governing clause inline (e.g. `§F2`,
`ACI 318-14 §22.4`, `NSCP §418.7.3.2`).

## Verification

- **5,345 unit tests** across 280 files. Engine logic is validated against hand
  calculations, closed-form solutions and textbook worked examples, not against
  itself.
- **CI gates every merge** — `tsc -b`, ESLint at `--max-warnings 0`, and the
  full test run ([`.github/workflows/static.yml`](.github/workflows/static.yml)).
- **[`docs/ValidationMap.md`](docs/ValidationMap.md)** records, per engine, what
  the evidence for it actually is — and where a cross-check is an
  equivalent-method one rather than an independent reference, it says so.
- An external **STAAD.Pro cross-check** on a 2×1-bay, 2-storey frame agrees to
  0.001% on total reaction with every input matched and nothing normalised
  (`docs/benchmarks/`). It is what found the `frame3d` My sign defect.

## Tech stack

- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS v4, react-three-fiber
  + drei (3D), KaTeX (equations), jsPDF and ExcelJS (export).
- **Engine**: pure, strongly-typed calculation modules in `webapp/src/engine/`,
  each with a matching `*.test.ts` — calculation is kept out of the UI.
- **Backend**: Supabase (auth, projects, Edge Functions) and Paddle (billing).
- **Deployment**: Vercel (`webapp/`).

## Project state

[`HANDOFF.md`](HANDOFF.md) is the running record of what has shipped and how to
continue. [`CLAUDE.md`](CLAUDE.md) carries the working rules, the engine
architecture map, and the current backlog — what is genuinely open, and what
looks open but is already built.
