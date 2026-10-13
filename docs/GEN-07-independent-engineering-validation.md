# GEN-07 — Independent Validation of Engineering Calculations

**Priority:** High  
**Area:** Structural calculation modules, analysis pipelines, boundary conditions, and reports

## Observation

The earlier audit found that many engineering modules remained unaudited and that some validation may reuse the same algebra or assumptions as the implementation being tested. Tests that duplicate production formulas can reproduce the same defect and therefore do not constitute independent verification.

## Recommended validation approach

1. Build a module inventory and map each public calculation feature to its solver, design checks, report path, and code provisions.
2. Select analytical benchmarks with known results for simple cases.
3. Compare representative cases against a trusted independent solver or hand calculations by a qualified engineer.
4. Test boundary conditions, releases, offsets, units, load combinations, sign conventions, and failure/unsupported paths.
5. Add regression tests for every corrected defect.
6. Use property checks where suitable: equilibrium, symmetry, dimensional consistency, conservation of resultants, and mesh/refinement convergence.
7. Test complete end-to-end pipelines, not only individual helper functions.
8. Review reports separately to ensure they faithfully reflect computed values and limitations.
9. Keep benchmark inputs, expected values, tolerances, solver versions, and reviewer sign-off under version control.

## Risks

- Unit tests can pass while the underlying engineering formulation is wrong.
- A correct solver result can be displayed incorrectly or paired with the wrong combination.
- A module can pass simple cases but fail at boundaries, unusual geometry, or mixed element types.

## Acceptance criteria

- Every advertised engineering feature has a documented validation status.
- Independent benchmarks exist for important design and analysis paths.
- Regression tests cover known defects and critical boundary cases.
- Validation claims are proportional to the evidence; software testing is not presented as professional certification.
