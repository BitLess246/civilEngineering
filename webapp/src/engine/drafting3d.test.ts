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
  DEFAULT_SECTION_FOR,
  sectionRole,
  normalizeDraftSections,
  withColumnPartners,
  mergeCoincidentNodes,
  panelCorners,
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
  it('stacks the next level on top of the storey below and makes it active', () => {
    const p = createDraftProject()
    // the new level's own height is ITS storey; it stands where the level
    // below ends — Level 1 is 3.5 m tall, so Level 2 is at 3.5 whatever its height
    const l2 = addLevel(p, 4)
    expect(l2.elevation).toBe(3.5)
    expect(l2.height).toBe(4)
    expect(p.activeLevelId).toBe(l2.id)
    // …and Level 3 stands on Level 2's 4 m storey — not on a fixed 3.5 m step,
    // which would have left Level 2's column tops 0.5 m above Level 3's floor
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

describe('audit fixes — sections follow the tool', () => {
  it('every library section has the role its id says, and each tool default exists', () => {
    for (const sec of DEFAULT_SECTIONS) {
      const prefix = sec.id.split('-')[0]
      expect(sectionRole(sec)).toBe({ beam: 'beam', col: 'column', slab: 'slab', wall: 'wall' }[prefix])
    }
    const ids = new Set(DEFAULT_SECTIONS.map(s => s.id))
    for (const id of Object.values(DEFAULT_SECTION_FOR)) expect(ids.has(id)).toBe(true)
    expect(sectionRole(DEFAULT_SECTIONS.find(s => s.id === DEFAULT_SECTION_FOR.slab)!)).toBe('slab')
  })

  it('repairs slabs and walls stamped with the old single active section (a 400×400 column)', () => {
    const p = sampleProject()
    const l1 = p.levels.get('L1')!
    l1.elements.set('es1', { ...l1.elements.get('es1')!, sectionId: 'col-400x400' })
    l1.elements.set('ew1', { ...l1.elements.get('ew1')!, sectionId: 'col-400x400' })
    const before = draftToStructuralModel(p)
    expect(before.plates.find(pl => pl.id === 'es1')!.thickness).toBe(400)   // the bug
    const fixed = normalizeDraftSections(p)
    const m = draftToStructuralModel(fixed)
    expect(m.plates.find(pl => pl.id === 'es1')!.thickness).toBe(150)
    expect(m.walls!.find(w => w.id === 'ew1')!.thickness).toBe(200)
    // right-role sections are left alone, and a clean project is returned as is
    expect(fixed.levels.get('L1')!.elements.get('eb1')!.sectionId).toBe('beam-300x500')
    expect(normalizeDraftSections(fixed)).toBe(fixed)
  })
})

describe('audit fixes — export', () => {
  it('exports no free joints: wall bases, ceiling corners and abandoned panel taps stay out', () => {
    const p = sampleProject()
    const l1 = p.levels.get('L1')!
    l1.nodes.set('stray', n('stray', 2, 2, 0))               // an abandoned slab tap
    l1.nodes.set('k1', n('k1', 1, 1, 0)); l1.nodes.set('k2', n('k2', 2, 1, 0))
    l1.nodes.set('k3', n('k3', 2, 2.5, 0)); l1.nodes.set('k4', n('k4', 1, 2.5, 0))
    l1.elements.set('ceil', el('ceil', 'ceiling', ['k1', 'k2'], 'slab-150', { corners: ['k1', 'k2', 'k3', 'k4'] }))
    const m = draftToStructuralModel(p)
    const used = new Set<string>()
    for (const mm of m.members) { used.add(mm.i); used.add(mm.j) }
    for (const pl of m.plates) for (const c of pl.corners) used.add(c)
    for (const nd of m.nodes) expect(used.has(nd.id)).toBe(true)
    expect(m.nodes.some(nd => nd.x === 2 && nd.z === 2)).toBe(false)
  })

  it('carries a wall on a BEAM section, not on the wall strip itself', () => {
    const m = draftToStructuralModel(sampleProject())
    const carry = m.members.find(mm => mm.id === 'ew1')!
    expect(carry.section).toBe(DEFAULT_SECTION_FOR.beam)
    expect(m.walls!.find(w => w.id === 'ew1')!.thickness).toBe(200)
  })

  it('rides a wall on a beam already drawn along its top instead of doubling it', () => {
    const p = sampleProject()
    // Level 2 gets a beam over the Level 1 wall b–c, drawn c→b
    const l2 = p.levels.get('L2')!
    l2.nodes.set('b3', n('b3', 6, 0, 3.5)); l2.nodes.set('c3', n('c3', 6, 6, 3.5))
    l2.elements.set('eb2', el('eb2', 'beam', ['c3', 'b3']))
    const m = draftToStructuralModel(p)
    const w = m.walls!.find(ww => ww.id === 'ew1')!
    expect(w.member).toBe('eb2')
    expect(m.members.find(mm => mm.id === 'ew1')).toBeUndefined()
    const beam = m.members.find(mm => mm.id === 'eb2')!
    expect(m.members.filter(mm => (mm.i === beam.i && mm.j === beam.j) || (mm.i === beam.j && mm.j === beam.i))).toHaveLength(1)
  })

  it('fixes the column bases of the LOWEST level, even when it is not at EL 0', () => {
    const p = sampleProject()
    // lower everything by 3 m: a basement-first building
    for (const l of p.levels.values()) {
      l.elevation -= 3
      for (const [id, nd] of l.nodes) l.nodes.set(id, { ...nd, z: nd.z - 3 })
    }
    const m = draftToStructuralModel(p)
    expect(m.supports).toHaveLength(1)
    const col = m.members.find(mm => mm.id === 'ec1')!
    expect(m.supports[0].node).toBe(col.i)
    expect(m.nodes.find(nd => nd.id === col.i)!.y).toBe(-3)
  })
})

describe('audit fixes — moving joints', () => {
  it('a column base drags its top along', () => {
    const l1 = sampleProject().levels.get('L1')!
    expect(withColumnPartners(l1, ['a']).sort()).toEqual(['a', 'a2'])
    expect(withColumnPartners(l1, ['a2']).sort()).toEqual(['a', 'a2'])
    expect(withColumnPartners(l1, ['b'])).toEqual(['b'])
  })

  it('welds coincident joints at the same elevation, never a column base to its own top', () => {
    const l = level('L', 'L', 0, 3.5, [
      n('p', 3, 0, 0), n('p2', 3, 0, 3.5),      // column 1
      n('q', 3, 0, 0), n('q2', 3, 0, 3.5),      // column 2 dropped on the same spot
      n('r', 6, 0, 0),
    ], [
      el('c1', 'column', ['p', 'p2'], 'col-400x400'),
      el('c2', 'column', ['q', 'q2'], 'col-400x400'),
      el('bm', 'beam', ['q', 'r']),
    ])
    const out = mergeCoincidentNodes(l)
    expect(out.nodes.size).toBe(3)                     // p, p2, r — bases and tops welded
    const beam = out.elements.get('bm')!
    expect(out.nodes.has(beam.nodes[0])).toBe(true)
    expect(out.elements.get('c1')!.nodes[0]).not.toBe(out.elements.get('c1')!.nodes[1])
    // c2 landed exactly on c1 — the copy is dropped, the first one stays
    expect(out.elements.has('c1')).toBe(true)
    expect(out.elements.has('c2')).toBe(false)
    // nothing coincident → the same object back
    expect(mergeCoincidentNodes(out)).toBe(out)
  })
})

describe('audit fixes — panels', () => {
  it('reads a panel in PLAN coordinates (x, y), never the elevation', () => {
    const l1 = sampleProject().levels.get('L1')!
    const slab = l1.elements.get('es1')!
    expect(panelCorners(l1, slab)).toEqual([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: 0, y: 6 }])
    expect(panelCorners(l1, { ...slab, corners: ['a', 'b', 'c', 'zz'] })).toBeNull()
  })
})
