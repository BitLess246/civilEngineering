# Validation Map

Evidence ledger for the calculation engine. Every ✅/🔶 row cites the vitest
case(s) that verify it — the whole suite (1063 tests) runs in the GitHub
Actions `ci` job on every PR, and the `engine/validation.ts` benchmark IDs
referenced below are additionally rendered side-by-side (manual vs software vs
%diff) on the live `/validation` page.

**Status legend**
- ✅ verified in CI against the row's stated method (hand calc / closed form / textbook / code table)
- 🔶 verified in CI by an *equivalent* method; the originally-planned external cross-check (ETABS / STAAD / PCA / Excel) is still open
- ⬜ open — needs evidence that cannot be produced from inside this repo (external tool license)

---

# Beam Design

| ID | Case | Method | Status | Evidence |
|----|--------|----------|---------|----------|
| B001 | Singly Reinforced | Hand Calc | ✅ | `beamDesign.test.ts` "SRRB — moderate moment stays singly reinforced"; `validation.ts` `rc-beam-mn` (Mn = As·fy·(d−a/2) vs engine) |
| B002 | Doubly Reinforced | Hand Calc | ✅ | `beamDesign.test.ts` "DRRB — Mu beyond φMn_max designs A′s with the displaced-concrete term" + classification consistency |
| B003 | Minimum Steel | Hand Calc | ✅ | `beamDesign.test.ts` "tiny moment falls back to ρ_min" (was planned as Excel; verified by hand formula instead) |
| B004 | Maximum Steel | Hand Calc | ✅ | `beamDesign.test.ts` "ρ_max,TC = (0.85f′c/fy·β1)(3/8)(dt/d)" + "ρ_b carries the dt/d factor" |
| B005 | Multiple Layers | Hand Calc | ✅ | `beamDesign.test.ts` "adds a second layer when one layer cannot fit the bars, lowering d" (§407.7, Varignon) |
| B006 | Large Bar Diameters | ETABS | 🔶 | bar-fit geometry proven in `beamDesign.test.ts` "maxPerLayer honours s_min = max(db, 25)"; ETABS cross-check open |

---

# Column Design

| ID | Case | Method | Status | Evidence |
|----|--------|----------|---------|----------|
| C001 | Pure Compression | Hand Calc | ✅ | `columnDesign.test.ts` "axial — tied (review Concrete 7, Problem 2)" vs the published answer key; `validation.ts` `column-phipn` |
| C002 | Uniaxial Bending | Hand Calc | ✅ | `columnDesign.test.ts` "interaction — balanced condition (review Concrete 8, Problem 4 keys)": Pb, Mb, eb vs answer key; Po at large c; φ transition 0.65→0.90 |
| C003 | Biaxial Bending | PCA Column | 🔶 | Bresler reciprocal identity `columnDesign.test.ts` "1/Pn = 1/Pnx + 1/Pny − 1/Po"; PCA Column cross-check open |
| C004 | Slender Column | PCA Column | 🔶 | `columnDesign.test.ts` "slenderness — nonsway moment magnification": 34+12(M1/M2) limit, Euler load, δ ≥ 1, M2,min = Pu(15+0.03h), instability flag; PCA cross-check open |
| C005 | Spiral Column | Manual | ✅ | `columnDesign.test.ts` "axial — spiral (review Concrete 7, Problem 3 / key 2,423.70 kN)" + spiral ratio & pitch limits |

---

# Footings

| ID | Case | Method | Status | Evidence |
|----|--------|----------|---------|----------|
| F001 | Centered Footing | Hand Calc | ✅ | `isolatedFooting.test.ts` (sizing, one-way & two-way shear, flexure); `validation.ts` `footing-area` |
| F002 | Eccentric Footing | Hand Calc | ✅ | `eccentricFooting.test.ts` (pressure blocks + worked-solution steps) |
| F003 | Punching Shear | Manual | ✅ | `punchingShear.test.ts` — critical perimeter b0, aspect-ratio & αs branches, all three §22.6.5.2 Vc equations, φVc vs demand |
| F004 | Combined Footing | Textbook | ✅ | `combinedFooting.test.ts` "rectangular (CRF)" + `combinedFootingSolution.test.ts` (printable worked solution) |
| F005 | Trapezoidal Footing | Textbook | ✅ | `combinedFooting.test.ts` "trapezoidal (CTF)" + column-containment checks |

---

# Frame2D

| ID | Case | Method | Status | Evidence |
|----|--------|----------|---------|----------|
| FR001 | Simply Supported Beam | Analytical | ✅ | `frame2d.test.ts` "regression vs the beam solver" (closed-form beam engine as oracle) |
| FR002 | Cantilever Beam | Analytical | ✅ | same oracle; 3D twin also closed-form: `validation.ts` `cantilever-defl` / `-moment` / `-slope` |
| FR003 | Portal Frame | Textbook | ✅ | `frame2d.test.ts` "portal frame"; independently cross-checked 2D↔3D in `frame3d.test.ts` (reactions + Mmax agree to 1e-3) |
| FR004 | Continuous Beam | STAAD | 🔶 | `frame2d.test.ts` "NSCP combinations" + beam-solver regression; STAAD cross-check open |

