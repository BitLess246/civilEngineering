import { describe, it, expect } from 'vitest'
import { solveFrame3D, analyzeFrame3D, rectJ, precomputeFrame, solveWithGeometry, serializePrecomp, deserializePrecomp, appliedResultant, type F3Node, type F3Member, type F3Support, type F3Load } from './frame3d'
import { solveFrame2D } from './frame2d'
import { generateGridModel } from './modelBuilder'
import { modelToFrame3D } from './modelBridge'
import type { RectSection } from './model'

const E = 25000, G = E / 2.4
const b = 300, h = 500
const A = b * h, Iz = (b * h ** 3) / 12, Iy = (h * b ** 3) / 12, J = rectJ(b, h)
const sec = { E, G, A, Iy, Iz, J }
const EIz = E * Iz * 1e-9, EIy = E * Iy * 1e-9, GJ = G * J * 1e-9, EA = (E * A) / 1000

const cant = (loads: F3Load[]) => solveFrame3D(
  [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 3, y: 0, z: 0 }] as F3Node[],
  [{ id: 'm', i: 'a', j: 'b', ...sec }] as F3Member[],
  [{ node: 'a', fixity: 'fixed' }] as F3Support[],
  loads)!

describe('frame3d — closed forms (cantilever along x, L = 3)', () => {
  const L = 3
  it('tip gravity point (−Y): δy = PL³/3EIz, Mz,base = PL', () => {
    const P = 20
    const r = cant([{ kind: 'member-point', member: 'm', a: L, P, cat: 'D' }])
    expect(r.d[6 + 1]).toBeCloseTo((-P * L ** 3) / (3 * EIz), 9)
    expect(Math.abs(r.members[0].Mz[0])).toBeCloseTo(P * L, 3)
    expect(r.reactions[0].F[1]).toBeCloseTo(P, 6)
  })

  it('tip lateral nodal load (−Z): δz = PL³/3EIy, My,base = PL (second plane)', () => {
    const P = 15
    const r = cant([{ kind: 'node', node: 'b', Fz: -P, cat: 'D' }])
    expect(r.d[6 + 2]).toBeCloseTo((-P * L ** 3) / (3 * EIy), 9)
    expect(Math.abs(r.members[0].My[0])).toBeCloseTo(P * L, 3)
  })

  it('gravity UDL: Mz,base = wL²/2, δtip = wL⁴/8EIz', () => {
    const w = 10
    const r = cant([{ kind: 'member-udl', member: 'm', w, cat: 'D' }])
    expect(Math.abs(r.members[0].Mz[0])).toBeCloseTo((w * L * L) / 2, 2)
    expect(r.d[6 + 1]).toBeCloseTo((-w * L ** 4) / (8 * EIz), 6)
    expect(r.reactions[0].F[1]).toBeCloseTo(w * L, 4)
  })

  it('tip torque Mx: θx = TL/GJ, T constant', () => {
    const T = 12
    const r = cant([{ kind: 'node', node: 'b', Mx: T, cat: 'D' }])
    expect(r.d[6 + 3]).toBeCloseTo((T * L) / GJ, 9)
    expect(Math.abs(r.members[0].T[0])).toBeCloseTo(T, 6)
  })

  it('axial nodal load (+X): δx = PL/EA', () => {
    const P = 100
    const r = cant([{ kind: 'node', node: 'b', Fx: P, cat: 'D' }])
    expect(r.d[6 + 0]).toBeCloseTo((P * L) / EA, 12)
    expect(r.members[0].N[0]).toBeCloseTo(P, 4)
  })
})

describe('frame3d — square-section J', () => {
  it('rectJ(square) ≈ 0.1406·b⁴', () => {
    expect(rectJ(300, 300) / 300 ** 4).toBeCloseTo(0.1406, 3)
  })
})

