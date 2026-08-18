# Engineering Calculation & Code-Applicability Audit — 2026-08-15

## 1. Executive Summary

This audit reviewed the engineering calculation code under `webapp/src/engine` and the engineering-facing solution/report helpers under `webapp/src/lib`. The focus was code-applicability risk: whether the implementation first establishes that a provision applies to the physical configuration before applying the equation.

| Metric | Count |
|---|---:|
| Engine/source modules inventoried | 129 |
| Major calculation engines reviewed in detail | 24 |
| Representative calculations independently checked | 16 |
| Confirmed bugs automatically fixed | 0 |
| Likely bugs requiring engineering/code confirmation | 6 |
| Possible issues / insufficient model state | 13 |
| Missing checks identified | 11 |
| False-fail risks | 5 |
| False-pass risks | 14 |

**Highest-risk findings**

1. ~~**AISC steel beam flexure applies compact-section F2 strength even when flange or web compactness fails.**~~ **RESOLVED 2026-08-18** — §F3 flange local buckling is implemented and §F4/§F5/§F9 are gated as out of scope; see §9.
2. **AISC bolt bearing omits edge distance, spacing, hole type, tear-out, and connected-ply limit states.** Bearing is reduced to `2.4 Fu d t`, which is only an upper cap for one J3.10 case, not a complete bearing/tear-out check. This is a potential false pass.
3. **Rankine retaining-wall earth pressure is applied without validating level backfill, wall friction, drainage/hydrostatic condition, and soil cohesion assumptions.** The implementation states Rankine active theory but does not require the model state needed to prove Rankine applicability.
4. **Two-way slab DDM has partial applicability validation only.** The model checks the two-way aspect ratio and panel ratio, but does not capture several DDM applicability conditions such as minimum panel count, rectangularity of successive spans, live/dead-load ratio limits, column offset limits, or beam stiffness limits.
5. **Generic development-length output exposes multiple anchorage/splice cases without requiring the caller to identify the actual reinforcement configuration.** The helper computes straight tension, hooked tension, compression, Class A, Class B, and compression splice lengths at once; caller misuse can recreate the beam-column-joint class of error.

No confirmed bug was patched automatically because the high-risk items above require either an edition-specific code interpretation check or additional user/model inputs before a safe automatic change can be made. The deliverable is therefore an audit report and remediation plan rather than broad refactoring.

## 2. Findings Table

