import { describe, it, expect } from 'vitest'
import { solveFrame3D, analyzeFrame3D, rectJ, precomputeFrame, solveWithGeometry, serializePrecomp, deserializePrecomp, appliedResultant, type F3Node, type F3Member, type F3Support, type F3Load, type F3DiaphragmGroup } from './frame3d'
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
