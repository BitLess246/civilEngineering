import { describe, it, expect } from 'vitest'
import {
  createDraftProject,
  addLevel,
  draftToStructuralModel,
  serializeProject,
  deserializeProject,
  projectOnWall,
  clampOpeningAt,
  openingSpan,
  createWallOpening,
  deleteDraftElements,
  doorSwing,
  finishMaterial,
  resolveFinishMaterial,
  SLAB_MATERIALS,
  CEILING_MATERIALS,
  DEFAULT_DOOR,
  DEFAULT_WINDOW,
  WALL_HOST_TOLERANCE,
  type DraftProject,
  type DraftLevel,
  type DraftNode,
  type DraftElement,
} from './drafting3d'

const n = (id: string, x: number, y: number, z: number): DraftNode => ({ id, x, y, z })

/** A level with nodes + elements, ready to drop into a project. */
function level(id: string, name: string, elevation: number, height: number,
  nodes: DraftNode[], elements: DraftElement[]): DraftLevel {
  return {
    id, name, elevation, height,
    nodes: new Map(nodes.map(nd => [nd.id, nd])),
    elements: new Map(elements.map(e => [e.id, e])),
    grids: { x: [0, 3, 6, 9], y: [0, 3, 6, 9] },
  }
}

/** One wall from (0,0) to (6,0) — 6 m, running +x. */
function wallProject(): { project: DraftProject; lvl: DraftLevel } {
  const base = createDraftProject('Openings')
  const lvl = level('L1', 'Level 1', 0, 3.5, [
    n('a', 0, 0, 0), n('b', 6, 0, 0), n('c', 6, 4, 0),
  ], [
    { id: 'w1', type: 'wall', nodes: ['a', 'b'], sectionId: 'wall-200', role: 'wall' },
    { id: 'w2', type: 'wall', nodes: ['b', 'c'], sectionId: 'wall-200', role: 'wall' },
  ])
  return {
    project: { ...base, levels: new Map([['L1', lvl]]), activeLevelId: 'L1' },
    lvl,
  }
}

describe('projectOnWall', () => {
  it('projects a point onto the centreline and reports the distance from the i-end', () => {
    const { lvl } = wallProject()
    const w = lvl.elements.get('w1')!
    const proj = projectOnWall(w, lvl.nodes, { x: 2.5, y: 1.2 })!
    expect(proj.t).toBeCloseTo(2.5, 9)
    expect(proj.point).toEqual({ x: 2.5, y: 0 })
    expect(proj.length).toBeCloseTo(6, 9)
    expect(proj.ux).toBeCloseTo(1, 12)
    expect(proj.uy).toBeCloseTo(0, 12)
  })

  it('reports unclamped t (negative / past the far end) — callers clamp', () => {
    const { lvl } = wallProject()
    const w = lvl.elements.get('w1')!
    expect(projectOnWall(w, lvl.nodes, { x: -3, y: 0 })!.t).toBeCloseTo(-3, 9)
    expect(projectOnWall(w, lvl.nodes, { x: 9, y: 0 })!.t).toBeCloseTo(9, 9)
  })

  it('returns null for a missing wall or missing endpoints', () => {
    const { lvl } = wallProject()
    expect(projectOnWall(lvl.elements.get('w1')!, new Map(), { x: 0, y: 0 })).toBeNull()
    const broken: DraftElement = { id: 'wx', type: 'wall', nodes: ['nope', 'nada'], sectionId: 'wall-200' }
    expect(projectOnWall(broken, lvl.nodes, { x: 0, y: 0 })).toBeNull()
  })

  it('handles an oblique wall', () => {
    const { lvl } = wallProject()
    const diag: DraftElement = { id: 'wd', type: 'wall', nodes: ['a', 'c'], sectionId: 'wall-200' }
    const proj = projectOnWall(diag, lvl.nodes, { x: 3, y: 2 })!
    expect(proj.length).toBeCloseTo(Math.hypot(6, 4), 9)
    expect(proj.t).toBeCloseTo(proj.length / 2, 9)  // the midpoint of a→c
  })
})

