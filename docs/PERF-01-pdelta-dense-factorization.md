# PERF-01 — P-Delta iteration densifies and repeatedly factorizes the tangent stiffness matrix

**Priority:** High  
**Area:** Structural solver / nonlinear analysis

## Observation

The reviewed P-Delta path converts the tangent stiffness representation to a dense matrix and performs repeated factorization/solution work during iteration. Relevant code is in `frame3d.ts` around the P-Delta assembly/iteration path and `fem.ts` around the factorization implementation.

- [`frame3d.ts`](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/src/engine/frame3d.ts#L1020)
- [`fem.ts`](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/src/engine/fem.ts#L310)
- [`sparseSym.ts`](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/src/engine/sparseSym.ts)

The source also defines a dense-DOF cutoff around 5,000 DOFs, beyond which the P-Delta path can be skipped. A 5,000 × 5,000 dense matrix contains 25 million entries; at eight bytes per numeric value that is roughly 200 MB for one raw value array, before temporary copies and JavaScript object/array overhead. Actual memory depends on the representation. If factorization copies the matrix, peak memory can be substantially higher.

## Why it matters

- Large frame models can spend substantial time allocating, copying, and factorizing dense matrices.
- Peak memory may grow sharply as the model approaches the dense-DOF limit.
- Skipping P-Delta above a size threshold can limit scalability or create a discontinuity in analysis capability across model sizes.

## Recommendation

1. Profile matrix assembly, conversion, factorization, and iteration separately on representative models.
2. Evaluate a sparse solver appropriate for the assembled tangent matrix and its symmetry/definiteness properties. Do not assume a generic positive-definite solver is valid: geometric stiffness can affect definiteness.
3. Preserve pivoting, singularity detection, convergence checks, and explicit failure reporting.
4. If a sparse implementation is not immediately feasible, document the threshold and return a clear unsupported/failed status rather than silently implying a complete P-Delta result.
5. Compare displacements, reactions, member forces, convergence behavior, and instability cases against trusted reference solutions.

## Validation

- Benchmark increasing DOF counts and record wall time and peak memory.
- Include stable, near-singular, and unstable benchmark models.
- Verify first-order and P-Delta results remain distinguishable and that failed iterations cannot be reported as successful.

## Confidence

High confidence that dense conversion/factorization is a scaling risk from source inspection; actual speedup and memory reduction require benchmarks.
