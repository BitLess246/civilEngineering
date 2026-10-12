# FEM-03 — Shell Geometric Stiffness in P-Delta Analysis

**Severity:** High for models that combine shell elements with second-order analysis  
**Status:** Needs confirmation and a shell-specific benchmark  
**Affected area:** P-Delta tangent assembly for shell/FEM models

## Observation

The solver appears to assemble shell elastic stiffness through the shell element path, while the P-Delta geometric-stiffness assembly iterates over frame-member geometry (`geoms`). Shell elements (`shellGeoms`) do not appear to contribute their own initial-stress geometric stiffness in that assembly path.

If confirmed, shell membrane forces would not contribute to the shell geometric stiffness used for second-order response.

## Why it matters

Initial membrane stress can affect shell stability and second-order response. Omitting the corresponding geometric stiffness can be important for plate/shell systems, especially when compression, buckling, or coupled frame-shell behavior governs.

## Source references

- [`frame3d.ts`, near shell stiffness assembly](https://github.com/BitLess246/civilEngineering/blob/main/webapp/src/engine/frame3d.ts#L790)
- [`frame3d.ts`, near P-Delta geometric-stiffness assembly](https://github.com/BitLess246/civilEngineering/blob/main/webapp/src/engine/frame3d.ts#L1000)

## Recommended actions

1. Confirm whether shell geometric stiffness is intentionally unsupported, handled elsewhere, or omitted.
2. If unsupported, block or clearly warn on shell-containing models when the requested analysis depends on shell P-Delta effects.
3. If supported, implement a formulation-appropriate shell initial-stress stiffness contribution based on the element's membrane stress state.
4. Validate using a benchmark where shell compression produces a known second-order response or critical load.
5. Test shell-only and coupled frame-shell models, including mesh refinement.

## Acceptance criteria

- The supported analysis scope is explicit in the UI and output report.
- Shell P-Delta behavior matches an independent benchmark when advertised as supported.
- Unsupported cases cannot silently produce results that appear fully second-order.
