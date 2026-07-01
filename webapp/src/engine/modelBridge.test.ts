import { describe, it, expect } from 'vitest'
import { modelToFrame3D, effectiveReleases } from './modelBridge'
import { emptyModel, type StructuralModel, type RectSection } from './model'

const section: RectSection = {
  id: 'S', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40,
}

function baseModel(): StructuralModel {
  return {
    ...emptyModel('t'),
    nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 4, y: 0, z: 0 }],
    sections: [section],
    members: [{ id: 'm', i: 'a', j: 'b', role: 'beam', section: 'S' }],
    supports: [{ node: 'a', fixity: 'fixed' }],
  }
}

describe('modelToFrame3D — rigid offsets', () => {
  it('maps member offsets to F3Member offI / offJ', () => {
    const model = baseModel()
    model.members[0].offsets = { iEnd: [0, 0.3, 0], jEnd: [0, -0.2, 0] }
    const br = modelToFrame3D(model)
    const m = br.members.find((x) => x.id === 'm')!
    expect(m.offI).toEqual([0, 0.3, 0])
    expect(m.offJ).toEqual([0, -0.2, 0])
  })

  it('omits offI / offJ when no offsets are set', () => {
    const br = modelToFrame3D(baseModel())
    const m = br.members.find((x) => x.id === 'm')!
    expect(m.offI).toBeUndefined()
    expect(m.offJ).toBeUndefined()
  })

  it('applies auto rigid end zones when rigidEndZones is on', () => {
    // beam a→b plus a column at node a so the beam gets an auto i-end zone
    const model: StructuralModel = {
      ...baseModel(),
      nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 4, y: 0, z: 0 }, { id: 'c', x: 0, y: 3, z: 0 }],
      members: [
        { id: 'm', i: 'a', j: 'b', role: 'beam', section: 'S' },
        { id: 'col', i: 'a', j: 'c', role: 'column', section: 'S' },
      ],
      rigidEndZones: true, rigidZoneFactor: 1,
    }
    const br = modelToFrame3D(model)
    const m = br.members.find((x) => x.id === 'm')!
    expect(m.offI).toBeDefined()           // auto zone at the shared joint
    expect(m.offI![0]).toBeGreaterThan(0)  // inward along +X
  })

  it('manual offsets take precedence over auto rigid zones', () => {
    const model: StructuralModel = {
      ...baseModel(),
      nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 4, y: 0, z: 0 }, { id: 'c', x: 0, y: 3, z: 0 }],
      members: [
        { id: 'm', i: 'a', j: 'b', role: 'beam', section: 'S', offsets: { iEnd: [0, 0.9, 0] } },
        { id: 'col', i: 'a', j: 'c', role: 'column', section: 'S' },
      ],
      rigidEndZones: true, rigidZoneFactor: 1,
    }
    const m = modelToFrame3D(model).members.find((x) => x.id === 'm')!
    expect(m.offI).toEqual([0, 0.9, 0])    // manual wins
  })
})

// 4×3 m slab panel in the X-Z plane (y=4) carried by 4 corner nodes.
function slabModel(): StructuralModel {
  return {
    ...emptyModel('t'),
    nodes: [
      { id: 'n0', x: 0, y: 4, z: 0 }, { id: 'n1', x: 4, y: 4, z: 0 },
      { id: 'n2', x: 4, y: 4, z: 3 }, { id: 'n3', x: 0, y: 4, z: 3 },
    ],
    sections: [section],
    members: [
      { id: 'e0', i: 'n0', j: 'n1', role: 'beam', section: 'S' },
      { id: 'e1', i: 'n1', j: 'n2', role: 'beam', section: 'S' },
      { id: 'e2', i: 'n2', j: 'n3', role: 'beam', section: 'S' },
      { id: 'e3', i: 'n3', j: 'n0', role: 'beam', section: 'S' },
    ],
    plates: [{ id: 'p', corners: ['n0', 'n1', 'n2', 'n3'], role: 'slab', thickness: 150 }],
    supports: [{ node: 'n0', fixity: 'fixed' }, { node: 'n1', fixity: 'fixed' }, { node: 'n2', fixity: 'fixed' }, { node: 'n3', fixity: 'fixed' }],
    loads: [{ kind: 'area', plate: 'p', q: 5, cat: 'D' }],
  }
}

describe('modelToFrame3D — shell elements', () => {
  it('meshes each panel into two triangular shells when shellElements is on', () => {
    const model = { ...slabModel(), shellElements: true }
    const br = modelToFrame3D(model)
    expect(br.shells.length).toBe(2)
    expect(br.shells[0].nodes).toEqual(['n0', 'n1', 'n2'])
    expect(br.shells[1].nodes).toEqual(['n0', 'n2', 'n3'])
    expect(br.shells[0].t).toBe(150)
    expect(br.shells[0].E).toBeCloseTo(4700 * Math.sqrt(28), 3)
  })

  it('produces no shells (classic tributary path) when the flag is off', () => {
    const br = modelToFrame3D(slabModel())
    expect(br.shells).toEqual([])
    // tributary edge loads land on the beams as member-vdl
    expect(br.loads.some((l) => l.kind === 'member-vdl')).toBe(true)
  })

  it('routes the panel area load to corner nodes (−Y) and skips tributary — no double count', () => {
    const model = { ...slabModel(), shellElements: true }
    const br = modelToFrame3D(model)
    // no tributary edge loads for the shell panel
    expect(br.loads.some((l) => l.kind === 'member-vdl' || l.kind === 'member-udl')).toBe(false)
    const nodeLoads = br.loads.filter((l) => l.kind === 'node') as Extract<typeof br.loads[number], { kind: 'node' }>[]
    const sumFy = nodeLoads.reduce((s, l) => s + (l.Fy ?? 0), 0)
    // total lumped load = −q·area = −5·(4·3) = −60 kN
    expect(sumFy).toBeCloseTo(-60, 6)
  })

  it('useShells:false overrides the model flag (keeps tributary for design)', () => {
    const model = { ...slabModel(), shellElements: true }
    const br = modelToFrame3D(model, { useShells: false })
    expect(br.shells).toEqual([])
    expect(br.loads.some((l) => l.kind === 'member-vdl')).toBe(true)
  })
})

describe('connection type → member releases (force behaviour)', () => {
  it("a 'simple' end releases the bending moments My, Mz (a pin)", () => {
    const rel = effectiveReleases({ connections: { iEnd: 'simple' } })
    expect(rel.iEnd).toMatchObject({ My: true, Mz: true })
    expect(rel.iEnd?.Fx).toBeFalsy()      // shear/axial still transferred
    expect(rel.jEnd).toBeUndefined()
  })

  it("'moment' and 'fixed' ends stay continuous (no release)", () => {
    expect(effectiveReleases({ connections: { iEnd: 'moment', jEnd: 'fixed' } })).toEqual({})
  })

  it('explicit releases are unioned with connection-implied ones', () => {
    const rel = effectiveReleases({ releases: { jEnd: { Fx: true } }, connections: { jEnd: 'simple' } })
    expect(rel.jEnd).toMatchObject({ Fx: true, My: true, Mz: true })
  })

  it('the bridge pins a simple-ended beam in the assembled frame', () => {
    const m = baseModel()
    m.members[0].connections = { jEnd: 'simple' }
    const br = modelToFrame3D(m)
    expect(br.members[0].relJ?.[5]).toBe(true)   // Mz released at j
    expect(br.members[0].relJ?.[4]).toBe(true)   // My released at j
  })
})
