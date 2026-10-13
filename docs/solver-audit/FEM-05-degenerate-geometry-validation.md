# FEM-05 — Degenerate Element Geometry Validation

**Severity:** Medium  
**Status:** Needs input validation and negative tests  
**Affected area:** Frame and shell element creation

## Observation

The frame local-axis construction appears to normalize a member direction without an explicit zero-length guard. The shell triangle-frame construction appears to normalize a cross product without first rejecting a degenerate or near-degenerate triangle.

Invalid geometry can lead to division by zero, NaN/Inf values, invalid transformations, or singular matrices.

## Source references

- [`frame3d.ts`, near `localAxes()`](https://github.com/BitLess246/civilEngineering/blob/main/webapp/src/engine/frame3d.ts#L220)
- [`shell.ts`, near `triFrame()`](https://github.com/BitLess246/civilEngineering/blob/main/webapp/src/engine/shell.ts#L30)

## Recommended actions

1. Reject frame members whose length is below a scale-aware tolerance.
2. Reject shell triangles whose area is below a scale-aware tolerance.
3. Validate all coordinates and derived quantities for finiteness before matrix assembly.
4. Detect invalid material/section values and malformed connectivity before solving.
5. Return actionable validation errors identifying the element ID and reason; do not allow NaN/Inf to spread into global matrices.
6. Add negative tests for coincident frame nodes, collinear shell nodes, repeated node IDs, near-zero area, and non-finite coordinates.

## Acceptance criteria

- Invalid elements are rejected deterministically before solving.
- Error messages identify the affected element and validation rule.
- No invalid geometry case silently returns a result or contaminates unrelated model output.
