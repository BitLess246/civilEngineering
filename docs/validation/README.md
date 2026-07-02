# Validation Manual

This directory is the documented validation manual for the analysis and design
engines. Each chapter states a benchmark as:

> **Problem → Reference solution → Software output → Error % → PASS/FAIL**

The "Software output" column is produced by the same engines the app's design
pages use. Every benchmark here is also encoded in the automated test suite
(`webapp/src/engine/validation.ts` + `validation.test.ts`) and surfaced live on
the in-app **[/validation](../../webapp/src/pages/Validation.tsx)** dashboard with
per-module pass counts, so the manual cannot silently drift from the code.

## Chapters

| Chapter | Scope | Status |
| --- | --- | --- |
| [Frame analysis](./frame.md) | Beam/frame solver vs closed-form elasticity | ✅ |
| [NSCP seismic](./seismic.md) | 208 static period & base shear + governing logic | ✅ |
| [Modal & response spectrum](./dynamics.md) | Eigen-solver, SDOF period, pseudo relations | ✅ |
| [Steel connections](./connections.md) | Eccentric bolt/weld groups, §J3.7 out-of-plane, §J3.9 prying | ✅ |
| RC design | Beam Mn, column φPn, footing area | in `/validation` (dashboard) |
| Steel design | φMp, φVn | in `/validation` (dashboard) |
| Geotechnical | Bearing factors, earth pressure, slope FS | in `/validation` (dashboard) |

## Levels of validation

1. **Closed-form** (textbook / code clause) — exact analytical results. Used for
   beams, columns, footings, single elements, and the frame benchmarks here.
2. **External tools** (ETABS / STAAD / SAP2000) — for multi-element systems where
   hand solutions are impractical (space frames, modal, response spectrum). These
   cross-checks are the planned next step.