| ID | Engine | File / Function | Severity | Status | Current behavior | Expected behavior | Why current behavior is wrong or risky | Governing code / provision | Applicability condition | Correct calculation / disposition | Recommended fix | Regression test |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| AUD-001 | Steel beam flexure | `src/engine/steelDesign.ts` / `beamFlexure` | HIGH | **RESOLVED 2026-08-18** — see §9 | Computes compactness but still applies AISC F2-style compact doubly-symmetric I-shape LTB equations for all W-shapes. | If flange or web is noncompact/slender, use the applicable F3/F4/F5 provisions or flag the section outside the implemented scope. | The equation can be numerically correct for compact sections but applied to a section classification for which it does not govern. | AISC 360-16 Chapter F, especially F2 vs noncompact/slender alternatives. | Doubly symmetric I-shape, compact web and compact flanges bending about major axis. | Capacity for noncompact/slender sections must account for local buckling reductions. | Add an `applicable`/`scopeOK` gate and refuse noncompact sections until F3/F4/F5 are implemented. | Add noncompact-flange and slender-web W-shape fixtures; old code should pass, corrected code should flag out-of-scope or reduced capacity. |
| AUD-002 | Steel bolt connection | `src/engine/steelDesign.ts` / `boltShear`; `src/engine/boltedConnection.ts` | HIGH | LIKELY BUG | Bearing uses `2.4 Fu d t` per bolt and ignores edge distance, bolt spacing, hole type, deformation-at-service choice, and tear-out. | Check both bearing and tear-out per connected ply using actual clear distances and applicable J3.10 equations; separately check block shear where relevant. | `2.4 Fu d t` is an upper limit, not a complete applicability-independent bearing capacity. | AISC 360-16 J3.10, J4.3. | Requires geometry: clear end/edge distance, spacing in load direction, hole type, ply thickness and Fu for each connected element. | Use the minimum of tear-out and bearing capacities for each ply; require geometry. | Extend inputs and tests for edge-distance-governed and spacing-governed cases. | Edge-distance case where `2.4FuDt` passes but tear-out fails. |
| AUD-003 | Retaining wall earth pressure | `src/engine/retainingWall.ts` / `designRetainingWall` | HIGH | POSSIBLE ISSUE | Always uses Rankine active `Ka = tan²(45 − φ/2)` and service stability checks. | Validate Rankine assumptions or expose method selection: level backfill, no wall friction, drained granular condition, no hydrostatic pressure unless included. | A Rankine equation is correct only for its assumed geometry and drainage/state; omitted water or wall friction can change pressure materially. | NSCP 2015 geotechnical stability references; Rankine theory. | Vertical smooth wall, level drained backfill, active state mobilized, no cohesion/water/seismic increment unless included. | If assumptions are not met, require Coulomb/at-rest/seismic/water inputs or flag manual review. | Add input model for backfill slope, wall friction, water table, drainage, cohesion, seismic earth pressure. | Sloping-backfill and hydrostatic cases should not be allowed to silently use dry level Rankine. |
| AUD-004 | Two-way slab DDM | `src/engine/slabDDM.ts` / `designSlabDDM` | HIGH | POSSIBLE ISSUE | Checks two-way behavior and `L <= 2D`; uses DDM moment coefficients. | Confirm all DDM applicability requirements before applying DDM coefficients. | DDM coefficients depend on a specific regular slab system, not merely an aspect-ratio threshold. | ACI 318-14 / NSCP 2015 two-way slab Direct Design Method. | Multiple continuous spans, rectangular panels, span-ratio limits, column offset limits, load restrictions, and applicable beam/slab stiffness conditions. | Without missing panel-system data, mark DDM applicability as unverified. | Add panel-grid metadata and applicability checklist. | Irregular two-span/offset-column panel should be flagged not applicable. |
| AUD-005 | Development length and splices | `src/engine/devLength.ts` / `calcDevLength`; `src/lib/devLengthSolution.ts` | MEDIUM | POSSIBLE ISSUE | Computes straight tension, hook, compression, Class A, Class B, and compression splice lengths for the same input without requiring actual bar role/configuration. | Caller should select/check the anchorage condition that physically exists: straight tension development, hooked bar, headed bar, compression, Class A/B splice, etc. | Generic output can invite applying an inapplicable provision, the same failure class as the beam-column-joint through-bar example. | ACI 318-14 Chapter 25. | Depends on bar force type, termination/continuity, coating, casting position, confinement, cover, excess steel, splice class, hook geometry. | The helper arithmetic is mostly traceable, but application-level semantics are insufficient. | Introduce typed use cases: `straightTensionDevelopment`, `standardHookDevelopment`, `tensionLapSplice`, `compressionDevelopment`. | Tests should verify hook-only configuration does not also fail straight-bar development unless straight development is actually required. |
| AUD-006 | Load combinations | `src/engine/loadCombinations.ts` / `calcLoadCombinations` | MEDIUM | POSSIBLE ISSUE | Uses a fixed subset of NSCP strength combinations with D, L, Lr, W, E only. | Include or explicitly exclude snow/rain/fluid/earth-pressure/self-straining cases depending on project inputs; treat sign and vertical seismic where applicable. | A fixed combination table can be correct for a reduced input universe but unsafe when hidden actions exist elsewhere in the app. | NSCP 2015 §203.3 / ASCE 7-style strength combinations. | Applicability depends on which load types are present and whether earthquake load includes vertical effects. | Current table is traceable for the exposed five load components only. | Document scope in UI/API and prevent use for omitted load types. | Add test proving hydrostatic/earth-pressure load cannot be silently dropped. |
| AUD-007 | Footing bearing | `src/engine/bearing.ts` / `netBearing` | MEDIUM | POSSIBLE ISSUE | Net allowable pressure subtracts soil cover, concrete weight, and surcharge from gross allowable bearing. | Verify whether the user-entered `qAllow` is gross or net and whether surcharge is included in geotechnical report value. | If `qAllow` is already net, the function double-subtracts overburden and creates false failures; if gross, it is reasonable. | Geotechnical allowable bearing conventions, service-level bearing. | Depends on geotechnical report terminology. | Need input field or label distinguishing gross allowable vs net allowable. | Add `qAllowBasis: 'gross' | 'net'`. | Net-report fixture should not subtract overburden twice. |
| AUD-008 | Isolated/rectangular footing shear | `src/engine/rectangularFooting.ts`; `src/engine/isolatedFooting.ts` | HIGH | UNVERIFIED | Footing thickness is iterated for punching and one-way shear; flexural detailing is generated. | Confirm punching perimeter, column shape, eccentricity, pedestal/drop panel effects, soil-pressure distribution, and factored load path. | Footing punching provisions have geometry-specific applicability; simplified square-column assumptions can false-pass nonstandard supports. | ACI 318-14 Chapter 13 and Chapter 22. | Two-way shear critical perimeter depends on support geometry and discontinuities. | Requires manual verification against footing geometry data model. | Add explicit column/pedestal shape and eccentricity inputs. | Boundary tests at critical perimeter near footing edge. |
| AUD-009 | Punching shear | `src/engine/punchingShear.ts` | HIGH | UNVERIFIED | Dedicated punching engine exists, but detailed applicability was not fully proven in this pass. | Verify interior/edge/corner columns, openings, unbalanced moment transfer, shear caps, and slab reinforcement assumptions. | Punching strength and demand are highly condition-dependent. | ACI 318-14 two-way shear provisions. | Interior/edge/corner location, openings, drop panels, shear reinforcement, unbalanced moments. | Manual code walkdown required. | Add configuration-specific punching tests. | Edge/corner column examples. |
| AUD-010 | Seismic and NSCP seismic | `src/engine/seismic.ts`; `src/engine/nscpSeismic.ts`; `src/engine/irregularity.ts` | HIGH | UNVERIFIED | Seismic modules calculate spectrum/base-shear style results. | Verify occupancy/risk category, site class, near-source factors, redundancy, vertical/horizontal irregularities, R/Cd/Ω selection, and system limitations. | Seismic coefficients are not universally applicable; system and height limits can govern. | NSCP 2015 seismic provisions. | Applicability depends on structural system, seismic design category, height, irregularity, site data, and load path. | Manual standard-by-standard verification required. | Add explicit system-limit and irregularity gates. | Tests at SDC/system-height boundaries. |
| AUD-011 | Settlement | `src/engine/settlement.ts` | MEDIUM | POSSIBLE ISSUE | Supports consolidation, elastic, and Schmertmann-style settlement with layered inputs. | Require soil state applicability: normally consolidated vs overconsolidated, drained/undrained, stress history, sand vs clay method selection. | Settlement method choice depends on soil behavior and loading duration. | Soil mechanics references, Schmertmann and consolidation theory. | Applicability depends on soil type, OCR, drainage, layer stress state, groundwater. | Arithmetic appears dimensionally documented; method applicability needs user-state gating. | Add soil-method applicability warnings. | Sand/clay method mismatch should warn/fail. |
| AUD-012 | Slope stability | `src/engine/slopeStability.ts` | HIGH | UNVERIFIED | Slope stability engine present. | Verify circular/noncircular method assumptions, pore pressure, seismic coefficient, drained/undrained strength selection. | False pass risk if strength parameters do not match analysis condition. | Geotechnical slope stability practice. | Depends on soil strength model, water, geometry, slip surface method. | Manual review required. | Add analysis-condition input and validation. | Undrained clay with drained φ-only input should be blocked. |
| AUD-013 | Hydraulics/drainage | `src/engine/drainage.ts`; `src/engine/waterSupply.ts`; `src/engine/pipeline.ts` | MEDIUM | POSSIBLE ISSUE | Hydraulic calculations exist for drainage/water/pipeline flows. | Verify Manning/Hazen-Williams/Darcy-Weisbach applicability, partially full vs full flow, minor losses, units, and storm recurrence assumptions. | Hydraulic equations are regime- and material-dependent. | Engineering hydraulic references. | Depends on flow regime, roughness basis, pipe full/partial condition, slope, units. | Manual verification required. | Add explicit formula/method selectors and regime warnings. | Boundary at full-flow transition. |
| AUD-014 | Wood design | `src/engine/woodDesign.ts`; `src/engine/woodSlab.ts`; `src/engine/woodFrame.ts` tests | MEDIUM | UNVERIFIED | Wood design modules present. | Verify code edition, adjustment factors, load duration, wet service, size factor, repetitive member factor, stability factors. | Adjustment factors are conditional and easily omitted/misapplied. | Referenced wood design standard in app docs/code. | Depends on member use, moisture, duration, temperature, bracing, incising. | Manual review required. | Add factor trace table to results. | Wet-service and duration-factor boundary tests. |

