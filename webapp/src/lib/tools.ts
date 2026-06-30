// Single source of truth for the app's tool catalog. Consumed by the navbar
// dropdowns and the home page. Add new categories here as they ship.

export interface ToolDef { to: string; name: string; sub: string }
export interface ToolCategory { label: string; tools: ToolDef[] }

export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    label: 'Reference',
    tools: [
      { to: '/docs', name: 'Documentation', sub: 'Toolkit guide' },
      { to: '/validation', name: 'Validation', sub: 'Engine vs hand calc' },
    ],
  },
  {
    label: 'Structural',
    tools: [
      { to: '/foundation',    name: 'Foundation Design',  sub: 'Isolated pad footing'  },
      { to: '/pile-cap',      name: 'Pile Cap Design',    sub: 'Group pile cap'        },
      { to: '/combined',      name: 'Combined Footing',   sub: 'Two-column footing'    },
      { to: '/beam-design',   name: 'Beam Design',        sub: 'RC beam · ACI 318-14'  },
      { to: '/beam-analysis', name: 'Beam Analysis',      sub: 'FEM multi-span'        },
      { to: '/column-design', name: 'Column Design',      sub: 'RC column · biaxial'   },
      { to: '/frame',         name: 'Frame Analysis',     sub: '2D stiffness method'   },
      { to: '/load-path',     name: 'Slab Load Path',     sub: 'Two-way tributary'     },
      { to: '/model',         name: '3D Model Space',     sub: 'BIM-lite viewer'       },
      { to: '/truss',         name: 'Truss Space',        sub: 'Plane truss solver'    },
      { to: '/steel',         name: 'Steel Design',       sub: 'AISC 360-16 LRFD'      },
      { to: '/slab-design',   name: 'Slab Design',        sub: 'Two-way DDM · ACI 318'  },
      { to: '/stair',         name: 'Stair Design',       sub: 'RC waist slab · NSCP'   },
      { to: '/water-tank',    name: 'Water Tank',         sub: 'Circular · IS 3370/ACI 350' },
      { to: '/torsion',       name: 'Torsion Design',     sub: 'RC torsion · ACI 318-14' },
      { to: '/dev-length',    name: 'Dev & Splice',       sub: 'ACI 318-14 §25.4–25.5'   },
      { to: '/punching-shear', name: 'Punching Shear',   sub: 'Two-way §22.6 · ACI 318' },
      { to: '/retaining-wall',   name: 'Retaining Wall',   sub: 'Cantilever · Rankine'     },
      { to: '/geotech',          name: 'Geotechnical',     sub: 'Bearing · earth · slope'  },
      { to: '/soil-nail',        name: 'Soil-Nail Wall',   sub: 'FHWA · tensile · pullout' },
      { to: '/micropile',        name: 'Micropile',        sub: 'FHWA · structural · bond' },
      { to: '/rock-anchor',      name: 'Rock Anchor',      sub: 'PTI · tendon · bond'      },
      { to: '/seismic-wizard',   name: 'Seismic Wizard',   sub: 'NSCP 208 Ca/Cv/I/R'       },
      { to: '/load-combinations', name: 'Load Combinations', sub: 'NSCP 2015 §203.3 LRFD'   },
    ],
  },
  {
    label: 'Quantity Take-Off',
    tools: [
      { to: '/estimate/slab',        name: 'Slab',        sub: 'Concrete + rebar' },
      { to: '/estimate/beam',        name: 'Beam',        sub: 'Volume & weight'  },
      { to: '/estimate/column',      name: 'Column',      sub: 'Concrete + rebar' },
      { to: '/estimate/chb',         name: 'CHB Wall',    sub: 'Block count'      },
      { to: '/estimate/box-culvert', name: 'Box Culvert', sub: 'Culvert estimate' },
    ],
  },
]
