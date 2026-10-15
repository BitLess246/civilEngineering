import { describe, it, expect } from 'vitest'
import { solveFEM, analyzeBeam, threeMoment, loadsOffBeam, nscpCombos, NSCP_COMBOS, applyCombo, spansToSegments, type Support, type BeamLoad, type BeamSegment } from './beamAnalysis'

describe('NSCP §203.3.1 — f₁ live-load factor', () => {
  it('f₁ scales L in eqs 203-3/4/5 only; default export is the 1.0 set', () => {
    const c1 = nscpCombos(1.0), c05 = nscpCombos(0.5)
    expect(c1).toHaveLength(8)   // 203-3 is two alternatives
    expect(c05[1].f.L).toBe(1.6)                         // 203-2 always 1.6L
    expect(c1[2].f.L).toBe(1.0); expect(c05[2].f.L).toBe(0.5)   // 203-3
    expect(c1[3].f.L).toBe(1.0); expect(c05[3].f.L).toBe(0.5)   // 203-4
    expect(c1[5].f.L).toBe(1.0); expect(c05[5].f.L).toBe(0.5)   // 203-5 (seismic)
    expect(c05[4].f.L).toBeUndefined()                  // 203-6 (0.9D+1.0W) has no L
    expect(NSCP_COMBOS[2].f.L).toBe(1.0)                // conservative default
  })

  it('self-straining T (§203.3.3 / ASCE 7-16 §2.3.4) rides at 1.2 with factored D, omitted from 0.9D uplift', () => {
    const c = nscpCombos(1.0)
    // present in every combo that carries the factored dead load (203-1…203-5)
    for (const i of [0, 1, 2, 3, 5]) expect(c[i].f.T).toBe(1.2)
    // excluded from the 0.9D uplift combos (203-6, 203-7) so it can't relieve
    expect(c[4].f.T).toBeUndefined()                    // 0.9D + 1.0W
    expect(c[6].f.T).toBeUndefined()                    // 0.9D + 1.0E
    // a T load is scaled, not dropped, under a gravity combo…
    const t: BeamLoad = { type: 'udl', x1: 0, x2: 6, w: 10, cat: 'T' }
    expect(applyCombo([t], c[1].f)[0]).toMatchObject({ w: 12 })   // 1.2 × 10
    // …and dropped under 0.9D + 1.0W (no T factor → ×0 → filtered out)
    expect(applyCombo([t], c[4].f)).toHaveLength(0)
  })
})

const E = 25000      // MPa
const I = 3.125e9    // mm⁴ (≈ 250×500 gross)
const EI = E * I * 1e-9  // kN·m²