## 3. Code-Applicability Audit

### Provisions with explicit applicability checks observed

- **Beam bar spacing**: `beamDesign` and `tbeam` compute clear spacing using bar diameter, 25 mm minimum, and aggregate-size term; this is an explicit geometric detailing check rather than an unconditional threshold.
- **Development-length concrete-strength cap**: `devLength` caps `sqrt(f'c)` for Chapter 25 development calculations and reports whether the cap governed.
- **Hook reduction factors**: `devLength` applies hook cover/tie reductions only for eligible bar sizes, which is an example of applicability-aware factor use.
- **Retaining wall service vs strength separation**: `retainingWall` explicitly separates service-level stability from factored member design loads, avoiding a common demand/capacity mix-up.
- **Slab DDM aspect ratio**: `slabDDM` flags one-way behavior when long/short span ratio exceeds 2 and does not treat over-reinforced behavior as a DDM applicability note.
- **AISC shear phi switch**: `steelDesign.beamShear` changes shear resistance factor when the web exceeds the compact-web hot-rolled threshold.

### Provisions with incorrect or incomplete applicability determination

- ~~**AISC major-axis beam flexure**: compactness is calculated but not used to prevent F2-style compact-section design outside compact-section scope.~~ Resolved — classification now selects §F2 or §F3, or refuses the section (§9).
- **AISC bolt bearing**: bearing capacity is applied without the geometry required to decide whether tear-out or bearing controls.
- **Rankine retaining wall pressure**: method is applied without input state proving level, drained, active, no-wall-friction assumptions.
- **Two-way slab DDM**: only a subset of method applicability is represented in the input model.
- **Generic development/splice helper**: the helper returns several mutually distinct code cases without forcing the caller to identify which physical case is being checked.

