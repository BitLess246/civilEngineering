/**
 * 3D Drafting Module — creates floor plans & elevations that sync to 3D.
 * Exports to ModelSpace StructuralModel format.
 * Units: coordinates m; sections mm; loads kN, kN/m, kPa.
 */

import type { StructuralModel, Node, Member, Plate, RectSection, Wall, ModelLoad, NodeSupport } from './model'

/** A draggable point on the 2D canvas (floor plan view). */
export interface DraftNode {
  id: string
  x: number    // grid X (m)
  y: number    // grid Y (m)
  z: number    // level Z (m)
}

/** A wall, beam, column, slab — or a Revit-style component hosted on them. */
export interface DraftElement {
  id: string
  type: 'wall' | 'beam' | 'column' | 'slab' | 'door' | 'window' | 'ceiling'
  nodes: [string, string]  // node ids
  sectionId: string        // RectSection id
  role?: 'wall' | 'beam' | 'column' | 'slab' | 'ceiling'
  // For slabs (and ceilings): corners in CCW order
  corners?: [string, string, string, string]
  // For openings in slabs
  openings?: Array<{
    id: string
    kind: 'rect' | 'circle'
    x: number; y: number
    w?: number; h?: number
    r?: number
  }>
  // --- Wall-hosted components (doors, windows), Revit-style: the component
  // --- remembers its HOST and a position along it, so moving/stretching the
  // --- wall carries the openings with it and re-export never loses them.
  hostId?: string   // the wall element this door/window sits in
  at?: number       // metres from the host wall's i-end to the opening CENTRE
  width?: number    // opening width (m)
  height?: number   // opening height (m)
  sill?: number     // sill height above the floor (m) — doors are 0
  swing?: 0 | 1 | 2 | 3  // door hinge + swing quadrant (see doorSwing)
  // --- Finish material (slabs, ceilings) — an id into SLAB_MATERIALS or
  // --- CEILING_MATERIALS. Absent ⇒ the catalog's first entry.
  materialId?: string
}

/** Revit-style defaults for wall-hosted components. */
export const DEFAULT_DOOR = { width: 0.9, height: 2.1, sill: 0 } as const
export const DEFAULT_WINDOW = { width: 1.2, height: 1.2, sill: 0.9 } as const

/** How far a click may fall from a wall's centreline and still host a
 *  door/window (m) — generous, because fingers are fatter than cursors. */
export const WALL_HOST_TOLERANCE = 0.35

/** A finish material for slabs or ceilings: drives the plan fill, the 3D tint
 *  and (for slabs) documents the self-weight density the panel implies.
 *  `load` is the finish's own surface dead load in kN/m² — ceilings are pure
 *  finish (never structural), slabs' structural self-weight still comes from
 *  the ModelSpace loads pipeline; this number is shown for reference. */
export interface DraftFinishMaterial {
  id: string
  name: string
  color: string       // hex — plan fill and 3D tint
  load: number        // kN/m² surface dead load of the finish itself
  note: string
}

/** Slab construction materials, Revit-style type catalog. */
export const SLAB_MATERIALS: DraftFinishMaterial[] = [
  { id: 'conc-cast', name: 'Cast-in-place concrete', color: '#7ba6d4', load: 0, note: 'RC slab — self-weight from thickness × 24 kN/m³' },
  { id: 'steel-deck', name: 'Composite steel deck', color: '#8fa3b8', load: 0.3, note: 'Corrugated deck + topping; heavier unit weight' },
  { id: 'precast', name: 'Precast hollow core', color: '#c9ccd4', load: 0, note: 'Hollow cores cut unit weight to ≈ 18 kN/m³' },
  { id: 'timber', name: 'Timber floor', color: '#c8a06a', load: 0.25, note: 'Joists + decking — light residential floors' },
]

/** Ceiling finish catalogs (architectural — never exported to the frame). */
export const CEILING_MATERIALS: DraftFinishMaterial[] = [
  { id: 'gypsum', name: 'Gypsum board', color: '#e8ecf2', load: 0.15, note: '12 mm board on furring channels' },
  { id: 'acoustic', name: 'Acoustic tile grid', color: '#dfe6ee', load: 0.1, note: 'Lay-in tile on exposed T-grid' },
  { id: 'plaster', name: 'Plaster on soffit', color: '#f0ede6', load: 0.25, note: 'Direct-applied cement plaster' },
  { id: 'exposed', name: 'Exposed structure', color: '#cfd6df', load: 0, note: 'No ceiling — soffit painted' },
]

/** Look up a finish material by catalog + id (first entry when absent). */
export function finishMaterial(catalog: DraftFinishMaterial[], id?: string): DraftFinishMaterial {
  return catalog.find(m => m.id === id) ?? catalog[0]
}

