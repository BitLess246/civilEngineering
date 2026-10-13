# CODE-02 — Load Combination and Directional-Case Verification

**Severity:** Verification required  
**Status:** ◐ Partly addressed — see *Resolution* below; independent code-compliance review still needed  
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

## Resolution (October 2026)

What shipped, against the recommended actions:

- **(2) Factors and companion rules.** NSCP 2015 Eq. 203-3 is now two
  alternatives, `1.2D + 1.6(Lr|S|R) + f₁L` and `1.2D + 1.6(Lr|S|R) + 0.5W`. The
  old single combination summed both, so wherever L relieves the 0.5W effect
  it under-reported that case. `nscpCombos` returns 8 combinations; indices
  0–6 are unchanged.
- **(4) Incomplete lateral sets.** `lateralCoverage.ts` checks the directional
  E/W cases the envelope is built from. It flags a case with no
  opposite-sense twin (§208.5.1.1, §207B), and a structure spanning plan in X
  and Z that is loaded along one axis only (§208.5.1.1, §208.8.1, §207B);
  planar frames are exempt from the axis check. The result is
  `StructureDesign.lateralCoverage`. A non-empty list fails `designOK`, adds a
  failed check and a limitation to the report, and shows a banner in Model
  Space. The optimizers drive to `sizingOK` instead (designOK without this
  gate), because resizing members cannot add a missing load direction.
- **(5) Exact tests.** `beamAnalysis.test.ts` pins every factor of every
  combination for f₁ = 1.0 and 0.5. `pipeline.test.ts` shows an X-only set
  and a one-sided set are reported and fail the design, and that a full
  ±X/±Z set raises nothing.

Still open:

- **(1, 3)** An independent code-by-code matrix covering the AISC 360 and
  ASCE-referenced workflows, by a reviewer outside this codebase.
- **(6)** The governing combination name is already in the report (`govName`
  and each member's `gov`); a per-case source table is not.
