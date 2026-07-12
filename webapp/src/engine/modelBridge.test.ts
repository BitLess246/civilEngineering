import { describe, it, expect } from 'vitest'
import { modelToFrame3D, effectiveReleases } from './modelBridge'
import { solveFrame3D } from './frame3d'
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

describe('modelToFrame3D — cracked-section modifiers (ACI 318-14 §6.6.3.1.1)', () => {
  // gross I of the 300×500: Iz = 300·500³/12 = 3.125e9 mm⁴, Iy = 500·300³/12 = 1.125e9 mm⁴
  const IgZ = (300 * 500 ** 3) / 12, IgY = (500 * 300 ** 3) / 12
  const twoRoles = (): StructuralModel => ({
    ...baseModel(),
    nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 4, y: 0, z: 0 }, { id: 'c', x: 0, y: 3, z: 0 }],
    members: [
      { id: 'bm', i: 'a', j: 'b', role: 'beam', section: 'S' },
      { id: 'col', i: 'a', j: 'c', role: 'column', section: 'S' },
    ],
  })

  it('default (opt-out) keeps gross section properties', () => {
    const br = modelToFrame3D(twoRoles())
    expect(br.members.find((m) => m.id === 'bm')!.Iz).toBeCloseTo(IgZ, 0)
    expect(br.members.find((m) => m.id === 'col')!.Iz).toBeCloseTo(IgZ, 0)
  })

  it('crackedSections: beams 0.35Ig, columns 0.70Ig, both axes; A and J gross', () => {
    const br = modelToFrame3D(twoRoles(), { crackedSections: true })
    const bm = br.members.find((m) => m.id === 'bm')!
    const col = br.members.find((m) => m.id === 'col')!
    expect(bm.Iz).toBeCloseTo(0.35 * IgZ, 0)
    expect(bm.Iy).toBeCloseTo(0.35 * IgY, 0)
    expect(col.Iz).toBeCloseTo(0.70 * IgZ, 0)
    expect(col.Iy).toBeCloseTo(0.70 * IgY, 0)
    expect(bm.A).toBeCloseTo(300 * 500, 6)          // 1.0Ag per Table 6.6.3.1.1(a)
    expect(bm.J).toBeCloseTo(modelToFrame3D(twoRoles()).members[0].J, 6)  // J untouched
  })

  it('steel members are exempt from cracking factors', () => {
    const model = twoRoles()
    model.sections = [{ ...section, material: 'steel' as const }]
    const gross = modelToFrame3D(model).members.find((m) => m.id === 'bm')!.Iz
    const cracked = modelToFrame3D(model, { crackedSections: true }).members.find((m) => m.id === 'bm')!.Iz
    expect(cracked).toBeCloseTo(gross, 6)
  })

  it('cracked beam deflects 1/0.35× more under the same load (bridge → solver)', () => {
    // cantilever tip load through the full bridge+solver path: δ ∝ 1/I
    const load = { kind: 'node' as const, node: 'b', Fy: -10, cat: 'D' as const }
    const m = { ...baseModel(), loads: [load] }
    const solve = (cracked: boolean) => {
      const br = modelToFrame3D(m, { crackedSections: cracked })
      return solveFrame3D(br.nodes, br.members, br.supports, br.loads)!
    }
    const dG = solve(false).d[6 + 1], dC = solve(true).d[6 + 1]
    expect(dC / dG).toBeCloseTo(1 / 0.35, 3)
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

describe('modelToFrame3D — member-thermal loads', () => {
  it('converts EA·α·ΔT to kN (hand calc: 300×500 f\'c=28, α=1e-5, ΔT=20 → ≈746 kN)', () => {
    const model = baseModel()
    model.loads = [{ kind: 'member-thermal', member: 'm', deltaT: 20, alpha: 1e-5, cat: 'D' }]
    const br = modelToFrame3D(model)
    const th = br.loads.find((l) => l.kind === 'member-thermal') as Extract<typeof br.loads[number], { kind: 'member-thermal' }>
    // E = 4700·√28 = 24 870 MPa, A = 300·500 = 150 000 mm²
    // PT = E·A·α·ΔT = 24 870 × 150 000 × 1e-5 × 20 = 746 102 N = 746.1 kN
    const expected = (4700 * Math.sqrt(28) * 150_000 * 1e-5 * 20) / 1000
    expect(expected).toBeCloseTo(746.1, 1)      // hand-calc sanity anchor
    expect(th.PT).toBeCloseTo(expected, 6)
    expect(th.cat).toBe('D')
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

// ── Bridge → solver UNIT CONTRACT ────────────────────────────────────────────
// The unit convention (geometry m, sections mm/mm², forces kN, stress MPa) is
// enforced only by comments; the 1000× thermal bug (PR #319) slipped through
// exactly here. These tests pin the contract END-TO-END with absolute closed
// forms, so any future unit slip in the bridge (N vs kN, m vs mm) fails loud.
describe('bridge → solver unit contract (absolute closed forms)', () => {
  // 300×500 fc28 cantilever, L = 4 m: E = 4700√28 = 24 870 MPa,
  // I = 300·500³/12 = 3.125e9 mm⁴ → EI = E·I·1e-9 = 77 719 kN·m².
  const EI = 4700 * Math.sqrt(28) * ((300 * 500 ** 3) / 12) * 1e-9

  it('nodal kN load → δ = PL³/3EI in metres (E MPa · I mm⁴ · L m all consistent)', () => {
    const m = { ...baseModel(), loads: [{ kind: 'node' as const, node: 'b', Fy: -10, cat: 'D' as const }] }
    const br = modelToFrame3D(m)
    const r = solveFrame3D(br.nodes, br.members, br.supports, br.loads)!
    // δ = 10·4³/(3·77 719) = 2.7449e-3 m — absolute value, not a ratio
    expect(-r.d[6 + 1]).toBeCloseTo((10 * 4 ** 3) / (3 * EI), 6)
  })

  it('member UDL in kN/m → ΣR = w·L kN and fixed-end moment wL²/2 at the root', () => {
    const m = { ...baseModel(), loads: [{ kind: 'member-udl' as const, member: 'm', w: -5, cat: 'D' as const }] }
    const br = modelToFrame3D(m)
    const r = solveFrame3D(br.nodes, br.members, br.supports, br.loads)!
    // |ΣR| pins the kN/m × m scaling; the sign convention is the solver's own
    const sumRy = r.reactions.reduce((s, q) => s + q.F[1], 0)
    expect(Math.abs(sumRy)).toBeCloseTo(5 * 4, 6)          // 20 kN total
    const root = r.reactions.find((q) => q.node === 'a')!
    expect(Math.abs(root.M[2])).toBeCloseTo((5 * 4 ** 2) / 2, 4)  // 40 kN·m
  })

  it('member point load kN at t → ΣR equals P (no unit slip in the a=t·L mapping)', () => {
    const m = { ...baseModel(), loads: [{ kind: 'member-point' as const, member: 'm', t: 0.5, P: -25, cat: 'L' as const }] }
    const br = modelToFrame3D(m)
    const r = solveFrame3D(br.nodes, br.members, br.supports, br.loads)!
    expect(Math.abs(r.reactions.reduce((s, q) => s + q.F[1], 0))).toBeCloseTo(25, 6)
    const root = r.reactions.find((q) => q.node === 'a')!
    expect(Math.abs(root.M[2])).toBeCloseTo(25 * 2, 4)     // P·a = 25·2 kN·m
  })

  it('restrained thermal force is E·A·α·ΔT/1000 kN — the PR #319 contract', () => {
    // both ends held: PT is fully restrained, reactions = ±PT
    const m: StructuralModel = {
      ...baseModel(),
      supports: [{ node: 'a', fixity: 'fixed' }, { node: 'b', fixity: 'fixed' }],
      loads: [{ kind: 'member-thermal', member: 'm', alpha: 1e-5, deltaT: 20, cat: 'D' }],
    }
    const br = modelToFrame3D(m)
    const r = solveFrame3D(br.nodes, br.members, br.supports, br.loads)!
    const PT = (4700 * Math.sqrt(28) * 300 * 500 * 1e-5 * 20) / 1000   // ≈ 746 kN
    const Rx = r.reactions.find((q) => q.node === 'a')!.F[0]
    expect(Math.abs(Rx)).toBeCloseTo(PT, 3)
    expect(PT).toBeGreaterThan(500)
    expect(PT).toBeLessThan(1000)   // a 1000× slip lands at ~7.5e5 and fails here
  })

  it('spring support: reaction = −k·d with k in kN/m, d in m', () => {
    const m: StructuralModel = {
      ...baseModel(),
      supports: [{ node: 'a', fixity: 'fixed' }, { node: 'b', fixity: 'spring', ky: 1000 }],
      loads: [{ kind: 'node', node: 'b', Fy: -10, cat: 'D' }],
    }
    const br = modelToFrame3D(m)
    const r = solveFrame3D(br.nodes, br.members, br.supports, br.loads)!
    const spring = r.reactions.find((q) => q.node === 'b')!
    expect(spring.F[1]).toBeCloseTo(-1000 * r.d[6 + 1], 6)  // restoring force
    expect(spring.F[1]).toBeGreaterThan(0)                  // pushes back up
  })
})

describe('modelToFrame3D — Timoshenko shear areas (opt-in)', () => {
  it('off by default: members carry no Asy/Asz (Euler benchmarks anchored)', () => {
    const m = modelToFrame3D(baseModel()).members.find((x) => x.id === 'm')!
    expect(m.Asy).toBeUndefined()
    expect(m.Asz).toBeUndefined()
  })

  it('concrete rectangle: Asy = Asz = 5/6·b·h', () => {
    const m = modelToFrame3D(baseModel(), { shearDeformation: true }).members.find((x) => x.id === 'm')!
    expect(m.Asy).toBeCloseTo((5 / 6) * 300 * 500, 6)
    expect(m.Asz).toBeCloseTo((5 / 6) * 300 * 500, 6)
  })

  it('steel W-shape: Asy = d·tw (AISC §G2.1 web), Asz = 5/6·2·bf·tf (flanges)', () => {
    const model = baseModel()
    model.sections = [{ ...section, material: 'steel' as const, shape: 'W150x13' }]
    const m = modelToFrame3D(model, { shearDeformation: true }).members.find((x) => x.id === 'm')!
    // W150x13: d = 150, tw = 5.0, bf = 100, tf = 7.1 (mm)
    expect(m.Asy).toBeCloseTo(150 * 5.0, 6)
    expect(m.Asz).toBeCloseTo((5 / 6) * 2 * 100 * 7.1, 6)
  })

  it('shear-deformable solve is softer than Euler and keeps ΣR = ΣP', () => {
    const model = baseModel()
    model.loads = [{ kind: 'node', node: 'b', Fy: -20, cat: 'D' }]
    const euler = modelToFrame3D(model)
    const timo = modelToFrame3D(model, { shearDeformation: true })
    const rE = solveFrame3D(euler.nodes, euler.members, euler.supports, euler.loads)!
    const rT = solveFrame3D(timo.nodes, timo.members, timo.supports, timo.loads)!
    expect(Math.abs(rT.d[6 + 1])).toBeGreaterThan(Math.abs(rE.d[6 + 1]))
    expect(rT.reactions.reduce((t, q) => t + q.F[1], 0)).toBeCloseTo(20, 6)
  })
})