/** Resolve a stored materialId against BOTH catalogs (the element itself knows
 *  whether it is a slab or a ceiling, but ids never collide, so one lookup
 *  serves rendering everywhere). */
export function resolveFinishMaterial(id?: string): DraftFinishMaterial {
  return SLAB_MATERIALS.find(m => m.id === id) ?? CEILING_MATERIALS.find(m => m.id === id) ?? SLAB_MATERIALS[0]
}

/** Door swing quadrant: hinge end × swing side, exactly the four combos a
 *  real door leaf has. Rendered as the standard plan symbol (leaf + arc). */
export function doorSwing(swing: 0 | 1 | 2 | 3 | undefined): { hinge: 'left' | 'right'; inward: boolean } {
  const s = swing ?? 0
  return { hinge: s % 2 === 0 ? 'left' : 'right', inward: s < 2 }
}

/** A level/storey in the building. */
export interface DraftLevel {
  id: string
  name: string
  elevation: number       // m
  height: number          // floor-to-floor height (m)
  nodes: Map<string, DraftNode>
  elements: Map<string, DraftElement>
  // Visible grids for this level
  grids?: { x: number[]; y: number[] }
}

/** The complete drafting project. */
export interface DraftProject {
  id: string
  name: string
  levels: Map<string, DraftLevel>
  sections: Map<string, RectSection>
  activeLevelId: string
  // Global grids
  gridX: number[]
  gridY: number[]
}

/** Default section library for drafting. */
export const DEFAULT_SECTIONS: RectSection[] = [
  // Concrete beams
  { id: 'beam-300x500', name: '300×500', b: 300, h: 500, fc: 28, fy: 420, barDia: 16, tieDia: 10, cover: 40, material: 'concrete' },
  { id: 'beam-300x600', name: '300×600', b: 300, h: 600, fc: 28, fy: 420, barDia: 16, tieDia: 10, cover: 40, material: 'concrete' },
  { id: 'beam-350x600', name: '350×600', b: 350, h: 600, fc: 28, fy: 420, barDia: 16, tieDia: 10, cover: 40, material: 'concrete' },
  { id: 'beam-400x700', name: '400×700', b: 400, h: 700, fc: 28, fy: 420, barDia: 16, tieDia: 10, cover: 40, material: 'concrete' },
  // Concrete columns
  { id: 'col-400x400', name: '400×400', b: 400, h: 400, fc: 28, fy: 420, barDia: 16, tieDia: 10, cover: 40, barCount: 4, material: 'concrete' },
  { id: 'col-500x500', name: '500×500', b: 500, h: 500, fc: 28, fy: 420, barDia: 16, tieDia: 10, cover: 40, barCount: 8, material: 'concrete' },
  { id: 'col-600x600', name: '600×600', b: 600, h: 600, fc: 28, fy: 420, barDia: 16, tieDia: 10, cover: 40, barCount: 8, material: 'concrete' },
  // Concrete slabs
  { id: 'slab-150', name: 'Slab 150', b: 1000, h: 150, fc: 28, fy: 420, barDia: 10, tieDia: 10, cover: 25, material: 'concrete' },
  { id: 'slab-200', name: 'Slab 200', b: 1000, h: 200, fc: 28, fy: 420, barDia: 10, tieDia: 10, cover: 25, material: 'concrete' },
  { id: 'slab-250', name: 'Slab 250', b: 1000, h: 250, fc: 28, fy: 420, barDia: 10, tieDia: 10, cover: 25, material: 'concrete' },
  // Walls
  { id: 'wall-200', name: 'Wall 200', b: 1000, h: 200, fc: 28, fy: 420, barDia: 10, tieDia: 10, cover: 25, material: 'concrete' },
  { id: 'wall-250', name: 'Wall 250', b: 1000, h: 250, fc: 28, fy: 420, barDia: 10, tieDia: 10, cover: 25, material: 'concrete' },
]

/** The structural duty a library section is sized for. */
export type DraftSectionRole = 'beam' | 'column' | 'slab' | 'wall'

/** The section each drawing tool starts with. One active section for every
 *  tool stamped a 400×400 COLUMN on slabs and walls (a 400 mm plate, a
 *  400 mm wall) unless the user thought to change it first. */
export const DEFAULT_SECTION_FOR: Record<DraftSectionRole, string> = {
  beam: 'beam-300x500', column: 'col-400x400', slab: 'slab-150', wall: 'wall-200',
}

/** Role of a library section: by its id prefix (the library's own naming),
 *  else by shape — a 1000 mm strip is a slab or wall (per metre), a square is
 *  a column, anything else a beam. */
