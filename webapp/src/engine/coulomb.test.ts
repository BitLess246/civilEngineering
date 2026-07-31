import { describe, it, expect } from 'vitest'
import {
  coulombKa, coulombKp, coulombActiveThrust, coulombPassiveThrust, mononobeOkabe,
} from './coulomb'
import { rankineKa, rankineKp } from './geotech'

describe('Coulomb reduces to Rankine, which is how we know it is transcribed right', () => {
  it('gives EXACTLY tan²(45 − φ/2) for a smooth vertical wall and level backfill', () => {
    // δ = θ = β = 0 collapses the bracket to (1 + sinφ)², leaving
    // cos²φ/(1+sinφ)² = (1−sinφ)/(1+sinφ). Any transcription slip breaks this.
    for (const phi of [20, 25, 30, 35, 40]) {
      expect(coulombKa({ phiDeg: phi }), `φ=${phi}`).toBeCloseTo(rankineKa(phi), 12)
    }
  })

  it('gives exactly tan²(45 + φ/2) on the passive side', () => {
    for (const phi of [20, 30, 40]) {
      expect(coulombKp({ phiDeg: phi }), `φ=${phi}`).toBeCloseTo(rankineKp(phi), 12)
    }
  })
})

describe('what Coulomb adds that Rankine cannot express', () => {
  it('wall friction REDUCES the active pressure', () => {
    expect(coulombKa({ phiDeg: 30, deltaDeg: 20 })).toBeCloseTo(0.29731, 5)
    expect(coulombKa({ phiDeg: 30, deltaDeg: 20 })).toBeLessThan(coulombKa({ phiDeg: 30 }))
  })

  it('a sloping backfill RAISES it', () => {
    expect(coulombKa({ phiDeg: 30, deltaDeg: 20, betaDeg: 10 })).toBeCloseTo(0.34002, 5)
    expect(coulombKa({ phiDeg: 30, deltaDeg: 20, betaDeg: 10 }))
      .toBeGreaterThan(coulombKa({ phiDeg: 30, deltaDeg: 20 }))
  })

  it('matches a δ = ⅔φ hand calc', () => {
    expect(coulombKa({ phiDeg: 35, deltaDeg: (35 * 2) / 3 })).toBeCloseTo(0.24441, 5)
  })

  it('REFUSES a backfill steeper than its own friction angle', () => {
    // Not a numerical guard — no active wedge exists. Returning NaN here would
    // let an impossible wall print a pressure.
    expect(() => coulombKa({ phiDeg: 30, betaDeg: 35 })).toThrow(/cannot stand steeper/)
  })
})

describe('the thrust is not horizontal', () => {
  const t = coulombActiveThrust({ phiDeg: 30, deltaDeg: 20, gamma: 18, H: 5 })

  it('splits into components at δ + θ from horizontal', () => {
    expect(t.inclinationDeg).toBe(20)
    expect(t.horizontal).toBeCloseTo(t.P * Math.cos((20 * Math.PI) / 180), 9)
    expect(t.vertical).toBeCloseTo(t.P * Math.sin((20 * Math.PI) / 180), 9)
    expect(t.vertical).toBeGreaterThan(0)
  })

  it('says where the vertical component helps and where it hurts', () => {
    // It resists overturning and sliding but ADDS to the toe bearing pressure.
    // Dropping it is conservative for two checks and unconservative for the third.
    expect(t.notes.join(' ')).toMatch(/ADDS to the bearing pressure under the toe/)
  })

  it('puts the resultant at H/3 with no surcharge, and higher with one', () => {
    expect(t.lineOfAction).toBeCloseTo(5 / 3, 9)
    const withQ = coulombActiveThrust({ phiDeg: 30, deltaDeg: 20, gamma: 18, H: 5, surcharge: 20 })
    expect(withQ.lineOfAction).toBeGreaterThan(5 / 3)
    expect(withQ.lineOfAction).toBeLessThan(2.5)
  })

  it('states that there is no cohesion term', () => {
    expect(t.notes.join(' ')).toMatch(/Coulomb has no c term/)
  })

  it('warns when δ is taken beyond φ', () => {
    const bad = coulombActiveThrust({ phiDeg: 30, deltaDeg: 35, gamma: 18, H: 5 })
    expect(bad.notes.join(' ')).toMatch(/cannot be mobilised beyond/)
  })

  it('refuses a zero height', () => {
    expect(() => coulombActiveThrust({ phiDeg: 30, gamma: 18, H: 0 })).toThrow(/greater than zero/)
  })
})

