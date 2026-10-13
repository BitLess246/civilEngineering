# Frame worker pool performance validation

This checklist accompanies the adaptive worker sizing and worker-failure handling in `framePool.ts`.

## Why benchmark before tuning

Each worker receives the serialized frame precomputation and retains a deserialized copy. More workers can shorten a batch of independent load cases, but also duplicate solver state and compete with the browser. The current DOF thresholds are conservative initial guardrails, not measured optima; do not describe them as proven speedups until this protocol has been run on representative hardware.

## Benchmark matrix

Use the same saved models, options, load combinations, and browser build for each run:

| Model class | Required variants | Primary risk |
| --- | --- | --- |
| Small 2D/3D frame | 1, 2, 4 workers where applicable | Startup overhead dominates |
| Typical multistorey building | 1, 2, 4, 8 workers where applicable | Useful throughput versus UI responsiveness |
| Frame with many load combinations | 1, 2, 4, 8 workers where applicable | Parallel throughput |
| Shell-enabled model, low subdivision | 1, 2, 4 workers where applicable | Serialization and duplicated precomputation |
| Shell-enabled model, high subdivision | 1, 2 workers where applicable | Peak memory / worker failure |

## Measurements to record

For each run, collect at least 5 warm runs after one warm-up and report median plus range:

- Model size: nodes, members, plates, shell subdivision, estimated DOFs, and number of solved combinations.
- End-to-end wall time, pool startup/init time, and total solve time.
- Peak memory when the browser exposes a reliable measurement; otherwise mark it unavailable rather than estimating it.
- UI responsiveness during the calculation.
- Whether the run completed, timed out, or hit a worker error.

Do not compare a cold worker-spawn run with a warm run from another configuration.

## Numerical equivalence gate

For each model and option set, compare the 1-worker result with the parallel result before accepting any performance claim. Check:

- Analysis completion state and solver warnings.
- Support reactions and global equilibrium.
- Displacements and rotations.
- Member end forces and recovered diagrams.
- Governing combinations, design utilization, and final pass/fail statuses.

Set explicit tolerances before reviewing the results. Investigate differences; never suppress a mismatch to improve a timing score.

## Decision rules

- Keep a worker count only when median end-to-end time improves beyond run-to-run noise and model results remain equivalent.
- Prefer fewer workers when memory use or UI responsiveness degrades materially.
- Revisit the 8,000 and 20,000 estimated-DOF tiers only with benchmark evidence from small, typical, and shell-heavy models.
- Record browser, operating system, CPU logical-core count, and app commit with each result.