describe('NSCP §203.3.1 — exact combination set (audit CODE-02)', () => {
  // Pins every factor and every combination's MEMBERSHIP, not just the count:
  // a dropped T or a 0.5 where 1.0 belongs changes no length assertion.
  const expected = (f1: number) => [
    { D: 1.4, T: 1.2 },                                                 // 203-1
    { D: 1.2, L: 1.6, Lr: 0.5, S: 0.5, R: 0.5, T: 1.2 },                // 203-2
    { D: 1.2, Lr: 1.6, S: 1.6, R: 1.6, L: f1, T: 1.2 },                 // 203-3 (f₁L)
    { D: 1.2, W: 1.0, L: f1, Lr: 0.5, S: 0.5, R: 0.5, T: 1.2 },         // 203-4
    { D: 0.9, W: 1.0 },                                                 // 203-6
    { D: 1.2, E: 1.0, L: f1, S: 0.2, T: 1.2 },                          // 203-5
    { D: 0.9, E: 1.0 },                                                 // 203-7
    { D: 1.2, Lr: 1.6, S: 1.6, R: 1.6, W: 0.5, T: 1.2 },                // 203-3 (0.5W)
  ]
  for (const f1 of [1.0, 0.5])
    it(`f₁ = ${f1}: every factor of every combination`, () => {
      expect(nscpCombos(f1).map((c) => c.f)).toEqual(expected(f1))
    })
  it('203-3 is two alternatives — 0.5W never rides with L (it would relieve it)', () => {
    const c = nscpCombos(1.0).filter((x) => x.name.startsWith('1.2D + 1.6(Lr|S|R)'))
    expect(c).toHaveLength(2)
    expect(c.filter((x) => x.f.W).every((x) => !x.f.L)).toBe(true)
  })
  it('every lateral combo has its 0.9D counter-gravity partner (203-6, 203-7)', () => {
    const c = nscpCombos(1.0)
    for (const k of ['E', 'W'] as const)
      expect(c.some((x) => x.f.D === 0.9 && x.f[k] === 1.0 && Object.keys(x.f).length === 2)).toBe(true)
  })
})

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

  it('runs all 8 combos; 1.2D+1.6L governs for D+L loading', () => {
    const res = analyzeBeam(supports, loads, 6, E, I)!
    expect(res.perCombo).toHaveLength(8)
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

describe('multiple spans with their own E and I', () => {
  // span 1: E, I · span 2: same E, 3I — stiff second span
  const L = 5, w = 12
  const segs = spansToSegments([{ L, E, I }, { L, E, I: 3 * I }])

  it('spansToSegments lays spans end to end from x = 0', () => {
    expect(segs).toEqual([{ x0: 0, x1: 5, E, I }, { x0: 5, x1: 10, E, I: 3 * I }])
  })

  it('uniform segments reproduce the single-EI beam exactly', () => {
    const sup: Support[] = [{ type: 'pin', x: 0 }, { type: 'roller', x: 5 }, { type: 'roller', x: 10 }]
    const lds: BeamLoad[] = [{ type: 'udl', x1: 0, x2: 10, w, cat: 'D' }]
    const a = solveFEM(sup, lds, 10, E, I)!
    const b = solveFEM(sup, lds, 10, E, I, spansToSegments([{ L, E, I }, { L, E, I }]))!
    expect(b.Dmax).toBeCloseTo(a.Dmax, 9)
    expect(b.reactions.map((r) => r.Rv)).toEqual(a.reactions.map((r) => expect.closeTo(r.Rv, 9)))
  })

  it('two-segment cantilever: δtip = P(L³ − b³)/3EI₁ + P·b³/3EI₂ (virtual work)', () => {
    const a = 2, b = 3, Lc = a + b, P = 20
    const sg: BeamSegment[] = [{ x0: 0, x1: a, E, I: 2 * I }, { x0: a, x1: Lc, E, I }]
    const r = solveFEM([{ type: 'fixed', x: 0 }], [{ type: 'point', x: Lc, P, cat: 'D' }], Lc, E, I, sg)!
    const EI1 = (E * 2 * I) * 1e-9, EI2 = (E * I) * 1e-9
    const tip = (P * (Lc ** 3 - b ** 3)) / (3 * EI1) + (P * b ** 3) / (3 * EI2)
    expect(r.Dmax).toBeCloseTo(tip * 1000, 2)
    // statics do not care about stiffness
    expect(r.reactions[0].Rv).toBeCloseTo(P, 6)
  })

  it('two spans, UDL on span 1 only: M_B = −wL²/(8(1 + I₁/I₂)) — FEM and three-moment agree', () => {
    // generalized Clapeyron, equal spans: 2M_B(L/EI₁ + L/EI₂) = −wL³/(4EI₁)
    const MB = (-w * L * L) / (8 * (1 + I / (3 * I)))           // = −3wL²/32
    const sup: Support[] = [{ type: 'pin', x: 0 }, { type: 'roller', x: L }, { type: 'roller', x: 2 * L }]
    const lds: BeamLoad[] = [{ type: 'udl', x1: 0, x2: L, w, cat: 'D' }]
    const tmt = threeMoment([L, L], [lds, []], [E * I * 1e-9, E * 3 * I * 1e-9])!
    expect(tmt.supportMoments[1]).toBeCloseTo(MB, 2)
    const fem = solveFEM(sup, lds, 2 * L, E, I, segs)!
    const k = fem.xs.findIndex((x) => Math.abs(x - L) < 1e-9)
    expect(fem.M[k]).toBeCloseTo(MB, 1)
    // and the stiffer span 2 attracts more moment than equal sections would (−wL²/16)
    expect(Math.abs(MB)).toBeGreaterThan((w * L * L) / 16)
  })

  it('analyzeBeam runs the three-moment check with per-span EI, and skips it when EI changes inside a span', () => {
    const sup: Support[] = [{ type: 'pin', x: 0 }, { type: 'roller', x: L }, { type: 'roller', x: 2 * L }]
    const lds: BeamLoad[] = [{ type: 'udl', x1: 0, x2: L, w, cat: 'D' }]
    const res = analyzeBeam(sup, lds, 2 * L, E, I, segs)!
    expect(res.tmt!.supportMoments[1] / 1.4).toBeCloseTo((-w * L * L) / (8 * (1 + 1 / 3)), 1)   // 1.4D governs
    const mid = analyzeBeam(sup, lds, 2 * L, E, I, [{ x0: 0, x1: 2.5, E, I }, { x0: 2.5, x1: 10, E, I: 2 * I }])!
    expect(mid.tmt).toBeNull()
  })
})

describe('regressions found by the hand derivation (Oct 2026)', () => {
  it('an applied couple (counter-clockwise +) closes the moment diagram: M(L) = 0', () => {
    const L = 6, C = 10
    const r = solveFEM([{ type: 'pin', x: 0 }, { type: 'roller', x: L }], [{ type: 'moment', x: 3, M: C, cat: 'D' }], L, E, I)!
    // ↺ about A: 6·R_B + C = 0 → R_B = −C/6, R_A = +C/6
    expect(r.reactions[1].Rv).toBeCloseTo(-C / L, 6)
    expect(r.M[r.M.length - 1]).toBeCloseTo(0, 6)
    // just left of the couple M = R_A·3 = +5, just right 5 − 10 = −5
    const k = r.xs.findIndex((x) => x > 3)
    expect(r.M[k]).toBeCloseTo(-C / 2, 2)
  })

  it('an INTERIOR spring pushes up: R = (5wL⁴/384EI)/(L³/48EI + 1/k)', () => {
    const L = 10, w = 12, k = 4000, EI = E * I * 1e-9
    const r = solveFEM([{ type: 'pin', x: 0 }, { type: 'spring', x: 5, k }, { type: 'roller', x: L }], [{ type: 'udl', x1: 0, x2: L, w, cat: 'D' }], L, E, I)!
    const R = ((5 * w * L ** 4) / (384 * EI)) / (L ** 3 / (48 * EI) + 1 / k)
    expect(r.reactions[1].Rv).toBeCloseTo(R, 2)
    expect(r.reactions[0].Rv).toBeCloseTo((w * L - R) / 2, 2)
  })

  it('Vmax is read at the support face, not 0.02 m off it', () => {
    const L = 5, w = 12
    const r = solveFEM([{ type: 'pin', x: 0 }, { type: 'roller', x: L }], [{ type: 'udl', x1: 0, x2: L, w, cat: 'D' }], L, E, I)!
    expect(r.Vmax).toBeCloseTo((w * L) / 2, 2)
  })

  it('three-moment check: overhang loads and a point load ON an interior support', () => {
    const sup: Support[] = [{ type: 'pin', x: 1 }, { type: 'roller', x: 5 }, { type: 'roller', x: 9 }]
    for (const lds of [
      [{ type: 'udl', x1: 0, x2: 10, w: 10, cat: 'D' }],
      [{ type: 'udl', x1: 1, x2: 9, w: 10, cat: 'D' }, { type: 'point', x: 5, P: 50, cat: 'D' }],
    ] as BeamLoad[][]) {
      const res = analyzeBeam(sup, lds, 10, E, I)!
      const gov = res.perCombo[res.govIdx].result!
      res.tmt!.reactions.forEach((R, i) => expect(R).toBeCloseTo(gov.reactions[i].Rv, 1))
    }
  })
})

describe('loads past the beam end (a span shortened under them)', () => {
  it('only the part on the beam is analysed, so V and M close at the free end', () => {
    const sup: Support[] = [{ type: 'pin', x: 0 }, { type: 'roller', x: 6 }, { type: 'roller', x: 8 }]
    const off: BeamLoad[] = [{ type: 'udl', x1: 0, x2: 12, w: 8, cat: 'D' }, { type: 'point', x: 11, P: 30, cat: 'D' }]
    const on: BeamLoad[] = [{ type: 'udl', x1: 0, x2: 10, w: 8, cat: 'D' }]
    expect(loadsOffBeam(off, 10)).toBe(true)
    expect(loadsOffBeam(on, 10)).toBe(false)
    const a = analyzeBeam(sup, off, 10, E, I)!.perCombo[0].result!
    const b = analyzeBeam(sup, on, 10, E, I)!.perCombo[0].result!
    expect(a.V.at(-1)).toBeCloseTo(0, 6)   // was +1.4·8·2 = 22.4 kN: the 2 m hanging past the end
    expect(a.M.at(-1)).toBeCloseTo(0, 6)
    a.reactions.forEach((r, i) => expect(r.Rv).toBeCloseTo(b.reactions[i].Rv, 9))
  })
})
