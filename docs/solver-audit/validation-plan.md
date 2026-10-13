# Validation Plan — 3D Frame and FEM Solver

This plan converts the source-level observations into a repeatable validation program. Passing these tests is necessary evidence, but not by itself a certification of code compliance.

## Priority 1 — Second-order behavior

- [ ] Test one-end and two-end member moment releases with axial compression and tension.
- [ ] Compare released-member P-Delta results against analytical benchmarks or a trusted independent solver.
- [ ] Test shell-only compression and coupled frame-shell second-order response.
- [ ] Confirm unsupported shell P-Delta cases are blocked or explicitly warned.

## Priority 2 — Shell formulation

- [ ] Unit-system invariance for shell stiffness and drilling stabilization.
- [ ] Mesh refinement on square and distorted triangular meshes.
- [ ] Check stiffness conditioning and spurious modes.
- [ ] Compare consistent and lumped shell area-load vectors.
- [ ] Check resultant force and moment, reactions, displacements, and stress convergence.

## Priority 3 — Member demand extraction

- [ ] Test uniform and variable distributed loads.
- [ ] Test point loads and load discontinuities.
- [ ] Include known interior extrema.
- [ ] Compare reported peaks with analytical extrema and a high-resolution reference.
- [ ] Confirm the design envelope does not rely solely on plotting sample points.

## Priority 4 — Invalid input handling

- [ ] Zero-length frame element.
- [ ] Coincident nodes and repeated node IDs.
- [ ] Collinear or near-zero-area shell triangle.
- [ ] Non-finite coordinates and invalid section/material properties.
- [ ] Verify deterministic validation errors before matrix assembly.

## Priority 5 — Code-method traceability

- [ ] Document the stability method used for each supported frame type.
- [ ] Create a provision-by-provision AISC 360-16/NSCP implementation matrix for the advertised features.
- [ ] Verify all load combinations, signs, companion-load rules, and directional cases.
- [ ] Record governing load combinations and analysis assumptions in reports.
- [ ] Keep benchmark inputs, expected results, tolerances, and solver/version details under version control.

## Evidence to retain for each test

For each benchmark, record the model input, expected theoretical/reference result, computed result, relative error, tolerance, software revision, solver settings, and reviewer. For code checks, record the code edition and applicable provision used to define the expected result.
