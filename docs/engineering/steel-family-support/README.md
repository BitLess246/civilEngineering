# Steel Section Family Support: Designer and Optimizer Roadmap

## Purpose

Extend Zeta so steel-section families can be represented, designed, and optimized consistently, without treating a drawable section as automatically code-compliant.

This is a planning and implementation specification. It does **not** claim that the work described here is already implemented or validated.

## Current repository baseline

The current AISC metric catalogue declares these families in `webapp/src/engine/aiscSections.ts`:

- `W` — wide-flange shapes
- `WT` — tee shapes
- `C` — channels
- `L` — single angles
- `HSS` — rectangular and square hollow structural sections
- `PIPE` — round hollow sections / pipe

The frame steel-design module, `webapp/src/engine/steelDesign.ts`, derives beam properties using W-shape assumptions and explicitly returns an out-of-scope result for non-W families in its flexure scope check. The truss optimizer in `webapp/src/engine/trussOptimize.ts` can enumerate multiple families as candidates, but candidate enumeration alone does not prove that every family is checked for every applicable limit state.

## Design principles

1. **No unsupported pass.** If a required limit state is not implemented or a required property is unavailable, the member/candidate must be marked `NOT ASSESSED` or `UNSUPPORTED`, never `PASS`.
2. **One design engine.** The optimizer must call the same family-aware design functions used by the designer; do not duplicate strength equations in optimizer code.
3. **Family-specific mechanics.** Do not apply W-shape formulas to tees, channels, angles, HSS, or round sections.
4. **Traceability.** Each check reports the applicable AISC 360-16 clause, assumptions, inputs, demand, nominal strength, resistance factor, available strength, utilization, and result.
5. **Feasibility before economy.** Rank by weight or cost only after every required check passes.
6. **Explicit scope.** Report unsupported load cases, connection assumptions, stability methods, and missing data in the result and exported report.
7. **Catalogue integrity.** Preserve the requested designation; if an alias or substitute is used, show both the original and resolved shape and disclose the substitution.

## Recommended delivery sequence

1. Establish a common family-aware section-property contract and result status model.
2. Add a family/check applicability matrix.
3. Implement and validate HSS and PIPE member checks.
4. Implement and validate channel and angle checks, including unsymmetrical bending where applicable.
5. Implement tee-specific flexural checks.
6. Refactor the optimizer to use the common design result and retain rejection reasons.
7. Add independent benchmarks, family-wide regression tests, and PDF report transparency.
8. Enable each family in the UI only when the checks required by that workflow are supported.

## Related documents

- [Family support matrix](./family-support-matrix.md)
- [Design engine architecture](./design-engine-architecture.md)
- [Optimizer requirements](./optimizer-requirements.md)
- [Validation and test plan](./validation-and-test-plan.md)
- [Implementation checklist](./implementation-checklist.md)

## Safety note

This roadmap is engineering software guidance, not a design approval. Final implementation must be reviewed against the licensed AISC 360-16 specification, authoritative section-property data, and independent engineering calculations before being used for real projects.
