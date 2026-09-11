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

describe('validateMesh — slab openings', () => {
  // A 6 × 5 m panel on four corner nodes at y = 3. `openings` are metres from
  // corner 0 along the panel's two edges, so the panel bounds them directly.
  const panel = (openings: NonNullable<StructuralModel['plates'][number]['openings']>): StructuralModel => {
    const m = emptyModel()
    m.nodes = [
      { id: 'n0', x: 0, y: 3, z: 0 }, { id: 'n1', x: 6, y: 3, z: 0 },
      { id: 'n2', x: 6, y: 3, z: 5 }, { id: 'n3', x: 0, y: 3, z: 5 },
    ]
    // Supports matter here for a non-obvious reason: validateMesh RETURNS
    // EARLY on a model with none ("every component is a rigid body; one message
    // is enough"), so a fixture without them never reaches the plate rules at
    // all — the first version of this test passed vacuously.
    m.supports = m.nodes.map((n) => ({ node: n.id, fixity: 'fixed' as const }))
    m.plates = [{ id: 'P1', corners: ['n0', 'n1', 'n2', 'n3'], role: 'slab', thickness: 150, openings }]
    return m
  }
  const rect = (id: string, x: number, y: number, w: number, h: number) =>
    ({ id, kind: 'rect' as const, x, y, w, h })

  // The bare fixture has no members, so `isolated-node` fires on it — a real,
  // unrelated rule. These assertions are about openings, so they look at the
  // OPENING_* codes rather than demanding a globally empty result.
  const openingCodes = (m: StructuralModel) =>
    [...codes(m)].filter((c) => c.startsWith('OPENING_')).sort()

  it('a solid panel and a well-placed opening raise nothing', () => {
    expect(openingCodes(panel([]))).toEqual([])
    expect(openingCodes(panel([rect('O1', 1, 1, 1.2, 0.9)]))).toEqual([])
    expect(openingCodes(panel([{ id: 'O1', kind: 'circle', x: 3, y: 2.5, r: 0.4 }]))).toEqual([])
  })

  it('flags an opening extending past the panel edge', () => {
    expect(codes(panel([rect('O1', 5.5, 1, 1.0, 0.5)]))).toContain('OPENING_OUTSIDE')
    expect(codes(panel([rect('O1', -0.2, 1, 1.0, 0.5)]))).toContain('OPENING_OUTSIDE')
    // a circle is bounded by its radius, not its centre
    expect(codes(panel([{ id: 'O1', kind: 'circle', x: 0.2, y: 2.5, r: 0.5 }]))).toContain('OPENING_OUTSIDE')
    expect(codes(panel([{ id: 'O1', kind: 'circle', x: 0.6, y: 2.5, r: 0.5 }]))).not.toContain('OPENING_OUTSIDE')
  })

  it('flags a non-positive size', () => {
    expect(codes(panel([rect('O1', 1, 1, 0, 0.5)]))).toContain('OPENING_SIZE')
    expect(codes(panel([{ id: 'O1', kind: 'circle', x: 3, y: 2.5, r: 0 }]))).toContain('OPENING_SIZE')
  })

  it('flags overlapping openings — they would double-count the interrupted bars', () => {
    expect(codes(panel([rect('O1', 1, 1, 2, 2), rect('O2', 2, 2, 2, 2)]))).toContain('OPENING_OVERLAP')
    // touching edge-to-edge is not overlapping
    expect(codes(panel([rect('O1', 1, 1, 1, 1), rect('O2', 2, 1, 1, 1)]))).not.toContain('OPENING_OVERLAP')
  })

  it('flags duplicate opening ids within a panel', () => {
    expect(codes(panel([rect('O1', 1, 1, 1, 1), rect('O1', 3, 1, 1, 1)]))).toContain('OPENING_DUP_ID')
  })

  it('warns when the opening is most of the panel — that is not a slab with a hole', () => {
    // 5 × 4 of a 6 × 5 panel is 67%: the strips left over are beams, and the
    // slab engines' assumptions no longer describe what is being built.
    const c = codes(panel([rect('O1', 0.5, 0.5, 5, 4)]))
    expect(c).toContain('OPENING_LARGE')
    expect(hasMeshErrors(validateMesh(panel([rect('O1', 0.5, 0.5, 5, 4)])))).toBe(false)  // warning, not error
    expect(codes(panel([rect('O1', 1, 1, 1.2, 0.9)]))).not.toContain('OPENING_LARGE')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// THE MODEL'S OWN REFERENCES
//
// A QA pass is only worth the checks it makes. These are the ones a review
// listed that nothing here made: a plate on a node that is gone, two plates on
// the same corners, a member on a section the model does not carry, a load on
// an element that does not exist, and members outside the aspect ratio a frame
// element describes.
// ─────────────────────────────────────────────────────────────────────────
describe('references — everything points at something', () => {
  const frame = (): StructuralModel =>
    generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section, slabThickness: 150 })
  const has = (m: StructuralModel) => validateMesh(m).map((x) => x.code)

  it('catches a member on a section the model does not carry', () => {
    const m = frame()
    m.members[0].section = 'not-a-section'
    expect(has(m)).toContain('member-missing-section')
  })

  it('catches a plate on a missing node, and two plates on the same corners', () => {
    const m = frame()
    if (!m.plates.length) return
    const p0 = m.plates[0]
    expect(has({ ...m, plates: [{ ...p0, corners: [p0.corners[0], p0.corners[1], p0.corners[2], 'gone'] }] }))
      .toContain('plate-missing-node')
    expect(has({ ...m, plates: [p0, { ...p0, id: `${p0.id}-copy` }] })).toContain('duplicate-plate')
  })

  it('catches a load applied to an element that is not there', () => {
    const m = frame()
    const bad = validateMesh({ ...m, loads: [...m.loads, { kind: 'member-udl', member: 'ghost', w: 5, cat: 'D' }] })
    const row = bad.find((x) => x.code === 'load-missing-target')!
    expect(row).toBeDefined()
    expect(row.message).toContain('ghost')
    expect(row.message).toContain('silently dropped')
  })

  it('flags a member the frame-element idealisation does not describe', () => {
    const m = frame()
    // a stub: the member is shorter than its own depth
    const mm = m.members[0]
    const a = m.nodes.find((n) => n.id === mm.i)!
    const short = { ...m, nodes: m.nodes.map((n) => (n.id === mm.j ? { ...n, x: a.x + 0.2, y: a.y, z: a.z } : n)) }
    expect(has(short)).toContain('member-aspect-stubby')
  })

  it('says nothing about a sound model', () => {
    const c = has(frame())
    for (const q of ['member-missing-section', 'plate-missing-node', 'duplicate-plate',
      'load-missing-target', 'member-aspect-stubby', 'member-aspect-slender']) {
      expect(c, q).not.toContain(q)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────
// A SECTION THAT CANNOT EXIST USED TO PASS VALIDATION.
//
// Only timber sections were dimension-checked. A concrete or steel section
// could carry b = 0, a negative dimension, f'c = 0, fy = 0 or a zero bar Ø and
// the model came back clean — then the analysis "succeeded" and the pipeline
// reported a complete design. Measured on a 1-bay frame before this rule:
// b = 0 gave a full design for 4 beams and 4 columns, and a NEGATIVE b gave a
// different full design (Mmax 93.7 against the sound model's 63.9). Nothing
// crashed; the app simply answered a question about a structure that cannot be
// built, which is the worst way for it to be wrong.
// ─────────────────────────────────────────────────────────────────────────
describe('section properties must be physical', () => {
  const good: RectSection = { id: 's1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40, material: 'concrete' }
  const withSection = (over: Partial<RectSection>) => {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section: good, slabThickness: 200 })
    return { ...m, sections: m.sections.map((s) => ({ ...s, ...over })) }
  }
  const codes = (over: Partial<RectSection>) =>
    validateMesh(withSection(over)).filter((i) => i.severity === 'error').map((i) => i.code)

  it('passes a sound concrete section', () => {
    expect(codes({})).toEqual([])
  })

  it('rejects a zero or negative dimension, and GATES the run', () => {
    for (const over of [{ b: 0 }, { h: 0 }, { b: -300 }, { h: -500 }]) {
      expect(codes(over)).toContain('SECTION_DIMS')
      expect(hasMeshErrors(validateMesh(withSection(over)))).toBe(true)
    }
  })

  it("rejects f'c = 0 — E = 4700√f'c is zero, so the member carries no stiffness", () => {
    expect(codes({ fc: 0 })).toContain('SECTION_FC')
    expect(codes({ fc: -28 })).toContain('SECTION_FC')
  })

  it('rejects fy = 0 and a zero bar Ø — both put NaN through the design', () => {
    expect(codes({ fy: 0 })).toContain('SECTION_FY')
    expect(codes({ barDia: 0 })).toContain('SECTION_BAR_DIA')
    expect(codes({ tieDia: 0 })).toContain('SECTION_TIE_DIA')
  })

  it('rejects a cover that leaves no effective depth', () => {
    // 500 mm section, 480 cover + 10 tie + 10 half-bar ⇒ d ≤ 0
    expect(codes({ cover: 480 })).toContain('SECTION_COVER')
    expect(codes({ cover: -10 })).toContain('SECTION_COVER')
    // …and a generous but workable cover is still fine
    expect(codes({ cover: 75 })).toEqual([])
  })

  it('does not second-guess a catalogue STEEL shape, whose b/h are nominal', () => {
    // a W-shape carries its properties in the catalogue, not in b × h
    const steel = codes({ material: 'steel', shape: 'W310X39', b: 0, h: 0, fc: 0, fy: 0, barDia: 0, tieDia: 0 })
    expect(steel).not.toContain('SECTION_DIMS')
    expect(steel).not.toContain('SECTION_FC')
    expect(steel).not.toContain('SECTION_BAR_DIA')
  })

  it('leaves the timber rule to WOOD_DIMS rather than reporting both', () => {
    const wood = codes({ material: 'wood', woodSpecies: 'apitong', b: 0, h: 0 })
    expect(wood).toContain('WOOD_DIMS')
    expect(wood).not.toContain('SECTION_DIMS')
  })
})

describe('validateMesh — shell mesh quality', () => {
  // One flat 6 × 5 m panel on four nodes, which is what the grid generator
  // makes and what every rule below deforms one corner of.
  const panel = (corners: { x: number; y: number; z: number }[], extra: Partial<StructuralModel> = {}): StructuralModel => ({
    ...emptyModel(),
    nodes: corners.map((c, i) => ({ id: `n${i}`, ...c })),
    sections: [section],
    plates: [{ id: 'p1', corners: ['n0', 'n1', 'n2', 'n3'], role: 'slab', thickness: 150 }],
    supports: corners.map((_, i) => ({ node: `n${i}`, fixity: 'fixed' as const })),
    storeys: [{ id: 's0', name: 'L0', elevation: 0 }],
    ...extra,
  })
  const flat = (lx = 6, lz = 5) => panel([
    { x: 0, y: 0, z: 0 }, { x: lx, y: 0, z: 0 }, { x: lx, y: 0, z: lz }, { x: 0, y: 0, z: lz },
  ])

  it('a square, flat, well-proportioned panel raises nothing', () => {
    // The control. Every rule below must be silent here or it cannot
    // discriminate a bad panel from a good one.
    const c = codes(flat())
    for (const k of ['PLATE_WARP', 'PLATE_ASPECT', 'PLATE_SKEW', 'PLATE_DEGENERATE', 'MESH_SUBDIV_RANGE', 'MESH_DOF_BUDGET', 'MESH_OPENING_COARSE'])
      expect(c).not.toContain(k)
  })

  it('MESH_SUBDIV_RANGE rejects a subdivision that is not a whole number in 1..6', () => {
    for (const bad of [0, -1, 7, 2.5, Number.NaN]) {
      expect(codes({ ...flat(), shellSubdiv: bad })).toContain('MESH_SUBDIV_RANGE')
    }
    for (const ok of [1, 2, 6]) {
      expect(codes({ ...flat(), shellSubdiv: ok })).not.toContain('MESH_SUBDIV_RANGE')
    }
    expect(codes(flat())).not.toContain('MESH_SUBDIV_RANGE')   // absent is fine
  })

  it('PLATE_WARP flags a corner lifted out of plane, and tolerates a small lift', () => {
    // Shorter diagonal of a 6×5 panel is √61 = 7.81 m, so the 2% threshold is
    // 156 mm. Straddle it rather than picking one comfortable value.
    const lift = (dy: number) => panel([
      { x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }, { x: 6, y: dy, z: 5 }, { x: 0, y: 0, z: 5 },
    ])
    expect(codes(lift(0.10))).not.toContain('PLATE_WARP')
    expect(codes(lift(0.40))).toContain('PLATE_WARP')
  })

  it('PLATE_ASPECT flags a needle panel because every cell keeps the ratio', () => {
    expect(codes(flat(6, 5))).not.toContain('PLATE_ASPECT')     // 1.2:1
    expect(codes(flat(24, 5))).toContain('PLATE_ASPECT')        // 4.8:1
  })

  it('PLATE_SKEW flags a corner angle outside 30°–150°', () => {
    // Slide corner 1 far along +x: the angle at corner 0 stays 90° but the
    // angle at corner 1 collapses.
    const sheared = panel([
      { x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }, { x: 20, y: 0, z: 1 }, { x: 0, y: 0, z: 5 },
    ])
    expect(codes(sheared)).toContain('PLATE_SKEW')
    expect(codes(flat())).not.toContain('PLATE_SKEW')
  })

  it('PLATE_DEGENERATE names the panel the bridge silently drops', () => {
    // All four corners collinear — zero area. modelBridge `continue`s past this
    // without a word, so the panel leaves the analysis unannounced.
    const line = panel([
      { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 6, y: 0, z: 0 },
    ])
    const issues = validateMesh(line)
    expect(issues.some((i) => i.code === 'PLATE_DEGENERATE' && i.refs.includes('p1'))).toBe(true)
    expect(hasMeshErrors(issues)).toBe(true)
    // and it reports ONLY that for the panel — the other rules would divide by
    // a zero it no longer reaches
    expect(codes(line)).not.toContain('PLATE_SKEW')
  })

  it('MESH_OPENING_COARSE flags a hole the mesh cannot resolve, only when meshing', () => {
    // 6×5 panel: cells are min(6,5)/n, so 2.5 m at subdivision 2 and 0.83 m at
    // 6. A 1.2 m stair void is missed by the first and resolved by the second.
    const withHole = (subdiv: number, r: number) => ({
      ...flat(),
      shellElements: true,
      shellSubdiv: subdiv,
      plates: [{ id: 'p1', corners: ['n0', 'n1', 'n2', 'n3'] as [string, string, string, string], role: 'slab' as const, thickness: 150,
        openings: [{ id: 'o1', kind: 'circle' as const, x: 3, y: 2.5, r }] }],
    })
    expect(codes(withHole(2, 0.6))).toContain('MESH_OPENING_COARSE')       // 1.2 m across vs 2.5 m cells
    expect(codes(withHole(6, 0.6))).not.toContain('MESH_OPENING_COARSE')   // 0.83 m cells resolve it
    expect(codes(withHole(2, 2.0))).not.toContain('MESH_OPENING_COARSE')   // a 4 m hole is resolved
    // silent while the mesh is off — nothing is being meshed to miss it
    expect(codes({ ...withHole(2, 0.6), shellElements: false })).not.toContain('MESH_OPENING_COARSE')
  })

  it('MESH_DOF_BUDGET refuses a mesh that would exhaust the dense stiffness matrix', () => {
    // 40 panels at subdivision 6 → 40·49 = 1960 mesh nodes ≈ 11 800 DOF against
    // the 4 000 budget. The message must name a subdivision that fits, because
    // "too big" without a number is not actionable.
    const many: StructuralModel = {
      ...flat(),
      shellElements: true,
      shellSubdiv: 6,
      plates: Array.from({ length: 40 }, (_, i) => ({
        id: `p${i}`, corners: ['n0', 'n1', 'n2', 'n3'] as [string, string, string, string], role: 'slab' as const, thickness: 150,
      })),
    }
    const hit = validateMesh(many).find((i) => i.code === 'MESH_DOF_BUDGET')
    expect(hit).toBeDefined()
    expect(hit!.severity).toBe('error')
    expect(hit!.message).toMatch(/Subdivision \d fits\.|Split this model/)
    // the same model at subdivision 1 is well inside the budget
    expect(codes({ ...many, shellSubdiv: 1 })).not.toContain('MESH_DOF_BUDGET')
    // and the budget is not charged while the mesh is off
    expect(codes({ ...many, shellElements: false })).not.toContain('MESH_DOF_BUDGET')
  })

  it('the quality rules apply before the mesh is switched on', () => {
    // A warped or needle panel is a bad panel either way; the user should hear
    // it before flipping the switch, not after.
    expect(codes(flat(24, 5))).toContain('PLATE_ASPECT')
    expect(flat(24, 5).shellElements).toBeUndefined()
  })
})
