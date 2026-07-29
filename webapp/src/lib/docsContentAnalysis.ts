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
    id: 'settlement',
    name: 'Settlement',
    route: '/settlement',
    group: 'Foundations & geotechnical',
    summary: 'How far a footing will settle and how long it will take — immediate plus primary consolidation on a layered profile.',
    basis: 'Boussinesq stress distribution; Terzaghi one-dimensional consolidation; Schmertmann strain influence.',
    sections: [
      {
        id: 'settle-footing',
        title: 'Footing & groundwater',
        body: 'Bearing capacity asks whether the soil will fail; this asks how far it will move. On compressible '
          + 'ground the settlement check usually governs, and it is the one a client notices.',
        controls: [
          { kind: 'field', name: 'Bearing pressure q', unit: 'kPa', what: 'Net pressure applied at the founding level. Everything below scales with it, and it is the Δp Schmertmann uses.' },
          { kind: 'field', name: 'Width B / Length L', unit: 'm', what: 'Plan dimensions. They set how deep the stress bulb reaches — a wide footing stresses soil far below a narrow one at the same pressure, which is why a raft can settle more than a pad carrying the same load.' },
          { kind: 'field', name: 'Founding depth Df', unit: 'm', what: 'Depth of the base below ground. Soil above it is excluded from the consolidation sum, and it sets the overburden relief in Schmertmann\u2019s C₁.' },
          { kind: 'field', name: 'Water table', unit: 'm', what: 'Depth to groundwater. Below it the saturated unit weight applies and pore pressure is subtracted, so the effective stress driving consolidation falls.' },
          { kind: 'field', name: 'Soil modulus Es', unit: 'kPa', what: 'Deformation modulus for the immediate settlement — used by both the elastic formula and the Schmertmann sublayers.' },
          { kind: 'field', name: 'Poisson ν', what: 'Poisson\u2019s ratio in the elastic settlement, through the (1−ν²) term.' },
          { kind: 'field', name: 'Time horizon', unit: 'yr', what: 'When to report the degree of consolidation, and the elapsed time in Schmertmann\u2019s creep factor C₂.' },
        ],
      },
      {
        id: 'settle-profile',
        title: 'Soil profile',
        body: 'One row per layer, top down. Every field is editable in place.',
        controls: [
          { kind: 'field', name: 'H', unit: 'm', what: 'Layer thickness. Also sets the drainage path — half the thickness when both faces drain.' },
          { kind: 'field', name: 'γ / γsat', unit: 'kN/m³', what: 'Bulk unit weight above the water table and saturated below it; together they build the effective overburden.' },
          { kind: 'field', name: 'e₀', what: 'Initial void ratio. Leave at zero for a layer that does not consolidate — it is then carried for overburden only.' },
          { kind: 'field', name: 'Cc', what: 'Virgin compression index. Zero means the layer contributes no consolidation settlement. Cr defaults to Cc/6 unless set explicitly.' },
          { kind: 'field', name: 'σ′p', unit: 'kPa', what: 'Preconsolidation pressure. Zero means normally consolidated. This is the single most consequential input: charging an overconsolidated crust virgin compression it will never see overestimates its settlement several-fold.' },
          { kind: 'field', name: 'cv', unit: 'm²/yr', what: 'Coefficient of consolidation — sets how fast, not how much. Without it the time answers read "cv not given" rather than guessing.' },
        ],
      },
      {
        id: 'settle-stress',
        title: 'Stress increase below the footing',
        controls: [
          { kind: 'output', name: 'Boussinesq curve', what: 'Δσ against depth at the footing centre, where stress and settlement peak. This is what the consolidation sum actually integrates.' },
          { kind: 'output', name: '2:1 spread curve', what: 'The hand-check rule, shown for comparison only. It is the average over the spread area rather than the centre peak, so it plots below the Boussinesq curve and the two converge with depth.' },
        ],
      },
      {
        id: 'settle-results',
        title: 'Settlement results',
        controls: [
          { kind: 'output', name: 'Immediate — elastic', unit: 'mm', what: 'Se = q·B·(1−ν²)·If/Es, the quick closed-form estimate.' },
          { kind: 'output', name: 'Immediate — Schmertmann', unit: 'mm', what: 'Strain-influence method, the one to prefer on sands: it places the peak strain below the footing (about B/2 for a square) rather than at the surface, and reports the C₁ depth-relief and C₂ creep factors it used.' },
          { kind: 'output', name: 'Primary consolidation', unit: 'mm', what: 'Terzaghi settlement summed over the layers, each sliced twenty ways so the stress increase is integrated rather than sampled at mid-height.' },
          { kind: 'output', name: 'Total', unit: 'mm', what: 'Elastic plus consolidation, flagged against the 25 mm figure usually taken as the limit for an isolated footing.' },
          { kind: 'output', name: 'Degree of consolidation', unit: '%', what: 'How much of the primary settlement has occurred by the time horizon, governed by the layer contributing the most settlement.' },
          { kind: 'output', name: 'Time to 90% consolidation', unit: 'yr', what: 'From t = Tv·H_dr²/cv. Single-face drainage takes four times as long as double, since the path doubles and time goes as its square.' },
        ],
      },
      {
        id: 'settle-layers',
        title: 'Consolidation by layer',
        controls: [
          { kind: 'output', name: 'σ′₀ / Δσ / σ′p', unit: 'kPa', what: 'Effective overburden, stress increase and preconsolidation pressure at the layer mid-height — the three numbers that decide which branch applies.' },
          { kind: 'output', name: 'Branch', what: 'Which part of the e–log σ′ curve was used: recompression while the final stress stays below σ′p, virgin once past it, both when the increment crosses σ′p, or none for a layer with no compressibility data.' },
          { kind: 'output', name: 'Sc', unit: 'mm', what: 'That layer\u2019s contribution, so the governing layer is visible rather than buried in a total.' },
        ],
        notes: [
          'The time factors are the standard closed-form fits to Terzaghi\u2019s Fourier series, accurate to about 1% — not the series itself. The two branches differ by 1.3% where they meet at 60% consolidation.',
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
