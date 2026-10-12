# PERF-05 — Add an explicit bundle-size budget and performance regression checks

**Priority:** Medium  
**Area:** Build configuration / CI

## Observation

No explicit bundle-size budget was identified in the reviewed `vite.config.ts`. This is a scoped source-review observation, not proof that no budget or performance check exists elsewhere in CI.

- [`vite.config.ts`](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/vite.config.ts)
- [Vite performance guide](https://vite.dev/guide/performance.html)
- [Vite build guide](https://github.com/vitejs/vite/blob/main/docs/guide/build.md)

## Why it matters

Without automated thresholds, dependency growth can increase initial or route-specific download and parse cost without a visible regression signal. A single total bundle limit may be misleading if the app already uses lazy routes; track initial-load assets and key route chunks separately.

## Recommendation

1. Capture a production-build baseline for initial-load JS/CSS and the ModelSpace route.
2. Add a bundle visualizer to a developer or CI workflow.
3. Set realistic warning or failure thresholds for compressed initial assets and important route chunks.
4. Track dependency changes and avoid importing entire libraries when smaller entry points are available.
5. Add repeatable solver benchmarks for representative DOF counts and optimization trial counts. Keep benchmark environments and tolerances stable.
6. Treat thresholds as guardrails, not substitutes for profiling.

## Validation

Confirm the checks run in CI and report the specific chunk or benchmark that regressed. Verify the budget accounts for intentionally lazy-loaded routes.

## Confidence

Medium. No explicit budget was seen in the reviewed Vite config; the rest of the CI setup should be checked before claiming the repository has no performance guardrails.
