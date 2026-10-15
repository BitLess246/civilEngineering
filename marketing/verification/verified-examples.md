# Verified examples

The source of truth for every number that appears in Zeta marketing. A number
that is not in this file does not go into a post, a poster or a video.

Each entry records the inputs, the units, the method, what Zeta printed, an
independent check, the date it was checked and the build it was checked on,
and the claims it supports. Re-check an entry whenever the engine it depends
on changes (the `pipeline`, `steelDesign`, `slabDeflection`, … files named
below), and update the date.

All entries below were checked on **2026-10-15** against `main` at
`317d778` (after #992), running locally (`npx vite`, no auth). Screenshots are
in `../evidence/`.

---

## V1 · RC beam — flexure 0.95, shear 0.80 (Beam Design default)

- **Where:** `/beam-design`, default inputs. Evidence: `evidence/concrete-design/beam-design.png`, `evidence/crops/beam-card-flexure.png`, `evidence/crops/beam-card-shear.png`.
- **Inputs:** b × h = 300 × 500 mm, clear cover 40 mm, f′c 28 MPa, fy = fyt 415 MPa, ⌀20 bars (optimiser's choice), ⌀10 two-leg stirrups, Mu 180 kN·m, Vu 150 kN.
- **Method:** ACI 318-14 / NSCP 2015 §422.2 (rectangular stress block), §422.5 (shear), φ from εt (§421.2.2).
- **Zeta output:** 4-⌀20 bottom, single layer, d = 440 mm, stirrups ⌀10 @ 220; flexure **0.95**, shear **0.80**.
- **Independent hand check:**
  - As = 4 × π/4 × 20² = 1256.6 mm²; a = 1256.6·415 / (0.85·28·300) = 73.0 mm; εt = 0.0124 ⇒ φ = 0.90
  - Mn = 1256.6·415·(440 − 36.5)/10⁶ = 210.4 kN·m; φMn = 189.4 kN·m ⇒ 180/189.4 = **0.950** ✓
  - Vc = 0.17√28·300·440/1000 = 118.7 kN; Vs = 2·78.54·415·440/220/1000 = 130.4 kN; φVn = 0.75·249.1 = 186.8 kN ⇒ 150/186.8 = **0.803** ✓
- **Approved claims:** "A 300×500 beam with 4-⌀20 works at 0.95 in flexure and 0.80 in shear." "φMn 189.4 kN·m, φVn 186.8 kN."

## V2 · Steel beam — W310×38.7 fails LTB at 147 % (Steel Beam default)

- **Where:** `/steel/beam`, default inputs. Evidence: `evidence/steel-design/steel-beam.png`, `evidence/crops/steel-card-flexure.png`, `evidence/crops/steel-elevation.png`, `evidence/crops/steel-ltb-curve.png`.
- **Inputs:** W310×38.7 (W12×26), A572 Gr 50 (Fy 345 MPa), simply supported span 6.00 m, compression flange braced at Lb = 2.00 m, Cb = 1.00, wD 15 + wL 25 kN/m, LRFD.
- **Method:** AISC 360-16 §F2 (NSCP 2015 §506), §G2.1 shear.
- **Zeta output:** Mu = 261.0 kN·m; φbMn = **178.0 kN·m** (inelastic LTB, flange compact) ⇒ **146.6 % — FAIL**; shear φvVn 374.8 kN, 46.4 % PASS; deflection 161.1 % of L/240, FAIL.
- **Independent checks:**
  - Mu = (1.2·15 + 1.6·25)·6²/8 = 58·4.5 = **261.0 kN·m** ✓
  - AISC Manual Table 3-2, W12×26, Fy 50 ksi: φbMp = 140 kip·ft, Lp = 5.33 ft, BF = 5.33 kips ⇒ at Lb = 6.56 ft, φbMn = 140 − 5.33·(6.56 − 5.33) = 133.4 kip·ft = **180.9 kN·m**. Zeta's 178.0 is **1.6 % lower** — the conservative side, from Zeta deriving the torsion constant J from plate dimensions without fillets (stated in `steelDesign.ts`).
- **Approved claims:** "A W310×38.7 over 6 m, braced at 2 m, needs 261 kN·m and lateral-torsional buckling limits it to 178 kN·m: it fails at 147 %." Do **not** claim Zeta "matches AISC exactly"; say it is within 2 % on the conservative side.

## V3 · Steel column — W250×67, φcPn 1701.7 kN (Steel Column default)

- **Where:** `/steel/column`, default inputs. Evidence: `evidence/steel-design/steel-column.png`.
- **Inputs:** W250×67 (W10×45), Fy 345 MPa, L = 4.00 m, Kx = Ky = 1.0, Pu 1760 kN, Mux 80 kN·m.
- **Zeta output:** KL/ry = 78.3, Fcr = 220.4 MPa, φcPn = **1701.7 kN**, axial 103.4 % FAIL; §H1-1a 132.6 % FAIL.
- **Independent hand check (AISC §E3):** ry = 51.1 mm ⇒ KL/r = 4000/51.1 = 78.3; Fe = π²·200 000/78.3² = 322 MPa; Fcr = 0.658^(345/322)·345 = 220.3 MPa; φcPn = 0.9·220.3·8580/1000 = **1701 kN** ✓.
- **Approved claims:** the axial numbers above. Not yet used in a post.

## V4 · Code Library — W460×74 (W18×50) against AISC Table 3-2

- **Where:** `/codes/steel-beam-flexure`, `/codes/steel-beam-shear`. Pinned by `webapp/src/lib/codes/steelLoads.test.ts` (CI).
- **Zeta vs AISC Manual Table 3-2 (Fy 50 ksi):** φbMp within 1.5 % of 379 kip·ft; Lp within 2 % of 5.83 ft; φvVn within 1 % of 192 kips (Zeta 853.3 kN vs 854). Lr runs short of the tabulated 16.9 ft, never long.
- **Approved claims:** "Checked against the AISC Manual's beam tables." Name the shape and the tolerance.

## V5 · Load combinations — D 100, L 60, Lr 10, W 40, E 50

- **Where:** `/codes/load-combinations` (and `/load-combinations`). Evidence: `evidence/code-library/load-combinations.png`. Pinned by `steelLoads.test.ts`.
- **Zeta output:** governing (6a) 1.2D + 1.0E + 1.0L = **230**; smallest (7b) 0.9D − 1.0E = **40**; 13 combinations.
- **Hand check:** 1.2·100 + 50 + 60 = 230 ✓; 0.9·100 − 50 = 40 ✓; 1.2D + 1.6L + 0.5Lr = 221; (4a) 225.
- **Note:** combination 3a and the W/E rows use 1.0L (NSCP allows 0.5L for most occupancies; 1.0L is the conservative choice and is what Zeta uses).
- **Approved claims:** the numbers above; "all 13 NSCP strength combinations".

## V6 · Default 3D frame — designs with 0 failures

- **Where:** `/model` → Regenerate grid model → Design → Design structure. Evidence: `evidence/model-space/3d-model.png`, `3d-designed.png`, `compliance-3d.png`, `compliance-inspector.png`, `rebar-cages.png`, `evidence/reports/framing-plan.png`, `boq-totals.png`.
- **Model:** bays X 6 + 6 m, bay Z 5 m, storeys 3.5 + 3 m; columns 400×400, girders 300×500, beams 250×450; slab 175 mm; f′c 28, fy 415; SDL 4.8 kPa, live 2.4 kPa.
- **Zeta output:** governing 1.2D + 1.6L + 0.5(Lr|S|R); compliance inspector **FAIL 0 · NEAR LIMIT 8 · PASS 28**; quantities concrete 41.06 m³, cement 493 bags, sand 20.53 m³, gravel 41.06 m³, rebar (bought) 5463.0 kg.
- **Independent check:** the slab long-term deflection that governs the 175 mm default was checked against plate theory and a hand calculation in #990 (`slabDeflection.test.ts`). Member results are cross-checked as a class by V7.
- **Caution:** the design header reads concrete ≈ 38.3 m³ (members + slabs) while the take-off reads 41.06 m³ (it includes the footings). Never show the two side by side without saying so.
- **Approved claims:** "The default 2×1-bay, 2-storey frame designs with no failures." The quantities above, for that frame. Do not generalise to "every model passes".

## V7 · STAAD.Pro cross-check — total reaction 0.001 %

- **Where:** `docs/benchmarks/staad-gridframe-2026-08-19.anl` vs `gridframe.model.json`; `docs/ValidationMap.md` row X002.
- **Result:** 2×1-bay, 2-storey frame, slab meshed 10×10, every input matched. Total reaction **2117.27 vs 2117.28 kN (0.001 %)**; joint deflections 0.16 % on the mean (±4 % joint by joint); support reactions ±3 %.
- **Approved claims:** exactly those, for that model. Do **not** turn this into "Zeta matches STAAD" in general, and do not mention the open cross-checks (X001 ETABS, X003 spColumn) as done.

---

## Not yet verified — do not publish numbers from these

- Footing, retaining wall, slope stability and bearing capacity defaults (captured in `evidence/`, numbers not hand-checked).
- Excel / STAAD / ETABS export of the default frame (features exist; the round trip has not been re-run for marketing).
- Deformed shape, modal, pushover and time-history results.
- Any performance figure (analysis time, model size).