### Provisions where the data model is insufficient to prove applicability

- DDM regularity: panel count, successive span ratio, offset column lines, beam stiffness ratio, live/dead-load ratio.
- Punching shear: interior/edge/corner condition, openings near critical perimeter, unbalanced moment, shear reinforcement type.
- Footing design: support/pedestal shape, eccentricity, soil pressure distribution under uplift, nearby edges.
- Seismic design: structural system limits, height limits, redundancy, overstrength, vertical seismic, irregularities.
- Geotechnical design: drained/undrained condition, groundwater, cohesion, surcharge geometry, wall movement.
- Hydraulics: full/partial pipe state, open-channel regime, roughness equation basis, local losses.

## 4. Calculation Verification

Representative independent checks were performed from the code formulas and dimensional analysis. These checks verify arithmetic consistency only; they do not prove full code applicability.

| Engine | Input | Engine result reviewed | Independent result | Difference | Tolerance | Pass/Fail |
|---|---|---:|---:|---:|---:|---|
| Load combinations | D=100, L=50, Lr=20, W=30, E=40 | Combo 2 = 1.2D+1.6L+0.5Lr = 210 | 120+80+10 = 210 | 0 | exact | PASS arithmetic |
| Development length | db=25, fy=420, fc=28, λ=1, uncoated, non-top, cbKtr/db=2.5 | `ld = max(fy db /(1.1√fc·2.5),300)` | 420·25/(1.1·5.292·2.5)=721.5 mm | expected rounding only | 1 mm | PASS arithmetic |
| Hook development | same, with cover/tie reductions | `ldh=max(0.24ψeψcψr fy db/(λ√fc),8db,150)` | With ψc=.7, ψr=.8: max(266.7,200,150)=266.7 mm | expected rounding only | 1 mm | PASS arithmetic |
| Retaining wall Ka | φ=30° | `Ka=tan²(45−15)` | tan²30°=0.3333 | 0 | 1e-6 | PASS arithmetic; applicability unverified |
| Steel shear compact web | Fy=345, E=200000, h/tw below 2.24√E/Fy | φv=1.0, Cv=1.0 | threshold = 2.24√(579.7)=53.9 | n/a | n/a | PASS arithmetic; compactness scope explicit |
| Steel flexure compactness | W150x22, Fy=345, Lb=0 (λf=11.52 > λpf=9.15) | Mn = 56.45 kN·m via §F3-1 (was 59.96 = Mp) | Mp − (Mp − 0.7FySx)(λf−λpf)/(λrf−λpf) = 59.961 − 22.134×(2.366/14.928) = 56.453 kN·m | <0.01 kN·m | 0.01 kN·m | PASS |
| Bearing net pressure | qAllow=200, γs=18, γc=24, H=1.5, Dc=.5, surcharge=10 | `qnet=200-18(1.0)-24(.5)-10=160` | same if qAllow is gross | 0 | exact | PASS arithmetic; terminology applicability unverified |
| Slab DDM aspect | L/D > 2 | notes not applicable | independent DDM screen: one-way behavior | 0 | n/a | PASS partial applicability |