export function sectionRole(sec: RectSection): DraftSectionRole {
  if (sec.id.startsWith('beam-')) return 'beam'
  if (sec.id.startsWith('col-')) return 'column'
  if (sec.id.startsWith('slab-')) return 'slab'
  if (sec.id.startsWith('wall-')) return 'wall'
  if (sec.b === 1000) return 'slab'
  return sec.b === sec.h ? 'column' : 'beam'
}

/** The element types that take a section of their own role. */
const SECTIONED: ReadonlySet<DraftElement['type']> = new Set(['beam', 'column', 'slab', 'wall'])

/** Repair elements stamped with a section of the wrong role — what the old
 *  single active section did to every slab and wall drawn without first
 *  visiting the Sections panel. Each gets its role's default. Returns the
 *  SAME project when nothing needed repair. */
export function normalizeDraftSections(project: DraftProject): DraftProject {
  let changed = false
  const levels = new Map(project.levels)
  for (const [lid, lvl] of project.levels) {
    let elements: Map<string, DraftElement> | null = null
    for (const [eid, el] of lvl.elements) {
      if (!SECTIONED.has(el.type)) continue
      const role = el.type as DraftSectionRole
      const sec = project.sections.get(el.sectionId)
      if (sec && sectionRole(sec) === role) continue
      const fix = DEFAULT_SECTION_FOR[role]
      if (!project.sections.has(fix) || fix === el.sectionId) continue
      elements ??= new Map(lvl.elements)
      elements.set(eid, { ...el, sectionId: fix })
    }
    if (elements) {
      levels.set(lid, { ...lvl, elements })
      changed = true
    }
  }
  return changed ? { ...project, levels } : project
}

/** Create a new empty drafting project. */
export function createDraftProject(name = 'Untitled'): DraftProject {
  const now = Date.now()
  const levelId = `level-${now}`
  const gridX = [0, 3, 6, 9]  // default 3m grid
  const gridY = [0, 3, 6, 9]

  return {
    id: `project-${now}`,
    name,
    levels: new Map([[levelId, {
      id: levelId,
      name: 'Level 1',
      elevation: 0,
      height: 3.5,
      nodes: new Map(),
      elements: new Map(),
      grids: { x: gridX, y: gridY },
    }]]),
    sections: new Map(DEFAULT_SECTIONS.map(s => [s.id, s])),
    activeLevelId: levelId,
    gridX,
    gridY,
  }
}

/** Add a level above the current highest. `height` is the NEW level's own
 *  floor-to-floor height; it stands on the top of the storey below — that
 *  storey's elevation plus ITS height, which is exactly where the columns and
 *  walls drawn on it put their top joints, so the two floors share joints. */
export function addLevel(project: DraftProject, height = 3.5): DraftLevel {
  const top = Array.from(project.levels.values()).reduce((a, b) => (b.elevation > a.elevation ? b : a))
  const newElevation = top.elevation + top.height
  // uid(), not Date.now() alone: two calls inside the same millisecond must
  // not collide — a collision would silently overwrite an existing level.
  const levelId = uid('level')
  const level: DraftLevel = {
    id: levelId,
    name: `Level ${project.levels.size + 1}`,
    elevation: newElevation,
    height,
    nodes: new Map(),
    elements: new Map(),
    grids: { x: project.gridX.slice(), y: project.gridY.slice() },
  }
  project.levels.set(levelId, level)
  project.activeLevelId = levelId
  return level
}

/** Snap a point to the nearest grid. */
export function snapToGrid(x: number, y: number, gridX: number[], gridY: number[], tolerance = 0.15): { x: number; y: number } {
  const snapX = gridX.reduce((best, g) => Math.abs(g - x) < Math.abs(best - x) ? g : best, gridX[0])
  const snapY = gridY.reduce((best, g) => Math.abs(g - y) < Math.abs(best - y) ? g : best, gridY[0])
  return {
    x: Math.abs(snapX - x) <= tolerance ? snapX : x,
    y: Math.abs(snapY - y) <= tolerance ? snapY : y,
  }
}

// --- Node auto-connect (Revit-style joint snapping) --------------------------

/** Nearest joint to a plan point within `tolerance` (m) — the auto-connect
 *  target for a drawn wall/beam end, a panel corner, or a dragged joint.
 *  `options.z` restricts candidates to one storey (a wall's end on THIS level
 *  must never weld to a column-top joint a storey up); `options.exclude`
 *  keeps a moving selection from snapping onto itself. Null when nothing is
 *  close enough — the caller falls back to grid snap. Pure. */
export function nearestDraftNode(
  nodes: Map<string, DraftNode>,
  x: number,
  y: number,
  tolerance: number,
  options: { z?: number; zTolerance?: number; exclude?: ReadonlySet<string> } = {},
): DraftNode | null {
  let best: DraftNode | null = null
  let bestD = Infinity
  for (const n of nodes.values()) {
    if (options.exclude?.has(n.id)) continue
    if (options.z !== undefined && Math.abs(n.z - options.z) > (options.zTolerance ?? 1e-6)) continue
    const d = Math.hypot(n.x - x, n.y - y)
    if (d < bestD) {
      bestD = d
      best = n
    }
  }
  return best && bestD <= tolerance ? best : null
}

