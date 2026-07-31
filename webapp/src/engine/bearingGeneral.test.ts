import { describe, it, expect } from 'vitest'
import {
  nGamma, shapeFactors, depthFactors, inclinationFactors,
  generalBearingCapacity, compareMethods, BEARING_METHOD_LABEL,
  type BearingMethod,
} from './bearingGeneral'
import { bearingFactors } from './geotech'

const METHODS: BearingMethod[] = ['meyerhof', 'hansen', 'vesic']

describe('N-factors', () => {
  it('shares Prandtl/Reissner Nq and Nc across all three methods', () => {
    // Only Nγ differs; asserting this stops a future "Hansen Nq" appearing.
    const f = bearingFactors(30)
    expect(f.Nq).toBeCloseTo(18.401, 3)
    expect(f.Nc).toBeCloseTo(30.140, 3)
  })

  it('reproduces the PUBLISHED Nγ for each method', () => {
    // Das, Principles of Foundation Engineering — the tabulated values.
    expect(nGamma(30, 'meyerhof')).toBeCloseTo(15.668, 3)
    expect(nGamma(30, 'hansen')).toBeCloseTo(15.070, 3)
    expect(nGamma(30, 'vesic')).toBeCloseTo(22.402, 3)

    expect(nGamma(35, 'meyerhof')).toBeCloseTo(37.152, 3)
    expect(nGamma(35, 'hansen')).toBeCloseTo(33.921, 3)
    expect(nGamma(35, 'vesic')).toBeCloseTo(48.029, 3)
  })

  it('puts Vesić highest, which is why the method has to be recorded', () => {
    for (const phi of [20, 25, 30, 35, 40]) {
      expect(nGamma(phi, 'vesic')).toBeGreaterThan(nGamma(phi, 'hansen'))
      expect(nGamma(phi, 'vesic')).toBeGreaterThan(nGamma(phi, 'meyerhof'))
    }
  })

  it('is zero for a frictionless soil in every method', () => {
    for (const m of METHODS) expect(nGamma(0, m)).toBe(0)
  })
})

describe('shape factors', () => {
  it('are 1.0 for a strip footing in every method', () => {
    for (const m of METHODS) {
      const s = shapeFactors(30, 2, Infinity, m, bearingFactors(30))
      expect(s.sc, m).toBeCloseTo(1, 6)
      expect(s.sq, m).toBeCloseTo(1, 6)
      expect(s.sgamma, m).toBeCloseTo(1, 6)
    }
  })

  it('gives the De Beer set for Hansen and Vesić on a square', () => {
    const f = bearingFactors(32)
    const s = shapeFactors(32, 2, 2, 'vesic', f)
    expect(s.sc).toBeCloseTo(1 + f.Nq / f.Nc, 6)
    expect(s.sq).toBeCloseTo(1 + Math.tan((32 * Math.PI) / 180), 6)
    expect(s.sgamma).toBeCloseTo(0.6, 6)
  })

  it('collapses Meyerhof’s sq and sγ to 1.0 below φ = 10°, his own stated limit', () => {
    const s = shapeFactors(5, 2, 2, 'meyerhof', bearingFactors(5))
    expect(s.sq).toBe(1)
    expect(s.sgamma).toBe(1)
    expect(s.sc).toBeGreaterThan(1)
  })

  it('treats B as the SHORT side even if given the long one', () => {
    const f = bearingFactors(30)
    expect(shapeFactors(30, 4, 2, 'vesic', f)).toEqual(shapeFactors(30, 2, 4, 'vesic', f))
  })
})

describe('depth factors', () => {
  it('are 1.0 at the ground surface', () => {
    for (const m of METHODS) {
      const d = depthFactors(30, 2, 0, m)
      expect(d.dc, m).toBeCloseTo(1, 6)
      expect(d.dq, m).toBeCloseTo(1, 6)
      expect(d.dgamma, m).toBeCloseTo(1, 6)
    }
  })

  it('matches the hand calc for Hansen/Vesić at Df/B ≤ 1', () => {
    // Df/B = 0.75, φ = 32: dc = 1 + 0.4(0.75) = 1.30
    //   dq = 1 + 2 tan32 (1 − sin32)² (0.75) = 1.2071
    const d = depthFactors(32, 2, 1.5, 'vesic')
    expect(d.dc).toBeCloseTo(1.30, 6)
    expect(d.dq).toBeCloseTo(1.2071, 4)
    expect(d.dgamma).toBe(1)
  })

  it('switches to arctan past Df/B = 1 so a deep footing is not credited without limit', () => {
    const shallow = depthFactors(32, 2, 2, 'vesic')     // Df/B = 1 exactly
    const deep = depthFactors(32, 2, 20, 'vesic')       // Df/B = 10
    expect(shallow.dc).toBeCloseTo(1.4, 6)
    // arctan(10) = 1.4711 rad, so dc = 1 + 0.4(1.4711) = 1.588 — NOT 1 + 0.4(10).
    expect(deep.dc).toBeCloseTo(1.5884, 3)
    expect(deep.dc).toBeLessThan(2)
  })

  it('steps DOWN at the Df/B = 1 switch, as the published factors do', () => {
    // The ratio branch gives 1.0 and arctan(1) gives 0.785, so the tabulated
    // factors genuinely jump about 6% at the boundary. Reproduced rather than
    // smoothed: a factor invented to bridge the gap would be neither method.
    // Bounded here so a transposed coefficient still fails.
    for (const m of METHODS) {
      const a = depthFactors(32, 2, 2 - 1e-6, m)
      const b = depthFactors(32, 2, 2 + 1e-6, m)
      expect(b.dc, m).toBeLessThan(a.dc)
      expect(a.dc - b.dc, m).toBeLessThan(0.1)
      expect(a.dq - b.dq, m).toBeLessThan(0.1)
    }
  })

  it('refuses a zero width', () => {
    expect(() => depthFactors(30, 0, 1, 'vesic')).toThrow(/greater than zero/)
  })
})