describe('frame3d — planar portal matches frame2d', () => {
  it('fixed-base portal with beam UDL: same reactions and beam Mmax', () => {
    const L = 6, H = 3, w = 12
    const n3: F3Node[] = [
      { id: 'A', x: 0, y: 0, z: 0 }, { id: 'B', x: 0, y: H, z: 0 },
      { id: 'C', x: L, y: H, z: 0 }, { id: 'D', x: L, y: 0, z: 0 },
    ]
    // A vertical column's in-plane (global X) sway bends it about its LOCAL
    // y′ axis (= Iy). Give the 3D members Iy = Iz so the planar comparison
    // matches the 2D model, which used a single I for every member.
    const secPlanar = { ...sec, Iy: Iz }
    const m3: F3Member[] = [
      { id: 'col1', i: 'A', j: 'B', ...secPlanar },
      { id: 'beam', i: 'B', j: 'C', ...secPlanar },
      { id: 'col2', i: 'D', j: 'C', ...secPlanar },
    ]
    const r3 = solveFrame3D(n3, m3,
      [{ node: 'A', fixity: 'fixed' }, { node: 'D', fixity: 'fixed' }],
      [{ kind: 'member-udl', member: 'beam', w, cat: 'D' }])!

    const r2 = solveFrame2D(
      [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 0, y: H }, { id: 'C', x: L, y: H }, { id: 'D', x: L, y: 0 }],
      [{ id: 'col1', i: 'A', j: 'B', E, A, I: Iz }, { id: 'beam', i: 'B', j: 'C', E, A, I: Iz }, { id: 'col2', i: 'D', j: 'C', E, A, I: Iz }],
      [{ node: 'A', type: 'fixed' }, { node: 'D', type: 'fixed' }],
      [{ kind: 'member-udl', member: 'beam', w, cat: 'D' }])!

    expect(r3.reactions[0].F[1]).toBeCloseTo(r2.reactions[0].Ry, 4)
    expect(r3.reactions[0].F[0]).toBeCloseTo(r2.reactions[0].Rx, 4)
    const beam3 = r3.members.find((m) => m.id === 'beam')!
    const beam2 = r2.members.find((m) => m.id === 'beam')!
    expect(beam3.Mmax).toBeCloseTo(beam2.Mmax, 3)
  })
})

describe('frame3d — full model bridge (grid + slab loads)', () => {
  const section: RectSection = { id: 'S1', name: '300×500', b, h, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }

  it('slab area load reaches the supports: ΣRy = factored q·A under 1.4D', () => {
    const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section })
    model.loads = model.plates.map((p) => ({ kind: 'area', plate: p.id, q: 5, cat: 'D' }))
    const br = modelToFrame3D(model)
    expect(br.orphanEdges).toHaveLength(0)
    const res = analyzeFrame3D(br.nodes, br.members, br.supports, br.loads)!
    const gov = res.perCombo[res.govIdx]
    expect(gov.combo.name).toBe('1.4D')
    const sumRy = gov.result!.reactions.reduce((s, q) => s + q.F[1], 0)
    expect(sumRy).toBeCloseTo(1.4 * 5 * 6 * 5, 2)     // 210 kN
    // lateral equilibrium too
    expect(gov.result!.reactions.reduce((s, q) => s + q.F[0], 0)).toBeCloseTo(0, 4)
    expect(gov.result!.reactions.reduce((s, q) => s + q.F[2], 0)).toBeCloseTo(0, 4)
  })

  it('two-storey grid solves and distributes both categories', () => {
    const model = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.5, 3], section })
    model.loads = model.plates.flatMap((p) => [
      { kind: 'area' as const, plate: p.id, q: 4.8, cat: 'D' as const },
      { kind: 'area' as const, plate: p.id, q: 2.4, cat: 'L' as const },
    ])
    const br = modelToFrame3D(model)
    const res = analyzeFrame3D(br.nodes, br.members, br.supports, br.loads)!
    expect(res.perCombo[res.govIdx].combo.name).toContain('1.2D + 1.6L')
    const wu = 1.2 * 4.8 + 1.6 * 2.4                  // 9.6 kPa
    const area = 12 * 5 * 2                            // two floors
    const sumRy = res.perCombo[res.govIdx].result!.reactions.reduce((s, q) => s + q.F[1], 0)
    expect(sumRy).toBeCloseTo(wu * area, 1)
  })
})