describe('passive pressure, with the warning the method requires', () => {
  it('is the well-known OVERESTIMATE at high δ', () => {
    // φ = 30°, δ = 20° gives Kp ≈ 6.1 against Rankine's 3.0 — the planar
    // failure surface is a poor model on the passive side.
    expect(coulombKp({ phiDeg: 30, deltaDeg: 20 })).toBeCloseTo(6.10536, 4)
    expect(coulombKp({ phiDeg: 30, deltaDeg: 20 })).toBeGreaterThan(2 * rankineKp(30))
  })

  it('says so on the result rather than leaving it to a textbook', () => {
    const p = coulombPassiveThrust({ phiDeg: 30, deltaDeg: 20, gamma: 18, H: 3 })
    expect(p.notes.join(' ')).toMatch(/unconservative/)
    expect(p.notes.join(' ')).toMatch(/Caquot–Kérisel/)
  })

  it('stays quiet at δ ≤ φ/3, where the planar assumption is defensible', () => {
    const p = coulombPassiveThrust({ phiDeg: 30, deltaDeg: 10, gamma: 18, H: 3 })
    expect(p.notes.join(' ')).not.toMatch(/unconservative/)
  })

  it('always states how much movement full passive needs', () => {
    const p = coulombPassiveThrust({ phiDeg: 30, gamma: 18, H: 3 })
    expect(p.notes.join(' ')).toMatch(/2–5% of H/)
  })
})

describe('Mononobe–Okabe', () => {
  const WALL = { phiDeg: 30, deltaDeg: 20, gamma: 18, H: 5 }

  it('collapses to static Coulomb as the shaking goes to zero', () => {
    // The cleanest check on the seismic form: at kh → 0, ψ → 0 and Kae → Ka.
    const mo = mononobeOkabe({ ...WALL, kh: 1e-12 })
    expect(mo.K).toBeCloseTo(coulombKa(WALL), 10)
    expect(mo.increment).toBeCloseTo(0, 6)
  })

  it('matches the hand calc at kh = 0.2', () => {
    // ψ = arctan(0.2) = 11.31°, Kae = 0.45396
    const mo = mononobeOkabe({ ...WALL, kh: 0.2 })
    expect(mo.psiDeg).toBeCloseTo(11.310, 3)
    expect(mo.K).toBeCloseTo(0.45396, 5)
    // P against the engine's own Kae, not the 5-figure literal above — the
    // rounded coefficient is only good to ~4e-4 kN/m here.
    expect(mo.P).toBeCloseTo(0.5 * 18 * 25 * mo.K, 9)
    expect(mo.P).toBeCloseTo(102.14, 2)
  })

  it('carries the vertical coefficient through ψ AND the (1 − kv) factor', () => {
    const up = mononobeOkabe({ ...WALL, kh: 0.2, kv: 0.1 })
    const none = mononobeOkabe({ ...WALL, kh: 0.2 })
    expect(up.psiDeg).toBeGreaterThan(none.psiDeg)   // kh/(1−kv) is larger
    expect(up.P).not.toBeCloseTo(none.P, 3)
  })

  it('puts the INCREMENT at 0.6H, above the static resultant at H/3', () => {
    // The overturning moment rises faster than the thrust — the whole reason
    // both heights are reported rather than one blended number.
    const mo = mononobeOkabe({ ...WALL, kh: 0.2 })
    expect(mo.incrementLineOfAction).toBeCloseTo(3.0, 9)
    expect(mo.lineOfAction).toBeGreaterThan(5 / 3)
    expect(mo.lineOfAction).toBeLessThan(3.0)
    expect(mo.increment).toBeGreaterThan(0)
  })

  it('REFUSES to return a number when no wedge can be in equilibrium', () => {
    // φ − β − ψ < 0. This is the physical limit of the method, and the point
    // where a displacement-based check has to take over.
    expect(() => mononobeOkabe({ ...WALL, betaDeg: 20, kh: 0.5 }))
      .toThrow(/No Mononobe–Okabe solution/)
    expect(() => mononobeOkabe({ ...WALL, betaDeg: 20, kh: 0.5 }))
      .toThrow(/Newmark sliding-block/)
  })

  it('says plainly that it predicts no displacement', () => {
    const mo = mononobeOkabe({ ...WALL, kh: 0.2 })
    expect(mo.notes.join(' ')).toMatch(/PSEUDO-STATIC/)
    expect(mo.notes.join(' ')).toMatch(/can satisfy it and still move/)
  })

  it('flags an unusually high kh', () => {
    expect(mononobeOkabe({ ...WALL, kh: 0.4 }).notes.join(' ')).toMatch(/high for a pseudo-static analysis/)
  })

  it('rises monotonically with shaking', () => {
    let prev = 0
    for (const kh of [0, 0.05, 0.1, 0.2, 0.3]) {
      const mo = mononobeOkabe({ ...WALL, kh })
      expect(mo.P, `kh=${kh}`).toBeGreaterThan(prev)
      prev = mo.P
    }
  })

  it('refuses impossible seismic coefficients', () => {
    expect(() => mononobeOkabe({ ...WALL, kh: 0.2, kv: 1 })).toThrow(/less than 1/)
    expect(() => mononobeOkabe({ ...WALL, kh: -0.1 })).toThrow(/must not be negative/)
  })
})