---

# Frame3D

| ID | Case | Method | Status | Evidence |
|----|--------|----------|---------|----------|
| F3D001 | Cantilever Column | Analytical | ✅ | `frame3d.test.ts` closed forms in both bending planes (δ = PL³/3EI, M = PL, UDL wL⁴/8EI) incl. Timoshenko δ = PL³/3EI + PL/GAs; `validation.ts` rows |
| F3D002 | Space Frame | ETABS | 🔶 | statics self-checks on the full bridge (ΣR = ΣP, fixed-end moments, shared-LU ≡ per-combo solve) in `frame3d.test.ts` / `modelBridge.test.ts`; ETABS cross-check open |
| F3D003 | Multi-Bay Frame | STAAD | 🔶 | planar portal solved by frame3d ≡ frame2d (`frame3d.test.ts`); grid-model equilibrium in `pipeline.test.ts`; STAAD cross-check open |

---

# Modal Analysis

| ID | Case | Method | Status | Evidence |
|----|--------|----------|---------|----------|
| M001 | SDOF | Analytical | ✅ | `modal.test.ts` "SDOF cantilever column — T = 2π√(m/k)" with k from an independent static solve |
| M002 | 2-Story Frame | Textbook | ✅ | `modal.test.ts` "2-storey shear building (Chopra)": eigenvalues k(3∓√5)/2 and ω₂/ω₁ closed form (eigen-solver level; full-frame external check under M003) |
| M003 | 5-Story Frame | ETABS | ⬜ | needs an external-tool model; suite covers period ordering / participation bounds (`modal.test.ts` "generated grid") but no independent 5-storey reference yet |

---

# Response Spectrum

| ID | Case | Method | Status | Evidence |
|----|--------|----------|---------|----------|
| RS001 | SDOF | Manual | ✅ | `responseSpectrum.test.ts` "single mode: CQC = SRSS = Sa·effMass"; spectrum branch anchors (plateau/velocity/floor); `accelSpectrum.test.ts` pseudo-spectral relations |
| RS002 | 3-Story Building | ETABS | ⬜ | RSA machinery verified internally (CQC ≥ SRSS, §208.6.4.2 scaling, storey-shear back-difference identities in `responseSpectrum.test.ts`); ETABS cross-check open |

---

# Engine coverage index

One row per engine area that shipped after this map was first drawn (L9 rule:
the map must not lag the code). "Basis" names the strongest independent anchor
asserted by that file; all run in CI.

