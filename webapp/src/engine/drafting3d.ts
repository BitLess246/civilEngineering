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

/** Add a level above the current highest. */
export function addLevel(project: DraftProject, height = 3.5): DraftLevel {
  const highest = Math.max(...Array.from(project.levels.values()).map(l => l.elevation))
  const newElevation = highest + (project.levels.size === 1 ? height : 3.5)
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
        case 'wall': {
          // A wall drawn on this level's plan stands on the floor and rises a
          // full storey. ModelSpace walls hang BELOW their carrying member
          // (Wall3D draws from the member's node line down `height`), so the
          // carrying member goes at the wall's TOP: two extra joints one storey
          // up, merged with the next level's grid when the user draws it.
          const tops = el.nodes.map(nid => {
            const dn = level.nodes.get(nid)
            if (!dn) return null
            return modelNodeId({ ...dn, z: dn.z + level.height })
          })
          if (tops.some(t => !t) || tops[0] === tops[1]) break
          members.push({
            id: el.id,
            i: tops[0]!,
            j: tops[1]!,
            role: 'beam',
            section: el.sectionId,
          })
          walls.push({
            id: el.id,
            member: el.id,
            height: level.height,
            thickness: section.h,          // mm — the wall section's h IS its thickness
            shearWall: false,
          })
          break
        }
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

  // Add default supports at the base of ground-level columns
  const groundLevel = Array.from(project.levels.values()).find(l => l.elevation === 0)
  if (groundLevel) {
    for (const el of groundLevel.elements.values()) {
      if (el.type === 'column') {
        // el.nodes[0] is the column's BOTTOM joint (the canvas always writes
        // [bottom, top]); the top joint is the next level's business.
        const base = draftNodeToModelNode.get(el.nodes[0])
        if (base) supports.push({ node: base, fixity: 'fixed' })
      }
    }
  }

  return {
    version: 1,
    name: project.name,
    nodes,
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