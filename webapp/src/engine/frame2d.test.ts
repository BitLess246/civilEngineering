import { describe, it, expect } from 'vitest'
import { solveFrame2D, analyzeFrame2D, type FNode, type FMember, type FSupport, type FLoad } from './frame2d'
import { solveFEM } from './beamAnalysis'

const E = 25000      // MPa
const A = 250 * 500  // mm²
const I = 3.125e9    // mm⁴ → EI = 78,125 kN·m²
const EI = E * I * 1e-9
const EA = (E * A) / 1000

const sec = { E, A, I }

describe('frame2d — regression vs the beam solver', () => {
  it('horizontal member, SS + UDL: reactions wL/2, member Mmax = wL²/8', () => {
    const L = 6, w = 10
    const nodes: FNode[] = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: L, y: 0 }]
    const members: FMember[] = [{ id: 'm', i: 'a', j: 'b', ...sec }]
    const supports: FSupport[] = [{ node: 'a', type: 'pin' }, { node: 'b', type: 'roller' }]
    const loads: FLoad[] = [{ kind: 'member-udl', member: 'm', w, cat: 'D' }]
    const r = solveFrame2D(nodes, members, supports, loads)!
    expect(r.reactions[0].Ry).toBeCloseTo((w * L) / 2, 6)
    expect(r.reactions[1].Ry).toBeCloseTo((w * L) / 2, 6)
    expect(r.members[0].Mmax).toBeCloseTo((w * L * L) / 8, 3)

    const beam = solveFEM(
      [{ type: 'pin', x: 0 }, { type: 'roller', x: L }],
      [{ type: 'udl', x1: 0, x2: L, w, cat: 'D' }], L, E, I)!
    expect(r.members[0].Mmax).toBeCloseTo(beam.Mmax, 2)
  })

  it('midspan point load: Mmax = PL/4, matches solveFEM', () => {
    const L = 6, P = 50
    const r = solveFrame2D(
      [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: L, y: 0 }],
      [{ id: 'm', i: 'a', j: 'b', ...sec }],
      [{ node: 'a', type: 'pin' }, { node: 'b', type: 'roller' }],
      [{ kind: 'member-point', member: 'm', a: L / 2, P, cat: 'D' }])!
    expect(r.members[0].Mmax).toBeCloseTo((P * L) / 4, 3)
    const beam = solveFEM(
      [{ type: 'pin', x: 0 }, { type: 'roller', x: L }],
      [{ type: 'point', x: L / 2, P, cat: 'D' }], L, E, I)!
    expect(r.members[0].Mmax).toBeCloseTo(beam.Mmax, 2)
  })
})

describe('frame2d — orientation (vertical members)', () => {
  it('cantilever column + horizontal tip load: δ = PL³/3EI, Mbase = PL', () => {
    const H = 3, P = 20
    const r = solveFrame2D(
      [{ id: 'base', x: 0, y: 0 }, { id: 'top', x: 0, y: H }],
      [{ id: 'c', i: 'base', j: 'top', ...sec }],
      [{ node: 'base', type: 'fixed' }],
      [{ kind: 'node', node: 'top', Fx: P, Fy: 0, Mz: 0, cat: 'D' }])!
    // top node is index 1 → dof 3 (x-translation)
    expect(r.d[3]).toBeCloseTo((P * H ** 3) / (3 * EI), 9)
    expect(Math.abs(r.reactions[0].Rm)).toBeCloseTo(P * H, 6)
    expect(r.reactions[0].Rx).toBeCloseTo(-P, 6)
    expect(r.members[0].Mmax).toBeCloseTo(P * H, 3)
  })

  it('axial column: δ = PL/EA, N = −P (compression)', () => {
    const H = 3, P = 100
    const r = solveFrame2D(
      [{ id: 'base', x: 0, y: 0 }, { id: 'top', x: 0, y: H }],
      [{ id: 'c', i: 'base', j: 'top', ...sec }],
      [{ node: 'base', type: 'fixed' }],
      [{ kind: 'node', node: 'top', Fx: 0, Fy: -P, Mz: 0, cat: 'D' }])!
    expect(r.d[4]).toBeCloseTo((-P * H) / EA, 9)
    expect(r.members[0].N[0]).toBeCloseTo(-P, 6)
    expect(r.reactions[0].Ry).toBeCloseTo(P, 6)
  })
})

describe('frame2d — portal frame', () => {
  it('pinned-base portal with beam UDL: equilibrium + symmetry', () => {
    const L = 6, H = 3, w = 12
    const nodes: FNode[] = [
      { id: 'A', x: 0, y: 0 }, { id: 'B', x: 0, y: H },
      { id: 'C', x: L, y: H }, { id: 'D', x: L, y: 0 },
    ]
    const members: FMember[] = [
      { id: 'col1', i: 'A', j: 'B', ...sec },
      { id: 'beam', i: 'B', j: 'C', ...sec },
      { id: 'col2', i: 'D', j: 'C', ...sec },
    ]
    const supports: FSupport[] = [{ node: 'A', type: 'pin' }, { node: 'D', type: 'pin' }]
    const loads: FLoad[] = [{ kind: 'member-udl', member: 'beam', w, cat: 'D' }]
    const r = solveFrame2D(nodes, members, supports, loads)!
    const RyA = r.reactions[0].Ry, RyD = r.reactions[1].Ry
    expect(RyA + RyD).toBeCloseTo(w * L, 4)
    expect(RyA).toBeCloseTo(RyD, 4)                       // symmetry
    expect(r.reactions[0].Rx).toBeCloseTo(-r.reactions[1].Rx, 4)  // thrust pair
    expect(Math.abs(r.reactions[0].Rx)).toBeGreaterThan(0.1)      // frame action exists
    // beam end (corner) moment equals the column top moment (joint equilibrium)
    const beam = r.members.find((m) => m.id === 'beam')!
    const col = r.members.find((m) => m.id === 'col1')!
    expect(Math.abs(beam.M[0])).toBeCloseTo(Math.abs(col.M[col.M.length - 1]), 3)
  })
})

describe('frame2d — NSCP combinations', () => {
  it('runs all 7; 1.2D + 1.6L governs for D+L loading', () => {
    const nodes: FNode[] = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 6, y: 0 }]
    const members: FMember[] = [{ id: 'm', i: 'a', j: 'b', ...sec }]
    const supports: FSupport[] = [{ node: 'a', type: 'pin' }, { node: 'b', type: 'roller' }]
    const loads: FLoad[] = [
      { kind: 'member-udl', member: 'm', w: 8, cat: 'D' },
      { kind: 'member-udl', member: 'm', w: 5, cat: 'L' },
    ]
    const res = analyzeFrame2D(nodes, members, supports, loads)!
    expect(res.perCombo).toHaveLength(7)
    expect(res.perCombo[res.govIdx].combo.name).toContain('1.2D + 1.6L')
    const wu = 1.2 * 8 + 1.6 * 5
    expect(res.perCombo[res.govIdx].result!.Mmax).toBeCloseTo((wu * 36) / 8, 2)
  })
})
