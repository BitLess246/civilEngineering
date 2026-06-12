# Roadmap — 3D Model Space (frames + plates → analyze → design the load path)

**Goal.** A 3D modelling environment where you draw frames (beams + columns) and plates
(slabs + walls), apply loads, run the analysis step by step, and design every section
following the load path — slab → beam → girder → column → footing — **reusing the
engines and pages already built**, not rewriting them.

---

## What we already have (the reuse inventory)

| Existing asset | Where | Role in the 3D app |
|---|---|---|
| Euler–Bernoulli FEM (Hermite, Gauss-5, springs, eq. correction) | `engine/beamAnalysis.ts` | Kernel to generalise: 2-DOF/node beam → 6-DOF/node 3D frame element |
| NSCP 2015 load combinations + categorised loads | `engine/beamAnalysis.ts` | Reused as-is at the model level (combos run on the whole structure) |
| Critical-section auto-detect (supports Case A/B, V=0 extrema) | `engine/beamSections.ts` | Reused per member after the frame analysis |
| RC beam design (SRRB/DRRB, layers/Varignon, hooks) | `engine/beamDesign.ts` | Designs every beam/girder section from member force diagrams |
| Three-moment cross-check | `engine/beamAnalysis.ts` | Verification panel for continuous beam lines extracted from the model |
| Foundation engines (square/rect/eccentric, methods, columns) | `engine/isolatedFooting.ts` etc. | Column base reactions → footing design (P + M → eccentric path) |
| Combined footing (rigid + Winkler FEM) | `engine/combinedFooting.ts`, `flexibleCombinedFooting.ts` | Close column pairs at the base |
| Pile cap (biaxial reactions) | `engine/pileCap.ts` | Alternative foundation for large reactions |
| Quantity engines | `engine/quantities.ts` | Bill of materials straight from the designed model |
| Worked-solution framework | `lib/solution.ts`, `WorkedSolution` | The "analyze step by step" narrative, per load-path stage |
| Diagram / schematic components, dims | `components/` | Member-level results inside the 3D app's inspector |
| Handoff pattern (sessionStorage + query param) | BeamAnalysis → BeamDesign | Model → existing design pages, member by member |
| Excel batch import | `lib/foundationExcel.ts` | Pattern for importing/exporting model tables |

**Missing engines (the only genuinely new calculation work):**
1. **Column design** — axial + uniaxial/biaxial moment (P–M interaction, ties/spirals,
   slenderness). Needed before any frame can be "designed down".
2. **Frame element** — extend the beam FEM: 2D frame (axial + bending, 3 DOF/node),
   then 3D (12-DOF element with torsion + biaxial bending; St-Venant J for torsion).
3. **Plate behaviour** — *not* full shell FEM at first. Slabs via NSCP coefficient /
   tributary-area method (one-way & two-way) that converts area loads into line loads
   on the supporting beams — this is exactly the "load path" step. Walls as in-plane
   panels (pier model) later.
4. **Two-way slab design** — flexure per strip reuses `flexuralSteel`; new wrapper only.

---

## Phase plan (each phase = 1–3 PR-sized milestones, app stays shippable throughout)

### Phase 1 — Structural model schema + column design engine
- `engine/model.ts`: typed schema — `Node {id, x,y,z}`, `Member {id, i, j, role:
  beam|girder|column, section, material}`, `Plate {id, corners, role: slab|wall,
  thickness}`, `Load {target, category, kind}`, `SectionLib`, `Storey`.
  Pure data, JSON-serialisable (save/load, undo, Excel round-trip later).
- `engine/columnDesign.ts`: tied/spiral RC column — axial capacity, P–M interaction
  (strain-compatibility fiber sweep reusing `beta1`/`rhoMin` style helpers), moment
  magnification for slenderness. Worked solution + page `/column-design`
  (same pattern as BeamDesign — this also fills the legacy `columnDesign.html` gap).

### Phase 2 — 2D frame analysis (the kernel generalisation)
- `engine/frame2d.ts`: 6-DOF (3/node) frame element = current Hermite bending matrix
  ⊕ axial bar term, rotated by member orientation; assembly/BC/solve code lifts almost
  verbatim from `beamAnalysis.ts` (extract the shared linear-algebra + assembly into
  `engine/fem.ts` first).