/** Whether joint `fromId` may be merged into joint `toId`: never when they
 *  are the same joint, and never when any element references BOTH — a member
 *  would collapse to zero length, a slab would lose a corner. Pure. */
export function canMergeDraftNodes(level: DraftLevel, fromId: string, toId: string): boolean {
  if (fromId === toId) return false
  for (const el of level.elements.values()) {
    const refs = el.corners ?? el.nodes
    if (refs.includes(fromId) && refs.includes(toId)) return false
  }
  return true
}

/** Merge joints: every element reference to a `from` id (member ends, panel
 *  corners, hosted components' host-joint copies) is rewritten to its `to`
 *  id, the from-nodes disappear, and elements that would degenerate — both
 *  ends on one joint, duplicate corners — are dropped (Revit warns on the
 *  same operation). Orphaned joints are swept, matching
 *  `deleteDraftElements`. Returns a NEW level; the input is not mutated, so
 *  React state can flow through `onProjectChange` untouched. */
export function mergeDraftNodes(level: DraftLevel, mapping: ReadonlyMap<string, string>): DraftLevel {
  const nodes = new Map(level.nodes)
  for (const from of mapping.keys()) nodes.delete(from)
  const remap = (ref: string) => mapping.get(ref) ?? ref
  const elements = new Map<string, DraftElement>()
  for (const [id, el] of level.elements) {
    const next: DraftElement = {
      ...el,
      nodes: [remap(el.nodes[0]), remap(el.nodes[1])] as [string, string],
      corners: el.corners ? (el.corners.map(remap) as [string, string, string, string]) : undefined,
    }
    if (next.nodes[0] === next.nodes[1]) continue               // zero-length member
    if (next.corners && new Set(next.corners).size !== 4) continue  // collapsed panel
    // a weld can stack one member exactly on another (a column dropped onto
    // a column): the copy would double the frame's stiffness there, so the
    // first one drawn survives — Revit's "identical instances" clean-up
    if (!next.corners && !next.hostId && (next.type === 'beam' || next.type === 'column' || next.type === 'wall')) {
      const [p, q] = next.nodes
      const dup = [...elements.values()].some(o => o.type === next.type && !o.corners
        && ((o.nodes[0] === p && o.nodes[1] === q) || (o.nodes[0] === q && o.nodes[1] === p)))
      if (dup) continue
    }
    elements.set(id, next)
  }
  // Sweep joints nothing references any more (an element may have been
  // dropped above, orphaning its surviving end).
  const referenced = new Set<string>()
  for (const el of elements.values()) {
    if (el.corners) for (const c of el.corners) referenced.add(c)
    else {
      referenced.add(el.nodes[0])
      referenced.add(el.nodes[1])
    }
  }
  for (const nid of [...nodes.keys()]) {
    if (!referenced.has(nid)) nodes.delete(nid)
  }
  return { ...level, nodes, elements }
}

/** Convert DraftProject to StructuralModel for ModelSpace.
 *
 *  Coordinate convention of the exported model matches ModelSpace's: x = plan
 *  X, y = HEIGHT (the level elevation a node stands at), z = plan Y — the
 *  draft's (y, z) swap on the way out, which is what puts the drafting plan
 *  flat on the X–Z ground plane with storeys stacking along +y the way
 *  `GridBubbles3D` and the rest of the scene read it.
 *
 *  Nodes that land on the same spot (within 1 mm) merge into one model node —
 *  a column drawn at a grid intersection rises from this level's joint to the
 *  next level's, and those two joints must be THE SAME node or the floors
 *  never connect. */
