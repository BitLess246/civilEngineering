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
- [x] Automated validation tests (`validation.test.ts`; enforced in CI)
- [x] Validation dashboard (`/validation` page with live per-module pass counts)
- [ ] Validation Manual (docs/validation chapters; frame/modal/RS write-ups)
- [ ] ETABS / STAAD comparisons (external-tool cross-checks)
- [ ] Excel verification sheets
- [ ] NSCP worked-example verification (208 base shear, etc.)

Deliverables:
- [x] ValidationMap.md
- [x] Automated validation tests
- [x] Validation dashboard
- [ ] Validation Manual PDF

---

# Phase 3: Philippine Engineering Features

Target: v2.0

Structural:
- [x] Retaining Wall Design (`/retaining-wall`, cantilever · Rankine)
- [x] Wind Load Generator (NSCP §207B MWFRS + §207E.4 C&C, in 3D model space)
- [ ] NSCP Seismic Wizard (engine exists in `engine/seismic.ts`; needs a guided UI)
- [x] Stair Design (`/stair`, RC waist slab)
- [ ] Water Tank Design

Geotechnical:
- [x] Geotechnical toolkit (`/geotech`: bearing capacity, earth pressure, slope)
- [x] Soil Nailing (`/soil-nail`, FHWA GEC-7)
- [x] Micropile Design (`/micropile`, FHWA-NHI-05-039)
- [ ] Shotcrete Design (facing design — partly covered by soil-nail facing checks)
- [ ] Rock Anchors
- [ ] Pressure Grouting

---

# Phase 4: Commercial Launch

Target: v3.0  ·  (business/infrastructure — owner-driven)

- [ ] Authentication
- [ ] Subscription System
- [ ] Free Tier
- [ ] Premium Tier
- [ ] PDF Reports
- [ ] Company Accounts
- [ ] License Management

---

# Long-Term Vision

Become the preferred engineering software platform for Philippine civil engineers.