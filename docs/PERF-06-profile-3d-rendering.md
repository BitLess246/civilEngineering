# PERF-06 — Measure 3D geometry and frame-time cost on large models

**Priority:** Profile first  
**Area:** 3D model rendering

## Observation

The ModelSpace scene and rebar wireframe are likely places where model complexity can translate into geometry, draw-call, and per-frame work. Source inspection alone does not establish that rendering is currently slow.

- [`ModelSpace.tsx`](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/src/pages/ModelSpace.tsx)
- [`scene.tsx`](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/src/components/modelSpace/scene.tsx)
- [`RebarWireframe.tsx`](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/src/components/RebarWireframe.tsx)

## Measurements to collect

- Time to build or update scene geometry.
- Frame time during orbit, zoom, selection, and result overlays.
- Draw calls, triangle count, object count, and GPU memory where tooling permits.
- React render/commit activity during selection and result changes.
- Performance for representative small, medium, and large structural models.

## Optimization options, only if profiling supports them

- Instance repeated members, bolts, bars, or other similar geometry.
- Merge static geometry where it does not break per-element selection or result coloring.
- Reuse buffers and geometry across updates when dimensions and topology have not changed.
- Avoid rebuilding the entire scene for a local property or selection change.
- Reduce detail for distant or non-selected elements if the application can preserve engineering meaning and inspection accuracy.
- Keep expensive labels and overlays conditional on visibility or zoom level.

## Validation

Test selection, hover, element highlighting, result contours, visibility toggles, and export/picking after any geometry optimization. Ensure visual simplifications do not hide relevant engineering results.

## Confidence

This is a measurement recommendation, not a confirmed defect. No runtime profile was performed.
