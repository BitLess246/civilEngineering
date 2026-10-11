# Steel Family Support Matrix

## How to read this matrix

“Catalogue / geometry” means a family is represented in the shape catalogue or 3D rendering path. It does **not** imply that all design limit states are implemented. “Optimizer candidates” means the truss optimizer can enumerate shapes from the family; it does not guarantee a complete, code-compliant design for that candidate.

The matrix below is a roadmap-level assessment of the current code paths. Reconfirm each entry against the current branch before implementation or release.

| Family | Typical section behavior | Catalogue / geometry | Frame steel design status | Truss optimizer candidate status | Recommended priority |
|---|---|---|---|---|---|
| W | Doubly symmetric I-shape | Present | Partial; implemented W-based checks have explicit limits, including noncompact/slender web cases | Can be enumerated | Baseline: close existing gaps first |
| HSS rectangular/square | Closed box; local buckling and wall slenderness are important | Present | Not fully supported by the W-based frame design path | Can be enumerated; verify all applicable checks | 1 |
| PIPE / round HSS | Circular closed section; different flexure/compression/shear behavior | Present | Not fully supported by the W-based frame design path | Can be enumerated; verify all applicable checks | 1 |
| C | Open, singly symmetric channel; shear-center and torsional behavior matter | Present | Not fully supported by the W-based frame design path | Can be enumerated; verify all applicable checks | 2 |
| L | Unsymmetrical angle; eccentricity and principal axes matter | Present | Not fully supported by the W-based frame design path | Can be enumerated; verify all applicable checks | 2 |
| WT | Tee; stem/flange orientation and tee-specific limit states matter | Present | Explicitly out of scope in the current W-section flexure path; AISC §F9 is noted as not implemented | Can be enumerated; verify all applicable checks | 3 |

## Required support statuses

Use explicit machine-readable statuses instead of a single boolean where practical:

- `SUPPORTED`: all checks required for the requested design case ran successfully.
- `FAIL`: checks ran and at least one required check failed.
- `NOT_ASSESSED`: a required check could not be evaluated due to missing inputs, convergence, or another runtime issue.
- `UNSUPPORTED`: the family, limit state, or analysis method is outside implemented scope.
- `INVALID_INPUT`: section data or user inputs failed validation.

A candidate is feasible only when every required check is `SUPPORTED` and passes. A candidate with any `NOT_ASSESSED`, `UNSUPPORTED`, or `INVALID_INPUT` check must not be ranked as a feasible design.

## Checks to map by family

This is a planning checklist, not a substitute for the governing specification. Determine applicability from the exact member type, load effects, geometry, and selected AISC edition.

| Check category | W | HSS / PIPE | C | L | WT |
|---|---|---|---|---|---|
| Section-property validation | Required | Required | Required | Required | Required |
| Tension strength and applicable limit states | Required where tension occurs | Required where tension occurs | Required where tension occurs | Required where tension occurs | Required where tension occurs |
| Compression strength / buckling | Required | Required | Required | Required | Required |
| Flexure and lateral/torsional stability | Required | Family-specific | Family-specific | Family-specific | Tee-specific |
| Shear | Required | Family-specific | Family-specific | Family-specific | Family-specific |
| Combined axial force and bending | Required | Required where applicable | Required where applicable | Must address unsymmetrical bending/eccentricity | Required where applicable |
| Local element / wall slenderness | Required | Required | Required | Required | Required |
| Torsion / shear-center effects | Where applicable | Where applicable | Important where applicable | Important where applicable | Where applicable |
| Serviceability / deflection | Required where requested | Required where requested | Required where requested | Required where requested | Required where requested |
| Connection design | Separate scope; do not infer from member capacity | Separate scope | Separate scope | Separate scope | Separate scope |

## UI behavior

- Disable or hide unsupported family choices for a given workflow, or allow selection only with a clear “not yet supported for this check” warning.
- Do not display a green pass badge when any required check is not assessed.
- Show the original designation and resolved catalogue designation when aliases or substitutions are used.
- In reports, list all required checks, including checks that are unsupported or not assessed.
