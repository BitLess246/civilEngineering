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

/** A wall or beam drawn on the floor plan. */
export interface DraftElement {
  id: string
  type: 'wall' | 'beam' | 'column' | 'slab'
  nodes: [string, string]  // node ids
  sectionId: string        // RectSection id
  role?: 'wall' | 'beam' | 'column' | 'slab'
  // For slabs: corners in CCW order
  corners?: [string, string, string, string]
  // For openings in slabs
  openings?: Array<{
    id: string
    kind: 'rect' | 'circle'
    x: number; y: number
    w?: number; h?: number
    r?: number
  }>
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