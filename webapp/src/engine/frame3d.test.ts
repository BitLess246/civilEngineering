import { describe, it, expect } from 'vitest'
import { solveFrame3D, analyzeFrame3D, rectJ, localAxes, precomputeFrame, solveWithGeometry, serializePrecomp, deserializePrecomp, appliedResultant, type F3Node, type F3Member, type F3Support, type F3Load, type F3DiaphragmGroup } from './frame3d'
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

describe('frame3d — moment diagram sign, BOTH bending axes', () => {
  // A fixed-base column whose top rotates but cannot translate has a
  // carry-over factor of exactly 0.5 (slope-deflection: M_base = 2EI/L·θ,
  // M_top = 4EI/L·θ). That has to hold whichever local axis does the bending.
  //
  // It did not. `My` recovered the i-end moment WITHOUT the sign flip that
  // `Mz` applies, so every station past the i-end was out by 2·f[4]: the
  // carry-over came back 0.25 about local y and 0.50 about local z. The i-end
  // magnitude was right either way, which is why reactions and the statics
  // check never noticed. Found by cross-checking the Gridframe model against
  // STAAD.Pro, where the same column read 0.49.
  const Lc = 3.5, Ic = 400 ** 4 / 12, Ac = 400 * 400
  const col = { E, G: E / 2.4, A: Ac, Iy: Ic, Iz: Ic, J: rectJ(400, 400) }

  /** Symmetric portal, fixed bases, UDL on the beam. Symmetry rules out sway,
   *  so each column must show the 0.5 carry-over. Built in the X–Y plane and
   *  again in the Z–Y plane so each local bending axis takes a turn. */
  const portal = (plane: 'xy' | 'zy') => {
    const at = (u: number, y: number) => plane === 'xy' ? { x: u, y, z: 0 } : { x: 0, y, z: u }
    const Lb = 5
    return solveFrame3D(
      [{ id: 'a', ...at(0, 0) }, { id: 'b2', ...at(Lb, 0) },
       { id: 'c', ...at(0, Lc) }, { id: 'd', ...at(Lb, Lc) }] as F3Node[],
      [{ id: 'cl', i: 'a', j: 'c', ...col }, { id: 'cr', i: 'b2', j: 'd', ...col },
       { id: 'bm', i: 'c', j: 'd', ...sec }] as F3Member[],
      [{ node: 'a', fixity: 'fixed' }, { node: 'b2', fixity: 'fixed' }] as F3Support[],
      [{ kind: 'member-udl', member: 'bm', w: 30, cat: 'D' }] as F3Load[],
    )!
  }
  /** The column's own bending diagram, whichever local axis carries it. */
  const colDiagram = (r: ReturnType<typeof portal>, id: string) => {
    const m = r.members.find((x) => x.id === id)!
    const d = Math.max(...m.My.map(Math.abs)) > Math.max(...m.Mz.map(Math.abs)) ? m.My : m.Mz
    return { d, V: Math.max(...m.Vy.map(Math.abs), ...m.Vz.map(Math.abs)) }
  }

  const checkCarryOver = (plane: 'xy' | 'zy') => {
    const r = portal(plane)
    for (const id of ['cl', 'cr']) {
      const { d, V } = colDiagram(r, id)
      const [mi, mj] = [Math.abs(d[0]), Math.abs(d[d.length - 1])]
      expect(mj).toBeGreaterThan(1)
      expect(mi / mj).toBeCloseTo(0.5, 2)
      // no transverse load on a column ⇒ linear diagram that closes on statics
      expect(mi + mj).toBeCloseTo(V * Lc, 4)
    }
  }

  it('carry-over is 0.5 for a portal in the XY plane (bending about local z)', () => {
    checkCarryOver('xy')
  })

  it('carry-over is 0.5 for a portal in the ZY plane (bending about local y)', () => {
    checkCarryOver('zy')
  })

  it('gives the same column moments whichever plane the portal is built in', () => {
    const a = colDiagram(portal('xy'), 'cl'), b = colDiagram(portal('zy'), 'cl')
    expect(Math.abs(b.d[0])).toBeCloseTo(Math.abs(a.d[0]), 6)
    expect(Math.abs(b.d[b.d.length - 1])).toBeCloseTo(Math.abs(a.d[a.d.length - 1]), 6)
  })

  it('a cantilever moment diagram closes to zero at the free end, both axes', () => {
    // The clearest statement of the same rule: nothing holds the free end, so
    // the internal moment there is zero. With the sign wrong it came back at
    // 2·M_fixed instead.
    for (const [key, load] of [
      ['Mz', { kind: 'member-udl' as const, member: 'm', w: 10, cat: 'D' as const }],
      ['My', { kind: 'node' as const, node: 'b', Fz: 10, cat: 'D' as const }],
    ] as const) {
      const r = cant([load])
      const m = r.members[0]
      const d = key === 'My' ? m.My : m.Mz
      expect(Math.abs(d[0]), `${key} at the fixed end`).toBeGreaterThan(1)
      expect(Math.abs(d[d.length - 1]), `${key} at the free end`).toBeLessThan(1e-6)
    }
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

  it('fixedAxial builds a CONSTANT geometric tangent (lateral-only solve, linear in load)', () => {
    const P = 0.25 * Pe
    // lateral-only load, geometric stiffness frozen at compression P (member axial
    // tension +, so −P). Matches the self-consistent amplifier 1/(1−P/Pe).
    const r = solveFrame3D(colNodes, colMem, sup, lat, { pDelta: true, fixedAxial: [-P] })!
    const d2 = Math.abs(r.d[6 + 0])
    expect(d2 / d1).toBeCloseTo(1 / (1 - 0.25), 1)
    // constant tangent ⇒ drift scales linearly with lateral load (double H → double Δ)
    const r2 = solveFrame3D(colNodes, colMem, sup,
      [{ kind: 'node', node: 'top', Fx: 2 * H, cat: 'D' }], { pDelta: true, fixedAxial: [-P] })!
    expect(Math.abs(r2.d[6 + 0]) / d2).toBeCloseTo(2, 6)
  })

  it('iterative P-Δ surfaces {converged, iterations, residual} on the result', () => {
    const P = 0.25 * Pe
    const r = solveFrame3D(colNodes, colMem, sup,
      [...lat, { kind: 'node', node: 'top', Fy: -P, cat: 'D' }], { pDelta: true })!
    expect(r.pDelta).toBeDefined()
    expect(r.pDelta!.converged).toBe(true)
    expect(r.pDelta!.singular).toBe(false)
    expect(r.pDelta!.iterations).toBeGreaterThanOrEqual(1)
    expect(r.pDelta!.residual).toBeLessThan(1e-5)
    // first-order solve carries no status
    expect(solveFrame3D(colNodes, colMem, sup, lat)!.pDelta).toBeUndefined()
  })

  it('P-Δ base reaction carries the secondary moment: M_base ≈ H·L + P·Δ', () => {
    const P = 0.25 * Pe
    // first-order: base moment reaction is exactly H·L, no P·Δ term
    expect(Math.abs(lin.reactions[0].M[2])).toBeCloseTo(H * L, 6)
    const r = solveFrame3D(colNodes, colMem, sup,
      [...lat, { kind: 'node', node: 'top', Fy: -P, cat: 'D' }], { pDelta: true })!
    const drift = Math.abs(r.d[6 + 0])
    const Mbase = Math.abs(r.reactions[0].M[2])
    // reactions now assemble (K + Kg)·d − F, so the P·Δ couple shows up
    expect(Mbase).toBeGreaterThan(H * L * 1.05)
    expect(Mbase / (H * L + P * drift)).toBeCloseTo(1, 2)
    // and global vertical equilibrium is untouched (Kg self-equilibrates)
    expect(r.reactions.reduce((s, q) => s + q.F[1], 0)).toBeCloseTo(P, 6)
  })

  it('P-Δ that runs out of iterations reports converged:false, not a silent pass', () => {
    // At 0.9Pe the first tangent solve amplifies drift ~10× (relative increment
    // ≈ 0.9 ≫ tol); with maxIter 1 that correction is never confirmed, so the
    // status must say non-converged instead of silently passing.
    const r = solveFrame3D(colNodes, colMem, sup,
      [...lat, { kind: 'node', node: 'top', Fy: -0.9 * Pe, cat: 'D' }], { pDelta: true, maxIter: 1 })!
    expect(r.pDelta).toBeDefined()
    expect(r.pDelta!.converged).toBe(false)
    expect(r.pDelta!.singular).toBe(false)
    expect(r.pDelta!.iterations).toBe(1)
    expect(r.pDelta!.residual).toBeGreaterThanOrEqual(1e-5)
  })

  it('fixedAxial tension stiffens; amplification grows without bound toward Pcr', () => {
    const rt = solveFrame3D(colNodes, colMem, sup, lat, { pDelta: true, fixedAxial: [+0.25 * Pe] })!
    expect(Math.abs(rt.d[6 + 0])).toBeLessThan(d1)               // tension below first order
    // compression marching toward the buckling load → drift amplifier blows up
    const a25 = Math.abs(solveFrame3D(colNodes, colMem, sup, lat, { pDelta: true, fixedAxial: [-0.25 * Pe] })!.d[6 + 0]) / d1
    const a90 = Math.abs(solveFrame3D(colNodes, colMem, sup, lat, { pDelta: true, fixedAxial: [-0.90 * Pe] })!.d[6 + 0]) / d1
    expect(a90).toBeGreaterThan(a25)
    expect(a90).toBeGreaterThan(5)                               // ~1/(1−0.9) order of magnitude
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

// ── Member end releases ───────────────────────────────────────────────────
// NOTE: Pin supports (fixity:'pin') + moment releases → singular K because the
// node's rotational DOFs are unconstrained and the element contributes zero
// rotational stiffness (released). Model a "pin" as fixity:'fixed' + Mz release
// at the element end instead — the node rotation is clamped to zero by the fixed
// support while the element end is free to rotate (internal DOF).
describe('frame3d — member end releases', () => {
  const L = 6, w = 10
  const nodes: F3Node[] = [{ id: 'i', x: 0, y: 0, z: 0 }, { id: 'j', x: L, y: 0, z: 0 }]
  const beamSec: F3Member = { id: 'b', i: 'i', j: 'j', E, G, A, Iy, Iz, J }
  const udl: F3Load[] = [{ kind: 'member-udl', member: 'b', w, cat: 'D' }]
  const bothFixed: F3Support[] = [{ node: 'i', fixity: 'fixed' }, { node: 'j', fixity: 'fixed' }]

  it('no releases: end moments = wL²/12 (fixed-fixed)', () => {
    const r = solveFrame3D(nodes, [beamSec], bothFixed, udl)!
    expect(Math.abs(r.members[0].Mz[0])).toBeCloseTo((w * L * L) / 12, 2)
    expect(Math.abs(r.members[0].Mz[r.members[0].Mz.length - 1])).toBeCloseTo((w * L * L) / 12, 2)
  })

  it('Mz released at both ends (→ simply supported): end moments ≈ 0, midspan = wL²/8', () => {
    // fixity:'fixed' + Mz release ≡ pin: node is clamped but element end rotates freely
    const m: F3Member = { ...beamSec, relI: [false, false, false, false, false, true], relJ: [false, false, false, false, false, true] }
    const r = solveFrame3D(nodes, [m], bothFixed, udl)!
    expect(r.members[0].Mz[0]).toBeCloseTo(0, 4)
    expect(r.members[0].Mz[r.members[0].Mz.length - 1]).toBeCloseTo(0, 4)
    const mid = Math.floor(r.members[0].xs.length / 2)
    expect(r.members[0].Mz[mid]).toBeCloseTo((w * L * L) / 8, 1)
    expect(r.reactions[0].F[1]).toBeCloseTo((w * L) / 2, 3)
    expect(r.reactions[1].F[1]).toBeCloseTo((w * L) / 2, 3)
  })

  it('Mz released at i-end (→ propped cantilever): Mj = wL²/8, Ri = 3wL/8', () => {
    const m: F3Member = { ...beamSec, relI: [false, false, false, false, false, true] }
    const r = solveFrame3D(nodes, [m], bothFixed, udl)!
    expect(r.members[0].Mz[0]).toBeCloseTo(0, 4)
    expect(Math.abs(r.members[0].Mz[r.members[0].Mz.length - 1])).toBeCloseTo((w * L * L) / 8, 2)
    expect(r.reactions[0].F[1]).toBeCloseTo((3 * w * L) / 8, 2)  // Ri = 3wL/8
    expect(r.reactions[1].F[1]).toBeCloseTo((5 * w * L) / 8, 2)  // Rj = 5wL/8
  })

  it('beam in portal frame with Mz releases at beam-column joints', () => {
    // 2-storey portal: columns fixed at base, beam Mz-released at both ends
    const n: F3Node[] = [
      { id: 'A', x: 0, y: 0, z: 0 }, { id: 'B', x: 0, y: 3, z: 0 },
      { id: 'C', x: 6, y: 3, z: 0 }, { id: 'D', x: 6, y: 0, z: 0 },
    ]
    const beamL = 6
    const col1: F3Member = { id: 'col1', i: 'A', j: 'B', E, G, A, Iy: Iz, Iz, J }
    const col2: F3Member = { id: 'col2', i: 'D', j: 'C', E, G, A, Iy: Iz, Iz, J }
    const beam: F3Member = { id: 'beam', i: 'B', j: 'C', E, G, A, Iy: Iz, Iz, J,
      relI: [false, false, false, false, false, true],
      relJ: [false, false, false, false, false, true],
    }
    const r = solveFrame3D(n, [col1, col2, beam],
      [{ node: 'A', fixity: 'fixed' }, { node: 'D', fixity: 'fixed' }],
      [{ kind: 'member-udl', member: 'beam', w, cat: 'D' }])!
    const bm = r.members.find((m) => m.id === 'beam')!
    // Released beam ends: Mz ≈ 0
    expect(bm.Mz[0]).toBeCloseTo(0, 3)
    expect(bm.Mz[bm.Mz.length - 1]).toBeCloseTo(0, 3)
    // Mid-span: wL²/8 (simply-supported span)
    const mid = Math.floor(bm.xs.length / 2)
    expect(bm.Mz[mid]).toBeCloseTo((w * beamL * beamL) / 8, 1)
  })
})

// ── Spring supports ────────────────────────────────────────────────────────
describe('frame3d — spring supports', () => {
  const L = 3
  // Horizontal cantilever (fixed at a, spring at b), load Fy at tip b
  it('cantilever tip spring: δy = Fy / (k_beam + k_spring)', () => {
    const ky = 500
    const r = solveFrame3D(
      [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: L, y: 0, z: 0 }],
      [{ id: 'm', i: 'a', j: 'b', E, G, A, Iy, Iz, J }],
      [{ node: 'a', fixity: 'fixed' }, { node: 'b', fixity: 'spring', ky }],
      [{ kind: 'node', node: 'b', Fy: -10, cat: 'D' }],
    )!
    // Cantilever effective tip stiffness (full 6×6 Kff solve resolves uy–θz coupling → 3EI/L³)
    const kBeam = (3 * E * Iz * 1e-9) / L ** 3
    expect(r.d[6 + 1]).toBeCloseTo(-10 / (kBeam + ky), 6)
  })

  it('spring reaction opposes displacement (restoring force sign)', () => {
    const ky = 200
    const r = solveFrame3D(
      [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: L, y: 0, z: 0 }],
      [{ id: 'm', i: 'a', j: 'b', E, G, A, Iy, Iz, J }],
      [{ node: 'a', fixity: 'fixed' }, { node: 'b', fixity: 'spring', ky }],
      [{ kind: 'node', node: 'b', Fy: -40, cat: 'D' }],
    )!
    const springReac = r.reactions.find((rx) => rx.fixity === 'spring')!
    // Spring settles downward (d[6+1] < 0); reaction must be upward (positive) = −k·d
    expect(springReac.F[1]).toBeCloseTo(-ky * r.d[6 + 1], 6)
    // Fixed base + spring together balance the 40 kN downward load
    const totalRy = r.reactions.reduce((s, rx) => s + rx.F[1], 0)
    expect(totalRy).toBeCloseTo(40, 4)
  })

  it('spring carries only a share of the load (beam stiffness >> spring stiffness here)', () => {
    const ky = 500
    const r = solveFrame3D(
      [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: L, y: 0, z: 0 }],
      [{ id: 'm', i: 'a', j: 'b', E, G, A, Iy, Iz, J }],
      [{ node: 'a', fixity: 'fixed' }, { node: 'b', fixity: 'spring', ky }],
      [{ kind: 'node', node: 'b', Fy: -10, cat: 'D' }],
    )!
    const spring = r.reactions.find((rx) => rx.fixity === 'spring')!
    expect(Math.abs(spring.F[1])).toBeGreaterThan(0)
    expect(Math.abs(spring.F[1])).toBeLessThan(10)  // spring doesn't carry full load
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

// ── Rigid floor diaphragm ─────────────────────────────────────────────────
describe('rigid floor diaphragm — precomputeFrame + solveWithGeometry', () => {
  // Two columns at (0,0,0)→(0,3,0) and (6,0,0)→(6,3,0), both fixed at base.
  // A lateral nodal load at the left column top (Fx = 1 kN).
  // Without diaphragm: each column resists independently (equal stiffness → 0.5 kN each).
  // With diaphragm: floor constraint forces equal Ux at both tops; same result here
  //   since they are symmetric, but θy of both tops must also be equal.
  const nodes: F3Node[] = [
    { id: 'bL', x: 0, y: 0, z: 0 }, { id: 'tL', x: 0, y: 3, z: 0 },
    { id: 'bR', x: 6, y: 0, z: 0 }, { id: 'tR', x: 6, y: 3, z: 0 },
  ]
  const Iy = (h * b ** 3) / 12  // weak axis
  const colSec: F3Member = { id: 'cL', i: 'bL', j: 'tL', E, G, A, Iy, Iz, J }
  const colR: F3Member = { ...colSec, id: 'cR', i: 'bR', j: 'tR' }
  const supports: F3Support[] = [
    { node: 'bL', fixity: 'fixed' }, { node: 'bR', fixity: 'fixed' },
  ]
  const loads: F3Load[] = [{ kind: 'node', node: 'tL', Fx: 1, cat: 'D' }]

  it('without diaphragm: left column takes all sway (right column uninvited)', () => {
    const r = solveFrame3D(nodes, [colSec, colR], supports, loads)!
    // Without diaphragm the nodes are independent; right top should barely move
    const tL = nodes.findIndex((n) => n.id === 'tL')
    const tR = nodes.findIndex((n) => n.id === 'tR')
    // tR has no direct load → zero horizontal displacement
    expect(Math.abs(r.d[6 * tR + 0])).toBeCloseTo(0, 9)
    expect(Math.abs(r.d[6 * tL + 0])).toBeGreaterThan(1e-6)
  })

  it('with diaphragm: both column tops have equal Ux', () => {
    const dia: F3DiaphragmGroup[] = [{ masterNode: 'tL', slaveNodes: ['tR'] }]
    const pc = precomputeFrame(nodes, [colSec, colR], supports, dia)
    const r = solveWithGeometry(pc, loads)!
    const tL = nodes.findIndex((n) => n.id === 'tL')
    const tR = nodes.findIndex((n) => n.id === 'tR')
    expect(r.d[6 * tL + 0]).toBeCloseTo(r.d[6 * tR + 0], 9)
    // Both columns resist: total reaction = 1 kN
    const sumRx = r.reactions.reduce((s, q) => s + q.F[0], 0)
    expect(sumRx).toBeCloseTo(-1, 6)
  })

  it('with diaphragm: arm effect — slave at dz offset shares θy with master', () => {
    // Master at (0,3,0), slave at (6,3,2) — has both dx and dz arm
    const nodes2: F3Node[] = [
      { id: 'bL', x: 0, y: 0, z: 0 }, { id: 'tL', x: 0, y: 3, z: 0 },
      { id: 'bR', x: 6, y: 0, z: 2 }, { id: 'tR', x: 6, y: 3, z: 2 },
    ]
    const colSec2: F3Member = { ...colSec, id: 'cL2', i: 'bL', j: 'tL' }
    const colR2: F3Member = { ...colSec, id: 'cR2', i: 'bR', j: 'tR' }
    const dia: F3DiaphragmGroup[] = [{ masterNode: 'tL', slaveNodes: ['tR'] }]
    const pc = precomputeFrame(nodes2, [colSec2, colR2], supports, dia)
    const r = solveWithGeometry(pc, loads)!
    expect(r).not.toBeNull()
    // Rigid body kinematics: ux_tR = ux_tL − dz·θy_tL; dz = 2, dx = 6
    const tL = nodes2.findIndex((n) => n.id === 'tL')
    const tR = nodes2.findIndex((n) => n.id === 'tR')
    const ux_m = r.d[6 * tL + 0], θy_m = r.d[6 * tL + 4]
    const ux_s = r.d[6 * tR + 0]
    const dz = nodes2[tR].z - nodes2[tL].z   // = 2
    expect(ux_s).toBeCloseTo(ux_m - dz * θy_m, 6)
    // Slave θy must equal master θy
    expect(r.d[6 * tR + 4]).toBeCloseTo(θy_m, 9)
  })
})

describe('rigid links / member offsets — Teff = T·H', () => {
  const L = 3

  it('zero offset is identical to no offset (cantilever closed form)', () => {
    const P = 20
    const base = cant([{ kind: 'member-point', member: 'm', a: L, P, cat: 'D' }])
    const off = solveFrame3D(
      [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 3, y: 0, z: 0 }],
      [{ id: 'm', i: 'a', j: 'b', ...sec, offI: [0, 0, 0], offJ: [0, 0, 0] }],
      [{ node: 'a', fixity: 'fixed' }],
      [{ kind: 'member-point', member: 'm', a: L, P, cat: 'D' }],
    )!
    expect(off.d[6 + 1]).toBeCloseTo(base.d[6 + 1], 12)
    expect(off.members[0].Mz[0]).toBeCloseTo(base.members[0].Mz[0], 9)
  })

  it('rigid offset arm matches an explicit near-rigid stub member', () => {
    // Flexible beam A→(L,0,0); a rigid arm of (0,h,0) lifts the loaded node to (L,h,0).
    // A horizontal load Fx at the lifted node bends the beam via the lever moment Fx·h.
    const hArm = 1.2, Fx = 8

    // Offset model: node B at (L,h,0); member end j pulled back to (L,0,0) by offJ=(0,-h,0).
    const offModel = solveFrame3D(
      [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: L, y: hArm, z: 0 }],
      [{ id: 'm', i: 'a', j: 'b', ...sec, offJ: [0, -hArm, 0] }],
      [{ node: 'a', fixity: 'fixed' }],
      [{ kind: 'node', node: 'b', Fx, cat: 'D' }],
    )!

    // Explicit model: real flexible beam A→P2(L,0,0) + a stiff stub P2→B(L,h,0).
    const stiff = { E: E * 1e6, G: G * 1e6, A, Iy, Iz, J }
    const explicit = solveFrame3D(
      [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'p2', x: L, y: 0, z: 0 }, { id: 'b', x: L, y: hArm, z: 0 }],
      [
        { id: 'm', i: 'a', j: 'p2', ...sec },
        { id: 'stub', i: 'p2', j: 'b', ...stiff },
      ],
      [{ node: 'a', fixity: 'fixed' }],
      [{ kind: 'node', node: 'b', Fx, cat: 'D' }],
    )!

    // Displacements at the loaded node must agree (offset arm = perfectly rigid stub).
    // offModel: node b is index 1 (DOFs at 6); explicit: node b is index 2 (DOFs at 12).
    expect(offModel.d[6 + 0]).toBeCloseTo(explicit.d[12 + 0], 4)  // ux
    expect(offModel.d[6 + 1]).toBeCloseTo(explicit.d[12 + 1], 4)  // uy
    expect(offModel.d[6 + 5]).toBeCloseTo(explicit.d[12 + 5], 4)  // θz
    // The flexible member sees the lever moment at its base: |Mz,base| ≈ Fx·h.
    expect(Math.abs(offModel.members[0].Mz[0])).toBeCloseTo(Fx * hArm, 2)
  })

  it('global equilibrium holds with an offset (ΣReactions + ΣApplied = 0)', () => {
    const Fx = 8, hArm = 1.2
    const r = solveFrame3D(
      [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: L, y: hArm, z: 0 }],
      [{ id: 'm', i: 'a', j: 'b', ...sec, offJ: [0, -hArm, 0] }],
      [{ node: 'a', fixity: 'fixed' }],
      [{ kind: 'node', node: 'b', Fx, cat: 'D' }],
    )!
    // Single fixed base reacts the whole applied horizontal load.
    expect(r.reactions[0].F[0]).toBeCloseTo(-Fx, 4)
    // Base moment about Z balances Fx acting at height hArm above the base node.
    expect(r.reactions[0].M[2]).toBeCloseTo(Fx * hArm, 2)
  })
})

describe('frame3d — local-axis rotation (section orientation about the member axis)', () => {
  it('localAxes(dir, 90) turns a vertical member’s depth axis onto global X', () => {
    const [xp, yp, zp] = localAxes([0, 4, 0], 90)
    expect(xp[1]).toBeCloseTo(1, 9)
    expect(yp[0]).toBeCloseTo(1, 6)          // y′ (depth) → +X
    expect(Math.abs(zp[2])).toBeCloseTo(1, 6) // z′ → ±Z
  })

  it('rotating a non-square vertical cantilever 90° swaps its strong/weak response', () => {
    // strongly non-square: Iz (about z′, resisting displacement along y′) ≫ Iy
    const E = 200000, G = 77000, A = 6650, Iz = 165e6, Iy = 9.2e6, J = 0.23e6, L = 3
    const nodes: F3Node[] = [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 0, y: L, z: 0 }]
    const sup: F3Support[] = [{ node: 'a', fixity: 'fixed' }]
    const tipX: F3Load[] = [{ kind: 'node', node: 'b', Fx: 10, cat: 'D' }]
    const mk = (rot?: number): F3Member[] => [{ id: 'c', i: 'a', j: 'b', E, G, A, Iy, Iz, J, ...(rot ? { rot } : {}) }]
    const dx0 = solveFrame3D(nodes, mk(), sup, tipX)!.d[6 + 0]      // rot 0: depth on Z → X is WEAK
    const dx90 = solveFrame3D(nodes, mk(90), sup, tipX)!.d[6 + 0]   // rot 90: depth on X → X is STRONG
    expect(Math.abs(dx90)).toBeLessThan(Math.abs(dx0) / 5)
    // exact: both match PL³/3EI with the respective inertia
    const del = (I: number) => (10 * L ** 3) / (3 * ((E * I) * 1e-9))
    expect(Math.abs(dx0)).toBeCloseTo(del(Iy), 6)
    expect(Math.abs(dx90)).toBeCloseTo(del(Iz), 6)
  })

  it('the bridge defaults vertical members to rot 90 and honors an explicit value', () => {
    const section: RectSection = { id: 'S', name: 's', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section })
    m.members.find((x) => x.role === 'beam')!.axisRotation = 30
    const br = modelToFrame3D(m)
    const col = br.members.find((x) => x.id.startsWith('c'))!
    const beam30 = br.members.find((x) => m.members.find((y) => y.id === x.id)?.axisRotation === 30)!
    const beam0 = br.members.find((x) => x.id.startsWith('bx') && x.id !== beam30.id)!
    expect(col.rot).toBe(90)
    expect(beam30.rot).toBe(30)
    expect(beam0.rot).toBeUndefined()   // 0 → omitted
  })
})

describe('frame3d — Timoshenko shear deformation (Φ = 12EI/(G·As·L²))', () => {
  const L = 3
  const Asy = (5 / 6) * A, Asz = (5 / 6) * A
  const GAsy = (G * Asy) / 1000, GAsz = (G * Asz) / 1000   // kN
  const secT = { ...sec, Asy, Asz }
  const cantT = (loads: F3Load[], over: Partial<F3Member> = {}) => solveFrame3D(
    [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: L, y: 0, z: 0 }] as F3Node[],
    [{ id: 'm', i: 'a', j: 'b', ...secT, ...over } as F3Member],
    [{ node: 'a', fixity: 'fixed' }] as F3Support[],
    loads)!

  it('tip load (−Y): δ = PL³/3EIz + PL/GAsy — the 2-node element is nodally exact', () => {
    const P = 20
    const r = cantT([{ kind: 'node', node: 'b', Fy: -P, cat: 'D' }])
    expect(r.d[6 + 1]).toBeCloseTo(-(P * L ** 3 / (3 * EIz) + P * L / GAsy), 9)
    // statics are Φ-independent: base moment and reaction unchanged
    expect(Math.abs(r.members[0].Mz[0])).toBeCloseTo(P * L, 3)
    expect(r.reactions[0].F[1]).toBeCloseTo(P, 6)
  })

  it('second plane (−Z): δ = PL³/3EIy + PL/GAsz', () => {
    const P = 15
    const r = cantT([{ kind: 'node', node: 'b', Fz: -P, cat: 'D' }])
    expect(r.d[6 + 2]).toBeCloseTo(-(P * L ** 3 / (3 * EIy) + P * L / GAsz), 9)
  })

  it('shear share is significant for a squat member and vanishes for a slender one', () => {
    const P = 20
    const euler = (P * L ** 3) / (3 * EIz)
    const r = cantT([{ kind: 'node', node: 'b', Fy: -P, cat: 'D' }])
    expect(Math.abs(r.d[6 + 1])).toBeGreaterThan(euler * 1.005)   // 300×500 over 3 m: Φ ≈ 2–3%
    // As → ∞ recovers Euler–Bernoulli exactly
    const stiff = cantT([{ kind: 'node', node: 'b', Fy: -P, cat: 'D' }], { Asy: 1e15, Asz: 1e15 })
    expect(stiff.d[6 + 1]).toBeCloseTo(-euler, 9)
  })

  it('omitted shear areas keep the classic Euler element (regression anchor)', () => {
    const P = 20
    const r = cantT([{ kind: 'node', node: 'b', Fy: -P, cat: 'D' }], { Asy: undefined, Asz: undefined })
    expect(r.d[6 + 1]).toBeCloseTo(-(P * L ** 3) / (3 * EIz), 9)
  })

  it('fixed-fixed centre load across two elements: δ = PL³/192EI + PL/4GAs', () => {
    const P = 40
    const r = solveFrame3D(
      [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'c', x: L / 2, y: 0, z: 0 }, { id: 'b', x: L, y: 0, z: 0 }] as F3Node[],
      [
        { id: 'm1', i: 'a', j: 'c', ...secT } as F3Member,
        { id: 'm2', i: 'c', j: 'b', ...secT } as F3Member,
      ],
      [{ node: 'a', fixity: 'fixed' }, { node: 'b', fixity: 'fixed' }] as F3Support[],
      [{ kind: 'node', node: 'c', Fy: -P, cat: 'D' }])!
    expect(r.d[6 + 1]).toBeCloseTo(-(P * L ** 3 / (192 * EIz) + P * L / (4 * GAsy)), 9)
    // equilibrium: ΣRy = P, symmetric halves
    expect(r.reactions.reduce((t, q) => t + q.F[1], 0)).toBeCloseTo(P, 6)
    expect(r.reactions[0].F[1]).toBeCloseTo(P / 2, 6)
  })
})

