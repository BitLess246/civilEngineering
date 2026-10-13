# FEM-06 — Shell Area Load Distribution

**Severity:** Medium  
**Status:** Needs formulation review and convergence tests  
**Affected area:** Shell load transfer / model bridge

## Observation

Shell area loads appear to be lumped equally to the three nodes of each triangular element (`qA/3`). This preserves the total resultant force for a constant load on a triangle, but it may not reproduce the consistent element load vector, including any required rotational components for the selected shell formulation.

## Source reference

- [`modelBridge.ts`, near shell area-load transfer](https://github.com/BitLess246/civilEngineering/blob/main/webapp/src/engine/modelBridge.ts#L380)

## Why it matters

Equal nodal lumping can produce different deflections and local response from a consistent element load vector, particularly on coarse meshes and for shell formulations with rotational DOFs. Force conservation alone does not establish equivalence of the load distribution.

## Recommended actions

1. Confirm the intended shell formulation and its consistent load-vector requirements.
2. Implement the consistent element load vector where required, including rotational terms if the formulation requires them.
3. If lumping is intentional, document the approximation and the cases for which it is supported.
4. Compare consistent and lumped loading on benchmark plates/shells under uniform pressure.
5. Check total resultant force and moment, nodal reactions, displacements, and mesh convergence.

## Acceptance criteria

- The selected load-vector method is documented and matches the element formulation.
- Benchmarks establish acceptable response and convergence.
- The implementation preserves both the correct resultant force and moment, not merely the total force.
