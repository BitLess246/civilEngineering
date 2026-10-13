# Zeta 3D Frame and FEM Solver Audit

**Project:** Zeta structural engineering web application  
**Repository:** https://github.com/BitLess246/civilEngineering  
**Audit scope:** Source-level review of the 3D frame solver, shell/FEM implementation, post-processing, and related design-code workflow.

## Important limitation

This is a source-code audit, not a certification of the software or its engineering outputs. The tests were not executed as part of this review, and no independent numerical reproduction or full validation campaign was performed. Findings below identify implementation risks to investigate; confirm each against the current code and controlled test cases before changing production behavior.

## Findings index

| ID | Severity | Finding | Main source reference |
|---|---|---|---|
| FEM-01 | High | P-Delta geometric stiffness may not respect member-end releases | `webapp/src/engine/frame3d.ts` around lines 545 and 1000 |
| FEM-02 | High | Shell drilling stabilization may be dimensionally inconsistent and mesh-sensitive | `webapp/src/engine/shell.ts` around line 175 |
| FEM-03 | High for shell models with P-Delta | Shell initial-stress geometric stiffness appears omitted from P-Delta assembly | `webapp/src/engine/frame3d.ts` around lines 790 and 1000 |
| FEM-04 | Medium–High | Sampled force diagrams may miss true internal-force extrema | `webapp/src/engine/frame3d.ts` around line 860 |
| FEM-05 | Medium | Degenerate frame and shell geometry may propagate NaN/Inf or singular matrices | `frame3d.ts` around line 220; `shell.ts` around line 30 |
| FEM-06 | Medium | Shell area loads are equally lumped to triangle nodes rather than consistently distributed | `webapp/src/engine/modelBridge.ts` around line 380 |
| CODE-01 | Compliance caveat | `bracedFrame` K-factor workflow is not the AISC 360-16 Direct Analysis Method | `webapp/src/engine/pipeline.ts` around line 60 |
| CODE-02 | Verification required | Load-combination and directional-case coverage needs independent verification | `beamAnalysis.ts` around line 35; `pipeline.ts` comments |

## Positive observations

- The frame local stiffness formulation includes standard 12-DOF axial, torsional, and biaxial bending terms, with Euler–Bernoulli/Timoshenko behavior noted in the implementation (`frame3d.ts` around line 170).
- Local/global coordinate transformations and rigid offsets are implemented (`frame3d.ts` around line 330).
- Elastic stiffness assembly includes static condensation for released member-end DOFs.
- The repository contains closed-form frame and shell tests (`frame3d.test.ts` around line 20; `shell.test.ts` around line 30).
- The analysis pipeline appears to fail design when P-Delta fails or is skipped (`pipeline.ts` around line 540).

These positives do not by themselves establish code compliance or solver validation.

## Recommended order of work

1. Investigate FEM-01 and FEM-03 before relying on second-order analysis for released members or shell-containing models.
2. Review FEM-02 and perform mesh/parameter sensitivity studies for shell elements.
3. Replace or supplement sampled force maxima with exact extrema calculations (FEM-04).
4. Add geometry validation and explicit errors for invalid elements (FEM-05).
5. Verify shell-load work equivalence and mesh convergence (FEM-06).
6. Document the supported stability-design method and validate load combinations/cases (CODE-01 and CODE-02).

## Source links

- [frame3d.ts](https://github.com/BitLess246/civilEngineering/blob/main/webapp/src/engine/frame3d.ts)
- [shell.ts](https://github.com/BitLess246/civilEngineering/blob/main/webapp/src/engine/shell.ts)
- [modelBridge.ts](https://github.com/BitLess246/civilEngineering/blob/main/webapp/src/engine/modelBridge.ts)
- [pipeline.ts](https://github.com/BitLess246/civilEngineering/blob/main/webapp/src/engine/pipeline.ts)
- [beamAnalysis.ts](https://github.com/BitLess246/civilEngineering/blob/main/webapp/src/engine/beamAnalysis.ts)
- [frame3d.test.ts](https://github.com/BitLess246/civilEngineering/blob/main/webapp/src/engine/frame3d.test.ts)
- [shell.test.ts](https://github.com/BitLess246/civilEngineering/blob/main/webapp/src/engine/shell.test.ts)