export function draftToStructuralModel(project: DraftProject): StructuralModel {
  const nodes: Node[] = []
  const members: Member[] = []
  const plates: Plate[] = []
  const walls: Wall[] = []
  const sections = Array.from(project.sections.values())
  const loads: ModelLoad[] = []
  const supports: NodeSupport[] = []
  const storeys = Array.from(project.levels.values()).map(l => ({ id: l.id, name: l.name, elevation: l.elevation }))

  const draftNodeToModelNode = new Map<string, string>()
  const modelNodeByKey = new Map<string, string>()
  let nodeCount = 0
  const modelNodeId = (dn: DraftNode): string => {
    // 1 mm plan/elevation tolerance: coincident joints share a model node.
    const key = `${dn.x.toFixed(3)}|${dn.y.toFixed(3)}|${dn.z.toFixed(3)}`
    const seen = modelNodeByKey.get(key)
    if (seen) {
      draftNodeToModelNode.set(dn.id, seen)
      return seen
    }
    const id = `n${nodeCount++}`
    modelNodeByKey.set(key, id)
    draftNodeToModelNode.set(dn.id, id)
    // draft (x, y-plan, z-elevation) → model (x, y-up, z-plan)
    nodes.push({ id, x: dn.x, y: dn.z, z: dn.y })
    return id
  }

  // Register every draft node first, so element order never decides which
  // joints exist (a level's elements may reference any earlier level's nodes).
  for (const level of project.levels.values()) {
    for (const dn of level.nodes.values()) modelNodeId(dn)
  }

  const pendingWalls: Array<{ level: DraftLevel; el: DraftElement; section: RectSection }> = []

  // Process each level
  for (const level of project.levels.values()) {
    // Convert elements
    for (const el of level.elements.values()) {
      const section = sections.find(s => s.id === el.sectionId)
      if (!section) continue

      const [nodeI, nodeJ] = el.nodes
      const modelI = draftNodeToModelNode.get(nodeI)
      const modelJ = draftNodeToModelNode.get(nodeJ)
      if (!modelI || !modelJ) continue

      switch (el.type) {
        case 'door':
        case 'window':
        case 'ceiling':
          // Architectural components — hosted openings and ceiling finishes
          // are NOT structural members: they ride along as metadata on the
          // wall (see `openings` below) and never enter the frame.
          break
        case 'column':
        case 'beam': {
          if (modelI === modelJ) continue  // zero-length member — the solver cannot use it
          members.push({
            id: el.id,                    // draft id kept: selection sync + traceability
            i: modelI,
            j: modelJ,
            role: el.type,
            section: el.sectionId,
          })
          break
        }
        case 'wall':
          // after every frame member exists, so a wall can ride on a beam
          // already drawn along its top instead of doubling it
          pendingWalls.push({ level, el, section })
          break
        case 'slab': {
          if (el.corners) {
            const corners = el.corners.map(c => draftNodeToModelNode.get(c)!).filter(Boolean)
            if (corners.length === 4) {
              plates.push({
                id: el.id,
                corners: corners as [string, string, string, string],
                role: 'slab',
                thickness: section.h,      // mm
              })
            }
          }
          break
        }
      }
    }
  }

  // Walls. A wall drawn on a level's plan stands on the floor and rises a
  // full storey. ModelSpace walls hang BELOW their carrying member (Wall3D
  // draws from the member's node line down `height`), so the carrier sits at
  // the wall's TOP: two joints one storey up, which merge with the next
  // level's joints by position. When a beam already spans those two joints
  // the wall rides on it — a second member on the same line would double the
  // frame's stiffness there. Otherwise a carrier is added with a BEAM section:
  // the wall's own section is a 1000 mm strip of wall, not a beam.
  const carrierSection = sections.find(s => s.id === DEFAULT_SECTION_FOR.beam)
    ?? sections.find(s => sectionRole(s) === 'beam')
  for (const { level, el, section } of pendingWalls) {
    const tops = el.nodes.map(nid => {
      const dn = level.nodes.get(nid)
      if (!dn) return null
      return modelNodeId({ ...dn, z: dn.z + level.height })
    })
    if (tops.some(t => !t) || tops[0] === tops[1]) continue
    const [ti, tj] = tops as [string, string]
    const existing = members.find(m => m.role === 'beam' && ((m.i === ti && m.j === tj) || (m.i === tj && m.j === ti)))
    if (!existing) {
      members.push({ id: el.id, i: ti, j: tj, role: 'beam', section: (carrierSection ?? section).id })
    }
    walls.push({
      id: el.id,
      member: existing?.id ?? el.id,
      height: level.height,
      thickness: section.h,          // mm — the wall section's h IS its thickness
      shearWall: false,
    })
  }

  // Attach hosted doors/windows to their wall as ordered metadata — the
  // drawing's openings travel with the export (ModelSpace renders solid walls
  // for now; the geometry is here for the next step, and no old consumer
  // breaks: the field is optional).
  for (const level of project.levels.values()) {
    for (const el of level.elements.values()) {
      if (el.type !== 'door' && el.type !== 'window') continue
      if (!el.hostId || el.at === undefined || el.width === undefined) continue
      const wall = walls.find(w => w.id === el.hostId)
      if (!wall) continue
      const length = wallLengthOf(level, el.hostId)
      if (length === null) continue
      const list = (wall.openings ??= [])
      list.push({
        kind: el.type,
        t: clampOpeningAt(el.at, el.width, length),
        w: el.width,
        h: el.height ?? (el.type === 'door' ? DEFAULT_DOOR.height : DEFAULT_WINDOW.height),
        sill: el.sill ?? (el.type === 'door' ? DEFAULT_DOOR.sill : DEFAULT_WINDOW.sill),
      })
    }
  }
  for (const w of walls) w.openings?.sort((a, b) => a.t - b.t)

  // Fixed supports at the base of the LOWEST level's columns — the level the
  // building stands on, whatever its elevation (a basement at −3.0 included).
  const levelsList = Array.from(project.levels.values())
  const groundLevel = levelsList.length
    ? levelsList.reduce((a, b) => (b.elevation < a.elevation ? b : a))
    : undefined
  if (groundLevel) {
    for (const el of groundLevel.elements.values()) {
      if (el.type === 'column') {
        // el.nodes[0] is the column's BOTTOM joint (the canvas always writes
        // [bottom, top]); the top joint is the next level's business.
        const base = draftNodeToModelNode.get(el.nodes[0])
        if (base && !supports.some(s => s.node === base)) supports.push({ node: base, fixity: 'fixed' })
      }
    }
  }

  // Only joints the frame uses. Every draft joint was registered up front,
  // but a wall's base, a ceiling's corners and the corners of an abandoned
  // panel are joints no member or plate touches — exported, each is a free
  // node with no stiffness at all.
  const used = new Set<string>()
  for (const m of members) { used.add(m.i); used.add(m.j) }
  for (const pl of plates) for (const c of pl.corners) used.add(c)
  for (const sp of supports) used.add(sp.node)
  const usedNodes = nodes.filter(nd => used.has(nd.id))

  return {
    version: 1,
    name: project.name,
    nodes: usedNodes,
    members,
    plates,
    walls,
    sections,
    loads,
    supports,
    storeys,
  }
}

