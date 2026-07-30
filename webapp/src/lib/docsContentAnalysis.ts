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
    id: 'lateral-pile',
    name: 'Lateral Pile',
    route: '/lateral-pile',
    group: 'Foundations & geotechnical',
    summary: 'Ultimate lateral capacity and working-load response of a single pile, by Broms and by p-y analysis.',
    basis: 'Broms (1964) limit equilibrium; Matlock soft-clay and API RP 2A sand p-y curves.',
    sections: [
      {
        id: 'lp-pile',
        title: 'Pile & loading',
        body: 'Two methods answer two different questions and are both shown. Broms gives the ultimate load and '
          + 'which mechanism fails first; p-y gives deflection and the moment diagram at a working load, which is '
          + 'what a serviceability check needs and Broms cannot provide.',
        controls: [
          { kind: 'field', name: 'Embedded length L', unit: 'm', what: 'Length below ground. Beyond the pile\u2019s active length extra depth stops changing the head response — that is the signature of a "long" pile.' },
          { kind: 'field', name: 'Diameter D', unit: 'm', what: 'Pile diameter or width. Scales the soil resistance directly, and sets the reference deflection y50 in the clay curve.' },
          { kind: 'field', name: 'Rigidity EI', unit: 'kN·m²', what: 'Flexural rigidity of the pile section. A stiffer pile deflects less and carries more moment over a shorter depth.' },
          { kind: 'field', name: 'Yield moment My', unit: 'kN·m', what: 'Plastic moment of the section. Broms compares it against the soil mechanism to decide which one governs, so a low My turns a short pile into a hinge failure.' },
          { kind: 'field', name: 'Lateral load H', unit: 'kN', what: 'Working lateral load for the p-y analysis. Broms is independent of it — the ratio H/Hu is reported separately.' },
          { kind: 'field', name: 'Load height e', unit: 'm', what: 'Height of the load above ground. It adds an overturning moment at the head, which reduces capacity and increases deflection. Ignored for a fixed head, which cannot rotate.' },
          { kind: 'choice', name: 'Head condition', what: 'Free lets the head rotate; fixed represents a pile capped into a rigid cap. A fixed head is stronger and deflects less, and in Broms it allows a second plastic hinge at the head.' },
          { kind: 'choice', name: 'Soil type', what: 'Clay uses the 9·cu·d Broms resistance with Matlock\u2019s p-y curve; sand uses 3·Kp·γ·z·d with the API RP 2A curve. The choice switches both methods together.' },
        ],
      },
      {
        id: 'lp-soil',
        title: 'Soil',
        controls: [
          { kind: 'field', name: "Unit weight γ′", unit: 'kN/m³', what: 'Effective unit weight, which builds the confining stress down the pile.' },
          { kind: 'field', name: 'Undrained cu', unit: 'kPa', what: 'Clay only. Sets both the Broms 9·cu·d resistance and the Matlock ultimate reaction.' },
          { kind: 'field', name: 'Strain ε₅₀', what: 'Clay only. Strain at half the failure stress, which fixes y50 = 2.5·ε₅₀·D — the deflection at which half the ultimate reaction is mobilised. Larger values mean a softer, more ductile response.' },
          { kind: 'field', name: "Friction φ′", unit: '°', what: 'Sand only. Drives Kp in Broms and the API wedge coefficients in the p-y curve.' },
          { kind: 'field', name: 'Subgrade k', unit: 'kN/m³', what: 'Sand only. Initial modulus of subgrade reaction, giving the p-y curve its slope k·z at the origin.' },
        ],
      },
      {
        id: 'lp-broms',
        title: 'Ultimate capacity — Broms',
        controls: [
          { kind: 'output', name: 'Ultimate lateral load Hu', unit: 'kN', what: 'The governing capacity — always the lower of the two mechanisms below. An ultimate value: apply your own factor of safety, typically 2 to 3 for a working load.' },
          { kind: 'output', name: 'Short-pile (soil) capacity', unit: 'kN', what: 'Load at which the soil fails and the pile rotates as a rigid body.' },
          { kind: 'output', name: 'Long-pile (hinge) capacity', unit: 'kN', what: 'Load at which a plastic hinge forms in the pile section (two hinges when the head is fixed).' },
          { kind: 'output', name: 'Governing mechanism', what: 'Which of the two came out lower. This is what makes a pile "short" or "long" — it is a verdict about the pile and soil together, not a length.' },
          { kind: 'output', name: 'Applied H / Hu', what: 'Utilisation against the ultimate capacity, flagged when it exceeds 1.' },
        ],
      },
      {
        id: 'lp-py',
        title: 'Response at working load — p-y',
        controls: [
          { kind: 'output', name: 'Deflection / moment / reaction profiles', what: 'Three panels down the pile: y in mm, bending moment, and mobilised soil reaction. The peak of each is printed beneath it.' },
          { kind: 'output', name: 'Head deflection', unit: 'mm', what: 'Deflection at ground level, checked against the 25 mm figure commonly taken as the serviceability limit.' },
          { kind: 'output', name: 'Maximum moment', unit: 'kN·m', what: 'Peak bending moment and the depth it occurs at — usually a few diameters down, not at the head, which is what sizes the reinforcement.' },
          { kind: 'output', name: 'Moment utilisation M/My', what: 'Peak moment against the section\u2019s yield moment.' },
          { kind: 'output', name: 'Solution', what: 'Iterations and the final residual. Reported rather than hidden, so a solve that fell short of tolerance is visible instead of being presented as an answer.' },
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
  {
    id: 'soil-investigation',
    name: 'Soil Investigation',
    route: '/soils',
    group: 'Foundations & geotechnical',
    summary: 'Manage a site investigation — boreholes, strata, samples, SPT — and classify the soil, so parameters are entered once instead of retyped on every geotechnical page.',
    basis: 'ASTM D1586 (SPT), D2487 (USCS), D4318 (Atterberg), D6913 (gradation); AASHTO M 145; Skempton (1986) and Youd et al. (2001) corrections.',
    sections: [
      {
        id: 'si-overview',
        title: 'Investigation',
        body: 'An investigation is stored in this browser, not on a server. Export the JSON to keep a copy — that is '
          + 'the backup mechanism, not a convenience. Every edit saves immediately, because field and laboratory data '
          + 'is expensive to re-enter and an edit lost to a refresh is not a minor annoyance here.',
        controls: [
          { kind: 'field', name: 'Reference', what: 'Investigation number as it appears on the report cover, e.g. SI-2026-014.' },
          { kind: 'field', name: 'Project / Client / Location', what: 'Site identity carried onto the report cover and the borehole logs.' },
          { kind: 'choice', name: 'Status', what: 'Draft, fieldwork, laboratory, analysis, review or completed — the stage the investigation has reached.' },
          { kind: 'output', name: 'Data integrity', what: 'Errors are the physically impossible: overlapping layers, groundwater below the hole, a plastic limit above the liquid limit. Warnings are the merely unusual, which is often perfectly real. Nothing is repaired automatically — an unlogged interval may be a logging error or an unrecovered run, and only whoever was on the rig knows which.' },
        ],
      },
      {
        id: 'si-boreholes',
        title: 'Boreholes',
        body: 'Each hole carries its collar elevation, termination depth, diameter and groundwater level. The '
          + 'diameter feeds the SPT borehole-diameter correction C_B, so it is data rather than description.',
        controls: [
          { kind: 'field', name: 'Ground elevation', unit: 'm', what: 'Collar elevation. Optional — without it the log shows depths only, not elevations.' },
          { kind: 'field', name: 'Depth', unit: 'm', what: 'Termination depth. A profile logged deeper than this is an error; one that stops short is a warning.' },
          { kind: 'field', name: 'Diameter', unit: 'mm', what: 'Hole diameter, which sets C_B: 1.00 up to 115 mm, 1.05 at 150 mm, 1.15 at 200 mm.' },
          { kind: 'field', name: 'Groundwater', unit: 'm', what: 'Depth to the water table. Leave blank when it was not encountered — the log then says so rather than drawing a table at an assumed depth.' },
          { kind: 'output', name: 'Borehole log', what: 'Graphical log with the strata column, hatching, depth scale, water table and SPT values. Hatching follows the USCS symbol where one is entered, otherwise the description, in which the noun governs — "Silty Sand" is drawn as a sand.' },
        ],
      },
      {
        id: 'si-profile',
        title: 'Soil profile',
        controls: [
          { kind: 'field', name: 'Layer top / base', unit: 'm', what: 'Layer boundaries. Overlaps are an error — two soils cannot occupy the same ground. Gaps are a warning, since an unrecovered run is a real thing to record.' },
          { kind: 'field', name: 'USCS symbol', what: 'Group symbol once the soil has been classified. Left blank until then: an unclassified layer is an honest state and a guessed symbol is not.' },
          { kind: 'field', name: 'Description', what: 'Full log description, printed in the log column and wrapped to fit its band.' },
          { kind: 'output', name: 'Samples', what: 'Samples with their type, depth, recovery ratio and the laboratory tests booked against them. Recovery below 50% is flagged, since results on a poorly recovered sample carry reduced confidence.' },
        ],
      },
      {
        id: 'si-spt',
        title: 'SPT',
        body: 'The raw blow count is not a soil property — it is the response of one hammer, on one rig, through one '
          + 'length of rod, at one depth. N60 removes the equipment; (N1)60 additionally removes the overburden so '
          + 'tests at 3 m and 15 m in the same sand can be compared.',
        controls: [
          { kind: 'field', name: 'Unit weights γ, γsat', unit: 'kN/m³', what: 'Entered per layer to build the effective-stress profile that (N1)60 needs. They are an interpretation rather than measured data, so they live on the page rather than in the stored investigation. Layers left blank stop the stress profile there — the blow counts below are still corrected for equipment, just not for overburden.' },
          { kind: 'output', name: 'N60', what: 'Field N corrected for hammer energy, borehole diameter, sampler and rod length.' },
          { kind: 'output', name: '(N1)60', what: 'N60 further corrected to a 100 kPa reference overburden, with C_N capped at 1.7 so a shallow test is not inflated without limit.' },
          { kind: 'output', name: 'Refusal', what: 'A drive that did not achieve full penetration is marked with an asterisk and shaded. Its N is a LOWER BOUND, not a measurement, and correlations are declined on it — correcting a lower bound makes it look more precise without making it more accurate.' },
        ],
      },
      {
        id: 'si-classification',
        title: 'Classification',
        body: 'USCS to ASTM D2487, taken branch by branch. It will not collapse a dual symbol — a sand with 5-12% '
          + 'fines is genuinely SW-SC, not SW with a footnote — and it will not classify from incomplete data.',
        controls: [
          { kind: 'field', name: 'Gravel / Sand / Fines', unit: '%', what: 'Fractions from the gradation curve, split at 4.75 mm and 0.075 mm.' },
          { kind: 'field', name: 'Cu, Cc', what: 'Gradation shape parameters. A gravel is well graded at Cu ≥ 4, a sand needs Cu ≥ 6, and both need 1 ≤ Cc ≤ 3.' },
          { kind: 'field', name: 'LL, PL', unit: '%', what: 'Atterberg limits. PI = LL − PL decides whether the fines behave as clay or silt, against the Casagrande A-line.' },
          { kind: 'output', name: 'Group symbol and name', what: 'The D2487 result, with the reasoning printed underneath. Where a needed test has not been run the classifier says which one rather than picking the likeliest symbol.' },
        ],
      },
    ],
  },
]
