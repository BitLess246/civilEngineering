import { describe, it, expect } from 'vitest'
import { deriveBeam } from './beamDerivation'
import { solveFEM, spansToSegments, type Support, type BeamLoad, type BeamSegment } from './beamAnalysis'
import { lineText } from '../lib/solution'

const E = 25000, I = 3.125e9           // MPa, mm⁴ → EI = 78 125 kN·m²
const EI = E * I * 1e-9

/** Run the hand derivation beside the FEM and hold them together. */
function both(sup: Support[], lds: BeamLoad[], L: number, segs?: BeamSegment[]) {
  const fem = solveFEM(sup, lds, L, E, I, segs)!
  const d = deriveBeam(sup, lds, L, E, I, segs, 'test', fem.reactions)
  return { fem, d }
}
function agree({ fem, d }: ReturnType<typeof both>, tolR = 0.05) {
  d.reactions.forEach((r, i) => {
    expect(r.Rv).toBeCloseTo(fem.reactions[i].Rv, 1)
    expect(Math.abs(r.Rm - fem.reactions[i].Rm)).toBeLessThan(tolR + 1e-3 * Math.abs(fem.reactions[i].Rm))
  })
  expect(Math.abs(d.Mpeak.M)).toBeCloseTo(fem.Mmax, 1)
  expect(Math.abs(d.Vpeak.V)).toBeCloseTo(fem.Vmax, 1)
  expect(Math.abs(d.Dpeak.y)).toBeCloseTo(fem.Dmax, 1)
}
const text = (d: ReturnType<typeof deriveBeam>) => d.steps.flatMap((s) => s.lines.map(lineText)).join('\n')

describe('statics — determinate beams', () => {
  it('simple span, UDL: R = wL/2, M = wL²/8 at midspan, δ = 5wL⁴/384EI', () => {
    const L = 6, w = 17.6
    const r = both([{ type: 'pin', x: 0 }, { type: 'roller', x: L }], [{ type: 'udl', x1: 0, x2: L, w, cat: 'D' }], L)
    expect(r.d.method).toBe('statics')
    expect(r.d.reactions[0].Rv).toBeCloseTo((w * L) / 2, 9)
    expect(r.d.Mpeak.M).toBeCloseTo((w * L * L) / 8, 9)
    expect(r.d.Mpeak.x).toBeCloseTo(L / 2, 9)
    expect(r.d.Dpeak.y).toBeCloseTo((-5 * w * L ** 4) / (384 * EI) * 1000, 6)
    agree(r)
    // the worked lines carry the hand numbers
    expect(text(r.d)).toContain('R_B = 52.80')
    expect(text(r.d)).toContain('V = 0 \\text{ at } x = 3.00')
  })

  it('cantilever, tip load: M_A = −PL, δ = PL³/3EI', () => {
    const L = 3, P = 20
    const r = both([{ type: 'fixed', x: 0 }], [{ type: 'point', x: L, P, cat: 'D' }], L)
    expect(r.d.reactions[0]).toMatchObject({ Rv: P, Rm: -P * L })
    expect(r.d.Dpeak.y).toBeCloseTo((-P * L ** 3) / (3 * EI) * 1000, 9)
    agree(r)
  })

  it('overhang, VDL and an applied couple — reactions by ΣM and ΣFy', () => {
    const sup: Support[] = [{ type: 'pin', x: 0 }, { type: 'roller', x: 5 }]
    const lds: BeamLoad[] = [
      { type: 'vdl', x1: 0, x2: 5, w1: 0, w2: 12, cat: 'D' },
      { type: 'point', x: 7, P: 15, cat: 'D' },
      { type: 'moment', x: 2, M: 10, cat: 'D' },
    ]
    const r = both(sup, lds, 7)
    // ↺ about A, the couple counter-clockwise +: R_B·5 − 30·(10/3) − 15·7 + 10 = 0
    expect(r.d.reactions[1].Rv).toBeCloseTo((30 * 10 / 3 + 15 * 7 - 10) / 5, 9)
    agree(r)
  })

  it('beam on a pin and a spring: the spring moves by R/k', () => {
    const L = 6, P = 50, k = 5000
    const r = both([{ type: 'pin', x: 0 }, { type: 'spring', x: L, k }], [{ type: 'point', x: L / 2, P, cat: 'D' }], L)
    expect(r.d.reactions[1].Rv).toBeCloseTo(P / 2, 9)
    // the spring end settles by R/k — the condition that fixes y₀, θ₀
    expect(r.fem.D[r.fem.D.length - 1]).toBeCloseTo((-P / 2 / k) * 1000, 3)
    expect(text(r.d)).toContain('(= -R_B/k)')
    agree(r)
  })
})

