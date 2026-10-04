// Single source of truth for the app's tool catalog. Consumed by the navbar
// dropdowns and the home page. Add new categories here as they ship.

export interface ToolDef { to: string; name: string; sub: string; group?: string }
export interface ToolCategory { label: string; tools: ToolDef[] }

export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    label: 'Reference',
    tools: [
      { to: '/docs', name: 'Documentation', sub: 'User guide' },
      { to: '/validation', name: 'Validation', sub: 'Engine vs hand calc' },
      { to: '/pricing', name: 'Plans', sub: 'Pricing · PHP' },
    ],
  },
  {
    label: 'Structural',
    tools: [
      { to: '/beam-design',   name: 'Beam Design',        sub: 'RC beam · ACI 318-14',      group: 'Concrete' },
      { to: '/tbeam-design',  name: 'T-Beam Design',      sub: 'flanged beam · §6.3.2',     group: 'Concrete' },
      { to: '/prestressed-beam', name: 'Prestressed Beam', sub: 'PCI losses · §24.5 · fps',  group: 'Concrete' },
      { to: '/column-design', name: 'Column Design',      sub: 'RC column · biaxial',       group: 'Concrete' },
      { to: '/slab-design',   name: 'Slab Design',        sub: 'Two-way DDM · ACI 318',     group: 'Concrete' },
      { to: '/stair',         name: 'Stair Design',       sub: 'RC waist slab · NSCP',      group: 'Concrete' },
      { to: '/lintel',        name: 'Lintel Beam',        sub: 'opening · masonry arching',  group: 'Concrete' },
      { to: '/water-tank',    name: 'Water Tank',         sub: 'Circular · IS 3370/ACI 350', group: 'Concrete' },
      { to: '/torsion',       name: 'Torsion Design',     sub: 'RC torsion · ACI 318-14',   group: 'Concrete' },
      { to: '/concrete-mix',  name: 'Concrete Mix Design', sub: 'ACI 211 · absolute volume', group: 'Concrete' },
      { to: '/dev-length',    name: 'Dev & Splice',       sub: 'ACI 318-14 §25.4–25.5',     group: 'Concrete' },
      { to: '/punching-shear', name: 'Punching Shear',    sub: 'Two-way §22.6 · ACI 318',   group: 'Concrete' },
      { to: '/model',         name: '3D Model Space',     sub: 'BIM-lite viewer',           group: 'Analysis & Modelling' },
      { to: '/frame',         name: 'Frame Analysis',     sub: '2D stiffness method',       group: 'Analysis & Modelling' },
      { to: '/beam-analysis', name: 'Beam Analysis',      sub: 'FEM multi-span',            group: 'Analysis & Modelling' },
      { to: '/truss',         name: 'Truss Space',        sub: 'Plane truss solver',        group: 'Analysis & Modelling' },
      { to: '/load-path',     name: 'Slab Load Path',     sub: 'Two-way tributary',         group: 'Analysis & Modelling' },
      { to: '/influence-lines', name: 'Influence Lines',  sub: 'Truss & beam · moving load', group: 'Analysis & Modelling' },
      { to: '/section-properties', name: 'Section Properties', sub: 'A · I · S · r · built-up', group: 'Analysis & Modelling' },
      { to: '/bridge-loading', name: 'Bridge Loading', sub: 'HL-93 · lever rule · envelope', group: 'Bridge' },
      { to: '/bridge-rating', name: 'Bridge Rating', sub: 'MBE · RF · HL-93 rated', group: 'Bridge' },
      { to: '/steel/beam',    name: 'Steel Beam',         sub: 'AISC §F2–F3 / §G2.1',          group: 'Steel & Connections' },
      { to: '/steel/column',  name: 'Steel Column',       sub: 'AISC §E3 / §H1-1',          group: 'Steel & Connections' },
      { to: '/bolted-connection', name: 'Bolted Connection', sub: 'Eccentric bolt group',   group: 'Steel & Connections' },
      { to: '/welded-connection', name: 'Welded Connection', sub: 'Eccentric weld group',   group: 'Steel & Connections' },
      { to: '/foundation',    name: 'Foundation Design',  sub: 'Isolated pad footing',      group: 'Foundations' },
      { to: '/pile-cap',      name: 'Pile Cap Design',    sub: 'Group pile cap',            group: 'Foundations' },
      { to: '/combined',      name: 'Combined Footing',   sub: 'Two-column footing',        group: 'Foundations' },
      { to: '/retaining-wall',   name: 'Retaining Wall',   sub: 'Cantilever · Rankine',     group: 'Geotechnical' },
      { to: '/earth-pressure',   name: 'Earth Pressure',   sub: 'Rankine · Coulomb · M-O',  group: 'Geotechnical' },
      { to: '/bearing-capacity', name: 'Bearing Capacity', sub: 'Meyerhof · Hansen · Vesić', group: 'Geotechnical' },
      { to: '/soil-nail',        name: 'Soil-Nail Wall',   sub: 'FHWA · tensile · pullout', group: 'Geotechnical' },
      { to: '/micropile',        name: 'Micropile',        sub: 'FHWA · structural · bond', group: 'Geotechnical' },
      { to: '/rock-anchor',      name: 'Rock Anchor',      sub: 'PTI · tendon · bond',      group: 'Geotechnical' },
      { to: '/shotcrete-facing', name: 'Shotcrete Facing', sub: 'FHWA · flexure · punching', group: 'Geotechnical' },
      { to: '/slope',            name: 'Slope Stability',  sub: 'Slices · Bishop/Fellenius/Janbu', group: 'Geotechnical' },
      { to: '/settlement',       name: 'Settlement',       sub: 'Boussinesq · Terzaghi · Schmertmann', group: 'Geotechnical' },
      { to: '/lateral-pile',     name: 'Lateral Pile',     sub: 'Broms · p-y (Matlock/API)', group: 'Geotechnical' },
      { to: '/pile-capacity',    name: 'Pile Capacity',    sub: 'α method · Meyerhof · layers', group: 'Geotechnical' },
      { to: '/soils',            name: 'Soil Investigation', sub: 'Boreholes · SPT · USCS',  group: 'Geotechnical' },
      { to: '/seismic-wizard',   name: 'Seismic Wizard',   sub: 'NSCP 208 Ca/Cv/I/R',       group: 'Seismic & Loads' },
      { to: '/load-combinations', name: 'Load Combinations', sub: 'NSCP 2015 §203.3 LRFD',  group: 'Seismic & Loads' },
      { to: '/wood-slab',        name: 'Wood Slab',        sub: 'Deck-on-joist · NDS §3 / NSCP §6', group: 'Timber' },
      { to: '/plumbing',         name: 'Plumbing Design',  sub: 'Water · DWV · septic · RNPCP', group: 'Plumbing & Sanitary' },
    ],
  },
  {
    label: 'Surveying',
    tools: [
      { to: '/surveying', name: 'Surveying Toolbox', sub: 'Leveling · traverse · curves · earthwork', group: 'Field & route surveying' },
    ],
  },
  {
    label: 'Transportation',
    tools: [
      { to: '/traffic-volume', name: 'Traffic Volume', sub: 'PHF · DHV · AADT growth', group: 'Traffic' },
      { to: '/signal-timing', name: 'Signal Timing', sub: 'Webster cycle · splits · LOS', group: 'Traffic' },
      { to: '/traffic-queue', name: 'Traffic Queues', sub: 'D/D/1 · M/M/1 · delay', group: 'Traffic' },
      { to: '/roundabout', name: 'Roundabout Capacity', sub: 'HCM 2010 · entry · LOS', group: 'Intersections' },
      { to: '/geometric-design', name: 'Geometric Design', sub: 'SSD · vertical curves · superelevation', group: 'Highway Design' },
      { to: '/pavement', name: 'Flexible Pavement', sub: 'AASHTO 93 · ESALs · SN', group: 'Highway Design' },
      { to: '/rigid-pavement', name: 'Rigid Pavement', sub: 'AASHTO 93 · D-slab · J', group: 'Highway Design' },
      { to: '/esal', name: 'Axle Load ESALs', sub: 'Fourth-power · LEF · W18', group: 'Highway Design' },
    ],
  },
  {
    label: 'Water Resources',
    tools: [
      { to: '/rational-method', name: 'Rational Method', sub: 'Q = CiA · Tc · IDF', group: 'Hydrology' },
      { to: '/open-channel', name: 'Open Channel Flow', sub: 'Manning · critical · jump', group: 'Hydraulics' },
      { to: '/pipe-flow', name: 'Pipe Flow', sub: 'Hazen–Williams · Darcy', group: 'Hydraulics' },
      { to: '/weir-flow', name: 'Weir Flow', sub: 'Francis · Cipolletti · V-notch', group: 'Hydraulics' },
      { to: '/culvert', name: 'Culvert Hydraulics', sub: 'HDS-5 · inlet & outlet control', group: 'Hydraulics' },
      { to: '/gvf-profiles', name: 'GVF Profiles', sub: 'Chow M/S/C/H/A · water surface', group: 'Hydraulics' },
      { to: '/runoff', name: 'SCS Runoff', sub: 'CN · Tc · TR-55 UH peak', group: 'Hydrology' },
      { to: '/muskingum', name: 'Muskingum Routing', sub: 'K·X · flood wave · lag', group: 'Hydrology' },
      { to: '/detention', name: 'Detention Pond', sub: 'storage indication · stage', group: 'Hydrology' },
      { to: '/do-sag', name: 'DO Sag Curve', sub: 'Streeter–Phelps · critical DO', group: 'Water Quality' },
      { to: '/storm-sewer', name: 'Storm Sewer', sub: 'Rational · Manning · tc chain', group: 'Drainage' },
      { to: '/water-demand', name: 'Water Demand', sub: 'Forecast · peaking · storage', group: 'Water Supply' },
      { to: '/pump-station', name: 'Pump Station', sub: 'System × pump · NPSH · power', group: 'Water Supply' },
    ],
  },
  {
    label: 'Mathematics',
    tools: [
      { to: '/eng-economy', name: 'Engineering Economy', sub: 'Time value · NPV/IRR · depreciation', group: 'Time Value of Money' },
      { to: '/hydrostatics', name: 'Hydrostatics', sub: 'Plane force · gates · buoyancy · vessels', group: 'Fluid Statics' },
      { to: '/dynamics', name: 'Dynamics', sub: 'Kinematics · kinetics · work-energy · impulse', group: 'Mechanics' },
      { to: '/drafting3d', name: 'Drafting3D', sub: 'Floor plans → 3D → ModelSpace', group: 'Drafting' },
    ],
  },
  {
    label: 'Project Planning',
    tools: [
      { to: '/schedule',        name: 'Project Schedule', sub: 'CPM · PERT · progress' },
      { to: '/schedule/gantt',   name: 'Gantt Chart',      sub: 'Timeline · baseline' },
      { to: '/schedule/network', name: 'Network Diagram',  sub: 'AON · critical path' },
      { to: '/schedule/dashboard', name: 'Dashboard',      sub: 'Progress · EVM · SPI/CPI' },
      { to: '/schedule/resources', name: 'Resource Loading', sub: 'Histogram · over-allocation' },
      { to: '/schedule/reports',   name: 'Reports',          sub: 'PDF · Excel · CSV' },
      { to: '/schedule/daily',     name: 'Daily & Delays',   sub: 'Actuals · baseline · delay' },
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

/** Tools of a category bucketed by their `group` tag, preserving first-seen
 *  group order. Ungrouped tools land under '' (render without a header). */
export function toolGroups(category: ToolCategory): { group: string; tools: ToolDef[] }[] {
  const order: string[] = []
  const byGroup = new Map<string, ToolDef[]>()
  for (const t of category.tools) {
    const g = t.group ?? ''
    if (!byGroup.has(g)) { byGroup.set(g, []); order.push(g) }
    byGroup.get(g)!.push(t)
  }
  return order.map((group) => ({ group, tools: byGroup.get(group)! }))
}

/** Sidebar groups for the workbench shell (docs/design/uiux-2026-07): the
 *  Structural category's sub-groups become top-level sections, take-off and
 *  reference get their own. Pure re-bucketing of TOOL_CATEGORIES. */
export interface SidebarGroup { label: string; tools: ToolDef[] }
export const SIDEBAR_GROUPS: SidebarGroup[] = (() => {
  const structural = TOOL_CATEGORIES.find((c) => c.label === 'Structural')!
  const planning = TOOL_CATEGORIES.find((c) => c.label === 'Project Planning')!
  const takeoff = TOOL_CATEGORIES.find((c) => c.label === 'Quantity Take-Off')!
  const reference = TOOL_CATEGORIES.find((c) => c.label === 'Reference')!
  const surveying = TOOL_CATEGORIES.find((c) => c.label === 'Surveying')!
  const transportation = TOOL_CATEGORIES.find((c) => c.label === 'Transportation')!
  const water = TOOL_CATEGORIES.find((c) => c.label === 'Water Resources')!
  const mathematics = TOOL_CATEGORIES.find((c) => c.label === 'Mathematics')!
  const short: Record<string, string> = {
    'Analysis & Modelling': 'Analysis',
    'Steel & Connections': 'Steel',
  }
  const groups = toolGroups(structural).map(({ group, tools }) => ({ label: short[group] ?? group, tools }))
  return [
    ...groups,
    { label: 'Surveying', tools: surveying.tools },
    { label: 'Transportation', tools: transportation.tools },
    { label: 'Water', tools: water.tools },
    { label: 'Mathematics', tools: mathematics.tools },
    { label: 'Planning', tools: planning.tools },
    { label: 'Estimates', tools: takeoff.tools },
    { label: 'Reference', tools: reference.tools },
  ]
})()

/** Every tool with its sidebar group label — drives the ⌘K palette and the
 *  shell breadcrumb. */
export const ALL_TOOLS: (ToolDef & { groupLabel: string })[] =
  SIDEBAR_GROUPS.flatMap((g) => g.tools.map((t) => ({ ...t, groupLabel: g.label })))

/**
 * Routes that need an account/plan — advertised with a lock badge + "Sign in"
 * suffix pre-click, never with equal weight then a post-click wall.
 * Mirrors the RequireAuth gates in App.tsx (members-only + trial/plan gates).
 */
export const GATED_ROUTES: ReadonlySet<string> = new Set([
  '/model', '/frame', '/truss', '/soils', '/seismic-wizard',
  '/estimate/slab', '/estimate/beam', '/estimate/column', '/estimate/chb',
  '/estimate/box-culvert',
  '/schedule', '/schedule/gantt', '/schedule/network', '/schedule/dashboard',
  '/schedule/resources', '/schedule/reports', '/schedule/daily',
])

export const isGatedRoute = (to: string): boolean => GATED_ROUTES.has(to)

/** Shared palette teaching copy — one string for the hero, the pill and the
 *  palette placeholder, so the query vocabulary never drifts between them. */
export const PALETTE_EXAMPLES = 'try "footing", "W-shape", "seismic"…'