describe('internal-force diagrams — the distributed load is integrated exactly', () => {
  // A cantilever isolates the diagram integration: the end forces are pure
  // statics, so any departure from beam theory is the quadrature and nothing
  // else. These used to be a trapezoid/midpoint sweep of the intensity, which
  // is exact for a FULL-SPAN UDL and only approximate for anything else —
  // a triangular load carried up to 2% error on the moment, and a part-span
  // UDL a standing 2.5–10% error on the shear, because the uniform partition
  // never lines up with the load's kinks. The segments are piecewise linear,
  // so both integrals have a closed form and there is nothing to approximate.
  const L = 6
  const sec = { E: 200e6, G: 77e6, A: 0.01, Iy: 1e-4, Iz: 1e-4, J: 2e-4 }
  const nodes: F3Node[] = [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: L, y: 0, z: 0 }]
  const members: F3Member[] = [{ id: 'm', i: 'a', j: 'b', ...sec }]
  const fixed: F3Support[] = [{ node: 'a', fixity: 'fixed' }]
  const diag = (ld: F3Load) => solveFrame3D(nodes, members, fixed, [ld])!.members[0]
  /** Worst absolute departure of |Mz| from a closed-form M(x), over every station. */
  const worstM = (mm: ReturnType<typeof diag>, exact: (x: number) => number) =>
    mm.xs.reduce((w, x, k) => Math.max(w, Math.abs(Math.abs(mm.Mz[k]) - Math.abs(exact(x)))), 0)
  const worstV = (mm: ReturnType<typeof diag>, exact: (x: number) => number) =>
    mm.xs.reduce((w, x, k) => Math.max(w, Math.abs(Math.abs(mm.Vy[k]) - Math.abs(exact(x)))), 0)

  it('full-span UDL: M(x) = −w(L−x)²/2 to machine precision', () => {
    const w = 10
    const mm = diag({ kind: 'member-udl', member: 'm', w: -w, cat: 'D' })
    expect(worstM(mm, (x) => -w * (L - x) ** 2 / 2)).toBeLessThan(1e-9)
    expect(worstV(mm, (x) => w * (L - x))).toBeLessThan(1e-9)
    expect(Math.max(...mm.Mz.map(Math.abs))).toBeCloseTo(w * L * L / 2, 9)
  })

  it('triangular VDL: M(x) = −(w0/L)[(L³−x³)/3 − x(L²−x²)/2] to machine precision', () => {
    // The old midpoint rule integrates a QUADRATIC integrand here and was ~2%
    // out near the fixed end, where the moment is smallest and the relative
    // error largest.
    const w0 = 12
    const mm = diag({ kind: 'member-vdl', member: 'm', x1: 0, x2: L, w1: 0, w2: -w0, cat: 'D' })
    expect(worstM(mm, (x) => -(w0 / L) * ((L ** 3 - x ** 3) / 3 - x * (L ** 2 - x ** 2) / 2))).toBeLessThan(1e-9)
    expect(worstV(mm, (x) => w0 * (L * L - x * x) / (2 * L))).toBeLessThan(1e-9)
    // total load and its resultant at the support: W = w0·L/2 at 2L/3
    expect(Math.max(...mm.Mz.map(Math.abs))).toBeCloseTo((w0 * L / 2) * (2 * L / 3), 9)
  })

  it('part-span UDL: the shear is the load actually to the right of the station', () => {
    // The case the uniform partition could never resolve — the kinks at a and
    // b fall inside a sub-interval, so the trapezoid carried load that is not
    // there. Statics says the shear at x is exactly w·(b − max(a,x)).
    const w = 15, a = L / 3, b = 2 * L / 3
    const mm = diag({ kind: 'member-vdl', member: 'm', x1: a, x2: b, w1: -w, w2: -w, cat: 'D' })
    expect(worstV(mm, (x) => w * Math.max(0, b - Math.max(a, x)))).toBeLessThan(1e-9)
    expect(worstM(mm, (x) => {
      const lo = Math.max(a, x)
      return lo >= b ? 0 : -w * (b - lo) * ((lo + b) / 2 - x)
    })).toBeLessThan(1e-9)
    // beyond the loaded length the shear is zero, not a residue of the sweep
    const past = mm.xs.map((x, k) => (x > b + 1e-9 ? Math.abs(mm.Vy[k]) : 0))
    expect(Math.max(...past)).toBeLessThan(1e-9)
  })

  it('superposes segments — two part-span loads add, they do not interfere', () => {
    const w = 9
    const one = diag({ kind: 'member-vdl', member: 'm', x1: 0, x2: L / 2, w1: -w, w2: -w, cat: 'D' })
    const two = diag({ kind: 'member-vdl', member: 'm', x1: L / 2, x2: L, w1: -w, w2: -w, cat: 'D' })
    const both = diag({ kind: 'member-udl', member: 'm', w: -w, cat: 'D' })
    // the two halves at their common stations must sum to the full-span answer
    for (const x of [0, 1, 2, 3, 4, 5, 6]) {
      const at = (mm: typeof one) => {
        const k = mm.xs.findIndex((v) => Math.abs(v - x) < 1e-6)
        return k >= 0 ? mm.Mz[k] : NaN
      }
      expect(at(one) + at(two)).toBeCloseTo(at(both), 8)
    }
  })
})