describe('three-moment equation — continuous beams', () => {
  it('two equal spans, UDL: M_B = −wL²/8, R = 3wL/8, 10wL/8, 3wL/8', () => {
    const L = 4, w = 10
    const r = both([{ type: 'pin', x: 0 }, { type: 'roller', x: L }, { type: 'roller', x: 2 * L }], [{ type: 'udl', x1: 0, x2: 2 * L, w, cat: 'D' }], 2 * L)
    expect(r.d.method).toBe('three-moment')
    expect(r.d.reactions.map((q) => q.Rv)).toEqual([3, 10, 3].map((c) => expect.closeTo((c * w * L) / 8, 6)))
    expect(text(r.d)).toContain('M_B = -20.00')
    agree(r)
  })

  it('per-span EI: M_B = −wL²/(8(1 + I₁/I₂)) with the load on span 1 only', () => {
    const L = 5, w = 12
    const segs = spansToSegments([{ L, E, I }, { L, E, I: 3 * I }])
    const r = both([{ type: 'pin', x: 0 }, { type: 'roller', x: L }, { type: 'roller', x: 2 * L }], [{ type: 'udl', x1: 0, x2: L, w, cat: 'D' }], 2 * L, segs)
    expect(r.d.method).toBe('three-moment')
    const MB = (-w * L * L) / (8 * (1 + 1 / 3))
    expect(text(r.d)).toContain(`M_B = ${MB.toFixed(2)}`)
    agree(r)
  })

  it('overhangs and a point load on the interior support', () => {
    const sup: Support[] = [{ type: 'pin', x: 1 }, { type: 'roller', x: 5 }, { type: 'roller', x: 9 }]
    const lds: BeamLoad[] = [{ type: 'udl', x1: 0, x2: 10, w: 14, cat: 'D' }, { type: 'point', x: 5, P: 30, cat: 'D' }]
    const r = both(sup, lds, 10)
    expect(r.d.method).toBe('three-moment')
    expect(r.d.reactions.reduce((a, q) => a + q.Rv, 0)).toBeCloseTo(14 * 10 + 30, 6)
    agree(r)
  })

  it('four unequal spans, mixed loads', () => {
    const sup: Support[] = [0, 3, 8, 12, 14].map((x, i) => ({ type: i ? 'roller' : 'pin', x }))
    const lds: BeamLoad[] = [
      { type: 'udl', x1: 0, x2: 14, w: 9, cat: 'D' },
      { type: 'point', x: 6, P: 40, cat: 'D' },
      { type: 'vdl', x1: 8, x2: 12, w1: 0, w2: 20, cat: 'D' },
    ]
    agree(both(sup, lds, 14))
  })
})