describe('clampOpeningAt', () => {
  it('keeps the opening inside its host on both ends', () => {
    expect(clampOpeningAt(-1, 0.9, 6)).toBeCloseTo(0.45, 9)
    expect(clampOpeningAt(9, 0.9, 6)).toBeCloseTo(5.55, 9)
    expect(clampOpeningAt(3, 0.9, 6)).toBeCloseTo(3, 9)
  })

  it('centres an opening wider than its host', () => {
    expect(clampOpeningAt(1, 8, 6)).toBeCloseTo(3, 9)
  })
})

describe('createWallOpening', () => {
  it('creates a door hosted on the wall with Revit defaults and a clamped position', () => {
    const { lvl } = wallProject()
    const d = createWallOpening('door', 'w1', 1.0, lvl)!
    expect(d.type).toBe('door')
    expect(d.hostId).toBe('w1')
    expect(d.width).toBe(DEFAULT_DOOR.width)
    expect(d.height).toBe(DEFAULT_DOOR.height)
    expect(d.sill).toBe(0)
    expect(d.at).toBeCloseTo(1.0, 9)
    // nodes reference the host's joints — serialization uniformity
    expect(d.nodes).toEqual(['a', 'b'])
  })

  it('creates a window at sill height', () => {
    const { lvl } = wallProject()
    const w = createWallOpening('window', 'w1', 3, lvl)!
    expect(w.sill).toBe(DEFAULT_WINDOW.sill)
    expect(w.width).toBe(DEFAULT_WINDOW.width)
  })

  it('honours overrides and clamps onto the wall', () => {
    const { lvl } = wallProject()
    const d = createWallOpening('door', 'w1', 99, lvl, { width: 1.2 })!
    expect(d.width).toBeCloseTo(1.2, 9)
    expect(d.at).toBeCloseTo(6 - 0.6, 9)
  })

  it('refuses a non-wall host or a miss entirely (null = nothing to place)', () => {
    const { lvl } = wallProject()
    expect(createWallOpening('door', 'missing', 1, lvl)).toBeNull()
    const beam: DraftElement = { id: 'bm', type: 'beam', nodes: ['a', 'b'], sectionId: 'beam-300x500', role: 'beam' }
    const lvl2: DraftLevel = { ...lvl, elements: new Map(lvl.elements).set('bm', beam) }
    expect(createWallOpening('door', 'bm', 1, lvl2)).toBeNull()
  })

  it('tolerance constant is finger-friendly', () => {
    expect(WALL_HOST_TOLERANCE).toBeGreaterThanOrEqual(0.3)
  })
})

describe('openingSpan', () => {
  it('gives the jamb points and the wall angle for a straight wall', () => {
    const { lvl } = wallProject()
    const d = createWallOpening('door', 'w1', 2, lvl)!
    const span = openingSpan(d, lvl)!
    expect(span.p1.x).toBeCloseTo(2 - 0.45, 9)
    expect(span.p2.x).toBeCloseTo(2 + 0.45, 9)
    expect(span.p1.y).toBeCloseTo(0, 9)
    expect(span.angle).toBeCloseTo(0, 9)
    expect(span.centre).toEqual({ x: 2, y: 0 })
  })

  it('follows the host when the host moved (preview-aware nodes map)', () => {
    const { lvl } = wallProject()
    const d = createWallOpening('door', 'w1', 2, lvl)!
    const moved = new Map(lvl.nodes)
    moved.set('a', { ...n('a', 0, 2, 0) })
    moved.set('b', { ...n('b', 6, 2, 0) })
    const span = openingSpan(d, lvl, moved)!
    expect(span.p1.y).toBeCloseTo(2, 9)
    expect(span.p2.y).toBeCloseTo(2, 9)
  })

  it('is null without a host, or when the host vanished', () => {
    const { lvl } = wallProject()
    const d = createWallOpening('door', 'w1', 2, lvl)!
    expect(openingSpan({ ...d, hostId: undefined }, lvl)).toBeNull()
    const orphanLvl: DraftLevel = { ...lvl, elements: new Map([['d', d]]) }
    expect(openingSpan(orphanLvl.elements.get('d')!, orphanLvl)).toBeNull()
  })
})

