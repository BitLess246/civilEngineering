# Civil Engineering Toolkit

A browser-based structural engineering workbench for Philippine practice — 3D
modelling, finite-element analysis, and code-checked reinforced-concrete and
structural-steel design to **NSCP 2015 / ACI 318-14 / AISC 360**. The whole
engine runs client-side in TypeScript; nothing is sent to a server.

The application lives in **[`webapp/`](webapp/)** (React + Vite + TypeScript).

## Features

### 3D Model Space (`/model`)
- Node/member/plate modelling with sections, supports, releases, rigid end
  zones, member offsets and rigid floor diaphragms.
- **3D frame solver** (`engine/frame3d.ts`): direct stiffness, second-order
  **P-Δ**, spring supports, thermal loads.
- **Loads**: gravity (self-weight, slab tributary, SDL/LL by occupancy),
  **seismic** static lateral force (NSCP 208), and **wind** — §207B MWFRS
  directional storey forces plus §207E.4 Components & Cladding wall pressures.
- **Dynamics**: modal analysis, time-history (Newmark), and an elastic
  response spectrum from an uploaded accelerogram overlaid on NSCP 208.
- **Nonlinear static (pushover)**: event-to-event plastic hinges with P–M
  interaction, axial/shear hinges, and second-order P-Δ.
- **Flat-shell FE** (CST membrane + DKT bending) with n×n auto-meshing and
  per-element stress/moment recovery; slab reinforcement sized from the shell
  moment field via **Wood-Armer**.

### Design pipeline
- **RC**: beams (singly/doubly reinforced), columns (P–M, tie detailing,
  SMF/IMF seismic confinement and the §418.7.3.2 strong-column/weak-beam
  check), isolated & combined footings, two-way slabs (DDM), shear walls.
- **Steel**: AISC W/WT/HSS design (§F2 flexure with per-member `Lb`, §E3 axial,
  §H1 combined), a section auto-optimizer, base plates and beam-column joints.
- **Take-off / BOQ**: costed concrete, rebar and per-shape structural-steel
  quantities.

### Truss Space (`/truss`)
Dedicated 2D/3D truss editor with member forces and a priced bill of materials.

## Tech stack

- **Frontend**: React, Vite, TypeScript, Tailwind CSS, Three.js (3D view).
- **Engine**: pure, strongly-typed calculation modules in `webapp/src/engine/`,
  each with a matching `*.test.ts` (Vitest) — calculation is kept out of the UI.
- **Deployment**: Vercel (`webapp/`).

## Run locally

```bash
cd webapp
npm install
npm run dev      # dev server
npm test         # vitest run (800+ unit tests)
npx tsc -b       # typecheck
npm run build    # typecheck + production build
```

## Design codes

- **NSCP 2015** (National Structural Code of the Philippines)
- **ACI 318-14** (reinforced concrete)
- **AISC 360** (structural steel)

Engine modules cite the governing clause numbers inline (e.g. `§F2`,
`ACI 318-14 §22.4`, `NSCP §418.7.3.2`).

## Status

The STAAD-parity roadmap (Tiers 1–3) and the Tier 4 polish/extension tier are
complete — see [`HANDOFF.md`](HANDOFF.md) for the full project state and how to
continue. Contributions follow the working rules in [`CLAUDE.md`](CLAUDE.md).
