# PERF-02 — Frame worker pool may multiply precomputed model state and memory use

**Priority:** High  
**Area:** Worker pool / parallel computation

## Observation

`framePool.ts` chooses a default pool size using `navigator.hardwareConcurrency`, capped at eight workers. Precomputed model data is sent to workers, and each worker reconstructs its own state. This creates a trade-off: more workers can increase throughput for independent tasks, but also duplicate model data and increase memory pressure.

- [`framePool.ts`](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/src/engine/framePool.ts)
- [`frame3d.ts`](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/src/engine/frame3d.ts)

## Why it matters

- Hardware concurrency is not a direct measure of the memory available to the browser tab.
- On a large model, worker-local copies may increase memory use roughly with the number of workers, depending on which structures are copied and retained.
- Extra workers may not help when tasks are too small, memory-bandwidth-bound, or serialized elsewhere.

## Recommendation

1. Benchmark 1, 2, 4, and 8 workers on small, medium, and large representative models.
2. Record total wall time, per-worker initialization time, memory use, and responsiveness of the main thread.
3. Choose worker count based on task count and estimated model size as well as CPU concurrency.
4. Consider transferable typed arrays for one-way data handoff, or shared memory where safe and worthwhile. Transferable buffers change ownership; verify no sender-side reuse is required.
5. Avoid sending identical large payloads repeatedly when a worker can retain valid state across tasks.
6. Add a fallback for devices with limited memory and ensure workers are terminated or reused deliberately.

## Validation

Compare output determinism and numerical agreement across worker counts. Confirm cancellation, worker errors, and stale model data are handled correctly.

## Confidence

High confidence that worker count and worker-local state are a performance/memory trade-off; the best cap depends on workload and must be measured.
