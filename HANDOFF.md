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

## Current state (analysis-core baseline, PR #239)

> Newer work is tracked in the **Tier 4** (A1–E13, PRs through #273),
> **Post-Tier-4** (PRs #275–#278), **Phase 3 + connections** (PRs #279–#308),
> **Connection detailing polish** (PRs #310–#317) and **Audit round**
> (PRs #319–#334) sections below; latest suite: **1028 tests**.
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
- **#277 — validation page (`/validation`).** `engine/validation.ts` benchmarks
  engine output against independent closed-form results (RC beam Mn, cantilever
  deflection/moment via the frame solver, compact W-beam φMp, wind qz, footing
  area). Shown side-by-side with %Δ and enforced by `validation.test.ts`.
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
- **#320 — real CI gate**: `tsc -b` + lint (non-blocking: 28 pre-existing
  eslint errors) + `npm test` gate the Pages deploy; optimizer-test timeout
  headroom; Roadmap truth-up.
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
run feedback, eslint zero-out, xlsx vuln, bundle splitting, ModelSpace split,
ValidationMap transcription, project save/load…)._

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
