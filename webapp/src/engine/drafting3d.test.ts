import { describe, it, expect } from 'vitest'
import {
  createDraftProject,
  addLevel,
  snapToGrid,
  draftToStructuralModel,
  serializeProject,
  deserializeProject,
  uid,
  DEFAULT_SECTIONS,
  type DraftProject,
  type DraftLevel,
  type DraftNode,
  type DraftElement,
} from './drafting3d'

/** A level with the given nodes/elements, ready to drop into a project. */
function level(id: string, name: string, elevation: number, height: number,
  nodes: DraftNode[], elements: DraftElement[]): DraftLevel {
  return {
    id, name, elevation, height,
    nodes: new Map(nodes.map(n => [n.id, n])),
    elements: new Map(elements.map(e => [e.id, e])),
    grids: { x: [0, 3, 6, 9], y: [0, 3, 6, 9] },
  }
}

const n = (id: string, x: number, y: number, z: number): DraftNode => ({ id, x, y, z })
const el = (id: string, type: DraftElement['type'], nodes: [string, string],
  sectionId = 'beam-300x500', extra: Partial<DraftElement> = {}): DraftElement =>
  ({
    id, type, nodes, sectionId,
    // role is the STRUCTURAL duty — doors/windows/ceilings carry none
    ...(type === 'door' || type === 'window' ? {} : { role: type }),
    ...extra,
  })

/** Level 1 (EL 0, 3.5 m storey) + Level 2 (EL 3.5) with a beam, two columns, a slab and a wall. */
function sampleProject(): DraftProject {
  const base = createDraftProject('Test Tower')
  const l1 = level('L1', 'Level 1', 0, 3.5, [
    n('a', 0, 0, 0), n('b', 6, 0, 0), n('c', 6, 6, 0), n('d', 0, 6, 0),
  ], [
    el('eb1', 'beam', ['a', 'b']),
    el('ec1', 'column', ['a', 'a2'], 'col-400x400', {}),
    el('es1', 'slab', ['a', 'b'], 'slab-200', { corners: ['a', 'b', 'c', 'd'] }),
    el('ew1', 'wall', ['b', 'c'], 'wall-200'),
  ])
  // the second end of the column: its top joint, one storey up
  l1.nodes.set('a2', n('a2', 0, 0, 3.5))
  const l2 = level('L2', 'Level 2', 3.5, 3.5, [
    n('e', 0, 0, 3.5), n('e2', 0, 0, 7),
  ], [
    el('ec2', 'column', ['e', 'e2'], 'col-400x400'),
  ])
  return {
    ...base,
    levels: new Map([['L1', l1], ['L2', l2]]),
    activeLevelId: 'L1',
  }
}

describe('createDraftProject', () => {
  it('starts with one level at elevation 0, default grids and the section library', () => {
    const p = createDraftProject()
    expect(p.levels.size).toBe(1)
    const l = p.levels.get(p.activeLevelId)!
    expect(l.elevation).toBe(0)
    expect(l.height).toBe(3.5)
    expect(p.gridX).toEqual([0, 3, 6, 9])
    expect(p.sections.size).toBe(DEFAULT_SECTIONS.length)
  })

  it('ships a section library with unique ids covering beams, columns, slabs and walls', () => {
    const ids = DEFAULT_SECTIONS.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const prefix of ['beam-', 'col-', 'slab-', 'wall-']) {
      expect(ids.some(id => id.startsWith(prefix))).toBe(true)
    }
  })
})

describe('addLevel', () => {
  it('stacks the next level one storey above the highest and makes it active', () => {
    const p = createDraftProject()
    // an explicit height sets the first step; later steps use the fixed 3.5 m
    const l2 = addLevel(p, 4)
    expect(l2.elevation).toBe(4)
    expect(l2.height).toBe(4)
    expect(p.activeLevelId).toBe(l2.id)
    const l3 = addLevel(p)
    expect(l3.elevation).toBe(7.5)
    expect(l3.name).toBe('Level 3')
    expect(p.levels.get(l3.id)!.grids!.x).toEqual(p.gridX)
  })
})

