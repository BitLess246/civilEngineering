# Chapter 1 — Frame analysis

The 3D space-frame solver (`engine/frame3d.ts`) is validated against closed-form
elasticity for prismatic members. The element is a 12-DOF space-frame element
(axial + St-Venant torsion + biaxial Hermite bending), so for these load cases it
reproduces the exact Euler–Bernoulli results to machine precision.

## Common section

| Property | Value |
| --- | --- |
| E | 25 000 MPa |
| Section | 300 × 500 mm (rectangular) |
| Iz | b·h³/12 = 3.125 × 10⁹ mm⁴ |
| **EIz** | **78 125 kN·m²** |

## Benchmarks

All "Software" values are produced by `solveFrame3D` and are enforced by
`webapp/src/engine/validation.ts` / `validation.test.ts` (tolerance shown).

| # | Problem | Reference solution | Formula | Hand value | Software | Error | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Cantilever, tip point load P = 10 kN, L = 3 m — tip deflection | Euler–Bernoulli | δ = P·L³ / (3·E·I) | 1.1520 mm | 1.1520 mm | < 0.01 % | ✅ PASS |
| 2 | Same — tip rotation | Euler–Bernoulli | θ = P·L² / (2·E·I) | 5.760 × 10⁻⁴ rad | 5.760 × 10⁻⁴ rad | < 0.01 % | ✅ PASS |
| 3 | Same — fixed-end moment | Statics | M = P·L | 30.00 kN·m | 30.00 kN·m | < 0.01 % | ✅ PASS |
| 4 | Fixed–fixed beam, central load P = 20 kN, L = 4 m — midspan deflection | Matrix analysis / Roark | δ = P·L³ / (192·E·I) | 0.08533 mm | 0.08533 mm | < 0.1 % | ✅ PASS |

### Worked check — Benchmark 1

```
δ = P·L³ / (3·E·I)
  = (10 kN)(3 m)³ / (3 · 78 125 kN·m²)
  = 270 / 234 375
  = 1.1520 × 10⁻³ m  = 1.152 mm
```

The solver returns 1.152 mm (the Hermite cubic is exact for a tip point load), an
error below 0.01 %.

## Cross-checks already in the test suite

Beyond the dashboard cases above, `frame3d.test.ts` independently verifies:

- a planar portal frame against the 2-D solver (`frame2d`),
- the second-order P-Δ amplifier against `1 / (1 − P/Pe)`,
- global statics self-checks (ΣF, ΣM ≈ 0) on assembled models,
- rigid-floor-diaphragm and rigid-link (member-offset) kinematics.

## Planned (external-tool) cross-checks

For multi-bay, multi-storey **space frames** where hand solutions are
impractical, the next step is a side-by-side comparison against ETABS / STAAD on
a documented reference model (member forces, drifts), reported in the same
Problem → Reference → Software → Error % format.
