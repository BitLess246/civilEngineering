// Documentation content — analysis tools other than Model Space.
import type { DocTool } from './docsModel'

export const ANALYSIS_TOOLS: DocTool[] = [
  {
    id: 'frame-analysis',
    name: 'Frame Analysis (2D)',
    route: '/frame',
    group: 'Analysis & modelling',
    summary: 'Plane-frame solver: build nodes and members by hand, apply loads, and read reactions and diagrams over the NSCP combinations.',
    basis: 'Direct stiffness plane frame; NSCP 2015 §203.3.1 strength combinations.',
    sections: [
      {
        id: 'frame-model',
        title: 'Model',
        controls: [
          { kind: 'field', name: 'x / y', unit: 'm', what: 'Node coordinates. y is up.' },
          { kind: 'choice', name: 'node i / node j', what: 'The two nodes a member spans between.' },
          { kind: 'choice', name: 'node / type', what: 'Support node and its fixity (pin, roller, fixed).' },
          { kind: 'field', name: 'b / h', unit: 'mm', what: 'Rectangular section for all members.' },
          { kind: 'field', name: 'f′c', unit: 'MPa', what: 'Concrete strength, which sets E = 4700√f′c.' },
        ],
      },
      {
        id: 'frame-loads',
        title: 'Loads',
        controls: [
          { kind: 'field', name: 'Fx / Fy / Mz', what: 'Nodal force components (kN) and moment (kN·m).' },
          { kind: 'field', name: 'w (gravity ↓)', unit: 'kN/m', what: 'Uniform load over a member, acting downward.' },
          { kind: 'field', name: 'P (gravity ↓) + a from i', what: 'Point load on a member and its distance from the i-end.' },
          { kind: 'choice', name: 'member / category', what: 'Which member the load sits on, and its load category (D, L, W, E…), which decides the combination factors applied to it.' },
        ],
      },
      {
        id: 'frame-results',
        title: 'Results',
        controls: [
          { kind: 'output', name: 'NSCP 2015 load combinations', what: 'One row per combination with its factored extremes; the governing one is marked.' },
          { kind: 'output', name: 'Diagrams', what: 'Axial, shear and moment along each member for the selected combination.' },
        ],
      },
    ],
  },
  {
    id: 'beam-analysis',
    name: 'Beam Analysis',
    route: '/beam-analysis',
    group: 'Analysis & modelling',
    summary: 'Single-span and continuous beam solver with a closed-form engine — reactions, shear, moment and deflection.',
    basis: 'Closed-form beam theory; NSCP 2015 combinations.',
    sections: [
      {
        id: 'beam-an-inputs',
        title: 'Beam',
        controls: [
          { kind: 'field', name: 'Span L', unit: 'm', what: 'Clear span between supports — the length every diagram is drawn over.' },
          { kind: 'field', name: 'Modulus E', unit: 'MPa', what: 'Elastic modulus, used for deflection.' },
          { kind: 'field', name: 'Inertia I', unit: 'mm⁴', what: 'Second moment of area of the section; with E it sets the deflection.' },
          { kind: 'field', name: 'k', what: 'Support spring stiffness where an elastic support is used.' },
        ],
      },
      {
        id: 'beam-an-loads',
        title: 'Loads',
        controls: [
          { kind: 'field', name: 'P at x', what: 'Point load and its position from the left support.' },
          { kind: 'field', name: 'w from x₁ to x₂', unit: 'kN/m', what: 'Uniform load over a part-span.' },
          { kind: 'field', name: 'w₁ / w₂', unit: 'kN/m', what: 'Start and end intensity of a linearly varying load.' },
          { kind: 'field', name: 'M', unit: 'kN·m', what: 'Applied moment at a point.' },
          { kind: 'choice', name: 'Category', what: 'Load category driving the combination factors.' },
        ],
      },
    ],
  },
  {
    id: 'truss-space',
    name: 'Truss Space',
    route: '/truss',
    group: 'Analysis & modelling',
    summary: 'Generates a standard truss, solves it, and checks every member as an AISC steel section in tension or compression.',
    basis: 'Pin-jointed truss statics; AISC 360 §D (tension) and §E3 (compression).',
    sections: [
      {
        id: 'truss-geom',
        title: 'Truss geometry',
        controls: [
          { kind: 'choice', name: 'Type', what: 'Truss pattern — Warren, Pratt, Howe, Fink, roof or scissor. Sets how the diagonals are arranged.' },
          { kind: 'field', name: 'Span', unit: 'm', what: 'Overall span between supports.' },
          { kind: 'field', name: 'Height', unit: 'm', what: 'Depth at mid-span (or at the ridge for gable types).' },
          { kind: 'field', name: 'Panels', what: 'Number of panels along the span. More panels give shorter members and more joints.' },
        ],
      },
      {
        id: 'truss-loads',
        title: 'Loads',
        controls: [
          { kind: 'field', name: 'Dead joint load / Live joint load', unit: 'kN', what: 'Loads applied at each top-chord joint.' },
          { kind: 'toggle', name: 'Add member self-weight (from the section) to Dead', what: 'Adds the weight of the chosen section as extra dead load, so the section choice feeds back into the demand.' },
        ],
      },
      {
        id: 'truss-section',
        title: 'Section & material',
        controls: [
          { kind: 'choice', name: 'Family / Shape', what: 'AISC shape selection for the members.' },
          { kind: 'toggle', name: 'Custom section (enter area & radii directly)', what: 'Bypasses the shape library — type A, r_x and r_y yourself.' },
          { kind: 'field', name: 'Area A / r_x / r_y', what: 'Section area and radii of gyration, used for the slenderness and compression checks.' },
          { kind: 'toggle', name: 'Double angle (2L, back-to-back)', what: 'Treats the member as a back-to-back pair, with the separator plate thickness below setting the gap.' },
          { kind: 'field', name: 'Separator plate thickness', unit: 'mm', what: 'Gap between the two angles of a double-angle member.' },
          { kind: 'field', name: 'Fy / E', unit: 'MPa', what: 'Steel yield strength and modulus.' },
          { kind: 'field', name: 'Effective length K', what: 'Effective-length factor for the compression check.' },
        ],
      },
    ],
  },
  {
    id: 'load-path',
    name: 'Slab Load Path',
    route: '/load-path',
    group: 'Analysis & modelling',
    summary: 'Distributes a slab area load to its edge beams by tributary area, including an optional wall on the edge.',
    basis: 'Tributary-area (yield-line style) load distribution.',
    sections: [
      {
        id: 'lp-panel',
        title: 'Panel',
        controls: [
          { kind: 'field', name: 'Side a / Side b', unit: 'm', what: 'Panel plan dimensions. The a : b ratio decides whether it acts one-way or two-way and how the tributary triangles/trapezoids form.' },
          { kind: 'field', name: 'q', unit: 'kPa', what: 'Uniform area load on the panel, distributed to the edges by tributary area.' },
          { kind: 'choice', name: 'category', what: 'Load category for the resulting line loads.' },
        ],
      },
      {
        id: 'lp-wall',
        title: 'Wall on the edge beam (optional)',
        controls: [
          { kind: 'choice', name: 'Include wall', what: 'Adds a wall line load onto the edge beam.' },
          { kind: 'field', name: 'Thickness / Height', what: 'Wall dimensions, converted to a line load using the material weight.' },
        ],
      },
      {
        id: 'lp-out',
        title: 'Results',
        controls: [
          { kind: 'output', name: 'Tributary plan', what: 'Drawing of the triangles and trapezoids each edge picks up.' },
          { kind: 'output', name: 'Edge line loads', what: 'Equivalent uniform load per edge, ready to paste into a beam run.' },
        ],
      },
    ],
  },
  {
    id: 'seismic-wizard',
    name: 'Seismic Wizard',
    route: '/seismic-wizard',
    group: 'Analysis & modelling',
    summary: 'Steps through the NSCP §208 static lateral-force procedure and reports the base shear and its vertical distribution.',
    basis: 'NSCP 2015 §208.5 static lateral force procedure.',
    sections: [
      {
        id: 'sw-steps',
        title: 'Wizard steps',
        body: 'The page walks the clause order: site and zone, then the seismic coefficients, then the structural system, then the weight, then the base shear and its distribution. Each step shows the clause it comes from.',
        notes: [
          'Z, Ca, Cv, Na and Nv follow from the zone, soil profile and near-source distance.',
          'R and I come from the lateral system and occupancy category.',
          'The period may be taken by Method A (T = Ct·hn^¾) or Method B, with the §208.5.2.2 caps applied.',
          'Output is V, the §208.5.5 Ft top force where applicable, and the w·h distribution per storey.',
        ],
      },
    ],
  },
  {
    id: 'load-combinations',
    name: 'Load Combinations',
    route: '/load-combinations',
    group: 'Analysis & modelling',
    summary: 'Applies every NSCP 2015 strength combination to a set of unfactored load effects and shows which one governs.',
    basis: 'NSCP 2015 §203.3.1, equations 203-1 to 203-7.',
    sections: [
      {
        id: 'lc-inputs',
        title: 'Unfactored Loads',
        controls: [
          { kind: 'field', name: 'D — Dead load', what: 'Unfactored dead-load effect, which every combination factors up from.' },
          { kind: 'field', name: 'L — Floor live', what: 'Unfactored floor live effect.' },
          { kind: 'field', name: 'Lr — Roof live', what: 'Unfactored roof live effect.' },
          { kind: 'field', name: 'W — Wind', what: 'Unfactored wind effect, factored at 1.0 W in the combinations that carry it.' },
          { kind: 'field', name: 'E — Earthquake', what: 'Unfactored seismic effect.' },
        ],
        notes: [
          'The units are whatever you enter — the page combines effects, so kN, kN·m or kPa all work as long as you stay consistent.',
          'The live-load factor f₁ is 1.0 for public assembly, garages and live loads over 4.8 kPa, and 0.5 otherwise.',
        ],
      },
    ],
  },
  {
    id: 'slope-stability',
    name: 'Slope Stability',
    route: '/slope',
    group: 'Foundations & geotechnical',
    summary: 'Factor of safety of a slope by the method of slices, with a search for the critical circle.',
    basis: 'Fellenius / Ordinary Method of Slices, Bishop simplified, Janbu simplified.',
    sections: [
      {
        id: 'slope-geom',
        title: 'Slope geometry',
        controls: [
          { kind: 'field', name: 'Height H', unit: 'm', what: 'Vertical height of the slope face.' },
          { kind: 'field', name: 'Face angle β', unit: '°', what: 'Inclination of the face from horizontal.' },
          { kind: 'field', name: 'Crest width / Toe width', unit: 'm', what: 'Flat lengths beyond the crest and in front of the toe, which bound the ground profile the circles are cut against.' },
        ],
      },
      {
        id: 'slope-soil',
        title: 'Soil',
        controls: [
          { kind: 'field', name: "Cohesion c′", unit: 'kPa', what: 'Effective cohesion of the soil, the c′ term in the shear strength.' },
          { kind: 'field', name: "Friction φ′", unit: '°', what: 'Effective friction angle; the tanφ′ term in the shear strength.' },
          { kind: 'field', name: 'Unit weight γ', unit: 'kN/m³', what: 'Bulk unit weight, which sets the slice weights.' },
          { kind: 'field', name: 'Pore ratio ru', what: 'Pore-pressure ratio u/(γ·h) — a uniform approximation of the pore pressure on the slip surface.' },
        ],
      },
      {
        id: 'slope-method',
        title: 'Method',
        controls: [
          { kind: 'choice', name: 'Bishop simplified', what: 'Iterates the mα factor; generally the most accurate of the three and the usual choice.' },
          { kind: 'choice', name: 'Fellenius / OMS', what: 'Non-iterative and conservative — it ignores interslice forces.' },
          { kind: 'choice', name: 'Janbu simplified', what: 'Force-equilibrium method with the f₀ correction factor applied.' },
        ],
      },
      {
        id: 'slope-out',
        title: 'Results',
        controls: [
          { kind: 'output', name: 'Critical circle', what: 'The searched circle with the lowest FS, drawn over the slope with its slices.' },
          { kind: 'output', name: 'Slice table', what: 'Per-slice weight, base length, base angle α and the shear resisted, so the sum can be checked by hand.' },
        ],
      },
    ],
  },
]