describe('snapToGrid', () => {
  it('snaps to the nearest intersection within tolerance and leaves far points alone', () => {
    const gx = [0, 3, 6]
    const gy = [0, 3, 6]
    expect(snapToGrid(0.1, 2.9, gx, gy)).toEqual({ x: 0, y: 3 })
    expect(snapToGrid(1.5, 1.5, gx, gy)).toEqual({ x: 1.5, y: 1.5 })
    expect(snapToGrid(0.2, 0.1, gx, gy, 0.3)).toEqual({ x: 0, y: 0 })
  })
})

describe('draftToStructuralModel', () => {
  it('emits a complete StructuralModel: version, name, storeys, sections, empty loads', () => {
    const m = draftToStructuralModel(sampleProject())
    expect(m.version).toBe(1)
    expect(m.name).toBe('Test Tower')
    expect(m.storeys.map(s => s.elevation)).toEqual([0, 3.5])
    expect(m.sections).toHaveLength(DEFAULT_SECTIONS.length)
    expect(m.loads).toEqual([])
  })

  it('swaps draft (y-plan, z-elevation) into the model convention (y-up, z-plan)', () => {
    const m = draftToStructuralModel(sampleProject())
    // draft node a (0,0,0) → model (0, 0, 0); a2 (0,0,3.5) → (0, 3.5, 0)
    const a = m.nodes.find(nd => nd.x === 0 && nd.y === 0 && nd.z === 0)
    expect(a).toBeDefined()
    const top = m.nodes.find(nd => nd.x === 0 && nd.y === 3.5 && nd.z === 0)
    expect(top).toBeDefined()
  })

  it('merges coincident joints: the column top of L1 and the node below L2 are ONE model node', () => {
    const m = draftToStructuralModel(sampleProject())
    const atJoint = m.nodes.filter(nd => Math.abs(nd.x) < 1e-9 && Math.abs(nd.y - 3.5) < 1e-3 && Math.abs(nd.z) < 1e-9)
    expect(atJoint).toHaveLength(1)
  })

  it('keeps draft element ids on members and maps roles', () => {
    const m = draftToStructuralModel(sampleProject())
    const beam = m.members.find(mm => mm.id === 'eb1')
    expect(beam).toBeDefined()
    expect(beam!.role).toBe('beam')
    const col = m.members.find(mm => mm.id === 'ec1')
    expect(col!.role).toBe('column')
    expect(col!.section).toBe('col-400x400')
  })

  it('drops zero-length members', () => {
    const p = sampleProject()
    const l1 = p.levels.get('L1')!
    l1.elements.set('ez', el('ez', 'beam', ['a', 'a']))
    const m = draftToStructuralModel(p)
    expect(m.members.find(mm => mm.id === 'ez')).toBeUndefined()
  })

  it('converts a wall to a carrying member at its TOP plus a Wall entity one storey tall', () => {
    const m = draftToStructuralModel(sampleProject())
    const w = m.walls!.find(ww => ww.id === 'ew1')
    expect(w).toBeDefined()
    expect(w!.height).toBe(3.5)        // the storey height, not the section's h
    expect(w!.thickness).toBe(200)     // mm — the wall section's h
    expect(w!.shearWall).toBe(false)
    const carry = m.members.find(mm => mm.id === 'ew1')!
    expect(carry.role).toBe('beam')
    // carrying member nodes sit one storey ABOVE the drawn wall's ends
    const i = m.nodes.find(nd => nd.id === carry.i)!
    expect(i.y).toBeCloseTo(3.5, 6)
    expect(i.x).toBeCloseTo(6, 6)      // draft node b is at plan (6, 0)
    expect(i.z).toBeCloseTo(0, 6)
  })

  it('merges the L1 column top with the L2 column base into ONE joint', () => {
    const m = draftToStructuralModel(sampleProject())
    const col1 = m.members.find(mm => mm.id === 'ec1')!
    const col2 = m.members.find(mm => mm.id === 'ec2')!
    // a2 (0,0,3.5) and e (0,0,3.5) are the same joint — the column continues
    expect(col1.j).toBe(col2.i)
  })

  it('skips a degenerate (zero-length) wall', () => {
    const p = sampleProject()
    const l1 = p.levels.get('L1')!
    l1.elements.set('ewz', el('ewz', 'wall', ['a', 'a'], 'wall-200'))
    const m = draftToStructuralModel(p)
    expect(m.walls!.find(ww => ww.id === 'ewz')).toBeUndefined()
    expect(m.members.find(mm => mm.id === 'ewz')).toBeUndefined()
  })

  it('converts a slab to a plate with corner node ids and millimetre thickness', () => {
    const m = draftToStructuralModel(sampleProject())
    const p = m.plates.find(pp => pp.id === 'es1')!
    expect(p.role).toBe('slab')
    expect(p.thickness).toBe(200)
    expect(p.corners).toHaveLength(4)
    for (const c of p.corners) expect(m.nodes.find(nd => nd.id === c)).toBeDefined()
  })

  it('pins only the BASE of ground-level columns, fully fixed', () => {
    const m = draftToStructuralModel(sampleProject())
    expect(m.supports).toHaveLength(1)   // L1's column base; L2's column is not on grade
    const col = m.members.find(mm => mm.id === 'ec1')!
    const base = m.nodes.find(nd => nd.id === col.i)!
    expect(base.y).toBe(0)
    expect(m.supports.find(s => s.node === base.id)!.fixity).toBe('fixed')
    const top = m.nodes.find(nd => nd.id === col.j)!
    expect(top.y).toBe(3.5)
    expect(m.supports.find(s => s.node === top.id)).toBeUndefined()
  })

  it('ignores elements whose section no longer exists', () => {
    const p = sampleProject()
    const l1 = p.levels.get('L1')!
    l1.elements.set('egone', el('egone', 'beam', ['a', 'b'], 'nope-999'))
    const m = draftToStructuralModel(p)
    expect(m.members.find(mm => mm.id === 'egone')).toBeUndefined()
  })
})

