# Project handoff / continue-from-anywhere

A working note so a fresh session (on the web, phone, or another PC) can pick up
instantly. The **repo is the source of truth** — terminal chat history does not
transfer, but everything below does.

## What this is
`civilEngineering` — a React 19 + TypeScript + Vite app (Tailwind v4, KaTeX,
react-three-fiber) of structural-design tools and material take-off estimators
to **NSCP 2015 / ACI 318-14**. Every tool computes live and prints a PDF report.
App code lives in **`webapp/`**.

## Project Scheduling module (Phases 1–10 — COMPLETE)
A Primavera/MS-Project-style **PERT/CPM & progress-tracking** module, built
**client-side** (pure engines + localStorage, no backend) — see
[`docs/scheduling.md`](docs/scheduling.md) for the full architecture. Routes:
`/schedule` (WBS + activity grid), `/schedule/gantt`, `/schedule/network` (AON),
`/schedule/dashboard` (progress + EVM), `/schedule/resources`, `/schedule/reports`
(PDF/Excel/CSV), `/schedule/daily` (actuals + delay analysis) — all sharing one
store-backed `ScheduleProject`.
- **Engines** (pure, tested): `webapp/src/engine/schedule/` — `model`, `calendar`,
  `cpm` (FS/FF/SS/SF + lead/lag, floats, critical path, cycle detection), `pert`,
  `earnedValue` (+ `projectEvm`), `progress`, `validate`, `baseline`, `sample`.
- **View/support** (pure, tested): `webapp/src/lib/` — `gantt`, `network`,
  `resourceLoad`, `progressCurve`, `scheduleDates`, `scheduleReport`(+`Csv`/`Pdf`/
  `Excel`), `delayAnalysis`; hooks `useScheduleProject`/`useScheduleSolve`.
- Merged in PRs #387/#389/#390/#392/#397/#398/#399/#400/#401/#410; each passed a
  two-subagent code+peer review gate. Deferred items (delay classification,
  delay-report export, photos, resource levelling, per-activity calendars/
  constraints) are listed in `docs/scheduling.md`.

## Structural plan renderer / drawing sheets (PRs #419–#422, #424–#425 — COMPLETE)
CAD-style structural **drawings generated from the 3D model + design**, emitted as
scalable **SVG** and surfaced in a **"Plans" tab** in Model Space (`/model`). Pure
engine + a thin React panel; every sheet exports to SVG.

- **Engine** (pure, tested): `webapp/src/engine/`
  - `planRenderer.ts` — `buildPlan(model, opts)` → typed `PlanPrimitive[]` in world
    metres + bounds; `planToSvg(drawing, pxWidth)` serialises (Y-down). Draws the
    **framing plan** (grid + bubbles, chained dims w/ units, framing beams with
    grouped marks FB1/FB2… + a BEAM SCHEDULE, column squares, slab panels, detail-tag
    title block) and the **foundation plan** (dashed footing pads sized from
    `design.footings`, WF-n marks + FOOTING SCHEDULE, FTB tie beams, per-pad EL
    elevation tags, COLUMN SCHEDULE). Primitive kinds: line/rect/circle/text/dim +
    **`path`** (world-space M/L/A with fill-rule, opacity, join/cap) for outlined rebar.
  - `footingDetail.ts` — `buildFootingDetail(input, opts)` → a column-footing detail
    sheet: **bar-mat PLAN + SECTION A-A**. Rebar drawn as **outline tubes** (`rod()`),
    design-driven **90° end hooks** (`endHook`, default straight) that hug the
    perpendicular bar with a guard, **stacked mat layers** (over/under at crossings via
    white-filled top bars; §13.3), column dowels + variable-spaced **lateral ties**,
    **packed-gravel** bedding, natural-grade line + soil hatch, chained depth dims,
    element-anchored leaders. ACI 318-14 §25.3/§25.4/§13.3.
  - `columnSection.ts` — `columnSectionPrimitives(P, cx, cy, side, p, colors, sw)`: an
    engine port of the report's `<ColumnSchematic>` (tied) — rounded concrete square,
    perimeter tie + interior 180° crossties, full bar ring, and a **135° corner tie
    hook drawn as two lines tangent to the corner bar**. Colour-parameterised; the
    footing sheet draws it **as the column IN the plan** (orange/white), reusing the
    all-around bar-layout math shared with `ColumnSchematic`.
- **UI**: `components/PlansPanel.tsx` (+ `lib/planDetails.ts`, pure/tested — maps a
  `StructureDesign` to `PlanFooting[]` and one `FootingDetailInput` per distinct
  footing type WF-n, recovering the footing bar Ø from the designed steel area);
  new **`plans`** right-panel tab in `pages/ModelSpace.tsx`.
- Phases → PRs: **#419** framing (P1–2), **#420** foundation (P3), **#421** footing
  detail sheet (P4), **#422** "Plans" tab + engine column section (P5).
