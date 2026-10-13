# CODE-01 — AISC 360-16 Direct Analysis Method Scope

**Severity:** Compliance caveat; potentially high if the application claims full AISC 360-16 stability-design compliance  
**Status:** Clarify supported method and prevent misleading claims

## Observation

The `pipeline.ts` comments indicate that the `bracedFrame` workflow uses an alignment-chart K-factor method rather than the AISC 360-16 Direct Analysis Method (DAM).

A K-factor workflow is not interchangeable with the full Direct Analysis Method. A claim of DAM compliance requires the applicable method provisions to be implemented and verified, including relevant second-order analysis, notional loads, stiffness reductions, and the other applicable requirements for the chosen design route.

## Source reference

- [`pipeline.ts`, near the `bracedFrame` workflow comments](https://github.com/BitLess246/civilEngineering/blob/main/webapp/src/engine/pipeline.ts#L60)

## Recommended actions

1. State explicitly which stability-design method is implemented for each frame type and analysis mode.
2. Do not label the current K-factor workflow as AISC 360-16 Direct Analysis Method unless all applicable requirements are implemented and verified.
3. If DAM is a target feature, prepare a clause-by-clause implementation matrix for the applicable AISC 360-16 provisions.
4. Verify notional loads, stiffness reductions, second-order effects, and all relevant member/structure checks against published examples and an independent solver.
5. Add method-specific test cases and report the method actually used in the calculation output.

## Acceptance criteria

- UI, reports, and documentation accurately identify the implemented stability method.
- A Direct Analysis Method claim is made only after provision-by-provision verification.
