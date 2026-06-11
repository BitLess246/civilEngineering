import { describe, it, expect } from 'vitest'
import { solveFEM, analyzeBeam, threeMoment, type Support, type BeamLoad } from './beamAnalysis'

const E = 25000      // MPa
const I = 3.125e9    // mm⁴ (≈ 250×500 gross)
const EI = E * I * 1e-9  // kN·m²

describe('FEM — closed-form checks', () => {
  it('simply supported + UDL: R = wL/2, Mmax = wL²/8, δmax = 5wL⁴/384EI', () => {
    const L = 6, w = 10
    const supports: Support[] = [{ type: 'pin', x: 0 }, { type: 'roller', x: L }]
    const loads: BeamLoad[] = [{ type: 'udl', x1: 0, x2: L, w, cat: 'D' }]
    const r = solveFEM(supports, loads, L, E, I)!
    expect(r.reactions[0].Rv).toBeCloseTo((w * L) / 2, 3)
    expect(r.reactions[1].Rv).toBeCloseTo((w * L) / 2, 3)
    expect(r.Mmax).toBeCloseTo((w * L * L) / 8, 2)
    expect(r.Dmax).toBeCloseTo(((5 * w * L ** 4) / (384 * EI)) * 1000, 2)  // mm
  })

  it('simply supported + midspan point: Mmax = PL/4, δmax = PL³/48EI', () => {
    const L = 6, P = 50
    const r = solveFEM(
      [{ type: 'pin', x: 0 }, { type: 'roller', x: L }],
      [{ type: 'point', x: L / 2, P, cat: 'D' }], L, E, I)!
    expect(r.Mmax).toBeCloseTo((P * L) / 4, 2)
    expect(r.Dmax).toBeCloseTo(((P * L ** 3) / (48 * EI)) * 1000, 2)
  })

  it('cantilever + tip point: R = P, Mfix = −PL, δtip = PL³/3EI', () => {
    const L = 3, P = 20
    const r = solveFEM([{ type: 'fixed', x: 0 }], [{ type: 'point', x: L, P, cat: 'D' }], L, E, I)!
    expect(r.reactions[0].Rv).toBeCloseTo(P, 3)
    expect(Math.abs(r.reactions[0].Rm)).toBeCloseTo(P * L, 2)
    expect(r.Dmax).toBeCloseTo(((P * L ** 3) / (3 * EI)) * 1000, 1)
  })

  it('spring support: R = k·δ at the spring', () => {
    const L = 6, P = 50, k = 5000
    const r = solveFEM(
      [{ type: 'pin', x: 0 }, { type: 'spring', x: L, k }],
      [{ type: 'point', x: L / 2, P, cat: 'D' }], L, E, I)!
    const spring = r.reactions.find((s) => s.type === 'spring')!
    const delta = -r.D[r.xs.length - 1] / 1000   // m, downward positive load → negative D
    expect(spring.Rv).toBeCloseTo(k * -delta * -1, 1) // R = k·d (sign convention of solver)
    // equilibrium: ΣR = P
    expect(r.reactions.reduce((a, s) => a + s.Rv, 0)).toBeCloseTo(P, 3)
  })

  it('VDL (triangular 0→w): W = wL/2, Ra = wL/6 (resultant at 2L/3)', () => {
    const L = 6, w = 12
    const r = solveFEM(
      [{ type: 'pin', x: 0 }, { type: 'roller', x: L }],
      [{ type: 'vdl', x1: 0, x2: L, w1: 0, w2: w, cat: 'D' }], L, E, I)!
    expect(r.reactions[0].Rv).toBeCloseTo((w * L) / 6, 2)
    expect(r.reactions[1].Rv).toBeCloseTo((w * L) / 3, 2)
  })
})

describe('three-moment theorem', () => {
  it('two equal spans, UDL: interior moment = −wL²/8', () => {
    const L = 4, w = 10
    const lds: BeamLoad[] = [{ type: 'udl', x1: 0, x2: L, w, cat: 'D' }]
    const r = threeMoment([L, L], [lds, lds])!
    expect(r.supportMoments[1]).toBeCloseTo((-w * L * L) / 8, 1)
    // total reactions balance the load
    expect(r.reactions.reduce((a, v) => a + v, 0)).toBeCloseTo(2 * w * L, 3)
  })
})

describe('analyzeBeam — NSCP combinations', () => {
  const supports: Support[] = [{ type: 'pin', x: 0 }, { type: 'roller', x: 6 }]
  const loads: BeamLoad[] = [
    { type: 'udl', x1: 0, x2: 6, w: 8, cat: 'D' },
    { type: 'udl', x1: 0, x2: 6, w: 5, cat: 'L' },
  ]

  it('runs all 7 combos; 1.2D+1.6L governs for D+L loading', () => {
    const res = analyzeBeam(supports, loads, 6, E, I)!
    expect(res.perCombo).toHaveLength(7)
    expect(res.perCombo[res.govIdx].combo.name).toContain('1.2D + 1.6L')
    const wu = 1.2 * 8 + 1.6 * 5    // 17.6
    expect(res.perCombo[res.govIdx].result!.Mmax).toBeCloseTo((wu * 36) / 8, 1)
  })

  it('TMT check appears for a 3-support continuous beam and matches FEM', () => {
    const cont: Support[] = [{ type: 'pin', x: 0 }, { type: 'roller', x: 3 }, { type: 'roller', x: 6 }]
    const res = analyzeBeam(cont, [{ type: 'udl', x1: 0, x2: 6, w: 10, cat: 'D' }], 6, E, I)!
    expect(res.tmt).not.toBeNull()
    const gov = res.perCombo[res.govIdx].result!
    // FEM reactions ≈ TMT reactions
    res.tmt!.reactions.forEach((R, i) => expect(gov.reactions[i].Rv).toBeCloseTo(R, 1))
    // interior support moment ≈ −wu·l²/8 with l = 3 (equal spans, w = 14)
    const wu = 1.4 * 10
    expect(res.tmt!.supportMoments[1]).toBeCloseTo((-wu * 9) / 8, 1)
  })

  it('TMT is suppressed when a fixed or spring support exists', () => {
    const withFixed: Support[] = [{ type: 'fixed', x: 0 }, { type: 'roller', x: 3 }, { type: 'roller', x: 6 }]
    const res = analyzeBeam(withFixed, [{ type: 'udl', x1: 0, x2: 6, w: 10, cat: 'D' }], 6, E, I)!
    expect(res.tmt).toBeNull()
  })
})