describe('solveWithGeometry — recovering only the members a caller reads', () => {
  // Recovering a member's diagrams is the expensive half of a load case. Some
  // runs are read only for their reactions (the service run) or only for the
  // flexural members' moment diagrams (the D-only and L-only runs), and a
  // filter lets those runs stop producing what nothing looks at.
  const rsec = { E: 200e6, G: 77e6, A: 0.01, Iy: 1e-4, Iz: 1e-4, J: 2e-4 }
  const rnodes: F3Node[] = [
    { id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 0, y: 3, z: 0 },
    { id: 'c', x: 6, y: 3, z: 0 }, { id: 'd', x: 6, y: 0, z: 0 },
  ]
  const rmembers: F3Member[] = [
    { id: 'colL', i: 'a', j: 'b', ...rsec },
    { id: 'beam', i: 'b', j: 'c', ...rsec },
    { id: 'colR', i: 'd', j: 'c', ...rsec },
  ]
  const rsupports: F3Support[] = [{ node: 'a', fixity: 'fixed' }, { node: 'd', fixity: 'fixed' }]
  // positive w acts along −global Y in this engine: 20 kN/m downward
  const rloads: F3Load[] = [{ kind: 'member-udl', member: 'beam', w: 20, cat: 'D' }]
  const rprecomp = precomputeFrame(rnodes, rmembers, rsupports)

  it('an omitted filter recovers every member, exactly as before', () => {
    const r = solveWithGeometry(rprecomp, rloads)!
    expect(r.members.map((m) => m.id)).toEqual(['colL', 'beam', 'colR'])
  })

  it('a filter recovers exactly its members, and their results are unchanged', () => {
    const all = solveWithGeometry(rprecomp, rloads)!
    const some = solveWithGeometry(rprecomp, rloads, undefined, new Set(['beam']))!
    expect(some.members.map((m) => m.id)).toEqual(['beam'])
    // recovery is strictly downstream of the solve, so the member that WAS
    // recovered must be identical to its unfiltered self
    expect(some.members[0]).toEqual(all.members.find((m) => m.id === 'beam'))
  })

  it('an EMPTY filter recovers nothing but leaves the solve untouched', () => {
    const all = solveWithGeometry(rprecomp, rloads)!
    const none = solveWithGeometry(rprecomp, rloads, undefined, new Set<string>())!
    expect(none.members).toEqual([])
    // displacements and reactions are what such a run is for — identical
    expect(none.d).toEqual(all.d)
    expect(none.reactions).toEqual(all.reactions)
    // and equilibrium still closes on them
    expect(none.reactions.reduce((t, r) => t + r.F[1], 0)).toBeCloseTo(20 * 6, 6)
  })

  it('the envelopes describe the members actually recovered', () => {
    const none = solveWithGeometry(rprecomp, rloads, undefined, new Set<string>())!
    expect([none.Mmax, none.Vmax, none.Nmax]).toEqual([0, 0, 0])
    const beamOnly = solveWithGeometry(rprecomp, rloads, undefined, new Set(['beam']))!
    expect(beamOnly.Mmax).toBeCloseTo(Math.max(...beamOnly.members[0].Mz.map(Math.abs)), 9)
  })
})
