import { describe, it, expect } from 'vitest'
import { solveFrame3D, analyzeFrame3D, rectJ, type F3Node, type F3Member, type F3Support, type F3Load } from './frame3d'
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
