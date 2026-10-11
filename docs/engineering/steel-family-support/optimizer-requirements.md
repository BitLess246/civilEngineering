# Family-Aware Steel Optimizer Requirements

## Objective

Allow the optimizer to compare W, HSS, PIPE, C, L, and WT sections where the selected structural workflow and implemented design checks support them. The optimizer must not rank an unchecked or unsupported candidate as a valid solution.

## Current baseline

`webapp/src/engine/trussOptimize.ts` exposes a `families` option and builds candidate sections from `shapesOf(family)`. It can optionally generate double-angle candidates. This is useful candidate-generation infrastructure, but it is not by itself proof of complete design support for each family.

The optimizer should not be enabled for a family/check combination merely because `candidateSections()` can enumerate it.

## Candidate evaluation pipeline

For every candidate section:

1. **Resolve identity** — preserve the requested shape designation and record any alias or substitute.
2. **Validate geometry and data** — confirm required properties, material, units, and catalogue provenance.
3. **Map candidates to members** — apply the candidate to the actual group and member orientations.
4. **Run the shared design engine** — use the same functions as interactive member design.
5. **Check all required limit states** — include applicable strength, stability, slenderness, serviceability, and other checks required by the workflow.
6. **Classify the candidate** — feasible only if all required checks were assessed and passed.
7. **Record rejection reason** — retain the first failure for concise UI display, plus all failures for detailed reports.
8. **Rank feasible candidates** — minimize weight or cost only after feasibility is established.
9. **Recheck the selected solution** — independently rerun the adopted sizes and verify all members before applying them to the model.

## Candidate statuses and ranking

Recommended candidate result:

```ts
type CandidateStatus =
  | 'FEASIBLE'
  | 'FAIL'
  | 'NOT_ASSESSED'
  | 'UNSUPPORTED'
  | 'INVALID_INPUT'

interface CandidateEvaluation {
  sectionName: string
  family: SectionFamily
  status: CandidateStatus
  weightKg: number
  estimatedCost?: number
  utilizationByCheck: Record<string, number | null>
  failedChecks: string[]
  unassessedChecks: string[]
  unsupportedChecks: string[]
  reasons: string[]
}
```

Illustrative type only; align with existing project conventions before implementation.

Rules:
- Only `FEASIBLE` candidates can win.
- `NOT_ASSESSED`, `UNSUPPORTED`, and `INVALID_INPUT` are never treated as pass.
- Do not use a default utilization of zero for missing checks.
- If no candidate is feasible, return “no feasible candidate” with the rejection summary; do not silently select the lightest section.
- When comparing cost, state the cost model and assumptions. If cost is unavailable, rank by weight and label the objective accordingly.
- Keep rejected candidates' reason codes and useful details for transparency.

## Grouping and constructability

Keep the existing group concept where members share a section. Confirm that group membership and force envelopes are valid for the target structural system. For frame optimization, include the actual frame-analysis/design loop and rerun the analysis after sizes change when stiffness/self-weight changes are significant.

For trusses, ensure compression members are checked for the relevant buckling/slenderness requirements and tension members for applicable tensile limit states. Do not assume the truss optimizer's member-force workflow is interchangeable with the 3D frame designer.

Double-angle candidates require a clearly defined pair arrangement, separation/gap, connector assumptions, and checks for built-up member behavior. Do not represent two angles as a single-angle section for strength checks.

## Multi-family optimization strategy

Recommended rollout:
1. Add family filters and a support-status lookup to the optimizer UI.
2. Allow only family/check combinations marked complete.
3. Add family-aware candidate evaluation through the shared design API.
4. Add optimization for HSS and PIPE.
5. Add channels and angles.
6. Add tees.
7. Add optional cost ranking and constructability constraints after strength feasibility is reliable.

## Performance and determinism

- Cache derived properties by section/material/version where safe.
- Keep candidate ordering deterministic.
- Record why each candidate was rejected.
- Avoid silently pruning candidates based on assumptions that are not shown to the user.
- Ensure optimizer cancellation and partial-run states do not leave an apparently final solution.
- Add a candidate-count and runtime guard for broad family searches.

## Required user-facing output

The result should include:
- adopted section per group;
- total weight and cost objective, if available;
- maximum utilization and the governing member/check;
- all required check statuses;
- candidates rejected and why;
- unsupported/not-assessed scope;
- assumptions about bracing, effective length, local axes, load combinations, and serviceability;
- warning that changing member sizes may require reanalysis.

## Acceptance criteria

- No unchecked candidate can win.
- Every rejected candidate has an explicit reason.
- The adopted design is rerun through the shared design engine.
- The optimizer and manual designer report consistent results for the same member, section, material, and assumptions.
- Weight/cost ranking is deterministic and reproducible.