/** Export to JSON for saving. */
export function serializeProject(project: DraftProject): string {
  const serializable = {
    id: project.id,
    name: project.name,
    levels: Array.from(project.levels.entries()).map(([, l]) => ({
      ...l,
      nodes: Array.from(l.nodes.entries()),
      elements: Array.from(l.elements.entries()),
    })),
    sections: Array.from(project.sections.entries()),
    activeLevelId: project.activeLevelId,
    gridX: project.gridX,
    gridY: project.gridY,
  }
  return JSON.stringify(serializable, null, 2)
}

/** The JSON shape serializeProject writes (Maps flattened to entry arrays;
 *  each level keeps its id INSIDE the object — the entries' keys were the
 *  level ids, and the spread carries them through). */
interface SerializedProject {
  id: string
  name: string
  levels: Array<DraftLevel & { nodes: [string, DraftNode][]; elements: [string, DraftElement][] }>
  sections: [string, RectSection][]
  activeLevelId: string
  gridX: number[]
  gridY: number[]
}

/** Load from JSON. */
export function deserializeProject(json: string): DraftProject {
  const data = JSON.parse(json) as SerializedProject
  const project: DraftProject = {
    id: data.id,
    name: data.name,
    levels: new Map(data.levels.map(l => [l.id, {
      ...l,
      nodes: new Map(l.nodes),
      elements: new Map(l.elements),
    }])),
    sections: new Map(data.sections),
    activeLevelId: data.activeLevelId,
    gridX: data.gridX,
    gridY: data.gridY,
  }
  return project
}

/** Generate a unique ID. */
export function uid(prefix = 'd'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// --- Wall-hosted components (doors, windows) --------------------------------

/** Project a plan point onto a wall's centreline.
 *  Returns the foot point, its distance `t` (m) from the wall's i-end (NOT
 *  clamped — callers decide), the wall's length and unit direction, or null
 *  when the wall or its nodes are missing. */
export function projectOnWall(
  wall: DraftElement,
  nodes: Map<string, DraftNode>,
  p: { x: number; y: number },
): { t: number; point: { x: number; y: number }; length: number; ux: number; uy: number } | null {
  const a = nodes.get(wall.nodes[0])
  const b = nodes.get(wall.nodes[1])
  if (!a || !b) return null
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy)
  if (length < 1e-9) return null
  const ux = dx / length
  const uy = dy / length
  const t = (p.x - a.x) * ux + (p.y - a.y) * uy
  return { t, point: { x: a.x + t * ux, y: a.y + t * uy }, length, ux, uy }
}

/** Clamp an opening's centre distance so the opening stays inside its host:
 *  `t` ∈ [w/2, L − w/2]. An opening wider than the wall centres itself. */
export function clampOpeningAt(t: number, openingWidth: number, wallLength: number): number {
  const half = openingWidth / 2
  if (half * 2 >= wallLength) return wallLength / 2
  return Math.max(half, Math.min(wallLength - half, t))
}

/** World-space span of a hosted opening along its wall: the two jamb points,
 *  the wall's plan angle (rad) and the centre point. `nodes` overrides the
 *  level's joints — the canvas passes its drag-preview view so openings follow
 *  a wall being dragged. Null when the host, the opening's position or the
 *  wall's nodes are unusable. */
