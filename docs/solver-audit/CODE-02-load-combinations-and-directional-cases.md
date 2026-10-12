# CODE-02 — Load Combination and Directional-Case Verification

**Severity:** Verification required  
**Status:** Independent code-compliance review needed  
**Affected area:** Load-combination generation and lateral load cases

## Observation

The load-combination generator is located in `beamAnalysis.ts`. Comments in `pipeline.ts` indicate that supplied lateral directional cases are used verbatim. This means the upstream case-generation or user-input stage must ensure that all required signs and orthogonal directions are present; the downstream pipeline may not generate missing directions automatically.

This audit did not independently establish that the full combination set, factors, companion-load rules, and directional cases are complete for every supported code and design situation.

## Source references

- [`beamAnalysis.ts`, near load-combination generation](https://github.com/BitLess246/civilEngineering/blob/main/webapp/src/engine/beamAnalysis.ts#L35)
- [`pipeline.ts`](https://github.com/BitLess246/civilEngineering/blob/main/webapp/src/engine/pipeline.ts)

## Recommended actions

1. Build a code-by-code matrix of required load combinations and applicable load cases.
2. Verify factors, signs, companion-load rules, orthogonal directional combinations, and required accidental/eccentricity cases where applicable.
3. Confirm whether each required case is generated automatically or must be supplied by the user.
4. Reject or warn on incomplete lateral case sets where the analysis mode requires them.
5. Add tests that assert exact expected combinations for representative NSCP/AISC workflows.
6. Record the governing combination and source case in calculation reports for traceability.

## Acceptance criteria

- Combination coverage is independently checked against the exact code edition and applicable provisions.
- Tests verify both factors and case membership, not just that a non-empty list is produced.
- Missing directional cases cannot silently result in an incomplete design envelope.
