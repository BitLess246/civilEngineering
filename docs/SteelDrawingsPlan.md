# Structural steel drawings — the plan

Every drawing this app produces is reinforced concrete. A steel frame is
modelled, analysed, designed and scheduled end to end, and then the drawing set
has nothing to say about it. This file is the plan for closing that, phase by
phase, one PR each, in the order the phases actually unblock one another.

Read `CLAUDE.md` first for the standing rules. Nothing here overrides them.

---

## 1. Where steel already is — verified against the code, not remembered

**Modelled.** `RectSection.material = 'steel'` with `shape` (an AISC name),
`steelFy` / `steelFu`; `aiscSections.shapeByName` resolves the real section
properties and `b`/`h` degrade to a bounding box. `meshValidation` knows a steel
section has no cage.

**Analysed.** `modelBridge.steelSectionProps` feeds the solver, and `modal`,
`nonlinearFrameModel` and `biaxialFrameModel` each branch on the material — so
E = 200 000 MPa and the shape's own A/I/J reach every analysis.

**Designed.** `steelDesign` (§F2 LTB with the Lp/Lr zones, §G2.1 shear, §E3
flexural buckling, §H1-1 interaction, §J4.3 block shear, §J3.9 prying),
`steelConnections` (shear tab, moment flange weld, moment web plate),
`baseplate` (§J8 / Design Guide 1), `scwb`, and the truss engines. The pipeline
carries `steelBeams`, `steelColumns`, `basePlates`, `joints` and `beamJoints`
as first-class schedules, and `designOK` will not pass if any of them fails.

**Reported.** `modelReport` prints the steel beam, steel column and base-plate
tables and their worked solutions; `modelSchedule` bills the tonnage.

**Drawn — nothing.** Every module that emits `PlanPrimitive`s is concrete:
`planRenderer` (framing and foundation plans), `frameElevation`, `columnSection`,
`cageSection`, `memberSection`, `sectionDetail`, `columnStackDetail`,
`footingDetail`, `slabOpening`, `wallDetail`, `beamColumnJoint`, `generalNotes`.
`buildPlan` has no material branch at all, so a steel framing plan prints
concrete beam marks and never names a shape.

The two exceptions prove the point rather than soften it:
`components/ConnectionDetail2D.tsx` and `components/JointConnections3D.tsx` draw
designed steel connections — as bespoke React SVG and three.js inside
`ModelSpace`, outside `PlanPrimitive` and outside `buildSheetSet`. So they
cannot reach the Plans tab, cannot reach the PDF, and are a second description
of geometry the sheet set does not have. That is the same defect the RC work has
spent the last dozen PRs removing (`BeamRebarElevation`, `ColumnElevation`,
`buildColumnDetail`, `tiePositions` — all deleted once the sheet set could draw
the thing properly).

**So: the gap is not the engineering. It is that a steel frame designs cleanly
and prints no steel drawing.**

---

## 2. Rules the steel drawings inherit

These are not new; they are what the RC drawings were corrected into, and every
phase below is bound by them.

1. **One pipeline.** A drawing is a `Drawing` of `PlanPrimitive`s from a pure,
   typed engine module with a matching `*.test.ts`, reaching the user only
   through `buildSheetSet`. The Plans tab and the PDF then cannot disagree,
   because there is one list.
2. **Drawn from the designed row, never re-derived.** The tab on the sheet is
   the `BeamConnection` the schedule checked; the outline is `aiscSections`'
   shape. A drawing that recomputes what a schedule already decided is how the
   two come to disagree — the defect `cageSection` exists to end.
3. **One sheet per thing.** Per connection, per column line, per base plate.
   Steel differs from concrete in one honest way: a connection TYPE really is
   typical, and detailers really do issue typical connection details — so a
   type may be drawn once, but it must carry a MARK and every member end must
   be scheduled to a mark. "Typical" without a schedule that says which end is
   which is the thing being removed, not typicality itself.
4. **Cite the clause** (AISC 360 / NSCP §5) in the code, and keep the units:
   geometry m, sections mm, forces kN, stress MPa, stated at module boundaries.
5. **`docs/ValidationMap.md` gets its row in the same PR**, with the evidence.

---

## 3. The phases

### S1 — Material-aware plans, and a structural steel notes sheet
*Layers 9 (drawings) + 6 (reads the schedules).*

- `buildPlan` branches on the section material: a steel member is annotated with
  its SHAPE along the member (`W310x38.7`) and its mark, a steel column bubble
  carries the shape, and the plan legend says which material each line weight is.
- `generalNotes` grows a **STRUCTURAL STEEL** sheet beside the concrete one:
  material specs (A36 / A992 / A572), bolts (A325/A490, snug vs pretensioned,
  faying class), welds (E70XX, AWS D1.1, prequalified joints), base plates,
  grout and anchor rods (F1554), camber, shop vs field work, surface treatment,
  erection tolerances (AISC 303).