export function openingSpan(
  opening: DraftElement,
  level: DraftLevel,
  nodes?: Map<string, DraftNode>,
): { p1: { x: number; y: number }; p2: { x: number; y: number }; angle: number; centre: { x: number; y: number } } | null {
  const nm = nodes ?? level.nodes
  if (!opening.hostId) return null
  const host = level.elements.get(opening.hostId)
  if (!host || host.type !== 'wall') return null
  const proj = projectOnWall(host, nm, { x: 0, y: 0 })
  if (!proj || opening.at === undefined || opening.width === undefined) return null
  const a = nm.get(host.nodes[0])
  if (!a) return null
  const t = clampOpeningAt(opening.at, opening.width, proj.length)
  const cx = a.x + t * proj.ux
  const cy = a.y + t * proj.uy
  const half = opening.width / 2
  return {
    p1: { x: cx - half * proj.ux, y: cy - half * proj.uy },
    p2: { x: cx + half * proj.ux, y: cy + half * proj.uy },
    angle: Math.atan2(proj.uy, proj.ux),
    centre: { x: cx, y: cy },
  }
}

/** Create a door or window hosted on a wall, placed at the projection of a
 *  plan click. Returns null when the click misses every wall (beyond
 *  WALL_HOST_TOLERANCE) or the host is not a wall — the canvas treats null as
 *  "nothing to place". `at` is clamped so the opening fits inside the wall. */
export function createWallOpening(
  kind: 'door' | 'window',
  hostId: string | null,
  t: number,
  level: DraftLevel,
  overrides: Partial<Pick<DraftElement, 'width' | 'height' | 'sill' | 'swing'>> = {},
): DraftElement | null {
  const host = hostId ? level.elements.get(hostId) : undefined
  if (!host || host.type !== 'wall') return null
  const proj = projectOnWall(host, level.nodes, { x: 0, y: 0 })
  if (!proj) return null
  const dims = kind === 'door' ? DEFAULT_DOOR : DEFAULT_WINDOW
  const width = overrides.width ?? dims.width
  const height = overrides.height ?? dims.height
  const sill = overrides.sill ?? dims.sill
  return {
    id: uid(kind === 'door' ? 'door' : 'win'),
    type: kind,
    nodes: [host.nodes[0], host.nodes[1]],   // reference the host's joints for serialization uniformity
    sectionId: host.sectionId,
    hostId: hostId ?? undefined,
    at: clampOpeningAt(t, width, proj.length),
    width,
    height,
    sill,
    swing: overrides.swing ?? 0,
  }
}

/** Delete elements by id — walls take their hosted doors/windows with them
 *  (Revit warns and deletes dependents) — then drop nodes nothing references
 *  any more. Returns a NEW level object with fresh Maps; the input is not
 *  mutated, so React state can flow through `onProjectChange` untouched. */
export function deleteDraftElements(level: DraftLevel, ids: string[]): DraftLevel {
  const doomed = new Set(ids)
  // Cascade: deleting a wall deletes the components hosted in it.
  for (const el of level.elements.values()) {
    if (el.hostId && doomed.has(el.hostId)) doomed.add(el.id)
  }
  const elements = new Map(level.elements)
  for (const id of doomed) elements.delete(id)
  const referenced = new Set<string>()
  for (const el of elements.values()) {
    if (el.corners) for (const c of el.corners) referenced.add(c)
    else {
      referenced.add(el.nodes[0])
      referenced.add(el.nodes[1])
    }
  }
  const nodes = new Map(level.nodes)
  for (const nid of [...nodes.keys()]) {
    if (!referenced.has(nid)) nodes.delete(nid)
  }
  return { ...level, nodes, elements }
}

