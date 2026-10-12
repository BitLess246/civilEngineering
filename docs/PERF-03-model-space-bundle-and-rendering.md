# PERF-03 — Profile ModelSpace bundle cost and 3D rendering before splitting further

**Priority:** Medium–High  
**Area:** Frontend bundle / 3D visualization

## Observation

The app already lazy-loads routes, and the ModelSpace page owns a scene with supporting visualization components. This is a good starting point, but the 3D route and its dependency graph should be measured in a production build before making further split decisions.

- [`App.tsx`](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/src/App.tsx#L20)
- [`ModelSpace.tsx`](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/src/pages/ModelSpace.tsx)
- [`scene.tsx`](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/src/components/modelSpace/scene.tsx)
- [`RebarWireframe.tsx`](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/src/components/RebarWireframe.tsx)
- [`ExportPdfButton.tsx`](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/src/components/ExportPdfButton.tsx)

## Why it matters

A lazy route can still have a large first-load cost when the user opens that route. Large 3D, geometry, reporting, or export dependencies can affect parse/evaluation time and time-to-interactive. For large structural models, geometry creation, draw calls, and per-frame work may dominate bundle download time.

This is a profiling target, not a confirmed oversized-chunk defect: bundle sizes and browser traces were not collected during this audit.

## Recommendation

1. Generate a production build and inspect compressed and uncompressed chunk sizes.
2. Use a bundle visualizer to identify the largest modules in the ModelSpace route.
3. Dynamically import optional features such as PDF/report/export panels, advanced rebar display, or infrequently used dialogs only when invoked—if bundle analysis shows they contribute meaningfully.
4. Inspect rendering cost with representative model sizes: frame time, draw calls, triangles, geometry count, GPU memory, and time to create the scene.
5. If repeated members or bars dominate rendering, evaluate instancing or merged geometry while preserving picking, highlighting, and per-element result display.
6. Avoid excessive micro-chunking; additional network requests and module overhead can offset the benefits.

## Validation

Record cold-load route chunk sizes, route-open latency, scene construction time, and steady-state frame time for small and large models.

## Confidence

Medium. The route and scene are clear areas to profile, but a performance problem cannot be confirmed without bundle analysis and browser measurements.
