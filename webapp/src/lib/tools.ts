// Single source of truth for the app's tool catalog. Consumed by the navbar
// dropdowns and the home page. Add new categories here as they ship.

export interface ToolDef { to: string; name: string; sub: string; group?: string }
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
      { to: '/beam-design',   name: 'Beam Design',        sub: 'RC beam · ACI 318-14',      group: 'Concrete' },
      { to: '/tbeam-design',  name: 'T-Beam Design',      sub: 'flanged beam · §6.3.2',     group: 'Concrete' },
      { to: '/prestressed-beam', name: 'Prestressed Beam', sub: 'PCI losses · §24.5 · fps',  group: 'Concrete' },
      { to: '/column-design', name: 'Column Design',      sub: 'RC column · biaxial',       group: 'Concrete' },
      { to: '/slab-design',   name: 'Slab Design',        sub: 'Two-way DDM · ACI 318',     group: 'Concrete' },
      { to: '/stair',         name: 'Stair Design',       sub: 'RC waist slab · NSCP',      group: 'Concrete' },
      { to: '/water-tank',    name: 'Water Tank',         sub: 'Circular · IS 3370/ACI 350', group: 'Concrete' },
      { to: '/torsion',       name: 'Torsion Design',     sub: 'RC torsion · ACI 318-14',   group: 'Concrete' },
      { to: '/dev-length',    name: 'Dev & Splice',       sub: 'ACI 318-14 §25.4–25.5',     group: 'Concrete' },
      { to: '/punching-shear', name: 'Punching Shear',    sub: 'Two-way §22.6 · ACI 318',   group: 'Concrete' },
      { to: '/model',         name: '3D Model Space',     sub: 'BIM-lite viewer',           group: 'Analysis & Modelling' },
      { to: '/frame',         name: 'Frame Analysis',     sub: '2D stiffness method',       group: 'Analysis & Modelling' },
      { to: '/beam-analysis', name: 'Beam Analysis',      sub: 'FEM multi-span',            group: 'Analysis & Modelling' },
      { to: '/truss',         name: 'Truss Space',        sub: 'Plane truss solver',        group: 'Analysis & Modelling' },
      { to: '/load-path',     name: 'Slab Load Path',     sub: 'Two-way tributary',         group: 'Analysis & Modelling' },
      { to: '/steel',         name: 'Steel Design',       sub: 'AISC 360-16 LRFD',          group: 'Steel & Connections' },
      { to: '/bolted-connection', name: 'Bolted Connection', sub: 'Eccentric bolt group',   group: 'Steel & Connections' },
      { to: '/welded-connection', name: 'Welded Connection', sub: 'Eccentric weld group',   group: 'Steel & Connections' },
      { to: '/foundation',    name: 'Foundation Design',  sub: 'Isolated pad footing',      group: 'Foundations' },
      { to: '/pile-cap',      name: 'Pile Cap Design',    sub: 'Group pile cap',            group: 'Foundations' },
      { to: '/combined',      name: 'Combined Footing',   sub: 'Two-column footing',        group: 'Foundations' },
      { to: '/retaining-wall',   name: 'Retaining Wall',   sub: 'Cantilever · Rankine',     group: 'Geotechnical' },
      { to: '/geotech',          name: 'Geotechnical',     sub: 'Bearing · earth · slope',  group: 'Geotechnical' },
      { to: '/soil-nail',        name: 'Soil-Nail Wall',   sub: 'FHWA · tensile · pullout', group: 'Geotechnical' },
      { to: '/micropile',        name: 'Micropile',        sub: 'FHWA · structural · bond', group: 'Geotechnical' },
      { to: '/rock-anchor',      name: 'Rock Anchor',      sub: 'PTI · tendon · bond',      group: 'Geotechnical' },
      { to: '/shotcrete-facing', name: 'Shotcrete Facing', sub: 'FHWA · flexure · punching', group: 'Geotechnical' },
      { to: '/seismic-wizard',   name: 'Seismic Wizard',   sub: 'NSCP 208 Ca/Cv/I/R',       group: 'Seismic & Loads' },
      { to: '/load-combinations', name: 'Load Combinations', sub: 'NSCP 2015 §203.3 LRFD',  group: 'Seismic & Loads' },
      { to: '/wood-slab',        name: 'Wood Slab',        sub: 'Deck-on-joist · NDS §3 / NSCP §6', group: 'Timber' },
      { to: '/plumbing',         name: 'Plumbing Design',  sub: 'Water · DWV · septic · RNPCP', group: 'Plumbing & Sanitary' },
    ],
  },
  {
    label: 'Project Planning',
    tools: [
      { to: '/schedule', name: 'Project Schedule', sub: 'CPM · PERT · progress' },
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
  const short: Record<string, string> = {
    'Analysis & Modelling': 'Analysis',
    'Steel & Connections': 'Steel',
  }
  const groups = toolGroups(structural).map(({ group, tools }) => ({ label: short[group] ?? group, tools }))
  return [...groups, { label: 'Planning', tools: planning.tools }, { label: 'Estimates', tools: takeoff.tools }, { label: 'Reference', tools: reference.tools }]
})()

/** Every tool with its sidebar group label — drives the ⌘K palette and the
 *  shell breadcrumb. */
export const ALL_TOOLS: (ToolDef & { groupLabel: string })[] =
  SIDEBAR_GROUPS.flatMap((g) => g.tools.map((t) => ({ ...t, groupLabel: g.label })))
