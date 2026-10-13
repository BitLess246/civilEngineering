# PERF-04 — Design optimization trials are sequential because solver pool state is shared

**Priority:** Medium  
**Area:** Design optimization pipeline

## Observation

The optimization path uses `designStructureWithPool`, and the reviewed pipeline comments indicate concurrent trials would interfere with shared pool state. As a result, trial evaluation is sequential in the current workflow.

- [`pipeline.ts`](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/src/engine/pipeline.ts)

## Why it matters

When optimization explores many candidate designs, total runtime can grow approximately with the number of trials if each candidate is evaluated serially. Simply running trials concurrently is unsafe if they mutate or reinitialize shared solver state.

## Recommendation

1. Profile optimization end-to-end and break out time spent in model setup, analysis, design checks, and report/result assembly.
2. First reduce repeated work that is provably invariant across trials, with explicit cache keys and invalidation when geometry, loads, or properties change.
3. If parallel trials are needed, give each trial isolated solver state or create a worker-level job protocol that prevents shared mutable state.
4. Bound concurrency by memory and model size rather than using unbounded parallelism.
5. Keep deterministic ordering of final results and stable tie-breaking for equally ranked candidates.

## Validation

For a fixed optimization problem, compare the best design, feasibility decisions, objective values, and detailed check outputs between sequential and parallel implementations. Include cancellation and partial-failure scenarios.

## Confidence

Medium–High for the sequential/shared-state constraint described in the source; potential runtime benefit depends on trial cost and available safe parallelism.
