# CivilEngineering PH Master Roadmap

## Vision

Build the leading structural and geotechnical engineering platform for Philippine engineers, with native NSCP support and integrated analysis, design, detailing, and quantity estimation.

---

# Phase 1: Foundation (Current)

Status: In Progress

## Structural Design
- [x] Beam Design
- [x] Column Design
- [x] Footing Design
- [x] Combined Footing Design
- [x] CHB Design
- [x] Box Culvert Design

## Structural Analysis
- [x] 2D Frame Analysis
- [x] 3D Frame Analysis
- [x] Modal Analysis
- [x] Response Spectrum Analysis
- [x] Seismic Modules

## Visualization
- [x] 3D Model Viewer
- [x] Member Force Diagrams
- [x] Sketching Tools

---

# Phase 2: Engineering Validation

Target: v1.0  ·  Status: In Progress

Goals:
- [x] Hand calculations (engine-vs-closed-form benchmarks, `engine/validation.ts`)
- [x] Automated validation tests (`validation.test.ts`; run in the GitHub Actions `ci` job — `.github/workflows/static.yml` — gating every merge to main)
- [x] Validation dashboard (`/validation` page with live per-module pass counts)
- [ ] Validation Manual (docs/validation chapters; frame/modal/RS write-ups)
- [x] STAAD comparison (X002 — `docs/benchmarks/staad-gridframe-2026-08-19.anl`, Aug 2026: total reaction 2117.27 vs 2117.28 kN, 0.001%; every input matched, nothing normalised. It is what found the `frame3d` My sign defect, #614)
- [ ] ETABS comparison (X001) and PCA/spColumn (X003) — both need a license and reference results checked into `docs/benchmarks/`
- [ ] Excel verification sheets (X004; the /validation manual-vs-software tables can seed them)
- [x] NSCP worked-example verification (208 base shear + period vs hand calc in `validation.ts`/`seismic.test.ts`; review-problem answer keys in column/effective-length/geotech tests — see ValidationMap.md)

Deliverables:
- [x] ValidationMap.md (filled with per-row test evidence, July 2026)
- [x] Automated validation tests
- [x] Validation dashboard
- [ ] Validation Manual PDF

---

# Phase 3: Philippine Engineering Features

Target: v2.0

Structural:
- [x] Retaining Wall Design (`/retaining-wall`, cantilever · Rankine)
- [x] Wind Load Generator (NSCP §207B MWFRS + §207E.4 C&C, in 3D model space)
- [x] NSCP Seismic Wizard (`/seismic-wizard`; §208 Ca/Cv/I/R/Na/Nv tables + Cs)
- [x] Stair Design (`/stair`, RC waist slab)
- [x] Water Tank Design (`/water-tank`; circular wall — IS 3370 / ACI 350 working stress)

Geotechnical:
- [x] Geotechnical toolkit (`/geotech`: bearing capacity, earth pressure, infinite slope)
- [x] Soil Nailing (`/soil-nail`, FHWA GEC-7)
- [x] Micropile Design (`/micropile`, FHWA-NHI-05-039)
- [x] Shotcrete Design (`/shotcrete-facing`; FHWA GEC-7 facing flexure + punching)
- [x] Rock Anchors (`/rock-anchor`, PTI DC35.1 / FHWA-IF-99-015)
- [x] Slope stability by method of slices (`/slope`; Fellenius, Bishop simplified, Janbu simplified + critical-circle search)
- [x] Settlement (`/settlement`; stress distribution, immediate/elastic, 1-D consolidation and its time rate)
- [x] Laterally loaded piles (`/lateral-pile`; Broms ultimate capacity + p-y analysis)
- [ ] Pressure Grouting — the last item in this phase. `soilNail`, `micropile` and `rockAnchor` already size grouted bond lengths, so what is missing is the grouting operation itself (pressures, takes, stage design), not grout-bond capacity.

---

# Phase 4: Commercial Launch

Target: v3.0  ·  (business/infrastructure — owner-driven)

Most of this shipped and the boxes were never ticked. `HANDOFF.md` and
`docs/Billing.md` are the detail; this is the status.

- [x] Authentication (Supabase auth; `/signin`, `/signup`, `/forgot-password`, `/reset-password`, `RequireAuth` gate)
- [x] Subscription System (Paddle + five Supabase Edge Functions: `billing-webhook`, `billing-portal`, `billing-change-plan`, `billing-history`, `guest-quota`)
- [x] Free Tier — the guest trial gate, LIVE since 14 Aug 2026 and observed refusing a real request in production (`402 trial-exhausted`)
- [x] Premium Tier (plan tiers with per-plan project limits, enforced by a DB trigger rather than by the client)
- [x] PDF Reports (`ReportControls`; the model-space calculation report, per-member drawings and schedules)
- [ ] Company Accounts
- [ ] License Management

---

# Long-Term Vision

Become the preferred engineering software platform for Philippine civil engineers.