/** Plan length of a wall element on a level (m), or null when unresolvable. */
function wallLengthOf(level: DraftLevel, wallId: string): number | null {
  const host = level.elements.get(wallId)
  if (!host || host.type !== 'wall') return null
  const a = level.nodes.get(host.nodes[0])
  const b = level.nodes.get(host.nodes[1])
  if (!a || !b) return null
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** Grid intersection point for snapping. */
export interface GridPoint {
  x: number
  y: number
}

/** Get all grid intersection points for a level. */
export function getGridPoints(level: DraftLevel): GridPoint[] {
  const points: GridPoint[] = []
  for (const x of level.grids?.x ?? []) {
    for (const y of level.grids?.y ?? []) {
      points.push({ x, y })
    }
  }
  return points
}
// --- Moving joints without tearing columns ----------------------------------

/** The joints a drag must move together: the given ones plus, for every
 *  column touching one of them, its other end. A column is a vertical pair
 *  (base on the floor, top a storey up) at ONE plan point — dragging only the
 *  base used to leave the top behind and lean the column across the storey. */
export function withColumnPartners(level: DraftLevel, ids: Iterable<string>): string[] {
  const out = new Set(ids)
  for (const el of level.elements.values()) {
    if (el.type !== 'column') continue
    const [a, b] = el.nodes
    if (out.has(a)) out.add(b)
    if (out.has(b)) out.add(a)
  }
  return [...out]
}

/** Weld every pair of joints that sit on the same spot (plan and elevation
 *  within `tol`, m) where `canMergeDraftNodes` allows it — the clean-up after
 *  a drag: a column dropped onto another column's base also brings its top
 *  onto that column's top, and the two tops must become one joint. Returns
 *  the SAME level when nothing coincides. */
export function mergeCoincidentNodes(level: DraftLevel, tol = 1e-3): DraftLevel {
  let cur = level
  for (;;) {
    const list = [...cur.nodes.values()]
    let pair: [string, string] | null = null
    for (let i = 0; i < list.length && !pair; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j]
        if (Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.z - b.z) <= tol
          && canMergeDraftNodes(cur, b.id, a.id)) {
          pair = [b.id, a.id]
          break
        }
      }
    }
    if (!pair) return cur
    cur = mergeDraftNodes(cur, new Map([pair]))
  }
}

/** Plan corners of a slab or ceiling, in their drawn order; null unless all
 *  four joints resolve. Plan coordinates: x, and y — NOT z, which is the
 *  joint's elevation. */
export function panelCorners(level: DraftLevel, el: DraftElement): Array<{ x: number; y: number }> | null {
  if (!el.corners) return null
  const pts = el.corners.map(c => level.nodes.get(c))
  if (pts.some(p => !p)) return null
  return (pts as DraftNode[]).map(p => ({ x: p.x, y: p.y }))
}

// --- Level management --------------------------------------------------------

/** Rename a level. Returns a new project; a blank name keeps the old one. */
export function renameLevel(project: DraftProject, levelId: string, name: string): DraftProject {
  const lvl = project.levels.get(levelId)
  const clean = name.trim()
  if (!lvl || !clean || clean === lvl.name) return project
  const levels = new Map(project.levels)
  levels.set(levelId, { ...lvl, name: clean })
  return { ...project, levels }
}

/** Change a storey's floor-to-floor height and RESTACK what stands on it:
 *  this level's own top joints (column tops, at elevation + height) and every
 *  level above — elevation and every joint — move by the change, so columns
 *  keep meeting the next floor exactly. Heights below 2 m are refused (the
 *  project comes back unchanged). Pure. */
export function setLevelHeight(project: DraftProject, levelId: string, height: number): DraftProject {
  const lvl = project.levels.get(levelId)
  if (!lvl || !Number.isFinite(height) || height < 2) return project
  const delta = height - lvl.height
  if (Math.abs(delta) < 1e-9) return project
  const topZ = lvl.elevation + lvl.height
  const shift = (nodes: Map<string, DraftNode>, pick: (n: DraftNode) => boolean) => {
    const out = new Map(nodes)
    for (const [id, n] of nodes) if (pick(n)) out.set(id, { ...n, z: n.z + delta })
    return out
  }
  const levels = new Map<string, DraftLevel>()
  for (const [id, l] of project.levels) {
    if (id === levelId) {
      levels.set(id, { ...l, height, nodes: shift(l.nodes, n => Math.abs(n.z - topZ) < 1e-6) })
    } else if (l.elevation > lvl.elevation + 1e-9) {
      levels.set(id, { ...l, elevation: l.elevation + delta, nodes: shift(l.nodes, () => true) })
    } else {
      levels.set(id, l)
    }
  }
  return { ...project, levels }
}

/** Only the TOP level can be deleted (and never the last one left): removing
 *  a storey from the middle would have to drop everything above it. */
export function canDeleteLevel(project: DraftProject, levelId: string): boolean {
  if (project.levels.size < 2 || !project.levels.has(levelId)) return false
  const top = Array.from(project.levels.values()).reduce((a, b) => (b.elevation > a.elevation ? b : a))
  return top.id === levelId
}

/** Delete the top level with everything drawn on it; the level below becomes
 *  active if the deleted one was. Returns the project unchanged when
 *  `canDeleteLevel` says no. */
export function deleteLevel(project: DraftProject, levelId: string): DraftProject {
  if (!canDeleteLevel(project, levelId)) return project
  const levels = new Map(project.levels)
  levels.delete(levelId)
  let activeLevelId = project.activeLevelId
  if (activeLevelId === levelId) {
    activeLevelId = Array.from(levels.values()).reduce((a, b) => (b.elevation > a.elevation ? b : a)).id
  }
  return { ...project, levels, activeLevelId }
}
