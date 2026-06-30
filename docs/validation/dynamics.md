# Chapter 3 — Modal & response spectrum

The dynamics engines are the eigen-solver and modal analysis (`engine/modal.ts`)
and the elastic response spectrum from a recorded accelerogram
(`engine/accelSpectrum.ts`). They are validated against linear-algebra closed
forms, single-degree-of-freedom (SDOF) theory, and the pseudo-spectral
identities.

## Benchmarks (dashboard-enforced)

| # | Quantity | Reference | Formula | Result |
| --- | --- | --- | --- | --- |
| 1 | Jacobi eigenvalue of `[[2,1],[1,2]]` | Linear algebra | λ = 2 ± 1 → λmax = 3 | ✅ PASS |
| 2 | Response spectrum T → 0 anchor | Chopra | Sa(0) = PGA | ✅ PASS |
| 3 | Pseudo-acceleration relation | Chopra | PSA = ω²·Sd | ✅ PASS |

### Notes

- **Eigenvalues** — the symmetric Jacobi solver reproduces the exact eigenpairs
  of a hand-solvable matrix; this is the kernel under modal analysis.
- **T = 0 anchor** — a rigid oscillator follows the ground, so the spectral
  acceleration at zero period equals the peak ground acceleration.
- **Pseudo relation** — the engine forms `PSV = ω·Sd` and `PSA = ω²·Sd`; the
  benchmark confirms the identity holds at an arbitrary period of the computed
  spectrum.

## Cross-checks already in the test suite

`modal.test.ts`:

- **SDOF fundamental period** of a lumped-mass column matches `T = 2π·√(m/k)`,
  with `k` taken from a static unit-load analysis and `m` from the lumped
  seismic mass — to 4 decimal places.
- eigenpairs satisfy `A·v = λ·v`; eigenvectors are unit length; mass assembly
  totals the member + slab masses; effective-mass ratios sum to ~1.

`accelSpectrum.test.ts`:

- **Newmark-β SDOF** integration of `ü + 2ζω·u̇ + ω²u = −ag` reproduces the
  steady-state response of a harmonic base motion and shows resonance near the
  natural frequency.
- the `PSA / PSV / Sd` relations hold across the period grid; increasing damping
  ζ lowers the ordinates; empty/zero/`dt ≤ 0` inputs are guarded.

## Planned cross-checks

A multi-storey shear-building modal comparison (periods, mode shapes,
participation factors) and a base-shear comparison against **ETABS** response
spectrum analysis on a documented reference model.
