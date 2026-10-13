# FEM-01 — P-Delta Geometric Stiffness and Member-End Releases

**Severity:** High  
**Status:** Needs code confirmation and a targeted regression test  
**Affected area:** 3D frame second-order analysis

## Observation

The elastic member stiffness path appears to use a condensed stiffness matrix (`klEff`) to account for member-end releases. The P-Delta tangent assembly appears to add a geometric stiffness matrix from the uncondensed member formulation using the member axial force and length (`kgLocal(axialOf(mi), g.L)`).

If geometric stiffness is assembled without applying the same release condensation or an equivalent released-DOF treatment, released rotational DOFs may receive stiffness contributions that the elastic stiffness path intentionally removed.

## Why it matters

A member end modeled as pinned or released must not unintentionally regain rotational restraint through the geometric-stiffness contribution. This could alter second-order displacements, end forces, stability response, and design demands. The actual effect depends on the release configuration, element formulation, and global assembly.

## Source reference

- [`frame3d.ts`, near `prepMemberGeom()`](https://github.com/BitLess246/civilEngineering/blob/main/webapp/src/engine/frame3d.ts#L545)
- [`frame3d.ts`, near geometric-stiffness assembly](https://github.com/BitLess246/civilEngineering/blob/main/webapp/src/engine/frame3d.ts#L1000)

## Recommended actions

1. Trace the exact DOF mapping for member-end releases in both elastic and geometric stiffness assembly.
2. Ensure the geometric stiffness contribution is compatible with the released formulation. Depending on the formulation, this may require condensation of the full tangent matrix or a rigorously equivalent treatment—not simply adding the unreleased matrix.
3. Add regression cases for one-end and two-end moment releases with axial compression and tension.
4. Compare against a trusted analytical solution or independent solver for second-order response.
5. Verify equilibrium, released-end moments, and convergence as the load factor changes.

## Acceptance criteria

- Released-end moments remain consistent with the intended release behavior within documented numerical tolerance.
- Second-order response agrees with a verified benchmark for the same element assumptions and boundary conditions.
- Tests cover multiple release patterns and both compression and tension.
