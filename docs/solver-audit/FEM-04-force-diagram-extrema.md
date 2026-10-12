# FEM-04 — Internal-Force Maxima Based on Sampling

**Severity:** Medium–High  
**Status:** Needs post-processing improvement  
**Affected area:** Member force diagram and design-demand extraction

## Observation

Member force diagrams appear to be sampled at 24 uniform stations plus stations associated with concentrated loads. The reported maxima may therefore be the largest sampled value rather than the true mathematical extremum.

For members under variable distributed loads or combinations of load effects, an extremum can occur between sample stations. The sampling error may underestimate a design demand.

## Source reference

- [`frame3d.ts`, near force-diagram station sampling](https://github.com/BitLess246/civilEngineering/blob/main/webapp/src/engine/frame3d.ts#L860)

## Why it matters

Design checks depend on accurate peak moment, shear, torsion, and axial force demands. A discretization used for plotting should not be assumed adequate for design-critical extrema without an error bound.

## Recommended actions

1. Separate visualization sampling from design-demand extraction.
2. Derive force functions along the member for each supported load type and solve for extrema using analytical roots where practical.
3. Include member ends, point-load locations, load discontinuities, and all valid stationary points.
4. Where closed-form extrema are not practical, use adaptive refinement with a documented tolerance and convergence check.
5. Add tests for uniform, triangular, trapezoidal, and other supported varying loads, including cases with interior extrema.
6. Verify the extracted maximum against a high-resolution reference calculation.

## Acceptance criteria

- Design demands are not based solely on a fixed number of plotting stations.
- Test cases demonstrate capture of known extrema and convergence to reference values.
- The report distinguishes exact/solved extrema from sampled approximations where relevant.