describe('frame3d — P-Δ second order (vertical cantilever, L = 4)', () => {
  const L = 4
  const colNodes = [{ id: 'base', x: 0, y: 0, z: 0 }, { id: 'top', x: 0, y: L, z: 0 }] as F3Node[]
  const colMem = [{ id: 'c', i: 'base', j: 'top', ...sec }] as F3Member[]
  const sup = [{ node: 'base', fixity: 'fixed' }] as F3Support[]
  const H = 10
  const lat: F3Load[] = [{ kind: 'node', node: 'top', Fx: H, cat: 'D' }]

  // first-order lateral drift (exact for a tip point load — cubic Hermite)
  const lin = solveFrame3D(colNodes, colMem, sup, lat)!
  const d1 = Math.abs(lin.d[6 + 0])
  // effective Euler buckling load of the cantilever from the linear stiffness
  const EIeff = (H * L ** 3) / (3 * d1)
  const Pe = (Math.PI ** 2 * EIeff) / (4 * L ** 2)

  it('compression amplifies drift ≈ 1/(1−P/Pe) and converges', () => {
    const P = 0.25 * Pe
    const r = solveFrame3D(colNodes, colMem, sup,
      [...lat, { kind: 'node', node: 'top', Fy: -P, cat: 'D' }], { pDelta: true })!
    const d2 = Math.abs(r.d[6 + 0])
    expect(d2).toBeGreaterThan(d1)
    // one-element consistent Pcr is within ~1% of π²EI/4L², so the amplifier matches
    expect(d2 / d1).toBeCloseTo(1 / (1 - 0.25), 1)
  })

  it('tension stiffens the column (drift below first order)', () => {
    const P = 0.25 * Pe
    const r = solveFrame3D(colNodes, colMem, sup,
      [...lat, { kind: 'node', node: 'top', Fy: +P, cat: 'D' }], { pDelta: true })!
    expect(Math.abs(r.d[6 + 0])).toBeLessThan(d1)
  })

  it('negligible axial → P-Δ collapses to the first-order result', () => {
    const r = solveFrame3D(colNodes, colMem, sup,
      [...lat, { kind: 'node', node: 'top', Fy: -1e-3 * Pe, cat: 'D' }], { pDelta: true })!
    expect(Math.abs(r.d[6 + 0]) / d1).toBeCloseTo(1, 2)   // within 0.5% of linear
  })

  it('base moment is amplified in step with the drift', () => {
    const P = 0.25 * Pe
    const r = solveFrame3D(colNodes, colMem, sup,
      [...lat, { kind: 'node', node: 'top', Fy: -P, cat: 'D' }], { pDelta: true })!
    // second-order base moment = H·L + P·Δ > first-order H·L
    expect(Math.abs(r.members[0].My[0])).toBeGreaterThan(H * L)
  })
})

