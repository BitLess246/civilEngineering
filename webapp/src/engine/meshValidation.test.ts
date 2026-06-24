import { describe, it, expect } from 'vitest'
import { validateMesh, hasMeshErrors } from './meshValidation'
import { generateGridModel } from './modelBuilder'
import { emptyModel, type RectSection, type StructuralModel } from './model'

const section: RectSection = { id: 'S1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }

const codes = (m: StructuralModel) => new Set(validateMesh(m).map((i) => i.code))

describe('validateMesh — clean models', () => {
  it('a generated grid has no issues', () => {
    const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section })
    const issues = validateMesh(model)
    expect(issues).toEqual([])
    expect(hasMeshErrors(issues)).toBe(false)
  })

  it('an empty model has no issues', () => {
    expect(validateMesh(emptyModel())).toEqual([])
  })
})

describe('validateMesh — fatal errors', () => {
  it('flags a member referencing a missing node', () => {
    const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section })
    model.members[0] = { ...model.members[0], j: 'ghost' }
    const issues = validateMesh(model)
    expect(issues.some((i) => i.code === 'member-missing-node' && i.refs.includes('ghost'))).toBe(true)
    expect(hasMeshErrors(issues)).toBe(true)
  })

  it('flags a zero-length member', () => {
    const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section })
    const m = model.members[0]
    // move node j onto node i
    const ni = model.nodes.find((n) => n.id === m.i)!
    model.nodes = model.nodes.map((n) => (n.id === m.j ? { ...n, x: ni.x, y: ni.y, z: ni.z } : n))
    expect(codes(model)).toContain('zero-length-member')
  })

  it('flags a model with no supports', () => {
    const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section })
    model.supports = []
    const issues = validateMesh(model)
    expect(issues.some((i) => i.code === 'no-supports')).toBe(true)
    expect(hasMeshErrors(issues)).toBe(true)
  })

  it('flags an unrestrained connected component', () => {
    // two separate columns; only the first one is supported
    const model = emptyModel()
    model.sections = [section]
    model.nodes = [
      { id: 'a0', x: 0, y: 0, z: 0 }, { id: 'a1', x: 0, y: 3, z: 0 },
      { id: 'b0', x: 5, y: 0, z: 0 }, { id: 'b1', x: 5, y: 3, z: 0 },
    ]
    model.members = [
      { id: 'ca', i: 'a0', j: 'a1', role: 'column', section: 'S1' },
      { id: 'cb', i: 'b0', j: 'b1', role: 'column', section: 'S1' },
    ]
    model.supports = [{ node: 'a0', fixity: 'fixed' }]
    const issues = validateMesh(model)
    const rb = issues.find((i) => i.code === 'unrestrained-component')!
    expect(rb).toBeTruthy()
    expect(rb.refs).toEqual(expect.arrayContaining(['b0', 'b1']))
    expect(rb.refs).not.toContain('a0')   // supported component is fine
  })

  it('flags an orphan node unless it is fully fixed', () => {
    const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section })
    model.nodes = [...model.nodes, { id: 'loose', x: 99, y: 99, z: 99 }]
    expect(codes(model)).toContain('orphan-node')

    // fully fixing it downgrades to an advisory
    model.supports = [...model.supports, { node: 'loose', fixity: 'fixed' }]
    const issues = validateMesh(model)
    expect(issues.some((i) => i.code === 'orphan-node')).toBe(false)
    expect(issues.some((i) => i.code === 'isolated-node')).toBe(true)
  })
})

describe('validateMesh — advisory warnings', () => {
  it('warns on coincident distinct nodes without erroring', () => {
    const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section })
    const first = model.nodes[0]
    // duplicate the first node's location with a new id, and attach a member so
    // it isn't also an orphan
    model.nodes = [...model.nodes, { id: 'twin', x: first.x, y: first.y, z: first.z }]
    model.members = [...model.members, { id: 'mt', i: 'twin', j: model.members[0].j, role: 'beam', section: 'S1' }]
    const issues = validateMesh(model)
    expect(issues.some((i) => i.code === 'coincident-nodes' && i.refs.includes('twin'))).toBe(true)
  })

  it('warns on duplicate members on the same node pair', () => {
    const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section })
    const m0 = model.members[0]
    model.members = [...model.members, { ...m0, id: `${m0.id}_dup` }]
    const issues = validateMesh(model)
    expect(issues.some((i) => i.code === 'duplicate-member')).toBe(true)
  })
})
