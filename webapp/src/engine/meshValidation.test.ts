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

// ── L1: RectSection.barCount ──────────────────────────────────────────────
describe('validateMesh — column cage bar count', () => {
  /** A 400×400 column section carrying 4 members' worth of grid, plus the id
   *  of one column that uses it. `generateGridModel` clones a section per
   *  member (id = member id), so 'c0.0.0' is the ground-storey column. */
  const gridWith = (patch: Partial<RectSection>): StructuralModel => {
    const m = generateGridModel({
      baysX: [6], baysZ: [5], storeyH: [3],
      column: { ...section, id: 'C', name: '400×400', b: 400, h: 400 },
      beam: section, girder: section,
    })
    const col = m.sections.find((s) => s.id === 'c0.0.0')!
    Object.assign(col, patch)
    return m
  }
  const issuesFor = (patch: Partial<RectSection>) =>
    validateMesh(gridWith(patch)).filter((i) => i.refs.includes('c0.0.0'))

  it('a well-formed cage is silent', () => {
    // 8⌀20 in 400×400: ρ = 8·314.2/160000 = 0.0157 ✓; four per face, clear
    // (400 − 2·50 − 4·20)/3 = 73 mm ≥ max(1.5·20, 40) = 40 ✓
    expect(issuesFor({ barCount: 8 })).toEqual([])
  })

  it('rejects a count below the §10.7.3.1 minimum, and a fractional one', () => {
    expect(issuesFor({ barCount: 2 }).map((i) => i.code)).toContain('BAR_COUNT')
    expect(issuesFor({ barCount: 6.5 }).map((i) => i.code)).toContain('BAR_COUNT')
    expect(issuesFor({ barCount: 2 })[0].severity).toBe('error')
  })

  it('rejects an odd count — the cage must be symmetric', () => {
    const i = issuesFor({ barCount: 7 })
    expect(i.map((x) => x.code)).toContain('BAR_COUNT_SYMMETRY')
    expect(i.find((x) => x.code === 'BAR_COUNT_SYMMETRY')!.severity).toBe('error')
    // a well-formed count is not also reported as malformed
    expect(i.map((x) => x.code)).not.toContain('BAR_COUNT')
  })

  it('rejects a bar count on a steel or timber section', () => {
    expect(issuesFor({ barCount: 8, material: 'steel', shape: 'W310x38.7' }).map((i) => i.code))
      .toContain('BAR_COUNT_MATERIAL')
    expect(issuesFor({ barCount: 8, material: 'wood', woodSpecies: 'DFL-2' }).map((i) => i.code))
      .toContain('BAR_COUNT_MATERIAL')
  })

  it('warns when ρ leaves §10.6.1.1 — 4⌀16 in 400×400 is under 1%', () => {
    // 4·201.1/160000 = 0.0050 < 0.01
    const i = issuesFor({ barCount: 4, barDia: 16 })
    const rho = i.find((x) => x.code === 'BAR_COUNT_RHO')!
    expect(rho.severity).toBe('warning')
    expect(rho.message).toContain('0.0050')
    // and above 8%: 24⌀32 → 24·804.2/160000 = 0.1206
    expect(issuesFor({ barCount: 24, barDia: 32 }).map((x) => x.code)).toContain('BAR_COUNT_RHO')
  })

  it('warns when the bars cannot fit the face at §25.2.3 clear spacing', () => {
    // 16⌀32 in 400: eight per face, clear (400 − 2·50 − 8·32)/7 = 6.3 mm < 48
    const i = issuesFor({ barCount: 16, barDia: 32 })
    const sp = i.find((x) => x.code === 'BAR_COUNT_SPACING')!
    expect(sp.severity).toBe('warning')
    expect(sp.message).toContain('48 mm')
  })

  it('warns when a count sits on a section no column uses', () => {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section })
    const beam = m.sections.find((s) => m.members.some((x) => x.id === s.id && x.role !== 'column'))!
    beam.barCount = 8
    const i = validateMesh(m).filter((x) => x.refs.includes(beam.id))
    expect(i.map((x) => x.code)).toContain('BAR_COUNT_UNUSED')
    expect(i.find((x) => x.code === 'BAR_COUNT_UNUSED')!.severity).toBe('warning')
  })

  it('says nothing at all when no section carries a count', () => {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section })
    expect(validateMesh(m).filter((i) => i.code.startsWith('BAR_COUNT'))).toEqual([])
  })
})
