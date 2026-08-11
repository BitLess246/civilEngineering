// Documentation content — concrete, steel and timber design calculators.
import type { DocTool } from './docsModel'

/** Fields that mean the same thing on nearly every RC page. */
const RC = {
  fc: { kind: 'field' as const, name: "f′c", unit: 'MPa', what: 'Concrete cylinder strength. Sets both the capacity and Ec = 4700√f′c.' },
  fy: { kind: 'field' as const, name: 'fy', unit: 'MPa', what: 'Reinforcement yield strength.' },
  cover: { kind: 'field' as const, name: 'Clear cover', unit: 'mm', what: 'Cover to the outermost bar. Increasing it reduces the effective depth and so the capacity.' },
  lambda: { kind: 'choice' as const, name: 'λ (lightweight)', what: '1.0 for normal-weight concrete, 0.75 for lightweight. Scales every √f′c term.' },
}

export const DESIGN_TOOLS: DocTool[] = [
  {
    id: 'beam-design',
    name: 'Beam Design (RC)',
    route: '/beam-design',
    group: 'Concrete design',
    summary: 'Designs a rectangular RC beam for flexure and shear, choosing bars and stirrups and printing the worked solution.',
    basis: 'NSCP 2015 §409 / ACI 318-14 — singly and doubly reinforced flexure, §422.5 shear, §407.7 bar spacing.',
    sections: [
      {
        id: 'bd-section',
        title: 'Section & materials',
        controls: [
          { kind: 'field', name: 'Width b', unit: 'mm', what: 'Beam width. Increasing it lowers the required steel but adds concrete.' },
          { kind: 'field', name: 'Total depth h', unit: 'mm', what: 'Overall depth. The effective depth d follows from h, cover, stirrup and bar sizes, and is recomputed as layers are added.' },
          RC.cover,
          { kind: 'field', name: 'Stirrup legs', what: 'Number of shear legs crossing the crack — 2 for a closed stirrup, more for wide beams.' },
        ],
      },
      {
        id: 'bd-demand',
        title: 'Span & demand',
        controls: [
          { kind: 'field', name: 'Span', unit: 'm', what: 'Clear span, used for the minimum-thickness check and the deflection assessment.' },
          { kind: 'field', name: 'x', unit: 'm', what: 'Section position along the span being designed.' },
          { kind: 'choice', name: 'Support', what: 'Span type (simply supported, one end continuous, both ends continuous, cantilever). Picks the Table 409.3.1.1 row for minimum thickness and the deflection coefficient.' },
        ],
      },
      {
        id: 'bd-out',
        title: 'Results',
        controls: [
          { kind: 'output', name: 'Mode', what: 'Whether the section came out singly or doubly reinforced, and whether ρmin governed.' },
          { kind: 'output', name: 'Bars and layers', what: 'Bar count, how they stack into layers at the §407.7 clear spacing, and the resulting effective depth.' },
          { kind: 'output', name: 'Worked solution', what: 'Step-by-step derivation with the clause behind each step, formatted for printing.' },
        ],
      },
    ],
  },
  {
    id: 'tbeam-design',
    name: 'T-Beam Design',
    route: '/tbeam-design',
    group: 'Concrete design',
    summary: 'Flanged-beam design, including the effective flange width and whether the compression block stays inside the flange.',
    basis: 'NSCP 2015 §406.3.2 effective flange width; §409 flexure.',
    sections: [
      {
        id: 'tb-geom',
        title: 'Geometry',
        controls: [
          { kind: 'field', name: 'Web bw', unit: 'mm', what: 'Web width, which carries the shear and anchors the flange.' },
          { kind: 'field', name: 'Total depth h', unit: 'mm', what: 'Overall depth including the flange.' },
          { kind: 'field', name: 'Flange hf', unit: 'mm', what: 'Slab thickness acting as the flange.' },
          { kind: 'field', name: 'bf override (0 = table)', unit: 'mm', what: 'Force an effective flange width. Leave 0 to let the code table govern.' },
          { kind: 'field', name: 'Clear span ln', unit: 'm', what: 'Feeds the ln/4 limb of the effective-width rule.' },
          { kind: 'field', name: 'Web clear spacing sw', unit: 'mm', what: 'Clear distance to the adjacent web; another limb of the same rule.' },
          { kind: 'choice', name: 'Beam type', what: 'Interior (flange both sides) or edge/spandrel (one side), which changes the effective-width limits.' },
        ],
      },
      {
        id: 'tb-mat',
        title: 'Materials & demand',
        controls: [
          RC.fc, RC.fy, RC.cover,
          { kind: 'field', name: 'Stirrup ⌀ / Bar ⌀', unit: 'mm', what: 'Bar sizes, which set the effective depth.' },
          { kind: 'field', name: 'Mu', unit: 'kN·m', what: 'Factored moment to design for.' },
        ],
      },
    ],
  },
  {
    id: 'prestressed-beam',
    name: 'Prestressed Beam',
    route: '/prestressed-beam',
    group: 'Concrete design',
    summary: 'Pretensioned bonded beam: prestress losses, service stresses against the class limits, and flexural strength.',
    basis: 'NSCP 2015 §424.5 service classes; lump-sum and time-dependent loss estimates.',
    sections: [
      {
        id: 'pb-in',
        title: 'Inputs',
        controls: [
          { kind: 'field', name: 'Width b / Depth h', unit: 'mm', what: 'Rectangular section dimensions of the member being checked.' },
          { kind: 'field', name: 'Simple span L', unit: 'm', what: 'Simple span between bearings, over which the prestress is developed.' },
          RC.fc,
          { kind: 'field', name: 'Aps', unit: 'mm²', what: 'Area of prestressing steel.' },
          { kind: 'field', name: 'fpu', unit: 'MPa', what: 'Tendon ultimate strength, from which the jacking stress is taken as a fraction.' },
          { kind: 'field', name: 'Eccentricity e', unit: 'mm', what: 'Tendon offset below the centroid; drives the hogging prestress moment.' },
          { kind: 'field', name: 'Jacking (% fpu)', unit: '%', what: 'Initial jacking stress as a fraction of fpu.' },
          { kind: 'field', name: 'Ambient RH', unit: '%', what: 'Relative humidity, which drives the shrinkage and creep loss terms.' },
          { kind: 'field', name: 'Superimposed DL / Live load', unit: 'kN/m', what: 'Service loads used for the stress checks.' },
          { kind: 'choice', name: 'Class (§24.5.2)', what: 'U (uncracked), T (transition) or C (cracked) — sets the allowable tensile stress at service.' },
        ],
      },
    ],
  },
  {
    id: 'column-design',
    name: 'Column Design',
    route: '/column-design',
    group: 'Concrete design',
    summary: 'RC column: axial capacity, P–M interaction with strain compatibility, ties, and slenderness magnification.',
    basis: 'NSCP 2015 §410 / ACI 318-14 §22.4 axial, strain-compatibility interaction, §6.6.4 slenderness.',
    sections: [
      {
        id: 'cd-sec',
        title: 'Section',
        controls: [
          { kind: 'choice', name: 'Shape', what: 'Tied rectangular or spiral circular. Changes φ and the α factor on Pn,max.' },
          { kind: 'field', name: 'Width b / Depth h (bending dir.)', unit: 'mm', what: 'Rectangular dimensions; h is measured in the bending direction.' },
          { kind: 'field', name: 'Diameter D', unit: 'mm', what: 'Diameter of a circular column, used in place of b and h.' },
          RC.cover,
          { kind: 'field', name: 'No. of bars', what: 'Number of longitudinal bars, which sets the total bar length and mass.' },
          { kind: 'choice', name: 'Bars / Bar distribution', what: 'Bar size and whether they sit on two faces or all four. Four-face layers give a more realistic cage and a lower balanced moment.' },
        ],
      },
      {
        id: 'cd-load',
        title: 'Loading & slenderness',
        controls: [
          { kind: 'choice', name: 'Loading / Load entry', what: 'How the demand is supplied — axial only, or axial plus moment, entered directly or as service loads.' },
          { kind: 'choice', name: 'System', what: 'Lateral system, which sets the seismic detailing rules applied to the ties.' },
          { kind: 'field', name: 'Clear height Lu', unit: 'm', what: 'Unsupported length, used for slenderness.' },
          { kind: 'toggle', name: 'Consider slenderness', what: 'Turns on moment magnification. When off the column is treated as short.' },
          { kind: 'field', name: 'k', what: 'Effective-length factor K; KL/r drives the compression capacity.' },
          { kind: 'field', name: 'EI (0 = 0.4EcIg/1.6)', what: 'Flexural rigidity for the magnifier. Leave 0 to use the code default.' },
          { kind: 'field', name: 'Max lateral bar spacing hx', unit: 'mm', what: 'Limit on the transverse spacing between laterally supported bars, from the seismic detailing rules.' },
        ],
      },
    ],
  },
  {
    id: 'slab-design',
    name: 'Slab Design',
    route: '/slab-design',
    group: 'Concrete design',
    summary: 'Two-way slab by the Direct Design Method, with the minimum-thickness and deflection checks.',
    basis: 'NSCP 2015 §408.10 Direct Design Method; §408.3.1 minimum thickness; §424.2 deflection.',
    sections: [
      {
        id: 'sd-in',
        title: 'Inputs',
        controls: [
          { kind: 'field', name: 'Column width', unit: 'mm', what: 'Support size, which sets the clear span and the critical sections.' },
          { kind: 'field', name: 'Thickness h (blank = auto)', unit: 'mm', what: 'Slab thickness; with cover and bar size it sets the effective depth d. Leave blank to let the minimum-thickness rule choose it.' },
          RC.cover,
          { kind: 'choice', name: 'End span in x-dir? / End span in y-dir?', what: 'Whether the panel is an end or interior span in each direction — this picks the DDM moment-distribution coefficients.' },
          { kind: 'choice', name: 'Beams on all edges?', what: 'Presence of edge beams, which changes the distribution between column and middle strips.' },
        ],
      },
    ],
  },
  {
    id: 'torsion-design',
    name: 'Torsion Design',
    route: '/torsion',
    group: 'Concrete design',
    summary: 'Combined shear and torsion: threshold and cracking torsion, closed stirrups and the longitudinal steel they require.',
    basis: 'NSCP 2015 §422.7 / ACI 318-14 §22.7.',
    sections: [
      {
        id: 'td-in',
        title: 'Inputs',
        controls: [
          { kind: 'field', name: 'Width b / Height h', unit: 'mm', what: 'Section dimensions; these set Acp and pcp.' },
          RC.cover,
          { kind: 'field', name: 'Stirrup ⌀ dₛ / Main bar ⌀ db', unit: 'mm', what: 'Bar sizes, which set the closed-stirrup centreline area Aoh.' },
          RC.fc,
          { kind: 'field', name: 'fy (main) / fyt (stirrup)', unit: 'MPa', what: 'Yield strengths of the longitudinal and transverse steel.' },
          { kind: 'field', name: 'Tu (factored torsion)', unit: 'kN·m', what: 'Design torsion. Compared against the threshold torsion, below which torsion may be ignored.' },
          { kind: 'field', name: 'Vu (factored shear)', unit: 'kN', what: 'Design shear, combined with torsion in the §22.7.7 interaction.' },
          { kind: 'field', name: 'Stirrup legs', what: 'Legs available for shear. Torsion always uses the single outer closed loop.' },
          RC.lambda,
        ],
      },
    ],
  },
  {
    id: 'dev-length',
    name: 'Development Length',
    route: '/dev-length',
    group: 'Concrete design',
    summary: 'Tension and compression development lengths, splices and hooks.',
    basis: 'NSCP 2015 §425.4 / ACI 318-14 §25.4.',
    sections: [
      {
        id: 'dl-in',
        title: 'Inputs',
        controls: [
          RC.fc, RC.fy,
          { kind: 'field', name: '(cb + Ktr) / db', what: 'Confinement term. Capped at 2.5 by the code; larger values are clipped.' },
          { kind: 'field', name: 'Bar diameter db', unit: 'mm', what: 'Diameter of the bar being developed — ld scales roughly with it.' },
          { kind: 'choice', name: 'Lightweight concrete λ', what: '1.0 normal weight, 0.75 lightweight.' },
          { kind: 'choice', name: 'Bar position', what: 'Top bars (more than 300 mm of concrete cast below) take ψt = 1.3.' },
          { kind: 'choice', name: 'Epoxy coating', what: 'Sets ψe; the product ψt·ψe is capped at 1.7.' },
        ],
      },
    ],
  },
  {
    id: 'punching-shear',
    name: 'Punching Shear',
    route: '/punching-shear',
    group: 'Concrete design',
    summary: 'Two-way shear at a slab–column joint on the critical perimeter at d/2 from the face.',
    basis: 'NSCP 2015 §422.6 / ACI 318-14 §22.6, all three Vc equations.',
    sections: [
      {
        id: 'ps-in',
        title: 'Inputs',
        controls: [
          { kind: 'field', name: 'c₁ (∥ free edge / x-dir)', unit: 'mm', what: 'Column dimension parallel to the free edge.' },
          { kind: 'field', name: 'c₂ (⊥ free edge / y-dir)', unit: 'mm', what: 'The other column dimension. c₁/c₂ gives βc.' },
          { kind: 'choice', name: 'Position', what: 'Interior (αs = 40), edge (30) or corner (20). Also decides how much of the perimeter is available.' },
          { kind: 'field', name: 'Thickness h', unit: 'mm', what: 'Slab thickness; with cover and bar size it sets the effective depth d.' },
          RC.cover,
          { kind: 'field', name: 'Bar ⌀', unit: 'mm', what: 'Flexural bar size; with cover it sets d.' },
          RC.fc, RC.lambda,
          { kind: 'field', name: 'Vu (factored column load)', unit: 'kN', what: 'Factored column load punching through the slab.' },
        ],
      },
      {
        id: 'ps-out',
        title: 'Results',
        controls: [
          { kind: 'output', name: 'Vc1 / Vc2 / Vc3', what: 'The three §22.6.5.2 equations; the governing (smallest) one is highlighted.' },
          { kind: 'output', name: 'Ratio Vu/φVc', what: 'Utilisation. Above 1.0 the page states that shear reinforcement or a thicker slab is required.' },
        ],
      },
    ],
  },
  {
    id: 'steel-beam',
    name: 'Steel Beam',
    route: '/steel/beam',
    group: 'Steel & timber',
    summary: 'Flexure with lateral-torsional buckling, shear, and service deflection for a simply-supported W-section.',
    basis: 'AISC 360-16 §F2 flexure, §G2.1 shear; deflection against L/360 live and L/240 total.',
    sections: [
      {
        id: 'sb-in',
        title: 'Inputs',
        controls: [
          { kind: 'choice', name: 'W-shape', what: 'Section from the AISC catalogue; its properties drive every check.' },
          { kind: 'choice', name: 'Steel grade', what: 'A36 or A572 Gr50 / A992 — sets Fy and Fu.' },
          { kind: 'field', name: 'Span L', unit: 'm', what: 'Beam span, over which the uniform loads below are carried.' },
          { kind: 'field', name: 'Unbraced Lb', unit: 'm', what: 'Distance between lateral braces. Compared against Lp and Lr to place the beam in the plastic, inelastic-LTB or elastic-LTB zone.' },
          { kind: 'field', name: 'Cb (moment gradient)', what: 'Lateral-torsional buckling modification factor. 1.0 is conservative.' },
          { kind: 'field', name: 'Dead wD / Live wL', unit: 'kN/m', what: 'Uniform service dead and live load, factored into the design demand.' },
        ],
      },
      {
        id: 'sb-out',
        title: 'Results',
        controls: [
          { kind: 'output', name: 'φMn and the LTB zone', what: 'Design flexural strength, with a chip saying whether the unbraced length puts it in the plastic, inelastic or elastic range.' },
          { kind: 'output', name: 'φVn', what: 'Design shear strength, with the web shear coefficient Cv1.' },
          { kind: 'output', name: 'Deflections', what: 'Live and total service deflection against the L/360 and L/240 limits.' },
        ],
      },
    ],
  },
  {
    id: 'steel-column',
    name: 'Steel Column',
    route: '/steel/column',
    group: 'Steel & timber',
    summary: 'Flexural buckling, weak-axis flexure, and the combined axial-plus-bending interaction.',
    basis: 'AISC 360-16 §E3 compression, §H1-1 combined forces.',
    sections: [
      {
        id: 'sc-in',
        title: 'Inputs',
        controls: [
          { kind: 'choice', name: 'W-shape', what: 'Section from the AISC catalogue.' },
          { kind: 'choice', name: 'Steel grade', what: 'A36 or A572 Gr50 / A992 — sets Fy and Fu.' },
          { kind: 'field', name: 'Height L', unit: 'm', what: 'Unbraced height of the column between restraints.' },
          { kind: 'field', name: 'Kx / Ky', what: 'Effective-length factors about each axis; the larger KL/r governs.' },
          { kind: 'choice', name: 'Axial input', what: 'Switches between service-load entry and a direct factored Pu.' },
          { kind: 'field', name: 'Dead D / Live L / Pu', unit: 'kN', what: 'Axial demand, entered as service loads or directly as Pu.' },
          { kind: 'field', name: 'Mux (strong-axis) / Muy (weak-axis)', unit: 'kN·m', what: 'Moments for the §H1-1 combined check.' },
        ],
      },
      {
        id: 'sc-out',
        title: 'Results',
        controls: [
          { kind: 'output', name: 'φPn', what: 'Design compressive strength, with the governing slenderness KL/r and the elastic buckling stress Fe.' },
          { kind: 'output', name: 'Combined ratio §H1-1', what: 'The interaction value, and which of the two equations governed.' },
        ],
      },
    ],
  },
  {
    id: 'bolted-connection',
    name: 'Bolted Connection',
    route: '/bolted-connection',
    group: 'Steel & timber',
    summary: 'Eccentrically-loaded bolt group by the elastic method, with block shear, out-of-plane tension and prying.',
    basis: 'AISC 360-16 §J3.6 bolt shear, §J3.10 bearing, §J4.3 block shear, §J3.7 combined tension and shear, §J3.9 prying.',
    sections: [
      {
        id: 'bc-in',
        title: 'Inputs',
        controls: [
          { kind: 'field', name: 'Applied Vu / Applied Hu (horizontal)', unit: 'kN', what: 'Shear and horizontal demand on the connection.' },
          { kind: 'choice', name: 'Grade', what: 'Bolt grade (A325M, A490M), which fixes the nominal shear and tensile strengths.' },
          { kind: 'toggle', name: 'Threads in shear plane (N)', what: 'Threads included in the shear plane reduces the bolt shear strength.' },
          { kind: 'field', name: 'Diameter db', unit: 'mm', what: 'Bolt diameter, which sets the shear, bearing and tear-out strengths.' },
          { kind: 'field', name: 'Rows (vertical) nR / Cols (horizontal) nC', what: 'Bolt rows and columns, which set the group geometry and its polar moment.' },
          { kind: 'field', name: 'Vertical spacing sv / Horizontal spacing sh', unit: 'mm', what: 'Bolt pitch in each direction.' },
          { kind: 'field', name: 'Edge dist vertical ey / horiz ex', unit: 'mm', what: 'Edge distances, which govern bearing, tear-out and block shear.' },
          { kind: 'field', name: 'In-plane e_x / e_y / Out-of-plane e_out', unit: 'mm', what: 'Load eccentricities. In-plane drives the elastic bolt-group analysis; out-of-plane drives tension and prying.' },
          { kind: 'field', name: 'Gage b (bolt CL → web face)', unit: 'mm', what: 'Distance from the bolt centreline to the web face — the prying lever arm.' },
          { kind: 'field', name: 'Plate thickness t / Plate Fy / Plate Fu', what: 'Shear-tab plate properties.' },
        ],
      },
      {
        id: 'bc-out',
        title: 'Results',
        controls: [
          { kind: 'output', name: 'φRn per bolt', what: 'Shear and bearing capacities, and which of the two governs.' },
          { kind: 'output', name: 'Critical bolt', what: 'The most-loaded bolt from the direct shear plus the torsional component, and its utilisation.' },
          { kind: 'output', name: 'Block shear §J4.3', what: 'Each tear-out path on the shear tab, with the governing one named.' },
          { kind: 'output', name: 'Bolt-group layout and 3D scene', what: 'The pattern with the resultant on each bolt, and the tab, bolts and web stub in 3D.' },
        ],
      },
    ],
  },
  {
    id: 'welded-connection',
    name: 'Welded Connection',
    route: '/welded-connection',
    group: 'Steel & timber',
    summary: 'Eccentric weld group treated as a line, with the peak force per unit length.',
    basis: 'AISC Manual Part 8, weld-as-a-line method.',
    sections: [
      {
        id: 'wc-out',
        title: 'Inputs & results',
        body: 'Geometry of the weld group is entered as its overall dimensions and the load position; the page returns the section properties of the weld line and the peak resultant per unit length.',
        controls: [
          { kind: 'output', name: 'Weld plot', what: 'Drawing of the weld line with the peak-force location marked.' },
          { kind: 'output', name: 'Required size', what: 'Fillet leg needed for the electrode chosen, from the peak force per unit length.' },
        ],
      },
    ],
  },
  {
    id: 'wood-slab',
    name: 'Wood Slab',
    route: '/wood-slab',
    group: 'Steel & timber',
    summary: 'Timber floor: joists plus a plank or bamboo-slat deck, checked in bending, shear and deflection.',
    basis: 'NDS allowable stress design with adjustment factors; NSCP §6 timber.',
    sections: [
      {
        id: 'ws-geom',
        title: 'Geometry & loads',
        controls: [
          { kind: 'field', name: 'Lx (joist span)', unit: 'm', what: 'Span the joists carry between their supports.' },
          { kind: 'field', name: 'Ly (joists repeat)', unit: 'm', what: 'Length over which joists repeat, i.e. the deck span direction.' },
          { kind: 'field', name: 'Superimposed dead / Live load', unit: 'kPa', what: 'Applied loads on the deck.' },
          { kind: 'field', name: 'Width b / Depth d', unit: 'mm', what: 'Joist breadth and depth — the section resisting bending and shear.' },
          { kind: 'field', name: 'Spacing', unit: 'mm', what: 'Joist centres, which set the load each joist picks up.' },
          { kind: 'field', name: 'Thickness t / Board/slat width', unit: 'mm', what: 'Deck board thickness and width, spanning between joists.' },
        ],
      },
      {
        id: 'ws-factors',
        title: 'Adjustment factors',
        controls: [
          { kind: 'choice', name: 'Simple span / Continuous (≥3)', what: 'Deck continuity, which sets the bending coefficient.' },
          { kind: 'choice', name: 'Plank (sawn) / Bamboo slat', what: 'Deck material, selecting its reference stresses.' },
          { kind: 'choice', name: 'Load duration', what: 'Permanent (0.9), occupancy live (1.0), snow (1.15), construction (1.25) or wind/seismic (1.6) — the C_D factor on allowable stresses.' },
          { kind: 'choice', name: 'Dry (MC ≤ 19%) / Wet service (C_M)', what: 'Service moisture condition, which applies the wet-service reduction.' },
        ],
      },
    ],
  },
]