describe('doorSwing', () => {
  it('maps the four quadrants to hinge × inward', () => {
    expect(doorSwing(0)).toEqual({ hinge: 'left', inward: true })
    expect(doorSwing(1)).toEqual({ hinge: 'right', inward: true })
    expect(doorSwing(2)).toEqual({ hinge: 'left', inward: false })
    expect(doorSwing(3)).toEqual({ hinge: 'right', inward: false })
    expect(doorSwing(undefined)).toEqual({ hinge: 'left', inward: true })
  })
})

describe('deleteDraftElements', () => {
  it('a deleted wall takes its hosted doors/windows along (Revit cascade)', () => {
    const { lvl } = wallProject()
    const d = createWallOpening('door', 'w1', 2, lvl)!
    const w = createWallOpening('window', 'w1', 4, lvl)!
    const withOpenings: DraftLevel = {
      ...lvl,
      elements: new Map(lvl.elements).set(d.id, d).set(w.id, w),
    }
    const next = deleteDraftElements(withOpenings, ['w1'])
    expect(next.elements.has('w1')).toBe(false)
    expect(next.elements.has(d.id)).toBe(false)
    expect(next.elements.has(w.id)).toBe(false)
    expect(next.elements.has('w2')).toBe(true)
    // joints a/b still used by w2? w2 runs b→c, so 'a' is orphaned, 'b'/'c' stay
    expect(next.nodes.has('a')).toBe(false)
    expect(next.nodes.has('b')).toBe(true)
    expect(next.nodes.has('c')).toBe(true)
  })

  it('deleting an opening keeps its host wall and the host joints', () => {
    const { lvl } = wallProject()
    const d = createWallOpening('door', 'w1', 2, lvl)!
    const withDoor: DraftLevel = { ...lvl, elements: new Map(lvl.elements).set(d.id, d) }
    const next = deleteDraftElements(withDoor, [d.id])
    expect(next.elements.has('w1')).toBe(true)
    expect(next.nodes.has('a')).toBe(true)
    expect(next.nodes.has('b')).toBe(true)
  })

  it('does not mutate the input level (React state flows through)', () => {
    const { lvl } = wallProject()
    const before = new Set(lvl.elements.keys())
    deleteDraftElements(lvl, ['w1'])
    expect(new Set(lvl.elements.keys())).toEqual(before)
  })
})

