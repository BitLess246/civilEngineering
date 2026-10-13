# Steel Family Validation and Test Plan

## Goal

Prove that section properties, member checks, and optimizer outcomes are correct and fail safely for every enabled family. A test that only verifies that a shape can be drawn or enumerated is insufficient.

## 1. Section catalogue validation

For every catalogue row in each family:

- required dimensions and properties exist;
- all numeric values are finite and in the expected units;
- dimensions and section properties are physically valid;
- area and required inertias/radii are positive;
- section labels parse consistently;
- catalogue aliases resolve deterministically;
- alias substitutions preserve the original requested label and are visible;
- duplicated names or conflicting records are detected.

Where possible, compare catalogue properties against the same authoritative source/version used to populate the catalogue. Record provenance and the tolerance used for each comparison.

## 2. Derived property tests

Test each family derivation independently against:
- tabulated catalogue properties;
- hand calculations for simple idealized sections;
- independent engineering software or authoritative examples where available.

Check that:
- computed values are finite and have correct dimensions/units;
- symmetry and centroid locations are correct where expected;
- principal-axis properties are handled for unsymmetrical shapes;
- closed-section torsion properties are not accidentally calculated with open-section formulas, and vice versa;
- thin-wall and design-thickness assumptions are applied consistently;
- approximations are documented and do not silently replace authoritative design properties.

## 3. Member-design benchmark tests

Create a benchmark fixture for each family and for each implemented design category: tension, compression, flexure, shear, combined axial force and bending, and applicable stability/serviceability checks.

Each benchmark should record:
- section designation and catalogue version;
- steel grade, yield stress, tensile stress, and modulus;
- member length, effective-length assumptions, unbraced length, and bracing conditions;
- load effects and units;
- applicable AISC 360-16 clauses;
- hand/reference calculation values;
- expected nominal and available strengths;
- expected governing limit state and utilization;
- tolerances and explanation of any differences.

Use boundary tests near classification thresholds and transitions between limit states. Confirm that an unsupported clause returns `UNSUPPORTED`, not a numerical pass.

Do not use only self-generated expected values from the same production function as the test oracle.

## 4. Optimizer tests

For each enabled family:
- candidate enumeration includes expected catalogue entries;
- invalid candidates are rejected with `INVALID_INPUT`;
- candidates with unsupported required checks cannot be feasible;
- failed candidates are excluded from ranking;
- no feasible candidates returns an explicit no-solution result;
- the chosen candidate is the minimum-weight/cost candidate among those that pass all required checks;
- the final adopted section is rerun and its result matches the reported result;
- optimizer and manual design agree for identical inputs;
- group assignment, force envelope, member lengths, and orientations are honored;
- double-angle candidates preserve pair geometry and built-up assumptions.

Add deterministic tests for ties, empty catalogues, unsupported families, and mixed-family search.

## 5. Model Space and orientation tests

Test rendered profile orientation for:
- horizontal members along each global axis;
- vertical members;
- inclined members in multiple planes;
- reversed start/end node order;
- explicit section rotation;
- local-axis conventions shared with the solver.

Verify that the rendered family and designation match the analysis/design section. If an unsupported section cannot be rendered faithfully, show an explicit warning rather than a plausible generic box.

## 6. PDF/report tests

Every enabled design report should disclose:
- original and resolved section designation;
- family and catalogue/source version;
- material properties;
- section properties used;
- analysis and design assumptions;
- load effects and combinations;
- each required check and its status;
- code clause, demand, capacity, utilization, and units where applicable;
- all unsupported and not-assessed checks with reasons;
- optimizer objective, rejected candidate reasons, and selection basis;
- warnings about idealized geometry or omitted physical effects.

Do not emit a blanket code-compliance statement when checks are incomplete.

## 7. CI gates

Suggested release gates:
- unit tests for catalogue, derivations, and each check;
- type checking and linting;
- regression suite for existing W-section behavior;
- benchmark comparisons with reviewed tolerances;
- optimizer feasibility and ranking tests;
- report completeness tests;
- no family enabled in the UI unless its required checks are green in the support matrix.

A passing automated suite is necessary but not sufficient. Engineering review and independent benchmark calculations remain required.
