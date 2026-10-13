# FEM-02 — Shell Drilling-Degree-of-Freedom Stabilization

**Severity:** High  
**Status:** Needs formulation review and sensitivity tests  
**Affected area:** Shell element stiffness

## Observation

The shell implementation appears to determine `kmax` as the maximum of all 18 diagonal stiffness entries, then sets drilling stabilization as `kd = drill * kmax` and adds it to rotational DOFs `[5, 11, 17]`.

Translational and rotational stiffness entries generally have different physical units and scale differently with geometry and units. Taking the raw maximum across all diagonal terms can therefore produce a penalty that is not dimensionally consistent or that varies strongly with element size and unit system.

## Why it matters

Drilling DOFs often require stabilization in shell formulations, but an excessive or poorly scaled penalty can worsen conditioning and distort results. A weak penalty may leave near-zero-energy modes. Mesh density, aspect ratio, thickness, and unit changes can expose these problems.

## Source reference

- [`shell.ts`, near drilling stabilization](https://github.com/BitLess246/civilEngineering/blob/main/webapp/src/engine/shell.ts#L175)

## Recommended actions

1. Document the shell formulation and the theoretical basis for the drilling stabilization term.
2. Use a stabilization parameter with consistent dimensions and a justified characteristic stiffness/length scale.
3. Test unit invariance by converting the same physical model between consistent unit systems.
4. Run mesh refinement and element aspect-ratio sensitivity studies.
5. Inspect stiffness-matrix conditioning and check for spurious zero-energy modes.
6. Compare displacements, reactions, and stresses with a trusted shell benchmark.

## Acceptance criteria

- Results remain stable under reasonable mesh refinement and unit conversion.
- Stabilization does not materially change physical response beyond documented tolerances.
- The formulation and parameter selection are documented and backed by benchmark tests.