describe('finish materials', () => {
  it('both catalogs have unique ids, colours and non-negative loads', () => {
    for (const cat of [SLAB_MATERIALS, CEILING_MATERIALS]) {
      const ids = cat.map(m => m.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const m of cat) {
        expect(m.color).toMatch(/^#[0-9a-f]{6}$/i)
        expect(m.load).toBeGreaterThanOrEqual(0)
        expect(m.name.length).toBeGreaterThan(0)
      }
    }
  })

  it('finishMaterial falls back to the first entry for unknown ids', () => {
    expect(finishMaterial(SLAB_MATERIALS, 'conc-cast').id).toBe('conc-cast')
    expect(finishMaterial(SLAB_MATERIALS, 'nope').id).toBe(SLAB_MATERIALS[0].id)
    expect(resolveFinishMaterial('timber').id).toBe('timber')
    expect(resolveFinishMaterial('gypsum').id).toBe('gypsum')
    expect(resolveFinishMaterial(undefined).id).toBe(SLAB_MATERIALS[0].id)
  })
})

describe('export with architectural components', () => {
  it('doors/windows/ceilings never enter the frame; openings ride on the wall', () => {
    const { project, lvl } = wallProject()
    const d = createWallOpening('door', 'w1', 2, lvl)!
    const w = createWallOpening('window', 'w1', 4.5, lvl)!
    const clg: DraftElement = {
      id: 'clg1', type: 'ceiling', nodes: ['a', 'b'], sectionId: 'slab-150',
      corners: ['a', 'b', 'c', 'a'], materialId: 'gypsum',
    }
    const p: DraftProject = {
      ...project,
      levels: new Map([['L1', {
        ...lvl,
        elements: new Map(lvl.elements).set(d.id, d).set(w.id, w).set(clg.id, clg),
      }]]),
    }
    const model = draftToStructuralModel(p)
    // one wall (the b→c wall exports too — walls w1 AND w2 exist), no doors etc.
    expect(model.members.filter(m => m.role === 'beam').length).toBe(2)
    expect(model.walls!.length).toBe(2)
    expect(model.plates).toHaveLength(0)
    // the host wall carries both openings, ordered by t
    const w1 = model.walls!.find(x => x.id === 'w1')!
    expect(w1.openings).toHaveLength(2)
    expect(w1.openings![0].kind).toBe('door')
    expect(w1.openings![0].t).toBeCloseTo(2, 9)
    expect(w1.openings![1].kind).toBe('window')
    expect(w1.openings![1].t).toBeCloseTo(4.5, 9)
    expect(w1.openings![1].sill).toBeCloseTo(DEFAULT_WINDOW.sill, 9)
  })

  it('ceilings are finish — absent from plates even with four distinct corners', () => {
    const { project, lvl } = wallProject()
    const clg: DraftElement = {
      id: 'clg1', type: 'ceiling', nodes: ['a', 'b'], sectionId: 'slab-150',
      corners: ['a', 'b', 'c', 'a'],
    }
    const p: DraftProject = {
      ...project,
      levels: new Map([['L1', { ...lvl, elements: new Map(lvl.elements).set(clg.id, clg) }]]),
    }
    const model = draftToStructuralModel(p)
    expect(model.plates).toHaveLength(0)
  })
})

describe('serialization with the new fields', () => {
  it('openings, ceilings and material ids survive a round-trip', () => {
    const { project, lvl } = wallProject()
    const d = createWallOpening('door', 'w1', 2, lvl)!
    d.swing = 2
    const clg: DraftElement = {
      id: 'clg1', type: 'ceiling', nodes: ['a', 'b'], sectionId: 'slab-150',
      corners: ['a', 'b', 'c', 'a'], materialId: 'acoustic',
    }
    const slab: DraftElement = {
      id: 'sl1', type: 'slab', nodes: ['a', 'b'], sectionId: 'slab-200',
      role: 'slab', corners: ['a', 'b', 'c', 'a'], materialId: 'steel-deck',
    }
    const p: DraftProject = {
      ...project,
      levels: new Map([['L1', {
        ...lvl,
        elements: new Map(lvl.elements).set(d.id, d).set(clg.id, clg).set(slab.id, slab),
      }]]),
    }
    const back = deserializeProject(serializeProject(p))
    const lvlBack = back.levels.get('L1')!
    const dBack = lvlBack.elements.get(d.id)!
    expect(dBack.type).toBe('door')
    expect(dBack.hostId).toBe('w1')
    expect(dBack.at).toBeCloseTo(2, 9)
    expect(dBack.width).toBeCloseTo(DEFAULT_DOOR.width, 9)
    expect(dBack.swing).toBe(2)
    expect(lvlBack.elements.get('clg1')!.materialId).toBe('acoustic')
    expect(lvlBack.elements.get('sl1')!.materialId).toBe('steel-deck')
    expect(lvlBack.elements.get('sl1')!.corners).toEqual(['a', 'b', 'c', 'a'])
  })

  it('addLevel still works on projects that carry openings', () => {
    const { project, lvl } = wallProject()
    const d = createWallOpening('door', 'w1', 2, lvl)!
    const p: DraftProject = {
      ...project,
      levels: new Map([['L1', { ...lvl, elements: new Map(lvl.elements).set(d.id, d) }]]),
    }
    const grown = { ...p, levels: new Map(p.levels) }
    addLevel(grown)
    expect(grown.levels.size).toBe(2)
    expect(grown.levels.get('L1')!.elements.get(d.id)!.type).toBe('door')
  })
})