| Area | Test file(s) | Basis |
|------|--------------|-------|
| NSCP §208 static seismic | `seismic.test.ts`, `nscpSeismic.test.ts` | every V branch (208-9/10/11) + Ft + w·h distribution vs hand formulas; Method-B caps 1.3/1.4·Ta; accidental-torsion couple statics (ΣΔF = 0, ΣΔF·d = 0.05·L⊥·F); `validation.ts` `seismic-period`/`seismic-base-shear` |
| RSA → design loads | `responseSpectrum.test.ts` | equivalent-load base shear ≡ CQC/SRSS combination (1e-9), single-mode Sa·effMass hand calc, §208.6.4.2 floor scaling |
| Load combinations | `loadCombinations.test.ts`, `pipeline.test.ts` | NSCP 203 factor sets as data; Ev = 0.5·Ca·I·D shifts (1.42D/0.68D) |
| Time history | `timeHistory.test.ts`, `timeHistoryModel.test.ts`, `accelerogram.test.ts` | Newmark SDOF vs analytical free/forced responses; modal superposition |
| Buckling | `buckling.test.ts` | linearized Pcr vs Euler closed forms (cantilever, fixed-fixed) |
| Pushover | `pushover.test.ts`, `pushoverModel.test.ts` | event-to-event capacity curve vs hand-tracked hinge sequence (review-problem anchors) |
| Floor vibration | `floorVibration.test.ts` | AISC DG11 fn = 0.18√(g/Δ) + tolerance thresholds |
| Shells | `shell.test.ts`, `frame3dShell.test.ts`, `shellModel.test.ts` | CST/DKT element checks + frame↔shell model consistency |
| Steel member design | `steelDesign.test.ts`, `aiscSections.test.ts`, `flexure.test.ts`, `shear.test.ts` | §F2/§G2.1/§E3/§H1-1 formula re-derivations; `validation.ts` `steel-phimp`/`steel-phivn` |
| Steel connections | `steelConnections.test.ts`, `boltedConnection.test.ts`, `weldedConnection.test.ts`, `connectionSolution.test.ts`, `baseplate.test.ts` | IC-method bolt/weld groups vs `validation.ts` `bolt-ecc-rmax`/`weld-ecc-fmax`/`bolt-oop-tension`/`prying-t0`; AISC DG1 base plates |
| Effective length K | `effectiveLength.test.ts` | alignment-chart G-factors vs published values (review anchors) |
| Timber (wood) member design | `woodDesign.test.ts` | NDS §3 / NSCP §6 ASD adjustment factors (CD/CM/CF/CV), beam CL (§3.3.3) + column CP (§3.7.1) closed-form anchors, beam-column §3.9.2 interaction; `validation.ts` `wood-cp`/`wood-cl` |
| Plumbing — water supply (RNPCP 2000) | `plumbingFixtures.test.ts`, `waterSupply.test.ts` | Table 6-5/7-2 fixture-unit totals vs Module 2/3/4 worked examples; demand (ΣFU×8), static head, continuity velocity, Hazen-Williams friction; `validation.ts` `plumb-velocity`/`plumb-friction` |
| Plumbing — drainage/DWV (RNPCP 2000) | `drainage.test.ts` | Table 7-5 drain/vent sizing + max lengths vs Module 3 examples (14 DFU→76/51 mm, 39 DFU→102/65 mm); vent ≥ max(32, drain/2); §1206 slope; `validation.ts` `plumb-drain` |
| SCWB | `scwb.test.ts` | ΣMnc/ΣMnb ≥ 6/5 (§418.7.3.2) with hand Mn |
| Slabs | `slabDDM.test.ts`, `woodArmer.test.ts`, `slabDeflection.test.ts` | DDM coefficient tables; Wood–Armer moment transformation identities |
| RC misc | `devLength.test.ts`, `torsionDesign.test.ts`, `beamDeflection.test.ts`, `shearWallDesign.test.ts` | §425.4 ld, §422.7 threshold/cracking torsion, Branson Ie, wall shear |
| Standalone calculators | `retainingWall.test.ts`, `stair.test.ts`, `waterTank.test.ts`, `pileCap.test.ts`, `rectangularFooting.test.ts`, `flexibleCombinedFooting.test.ts` | textbook worked examples per the L7 pattern (each page prints the step-by-step) |
| Geotech | `geotech.test.ts`, `bearing.test.ts`, `soilNail.test.ts`, `micropile.test.ts`, `shotcreteFacing.test.ts`, `rockAnchor.test.ts` | Rankine/Terzaghi–Meyerhof factors vs published tables; FHWA GEC-7 / NHI-05-039 procedures (review anchors) |
| Wind | `wind.test.ts` | §207B qz vs hand calc (`validation.ts` `wind-qz`) |
| Loads & tributary | `loads.test.ts`, `deadLoads.test.ts`, `liveLoads.test.ts`, `tributary.test.ts`, `thermalLoad.test.ts` | NSCP 204/205 table lookups; tributary-area statics; EA·α·ΔT |
| Model / bridge / mesh | `modelBridge.test.ts`, `meshValidation.test.ts`, `modelBuilder.test.ts`, `rigidEndZones.test.ts`, `diaphragm.test.ts` | section-property hand calcs (incl. Timoshenko shear areas), constraint kinematics, validation rules |
| Design pipeline | `pipeline.test.ts`, `beamSections.test.ts`, `barSelectionAndGamma.test.ts` | envelope semantics, optimizer termination, bar-continuity guards |
| Trusses | `truss.test.ts`, `trussDesign.test.ts`, `trussTakeoff.test.ts` | method-of-joints statics vs solver |
| Quantities | `takeoff.test.ts`, `quantities.test.ts` | hand-computed BOM quantities |
| Numerics | `fem.test.ts`, `math.test.ts`, `modal.test.ts` (Jacobi) | LU round-trips; eigen closed forms (`validation.ts` `eigen-jacobi`) |

---

# Open items (need resources outside this repo)

| ID | What | Blocker |
|----|------|---------|
| X001 | ETABS space-frame cross-check (F3D002, RS002, M003, B006) | needs an ETABS license + exported reference results checked into `docs/benchmarks/` |
| X002 | STAAD continuous-beam / multi-bay cross-check (FR004, F3D003) | needs STAAD reference output |
| X003 | PCA Column biaxial + slender cross-check (C003, C004) | needs spColumn reference curves |
| X004 | Excel verification sheets (Roadmap Phase-2 goal) | authoring task — the `/validation` page already renders manual-vs-software tables that can seed them |
| T-beam flexure (`tbeam.ts`) | §6.3.2 bf table + two-couple T flexure vs hand calc (Asf 1290 mm², rect/true-T switch, εt/φ) | ✅ `tbeam.test.ts` (14) |
| Prestressed beam (`prestressedBeam.ts`) | PCI losses, §24.5 stress limits, fps §20.3.2.3.1, 1.2Mcr, Vci/Vcw vs hand calc | ✅ `prestressedBeam.test.ts` (12) |
