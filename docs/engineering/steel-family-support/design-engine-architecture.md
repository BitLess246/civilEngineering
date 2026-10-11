# Family-Aware Steel Design Engine

## Objective

Replace W-only assumptions in frame-member steel design with an explicit family-aware property and limit-state architecture. Preserve existing behavior where it is valid, and fail visibly where support is incomplete.

## Current baseline and concern

`webapp/src/engine/steelDesign.ts` documents that its derived beam properties use W-shape geometry and that non-W families are out of scope for its current flexure path. This is a good fail-closed starting point: do not remove these guards until the relevant family implementation is complete.

A section object in `aiscSections.ts` carries common properties such as area and radii of gyration plus optional family-specific dimensions. Optional fields must be validated before any formula uses them.

## Proposed architecture

### 1. Validated section properties

Create or formalize a family-discriminated property API. Possible conceptual shape:

```ts
type SectionProperties =
  | { family: 'W'; A: number; Ix: number; Iy: number; Sx: number; Sy: number; Zx?: number; Zy?: number; J: number; Cw?: number; /* ... */ }
  | { family: 'HSS'; A: number; Ix: number; Iy: number; /* wall and torsion properties */ }
  | { family: 'PIPE'; A: number; Ix: number; Iy: number; /* circular properties */ }
  | { family: 'C'; A: number; Ix: number; Iy: number; /* shear-center / torsion properties */ }
  | { family: 'L'; A: number; Ix: number; Iy: number; /* principal-axis / centroid data */ }
  | { family: 'WT'; A: number; Ix: number; Iy: number; /* tee-specific properties */ }
```

This is an illustrative type design, not code ready to paste. Choose exact properties based on implemented checks and the source catalogue. Avoid treating every property as optional if a check requires it.

Validate at the boundary:
- all required dimensions and properties are finite and positive;
- geometric relationships are physically possible;
- section area and inertias are positive;
- catalogue values have known units and source/version;
- derived values are finite;
- any approximated property is identified and its effect is documented.

### 2. Family-specific derivation

Use separate derivation functions, for example:
- `deriveWSection`
- `deriveHssSection`
- `derivePipeSection`
- `deriveChannelSection`
- `deriveAngleSection`
- `deriveWTSection`

Do not route all families through `deriveWSection`. In particular:
- a tee is not a doubly symmetric I-shape;
- a channel is singly symmetric and may have shear-center/torsional effects;
- an angle is unsymmetrical, and bending about principal axes or eccentric loading can govern;
- HSS and round sections need wall/local-slenderness checks and family-specific torsion treatment.

Where authoritative tabulated section properties exist, prefer those over a rough geometric reconstruction for design. If properties are derived from nominal dimensions, clearly state the idealization and independently verify the results.

### 3. Check functions return structured outcomes

Each check should return a typed result with:
- check identifier and description;
- governing code edition and clause;
- status (`PASS`, `FAIL`, `NOT_ASSESSED`, `UNSUPPORTED`, or `INVALID_INPUT`);
- demand and units;
- nominal strength and units;
- resistance factor / safety factor as applicable;
- available design strength and units;
- utilization where meaningful;
- governing limit state;
- assumptions and reasons;
- source data / section designation.

Avoid representing an unsupported check as zero strength without a reason, or as a passing check. A numeric zero may be used internally only if the status remains authoritative and cannot be ignored by callers.

### 4. Family-aware design orchestration

Provide a single entry point that selects the correct family implementation and returns a complete result. The UI, reports, and optimizer should consume this result rather than re-implementing the equations.

The orchestration layer should:
1. validate the selected section and material;
2. identify the load effects and applicable checks;
3. verify that every required check is supported;
4. run supported checks;
5. preserve all statuses and reasons;
6. calculate an overall result only when all required checks are accounted for;
7. include analysis/design limitations in the report.

### 5. Combined loading and stability

Combined axial force and bending must use a consistent set of design strengths and applicable interaction equations. Do not combine a W-specific flexural result with a family-agnostic compression result unless applicability and axes are proven.

For unsymmetrical sections, the implementation must explicitly define local axes, principal axes, load eccentricities, and how analysis moments map to the section's axes. Torsional response and shear-center offsets should be addressed where relevant. If the frame analysis engine does not model a necessary effect, report that limitation instead of implying a complete check.

### 6. Separation of member and connection design

Member strength does not prove connection adequacy. Keep connection checks separate and explicitly report whether connections, base plates, welds, bolts, and local connection limit states were checked for the selected section family.

## Recommended implementation order

1. Inventory all call sites of `deriveWSection`, `beamFlexureScope`, `beamShear`, `columnAxial`, `combinedLoading`, and `weakAxisFlexure`.
2. Define typed section properties and status contracts without changing numerical results.
3. Add independent tests for existing W behavior and preserve valid baselines.
4. Add HSS and PIPE derivations and applicable checks.
5. Add channel and angle behavior, including unsymmetrical bending and torsion scope.
6. Add tee-specific checks.
7. Remove family-level guardrails only when corresponding checks are complete and validated.
8. Update UI and structured PDF exports to show all check statuses and assumptions.

## Acceptance criteria

- No non-W section can enter a W-only formula without an explicit validated conversion (normally it should not).
- Missing dimensions and non-finite values return `INVALID_INPUT`.
- Unsupported required checks cannot produce an overall pass.
- Results include traceable clause references, units, and assumptions.
- Existing W regression tests remain stable except for reviewed, documented corrections.
