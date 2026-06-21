# Project handoff / continue-from-anywhere

A working note so a fresh session (on the web, phone, or another PC) can pick up
instantly. The **repo is the source of truth** — terminal chat history does not
transfer, but everything below does.

## What this is
`civilEngineering` — a React 19 + TypeScript + Vite app (Tailwind v4, KaTeX,
react-three-fiber) of structural-design tools and material take-off estimators
to **NSCP 2015 / ACI 318-14**. Every tool computes live and prints a PDF report.
App code lives in **`webapp/`**.

## Continue from your phone / cloud (PC off)
The local terminal session needs your PC on. To keep working without it:
1. Open **claude.ai/code** (mobile browser) or the **Claude app**, same account.
2. Connect the GitHub repo **`BitLess246/civilEngineering`**.
3. Start a cloud session and say what to do (it runs in the cloud, PC stays off).
   You can also just **review/merge PRs from the GitHub app**.

## Working conventions (please keep)
- Branch off **`main`**; **one new PR per push**; **never stack** branches —
  verify the previous PR is merged before starting the next.
- Commit footer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- PR body footer: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- Verify before committing: `cd webapp && npm test && npx tsc -b`.

## Run / test
```bash
cd webapp
npm install      # first time
npm run dev      # local dev server
npm test         # vitest (run once)
npx tsc -b       # typecheck
npm run build    # typecheck + production build
```

## Current state (all merged to `main`)
Latest merged work — PRs **#178–#183** (main); **Steel Design** open PR:
- **Truss Space** (`/truss`): planar pin-jointed truss — generate (Pratt / Howe /
  Warren / pitched-roof), analyse axial forces, AISC-LRFD member design.
- **AISC section library** (`webapp/src/engine/aiscSections.ts`) — W/C/L/HSS/Pipe/
  WT, selectable per member; **double angles (2L)** back-to-back (long legs
  connected, gap = separator-plate thickness, 0 = touching). Accurate
  cross-sections drawn in 2D (`components/SectionShape.tsx`) **and extruded in 3D**
  (`lib/sectionShapes3d.ts`).
- **Zoom-to-extents on load** for both 3D pages (`components/FitView.tsx`).
- **Truss Phase 2**: member self-weight from the section + NSCP gravity
  combinations (1.4D, 1.2D+1.6L) enveloped per member (`engine/truss.ts`).
- **Truss Phase 3** (`engine/trussTakeoff.ts` + `TrussSpace.tsx`): per-member
  steel weight (A × L × 7850 kg/m³), subtotals by chord kind, gusset/connection
  plate allowance (editable %), priced Bill of Materials (₱/kg, live totals).
- **Truss Phase 4** (same PR): two more roof types — **Fink** (W-web) and
  **scissor** (raised tie) in `engine/truss.ts` (determinate for n = 4/6/8,
  tested); **free-form editor** (`components/TrussEditor.tsx`) to edit nodes /
  members / supports / loaded joints live; **custom section** input (enter A, rₓ,
  r_y directly); expanded **AISC HSS/Pipe** sizes (computed nominal geometry,
  documented) in `engine/aiscSections.ts`. PDF export already works via the
  browser-print path in `components/ReportControls.tsx`.

## Key paths
- 3D RC frame page: `webapp/src/pages/ModelSpace.tsx` (route `/model`)
- Truss page: `webapp/src/pages/TrussSpace.tsx` (route `/truss`)
- Design/analysis engines: `webapp/src/engine/` (`truss.ts`, `trussDesign.ts`,
  `pipeline.ts`, `frame3d.ts`, `aiscSections.ts`, `takeoff.ts`, `deadLoads.ts`,
  `liveLoads.ts`, …) — each with a `*.test.ts`.
- Routes + home tiles: `webapp/src/App.tsx`

- **Steel Design** (`/steel`): new page covering three AISC 360-16 LRFD tools:
  - **Beam design** (§F2 flexure with LTB zone badge, §G2.1 shear, service deflection L/360 & L/240).
  - **Column design** (§E3 axial Fcr, both KL/rx and KL/ry, §F6 weak-axis flexure, §H1-1 combined ratio).
  - **Connection design** (§J3.6 bolt shear + §J3.10 bearing for A325M/A490M; §J2.4 fillet weld
    per mm for E70–E100 electrodes). Required count / required length shown live.
  - Pure engine: `webapp/src/engine/steelDesign.ts` + 26 tests.
  - Uses the existing AISC W-shape library; section properties (Ix, Sx, Zx, J, rts) derived from geometry.

## Next up — roadmap
- Optional: bulk-import the **full official AISC v15 metric table** as data
  (CSV/JSON drop-in). Current library is a curated real-value set plus computed
  nominal HSS/Pipe sizes; a custom-section input covers anything not tabulated.
- Optional: save / load custom trusses (localStorage or file); drag nodes in 3D.
- Optional: more roof forms (Fink fan/double-Fink, gambrel), wind/uplift cases.
- Optional: custom section input on Steel Design page (enter Sx, Zx, ry directly).
- Optional: point-load + moment diagram for beams; stiffened web shear (§G2.2).

_Tests at last handoff: 290 passing; `tsc -b` clean; production build OK._
