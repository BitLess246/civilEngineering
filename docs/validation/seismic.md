# Chapter 2 — NSCP 208 static seismic

The equivalent-lateral-force engine (`engine/seismic.ts`) implements the NSCP
2015 §208.5.2 static procedure. Native NSCP support is the platform's core
differentiator, so this chapter checks the period and base-shear equations and
documents the governing-case logic.

## Equations (NSCP §208.5.2)

```
T    = Ct · hn^(3/4)                         (208.5.2.2, Method A; Ct = 0.0731 RC MRF, m)
V    = Cv·I·W / (R·T)                         (208-8, basic)
       2.5·Ca·I·W / R   ≥  V  ≥  0.11·Ca·I·W  (208-9 upper, 208-10 lower)
Zone-4 floor:  V ≥ 0.8·Z·Nv·I·W / R          (208-11)
```

## Benchmarks (dashboard-enforced)

Reference model: a 6 m × 5 m single-bay frame, two 3 m storeys (hn = 6 m),
400 × 400 concrete sections; Ca = 0.44, Cv = 0.64, I = 1, R = 8.5. Values come
from `computeSeismic` and are enforced by `validation.ts` / `validation.test.ts`.

| # | Quantity | Reference | Formula | Result |
| --- | --- | --- | --- | --- |
| 1 | Fundamental period T | NSCP 208.5.2.2 | T = 0.0731 · hn^(3/4) | ✅ PASS (< 0.0001 %) |
| 2 | Basic base shear Vraw | NSCP 208-8 | V = Cv·I·W / (R·T) | ✅ PASS (< 0.0001 %) |

### Worked check — period

```
hn = 6 m  (two 3 m storeys)
T  = 0.0731 · 6^(3/4) = 0.0731 · 3.834 = 0.2803 s
```

The engine returns the same T from the model height, then forms
`Vraw = Cv·I·W/(R·T)` with the seismic weight W lumped from member/slab masses
(`buildSeismicMass`).

## Governing-case logic (verified in `seismic.test.ts`)

The design base shear is `V = max(Vmin, Vsrc, min(Vraw, Vmax))`:

- **Vmax** caps `Vraw` for short, stiff buildings (208-9).
- **Vmin** floors it (208-10).
- **Vsrc** is the Zone-4 near-source floor (208-11), active only when `Z ≥ 0.4`.

`seismic.test.ts` exercises each branch (cap-governs, floor-governs, Zone-4
floor) and the vertical force distribution `Fx = (V − Ft)·wx·hx / Σ(wi·hi)` with
the whip force `Ft = 0.07·T·V` (≤ 0.25 V, zero when T ≤ 0.7 s).

## Planned cross-checks

A worked NSCP example (published textbook / DPWH design aid) and an ETABS model
with the same parameters, compared on base shear and storey-force distribution.
