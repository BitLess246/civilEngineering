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

## Current state (all merged to `main`, through PR #239)

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
  ⚠️ **Sign fix pending PR** (branch `claude/next-phase-jsoxhl`): reported spring
  reaction was `+k·d` (wrong); correct restoring force is `−k·d`. Structural
  solution is unaffected — display-only bug. Merge that PR to close it.
- **Rigid floor diaphragm** (PR #231): per-storey master-slave constraint elimination
  (T-matrix) tying in-plane `{ux, uz, θy}` with full rigid-body kinematics (arm
  effect). `engine/diaphragm.ts` groups nodes by storey; opt-in checkbox in Analysis.
- **Modal analysis** (`engine/modal.ts`): Jacobi eigensolver, lumped seismic mass,
  effective modal-mass participation per direction with the NSCP 208.5.5 ≥90% check.
  **Mode-shape visualization** (PR #230): click a mode row → animated deformed
  skeleton in the 3D canvas (amplitude slider), via imperative R3F `useFrame`.
- **Response-spectrum analysis** (`engine/responseSpectrum.ts`) + **storey-drift
  check** (`engine/seismic.ts`, NSCP 208) + **wind loads** (`engine/wind.ts`).
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

## Tier 4 — Next phase (post STAAD-parity)

The STAAD-parity roadmap is complete. This tier adds polish, completeness, and new
capability across the four main engineering domains.

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

_Tests at last handoff: **718 passing**; `tsc -b` clean; production build OK._
