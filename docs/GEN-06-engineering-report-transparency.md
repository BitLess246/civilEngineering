# GEN-06 — Engineering Report Transparency and Design Traceability

**Priority:** Medium–High  
**Area:** Structural calculation reports

## Observation

The earlier audit identified gaps in engineering-report content. Reports should expose enough demand, capacity, assumptions, and governing logic for a qualified engineer to independently review the result, rather than showing only a pass/fail indicator.

Items specifically flagged for clearer reporting include:

- Demands and capacities for both relevant axes.
- Effective lengths and bracing assumptions.
- The governing equation or check.
- Unsupported or unimplemented checks.

## Risks

- Reviewers may be unable to reproduce or understand a reported utilization ratio.
- Important axis-specific failures or assumptions may be hidden.
- A passing result may be mistaken for a complete code-compliant design when some checks are unsupported.

## Recommended actions

1. Report the governing load combination and analysis assumptions.
2. Show demand, nominal/design capacity, units, utilization, and pass/fail status for each applicable axis and limit state.
3. Expose effective-length factors/lengths, bracing assumptions, and the stability method actually used.
4. Identify the governing equation and relevant code edition/provision where supported.
5. Explicitly list checks that are not implemented or were skipped; do not silently imply compliance.
6. Preserve adequate precision for auditability while distinguishing displayed rounding from values used internally.
7. Include warnings for assumptions or input ranges that exceed the validated scope.

## Acceptance criteria

- A qualified reviewer can trace each reported check from input and demand through capacity and governing criterion.
- Unsupported checks are clearly disclosed.
- Reports identify the code edition, method, units, and governing combination.