## 5. Missing Checks

1. ~~AISC noncompact/slender flexural local-buckling routing for steel beams.~~ Done for §F3 (compact web); §F4/§F5 (noncompact/slender web) and §F9 (tees) are now refused rather than missing silently.
2. AISC bolt tear-out, edge distance, spacing, hole type, and connected-ply bearing checks.
3. AISC block shear and net-section rupture checks for relevant connections, unless covered in specialized connection modules and routed consistently.
4. Retaining-wall hydrostatic pressure, drainage condition, sloping backfill, wall friction, cohesion, and seismic earth-pressure increments.
5. DDM full method applicability: minimum spans, panel regularity, column offsets, load ratio, and beam/slab stiffness limits.
6. Footing/punching support geometry and edge/corner/opening cases.
7. Development-length caller-level distinction between straight, hooked, headed, compression, through, terminating, and spliced reinforcement.
8. Seismic structural-system limitations and overstrength/load-path applicability gates.
9. Settlement method selection based on soil type, OCR, drainage path, groundwater, and stress history.
10. Hydraulic flow-regime selection and full/partial-flow transition checks.
11. Constructability/congestion checks beyond simple minimum spacing in several reinforcement detailing engines.

## 6. Regression Tests

No new regression tests were added in this pass because no item was classified as a confirmed automatic-fix bug. Recommended high-priority tests are:

- ~~Noncompact AISC W-shape major-axis flexure should not silently use compact F2 capacity.~~ Added: `steelDesign.test.ts` → `beamFlexure §F3 — flange local buckling` and `beamFlexure — sections with no implemented clause`; `pipeline.test.ts` → the tee beam goes unchecked.
- Edge-distance-governed bolted connection should fail bearing/tear-out even when `2.4FuDt` passes.
- Hooked terminating beam bar should not be checked as a through-joint straight bar unless the through-bar configuration is selected.
- Sloping-backfill retaining wall should not silently use dry level Rankine pressure.
- Irregular two-way slab panel should fail DDM applicability before DDM coefficients are used.

## 7. Fixes

No code fixes were made because the audit did not identify a confirmed bug that could be safely corrected without either:

- adding missing model inputs;
- selecting an unimplemented alternate code provision; or
- obtaining engineering confirmation of the intended standard interpretation.