- **Per-floor framing + slab symbols (#424 → #425)**: one **combined framing plan
  per floor**, named by floor (`GROUND/SECOND FLOOR FRAMING PLAN`, via a
  `PlanOptions.title` override; `PlansPanel` derives floor names from node
  elevations) with **solid-black columns**, **beams drawn to their real width**
  (band from section `b`), and **units on every dimension/schedule value**. Slab
  panels now carry a **span-direction symbol** (a straight line with a half-arrow
  at each end, on opposite sides — two-way = a perpendicular copy crossing as `+`,
  one-way = a single line in the short direction; two-way when long/short ≤ 2, ACI)
  + a **slab mark** (`S1…`, pooled by thickness/type into a new **SLAB SCHEDULE**)
  in the upper-left quadrant, replacing the old `h=… mm` label; grid bays with **no
  slab** get a corner-to-corner **X**. (#424 shipped the interim beam/column-split
  version; #425 reverted the split back to combined and added the slab symbols.)
  Suite **1446**.
- **Follow-ups** (not built): SVG→PDF sheet export/print layout; beam/column
  **schedule detail sheets** and a tie-bend detail; full slab **reinforcement**
  plans (bar layout, not just the span symbol); wiring the plan-renderer drawings
  into the direct PDF report (`lib/modelPdf.ts`).

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

## Current state (analysis-core baseline, PR #239)

> Newer work is tracked in the **Tier 4** (A1–E13, PRs through #273),
> **Post-Tier-4** (PRs #275–#278), **Phase 3 + connections** (PRs #279–#308),
> **Connection detailing polish** (PRs #310–#317), **Audit round**
> (PRs #319–#334) and **Section detailing + multi-leg ties + Dependabot cleanup**
> (PRs #362–#371) sections below; latest suite: **1118 tests**;
> `npm audit` **0 vulnerabilities**.
> The repo root is now just `webapp/`, `docs/` and the markdown docs.

### 3D Model Space analysis core (`/model`) — the centrepiece
The 3D space-frame solver and its NSCP design pipeline are the most developed part
of the app. Everything runs **off the main thread** in a web worker
(`engine/solverWorker.ts`) so the UI stays responsive.
- **3D frame FEM** (`engine/frame3d.ts`): 12-DOF space-frame element (axial +
  St-Venant torsion + biaxial Hermite bending), per-member local→global transform,
  consistent fixed-end vectors for nodal / UDL / trapezoid (vdl) / point loads.
  One LU factorization is shared across every NSCP combo.
- **P-Δ second-order analysis**: geometric stiffness Kg(N) re-formed and the tangent
  stiffness re-factored each iteration (`solveWithGeometry`, opt-in checkbox).
- **Member end releases** (PR #229): `relI`/`relJ` flags release any of the 6 local
  DOFs at either end; eliminated by static condensation (`condenseLocal`, Schur
  complement). UI = per-member Fx/Fy/Fz/Mx/My/Mz checkboxes in the Geometry tab.
- **Spring supports** (PR #229): `fixity:'spring'` with `kx/ky/kz` adds translational
  stiffness to the free-DOF diagonal (pile-head / elastic-foundation modelling).
  UI = fixed/pin/spring selector + stiffness fields in the Supports tab.
  (Reaction sign fix — restoring force `−k·d` — shipped in PR #241; no longer pending.)
- **Rigid floor diaphragm** (PR #231): per-storey master-slave constraint elimination
  (T-matrix) tying in-plane `{ux, uz, θy}` with full rigid-body kinematics (arm
  effect). `engine/diaphragm.ts` groups nodes by storey; opt-in checkbox in Analysis.
- **Modal analysis** (`engine/modal.ts`): Jacobi eigensolver, lumped seismic mass,
  effective modal-mass participation per direction with the NSCP 208.5.5 ≥90% check.
  **Mode-shape visualization** (PR #230): click a mode row → animated deformed
  skeleton in the 3D canvas (amplitude slider), via imperative R3F `useFrame`.
- **Response-spectrum analysis** (`engine/responseSpectrum.ts`) + **storey-drift
  check** (`engine/seismic.ts`, NSCP 208) + **wind loads** (`engine/wind.ts`).
- **Method-B period + RSA-driven design**: `computeSeismic` accepts a modal
  fundamental period `Tb` (capped at 1.3·Ta Zone 4 / 1.4·Ta, §208.5.2.2) and
  `rsaEquivalentLoads` back-differences the CQC storey-shear diagram into
  equivalent static cat-E node loads scaled to the §208.6.4.2 floor
  (0.9·V_B & 0.8·V_A regular / 1.0·V_B irregular) — both feed the same
  `LateralCase` envelope that Design/Optimize consume ("Generate E cases — RSA"
  in the Loading tab; needs a Modal run first).
- **Accidental torsion ±5%** (`accidentalTorsionLoads`, §208.7.2.7): each
  directional E case (static or RSA) splits into ⟳/⟲ variants adding a
  self-equilibrating node-force couple (ΣΔF = 0, ΣΔF·d = ±0.05·L⊥·F_storey,
  mass-weighted about the storey mass centroid) — works with or without the
  rigid diaphragm; toggle in the Loading tab, on by default.
- **Orthogonal 100%+30% + vertical Ev** (§208.8.1 / §208.4.1): `buildECases`
  composes dirs × ±0.3·perpendicular × ⟳/⟲ torsion into the cat-E envelope
  (up to 16 cases); `withEv` shifts the E-combo dead-load factors to
  (1.2+0.5CaI)D and (0.9−0.5CaI)D with the effective factor in the combo name.
  Toggles in the Loading tab: orthogonal off by default (conditional per code),
  Ev on by default (strength design).
- **UI redesign (PRs #341–#347, July 2026)** — the user-supplied
  "drawing-sheet workbench" design (mockups checked into
  `docs/design/uiux-2026-07/`, also live in their claude.ai/design project):
  Archivo/IBM Plex Mono theme + palette vars (`index.css`), dark sidebar
  AppShell + breadcrumb header on all tool routes, ⌘K CommandPalette,
  redesigned Home, Model Space workspace chrome (viewport untouched).
  Calculator template in `components/calc.tsx`: PageHeader, CalcSection,
  VerdictPanel (utilization bars, amber ≥ 0.95), DrawingCard, LetterheadCard,
  and the print-only **PrintReport calc sheet** (letterhead grid, summary
  PASS table, design data, worked solution, drawing, signatures) — the only
  thing that prints on converted pages. Converted so far: **Foundation,
  Beam, Column, Combined Footing**. NEXT: same recipe on Steel (3 sub-tabs
  need a per-tab report decision), Pile Cap, Retaining Wall, Stair, Water
  Tank, geotech pages, estimates; then the mobile pass. Hard rule kept on
  every UI PR: zero files under `src/engine`, suite pinned at 1063.
- **UI follow-ups (PRs #348–#352, July 2026)**: report letterhead + PrintReport
  on all calculator pages, mockup-exact calc report (clause margin, PASS chips,
  Worked/Summary tabs, Beam φMn/φVn bars), numbered input cards everywhere
  (qty.tsx `Card` + CSS counter), and the **Model Space direct-PDF report**
  (#352): `lib/texText.ts` (LaTeX → plain unicode), `lib/modelReport.ts`
  (payload: verdict, checks, 11 schedules, every-member worked solutions),
  `lib/modelPdf.ts` (jsPDF A4 calc sheet, lazy-loaded with embedded DejaVu
  subsets in `lib/pdfFonts.ts`) — replaced the print-the-page path; letterhead
  card + ⎙ Export PDF on `/model`. Suite now 1076. Note: drei `<Text>` suspends
  on a cdn.jsdelivr.net font-resolver fetch; a local `<Suspense>` inside the
  Canvas keeps that from blanking the page on blocked networks.
- **ValidationMap filled** (P2-4): every row in `docs/ValidationMap.md` now
  cites its vitest evidence (✅/🔶) or is an explicit external-tool gap
  (X001–X004); Chopra 2-DOF eigen anchor added to `modal.test.ts`; Roadmap
  Phase-2 checkboxes synced.
- **Timoshenko shear deformation** (P3-5): `kLocal` takes Przemieniecki
  Φ = 12EI/(G·As·L²) modifiers per bending plane; the bridge supplies shear
  areas per section type (rect 5/6·A, W web d·tw / flanges 5/6·2·bf·tf,
  HSS walls, tube 0.5·A) behind a `shearDeformation` BridgeOpt — API off /
  UI on, like crackedSections. Fixed-end forces stay Euler (exact for UDL;
  O(Φ) approximation on asymmetric point/VDL loads). Modal/pushover/buckling
  paths still run the Euler element.
- **Member force diagrams BMD/SFD** (PR #233): inline bending-moment and shear
  diagrams rendered on each member in the 3D view and Analysis tab. Uses the
  existing `xs[]`/`My[]`/`Mz[]`/`Vy[]` arrays on `F3MemberResult`.
- **Effective length factor K** (PR #234): computed from the G-factor alignment chart
  (AISC Commentary C-C2) using ΣEI/L stiffness assembled at joints. Applied per
  column in the design pipeline.
- **Non-W steel sections in the 3D model** (PR #235): HSS, channel (C), angle (L),
  and WT shapes wired through `modelBridge.steelSectionProps` and the design path;
  extruded accurately in 3D via `lib/sectionShapes3d.ts`.
- **Floor vibration check AISC DG11** (PR #236): post-processes modal results;
  fn = 0.18√(g/Δj); compares ap/g against 0.5% g (office) and 0.05% g (sensitive)
  tolerances; results shown in the Analysis tab.
- **Temperature / thermal loads** (PR #237): `kind:'member-thermal'` on `ModelLoad`
  with ΔT and α; equivalent nodal forces P_thermal = EA·α·ΔT assembled in
  `engine/frame3d.ts`. Sign convention: feq[0] = −PT, feq[6] = +PT (tension-positive).
- **Design pipeline** (`engine/pipeline.ts`): governing combo → slab strips → beams /
  girders (`detectCriticalSections` → `designBeam`) → columns (P–M) → footings
  (isolated / combined / pile cap) → quantities. Steel path: §F2/§G2.1/§E3/§H1-1 +
  base plates (`engine/baseplate.ts`). Optimizer grows concrete and shrinks steel.

### Truss Space (`/truss`)
- Planar pin-jointed truss — generate (Pratt / Howe / Warren / pitched / **Fink** /
  **scissor**), analyse axial forces, AISC-LRFD design, free-form editor
  (`components/TrussEditor.tsx`), priced BOM (`engine/trussTakeoff.ts`).

### AISC section library (`engine/aiscSections.ts`)
- Full 14th-edition metric dataset: ~195 W, 28 C, 42 L, 55 HSS rect/sq, 13 round
  HSS/Pipe, 25 WT; **double angles (2L)** back-to-back. Accurate cross-sections in
  2D (`components/SectionShape.tsx`) **and extruded in 3D** (`lib/sectionShapes3d.ts`).
  All families (C/L/HSS/WT) are now wired end-to-end through the 3D model — see PR #235.

## Key paths
- 3D RC frame page: `webapp/src/pages/ModelSpace.tsx` (route `/model`)
- Truss page: `webapp/src/pages/TrussSpace.tsx` (route `/truss`)
- Design/analysis engines: `webapp/src/engine/` (`truss.ts`, `trussDesign.ts`,
  `pipeline.ts`, `frame3d.ts`, `aiscSections.ts`, `takeoff.ts`, `deadLoads.ts`,
  `liveLoads.ts`, …) — each with a `*.test.ts`.
- Routes + home tiles: `webapp/src/App.tsx`

- **3D model — steel option** (`/model`): the model space now builds either
  **reinforced concrete** (NSCP/ACI, default) **or structural steel** (AISC W/C/L/HSS/WT).
  Pick the material + per-role sections in Properties → Frame material. Steel:
  - FEM bridge uses AISC A/Ix/Iy/J and E = 200 GPa (`modelBridge.steelSectionProps`).
  - Design routes steel beams/girders → §F2 flexure + §G2.1 shear; steel columns
    → §E3 axial + §H1-1 combined (`pipeline.designSteelBeamRow/ColumnRow`).
  - Base plates designed under every steel column support per **AISC §J8 / DG1**
    (`engine/baseplate.ts`): concrete bearing, plate thickness, anchor-rod uplift.
  - 3D view extrudes each steel member's true cross-section (`MemberSteel3D`).
  - Steel tonnage in the totals; slabs/footings stay reinforced concrete.
  - Schedules: steel beam / steel column / base-plate tables in the Design report.
  - **Phase-2 TODO**: steel section auto-optimization (the optimizer currently only
    grows concrete sections — steel needs a shape-ladder search), structural-steel
    BOM line items in the costed take-off, beam connections + Lb bracing inputs.
- **Steel Design** (`/steel`): page covering three AISC 360-16 LRFD tools:
  - **Beam design** (§F2 flexure with LTB zone badge, §G2.1 shear, service deflection L/360 & L/240).
  - **Column design** (§E3 axial Fcr, both KL/rx and KL/ry, §F6 weak-axis flexure, §H1-1 combined ratio).
  - **Connection design** (§J3.6 bolt shear + §J3.10 bearing for A325M/A490M; §J2.4 fillet weld
    per mm for E70–E100 electrodes). Required count / required length shown live.
  - Pure engine: `webapp/src/engine/steelDesign.ts` + 26 tests.
  - Uses the existing AISC W-shape library; section properties (Ix, Sx, Zx, J, rts) derived from geometry.

## AISC shape library (completed)
`webapp/src/engine/aiscSections.ts` now contains the full AISC 14th-edition metric dataset:
~195 W-shapes (W100–W920), 28 C, 42 L, 55 HSS rect/sq, 13 round HSS/Pipe, 25 WT.
Shape names corrected to exact AISC designations (e.g. W310x38.7 not W310x39).

## Next up — STAAD-parity roadmap (tiered)

Closing the gap with commercial structural software (STAAD.Pro). **Tiers 1 and 2 are
complete**; Tier 3 items #10–13 are the remaining backlog.

### Tier 1 — Biggest structural modeling gaps ✅ DONE
1. ✅ **Member end releases** — PR #229
2. ✅ **Spring supports** — PR #229
3. ✅ **Rigid floor diaphragm constraints** — PR #231

### Tier 2 — High value, moderate effort ✅ DONE
4. ✅ **Member force diagrams (BMD/SFD)** — PR #233
5. ✅ **Effective length factor K for columns** — PR #234
6. ✅ **HSS / channel / angle / WT steel sections in the 3D model** — PR #235
7. ✅ **Floor vibration check (AISC DG11)** — PR #236
8. ✅ **Temperature / thermal loads** — PR #237

### Tier 3 — Complex / specialized
9. ✅ **Linearized buckling analysis** — PR #238; `engine/buckling.ts`; inverse power
   iteration with Gram-Schmidt deflation; `bucklingFromFrame` (raw API) +
   `bucklingAnalysis` (StructuralModel API). Note: 3D pin-pin columns are torsionally
   singular under `fixity:'pin'`; fixed or fixed-pin BCs required.
10. ✅ **Rigid links / member offsets** — engine PR #242, **UI PR #250**. `offI`/`offJ`
    (node→member-end vector, global m) on `F3Member`; rigid-link transform H folded into
    the element transform (`Teff = T·H`) so stiffness, loads, force recovery, P-Δ and
    buckling all carry the arm. UI: `Member.offsets` + Geometry-tab editor + purple
    3D rigid-arm rendering.
11. ✅ **Time-history analysis** — engine PR #244, **UI PR #249**. `engine/timeHistory.ts`:
    `newmarkSDOF` (Newmark-β SDOF integrator) + `modalTimeHistory` (modal superposition
    under ground accel; base-shear Σ effMass·ω²·D and peak disp Σ φ·Γ·D). UI:
    `engine/timeHistoryModel.ts` (synthetic ground motions) + V(t)/Δ(t) plots in the Modal tab.
12. ✅ **Pushover / nonlinear static** — engine PR #246, **UI PR #248**. `engine/pushover.ts`:
    event-to-event plastic hinges (a hinge = a member-end moment release). Capacity curve
    + hinge sequence + mechanism flag. UI: `engine/pushoverModel.ts` (plastic-moment +
    pattern bridge) + a Pushover tab with the capacity-curve plot.
13. ✅ **FEM plate/shell elements** — engine PR #256, solver/bridge PR #257, **UI PR #258**.
    `engine/shell.ts`: a 3-node flat shell = CST membrane + DKT (Discrete Kirchhoff
    Triangle) plate bending + θz drilling penalty; validated against Timoshenko
    plate theory (SS 0.991×, clamped 1.034× at 8×8, converging). Integrated into
    `frame3d` (`F3Shell`/`ShellGeom`, assembled into the global solve, reactions +
    serialization). Bridge meshes each `Plate` into two triangles on its corner
    nodes (`StructuralModel.shellElements`); area loads lump to those nodes and the
    tributary path is skipped for shell panels. `BridgeOpts.useShells` keeps the
    NSCP design pipeline on the tributary model (shells are analysis-path for now).
    UI: Analysis-tab toggle + teal triangulated 3D panels (with the mesh diagonal).

**Tier 3 complete — the full STAAD-parity roadmap (Tiers 1–3) is shipped.**

### Extras beyond the roadmap
- ✅ **Automatic rigid end zones** (ETABS-style) — PR #252. `engine/rigidEndZones.ts`
  `autoRigidOffsets(model, factor)` derives per-member end offsets from joint
  connectivity (factor × ½·connecting-member depth, projected on the member axis);
  applied in the bridge (manual offsets win per end), so every solve honours them.
  Analysis-tab toggle + rigid-zone factor; 3D renders zones as muted member segments.
- ✅ **Rigid-zone refinements** — PR #254. `Member.rigidZoneFactor` per-member override
  (0 = exclude); clear-span **Lc column** in the Beams & columns table (violet when
  trimmed, tooltip shows full L); `depthWidth()` resolves AISC shape d×bf for steel
  so zones are correct for W/C/HSS sections, not the bounding-box b×h.

## Tier 4 — ✅ COMPLETE (post STAAD-parity)

The STAAD-parity roadmap is complete. This tier added polish, completeness, and new
capability across the four main engineering domains. **All thirteen items (A1–E13)
are now shipped and merged** (PRs through #273):

- **A** — steel auto-optimizer, per-shape costed BOM, per-member `Lb` LTB bracing.
- **B** — pushover P–M interaction surfaces, axial/shear hinges, second-order P-Δ
  (gravity geometric stiffness; partial-step-to-target stop).
- **C** — CSV accelerogram upload + Newmark response spectrum vs NSCP 208.
- **D** — shell stress recovery + contour, n×n auto-meshing, and Wood-Armer slab
  reinforcement from the shell FE moment field (`woodArmer.ts`, `shellModel.ts`).
- **E** — NSCP §207E.4 Components & Cladding wall pressures; §418.7.3.2
  strong-column/weak-beam joint check (`scwb.ts`) for Special Moment Frames.

(The original per-item notes are retained below for reference / future extension.)

### Group A — Steel (optimizer + BOM + connections)
1. **Steel section auto-optimizer** *(highest priority)*
   Shape-ladder search: for each steel beam/column in the design loop, walk the
   AISC W-shape (or HSS) ordered list from the lightest adequate section down to
   the minimum that satisfies all limit states (§F2 flexure, §G2.1 shear, §E3/§H1-1
   combined, L/360 deflection). Currently the optimizer only shrinks concrete sections;
   steel members always keep their original user-specified shape.
   - Engine: extend `pipeline.ts` `optimizeModel()` with a `steelShapeSearch()` helper.
   - Shapes sorted by weight ascending within each family (W100→W920); search is bounded
     by Iy/Iz ≥ min-required from bending and area ≥ min from axial/shear.
   - Output: report column "Optimized shape" beside "Design shape"; HANDOFF tracks PR.
2. **Steel BOM line items in costed take-off**
   Current `takeoff.ts` reports tonnage but no unit price per shape. Add a unit-weight
   lookup (kg/m from `aiscSections`) and a \$/tonne multiplier (editable constant) so the
   steel sub-total is costed alongside the concrete/rebar take-off.
3. **Beam connections + Lb bracing inputs**
   Add an optional `Lb` (unbraced length, m) per member so §F2 LTB (lateral-torsional
   buckling) uses real brace spacing instead of the full member length. Matching input
   fields in the Geometry tab Properties panel.

### Group B — Pushover completeness
4. **P-M interaction surface for pushover hinges** *(medium priority)*
   Currently hinges form only at pure-moment capacity Mp. In practice axial force
   reduces the plastic moment (P–M interaction: ACI 318-14 §22.4 for RC, AISC 360
   Appendix 1 for steel). Add `pmSurface(P, Mp0, Ag, fc)` → `Mpc(P)` reduced moment
   capacity; thread axial demand N through the pushover event loop.
5. **Axial and shear hinges**
   Add `type:'axial'` and `type:'shear'` hinge types to `pushover.ts`; useful for brace
   and link-beam pushover models.
6. **P-Δ inside the push loop**
   Optional geometric-stiffness update at each load step (re-form Kg from current
   deformation state, re-factor Ktan = Ke − λKg); gives a softening response for
   slender frames under large lateral drift.

### Group C — Time-history
7. **CSV accelerogram upload** *(medium priority)*
   Let users paste or upload a `.csv` file (columns: t [s], ag [g]) from PEER/NGA or
   local seismic records. Parse → `Float64Array`; pass to `modalTimeHistory` via the
   existing `GroundMotion` interface (already accepts arbitrary arrays). UI: file-input
   button beside the existing synthetic-motion dropdown in the Modal tab.
8. **Response-spectrum from CSV**
   Compute the elastic response spectrum (PSA vs period) from a user-supplied
   accelerogram; overlay on the NSCP 208 design spectrum for comparison.

### Group D — Shell refinements
9. **Element-stress recovery + contour overlay**
   Post-process shell displacement vector → per-element `σx, σy, τxy` (membrane)
   and `Mx, My, Mxy` (moments per unit width) via CST/DKT B-matrix back-computation.
   Render as a vertex-colour contour on the 3D mesh (Three.js `vertexColors`).
10. **Subdivision / auto-meshing**
    Split each quad plate into n×n triangles before solve (e.g. n = 4 default).
    Reduces the systematic stiffness overestimate of coarse 2-triangle meshes;
    critical for floor slabs with high curvature gradients near columns.
11. **Shell integration into NSCP design pipeline**
    Use shell element moments (Mx, My per unit width) to size slab reinforcement
    per ACI 318-14 §8.5 (strip-moment method), replacing the current tributary
    edge-load model when `shellElements` is on.

### Group E — Misc / polish
12. **Wind load generation (NSCP 207E.6 terrain exposure)**
    Automate storey-level wind forces from building geometry + terrain category,
    replacing the current manual wind-load entries.
13. **Seismic detailing flags (NSCP 408 SMRF/OMRF)**
    Tag the building as SMRF or OMRF; adjust column-to-beam ratio check
    (§406.3.2) and transverse-reinforcement spacing limits accordingly.

**Order of implementation**: A1 → B4 → C7 → D9 → A2 → B5 → C8 → D10 → A3 → B6 → D11 → E12 → E13.

_Tests after Tier 4 (E13): **845 passing**; `tsc -b` clean; production build OK._

## Post-Tier-4 — repo hygiene, validation & geotech (PRs #275–#278)

After Tier 4, four cleanup / capability items from an external code review shipped:

- **#275 — untrack `node_modules`.** The legacy root app's `node_modules/` (458
  files) was committed before it was gitignored; removed from version control.
- **#276 — remove the legacy Firebase/Express root app.** The dormant root app
  (`src/`, `public/`, `api/`, `firebase.json`, `.firebaserc`, root `package.json`,
  `tailwind.config.js`) was deleted — it was fully replaced by `webapp/` (deployed
  via `webapp/vercel.json`). **The repo root is now just `webapp/`, `docs/` and the
  markdown docs.** `README.md` was rewritten to describe the live app.
- **Documentation page (`/docs`) — control reference (#450).** Replaced the
  three-card overview with a searchable reference for every user-facing control:
  38 entries covering all 45 routes, 423 documented controls (field / choice /
  toggle / button / tab / result), sticky sidebar TOC, deep-linkable anchors per
  tool and per section, "Open tool →" links and a whole-page search that
  requires every word to match. Content lives in `lib/docsContent*.ts` behind the
  `lib/docsModel.ts` types; `docsContent.test.ts` compares the catalogue against
  the ROUTER, so a new page cannot ship undocumented and a removed page cannot
  leave a dangling entry — it also rejects a control whose explanation is
  shorter than 25 characters, which is what forced ~50 one-liners to be
  rewritten into something useful. Labels were extracted from the page sources
  rather than written from memory. Thinner spots, documented at section level
  rather than per field: Seismic Wizard, Welded Connection and the Schedule
  sub-views.
- **#277 — validation page (`/validation`).** `engine/validation.ts` benchmarks
  engine output against independent closed-form results (RC beam Mn, cantilever
  deflection/moment via the frame solver, compact W-beam φMp, wind qz, footing
  area). Shown side-by-side with %Δ and enforced by `validation.test.ts`.
  **Solver engine coverage (#449).** The same page now also lists, in full, the
  **426 vitest cases across 28 modules** that exercise a *solver* — the
  model→solver bridge, the FEM solvers, dynamics/stability, and the nonlinear
  path followers. The benchmarks pin a NUMBER against a hand calc; these assert
  what a single number cannot (equilibrium ΣR = ΣF, agreement between
  independent solution paths, closed-form deflections and periods, convergence
  order, behaviour at limit points). Sources of truth:
  `engine/solverCoverageParse.ts` declares which modules count as solvers and
  parses the test names; `npm run gen:coverage` writes the generated
  `engine/solverCoverage.ts`; `solverCoverage.test.ts` re-parses and FAILS if it
  is stale, so a solver test cannot be added or renamed without the page
  noticing. The manifest deliberately records only which cases EXIST — nothing
  is executed to build it, so it never claims a pass state it did not observe;
  CI running the whole suite is what establishes passing. Design checks, load
  generation, geotech and quantities stay with the hand-calc benchmarks.
- **#278 — geotechnical toolkit (`/geotech`).** `engine/geotech.ts`: Rankine earth
  pressure, Terzaghi/Meyerhof bearing capacity (Vesić Nγ), infinite-slope FS — with
  N-factors checked against published tables.

_Tests after #278: **863 passing**; `tsc -b` clean; production build OK._

## Phase 3 + steel connections (PRs #279–#308)

Roadmap Phase 3 (specialty structural/geotech tools) plus a full steel-connection
suite, one PR per phase, all auto-merged after Vercel CI:

- **Validation manual + dashboard** — `docs/validation/` chapters: **frame**
  (#287), **NSCP seismic** (#288), **modal & response spectrum** (#291),
  **steel connections** (#298); per-module pass counts on `/validation` (#280).
  All chapter benchmarks are live in `engine/validation.ts` + `validation.test.ts`.
- **Beam serviceability** (#281) — NSCP min-thickness table, doubly-reinforced
  cracked Ie, and an **Ec bug fix**: `beamServiceDeflection` had used steel Es
  (200 GPa) in the deflection formula; now `Ec = 4700√f′c`.
- **Phase 3 structural** — RC stair / waist slab (#283, `/stair`), NSCP 208
  Seismic Wizard (#289, `/seismic-wizard`), circular RC water tank to
  IS 3370 / ACI 350 hoop+flexure with crack-width service checks (#290,
  `/water-tank`).
- **Phase 3 geotech (FHWA/PTI)** — soil-nail wall GEC-7 (#282, `/soil-nail`),
  micropile axial (#284, `/micropile`), rock/ground anchors PTI (#286,
  `/rock-anchor`), soil-nail **shotcrete facing** flexure/punching GEC-7 (#292,
  `/shotcrete-facing`).
- **Steel connection suite** —
  - #293: joint designer reflects the **actual connected elements** (column
    flange vs web × beam web vs flanges) + custom per-bolt locations in
    `designBolts`.
  - #294: `/bolted-connection` — eccentric bolt group, elastic vector method,
    fully custom bolt coordinates, critical/least bolt, max-P back-calc.
  - #295: **connection kind drives analysis**: `Member.connections.iEnd/jEnd`
    (`'simple' | 'moment' | 'fixed'`); a `'simple'` end auto-releases My+Mz via
    `effectiveReleases` in `modelBridge` (the schematic hinge), so force
    behaviour matches the detailing.
  - #296: `/welded-connection` — eccentric fillet-weld group (weld-as-a-line,
    `J/t = Σ[L³/12 + L·ρ²]`, throat 0.707·w per NSCP 510.2.2), required leg +
    max P.
  - #297: out-of-plane eccentricity (§J3.7 bolt tension + shear interaction
    φF′nt) and prying action (§J3.9 T-stub: Q, T+Q, t_req, t₀) on
    `/bolted-connection`.
- **Gap-fill** (#298) — `Connections` category on `/validation` (4 hand-checked
  benchmarks), `diaphragm.test.ts` (last untested logic engine), this HANDOFF
  refresh.

_Tests after #298: **965 passing**; `tsc -b` clean; production build OK._

## Optimizer hardening + steel joints (PRs #299–#308)

- **#299–#302 — optimizer regime check fixes**: batch-shrink infinite loop on
  square RC columns (hierarchy revert guard, sync+async); un-designable steel
  members surface via `design.unchecked` instead of silently passing; NSCP
  Table 409.3.1.1 min-thickness gate on pipeline RC beams; honest `stopReason`
  on non-convergence (shown in the optimize panel).
- **#303 — optimizer covers EVERY check**: slabs (§408.3.1.2 + §424.2
  deflection), shear walls, steel joints and SCWB gate `designOK`; grow
  actions for slab/wall thickness and SCWB columns; slab-trim economy pass;
  `sw` marker so refreshSelfWeight stops wiping wall/user dead line loads.
- **#304 — ETABS-consistent rigid end zones**: vertical members project with
  the drawn orientation (depth d → X); steel zones render the true extruded
  profile, not the bounding box.
- **#305 — designed connections in 3D**: shear tabs + bolts at their designed
  layout, moment flange welds + continuity plates, at the faces the rigid
  zones cut ('Show designed steel connections' toggle).
- **#306 — `Member.axisRotation`** (ETABS local axis 2 angle) through the
  element transform; verticals default 90° so ANALYSIS strong-axis orientation
  finally matches the drawn/joint-designed one. ⚠ results shift for non-square
  columns (correction).
- **#307 — beam-to-beam connections**: fin plates into a through-girder web
  with the SCM coped-beam detail (`design.beamJoints`, gated + rendered).
- **#308 — interactive connection schedule**: click a row → 2D detail drawing
  (elevation + end section, SVG from the designed values) + KaTeX step-by-step
  solution (§J3.6 bolt group, §J4.2 plate, §J2.4 weld, §J2.6 CJP, Part 9 cope).

_Tests after #308: **988 passing**; `tsc -b` clean; production build OK._

## Connection detailing + continuity polish (PRs #310–#317)

User-feedback rounds on the connection schedule, joint rendering and RC/steel
modelling consistency, one PR per round:

- **#310–#313 — detail-drawing polish**: shared RC dimension primitives
  (`components/dims.tsx`) reused in the connection views; single-shear basis
  (m = 1) called out in the section, worked solution and schedule; full-height
  tab weld (elevation + 3D plate + bead); units on the elevation; flexible
  drawing panels.
- **#311/#312 — column-stack visual/section continuity**: beams end at the
  support face, roof columns extend to beam top, column sections continuous
  up the stack.
- **#314 — RC size limits + monotonic stacks**: `RC_LIMITS` caps in the
  optimizer (like steel's shape table bounds); a column may only be equal or
  smaller than the column below (`enforceSectionHierarchy`).
- **#315 — bar-diameter continuity guards**: one Ø per beam run / column stack
  (`barContinuityGroups`, union-find); bar COUNT still varies per section.
- **#316 — concrete renders physically like steel**: face-trimmed beams,
  extended roof columns.
- **#317 — bolt-layout renderer + web/flange pairing drives the connection**:
  `/bolted-connection` drawing rebuilt (self-sufficient plate, collision-free
  labels, centroid + eccentricity trace); the joint designer determines the
  column face from the member's **resolved orientation** (`axisRotation`),
  WEB-face tabs extend past the flange tips with the larger designed
  eccentricity, and a weak-axis moment demand becomes **`moment-web-plate`**
  (extension plates into the column web, §J4.1 + §J2.4 checks) — in the
  solution, the 2D detail and the 3D render.

Known gap (CLAUDE.md backlog P4-13): `designBeamBeamJoints` assumes every
supported beam meets the girder **web** (nodes are coplanar); beam-on-girder-
flange bearing needs vertically offset framing first.

_Tests after #317: **1003 passing**; `tsc -b` clean; production build OK._

## Audit round (PRs #319–#334)

A three-agent full-project audit (engine correctness / live UI-UX / build-test
health, 2026-07-12) produced **issue #325** — the prioritised follow-up
backlog — and this fix round. Remaining work lives in #325's unticked boxes.

**Correctness (found by the audit, fixed immediately):**
- **#319 — thermal loads were 1000× too large**: `modelBridge` fed `E·A·α·ΔT`
  in newtons to a solver contract in kN; `/1000` + bridge-level regression test.
- **#321 — ±E/±W load reversal**: model-derived lateral cases get reversed-sign
  companion runs, so uplift (0.9D±E/W) and moment reversal are enveloped.
- **#326 — instability surfaced, never clamped**: `momentMagnificationNonsway`
  returns `stable:false` (δ, Mc = ∞) when Pu ≥ 0.75Pc (§6.6.4.5.2) instead of
  silently clamping δ to 1.0; the P-Δ loops return
  `F3PDeltaStatus {converged, singular, iterations, residual}` on `F3Result`,
  and `StructureDesign.pDeltaIssues` gates `designOK` (fail-loud in UI too).
- **#328 — open-section torsion**: non-W shapes used the polar moment
  (1–2 orders too stiff for C/L); `torsionJ()` now does thin-wall Σbt³/3 open /
  Bredt closed.
- **#330 — P-Δ reactions carry the Kg term**: reactions are `(K+Kg)·d − F`
  when P-Δ ran, so the secondary base shear/moment reaches supports; ΣR = ΣF
  unchanged (Kg self-equilibrates).

**Engine features / hardening:**
- **#327 — ACI §6.6.3.1.1 cracked-section modifiers**: 0.35Ig beams / 0.70Ig
  columns via `BridgeOpts.crackedSections`; ON by default in the Model Space UI,
  OFF at the API level so closed-form benchmarks stay gross-section.
- **#329 — bridge→solver unit-contract tests**: five absolute closed-form
  anchors (δ = PL³/3EI in metres, ΣR = wL, thermal ≈746 kN hard-bracketed…) so
  the next N-vs-kN slip fails loud.

**Process / UI:**
- **#320 — real CI gate**: `tsc -b` + lint + `npm test` gate the Pages deploy;
  optimizer-test timeout headroom; Roadmap truth-up. (Lint ran with
  `continue-on-error` until #445 cleared the backlog — it now blocks, with
  `--max-warnings 0`.)
- **#331 — discoverability**: searchable “All tools” grid on Home; Structural
  dropdown sub-grouped into 6 disciplines (two-column panel); ARIA menu
  semantics.
- **#332 — Steel Design works without the API**: `calcApi` falls back to an
  in-browser `calcLocal` (lazy chunk, same engine) on network error/404; real
  API errors now actually log.
- **#333 — KaTeX ⌀/§ sanitizer** in `lib/math.tsx` (single chokepoint) kills
  the per-page console warnings; **#334 — WCAG AA helper text** (slate-400 →
  slate-500 on light surfaces, 3 dark-bg exceptions).

_Tests after #334: **1028 passing**; `tsc -b` clean._

_Remaining roadmap: Pressure Grouting (empirical — skipped by design); Phase 4
items are owner-driven (marketing/monetisation). Prioritised follow-ups: the
unticked boxes in **issue #325** (page-shell unification, mobile tables, FEM
run feedback, ~~eslint zero-out~~ (done, #445), bundle splitting, ModelSpace split,
ValidationMap transcription, project save/load…). The xlsx vuln + optimizer-test
timeout from that list are now resolved — see the PRs #362–#371 section below._

## Section detailing, multi-leg ties & Dependabot cleanup (PRs #362–#371, July 2026)

Model Space (`/model`) report polish, reinforcement-detailing drawings, and the
three open GitHub issues. Latest suite: **1118 passing**; `tsc -b` clean;
`npm audit` **0 vulnerabilities**.

**Report / section-figure (PRs #362–#368) — the direct PDF export (`lib/modelPdf.ts`)
and the on-screen schematics (`components/TSection.tsx`, `ColumnSchematic.tsx`):**
- **#362 — schedule↔solution verdict parity**: the worked-solution
  "Reinforcement-ratio limits" step false-FAILed DRRB and flanged (T-beam)
  sections while the schedule chip (`beamOK`) passed. Min steel is satisfied by
  construction and exceeding ρmax is valid for DRRB, so the step now passes when
  `ρ ≤ ρmax || mode === 'DRRB'` (`lib/beamSolution.ts`). Also moved the section
  figure **beside** the member name with a demand line (`Mu/Vu` beams, `Pu/Mu`
  columns) and a plan location (grid line + floor) via a `memberLoc` helper in
  `lib/modelReport.ts` (`ReportSolution.details`/`loc`, `ReportSection.legs`).
- **#363–#366 — stirrup hook, iterated to a real detail**: the tie is a single
  hairline stroke, so the 135° hook is drawn as one hairline that **wraps around
  the tension-side corner bar** (the bar is painted on top so the tie reads as
  wrapping it) with the tail into the core, on the correct side (bottom sagging /
  top hogging). Dimension callouts carry units (`300 mm`), and the block header is
  centred against a compact figure box.
- **#367 — multi-leg stirrups (beams)**: `stirrupLegs(barsWidestLayer)` in
  `engine/beamDesign.ts` (ACI 318-14 §25.7.2.3: 2 perimeter + a crosstie every
  other interior bar) is echoed on `BeamDesignResult.legs` and **feeds `Av`**
  (the extra legs raise shear capacity). Each added leg draws as an interior
  **C-tie** that arcs OVER the top bar and UNDER the bottom bar it grips.
- **#368 — multi-leg stirrups (columns)**: the C-tie is factored into a reusable
  helper (bar A, bar B, axis, opening) and used for a tied column cage —
  **vertical** C-ties on interior top/bottom-face bars, **horizontal** C-ties on
  interior side-face bars.

**Open issues closed (PRs #369–#371):**
- **#324 — flaky optimizer test**: file-level `vi.setConfig({ testTimeout: 30_000 })`
  in `pipeline.test.ts` so the catalog-search cases get headroom under full-suite
  CPU contention (was only one `it` with a 20 s override).
- **#322 — Dependabot (2 high + 1 low)**: dropped the abandoned `xlsx` (ReDoS +
  prototype-pollution in the user-upload parser; patched builds ship only from the
  CDN, unreachable in CI) for **ExcelJS** (dynamically imported, browser build via
  the `browser` field) in `lib/foundationExcel.ts`; `accept=".xlsx"` (OOXML only).
  `package.json` `overrides`: esbuild `^0.28.1`, uuid `^11.1.1` → **`npm audit` = 0**.
- **#323 — thermal load category `T`**: `member-thermal` was tagged `cat:'D'` (so
  self-straining effects were factored as dead load and counted as seismic mass).
  Added `'T'` to `LoadCategory` and threaded it through `nscpCombos`
  (`engine/beamAnalysis.ts`): self-straining `T` rides at 1.2 in every combo
  carrying the factored dead load (203-1…203-5), omitted from the 0.9D uplift
  combos (ASCE 7-16 §2.3.4); the Model Space thermal form now tags `'T'`.

> **Container note (cloud sessions):** this session's container twice reverted
> uncommitted work to a stale commit mid-task. If the working tree ever looks
> wrong (e.g. `foundationExcel.ts` back on `xlsx`, or stray edits to files you
> didn't touch), `git fetch origin main && git checkout -B <branch> origin/main`,
> re-apply, and **`npm install`** to resync `node_modules` with the merged
> `package.json`. Commit and push early.

## Validation roadmap — toward a formal validation manual

The product direction is a **validated structural-analysis platform for NSCP
workflows**, not "an ETABS replacement." The single most valuable next asset is a
**formal, documented validation manual** proving the solvers are correct.

**What already exists (in the unit suite).** A lot of solver-vs-analytical
checking is already in `*.test.ts` and should be the seed of the manual, not
redone:
- `frame2d.test.ts` / `frame3d.test.ts` — cantilever `δ = PL³/3EI`, fixed-end
  moments, planar portal vs `frame2d`, P-Δ amplifier vs `1/(1−P/Pe)`, statics
  self-checks, diaphragm and rigid-link kinematics.
- `modal.test.ts` — natural periods/mode shapes; `accelSpectrum.test.ts` /
  `timeHistory.test.ts` — Newmark SDOF, PSA/PSV/Sd relations, resonance.
- `pushover.test.ts` — collapse loads vs rigid-plastic limit analysis
  (`8Mp/L`, mechanism base shears); `pipeline.test.ts` — NSCP load-path checks.
- `validation.ts` (#277) — the first *user-visible* benchmark table.

**The gap = a documented manual + external-tool cross-checks.** Proposed
`docs/validation/` (or a generated `VALIDATION_MANUAL`) with one file per case,
each as **Problem → Reference solution → Software output → Error % → PASS**:
1. **Frame** — SS beam `5wL⁴/384EI`, cantilever `PL³/3EI`, textbook portal frame
   (Hibbeler/McCormac), space frame vs **STAAD/SAP2000/ETABS**.
2. **Modal** — 1-/2-/3-/5-storey shear buildings: periods, mode shapes,
   participation factors vs textbook + ETABS.
3. **Response spectrum** — SDOF and multi-storey base shear vs ETABS.
4. **NSCP seismic** — worked 208 static base shear + vertical distribution +
   drift for a 4-storey building (manual vs engine, target <0.5 %).
5. **RC / steel / geotech** — extend the `/validation` table (the `/validation`
   page already renders these and the test suite enforces them).

Surface the pass counts on the `/validation` page and a public "Validation"
section. This is the highest-leverage next body of work; treat each chapter as
its own PR (engine benchmark test + a `docs/validation/*.md` write-up).

## Verified backlog (code-vs-docs reconciliation, July 2026)

An audit of the actual engine (`webapp/src/engine/`) against the CLAUDE.md
priority backlog. **Already shipped** (docs lagged the code): cracked-section
modifiers (#327, `modelBridge` role factors), accidental torsion, orthogonal
100 %+30 % & vertical `Ev`, Timoshenko shear, and steel **block shear (§J4.3)**
+ **prying (§J3.9)** + shear-tab / moment connections (`steelDesign.ts`,
`steelConnections.ts`) — so the old P4 "steel connections" item is effectively
complete. New disciplines landed too: **timber wood-frame** (#379–#386),
**plumbing RNPCP** (#381–#383), **project scheduling CPM/PERT** (#387–#390).

**Still genuinely missing** (verified absent from the engine):

_Analysis completeness (P3):_
- ~~**Direct-integration MDOF time-history** with Rayleigh damping~~ — ✔ shipped
  (#432): `engine/directTimeHistory.ts` — Newmark-β on the FULL free-DOF system
  `M ü + C u̇ + K u = P(t)` with `C = αM + βK`; the effective stiffness
  `K̂ = K + a₀M + a₁C` is constant for fixed dt so it is LU-factored **once** and
  reused every step (same shared-factorization discipline as the static solver).
  `rayleighCoeffs(ω₁,ζ₁,ω₂,ζ₂)` inverts the two-anchor curve; the model driver
  anchors to two modal frequencies. No mode truncation and damping need not be
  modally diagonalizable — the prerequisite for **nonlinear TH**. Validated by
  reproducing mode-by-mode superposition to 1e-9 on a 2-DOF shear building.
  Diaphragm constraints are not applied on this path (same as `modal.ts`).
- **Nonlinear time-history** — ✔ engine shipped (#433), built on #432:
  `engine/hysteresis.ts` (bilinear kinematic hardening: yields at Fy, post-yield
  slope b·k₀, **elastic unloading at k₀** and reverse yielding — what the
  event-to-event pushover hinge structurally cannot do, since a released DOF can
  never re-stiffen) + `engine/nonlinearTimeHistory.ts` (Newmark-β with
  Newton-Raphson equilibrium iteration on a hysteretic spring network;
  initial-stiffness Rayleigh damping; LU refactored only when the yield pattern
  changes; returns {converged, maxIterations, worstResidual} per the L5 rule).
  Reduces EXACTLY to `newmarkDirect` when nothing yields (1e-9).
  **Wired to the 3D frame** (#434): `engine/nonlinearModel.ts` reduces a
  `StructuralModel` to the equivalent nonlinear SHEAR BUILDING — per storey,
  mass from `buildSeismicMass`, secant stiffness `k₀ = V/Δ` from a unit-per-level
  static probe (the same definition the NSCP soft-storey check uses, so the two
  agree by construction), and shear-type capacity `Fy = Σ 2·Mp/h` via
  `plasticMoment`. `runNonlinearModel(model, gm)` returns the reduction, its
  period and the response. Validated: the reduced period matches the FULL 3D
  modal T₁ within 10% (0.937–0.973) for 1–3 storeys. **Assumptions to state with
  any result**: shear-type (strong-beam/weak-column) mechanism — a beam-hinging
  frame has LOWER real capacity, so check the governing mechanism with the
  pushover engine first; one direction at a time; torsion ignored.
  **Next**: a Model-Space UI tab for it, and distributed member-end hinge states
  (fibre/concentrated) instead of the storey-spring reduction.
- **Distributed member-end plastic hinges** — ✔ shipped (#438 statics, #439
  dynamics): `engine/nonlinearFrame.ts` puts the hinge ROTATION on its own global
  DOF (node θ —[spring]— θb ═ beam), so the frame is a linear elastic assembly
  plus 1-D hysteretic springs and hinge state determination is exact. Validated
  against limit analysis — cantilever `P = Mp/L`, fixed–fixed `P = 8·Mp/L`.
  `engine/nonlinearFrameDynamic.ts` adds Newmark-β + Newton-Raphson over the same
  assembly (`assembleFrame` is shared, so a pushover and a time history see
  identical geometry and hinge state); with `Mp = ∞` it reproduces `newmarkDirect`
  to 1e-9. This supersedes the shear-building reduction's strong-beam/weak-column
  assumption — every member end can hinge.
  `engine/nonlinearFrameModel.ts` (#440) is the **`StructuralModel` bridge**: it
  condenses a 3D building by COMBINING every frame line parallel to the loading
  direction into one equivalent plane frame (perpendicular coordinate collapses,
  transverse members dropped, EI/EA and Mp summed, mass aggregated). Exact when
  the parallel frames are identical and deform together (the rigid-diaphragm
  assumption); validated by reproducing the full 3D modal T₁ within 10%
  (0.937–0.969), independently agreeing with the shear-building reduction.
  `runNonlinearFrameModel(model, gm)` runs the hinge time history straight off a
  `StructuralModel`; the same condensed frame also drives a static pushover.
  **P–M interaction** (#441): the hinge yield moment is reduced to `Mpc(P)` via
  `reducedPlasticMoment`, with P recovered from the member's current axial state
  each Newton iteration (not a frozen gravity preload), so column capacities fall
  as overturning builds. Opt-in on `NLMember` (`Pcap` + `pmKind`); the model
  bridge supplies both automatically from `axialCapacity`, summing Pcap across
  combined parallel frames. Caveat recorded in the module: moving the yield
  surface mid-analysis is the standard concentrated-plasticity approximation, not
  a rigorously consistent plasticity formulation.
  **Displacement control** (#442): `control: 'displacement'` prescribes the
  control-node displacement and SOLVES for λ (δd = δd_R + δλ·δd_P, the constraint
  fixing δλ), so the capacity curve can descend past its peak. It holds the
  collapse load flat at Mp/L over a 6× drift range where load control instead
  runs the displacement to >10 m, and traces a monotonically descending branch
  when the hinge softens (b < 0) — which load control structurally cannot do.
  **UI** (#443): the Model Space **Nonlinear** tab has a *Plasticity model*
  selector — "Member-end plastic hinges" (default) or "Shear building (storey
  springs)". The hinge path reports the equivalent-frame period and condensation
  summary, hinges yielded / total, peak base shear vs the elastic demand, peak
  roof drift, dissipated energy, Newton convergence, and a table of yielded
  hinges ordered by plastic rotation. When nothing yields it says so explicitly
  rather than showing a blank panel — an elastic outcome is a result.
  **Arc-length (Riks/Crisfield)** (#447): `arcLength.ts` adds the third control
  mode — `arcLengthFrame` prescribes the LENGTH of the step in (d, λ) space and
  solves for both, under the cylindrical constraint ‖Δd‖² + ψ²Δλ²‖P‖² = Δl²
  (ψ = 0 default). Three pieces make it work:
  1. the predictor takes **sign(Δλ) = sign(det Kt)** — det flips at every load
     limit point, so the step reverses into the descending branch by itself;
     the obvious "continue in the last direction" rule reflects off the peak and
     retraces the path it came from;
  2. a **yield-event trim** shortens the step to land just past the first hinge
     crossing (the same event-to-event idea `pushover.ts` uses) — the hinge
     tangent jumps by ~10³ and changes sign there, and a corrector starting on
     the wrong side flies onto a different branch;
  3. a negligibly negative discriminant (the sphere TANGENT to the path, which
     happens exactly at that switch) is taken as the double root instead of
     being called a failure; a genuine miss still halves the arc.
  Validated: elastic path exact, peak λ = Mp/L to 4e-14 % for a perfectly
  plastic hinge (`validation.ts` `arc-length-collapse`), and point-by-point
  agreement with displacement control to 1e-3 relative.
  ~~**Robust snap-back**~~ — ✔ shipped (#448) via the smooth-material route.
  `smoothHinge.ts` is the bilinear law's two asymptotes with the corner rounded,
  f = b·k0·u + Fp·tanh(kp·u/Fp), C^∞ everywhere. `arcLength` gains
  `material: 'smooth'`, which additionally converges on the RESIDUAL (an
  increment test can pass while the state is out of balance — that silently
  produced equilibrium points ABOVE the plastic capacity), adds a backtracking
  LINE SEARCH, and applies KNEE-RESOLVING step control (the smooth transition is
  only ~one yield rotation wide, so a coarse arc steps over it and sees a
  discontinuity again). Result: hundreds of sustained reversals for |b| > 3
  versus 3 at best before, and the traced path no longer depends on the arc
  length — peak λ and δ agree across a 4× change in Δl.
  **Cost, stated in the module**: the smooth material is nonlinear ELASTIC — no
  dissipation, no permanent set — so it is for static path tracing only and must
  not be used for cyclic or dynamic work, which keep the bilinear law. A
  perfectly plastic hinge still reaches the EXACT collapse load on either
  material; only where the peak sits at the knee (softening) does the rounding
  shave it, always low and under 1%. `material` defaults to `'bilinear'`, so
  every previously validated result is unchanged.
  **A failed first attempt is worth recording**: regularizing only the TANGENT
  of the bilinear law (exact force, smoothed Kt) did NOT work — it produced
  equilibrium points above capacity, then a Zeno stall at the yield boundary,
  and was a net regression. The force itself has to be smooth.
  **Still open**: 3D/biaxial hinges.
- ~~**Load combinations with nonlinear members**~~ — ✔ shipped (#444), to the
  owner's **per-combo active set** decision. `analyzeActiveSet` in `axialOnly.ts`
  runs every NSCP combination on its OWN active-set iteration and reports
  `{ inactive, iterations, converged }` per combo alongside the usual
  `F3Analysis`; `solveActiveSet` gained diaphragm support so the condensed model
  is solved identically. `solverWorker` routes the analyze request (and the
  E-case drift solve) through it whenever any member carries an `axialMode`, and
  through the ordinary shared-LU `analyzeFrame3D` when none does — so models
  without limited members pay nothing. Superposition is deliberately given up,
  never patched: results are never scaled or summed across combos.
  **UI**: the member editor has an **Axial mode** selector (both / tension-only /
  compression-only); the Analysis tab shows a *Tension / compression-only
  members* panel (limited-member counts, the governing combo's off-list,
  convergence, and a per-combination table of which members switched off); the
  selected member reports whether it is active in the governing combo; and
  members off in the governing combo are overlaid with a dashed red sleeve in
  the viewport (`dashPattern.ts` — the dash geometry is a pure tested module, so
  it is verified without depending on a WebGL screenshot).
  Note that an inactive member is genuinely absent from that combo's solve, so
  it does not appear in that combo's member-force table — by design.
- **Consistent-mass option** beside lumped — does not exist anywhere.
- ~~**Cracked service deflection in model space**~~ — ✔ shipped (#446).
  `engine/memberDeflection.ts` computes §424.2 deflections for every RC beam in
  the model by DOUBLE-INTEGRATING that member's own moment diagram, taken from
  the D-only and L-only service solves the pipeline already ran:
  `chordDeflection(xs, M, EI, cantilever)` treats the curvature φ = M/EI as
  piecewise linear and evaluates both integrals in closed form (exact for a
  linear M, O(Δx²) for a parabolic one), with v(0) = v(L) = 0 for a spanning
  member — the CHORD-relative deflection the L/360 and L/240 limits are written
  against — and v = v′ = 0 at the built-in end for a cantilever.
  `memberServiceDeflection` wraps it with Branson's Ie (`bransonIe`) at the peak
  service D+L moment, the cracked inertia of the reinforcement actually designed
  at the critical sagging section, and λΔ = ξ/(1+50ρ′).
  This replaces nothing — it ADDS the calculation that NSCP §409.3.1.1 makes the
  alternative to the deemed-to-comply thickness table, so a beam row now passes
  on **either** h ≥ hMin **or** the computed check (strictly less restrictive
  than before, where h < hMin failed outright).
  Surfaced as a δ chip on every RC beam schedule row, a full serviceability card
  in the expanded accordion, and a dedicated check + table in the PDF report.
  ~~**Open**: proper T-section gross properties~~ — ✔ closed by #457:
  `tSectionGross` computes the real flanged Ig and the pipeline passes
  `bf`/`hf` whenever `tBeamAction` is on. Slabs already had their own §424.2
  path (`slabDeflection`); this is the beam counterpart.
- ~~**Irregularity auto-flags** — NSCP Table 208-9/10 (torsional, soft-storey,
  mass)~~ — ✔ shipped (#427 engine, #428 wiring/UI, #429 report/validation):
  `engine/irregularity.ts` flags P1 torsional (208-10 §1a/1b), V1 soft-storey,
  V2 mass, V3 vertical-geometric as pure post-processing of the E-case drift
  field + storey weights; `solverWorker` runs `assessIrregularities` beside the
  drift check and the Model Space Analysis tab shows an **Irregularities** panel.
  The flags also fold into the direct **PDF report** (advisory regularity check +
  a "Structural irregularities" table, does not gate `designOK`) and carry a
  `/validation` row (`torsional-irregularity`) + a ValidationMap coverage entry.
  Not auto-checked (need capacity/plan-shape/offset topology): 208-9 Types 4/5,
  208-10 Types 2–5.

_Geotech / foundations (P4):_
- ~~**Slope stability by method of slices** (Bishop / Janbu)~~ — ✔ shipped
  (#430 engine, #431 page): `engine/slopeStability.ts` — vertical-slice
  discretisation of a circular surface + Fellenius/OMS, Bishop's simplified
  (iterative mα), and Janbu's simplified (f0 correction), with a grid search for
  the critical (min-Bishop-FS) circle; ru / piezometric-line pore pressure;
  orientation-agnostic driving. **`/slope` page** (`pages/SlopeStability.tsx`):
  slope-geometry + soil + ru inputs, the three-method FS on the critical circle,
  a vector slope + slip-circle + slices drawing, a slice table, and the print
  report. Tests vs a 3-slice hand calc + Bishop ≥ Fellenius + monotonic
  steeper→lower; `validation.ts` `slope-slices-fellenius`.
- **Settlement** (immediate + consolidation) and **laterally loaded piles**
  (Broms / p-y) — absent.
- **Offset framing / beam-on-girder-flange bearing** (seat detail, AISC §J10) —
  still blocked on the model supporting vertically offset framing.

_v1.0 gate:_
- **Formal validation manual** (`docs/validation/`, one file per case:
  Problem → Reference → Software output → Error % → PASS) + the external-tool
  cross-checks (ETABS/STAAD/PCA/Excel — open items X001–X004). The unit suite is
  the seed; it is not yet assembled into a documented manual.

_Minor / partial:_
- Cracked-section deflection (`beamDeflection`/`slabDeflection` exist standalone)
  is not clearly threaded into Model-Space serviceability results.
- Pressure grouting — intentionally skipped (empirical).

## 3D / biaxial plastic hinges (PRs #451, #452, July 2026)

Shipped in phases; the plane-frame engines are untouched and still ship.

- **#451 — `engine/biaxialHinge.ts`, the constitutive law.** Moment vector
  (My, Mz) and rotation vector (θy, θz) coupled by a yield surface, replacing
  the assumption that a section's two bending axes yield independently. Vector
  return mapping with kinematic hardening, associative flow, closest-point
  projection by a 3×3 Newton, and the ALGORITHMIC (consistent) tangent.
  Surfaces: Orbison Eq. 10.18 (McGuire/Gallagher/Ziemian) for compact I-shapes,
  which takes P/Py directly; and the Bresler power contour for RC, whose
  capacities are pre-reduced through the existing `reducedPlasticMoment` chords.
  For α < 2 the exact |m|^α has an unbounded second derivative at m = 0 — the
  uniaxial state — so it is regularised as (m² + ε²)^(α/2), a ~1e-9 shift.
  `validation.ts`: `biaxial-orbison-contour`, `biaxial-skew-projection`.

- **#452 — `engine/nonlinearFrame3d.ts`, the space frame.** 6 DOF/node plus TWO
  extra rotation DOFs per hinged end, taken in the member's LOCAL axes because
  the yield surface lives in the section's own axes. The hinge deformation is
  the node's global rotation vector projected onto y′/z′ minus the beam-end DOF
  (a 2×5 matrix B); the element is `frame3d`'s own `kLocal` wired through a
  rectangular transform A that degenerates to frame3d's T when nothing is
  hinged — which is why the elastic case reproduces `solveFrame3D` to 1e-12.
  Handling orientation once in B/A makes the whole thing orientation-independent
  for free, verified by rotating an entire model through arbitrary Rodrigues
  rotations. `validation.ts`: `biaxial-frame-skew-collapse`.

**Two things worth remembering.**

1. *Convergence must be residual-based here.* An increment test
   ‖Δd‖/max(1,‖d‖) cannot distinguish convergence from divergence: once a bad
   step makes ‖d‖ astronomical the relative increment is trivially small. A
   fully plastic biaxial hinge leaves a genuine zero-stiffness direction, and
   where the control DOF failed to restrain it the load factor ran away while
   every step still reported `converged`. `nonlinearFrame3d` therefore converges
   on the residual (scaled by the internal force as well as the applied load)
   plus the displacement-control constraint error. **`nonlinearFrame.ts` (2-D)
   still uses the increment test** — lower risk there, since one hinge rotation
   per end means the control DOF always captures the mechanism, but it is the
   same latent shape of bug and worth revisiting.
2. *A perfectly plastic mechanism has an exactly singular tangent*, so whether
   the factorisation survives it is floating-point luck. The engine reports
   `mechanism` and stops when it does not, which is honest; the tests carry a
   token b = 1e-6 that keeps the tangent positive definite and lifts the plateau
   by only ~3e-6 relative.

- **#453 — `engine/biaxialFrameModel.ts`, the model bridge + skew pushover.**
  Resolves the equivalent-plane-frame problem by NOT condensing: model members
  map 1:1 onto `nonlinearFrame3d`, with section properties inherited from
  `modelToFrame3D` so cracked sections, local-axis rotation and moduli are not
  re-derived. Adds `weakPlasticMoment` (the weak-axis companion to
  `pushoverModel`'s strong-axis `plasticMoment`) and `runBiaxialPushover`, a
  lateral push at ANY plan angle — the thing the plane-frame reduction could
  never express. Releases and rigid offsets are not representable in the hinge
  element and are REPORTED in `unsupported`, never silently dropped.
  `validation.ts`: `biaxial-plan-symmetry`.

**A convergence defect found and fixed in #453 (in `nonlinearFrame3d`).** On the
cantilevers of #452 everything converged; on a real two-storey frame with 32
hinges, most steps did not, and the residual sat at ~0.99 — Newton was stuck,
not slow. Two wrong diagnoses on the way (tolerance, then linear-solve
conditioning) were each disproved by measurement before the real cause showed
up: a hinge's tangent falls by k0/(b·k0) ≈ 5e5 at yield, so when a step yields
twenty hinges the full Newton direction is wildly wrong. A backtracking line
search fixes it, but only with a DEEP default — 6 halvings left 1 of 12 steps
converged and reported 287 kN; 25 halvings converged all 12 and reported 405 kN
**at every penalty rigidity from 1e2 to 1e4**. That invariance is now a test:
a converged capacity must not depend on the penalty constant. `NL3Step` also
gained a `residual` field, per the L5 convention that iterative routines report
one — its absence is what made this take three attempts to diagnose.

Diagonal equilibration was added around the solve and KEPT, but it is not what
fixed convergence (measured: no effect). It earns its place because
`luFactor`'s singularity test is an absolute 1e-14, meaningless against entries
of order 1e10 — scaling the diagonal to ~1 makes mechanism detection real.

- **#454 — phase 3b, the Model Space UI.** A `biaxialPushover` worker task, a
  "Biaxial pushover" section on the existing Pushover tab (plan angle, target
  drift, steps, yield surface, contour exponent, P–M), and
  `components/BiaxialPushoverPanel.tsx` — capacity curve, headline rows, the
  most-utilised hinges with My/Mz in the member's own local axes, and warnings.
  All judgement lives in the pure, tested `summarizeBiaxialPushover`; the panel
  only renders it. The six new controls were added to the `/docs` catalogue in
  the same PR, per the promise #450 made. Browser-verified end to end: a
  generated grid pushed at 45° gives 888.9 kN at 2.83% drift, 16 of 26 hinges
  yielded, converged at every one of 40 steps (worst residual 8.7e-10).

**The biaxial hinge series is complete** (#451 law → #452 space frame → #453
bridge + skew pushover → #454 UI).

**Also worth knowing:** the power surface is only usable for α ≲ 6. Beyond that
it approaches a sharp-cornered box and the return map stops converging (α = 20
failed on most steps). Genuinely uncoupled axes should use two 1-D hinges.

**Flagged, not fixed (out of scope):** `webapp/index.html` declares no favicon
`<link>`, so every page load 404s on the browser's default `/favicon.ico`
request — `/vite.svg` ships in `dist` but is never referenced. Cosmetic, and
pre-existing.

## Follow-ups after the biaxial series (PRs #455, #456, July 2026)

- **#455 — favicon.** `webapp/public/favicon.svg` always shipped but
  `index.html` never linked it, so every page load requested `/favicon.ico`,
  404'd, and logged an unhandled `TypeError: Failed to fetch`. One line. (An
  earlier flag of mine claimed `/vite.svg` was the unreferenced asset — wrong;
  that path only returned 200 because `vite preview` serves the SPA fallback.)

- **#456 — `nonlinearFrame` (2-D) multi-hinge convergence.** I had recorded this
  as "lower risk" than the 3-D case. That was wrong, and measuring it first is
  the only reason it got caught: on a 3-bay × 4-storey frame with 56 hinges,
  plain full Newton with the increment test converged **none** of 30 steps.
  Same two fixes as the 3-D engine — residual-based convergence and a
  backtracking line search (predictor exempt) — plus a relative guard on the
  displacement-control denominator, `residual` on `NLFrameStep` (and on
  `ArcStep`), and `maxIter` default raised to 120 because a backtracking chain
  counts as one iteration. Every step now converges below 1e-8 and the peak load
  is step-count independent; while it was failing, the peak was under-reported
  by 0.2%.

  **The dynamic driver was measured, not assumed.** `nonlinearFrameDynamic`
  converges in 3 iterations on the same 56-hinge frame at three shaking
  intensities, because Newmark adds a0·M to the tangent diagonal and
  regularises it. It shares `assembleFrame` but keeps its own Newton loop, and
  it was deliberately left unchanged.

## Backlog closeout (PRs #457–#459, July 2026)

- **#457 — T-section gross & cracked properties** for the §424.2 deflection
  check, removing the conservatism #446 recorded as follow-up. The true T sits
  BETWEEN the two rectangles people substitute for it: web-only 0.61·Ig (what
  #446 used) and full-depth-at-bf 2.0·Ig (what #446 rejected). Hogging is
  handled separately — the flange is then in tension and cracked, so a T-beam
  over a support is a rectangular beam — and Mcr's yt now follows the governing
  moment's sign. Threaded through `pipeline` from the same effective flange the
  design already computes.

- **#458 — `engine/settlement.ts`** (P4 #12, first half): Boussinesq stress
  distribution, elastic and Schmertmann immediate settlement, Terzaghi 1-D
  consolidation with the recompression / virgin / crossing branches, and U ↔ Tv.
  `validation.ts`: `consolidation-nc`, `consolidation-tv90`.

- **#459 — the `/settlement` page**, following the #430/#431 engine-then-page
  split. Editable layer table, Boussinesq-vs-2:1 stress profile, per-layer
  branch and contribution. Documented in the `/docs` catalogue in the same PR.

**Two judgement calls worth remembering from #458.** The Tv expressions are the
published closed-form FITS to Terzaghi's series, not the series: 0.1963 vs the
tabulated 0.197 at U = 50%, and a 1.3% step between branches at U = 60%. My
first docstring claimed they "meet by construction" — false, now stated and
tested. And the Boussinesq table value is published to four decimals, so it
cannot meet `validation.ts`'s 0.01% gate; that comparison stays in the unit test
at the precision the reference carries rather than the gate being loosened.

- **#460 — `engine/lateralPile.ts`**, closing P4 #12: Broms ultimate capacity
  (clay/sand × short/long × free/fixed) and a p-y analysis solving the pile as a
  beam on nonlinear soil springs, with Matlock soft-clay and API sand curves.
  `validation.ts`: `broms-sand-short`, `broms-clay-short`.

  **Two defects the tests caught, both silent.** The head-moment sign was
  inverted relative to the solver's DOF convention, so an eccentric load made
  the pile deflect LESS — the API now states the moment physically and negates
  internally, and exposes `e` directly since that is the number to hand. And
  Matlock's p ∝ y^(1/3) has an INFINITE tangent at y = 0, which stalled every
  service-load solve at a residual around 2e-6 no matter how many iterations it
  was given (the deflections were right; the residual simply could not be
  driven down, because near-zero springs down the shaft had unbounded
  stiffness). Regularised below 1e-3·y50 — about 0.015 mm on a 600 mm pile —
  after which the same cases converge in 5–9 iterations at 1e-12. A backtracking
  line search was added first and helped, but did not fix it; measuring showed
  the stall, not slow convergence.

**The recorded backlog is now clear** apart from the `,\ ` LaTeX thin-space
question in `beamSolution`/`columnSolution`, which changes rendered output and
needs the user's call. - **#461 — the `/lateral-pile` page.** Broms capacity card (both mechanisms,
  with the governing one named) beside a p-y working-load panel showing
  deflection / moment / reaction profiles, head deflection against the 25 mm
  yardstick, and the solver's iteration count and residual. Documented in the
  `/docs` catalogue in the same PR.

## Accounts and access control (PR #462, July 2026)

Supabase email+password auth, with the tool split the user asked for: the
single-purpose calculators are free to try, the heavy stateful features need an
account.

- `lib/trialQuota.ts` — PURE and tested. Owns the route classification and the
  guest allowance (5 runs per tool), so the rules are inspectable in one place
  rather than scattered as `if (user)` checks. An unlisted route defaults to
  members-only, which is the safe direction. **A guard test compares the lists
  against the router**: the first draft was written from memory and 15 of 27
  trial routes did not exist.
- `lib/auth/authClient.ts` — the Supabase adapter behind a provider-agnostic
  surface, created LAZILY so importing it is free and a deployment without keys
  still builds and runs.
- `lib/auth/validation.ts` — pure form rules, separately tested.
- Pages: `/signin`, `/signup`, `/forgot-password`, `/reset-password`. The old
  `AuthModal` "coming soon" placeholder is deleted rather than left alongside.

**Three deliberate security choices, each with a test:**
1. A failed sign-in always says "Email or password is incorrect", never which
   was wrong — otherwise the form is an account-enumeration oracle.
2. Password reset always reports success, even for an unknown address, for the
   same reason.
3. Provider error text is never passed through raw; unrecognised errors become
   a generic message rather than leaking internals like JWT or table names.

**And one deliberate failure direction:** when the Supabase keys are absent
NOTHING is gated. A missing env var must not brick the app behind a form that
cannot work. Verified in a browser — `/model` stays reachable unconfigured.

**Plans shipped in #463, restructured to four tiers in #464.** `lib/plans.ts` is
pure and tested, with FEATURE-based entitlements rather than route-based:

| | Guest | Free ($0) | Pro ($19) | Max ($49) |
|---|---|---|---|---|
| Calculators | 5 runs each | unlimited | unlimited | unlimited |
| Saved projects | — | 3 | unlimited | unlimited |
| Model Space | — | — | ≤ 400 members | unlimited |
| Design pipeline, optimiser, reports, estimating | — | — | ✓ | ✓ |
| Nonlinear analysis, scheduling | — | — | — | ✓ |

The shape is deliberate: **Guest and Free are the same product**, differing only
in that Free has an account behind it (no trial counter, a few saved projects).
Nobody should have to pay to finish a beam check. The paid tiers carry the
project-scale tools.

Tests assert the properties people assume but that silently break: the tiers are
strictly CUMULATIVE, limits never tighten as price rises, the top plan holds
every feature that exists, an unknown plan id falls back to the LEAST privileged
tier, and `upgradeMessage` names **Max** — not Pro — for the features only Max
has.

A plan is read from Supabase user metadata and can never be granted by the
browser — otherwise the paywall would be a suggestion. Until a checkout webhook
exists, every account is `free`. To grant yourself a paid tier for testing, set
`{"plan": "pro"}` (or `"max"`) on your user in the Supabase dashboard under
Authentication → Users → User Metadata.

**Billing webhook shipped in #467 — the server half of checkout.**
`supabase/functions/billing-webhook/` (Deno) verifies the provider's HMAC, maps
the event to a plan and writes `user_metadata.plan` with the service-role key.
Idempotent: the applied event id is stored beside the plan, so provider retries
are no-ops. Pure logic in `supabase/functions/_shared/` is covered by the app's
vitest suite (48 tests) — vite.config's `test.include` was extended to reach it,
so the money path is not the one untested corner.

Three providers verified: **Paddle**, **Stripe** and **PayMongo** (chosen for
this audience — Philippine engineers, so GCash/Maya matter). Constant-time
digest comparison, ±300 s replay window checked both directions, missing secret
rejects. PayMongo's `te=`/`li=` split is resolved by explicit mode, because
accepting either would let a widely-shared test secret approve a live payment.

Two invariants pinned by tests: an unrecognised price NEVER resolves to a plan,
and anything not-active resolves DOWN to free. Everything fails CLOSED — the
opposite of `authClient`/`usePlan`, deliberately.

Full setup steps and the pre-launch checklist are in `docs/Billing.md`.

**Checkout itself is still not wired, and payments are still not faked.**
`CHECKOUT_ENABLED` remains pinned false by a test. What is missing is a
`billing-checkout` function creating a session with `metadata.user_id` attached
(PayMongo has no static link that carries per-user metadata), the pricing-page
buttons, and a `/billing/success` page. The pricing page still says plainly that
paid plans are not open; no card details are collected anywhere in the app.

**Unverified, flagged rather than assumed:** PayMongo's event field paths were
written from the documented envelope, not a captured event — send one test event
through before launch. Also confirm PayMongo subscriptions are available on the
account, and settle the PHP-vs-USD mismatch between the provider and `/pricing`.

**Enforcement shipped in #466.** `lib/featureGate.ts` maps every gated thing
onto the feature it needs, in one pure tested place:

- `SOLVER_FEATURE` — each `SolverRequest['kind']` → its feature. A guard test
  parses `engine/solverWorker.ts` and fails if a kind is unclassified OR stale,
  because an unmapped kind reads as `undefined` and would run on any plan. The
  guard was checked by deleting a mapping and confirming it fails.
- `ROUTE_FEATURE` — each gated route prefix → its feature, key-set-equal to
  `trialQuota.GATED_PREFIXES` by test, so "must I sign in?" and "is it on my
  plan?" cannot drift. Matching is on a segment boundary: `/modelling-guide` is
  not swallowed by `/model`.
- `gateSolve` reports the FEATURE before the size when both would block —
  "your model is too big" is misleading when paying for size alone would not
  help.

Wiring: `RequireAuth` renders `UpgradeGate` (a page naming the plan) instead of
redirecting; `ModelSpace` wraps `useSolver.run` so the check happens once at the
choke point, with the nonlinear/optimiser buttons disabled and an inline notice.

**Both backstops earned their place.** `exportPdf` has TWO buttons reaching it
(workspace header and results bar) and the header one was missed on the first
pass — found by dumping every button in the browser, not by reading the file.

**Fail-open when auth is unconfigured**, matching `RequireAuth`: `usePlan`
returns the top plan so a fork, CI or preview build stays fully usable rather
than becoming a demo of a paywall nobody can pass. Verified in a browser.

**Nobody can buy a plan yet**, so in practice every account is `free` and sees
only the calculators. Grant yourself a tier for testing in the Supabase
dashboard: Authentication → Users → your user → User Metadata → `{"plan":"pro"}`
or `"max"`.

**This is a product boundary, not a security one.** Every calculation runs in
the browser; anyone with devtools can flip the plan object. Real enforcement
means moving the solver behind an authenticated API. The header of
`featureGate.ts` says so, so nobody later reads these checks as protection.

**Not verifiable here:** a real sign-in round trip, since this environment has
no Supabase project. Everything up to the network call is tested; the call
itself needs your keys.
---

# Soil Investigation module — Phase 0 shipped

A geotechnical investigation-management module: enter a site investigation once
(boreholes, layers, samples, field and laboratory tests), interpret design
parameters from it, and feed those into the analysis engines that already exist
rather than retyping soil properties on every calculator page.

## The architectural decision, and its cost

The module was specified against a ~30-table Postgres schema. **This repo has no
database.** `supabase/` contains only the billing webhook function — no
`migrations/`, no tables; Supabase is used for auth only, and every project in
the app (schedules, models) persists to localStorage.

So Phase 0 builds the model on `engine/soils/store.ts`, a versioned key-value
store over a swappable `StorageBackend` — the same arrangement the scheduling
module has been running on. Designing thirty tables plus RLS policies against a
schema that will still move as the laboratory engines land means writing
migrations for guesses.

**The cost is real:** until the backend swap lands (Phase 8), an investigation
lives in one browser on one machine, and laboratory data is expensive to
re-enter. `exportJSON` is the backup mechanism, not a convenience, and the UI
must treat it that way.

## What Phase 0 contains (no UI)

| Module | Role |
|---|---|
| `soils/model.ts` | Investigation → Borehole → Layer → Sample → LabTest, plus SPT. JSON-serialisable throughout. |
| `soils/provenance.ts` | `measured` / `derived` / `correlated` / `assumed` as a discriminated union on every parameter value. |
| `soils/registry.ts` | 21 calculations declared with equation, units, symbols, assumptions, limitations and source — *before* they are implemented. |
| `soils/standards.ts` | 25 ASTM/AASHTO designations as a typed const. |
| `soils/store.ts` | Versioned persistence + JSON import/export. |
| `soils/validate.ts` | Integrity rules that report and never repair. |
| `soils/sample.ts` | A valid two-borehole Baguio City fixture. |

## Three decisions worth not re-litigating

**Provenance is on the value, not in a parallel result type.** `φ = 32°` from a
triaxial, from an SPT correlation, and from Friday-afternoon judgement carry
different confidence and different liability, and once all three render as "32°"
the difference is gone — including from the engineer defending the report two
years later. Retrofitting this across thirty engines later would not happen, so
it is in from day one. The proposed `CalculationResult<T>` was dropped: the
existing `SolutionStep[]` convention already carries method, clause, substituted
inputs and pass/fail, and renders to both screen and PDF.

**`engineering_standards` is a const, not a table.** The goal behind it — one
place to change a designation, no string literals in forty modules — is right; a
table is the wrong mechanism client-side. `StandardId` derives from the object,
so a mistyped citation fails to compile.

**Validation reports, never repairs.** A gap between 4.20 m and 4.50 m is either
a logging error or an unrecovered run, and only whoever was on the rig knows
which. Errors are the impossible (PL > LL, overlapping layers, groundwater below
the hole); warnings are the merely unusual (N = 2, 33% recovery, a gap) —
because flagging the unusual as an error trains people to ignore errors.

## Guards that will bite on later phases

- Every correlation must state a reference AND at least one limitation. A
  correlation without a stated range of validity reads exactly like a
  measurement — the most dangerous thing this module could ship.
- Every symbol in a registry equation must appear in its symbol table.
- Every registry equation must survive `texToPlain` with no stray commands.
- The clean fixture must validate with zero errors *and* zero warnings.
- Route-carrying phases also hit `docsContent.test.ts` (every route needs a docs
  entry) and `featureGate.ts` (`ROUTE_FEATURE` key-set equality).

## Remaining phases

1. **Classification** — Atterberg, sieve (D10/D30/D60, Cu, Cc), USCS D2487,
   AASHTO, plasticity chart, grain-size curve.
2. **SPT** — N60 corrections, (N₁)₆₀, correlation library (every entry tagged
   `correlated` with its source).
3. **Investigation UI** — borehole page, graphical log column, profile editor.
4. **Laboratory suite** — moisture, Gs, compaction, direct shear, UCS, triaxial,
   consolidation, permeability, CBR.
5. **Parameter engine + wiring** — one parameter table per layer feeding the
   existing bearing/settlement/slope/earth-pressure/pile pages. *The payoff
   phase; everything before it is data entry.*
6. **Engine gaps** — liquefaction (NCEER, can consume PGA from `nscpSeismic`),
   bearing depth/inclination factors and method selection, Coulomb.
7. **Report** — the 22-section document builder on `pdfKit` chrome.
8. **Postgres, CPT, 3D subsurface.**

**Open for the user:** which plan tier gates this (suggest `pro`+).

## Soil investigation — progress

| Phase | PR | State |
|---|---|---|
| 0 — model, provenance, registry, store | #476 | merged |
| 1 — classification (Atterberg, sieve, USCS, AASHTO) | #477 | merged |
| 2 — SPT corrections, correlations, overburden | #478 | merged |
| 3a — borehole log renderer (geometry) | #479 | merged |
| 3b — investigation UI, routes, profile editor | #480 | merged |
| 4a — lab plumbing + index tests (moisture, Gs) | #481 | merged |
| 4b — sieve + Atterberg wired, sample classification | #482 | merged |
| 4c — direct shear + UCS | #483 | merged |
| 5 — parameter engine (resolution + provenance) | #484 | merged |
| 5b — parameters wired into bearing capacity and slope | #485 | merged |
| 4d — consolidation (Cc, Cr, σ′p, cv) | #486 | merged |
| 4e — lab charts (envelope, e–log σ′, grading) | #487 | open |
| 4f — compaction (Proctor, ZAV bound, curve) | #543 | merged |
| 4g — triaxial UU/CU/CD + Mohr circle diagram | #544 | merged |
| 4h — permeability (constant/falling head) + CBR | #545 | merged |
| 4i — hydrometer (Stokes, corrections, fine-end curve) | — | open |

**The 4x laboratory series is complete**: every `LabTestType` except `swell` now has an
engine, a form and (where a number is read off a curve) a chart. Left open deliberately:
the hydrometer and sieve curves are still two tests on one sample rather than one merged
distribution — the hydrometer reports on the whole-sample basis when told what fraction it
represents, so the join at 0.075 mm is arithmetically ready, but pairing the two tests
automatically is a UI decision (which sieve test on which sample) that has not been made.
| 6a — liquefaction triggering engine (NCEER) | #488 | merged |
| 6b — liquefaction tab, FS profile, fines from sieve | #489 | merged |
| 6c — bearing general equation + method selection | #490 | merged |
| 6d — Coulomb + Mononobe–Okabe earth pressure | #491 | merged |
| 7a — report document model (22 sections) | #492 | merged |
| 7b — report PDF renderer + vector drawing painter | #493 | merged |
| 8a — async remote store, sync, Supabase adapter + SQL | #494 | merged |
| 8b — sync UI (status, conflict resolution) | #500 | merged; **verified live 6 Aug** — all five probes pass |
| 8c — CPT (Robertson SBT, correlations) | #495 | merged |
| 8d — subsurface cross-sections | #496 | merged |
| 8e — section wired into the report and the profile tab | #497 | merged |
| 8f — CPT in the model, validation and a UI tab | #498 | merged |
| fix — remove the mixed-method `bearingCapacity()` | #499 | merged |
| 8b — sync UI + live connection self-test | #500 | merged |
| fix — plan moved to `app_metadata` (self-grant closed) | — | migration applied; confirmed live from the JWT claims |

**`/soils` is live**, gated behind the `soil-investigation` feature on pro and
max. Eight tabs: overview and integrity, boreholes with the graphical log,
stratigraphy and samples with the correlated section, corrected SPT, laboratory
tests (each test card draws its own curve), liquefaction triggering with an FS
profile, interpreted parameters, and a USCS classifier. A "Report PDF" button
generates the 22-section investigation report.

**Every engine is now reachable from the UI.**

**Supabase: SETTLED AGAINST THE LIVE DATABASE, 6 Aug.** Egress to
`*.supabase.co` was opened on the environment and took effect without a new
session, so `runRemoteDiagnostics` was run from here against the real project —
the shipped code path, not a curl imitation, signed in as the owner. All five
probes **passed**:

| probe | result |
|---|---|
| Table and column names | every column the adapter reads exists on the table |
| Column check is meaningful | a deliberately wrong column name was rejected, so the check above is a real test |
| Row-level security | a write under another user's id was refused (**42501**) |
| Round trip | written, read back intact, removed |
| Conflict detection | an update carrying an out-of-date version matched **no rows** — a stale write is refused rather than overwriting newer work |

`ok=true ranAll=true`, and a follow-up `select … like '__diag_%'` returned `[]`,
so the probe rows cleaned themselves up. That closes what the postgrest-shaped
fake could never prove: the column names and the error codes Postgres actually
returns are the ones the adapter branches on.

The three migrations are confirmed present by their own responses, which is
worth writing down because the *shape* of each answer is the evidence:

- `soil_investigations` — 200 `[]` (exists, RLS filtering an anonymous read)
- `projects` — 200 `[]` (same)
- `guest_trials` — **42501 permission denied** (exists, and `anon` deliberately
  has no SELECT grant: only the `SECURITY DEFINER` `consume_guest_trial` should
  touch it)
- control: a table that does not exist answers **PGRST205 "Could not find the
  table"**, which is what makes the three answers above meaningful rather than
  three different flavours of failure

The `plan → app_metadata` migration is confirmed the only way it can be — from
the JWT: `app_metadata` carries `{"plan":"max"}` and `user_metadata` carries no
`plan` key at all. A user calling `auth.updateUser({ data: { plan: 'max' } })`
writes `user_metadata`, so the self-grant hole is closed on the live project.

**Still outstanding on the user's side:** the `guest-quota` edge function is
**not deployed** — `POST /functions/v1/guest-quota` returns **404** — and the
`GUEST_TRIAL_SALT` secret goes with it. The `guest_trials` table and its
`consume_guest_trial` function are in place and waiting for it.

**Storage decision, settled:** the local `SoilsStore` over localStorage stays;
Phase 8a adds an ASYNC `RemoteStore` beside it rather than behind it, because a
database cannot be wrapped in a synchronous key-value interface.

**One row per investigation, jsonb — NOT thirty tables.** The normalised schema
is right once the module needs to query across investigations; today nothing
does, the `Investigation` type is still moving, and thirty tables written
against a moving type are thirty tables of guesses. Normalising later is a
migration, not a rewrite. Argued in full at the top of `remoteStore.ts`.

**Sync never picks a winner.** Two-sided edits are reported as conflicts and
both versions are left untouched. Laboratory data costs a week to produce;
last-write-wins would destroy it silently.

**Recurring lessons from these phases**, all worth remembering:

1. *Tests can enshrine a bug.* The log renderer drew "Silty Sand" with silt
   hatching, and the test asserted that behaviour with a comment explaining it
   ("'silt' matches first") — I had written down what the code did rather than
   what was right. Only rendering the log and looking at it caught it. In a soil
   name the adjective comes first and the noun governs.
2. *Check the standard, not the plausible reading of it.* `groupIndex` clamped
   each term of AASHTO M 145 at zero before summing, which is a different
   equation from the one the standard prints — 40% fines at LL 20 / PI 2 is 0,
   not 1.
3. *One rule, one home.* The noun bug came back in Phase 3b because the page
   grew its own `/clay|silt/` regex — a second independent reading of the same
   field, which disagreed with the first within a day. `soilFamily` now lives in
   `model.ts` and a test asserts the renderer and the page cannot drift apart.
4. *A loose tolerance hides a broken method.* Phase 4d's first σ′p used a
   numerical Casagrande construction that returned 536 kPa for a break planted
   at 100 — wrong by a factor of five — and the assertion (`120 < σ′p < 320` for
   a planted 200) was wide enough to pass. The test now plants the break at
   100, 200 and 400 and demands each one back. Where a range is the honest
   assertion, probe the actual value once before trusting the range.
5. *Render it and look at it.* Every visual defect in this module was found by
   looking at output, never by a test: the silt hatching, the rock hatch
   escaping its band, a fraction boundary struck through "sand 86%", and in
   Phase 4e a rounded axis that clipped the extrapolated envelope off the top
   of the frame. Each one is now covered by a test written *after* the render
   showed it.

**Chart conventions (Phase 4e), so the next chart matches:** log data gets a
log axis; linear axes get 1–2–5 round ticks via `linearTicks`; extrapolation
beyond the tested range is dashed; annotations sit on an opaque `plate` in the
corner the curve structurally cannot reach. Charts are `PlanPrimitive` lists
serialised by the shared `planToSvg` — no chart draws pixels of its own.

---

# Page-polish backlog — CLOSED (PRs #504–#525, August 2026)

An 18-item list of page-level defects and gaps, worked one PR per item. All
closed. The engine-level items each turned up a **correctness** bug that the
cosmetic complaint was sitting on top of — those are the parts worth
remembering.

## Correctness bugs found while doing cosmetic work

| where | what was wrong | PR |
|---|---|---|
| `retainingWall` | `Mu_stem` / `Vu_stem` were SERVICE actions compared against φMn and φVc. ACI §5.3.1(e) gives U = 1.2D + 1.6L + **1.6H**, so the stem was under-designed by the full 1.6 (27.0 → 43.2 kN·m/m on the default wall). A test asserted the old behaviour. | #521 |
| `retainingWall` | Base slab used the §9.6.1.2 **beam** minimum on b·d. It is a one-way slab: §7.6.1.1 → §24.4.3.2, ρ·Ag on the gross section. 41% less steel, and the applicable clause. | #521 |
| `retainingWall` | The PDF divided B and H by 1000 when both were already in metres — every report printed "0.00 m" for base width and total height. | #521 |
| `devLength` | **§25.4.1.4 was not implemented.** √f'c must be capped at 8.3 MPa for every §25.4 length; without it, concrete above ~69 MPa bought a shorter ld than the tests behind the clause support. | #522 |
| `devLengthSolution` | `\text{d_b = 20 mm}` — an underscore in text mode is a KaTeX parse error, so that line printed as **raw LaTeX on every visit**. `EPOXY_WHY` was keyed on values the engine never emits. | #522 |
| `sample.ts` (schedule) | The fixture was a 13-activity **chain**. The network diagram drew a straight line because that is what the data was, and in a chain every activity is critical, so float and resource levelling had nothing to say. | #523 |
| Truss Space | Every member sized from one hand-picked section — 20% utilisation. Sizing per design group: 93%, 29% less steel. | #524 |

## Two habits that paid, repeatedly

**Render it and read it.** Every drawing shipped in this series had defects
that green tests did not catch, and an automated overlap audit — every
`<text>` box against every other and against the frame, over several
geometries — caught them all:

- labels printing through each other and running past the frame (#521, #522)
- a `q,max` of **158 320 000 000 kPa** when the resultant left the base — a
  divide-by-3x̄ that now reports "the wall overturns" instead (#521)
- rebar drawn **outside the concrete** on a thin stem (#521, #522)
- a hook tail poking out through the bottom of the member (#522)
- an edge route that swung back **through** an activity box because the `T`
  path command reflects its control point and overshoots (#523)

The audit is worth keeping: it is ~30 lines of Playwright and it found more
real defects than any unit test in the series.

**Guard tests are worth their maintenance.** In #525 three separate guards
fired on the new routes — the worked-solution contract (no prose, no units),
`docsContent` (undocumented route), `trialQuota` (unclassified route) — and
every one was right. Where a guard's *list* was the thing at fault (missing
citations, missing `kPa`), the list grew; the guard was never weakened.

## Things now shared rather than duplicated

`splitLayers` / `centroidRise` (`barLayers.ts`), `udlStations` (`udl.ts`),
`SceneText` + the bundled scene font, `CodeHint` (reusable clause popover,
content held as testable data in `devLengthHints.ts`).

## Left open, deliberately

- ~~**T-section gross properties** in `memberDeflection` use the web
  rectangle~~ — ✔ shipped: `tSectionGross` computes the real flanged Ig and
  the pipeline passes `bf`/`hf` whenever `tBeamAction` is on. The entry (and
  the docstring in `pipeline.ts`) had gone stale after the work landed.
- ~~**Slab cut-off fractions** (`DEFAULT_EXT` in `slabBarDetail.ts`) written
  from memory~~ — ✔ verified against ACI 318-14 Fig. 8.7.4.1.3(a) in #527.
  One was wrong: the column strip has **no** bottom cut-off, the bars run
  100% continuous (`bottomShort: null`), and the drop-panel remainder is
  measured from the support **centreline**.
- **Supabase migrations still need running by hand**: `20260731120000`
  (app_metadata), `20260804000000` (guest_trials), `20260804010000`
  (projects); then `supabase secrets set GUEST_TRIAL_SALT="$(openssl rand -hex 32)"`
  and `supabase functions deploy guest-quota`.

---

# Reinforcement selection — enumerate, gate, score, adopt (PRs #528–#531, August 2026)

Every RC engine used to take the bar diameter as an **input** and compute
`n = ceil(As/Ab)`. Whatever the user typed is what got detailed — there was no
search at all. The one place that did search (`barSelection`, in the
model-space pipeline) ranked purely on **steel area** with a smaller-bar
tie-break. Both are wrong the same way: a layout is not just an area. 6⌀16 and
3⌀25 carry nearly the same steel and are not remotely the same thing on a
drawing.

Four phases, one PR each. Where the code lives:

| file | role |
|---|---|
| `engine/rebarScore.ts` | the core: gate → score → rank → adopt. Weights, near-tie rule, blocking gates. |
| `engine/beamRebarOptimize.ts` | beam: diameter only, plus `optimizeBeamMember` (one ⌀ per member) and `resolveBarContinuity` (one ⌀ per run) |
| `engine/columnRebarOptimize.ts` | column: diameter × count |
| `engine/matRebarOptimize.ts` | slab + footing: diameter × spacing module |
| `components/RebarRanking.tsx` | the card, shared by all four pages |
| `lib/rebarSolution.ts` | the four calc-sheet steps, shared by all four reports |
| `lib/rebarLabel.ts` | `nameCage` / `nameMat` — how a layout is written on a drawing |

## Three different search shapes, and why

This is the part worth not re-deriving:

- **Beam** — diameter only. Once the diameter is fixed the count follows from
  `n = ceil(As/Ab)`, and any larger `n` is strictly worse: more steel, no
  benefit.
- **Column** — diameter **×** count. That is *not* true here. 8⌀20 and 4⌀25
  are both legitimate, both sit well inside §10.6.1.1, and they are different
  columns. Symmetry is an **exclusion**, not a preference: counts are
  restricted to even ≥ 4 (tied) / ≥ 6 (spiral), because an unsymmetric cage is
  not the section the P–M interaction was computed for.
- **Mat** — diameter **×** spacing module. Nobody writes "17 bars" on a slab;
  they write ⌀12 @ 150. The count is a consequence: `n = floor((b − 2c)/s) + 1`.
  A mat has no centreline, so `wantSymmetric: false`.

## Decisions worth not re-litigating

1. **Compliance is a gate, never a score.** A layout failing any check is
   infeasible and is never ranked, however well it scores elsewhere.
2. **No engine re-derives strength.** Every optimiser runs the existing,
   verified designer once per candidate and reads compliance off the result. A
   second implementation of §22.2 that drifts from the first is worse than no
   search at all.
3. **Scores are relative to the candidate set generated**, not to hard-coded
   references — so a set where every option is a ⌀32 scores them all *equally*
   on diameter rather than all badly. Normalisation runs over the **feasible**
   set so an infeasible outlier cannot stretch the scale.
4. **The near-tie rule is a leading-group promotion, not a comparator.** As a
   comparator it is not transitive (A ties B, B ties C, A and C do not), and
   `Array.sort` with a non-transitive comparator gives implementation-defined
   order — which is no way to produce a schedule.
5. **`ScoreContext.naming`** carries the vocabulary. A cage is counted, a mat
   is spaced; a reason that does not match the headline reads as two answers.

## Correctness bugs found on the way

| where | what was wrong | PR |
|---|---|---|
| `rebarScore` | The near-tie rule **bought steel**. On a slab strip the modules span 75–300 mm, so the areas at one diameter run 1.3×–4.4× the requirement while the totals compress into one 0.03 band; promoting on serviceability alone reached the tight end every time — the middle strips came out at **2.63×** the required steel for a 0.014 score difference, and the whole panel quoted one mat. `MAX_TIE_STEEL = 0.15` caps what a promotion may buy. | #531 |
| `rebarScore` | First version of the near-tie rule was a **non-transitive comparator** — a candidate with a *higher* total ranked below one with a lower total. | #528 |
| `matRebarOptimize` | `beta1` written as `max(0.65, sloped-row)`. ACI Table 22.2.2.4.3 (SI) is **not continuous**: the slope covers 28 < f′c < 55 and the last row is a flat 0.65 for f′c ≥ 55. The slope at 55 gives 0.657. | #530 |
| `beamRebarOptimize` | `governing` named the wrong section — bar count is rounded, so 210 and 240 kN·m tied and list order decided it. Now compares `As`. | #528 |

## Continuity — the question that keeps coming up

Yes, it is maintained, at both scales:

- **Within a member**: `optimizeBeamMember` scores each diameter across *every*
  critical section and adopts one for the whole member. A size that works at
  midspan and fails over the support is not a size the beam can be built with.
  Bar *counts* differ between sections; only the diameter is shared.
- **Along a run**: `resolveBarContinuity` makes a continuity group adopt the
  **largest** diameter any member in it needs. It is member-type agnostic, so a
  column stack lapping storey to storey works the same way as a beam line.
- **Across a slab panel**: one diameter for the panel, spacing **per strip** —
  which is exactly how a slab is drawn.

## Left open, deliberately

- ~~**`designBeam` omits §25.2.1's 4/3·d_agg term**~~ — ✔ shipped: `aggregate`
  is an input (default 20 mm) and applies to both faces, and the optimiser now
  hands the designer the same figure instead of keeping its own.
- ~~**`designSlabDDM` can over-reinforce at its own minimum thickness**~~ —
  ✔ shipped: every strip carries `tensionControlled`, the result carries
  `rhoMax`, and `applicable` folds it in. An OPEN `h` is the engine's and it
  grows until §21.2.2 is satisfied; a PINNED `h` is the caller's and is
  reported, not repaired.
- ~~**Rectangular and eccentric footings** keep the manual ⌀ field~~ —
  ✔ shipped: `optimizeMatSearch` generalises the per-diameter loop and all
  three shapes search. A rectangular footing takes one diameter and a spacing
  per direction.
- KaTeX cannot render ⌀ in math mode, so the score equations read `S(4D20)`.

# T-beam: `a` from equilibrium, and the depth the cage destroys (PR #540, August 2026)

Asked how `a` is derived in a T-beam and whether it satisfies C = T, the answer
turned out to be **yes, exactly, in both branches** — and verifying it found a
design defect sitting next to it.

## How `a` is derived (`tBeamCapacity`)

`a` is never assumed. It is solved from horizontal equilibrium; the branches
differ only in which concrete area supplies C.

| case | compression zone | solved a |
|---|---|---|
| `a ≤ hf` | rectangle of width **bf** | `a = T / (0.85 f′c bf)` |
| `a > hf` | overhangs **full** at hf + web block | `a = (T − 0.85 f′c (bf−bw) hf) / (0.85 f′c bw)` |

Hogging is passed `bf = bw`, so the overhang term is zero and the second form
degenerates into the first — one equation, not a special case. Verified across
20 combinations at **0.0000 %** residual, with `a = β1·c` exact.

## The defect it exposed

`designTBeam` solved `As` at `d = dt` and only **then** dropped `d` to the
bar-group centroid, never redesigning. `designBeam` has iterated both faces all
along; the T-beam engine never did. The cage came back sized for a lever arm the
cage itself had destroyed:

```
bf 600  hf 80  Mu 700   As 2905 → 2945 provided, φMn 690.7  ✗
bf 1200 hf 100 Mu 1900  As 8153 → 8836 provided, φMn 1732.6 ✗   (d fell 89 mm)
```

More steel than the As printed beside it, and still short. Now the layout and
`As` are solved together. The map `d ↦ d_next` is monotone (deeper d → less
steel → fewer bars → shallower stack → deeper d_next) and starts at `d = dt`, the
largest d the section has, so it only falls and the integer bar count makes it
settle — typically in 2 passes.

## Three more found while verifying, all in the browser

| where | what was wrong |
|---|---|
| `designTBeam` | Oscillated forever when the web ran out of singly-reinforced capacity: `As` collapsed to `Asf` (a *lighter* cage the worse the overload) and the stack sprang back. That is a failed design, not a convergence problem — it now reports `Asw` at the tension-controlled ceiling and stops. |
| `designTBeam` | **Hogging reported as "true T"**. `tBeamCapacity` gets `bf = bw` there, so its own `a > hf` flag compares a web block depth against a flange thickness that plays no part. A 700×75 flange under Mu = −150 came out "true T" on that accident, and the worked solution then printed the overhang formula for a section whose flange is in tension. |
| `TBeamDesign` | Summary read `6-⌀25 (2112 mm²)` — the bar count beside the area **required**, which reads as the area those bars supply. Same on the tension-controlled bar, which compared the demand against a cap that governs what gets built (0.24 shown where 0.34 was true). |

`designTBeam` also gained §25.2.1's **4/3·d_agg** term, which `designBeam` got in
#539 — the T-beam engine was still packing layers on `max(db, 25)`.

## β1, consolidated

Three copies of `max(0.65, sloped-row)` remained after #530 — `loads.ts`
(feeding `beamDesign`, `columnDesign`, `scwb`, `columnSolution`), `tbeam.ts` and
`prestressedBeam.ts`. All now re-export `flexure.beta1`, the table form.

## Worked solution

`/tbeam-design` now shows the equilibrium derivation itself: T, the C expression
for the branch taken, `a` solved from it, and a `C = T` closing check — plus a
step for the stacked-cage `d` when the bars need more than one layer.

# Bar count in the model schema — the column's second axis (August 2026)

`RectSection` stored a diameter and no bar count, so the count was re-derived
downstream by `designAxialColumn` on every read. That single missing field was
what pinned model space to a **one-axis** column rebar search: `columnRebarOptimize`
enumerates Ø × count, but the pipeline had to hand it
`counts: (i, db) => [designAxialColumn({ ...i, barDia: db }).bars]` — pin the count
to the one that will be re-derived — because a cage it adopted instead would be
silently recomputed into a different one, and a P–M check that passed during the
search would fail on the section that shipped.

## What changed

- **L1** `RectSection.barCount?: number` — absent ⇒ derived (old JSON loads
  unchanged), present ⇒ the cage is the stored one.
- **L1** `meshValidation` polices it: `BAR_COUNT` (whole number ≥ 4, §10.7.3.1),
  `BAR_COUNT_SYMMETRY` (even — equal counts on opposing faces), `BAR_COUNT_MATERIAL`
  (concrete only) as errors; `BAR_COUNT_RHO` (§10.6.1.1), `BAR_COUNT_SPACING`
  (§25.2.3 clear spacing along b) and `BAR_COUNT_UNUSED` (a count on a section no
  column carries) as warnings.
- **L6** `selectBarDiameters` drops the pin and searches both axes; the winning
  `{db, bars}` is stored. `designColumnFromPM` and `columnRowSolution` pass
  `numBars: sec.barCount`, so schedule, drawings, take-off, PDF and the worked
  solution all read the same cage.
- Shared sections: the **worst** column governs (ordered on provided steel), the
  same rule `buildUtilMap` uses when sections grow — a stored count no longer
  adapts per member the way the derived one did.
- A count is dropped, never carried, when the thing it was searched against
  changes: `withSizes` on any b×h/shape change (ρ = n·Ab/Ag moves with the
  concrete) and `applyMaterial` when the global Ø changes.

## What it fixed, visible in the browser

Default grid, one click of **Design structure**: the RC column schedule went from
**"2 failed"** — `c1.0.1` and `c1.1.1` at `6⌀20`, **117 %** — to **"all passed"** at
`8⌀20`, **92 %**. The 6-bar cage was the axially-derived one; the P–M gate could
only reject it, never raise it, because there was nowhere to put the answer.

## Left open

- No per-section bar-count input in the Properties panel — the count is adopted by
  the search and shown in the schedule. `applyMaterial` clears it on every run, so
  a hand-set (or imported) count survives only until the next Design/Optimize,
  exactly as a hand-set Ø does.
- Spiral columns: `barCount` is validated against the tied minimum (4). §10.7.3.1's
  6-bar spiral minimum arrives with spiral sections in model space.