- Validate against the existing beam solver (a horizontal frame member with the same
  supports must reproduce `solveFEM` exactly — regression tests) and portal-frame
  closed forms.
- Page `/frame` (2D): node/member editor on an SVG canvas, supports, member loads,
  combos table, per-member V/M/N diagrams via the existing `Diagram`.

### Phase 3 — Load path: plates → members (tributary engine)
- `engine/tributary.ts`: slab panels distribute area loads to edge beams — one-way
  (ℓ₂/ℓ₁ ≥ 2) as UDL on the long edges, two-way as trapezoid/triangle line loads
  (exactly the `vdl` loads the beam FEM already accepts — zero new load machinery).
- Wall self-weight → line loads on supporting members; storey dead/live presets.
- "Load path" report: a `WorkedSolution` narrative — panel → kN/m on each beam,
  with the NSCP categories preserved so combos still work downstream.

### Phase 4 — 3D model space (UI)
- `react-three-fiber` + `drei` (the only new dependency of consequence) for the
  viewport: grid + storey levels, snap-to-node drawing of members, extruded plates,
  load glyphs, selection + inspector panel.
- The inspector reuses existing components wholesale: member → `Diagram` (N/V/M),
  section → `BeamSchematic`, footing → `FootingSchematic`.
- Analysis in a web worker (the dense solver is already pure — it moves as-is).
- Model persistence: JSON file download/upload + sessionStorage autosave.

### Phase 5 — 3D frame analysis
- `engine/frame3d.ts`: 12-DOF space-frame element (biaxial Hermite + axial + torsion),
  member-local → global transformation. Same assembly core from `fem.ts`.
- Rigid (or beam-strip) diaphragm option per storey so slabs tie the frame.
- Verification: 2D results must be reproduced by planar 3D models; textbook grids.

### Phase 6 — Design the load path (the payoff)
- Pipeline runner: for the governing combo —
  1. slabs (strip design via `flexuralSteel`),
  2. every beam/girder: `detectCriticalSections` → `designBeam` (multi-section),
  3. every column: end forces → `columnDesign` (P–M),
  4. column bases: reactions → footing selector — isolated (`P`, `P+M` eccentric),
     **combined** when two columns are close (engine already decides geometry), or
     **pile cap** when q_allow is exceeded;
  5. quantities roll-up via `quantities.ts` → bill of materials.
- Each stage emits its existing worked solution; the runner stitches them into one
  "structure report" (print/PDF already works via `ReportControls`).
- Per-member handoff buttons to the existing standalone pages (the proven
  sessionStorage pattern) so anything can be inspected/overridden manually.

### Phase 7 — Polish & parity
- Wall pier design, slab deflection checks, drift checks, seismic static lateral
  load generator (NSCP 208), model Excel import/export, retire remaining legacy pages.

---

## Architecture rules (so the reuse actually holds)

1. **Engines stay pure & typed** — no React imports; every new engine ships with
   closed-form tests like `beamAnalysis.test.ts`.
2. **One FEM core** — extract `fem.ts` (solveLinear, assembly helpers, Gauss) in
   Phase 2; beam, frame2d, frame3d, and the Winkler footing all consume it.
3. **Loads keep NSCP categories end-to-end** — combos are applied once, at the model
   level; everything downstream consumes factored member forces.
4. **Design pages remain standalone** — the 3D app *drives* them through the data
   schema + handoffs; they keep working independently (the incremental-coexistence
   strategy that worked for the legacy migration, applied again).
5. **Every stage explains itself** — `SolutionStep[]` is the lingua franca; the 3D
   runner only concatenates narratives the engines already produce.

## Suggested order of attack

Phase 1 (column engine is needed regardless) → Phase 2 (kernel generalisation while
the FEM code is fresh) → Phase 3 (tributary; quick win, makes even the 2D frame
useful for real buildings) → Phase 4/5 (the 3D space) → Phase 6 (pipeline) → Phase 7.