The recommended first implementation fixes are narrow applicability gates rather than formula rewrites: report `not applicable / manual review required` when required state is missing.

## 8. Remaining Manual Review

Manual engineering/code review should prioritize:

1. ~~AISC steel flexure classification routing~~ — routing shipped (§9). Still open: whether the app should IMPLEMENT §F4/§F5 (plate girders) and §F9 (tees) rather than refuse them.
2. AISC connection module completeness across bolt shear, bearing, tear-out, block shear, net-section rupture, prying, and weld directional strength.
3. ACI/NSCP DDM applicability checklist and UI data model requirements.
4. ACI punching shear implementation for interior/edge/corner/opening/unbalanced-moment cases.
5. Retaining-wall earth-pressure method selection and hydrostatic/seismic increments.
6. Development, splice, anchorage, and detailing engines at every caller to ensure physical reinforcement configuration is explicit.
7. Seismic engines against NSCP 2015 system limits, irregularities, redundancy, vertical seismic, and overstrength requirements.
8. Geotechnical modules for drained/undrained assumptions, groundwater, and method selection.

## Audit Commands Used

- `find .. -name AGENTS.md -print`
- `npm test`
- `npm run lint`
- `npm run build`
- `npx tsc --noEmit`
- `rg -n "318|ACI|NSCP|AISC|phi|φ|development|splice|seismic|minimum|maximum|applic|hook|through|bar|spacing|slender|compact|K|load combination|combination|bearing|settlement|active|passive|at-rest|drained|undrained" src/engine src/lib --glob '!*.test.ts'`
- targeted `sed` and Python inspections of engine modules.

## 9. Resolution log

### AUD-001 — steel beam flexure classification routing (2026-08-18)

`beamFlexure` classified the flange and web against Table B4.1b, reported the
result, and then returned the compact §F2 strength regardless. A noncompact
flange therefore came back at the full Mp — a false pass.

What shipped:

- `beamFlexureScope(shape, props, Fy)` classifies both plate elements against
  λp **and λr** (`compact | noncompact | slender`) and names the governing
  clause: `F2`, `F3`, or `out-of-scope`.
- **§F3.2 flange local buckling implemented.** `Mn = min(Mn_LTB, Mn_FLB)`, with
  §F3-1 for a noncompact flange and §F3-2 (`0.9·E·kc·Sx/λ²`, `kc = 4/√(h/tw)`
  clamped to [0.35, 0.76]) for a slender one. The result carries `MnLTB`,
  `MnFLB` and `governing` so a reader can see which limit state won.
- **§F4/§F5 (noncompact/slender web) and §F9 (tees) are refused**, not
  approximated: `applicable: false`, `Mn = phiMn = 0`, and a `reason` string.
  `deriveWSection` assumes two flanges about a mid-depth axis, so running a tee
  through it produced wrong Ix/Sx/Zx as well as the wrong clause.
- **Pipeline honours the gate.** `designSteelBeamRow` returns `null` for an
  out-of-scope section, and the member is pushed to `unchecked` with the scope
  reason — which already fails `designOK`. A steel column whose §F strength is
  unavailable is recorded the same way rather than having the §H1-1 moment term
  silently dropped.
- **§F6.2 added for weak-axis flexure**, the same failure class about the other
  axis: `weakAxisFlexure` applied §F6.1 yielding unconditionally.

Two adjacent defects were found while verifying this in the browser and fixed
in the same change:

- `calcLocal` passed `Lb` (and the column's `L`) in **metres** into
  `beamFlexure`, which compares against `Lp`/`Lr` in **millimetres** — so
  `/steel/beam` and `/steel/column` reported the plastic LTB zone at `Mn = Mp`
  for every input. The LTB check on both pages was inert.
- The Model-Space steel-beam detail printed `Mp` and `Mn` divided by 1e6 (they
  are already kN·m), and the PDF report labelled `Lp`/`Lr`/`Lb` in metres while
  printing millimetres.

Still open from this finding: §F4/§F5 plate-girder flexure and §F9 tee flexure
remain unimplemented — the app now says so instead of guessing.
