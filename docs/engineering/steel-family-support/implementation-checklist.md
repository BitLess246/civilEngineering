# Steel Family Support Implementation Checklist

Use this as a living checklist. Do not mark a step complete until code, tests, and engineering review support it.

## Phase 0 — Baseline and scope

- [ ] Inventory all callers of W-only property and design functions.
- [ ] Trace the manual designer, 3D model workflow, optimizer, and report exporter.
- [ ] Record each family/limit-state combination currently supported.
- [ ] Define supported analysis assumptions and unsupported effects.
- [ ] Confirm the governing code edition and authoritative catalogue source/version.
- [ ] Add explicit result statuses for unsupported and not-assessed checks.
- [ ] Ensure UI and reports cannot convert missing results into PASS.

## Phase 1 — Shared contracts

- [ ] Define validated, family-specific section property types.
- [ ] Define a common check-result schema with units, clause, demand, capacity, utilization, and status.
- [ ] Define a common member-design result and overall-status aggregation.
- [ ] Add alias/substitution metadata that preserves original designation.
- [ ] Add catalogue data validation and provenance.
- [ ] Preserve existing W behavior with regression tests.

## Phase 2 — HSS and PIPE

- [ ] Implement validated HSS property derivation or authoritative property lookup.
- [ ] Implement validated PIPE/round-section properties.
- [ ] Implement applicable tension checks.
- [ ] Implement applicable compression and stability checks.
- [ ] Implement family-specific flexure and shear checks.
- [ ] Implement applicable combined-force checks.
- [ ] Implement local wall slenderness/classification and relevant limits.
- [ ] Confirm torsion treatment and analysis assumptions.
- [ ] Add independent benchmark cases for both families.
- [ ] Enable only the validated check combinations in the UI.

## Phase 3 — C and L

- [ ] Implement channel section properties and applicable checks.
- [ ] Address channel shear-center/torsional effects where required.
- [ ] Implement angle centroid and principal-axis properties.
- [ ] Address unsymmetrical bending and eccentricity where required.
- [ ] Implement applicable local slenderness, compression, flexure, shear, and interaction checks.
- [ ] Specify and validate double-angle pair geometry and built-up member assumptions.
- [ ] Add independent benchmarks and boundary tests.
- [ ] Enable only validated workflows.

## Phase 4 — WT

- [ ] Implement tee-specific section properties.
- [ ] Implement applicable AISC §F9 flexural provisions.
- [ ] Validate tee compression, tension, shear, and combined-force checks as applicable.
- [ ] Test stem/flange orientation and local axes.
- [ ] Add benchmark cases for both relevant bending orientations.
- [ ] Enable only validated workflows.

## Phase 5 — Optimizer

- [ ] Route every candidate through the shared family-aware design engine.
- [ ] Require all required checks to pass before a candidate is feasible.
- [ ] Preserve all rejection reasons.
- [ ] Never rank unsupported or not-assessed candidates as feasible.
- [ ] Re-run the final adopted sizes and confirm result consistency.
- [ ] Reanalyze the frame when size changes affect stiffness, self-weight, or force distribution.
- [ ] Add optional family filters and explain why unavailable families are disabled.
- [ ] Keep weight/cost objective and assumptions visible.
- [ ] Add deterministic mixed-family optimizer tests.
- [ ] Verify that manual design and optimizer agree for identical member inputs.

## Phase 6 — 3D model and reports

- [ ] Verify every family’s geometry and local orientation in Model Space.
- [ ] Share or explicitly reconcile effective local-axis rotation between solver and renderer.
- [ ] Display unsupported-section warnings instead of generic-box fallbacks.
- [ ] Display legacy/substituted section warnings and preserve the original label.
- [ ] Export the full design status matrix, assumptions, properties, and rejection reasons.
- [ ] Include omitted checks and their reasons in PDF reports.
- [ ] Avoid unqualified “code compliant” claims when scope is incomplete.

## Release criteria

A family may be marked fully supported only when:
- section data is validated;
- all required checks for the advertised workflow are implemented;
- independent benchmark tests pass within reviewed tolerances;
- optimizer feasibility logic is proven for the family;
- Model Space shows the correct profile/orientation or clearly labels limitations;
- reports contain traceable calculations and assumptions;
- an engineering reviewer has approved the implementation.

**Do not enable a family based on catalogue presence or successful rendering alone.**
