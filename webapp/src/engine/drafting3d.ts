/**
 * 3D Drafting Module — creates floor plans & elevations that sync to 3D.
 * Exports to ModelSpace StructuralModel format.
 * Units: coordinates m; sections mm; loads kN, kN/m, kPa.
 */

import type { StructuralModel, Node, Member, Plate, RectSection, Wall, SlabOpening, ModelLoad, NodeSupport } from './model'

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
  const levelId = `level-${Date.now()}`
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

/** Convert DraftProject to StructuralModel for ModelSpace. */
export function draftToStructuralModel(project: DraftProject): StructuralModel {
  const nodes: Node[] = []
  const members: Member[] = []
  const plates: Plate[] = []
  const walls: Wall[] = []
  const sections = Array.from(project.sections.values())
  const loads: ModelLoad[] = []
  const supports: NodeSupport[] = []

  let nodeId = 0
  const draftNodeToModelNode = new Map<string, string>()

  // Process each level
  for (const level of project.levels.values()) {
    // Convert nodes
    for (const [id, dn] of level.nodes) {
      const modelId = `n${nodeId++}`
      draftNodeToModelNode.set(id, modelId)
      nodes.push({ id: modelId, x: dn.x, y: dn.y, z: dn.z })
    }

    // Convert elements
    for (const [id, el] of level.elements) {
      const section = sections.find(s => s.id === el.sectionId)
      if (!section) continue

      const [nodeI, nodeJ] = el.nodes
      const modelI = draftNodeToModelNode.get(nodeI)
      const modelJ = draftNodeToModelNode.get(nodeJ)
      if (!modelI || !modelJ) continue

      switch (el.type) {
        case 'column':
        case 'beam':
        case 'brace':
        case 'girder': {
          members.push({
            id: `m${members.length}`,
            i: modelI,
            j: modelJ,
            role: el.type === 'column' ? 'column' : el.type === 'girder' ? 'girder' : el.type === 'brace' ? 'brace' : 'beam',
            section: el.sectionId,
          })
          break
        }
        case 'wall': {
          walls.push({
            id: `w${walls.length}`,
            member: modelI,  // wall attached to first node's member
            height: section.h / 1000,
            thickness: section.b / 1000,
            shearWall: el.role === 'shearWall',
          })
          break
        }
        case 'slab': {
          if (el.corners) {
            const [c0, c1, c2, c3] = el.corners
            const corners = [c0, c1, c2, c3].map(c => draftNodeToModelNode.get(c)!).filter(Boolean)
            if (corners.length === 4) {
              plates.push({
                id: `p${plates.length}`,
                corners: corners as [string, string, string, string],
                role: 'slab',
                thickness: section.h,
              })
            }
          }
          break
        }
      }
    }
  }

  // Add default supports at ground level columns
  const groundLevel = Array.from(project.levels.values()).find(l => l.elevation === 0)
  if (groundLevel) {
    for (const [id, el] of groundLevel.elements) {
      if (el.type === 'column') {
        const modelI = draftNodeToModelNode.get(el.nodes[0])
        const modelJ = draftNodeToModelNode.get(el.nodes[1])
        if (modelI) supports.push({ node: modelI, fixity: { x: true, y: true, z: true, rx: true, ry: true, rz: true } })
        if (modelJ) supports.push({ node: modelJ, fixity: { x: true, y: true, z: true, rx: true, ry: true, rz: true } })
      }
    }
  }

  return {
    nodes,
    members,
    plates,
    walls,
    sections,
    loads,
    supports,
    // Defaults for analysis
    concreteClass: 'C28/35',
    steelGrade: 'S420',
    cover: 40,
  }
}

/** Export to JSON for saving. */
export function serializeProject(project: DraftProject): string {
  const serializable = {
    id: project.id,
    name: project.name,
    levels: Array.from(project.levels.entries()).map(([id, l]) => ({
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

/** Load from JSON. */
export function deserializeProject(json: string): DraftProject {
  const data = JSON.parse(json)
  const project: DraftProject = {
    id: data.id,
    name: data.name,
    levels: new Map(data.levels.map(l => [l.id, {
      ...l,
      nodes: new Map(l.nodes),
      elements: new Map(l.elements),
    }])) as Map<string, DraftLevel>,
    sections: new Map(data.sections) as Map<string, RectSection>,
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