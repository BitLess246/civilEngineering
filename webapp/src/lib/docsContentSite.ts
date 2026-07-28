// Documentation content — foundations, geotechnical, estimates, planning.
import type { DocTool } from './docsModel'

const cover = { kind: 'field' as const, name: 'Clear cover', unit: 'mm', what: 'Cover to the outermost bar; sets the effective depth.' }
const fcfy = [
  { kind: 'field' as const, name: "f′c", unit: 'MPa', what: 'Concrete cylinder strength.' },
  { kind: 'field' as const, name: 'fy', unit: 'MPa', what: 'Reinforcement yield strength.' },
]

export const SITE_TOOLS: DocTool[] = [
  {
    id: 'foundation-design',
    name: 'Foundation Design',
    route: '/foundation',
    group: 'Foundations & geotechnical',
    summary: 'Isolated spread footing: sizing on allowable bearing, then punching, one-way shear and flexure.',
    basis: 'NSCP 2015 §405 footings, §422.6 two-way shear; service sizing on qa.',
    sections: [
      {
        id: 'fd-config',
        title: 'Configuration',
        controls: [
          { kind: 'choice', name: 'Type', what: 'Footing type — centred or eccentric.' },
          { kind: 'choice', name: 'Loading', what: 'Axial only, or axial with moment.' },
          { kind: 'choice', name: 'Analysis method / Solution method', what: 'How the bearing pressure distribution is derived and presented.' },
          { kind: 'choice', name: 'Sizing', what: 'Let the page size the footing, or fix the dimensions yourself with the Given fields.' },
          { kind: 'choice', name: 'Load entry', what: 'Service or factored load entry.' },
          { kind: 'choice', name: 'Column shape / Column position', what: 'Column geometry and whether it sits interior, at an edge or at a corner — which decides the punching perimeter available.' },
        ],
      },
      {
        id: 'fd-dims',
        title: 'Dimensions',
        controls: [
          { kind: 'field', name: 'Given By / Given Dc', unit: 'm', what: 'Footing width and depth when sizing is manual. Ignored when the page is sizing automatically.' },
          { kind: 'field', name: 'Aspect Bx/By', what: 'Plan aspect ratio held while sizing.' },
          { kind: 'field', name: 'Width By', unit: 'm', what: 'Footing dimension in the y direction.' },
          cover,
          { kind: 'field', name: 'Surcharge', unit: 'kPa', what: 'Load on the soil above the footing, which reduces the net bearing available.' },
        ],
      },
    ],
  },
  {
    id: 'pile-cap',
    name: 'Pile Cap Design',
    route: '/pile-cap',
    group: 'Foundations & geotechnical',
    summary: 'Pile group layout, pile reactions, and cap design for punching and flexure.',
    basis: 'NSCP 2015 §413 pile caps; §422.6 punching at the column and at individual piles.',
    sections: [
      {
        id: 'pc-in',
        title: 'Piles & cap',
        controls: [
          { kind: 'field', name: 'Pile diameter', unit: 'mm', what: 'Pile size, which sets the pile punching perimeter.' },
          { kind: 'field', name: 'Pile capacity (service)', unit: 'kN', what: 'Allowable load per pile — decides how many piles the group needs.' },
          { kind: 'field', name: 'Pile spacing (c/c)', unit: 'mm', what: 'Centre-to-centre spacing; usually at least 3 diameters.' },
          { kind: 'field', name: 'Edge distance', unit: 'mm', what: 'Distance from the outer pile centre to the cap edge.' },
          { kind: 'field', name: 'Pile embedment', unit: 'mm', what: 'How far the pile projects into the cap.' },
          cover,
        ],
      },
      {
        id: 'pc-out',
        title: 'Checks',
        controls: [
          { kind: 'output', name: 'Column punching', what: 'Two-way shear on the perimeter at d/2 from the column face.' },
          { kind: 'output', name: 'Pile punching (worst)', what: 'Two-way shear around the most heavily loaded individual pile.' },
        ],
      },
    ],
  },
  {
    id: 'combined-footing',
    name: 'Combined Footing',
    route: '/combined',
    group: 'Foundations & geotechnical',
    summary: 'Two columns on one footing — rectangular or trapezoidal — proportioned so the resultant sits at the centroid.',
    basis: 'NSCP 2015 §405; rigid-footing pressure distribution.',
    sections: [
      {
        id: 'cf-in',
        title: 'Inputs',
        controls: [
          { kind: 'field', name: 'C/C spacing', unit: 'm', what: 'Distance between the two column centres.' },
          { kind: 'field', name: 'Left overhang / Right overhang', unit: 'm', what: 'Projection beyond each column. Adjusting these is how the pressure is made uniform.' },
          cover,
          { kind: 'field', name: 'Surcharge', unit: 'kPa', what: 'Load on the soil above the footing.' },
          { kind: 'choice', name: 'Method', what: 'Rectangular or trapezoidal proportioning.' },
        ],
      },
    ],
  },
  {
    id: 'retaining-wall',
    name: 'Retaining Wall',
    route: '/retaining-wall',
    group: 'Foundations & geotechnical',
    summary: 'Cantilever retaining wall: stability against overturning, sliding and bearing, then stem and base reinforcement.',
    basis: 'Rankine active pressure; NSCP 2015 §405 for the RC design.',
    sections: [
      {
        id: 'rw-geom',
        title: 'Geometry',
        controls: [
          { kind: 'field', name: 'Stem height Hs', unit: 'm', what: 'Height of the stem above the base.' },
          { kind: 'field', name: 'Base thickness tb', unit: 'm', what: 'Thickness of the base slab; it carries the toe and heel bending.' },
          { kind: 'field', name: 'Stem width ts', unit: 'm', what: 'Thickness of the vertical stem at its base, where the stem moment peaks.' },
          { kind: 'field', name: 'Toe projection bt / Heel projection bh', unit: 'm', what: 'Base projections in front of and behind the stem. The heel carries the soil that stabilises the wall; the toe controls bearing.' },
        ],
      },
      {
        id: 'rw-soil',
        title: 'Soil & materials',
        controls: [
          { kind: 'field', name: 'γs — soil unit weight', unit: 'kN/m³', what: 'Retained soil unit weight.' },
          { kind: 'field', name: 'φ — friction angle', unit: '°', what: 'Drives the Rankine active coefficient Ka.' },
          { kind: 'field', name: 'Surcharge q', unit: 'kPa', what: 'Load on the retained surface, adding a rectangular pressure block.' },
          { kind: 'field', name: 'μ — base friction', what: 'Friction coefficient under the base, for the sliding check.' },
          { kind: 'field', name: 'qa — allowable bearing', unit: 'kPa', what: 'Bearing limit under the toe.' },
          { kind: 'field', name: 'γc — concrete unit weight', unit: 'kN/m³', what: 'Concrete unit weight, which sets the stabilising self-weight of stem and base.' },
          ...fcfy,
          { kind: 'field', name: 'Cover (stem) / Main bar ⌀', unit: 'mm', what: 'Reinforcement detail for the stem design.' },
        ],
      },
    ],
  },
  {
    id: 'geotech',
    name: 'Geotechnical',
    route: '/geotech',
    group: 'Foundations & geotechnical',
    summary: 'Earth pressure, bearing capacity and infinite-slope stability in one place.',
    basis: 'Rankine; Terzaghi / Meyerhof with Vesić Nγ; infinite-slope FS.',
    sections: [
      {
        id: 'gt-earth',
        title: 'Earth pressure',
        controls: [
          { kind: 'field', name: 'γ / Wall height H / φ / Surcharge q / Cohesion c', what: 'Rankine inputs — unit weight, retained height, friction angle, surface surcharge and cohesion.' },
        ],
      },
      {
        id: 'gt-bearing',
        title: 'Bearing capacity',
        controls: [
          { kind: 'field', name: 'Width B / Depth Df', unit: 'm', what: 'Footing width and founding depth.' },
          { kind: 'field', name: 'FS', what: 'Factor of safety applied to the ultimate capacity.' },
          { kind: 'choice', name: 'Strip / Square / Circular', what: 'Footing shape, which selects the shape factors.' },
        ],
      },
      {
        id: 'gt-slope',
        title: 'Infinite slope',
        controls: [
          { kind: 'field', name: 'Depth z / Slope β / γsat', what: 'Depth to the failure plane, slope angle and saturated unit weight.' },
          { kind: 'toggle', name: 'Seepage parallel to slope (water table at surface)', what: 'Switches to the seepage case, which markedly lowers the factor of safety.' },
        ],
      },
    ],
  },
  {
    id: 'soil-nail',
    name: 'Soil Nail',
    route: '/soil-nail',
    group: 'Foundations & geotechnical',
    summary: 'Soil-nail wall: nail forces from the earth pressure, bar tension and grout bond.',
    basis: 'FHWA GEC-7.',
    sections: [
      {
        id: 'sn-in',
        title: 'Inputs',
        controls: [
          { kind: 'field', name: 'Nail depth z', unit: 'm', what: 'Depth of the nail being checked.' },
          { kind: 'field', name: 'Horiz. spacing Sh / Vert. spacing Sv', unit: 'm', what: 'Nail grid, which sets the tributary area each nail carries.' },
          { kind: 'field', name: 'γ / φ / Surcharge q', what: 'Soil unit weight, friction angle and surface surcharge.' },
          { kind: 'field', name: 'Bar Ø / fy', what: 'Nail bar size and grade, for the tensile check.' },
          { kind: 'field', name: 'Drill hole DDH', unit: 'mm', what: 'Drill hole diameter, which sets the bond perimeter.' },
          { kind: 'field', name: 'Bond length Le / Bond strength qu', what: 'Length beyond the failure surface and the grout–soil bond stress.' },
        ],
      },
    ],
  },
  {
    id: 'micropile',
    name: 'Micropile',
    route: '/micropile',
    group: 'Foundations & geotechnical',
    summary: 'Micropile capacity: structural capacity of bar, grout and casing, and the grout–ground bond.',
    basis: 'FHWA NHI-05-039.',
    sections: [
      {
        id: 'mp-in',
        title: 'Inputs',
        controls: [
          { kind: 'field', name: 'Bar Ø / Fy bar', what: 'Central reinforcing bar size and grade — one component of the structural capacity.' },
          { kind: 'field', name: 'Grout Ø (drill) / f′c grout', what: 'Grout column diameter and strength.' },
          { kind: 'field', name: 'Casing OD / Casing ID / Fy casing', what: 'Permanent casing dimensions and grade.' },
          { kind: 'toggle', name: 'Permanent steel casing', what: 'Includes the casing in the structural capacity. Uncased piles rely on bar and grout only.' },
          { kind: 'field', name: 'Bond Ø / Bond length / αbond', what: 'Bond zone diameter, length and the grout-to-ground bond stress.' },
          { kind: 'field', name: 'Axial demand P', unit: 'kN', what: 'Axial demand on the pile, compared against both the structural and the bond capacity.' },
          { kind: 'choice', name: 'Compression / Tension', what: 'Loading direction — tension omits the end bearing and uses the tensile structural capacity.' },
        ],
      },
    ],
  },
  {
    id: 'rock-anchor',
    name: 'Rock Anchor',
    route: '/rock-anchor',
    group: 'Foundations & geotechnical',
    summary: 'Rock anchor: tendon capacity and grout–rock bond length.',
    basis: 'Post-Tensioning Institute / FHWA anchor practice.',
    sections: [
      {
        id: 'ra-in',
        title: 'Inputs',
        controls: [
          { kind: 'field', name: 'fpu / Tendon area Aps', what: 'Tendon ultimate strength and steel area, which together set the anchor capacity.' },
          { kind: 'field', name: 'Axial demand T', unit: 'kN', what: 'Tension the anchor must carry; sets the required bond length.' },
          { kind: 'field', name: 'Hole Ø / Bond length / Bond τult', what: 'Drill hole size, bonded length and the ultimate grout–rock bond stress.' },
        ],
      },
    ],
  },
  {
    id: 'shotcrete-facing',
    name: 'Shotcrete Facing',
    route: '/shotcrete-facing',
    group: 'Foundations & geotechnical',
    summary: 'Facing design for a nailed wall — flexure between nails and punching at the nail head.',
    basis: 'FHWA GEC-7 facing design.',
    sections: [
      {
        id: 'sf-in',
        title: 'Inputs',
        controls: [
          { kind: 'field', name: 'Horiz. spacing SH / Vert. spacing SV', unit: 'm', what: 'Nail grid — the facing spans between nails.' },
          { kind: 'field', name: 'Facing thickness hc / Cover', unit: 'mm', what: 'Facing thickness and cover — the section resisting flexure between nails.' },
          { kind: 'field', name: 'Vert. steel As / Horiz. steel As', unit: 'mm²/m', what: 'Reinforcement in each direction.' },
          { kind: 'field', name: 'Bearing plate', unit: 'mm', what: 'Plate size at the nail head, which sets the punching perimeter.' },
          { kind: 'field', name: 'Pressure factor CF', what: 'Factor relating the nail-head force to the average facing pressure.' },
          ...fcfy,
          { kind: 'field', name: 'Nail-head force', unit: 'kN', what: 'Force the facing must transfer into the nail.' },
        ],
      },
    ],
  },
  {
    id: 'stair-design',
    name: 'Stair Design',
    route: '/stair',
    group: 'Concrete design',
    summary: 'RC stair flight designed as an inclined one-way slab.',
    basis: 'NSCP 2015 §409 flexure; loads from the tread/riser geometry.',
    sections: [
      {
        id: 'st-in',
        title: 'Inputs',
        controls: [
          { kind: 'field', name: 'Flight span', unit: 'm', what: 'Horizontal span of the flight.' },
          { kind: 'field', name: 'Waist t', unit: 'mm', what: 'Structural slab thickness measured perpendicular to the soffit.' },
          { kind: 'field', name: 'Riser R / Going G', unit: 'mm', what: 'Step geometry, which sets the inclination and the step self-weight.' },
          { kind: 'field', name: 'Finishes / Live load', unit: 'kPa', what: 'Finishes and live load carried in addition to the stair self-weight.' },
          ...fcfy,
          { kind: 'field', name: 'Main bar Ø / Cover', unit: 'mm', what: 'Bar diameter and cover, which together fix the effective depth.' },
          { kind: 'choice', name: 'Simply supported / One end continuous / Both ends continuous', what: 'End restraint, which sets the design moment coefficient.' },
        ],
      },
    ],
  },
  {
    id: 'water-tank',
    name: 'Water Tank',
    route: '/water-tank',
    group: 'Concrete design',
    summary: 'Circular liquid-retaining tank wall, designed for hoop tension with crack-control stress limits.',
    basis: 'Working-stress design for liquid retention.',
    sections: [
      {
        id: 'wt-in',
        title: 'Inputs',
        controls: [
          { kind: 'field', name: 'Water depth H / Diameter D', unit: 'm', what: 'Liquid depth and tank diameter; hoop tension is γw·H·D/2.' },
          { kind: 'field', name: 'Wall thickness t', unit: 'mm', what: 'Wall thickness resisting the hoop tension from the liquid pressure.' },
          { kind: 'field', name: 'Freeboard', unit: 'm', what: 'Height above the liquid surface.' },
          { kind: 'field', name: "f′c", unit: 'MPa', what: 'Concrete cylinder strength of the wall section.' },
          { kind: 'field', name: 'σst (steel) / σct (concrete)', unit: 'MPa', what: 'Permissible working stresses — these are crack-control limits, well below yield.' },
          { kind: 'field', name: 'Bar Ø / Cover', unit: 'mm', what: 'Bar diameter and cover, which together fix the effective depth.' },
        ],
      },
    ],
  },
  {
    id: 'plumbing',
    name: 'Plumbing & Sanitary',
    route: '/plumbing',
    group: 'Foundations & geotechnical',
    summary: 'Water supply sizing by Hunter fixture units, drainage sizing, and septic tank volume.',
    basis: "Hunter's curve for demand; Hazen–Williams for head loss; national plumbing code fixture units.",
    sections: [
      {
        id: 'pl-supply',
        title: 'Water supply',
        controls: [
          { kind: 'choice', name: 'Flush tanks (A-2) / Flush valves (A-3)', what: "Which Hunter curve to use — flush-valve systems draw much higher peak flow." },
          { kind: 'choice', name: 'Private / Public', what: 'Occupancy, which sets the fixture-unit values per fixture.' },
          { kind: 'field', name: 'Pipe length / Fittings (equiv. L)', unit: 'm', what: 'Developed length and the equivalent length of fittings, added for friction loss.' },
          { kind: 'field', name: 'Highest fixture rise Z', unit: 'm', what: 'Static lift to the highest outlet.' },
          { kind: 'field', name: 'Design flow override', unit: 'L/s', what: 'Bypasses the Hunter demand with a flow you specify. Leave 0 to use the curve.' },
          { kind: 'field', name: 'Main pressure / Meter drop / Residual (fixture)', unit: 'kPa', what: 'Available street pressure, loss across the meter, and the residual required at the fixture.' },
        ],
      },
      {
        id: 'pl-drain',
        title: 'Drainage & septic',
        controls: [
          { kind: 'field', name: 'Plan width / Liquid depth', unit: 'm', what: 'Septic tank proportions used for the retention volume.' },
        ],
      },
    ],
  },
  {
    id: 'estimates',
    name: 'Quantity estimators',
    route: '/estimate/slab',
    group: 'Estimates',
    summary: 'Five take-off pages — slab, beam, column, CHB wall and box culvert — producing concrete, steel, formwork and tie-wire quantities.',
    basis: 'Volumetric take-off with cement-factor mix proportions and commercial bar lengths.',
    sections: [
      {
        id: 'est-common',
        title: 'Controls common to every estimator',
        controls: [
          { kind: 'field', name: 'Cement factor', unit: 'bags/m³', what: 'Mix richness. Sets the cement, sand and gravel per cubic metre.' },
          { kind: 'field', name: 'Splice length', unit: 'm', what: 'Lap added at each bar splice; increases the total steel length.' },
          { kind: 'field', name: 'Length / piece', unit: 'm', what: 'Commercial bar length being bought, which decides how many pieces the cut length needs.' },
          { kind: 'field', name: 'Bar Ø', unit: 'mm', what: 'Bar size, which converts length to mass.' },
          { kind: 'field', name: 'Length / cut', unit: 'm', what: 'Tie-wire length used per tie.' },
          { kind: 'output', name: 'Quantity cards', what: 'Concrete volume with the cement/sand/gravel split, steel by diameter, and tie wire by mass.' },
        ],
      },
      {
        id: 'est-slab',
        title: 'Slab estimate',
        controls: [
          { kind: 'field', name: 'Slab area / Thickness', what: 'Plan area (m²) and thickness (mm) giving the concrete volume.' },
          { kind: 'field', name: 'No. of structures', what: 'Repeat count — the whole take-off is multiplied by it.' },
          { kind: 'field', name: 'No. of pieces', what: 'Bars required per direction.' },
        ],
      },
      {
        id: 'est-beam',
        title: 'Beam estimate',
        controls: [
          { kind: 'field', name: 'Length / Width / Height', what: 'Beam length, width and height, giving the concrete volume per beam.' },
          { kind: 'field', name: 'No. of beams', what: 'How many identical members; the whole take-off is multiplied by it.' },
          { kind: 'field', name: 'Length / stirrup / Stirrups / beam / Stirrup Ø', what: 'Stirrup take-off — cut length, count per beam, and size.' },
        ],
      },
      {
        id: 'est-column',
        title: 'Column estimate',
        controls: [
          { kind: 'field', name: 'Length / Width / Height / No. of columns', what: 'Column dimensions and count.' },
          { kind: 'field', name: 'Bars / column', what: 'Number of longitudinal bars, which sets the total bar length and mass.' },
          { kind: 'field', name: 'Length / tie / Ties / column / Tie Ø', what: 'Tie cut length, number of ties per column and the tie diameter.' },
        ],
      },
      {
        id: 'est-chb',
        title: 'CHB wall estimate',
        controls: [
          { kind: 'field', name: 'Gross wall area / Openings area', unit: 'm²', what: 'Net block area is gross minus openings.' },
          { kind: 'choice', name: 'CHB size', what: 'Block size, which sets blocks per m² and the mortar volume.' },
        ],
      },
      {
        id: 'est-culvert',
        title: 'Box culvert estimate',
        controls: [
          { kind: 'field', name: 'Gross x-section area / Opening area / Length', what: 'Cross-section and barrel length giving the concrete volume.' },
          { kind: 'field', name: 'No. top bars / Top bar Ø / Top bar length', what: 'Number, diameter and cut length of the top bars.' },
          { kind: 'field', name: 'No. U-bars / U-bar Ø / U-bar length / Spacing', what: 'Number, diameter, cut length and spacing of the U-bars.' },
        ],
      },
    ],
  },
  {
    id: 'schedule',
    name: 'Project Schedule',
    route: '/schedule',
    group: 'Planning & scheduling',
    summary: 'CPM/PERT scheduler: activities, dependencies, calendars, resources, baselines and earned-value reporting.',
    basis: 'Critical Path Method with PERT three-point estimates; earned-value (PV/EV/AC) reporting.',
    sections: [
      {
        id: 'sc-activities',
        title: 'Activities',
        controls: [
          { kind: 'button', name: '+ add predecessor…', what: 'Adds a dependency to the activity. Choose the driving activity, the relation type (FS, SS, FF, SF) and any lag.' },
          { kind: 'choice', name: '— none —', what: 'Clears a predecessor slot.' },
          { kind: 'choice', name: 'Relation type', what: 'Finish-to-start, start-to-start, finish-to-finish or start-to-finish.' },
          { kind: 'field', name: 'Lag', unit: 'd', what: 'Delay applied to the relation. Negative values lead.' },
          { kind: 'choice', name: 'No / Yes (0 d)', what: 'Whether the activity is a milestone (zero duration).' },
        ],
        notes: ['A dependency that would create a cycle is rejected and the offending loop is reported rather than silently ignored.'],
      },
      {
        id: 'sc-views',
        title: 'Views',
        controls: [
          { kind: 'tab', name: 'Gantt', what: 'Bar chart against the calendar, with the critical path highlighted and an optional baseline overlay.' },
          { kind: 'choice', name: 'No baseline', what: 'Baseline to compare against on the Gantt. "No baseline" hides the comparison bars.' },
          { kind: 'tab', name: 'Network', what: 'Activity-on-node diagram; editing a duration here re-solves and updates the Gantt and tables together.' },
          { kind: 'tab', name: 'Dashboard', what: 'Progress and earned value — SPI/CPI, planned vs earned vs actual cost, forecast finish and the S-curve.' },
          { kind: 'tab', name: 'Resources', what: 'Resource assignment and histogram, with cost rates that feed the earned-value figures.' },
          { kind: 'tab', name: 'Reports', what: 'Printable schedule reports.' },
          { kind: 'tab', name: 'Daily', what: 'Day-by-day look-ahead of what is in progress.' },
        ],
      },
      {
        id: 'sc-model',
        title: 'From the 3D model',
        body: 'Model Space can generate a construction schedule from the designed structure and push it here. Re-opening it updates the same linked project — refreshing the structure while keeping the scheduler-side calendar, resources, baselines and per-activity actuals.',
        controls: [
          { kind: 'button', name: 'Open in Scheduler → / Update in Scheduler →', what: 'Creates the linked project, or refreshes it if one already exists. The label tells you which will happen.' },
        ],
      },
    ],
  },
]
