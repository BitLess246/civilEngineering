# Validation Chapter 4 — Steel connections

Benchmarks for the connection solvers: the in-plane eccentric **bolt** group
(`engine/boltedConnection.ts`), the eccentric **weld** group
(`engine/weldedConnection.ts`), the **out-of-plane** bolt-tension model and
**prying action** (`engine/steelDesign.ts`). Every case below is encoded in
`webapp/src/engine/validation.ts`, enforced by `validation.test.ts`, and shown
live on the in-app **/validation** dashboard under the **Connections** module.

Format: **Problem → Reference solution → Software output → Error % → PASS**.

---

## 4.1 Eccentric bolt group — elastic (vector) method

**Problem.** Four bolts on a 100 × 100 mm square (centroid at (50, 50)). A
vertical load **P = 100 kN** acts 100 mm to the right of the centroid
(e_x = 100 mm).

**Reference (AISC Manual Part 7, elastic method).**

- Polar moment `J = Σ(x² + y²) = 4·(50² + 50²) = 20 000 mm²`
- Direct share per bolt `P/N = 25 kN` (↓)
- Torsion `T = P·e_x = 10 000 kN·mm`; torsional share on a corner bolt
  `T·ρ/J` with components 25 kN each
- Critical (right-hand) bolts: `R = √(25² + (25+25)²) = P·√(0.25² + 0.5²)`

> **R_manual = 55.9017 kN**

| Manual | Software (`solveBoltedConnection`) | Error | Result |
| --- | --- | --- | --- |
| 55.9017 kN | 55.9017 kN | < 1e-9 % | ✅ PASS |

Dashboard id: `bolt-ecc-rmax`.

## 4.2 Eccentric weld group — elastic (weld-as-a-line) method

**Problem.** A single vertical fillet-weld line 300 mm long. A vertical load
**P = 100 kN** acts 100 mm from the line (e_x = 100 mm).

**Reference (AISC Manual Part 8; throat per NSCP 510.2.2 / AISC J2.2).**

- Unit-throat polar moment `J/t = L³/12 = 300³/12 = 2.25×10⁶ mm³`
- Direct `P/L_w = 100 000/300 = 333.33 N/mm`
- Torsional at the line end (c = 150 mm): `T·c/(J/t) = (10⁷ × 150)/2.25×10⁶ = 666.67 N/mm`
- Resultant `f = 333.33·√(1² + 2²) = (P·1000/L_w)·√5`

> **f_manual = 745.356 N/mm**

| Manual | Software (`solveWeldedConnection`) | Error | Result |
| --- | --- | --- | --- |
| 745.356 N/mm | 745.356 N/mm | < 1e-9 % | ✅ PASS |

Dashboard id: `weld-ecc-fmax`.

## 4.3 Out-of-plane eccentricity — bolt tension (AISC 360 §J3.7)

**Problem.** A 2 × 3 bolt group (rows at y = 0, 100, 200 mm). A shear
**Vu = 100 kN** is applied at a stand-off **e_out = 100 mm** perpendicular to
the bolt plane, bending the group about its lowest row.

**Reference.**

- `M_op = Vu·e_out = 10 000 kN·mm`
- `Σyᵢ² = 2·(100² + 200²) = 100 000 mm²` (about the lowest row)
- Top-row bolt tension `T = M_op·y_top/Σyᵢ² = 10 000·200/100 000`

> **T_manual = 20.000 kN**

| Manual | Software (`outOfPlaneBoltGroup`) | Error | Result |
| --- | --- | --- | --- |
| 20.000 kN | 20.000 kN | < 1e-9 % | ✅ PASS |

Dashboard id: `bolt-oop-tension`.

## 4.4 Prying action — thickness eliminating prying (AISC Part 9 / §J3.9)

**Problem.** A bolted fitting with gage `b = 45 mm`, edge `a = 40 mm`, pitch
`p = 70 mm`, bolt `d_b = 20 mm`, plate `F_y = 248 MPa`; available bolt tension
`φB_n = 60 kN`. Find the minimum fitting thickness `t₀` at which prying
vanishes (α → 0).

**Reference (T-stub model).**

- `b′ = b − d_b/2 = 35 mm`
- `t₀ = √(4·φB_n·b′ / (φ_f·F_y·p)) = √(4·60 000·35 / (0.90·248·70))`

> **t₀,manual = 23.186 mm**

| Manual | Software (`pryingAction`) | Error | Result |
| --- | --- | --- | --- |
| 23.186 mm | 23.186 mm | < 1e-9 % | ✅ PASS |

Dashboard id: `prying-t0`.

---

## Coverage notes

- The **connection type → analysis** wiring (a `'simple'` end releases M_y, M_z —
  the schematic hinge; `'moment'`/`'fixed'` stay continuous) is verified in
  `modelBridge.test.ts` (`effectiveReleases`, assembled-frame pin check).
- The weld solver's `J/t = Σ[L³/12 + L·ρ_c²]` is orientation-general (a line's
  own second moment about its midpoint is `L³/12` for any inclination);
  multi-segment bracket cases are covered in `weldedConnection.test.ts`.
- The combined shear + tension interaction `φF′_nt = 1.3F_nt − (F_nt/(φF_nv))·f_rv ≤ F_nt`
  (§J3.7) and the full prying α/β/δ chain are exercised in `steelDesign.test.ts`.
