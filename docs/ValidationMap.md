# Validation Map

Evidence ledger for the calculation engine. Every ✅/🔶 row cites the vitest
case(s) that verify it — the whole suite (1063 tests) runs in the GitHub
Actions `ci` job on every PR, and the `engine/validation.ts` benchmark IDs
referenced below are additionally rendered side-by-side (manual vs software vs
%diff) on the live `/validation` page.

That page also carries a **Solver engine coverage** section: the full inventory
of the 426 vitest cases across 28 modules that exercise a *solver* — the
model→solver bridge, the FEM solvers, dynamics and stability, and the nonlinear
path followers. It is generated from the test sources by
`npm run gen:coverage`, and `solverCoverage.test.ts` fails if it goes stale, so
the published coverage cannot drift from the suite. It records which cases
exist; CI running the whole suite on every PR is what establishes that they
pass.

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
| Structural irregularities | `irregularity.test.ts` | NSCP Table 208-9/10 thresholds as hand calcs — P1 torsional δmax/δavg (1.2/1.4), V1 soft-storey (0.7/0.6 of above, 0.8/0.7 of avg-3), V2 mass (1.5), V3 vertical-geometric (1.3); real bridge+solver integration (symmetric grid ⇒ regular); `validation.ts` `torsional-irregularity` |
| Load combinations | `loadCombinations.test.ts`, `pipeline.test.ts` | NSCP 203 factor sets as data; Ev = 0.5·Ca·I·D shifts (1.42D/0.68D) |
| Time history | `timeHistory.test.ts`, `timeHistoryModel.test.ts`, `accelerogram.test.ts` | Newmark SDOF vs analytical free/forced responses; modal superposition |
| 3D model → equivalent plane frame | `nonlinearFrameModel.test.ts` | condenses a building by COMBINING all frame lines parallel to the loading direction (perpendicular coordinate collapses; transverse members dropped; EI/EA and Mp summed). **Reproduces the FULL 3D modal T₁ within 10%** for 1-/2-/3-storey frames (measured 0.937–0.969) — independently agreeing with the shear-building reduction's own condensation; total seismic mass preserved exactly; adding a parallel frame line scales stiffness AND capacity by 3/2 as expected; the same condensed frame drives both the static pushover and the hinge time history |
| Nonlinear frame DYNAMICS (hinges) | `nonlinearFrameDynamic.test.ts` | Newmark-β + Newton-Raphson over the frame DOFs sharing `assembleFrame` with the static driver: with Mp = ∞ it reproduces `newmarkDirect` on the same K/M/C to 1e-9 and converges in one iteration; a hinge DOF is added per hinged member end; weak record stays elastic; yielding cuts base shear below the elastic demand and caps every hinge moment; plastic-rotation demand grows as Mp falls (energy deliberately NOT asserted — non-monotonic in Mp, same as nonlinearTimeHistory) |
| Displacement control (post-peak) | `nonlinearFrame.test.ts` | prescribes the control displacement and SOLVES for λ (δd = δd_R + δλ·δd_P, constraint fixes δλ), so the capacity curve can descend past its peak: hits the prescribed displacement every step, matches the elastic closed form to 1e-3, HOLDS the collapse load flat at Mp/L = 33.34 over a 6× drift range where load control instead runs displacement to >10 m, and traces a monotonically DESCENDING branch when the hinge softens (b < 0) — which load control structurally cannot produce |
| Arc-length (Riks/Crisfield) path following | `arcLength.test.ts` | prescribes the step LENGTH in (d, λ) space and solves for both, passing the load limit point on the sign of det(Kt) rather than on a guess. Elastic path exact (λ = |δ|·3EI/L³ to 1e-9); ‖Δd‖ = Δl verified per step; halving Δl doubles the step count with both endpoints still on the exact line; **peak λ = Mp/L to 4e-14 %** for a perfectly plastic hinge (`validation.ts` `arc-length-collapse`) where load control can only bracket it; collapse load held flat within 5% over a 2× drift range; monotonically descending branch for b < 0; **coincides with displacement control point-by-point to 1e-3 relative** (the residual is the reference's own interpolation across the knee); yield-event step trimming and arc cutting exercised. Snap-back: a real reversal (λ and \|δ\| falling together) is traced for \|b\| > 3, but see the module scope note — it is arc-size dependent and NOT robust |
| Smooth hinge backbone (C^∞) | `smoothHinge.test.ts` | f = b·k0·u + Fp·tanh(kp·u/Fp) — the bilinear law's two asymptotes with the corner rounded. Verified: slope k0 at the origin, post-yield asymptote to 1e-12, matches `bilinearProbe`'s virgin backbone to 1e-6 away from the knee, the elastic softness vanishes as the tanh series x²/3 (100× drop per 10× smaller u, leading coefficient checked), reported tangent IS df/du by central difference through the knee, tangent continuous where the bilinear one jumps the FULL k0→b·k0 swing in a single sample, tangent bounded by the two asymptote slopes, softening hinge passes smoothly through zero tangent; nonlinear-elastic character pinned (odd function, zero net work round a full cycle, no permanent set) |
| Robust snap-back (smooth material) | `arcLength.test.ts` | `material: 'smooth'` + residual convergence + backtracking line search + knee-resolving step control: **hundreds of sustained snap-back reversals** for \|b\| > 3 (vs 3 at best on the bilinear material) with no step failure, and the traced path is **independent of the arc length** — peak λ and peak δ agree across a 4× change in Δl for b = −4/−6/−12. Mild softening still gives a monotone descending branch and no false snap-back. A perfectly plastic hinge reaches the EXACT collapse load on both materials (`validation.ts` `arc-length-smooth-collapse`); only where the peak sits at the knee (softening) does rounding shave it, always low, <1% |
| P–M interaction on hinge capacity | `nonlinearFrame.test.ts`, `nonlinearFrameModel.test.ts` | hinge yield moment reduced to Mpc(P) via `reducedPlasticMoment`, with P recovered from the member's current axial state each iteration: a portal frame yields EARLIER with P–M than without (λ 108.3 vs 112.3 — the unconservative case it fixes), column capacities drop below Mp while the beam (no P–M data) keeps its own, the two columns recover equal-and-opposite axial forces, a smaller Pcap yields earlier still, and the bridge supplies Pcap + a material-appropriate surface automatically, summing capacity across combined parallel frames |
| Distributed member-end plastic hinges | `nonlinearFrame.test.ts` | concentrated plasticity with the hinge rotation as an explicit DOF (node θ —[spring]— θb ═ beam), so state determination is exact. Elastic limit reproduces δ=PL³/3EI to 1e-12 and a rigid unyielded hinge changes it by <0.1%; **rigid-plastic collapse loads recovered**: cantilever P=Mp/L and fixed–fixed central load P=8Mp/L (`validation.ts` `plastic-collapse-fixed-beam`, bisected so it is not step-size limited); cyclic response leaves a permanent set, dissipates energy, and yields in BOTH directions — which the event-to-event pushover hinge (a permanent release) cannot represent |
| Nonlinear TH — frame reduction | `nonlinearModel.test.ts` | the equivalent shear building reduced from a 3D frame reproduces the FULL modal T₁ within 10% for 1-/2-/3-storey frames (0.937–0.973 of modal); storey stiffness (secant V/Δ, same definition as the soft-storey irregularity check) decreases with height; capacity Σ2Mp/h scales inversely with storey height; elastic reference run never yields, strong record yields and dissipates, yielding caps base force below the elastic demand |
| Nonlinear TH (hysteretic) | `nonlinearTimeHistory.test.ts` | Newmark + Newton-Raphson on hysteretic springs reduces EXACTLY to `newmarkDirect` when nothing yields (1e-9, 2-DOF) and converges in one iteration there; bilinear kinematic-hardening material — yields at Fy, post-yield slope b·k₀, **elastic unloading at k₀** and reverse yielding (what the event-to-event pushover hinge cannot represent); loop energy 4·Fy·(A−u_y); base force capped at Fy; ductility demand monotone in Fy; `validation.ts` `hysteretic-loop-energy` |
| Direct-integration TH (Rayleigh) | `directTimeHistory.test.ts` | full-MDOF Newmark ≡ mode-by-mode superposition to 1e-9 on a 2-DOF shear building (Rayleigh C is diagonalized by the modes, so the two paths are algebraically identical); 1-DOF ≡ `newmarkSDOF` to 1e-10; free-vibration log decrement exp(−2πζ/√(1−ζ²)); Rayleigh α/β inversion hits both target ζ exactly, sags between anchors; `validation.ts` `direct-th-decay` |
| Tension/compression-only members | `axialOnly.test.ts` | active-set iteration on a cross-braced bay: exactly one diagonal deactivates, the survivor is in tension (compression for comp-only struts), load reversal swaps WHICH diagonal is active, the braced bay is stiffer than the unbraced one, re-activation prevents latch-off, converges in ≤5 iterations, equilibrium ΣR=ΣF still holds after a member drops; the converged solve is BIT-IDENTICAL to a separate model with the slack diagonal deleted (`validation.ts` `brace-active-set`, 1.7769 mm both ways); `meshValidation` rejects an axial release on a limited member and warns on nodes held only by limited members |
| Per-combo active set (NSCP combos) | `axialOnly.test.ts` | `analyzeActiveSet` reproduces `analyzeFrame3D` combo-for-combo when no member is limited (govIdx, names and Mmax to 1e-9) and reports one converged active set per combination otherwise; the gravity combo and the seismic combos settle on DIFFERENT sets, proving the shared-LU sweep would be invalid; superposition is explicitly shown to fail (D-only + E-only ≠ the combined solve, because the parts settle on different sets); every combo satisfies ΣR + ΣF = 0 on its own set |
| Dashed-overlay geometry (viewport) | `dashPattern.test.ts` | `dashSpans` splits a member into an ODD cell count so a dash lands at each end, is symmetric about mid-span, honours the fill fraction (gaps really exist), floors to `minCells` on short members and tracks the requested pitch on long ones, and keeps every dash inside the member — the 3D overlay's only non-trivial maths, tested as a pure module because the WebGL canvas cannot be screenshot-verified |
| Buckling | `buckling.test.ts` | linearized Pcr vs Euler closed forms (cantilever, fixed-fixed) |
| Pushover | `pushover.test.ts`, `pushoverModel.test.ts` | event-to-event capacity curve vs hand-tracked hinge sequence (review-problem anchors) |
| Floor vibration | `floorVibration.test.ts` | AISC DG11 fn = 0.18√(g/Δ) + tolerance thresholds |
| Shells | `shell.test.ts`, `frame3dShell.test.ts`, `shellModel.test.ts` | CST/DKT element checks + frame↔shell model consistency |
| Steel member design | `steelDesign.test.ts`, `aiscSections.test.ts`, `flexure.test.ts`, `shear.test.ts` | §F2/§G2.1/§E3/§H1-1 formula re-derivations; `validation.ts` `steel-phimp`/`steel-phivn` |
| Steel connections | `steelConnections.test.ts`, `boltedConnection.test.ts`, `weldedConnection.test.ts`, `connectionSolution.test.ts`, `baseplate.test.ts` | IC-method bolt/weld groups vs `validation.ts` `bolt-ecc-rmax`/`weld-ecc-fmax`/`bolt-oop-tension`/`prying-t0`; AISC DG1 base plates |
| Effective length K | `effectiveLength.test.ts` | alignment-chart G-factors vs published values (review anchors) |
| Timber (wood) member design | `woodDesign.test.ts` | NDS §3 / NSCP §6 ASD adjustment factors (CD/CM/CF/CV), beam CL (§3.3.3) + column CP (§3.7.1) closed-form anchors, beam-column §3.9.2 interaction; `validation.ts` `wood-cp`/`wood-cl` |
| Timber wood slab (deck + joists) | `woodSlab.test.ts` | NDS §3 / NSCP §6 ASD deck-on-joist floor: simple/continuous UDL coefficients (wL²/8, wL²/10), f_b = M/S, service deflection 5wL⁴/384EI (L/360 live, L/240 total), repetitive-member Cr, board-feet take-off, bamboo-slat option; `validation.ts` `wood-slab-joist` |
| Slope stability (method of slices) | `slopeStability.test.ts` | Fellenius FS vs a documented 3-slice hand calc (FS = 2.102); Bishop ≥ Fellenius; Janbu f0 > 1; circle-slice geometry (chord width, symmetric α); critical-circle search FS sanity + steeper-slope monotonicity; `validation.ts` `slope-slices-fellenius` |
| Plumbing — water supply (RNPCP 2000) | `plumbingFixtures.test.ts`, `waterSupply.test.ts` | Table 6-5/7-2 fixture-unit totals vs Module 2/3/4 worked examples; demand (ΣFU×8), static head, continuity velocity, Hazen-Williams friction; `validation.ts` `plumb-velocity`/`plumb-friction` |
| Plumbing — drainage/DWV (RNPCP 2000) | `drainage.test.ts` | Table 7-5 drain/vent sizing + max lengths vs Module 3 examples (14 DFU→76/51 mm, 39 DFU→102/65 mm); vent ≥ max(32, drain/2); §1206 slope; `validation.ts` `plumb-drain` |
| Plumbing — septic tank/OSST (RNPCP 2000) | `septicTank.test.ts` | Table B-2 capacity by DFU (+94.6 L/FU over 100); Appendix B two-chamber layout (2/3·1/3, freeboard, depth 0.6–1.8 m) vs Module 4 example (78 DFU→11,355 L→2.0×4.8×1.5 m); `validation.ts` `plumb-septic` |
| SCWB | `scwb.test.ts` | ΣMnc/ΣMnb ≥ 6/5 (§418.7.3.2) with hand Mn |
| Slabs | `slabDDM.test.ts`, `woodArmer.test.ts`, `slabDeflection.test.ts` | DDM coefficient tables; Wood–Armer moment transformation identities |
| RC misc | `devLength.test.ts`, `torsionDesign.test.ts`, `beamDeflection.test.ts`, `shearWallDesign.test.ts` | §425.4 ld, §422.7 threshold/cracking torsion, Branson Ie, wall shear |
| Cracked service deflection in model space | `memberDeflection.test.ts`, `pipeline.test.ts` | §424.2 by DOUBLE-INTEGRATING the member's own FEM moment diagram (piecewise-linear curvature integrated in closed form), so the load pattern and end restraint come from the model, not a tabulated coefficient. Anchors: SS UDL 5wL⁴/384EI, fixed–fixed wL⁴/384EI, SS central point load PL³/48EI and cantilever tip PL³/3EI both **exact** (linear M), cantilever UDL wL⁴/8EI, O(Δx²) convergence demonstrated by a 4× error drop per halving; against a real `frame3d` run the integration reproduces the SOLVER's own nodal deflection (fixed–fixed PL³/192EI to 1e-6) and resolves the propped-cantilever peak the nodes miss (wL⁴/185EI at 0.5785L, within 1%). Branson Ie bracketed by Ig/Icr, λΔ = ξ/(1+50ρ′) relieved by A′s, `validation.ts` `beam-defl-integration` |
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