describe('force method — fixed ends, springs, EI changing inside a span', () => {
  it('propped cantilever, UDL: R_B = 3wL/8, M_A = −wL²/8', () => {
    const L = 6, w = 10
    const r = both([{ type: 'fixed', x: 0 }, { type: 'roller', x: L }], [{ type: 'udl', x1: 0, x2: L, w, cat: 'D' }], L)
    expect(r.d.method).toBe('force')
    expect(r.d.reactions[1].Rv).toBeCloseTo((3 * w * L) / 8, 6)
    expect(r.d.reactions[0].Rm).toBeCloseTo((-w * L * L) / 8, 6)
    agree(r)
  })

  it('fixed–fixed, central point: M_end = PL/8, M_mid = PL/8, δ = PL³/192EI', () => {
    const L = 8, P = 60
    const r = both([{ type: 'fixed', x: 0 }, { type: 'fixed', x: L }], [{ type: 'point', x: L / 2, P, cat: 'D' }], L)
    expect(r.d.method).toBe('force')
    expect(Math.abs(r.d.reactions[0].Rm)).toBeCloseTo((P * L) / 8, 6)
    expect(r.d.Mpeak.x === 0 || r.d.Mpeak.x === L / 2 || r.d.Mpeak.x === L).toBe(true)
    expect(Math.abs(r.d.Mpeak.M)).toBeCloseTo((P * L) / 8, 6)
    expect(r.d.Dpeak.y).toBeCloseTo((-P * L ** 3) / (192 * EI) * 1000, 6)
    agree(r)
  })

  it('interior spring support between two pins', () => {
    const L = 10, w = 12, k = 4000
    const r = both([{ type: 'pin', x: 0 }, { type: 'spring', x: 5, k }, { type: 'roller', x: L }], [{ type: 'udl', x1: 0, x2: L, w, cat: 'D' }], L)
    expect(r.d.method).toBe('force')
    // closed form: R = (5wL⁴/384EI) / (L³/48EI + 1/k)
    const R = ((5 * w * L ** 4) / (384 * EI)) / (L ** 3 / (48 * EI) + 1 / k)
    expect(r.d.reactions[1].Rv).toBeCloseTo(R, 3)
    agree(r)
  })

  it('section change inside a span forces the force method, and still agrees', () => {
    const segs: BeamSegment[] = [{ x0: 0, x1: 2.5, E, I }, { x0: 2.5, x1: 10, E, I: 2 * I }]
    const r = both([{ type: 'pin', x: 0 }, { type: 'roller', x: 5 }, { type: 'roller', x: 10 }], [{ type: 'udl', x1: 0, x2: 10, w: 10, cat: 'D' }], 10, segs)
    expect(r.d.method).toBe('force')
    agree(r)
  })

  it('fixed end + two rollers + overhang, every load type', () => {
    const sup: Support[] = [{ type: 'fixed', x: 0 }, { type: 'roller', x: 4 }, { type: 'roller', x: 9 }]
    const lds: BeamLoad[] = [
      { type: 'udl', x1: 0, x2: 11, w: 8, cat: 'D' },
      { type: 'point', x: 6.5, P: 25, cat: 'D' },
      { type: 'vdl', x1: 0, x2: 4, w1: 6, w2: 0, cat: 'D' },
      { type: 'moment', x: 11, M: -12, cat: 'D' },
    ]
    agree(both(sup, lds, 11))
  })
})

describe('when no hand method applies', () => {
  it('two supports at one point: falls back to the stiffness reactions and says so', () => {
    const sup: Support[] = [{ type: 'fixed', x: 6 }, { type: 'pin', x: 0 }, { type: 'roller', x: 6 }, { type: 'roller', x: 12 }]
    const r = both(sup, [{ type: 'udl', x1: 0, x2: 12, w: 10, cat: 'D' }], 12)
    expect(r.d.method).toBe('stiffness')
    expect(text(r.d)).toContain('same point')
    r.d.reactions.forEach((q, i) => expect(q.Rv).toBeCloseTo(r.fem.reactions[i].Rv, 9))
  })
})

describe('deflection — double integration', () => {
  it('the supports not used to fix θ₀, y₀ come out at zero', () => {
    const sup: Support[] = [0, 3, 8, 12].map((x, i) => ({ type: i ? 'roller' : 'pin', x }))
    const { d } = both(sup, [{ type: 'udl', x1: 0, x2: 12, w: 10, cat: 'D' }], 12)
    const chk = text(d).split('\n').find((l) => l.startsWith('Check at the other supports'))!
    expect(chk).toMatch(/y_C = -?0\.000 mm/)
    expect(chk).toMatch(/y_D = -?0\.000 mm/)
  })

  it('every step is present', () => {
    const { d } = both([{ type: 'pin', x: 0 }, { type: 'roller', x: 6 }], [{ type: 'udl', x1: 0, x2: 6, w: 10, cat: 'D' }], 6)
    expect(d.steps.map((s) => s.title)).toEqual([
      'Factored loads — test', 'Reactions', 'Shear and bending moment', 'Maximum shear and moment', 'Deflection — double integration',
    ])
  })
})