describe('inclination factors', () => {
  it('are 1.0 for a vertical load', () => {
    expect(inclinationFactors(32, 0)).toEqual({ ic: 1, iq: 1, igamma: 1 })
  })

  it('matches the hand calc', () => {
    // β = 20°, φ = 32°: ic = iq = (1 − 20/90)² = 0.6049, iγ = (1 − 20/32)² = 0.1406
    const i = inclinationFactors(32, 20)
    expect(i.ic).toBeCloseTo(0.6049, 4)
    expect(i.igamma).toBeCloseTo(0.1406, 4)
  })

  it('ZEROES iγ once the load is inclined past φ', () => {
    // Not a numerical guard: a load steeper than the friction angle cannot be
    // carried by friction at all.
    expect(inclinationFactors(32, 32).igamma).toBe(0)
    expect(inclinationFactors(32, 45).igamma).toBe(0)
    expect(inclinationFactors(0, 5).igamma).toBe(0)
  })

  it('refuses an inclination past horizontal', () => {
    expect(() => inclinationFactors(30, 95)).toThrow(/must not exceed 90/)
  })
})

describe('the general equation end to end', () => {
  const BASE = { c: 0, phiDeg: 32, gamma: 18, B: 2, L: 2, Df: 1.5 }

  it('reproduces a full hand calculation', () => {
    // Vesić, square 2×2 m at Df = 1.5 m, φ = 32°, γ = 18, c = 0, dry:
    //   Nq = 23.177, Nγ = 30.215, sq = 1.6249, sγ = 0.60, dq = 1.2071, dγ = 1
    //   q = 27.0 kPa
    //   qu = 27(23.177)(1.6249)(1.2071) + 0.5(18)(2)(30.215)(0.60)(1) = 1553.72
    const r = generalBearingCapacity({ ...BASE, method: 'vesic' })
    expect(r.Nq).toBeCloseTo(23.1768, 3)
    expect(r.Ngamma).toBeCloseTo(30.2147, 3)
    expect(r.sq).toBeCloseTo(1.6249, 4)
    expect(r.dq).toBeCloseTo(1.2071, 4)
    expect(r.surcharge).toBeCloseTo(27, 6)
    expect(r.qult).toBeCloseTo(1553.72, 1)
    expect(r.qnet).toBeCloseTo(1526.72, 1)
    expect(r.qallowNet).toBeCloseTo(508.91, 1)
  })

  it('divides the NET capacity, not the gross, and adds the surcharge back', () => {
    // The classic slip: q_ult/FS credits the footing with the overburden it
    // displaced, and then adds it again.
    const r = generalBearingCapacity({ ...BASE, FS: 3 })
    expect(r.qallowNet).toBeCloseTo(r.qnet / 3, 9)
    expect(r.qallowGross).toBeCloseTo(r.qnet / 3 + r.surcharge, 9)
    expect(r.qallowNet).toBeLessThan(r.qult / 3)
  })

  it('records WHICH method produced the number', () => {
    for (const m of METHODS) {
      expect(generalBearingCapacity({ ...BASE, method: m }).method).toBe(m)
      expect(BEARING_METHOD_LABEL[m].length).toBeGreaterThan(5)
    }
  })

  it('shows a real spread between the three methods', () => {
    // The disagreement is a property of the state of the art, not a defect —
    // which is exactly why the method is an input and is recorded on the result.
    const all = compareMethods(BASE)
    const qs = METHODS.map((m) => all[m].qult)
    expect(Math.max(...qs) / Math.min(...qs)).toBeGreaterThan(1.05)
    expect(all.vesic.qult).toBeGreaterThan(all.hansen.qult)
  })

  it('spreads MUCH wider when the Nγ term governs', () => {
    // On a deep narrow footing the surcharge term dominates and dilutes the
    // disagreement to ~7%; on a shallow wide one, where Nγ carries the load,
    // the same three methods differ by 70%. Quoting a bearing pressure without
    // its method is not reproducible, and this is the case that shows why.
    const wide = compareMethods({ c: 0, phiDeg: 32, gamma: 18, B: 4, L: 4, Df: 0.5 })
    const qs = METHODS.map((m) => wide[m].qult)
    expect(Math.max(...qs) / Math.min(...qs)).toBeGreaterThan(1.6)
    // And here Meyerhof is the HIGHEST, the reverse of the Nγ ordering, because
    // his shape and depth factors apply to the Nq term as well.
    expect(wide.meyerhof.qult).toBeGreaterThan(wide.vesic.qult)
  })

  it('φ = 0 falls back to the undrained form', () => {
    // qu = 5.14·cu·sc·dc + q, with no Nγ term at all.
    const r = generalBearingCapacity({ c: 50, phiDeg: 0, gamma: 18, B: 2, L: 2, Df: 1.5 })
    expect(r.Nc).toBe(5.14)
    expect(r.Ngamma).toBe(0)
    expect(r.qult).toBeCloseTo(50 * 5.14 * r.sc * r.dc + 27, 6)
  })

  // ── Water table ──

  it('halves the Nγ term when the water table reaches founding level', () => {
    const dry = generalBearingCapacity({ ...BASE, gammaSat: 20 })
    const wet = generalBearingCapacity({ ...BASE, gammaSat: 20, waterTable: 0 })
    expect(wet.gammaEffective).toBeCloseTo(20 - 9.81, 6)
    expect(wet.qult).toBeLessThan(dry.qult)
    expect(wet.notes.join(' ')).toMatch(/roughly halves the Nγ term/)
  })

  it('interpolates γ̄ when the table sits within B below the footing', () => {
    // Df = 1.5, B = 2, dw = 3.0 ⇒ γ̄ = γ′ + (1.5/2)(18 − γ′) = 16.0475
    const r = generalBearingCapacity({ ...BASE, gammaSat: 20, waterTable: 3.0 })
    expect(r.gammaEffective).toBeCloseTo(16.0475, 4)
    expect(r.surcharge).toBeCloseTo(27, 6)
  })

  it('ignores a water table deeper than B below the footing', () => {
    const deep = generalBearingCapacity({ ...BASE, gammaSat: 20, waterTable: 20 })
    const none = generalBearingCapacity({ ...BASE, gammaSat: 20 })
    expect(deep.qult).toBeCloseTo(none.qult, 9)
  })

  // ── Eccentricity ──

  it('uses the EFFECTIVE width in the Nγ term, not the gross', () => {
    // Using gross B under a moment is the usual mistake and is unconservative.
    const conc = generalBearingCapacity(BASE)
    const ecc = generalBearingCapacity({ ...BASE, eB: 0.25 })
    expect(ecc.effectiveB).toBeCloseTo(1.5, 9)
    expect(ecc.qult).toBeLessThan(conc.qult)
  })

  it('warns when the resultant leaves the middle third', () => {
    const r = generalBearingCapacity({ ...BASE, eB: 0.5 })
    expect(r.notes.join(' ')).toMatch(/outside the middle third/)
  })

  it('refuses an eccentricity that leaves no footing', () => {
    expect(() => generalBearingCapacity({ ...BASE, eB: 1.0 }))
      .toThrow(/no effective area remains/)
  })

  // ── Guards and honesty ──

  it('drops the Nγ term and points at sliding when β ≥ φ', () => {
    const r = generalBearingCapacity({ ...BASE, loadInclination: 35 })
    expect(r.igamma).toBe(0)
    expect(r.notes.join(' ')).toMatch(/Check sliding as well/)
  })

  it('says when it is being used outside shallow-foundation range', () => {
    expect(generalBearingCapacity({ ...BASE, Df: 12 }).notes.join(' '))
      .toMatch(/deep-foundation method is the defensible one/)
  })

  it('always states that this is not a settlement check', () => {
    expect(generalBearingCapacity(BASE).notes.join(' ')).toMatch(/not a settlement check/)
  })

  it('flags a c–φ soil as a DRAINED analysis', () => {
    expect(generalBearingCapacity({ ...BASE, c: 10 }).notes.join(' '))
      .toMatch(/drained c′–φ′ envelope/)
  })

  it('swaps B and L rather than silently using the long side', () => {
    const r = generalBearingCapacity({ ...BASE, B: 4, L: 2 })
    expect(r.notes.join(' ')).toMatch(/swapped so B remains the short side/)
    expect(r.qult).toBeCloseTo(generalBearingCapacity({ ...BASE, B: 2, L: 4 }).qult, 9)
  })

  it('refuses impossible geometry', () => {
    expect(() => generalBearingCapacity({ ...BASE, B: 0 })).toThrow(/greater than zero/)
    expect(() => generalBearingCapacity({ ...BASE, Df: -1 })).toThrow(/must not be negative/)
  })

  it('a strip footing carries less than a square of the same width', () => {
    const strip = generalBearingCapacity({ ...BASE, L: Infinity })
    const square = generalBearingCapacity(BASE)
    expect(strip.qult).toBeLessThan(square.qult)
  })
})