describe('project serialization round-trip', () => {
  it('restores levels, maps, sections, grids and the active level', () => {
    const p = sampleProject()
    const restored = deserializeProject(serializeProject(p))
    expect(restored.id).toBe(p.id)
    expect(restored.name).toBe(p.name)
    expect(restored.activeLevelId).toBe('L1')
    expect(restored.gridX).toEqual(p.gridX)
    expect(restored.sections.get('col-400x400')!.b).toBe(400)
    const l1 = restored.levels.get('L1')!
    expect(l1.nodes.get('a')).toEqual({ id: 'a', x: 0, y: 0, z: 0 })
    expect(l1.elements.get('es1')!.corners).toEqual(['a', 'b', 'c', 'd'])
    expect(l1.elements.get('ew1')!.type).toBe('wall')
    const l2 = restored.levels.get('L2')!
    expect(l2.elevation).toBe(3.5)
  })

  it('survives a second round-trip through draftToStructuralModel unchanged in kind counts', () => {
    const m1 = draftToStructuralModel(sampleProject())
    const m2 = draftToStructuralModel(deserializeProject(serializeProject(sampleProject())))
    expect(m2.nodes).toHaveLength(m1.nodes.length)
    expect(m2.members).toHaveLength(m1.members.length)
    expect(m2.plates).toHaveLength(m1.plates.length)
    expect(m2.walls).toHaveLength(m1.walls!.length)
    expect(m2.supports).toHaveLength(m1.supports.length)
  })
})

describe('uid', () => {
  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 200 }, () => uid('t')))
    expect(ids.size).toBe(200)
  })
})