describe('serializePrecomp / deserializePrecomp — postMessage roundtrip', () => {
  const nodes: F3Node[] = [
    { id: 'a', x: 0, y: 0, z: 0 },
    { id: 'b', x: 0, y: 3, z: 0 },
    { id: 'c', x: 4, y: 3, z: 0 },
  ]
  const E2 = 25000, G2 = E2 / 2.4
  const members: F3Member[] = [
    { id: 'm1', i: 'a', j: 'b', E: E2, G: G2, A: 150000, Iz: 10416666667, Iy: 3750000000, J: 4e9 },
    { id: 'm2', i: 'b', j: 'c', E: E2, G: G2, A: 150000, Iz: 10416666667, Iy: 3750000000, J: 4e9 },
  ]
  const supports: F3Support[] = [{ node: 'a', fixity: 'fixed' }]
  const loads: F3Load[] = [{ kind: 'node', node: 'c', Fy: -50, cat: 'D' }]

  it('roundtrip preserves all scalar fields', () => {
    const p = precomputeFrame(nodes, members, supports)
    const s = serializePrecomp(p)
    const q = deserializePrecomp(s)
    expect(q.ndof).toBe(p.ndof)
    expect(q.free).toEqual(p.free)
    expect(q.nodes).toEqual(p.nodes)
    expect(q.members).toEqual(p.members)
    expect(q.supports).toEqual(p.supports)
    expect(q.Kff_raw).toEqual(p.Kff_raw)
    expect(q.Kff?.n).toBe(p.Kff?.n)
  })

  it('freeIdx Map is reconstructed correctly', () => {
    const p = precomputeFrame(nodes, members, supports)
    const q = deserializePrecomp(serializePrecomp(p))
    for (const [k, v] of p.freeIdx) expect(q.freeIdx.get(k)).toBe(v)
    expect(q.freeIdx.size).toBe(p.freeIdx.size)
  })

  it('solveWithGeometry gives identical results on the deserialized precomp', () => {
    const p = precomputeFrame(nodes, members, supports)
    const q = deserializePrecomp(serializePrecomp(p))
    const r1 = solveWithGeometry(p, loads)!
    const r2 = solveWithGeometry(q, loads)!
    expect(r1).not.toBeNull()
    expect(r2).not.toBeNull()
    for (let i = 0; i < r1.d.length; i++) expect(r2.d[i]).toBeCloseTo(r1.d[i], 9)
    expect(r2.Mmax).toBeCloseTo(r1.Mmax, 9)
  })
})

describe('appliedResultant — statics self-check (§8)', () => {
  const noLen = () => 0

  it('sums node loads per global axis', () => {
    const loads: F3Load[] = [
      { kind: 'node', node: 'a', Fx: 10, Fy: -50, Fz: 5, cat: 'D' },
      { kind: 'node', node: 'b', Fx: -4, Fy: -20, cat: 'L' },
    ]
    expect(appliedResultant(loads, noLen)).toEqual([6, -70, 5])
  })

  it('integrates member gravity loads (UDL w·L, VDL ½(w1+w2)·Δ, point P) into −Y', () => {
    const loads: F3Load[] = [
      { kind: 'member-udl', member: 'm1', w: 10, cat: 'D' },                              // 10·4 = 40
      { kind: 'member-vdl', member: 'm2', x1: 0, x2: 6, w1: 0, w2: 8, cat: 'D' },         // ½·8·6 = 24
      { kind: 'member-point', member: 'm3', a: 1.5, P: 12, cat: 'L' },                    // 12
    ]
    const len = (id: string) => ({ m1: 4, m2: 6, m3: 3 }[id] ?? 0)
    expect(appliedResultant(loads, len)).toEqual([0, -(40 + 24 + 12), 0])
  })

  it('balances the reactions for a slab-loaded grid: ΣApplied + ΣReactions ≈ 0', () => {
    const section: RectSection = { id: 'S1', name: '300×500', b, h, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
    const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section })
    model.loads = model.plates.map((p) => ({ kind: 'area', plate: p.id, q: 5, cat: 'D' }))
    const br = modelToFrame3D(model)
    const res = analyzeFrame3D(br.nodes, br.members, br.supports, br.loads)!
    const gov = res.perCombo[res.govIdx]
    const pos = new Map(br.nodes.map((n) => [n.id, n]))
    const len = (id: string) => {
      const m = br.members.find((mm) => mm.id === id)!
      const a = pos.get(m.i)!, c = pos.get(m.j)!
      return Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z)
    }
    const applied = appliedResultant(gov.factored, len)
    const reac: [number, number, number] = [0, 1, 2].map((k) =>
      gov.result!.reactions.reduce((s, q) => s + q.F[k], 0)) as [number, number, number]
    for (let k = 0; k < 3; k++) expect(applied[k] + reac[k]).toBeCloseTo(0, 2)
  })
})