- Sheets appear from the MODEL: steel notes only when a steel section exists, and
  a mixed frame gets both note sheets. This is what makes the whole plan
  incremental — an RC job's sheet set is unchanged at every phase.

*Tests:* every steel member's shape name appears on its framing plan; an
all-concrete model gains no steel sheet; a mixed model gets both.

### S2 — The steel section detail, and the member schedules
*Layer 9, and it unblocks S3–S5.*

- `steelSection.ts`: the drawn cross-section of a shape from `aiscSections` — W,
  HSS, channel, angle — with d, bf, tf, tw dimensioned and the axes labelled.
  This is the steel analogue of `memberSection`, and every later sheet's member
  outline comes from it. `figures.tsx`'s hand-drawn `WShapeSection` is then
  deleted in the same PR: one description of a W-shape, not two.
- Beam and column schedule sheets carrying what a fabricator reads: mark, shape,
  length, end reactions, camber, connection mark each end.

*Open decision this phase must settle:* **camber is computed nowhere.** Either
derive it from the D-only deflection (the steel analogue of `memberDeflection`)
or leave the column explicitly blank. Do not print a number nothing computed.

### S3 — Steel framing elevations
*Layer 9, consumes S2.*

The steel analogue of `frameElevation`: one elevation per frame line, shapes
drawn to scale, top-of-steel elevations, end connection marks, and column
splices. Its end marks ARE S4's sheet marks — the beam elevation and the
connection sheet must name the same connection or the set is unbuildable.

*Open decision:* **nothing places a steel column splice** (convention: ~1.2 m
above finished floor, and the splice detail differs for bearing vs full
penetration). Settle it before this phase dimensions one.

### S4 — Connection details in the sheet set, and a connection schedule
*Layers 7 + 9.*

- Lift `ConnectionDetail2D`'s geometry into a pure `steelConnectionDetail.ts`
  emitting `PlanPrimitive`s, and have the React component render THAT. One
  description; the component keeps working, and the Plans tab and the PDF gain
  the drawing they have never had.
- A sheet per connection type — shear tab, moment flange-welded, moment
  web-plate — carrying bolt gauge, pitch and edge distances, weld sizes and
  lengths in AWS symbols, cope dimensions, and the §J4.3 block shear / §J3.9
  prying results as design notes.
- A **connection schedule** sheet mapping every beam end to its mark. This is
  what makes rule 3 above true rather than a slogan.

### S5 — Base plates and the anchor rod plan
*Layers 7 + 9.*

- `basePlateDetail.ts`: plan and elevation, B × N × t, the anchor rod pattern
  with grade and projection, embedment and washer plates, grout, and a shear lug
  where the design needs one, with the §J8 / DG1 numbers as design notes.
- An **anchor rod setting plan** — rods dimensioned off the same grid the
  framing plans use (`modelGrid`), because that is the drawing the concrete is
  actually poured from, and getting it from the same helper is what stops the
  steel and concrete sets disagreeing about where column A1 is.

### S6 — Bracing, trusses, secondary steel
*Layers 6 + 9 — this one needs DESIGN work first.*

`MemberRole` already admits `'brace'` and **nothing in the pipeline designs
one**: the member loop branches on `beam`/`girder` and on `column`, and a brace
matches neither — so it is not checked, and it does not even reach `unchecked`,
which is the list that exists precisely so a skipped member cannot read as OK.
That is a live gap in the DESIGN, not just in the drawings, and it should be
fixed on its own before S6 draws anything: §D2 tension, §E3 compression, and the
brace connection. Then braced-bay elevations with work points, truss elevations
off the existing truss engine with panel-point forces, and purlins and girts
only if the model gains them.

### S7 — Steel take-off
*Layer 9.*

`modelSchedule` already totals tonnage; this is the itemised shipping list —
mark, shape, length, weight each and total, plus bolt and weld quantities read
off the connection rows, in `takeoff`/`quantities` beside the RC bill.

---

## 4. What is deliberately NOT in this plan

- **Composite deck and shear studs.** A steel floor plan normally carries stud
  counts per beam, and the model has no deck: no metal deck profile, no stud, no
  composite section. Drawing studs would mean inventing them. This waits for the
  model, and it is the largest single omission in the list — say so rather than
  drawing an approximation.
- **Fabrication (shop) drawings.** Piece drawings with hole-by-hole dimensions
  are a different document from design drawings and are not what this app makes.
- **Fire protection.** A note on the general notes sheet, not a drawing.

---

## 5. Order, and why

S1 is first because it is the only phase that changes what an existing steel
model already prints, and it is small. S2 is next because every later sheet
needs a shape outline, and it deletes a duplicate on the way in. S3 and S4 are
paired by their marks and should land in that order. S5 stands alone and could
be pulled forward if base plates matter more than elevations to whoever is
asking. S6 is the only phase gated on engineering that does not exist yet, and
S7 needs everything else to have marks before it can list them.
