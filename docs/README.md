# Audit records

Two audits live in this folder: the general repository audit (GEN-01…08) and the performance audit (PERF-01…06). The solver audit is in [`solver-audit/`](solver-audit/README.md).

## Zeta — Previous General Repository Audit

**Project:** Zeta structural engineering web application  
**Repository:** https://github.com/BitLess246/civilEngineering  
**Audit type:** General security, reliability, engineering-report, and validation review  
**Scope note:** These documents capture the findings from the earlier general audit, before the separate 3D frame/FEM solver audit. They are investigation and remediation notes, not a penetration-test report or proof that an issue has been exploited.

### Findings index

| ID | Priority | Finding | Main area |
|---|---|---|---|
| GEN-01 | High / security hygiene | Repository is public; review exposure and transition to private if intended | GitHub repository access |
| GEN-02 | High | API abuse controls may be incomplete without layered rate limits | API routes |
| GEN-03 | High | Guest quota logic can fail open under certain missing-data/error conditions | Quota enforcement |
| GEN-04 | Medium–High | CI dependencies/actions should be pinned to immutable versions | GitHub Actions / Supabase CLI |
| GEN-05 | High | Billing webhook read-check-write flow may race under concurrent delivery | Billing/webhook handling |
| GEN-06 | Medium–High | Engineering reports omit information needed for transparent design review | Calculation reports |
| GEN-07 | High | Independent engineering validation is incomplete across modules and pipelines | Structural calculations |
| GEN-08 | Medium–High | Soil-investigation persistence needs robust save-failure behavior | `soils/store.ts`, `useInvestigation.ts` |

### Recommended remediation order

1. Review repository visibility, commit history, secrets, deployment integrations, and collaborator access.
2. Make quota enforcement resilient to errors and apply rate limits at multiple layers.
3. Make webhook processing idempotent and concurrency-safe.
4. Pin CI dependencies/actions and review permissions.
5. Improve calculation-report traceability and unsupported-check disclosures.
6. Build independent verification and regression coverage for engineering calculations.
7. Ensure soil-investigation edits survive failed saves and the user receives clear feedback.

### Important limitation

This is a record of the earlier source-level audit. Findings should be confirmed against the current branch and deployment configuration before treating them as current defects. No claim is made here that secrets were leaked, an endpoint was abused, a webhook race was exploited, or engineering outputs are necessarily incorrect.

---

## Zeta Performance Audit

**Repository:** https://github.com/BitLess246/civilEngineering  
**Reviewed revision:** `a6d937fde8f325f88ad879778d93494799643a62` (`main`)  
**Audit type:** Source-level performance review

### Scope and limitations

This audit records performance opportunities supported by the repository source. It was not a benchmark run: no production build, browser profiling session, representative large model, or solver comparison was executed. Therefore, expected impact is described qualitatively and should be confirmed with measurements before and after changes.

### Findings

| ID | Priority | Finding |
|---|---|---|
| PERF-01 | High | P-Delta iteration densifies and repeatedly factorizes the tangent stiffness matrix |
| PERF-02 | High | Frame worker pool can multiply precomputed model state and memory use |
| PERF-03 | Medium–High | 3D model-space route and scene deserve bundle/render profiling |
| PERF-04 | Medium | Optimization trials are sequential due to shared pool state |
| PERF-05 | Medium | No explicit bundle-size budget was identified in the reviewed Vite configuration |
| PERF-06 | Measure first | Detailed 3D geometry may become a rendering bottleneck on large models |

### Recommended order

1. Establish reproducible baselines for solver time, peak memory, initial load, route chunk sizes, and 3D frame time.
2. Investigate sparse P-Delta factorization and preserve instability/singularity diagnostics.
3. Benchmark worker counts and model-state duplication.
4. Profile the production ModelSpace route and split optional features only where the profile justifies it.
5. Add performance regression checks and a bundle-size budget.

### Source references

Links are pinned to the reviewed revision so that line changes in later commits do not silently change the audit context.

- [frame3d.ts — P-Delta path](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/src/engine/frame3d.ts#L1020)
- [fem.ts — matrix factorization](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/src/engine/fem.ts#L310)
- [framePool.ts — worker pool](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/src/engine/framePool.ts)
- [pipeline.ts — design optimization](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/src/engine/pipeline.ts)
- [App.tsx — route loading](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/src/App.tsx#L20)
- [ModelSpace.tsx](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/src/pages/ModelSpace.tsx)
- [scene.tsx](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/src/components/modelSpace/scene.tsx)
- [RebarWireframe.tsx](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/src/components/RebarWireframe.tsx)
- [sparseSym.ts](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/src/engine/sparseSym.ts)
- [ExportPdfButton.tsx](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/src/components/ExportPdfButton.tsx)
- [vite.config.ts](https://github.com/BitLess246/civilEngineering/blob/a6d937fde8f325f88ad879778d93494799643a62/webapp/vite.config.ts)
- [Vite performance guide](https://vite.dev/guide/performance.html)
- [Vite build guide](https://github.com/vitejs/vite/blob/main/docs/guide/build.md)
