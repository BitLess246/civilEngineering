import { describe, it, expect } from 'vitest'
import {
  sptCorrections, correctionCB, correctionCS, correctionCR, correctionCN,
  correlatePhi, correlateRelativeDensity, correlateUndrainedStrength,
  densityFromN60, consistencyFromN60, HAMMER_ENERGY, P_ATM,
} from './spt'
import type { SptTest } from './model'

const test = (over: Partial<SptTest> = {}): SptTest => ({
  id: 't1', depth: 6, blows: [4, 7, 8], penetration: [150, 150, 150],
  hammer: 'safety', rodLength: 7.5, ...over,
})

describe('individual corrections', () => {
  it('C_B by borehole diameter (Skempton 1986)', () => {
    expect(correctionCB(100)).toBe(1.0)
    expect(correctionCB(115)).toBe(1.0)
    expect(correctionCB(150)).toBe(1.05)
    expect(correctionCB(200)).toBe(1.15)
    expect(correctionCB(undefined)).toBe(1.0)
  })

  it('C_S is above 1 when a liner-ready sampler is used without one', () => {
    expect(correctionCS('standard')).toBe(1.0)
    expect(correctionCS('liner-absent')).toBe(1.2)
    expect(correctionCS(undefined)).toBe(1.0)
  })

  it('C_R rises with rod length to 1.0 beyond 10 m (Youd et al. 2001)', () => {
    expect(correctionCR(2)).toBe(0.75)
    expect(correctionCR(3.5)).toBe(0.8)
    expect(correctionCR(5)).toBe(0.85)
    expect(correctionCR(8)).toBe(0.95)
    expect(correctionCR(12)).toBe(1.0)
    expect(correctionCR(undefined)).toBe(1.0)
  })

  it('C_N is 1.0 at the reference overburden and capped at 1.7', () => {
    expect(correctionCN(P_ATM)).toBeCloseTo(1.0, 10)
    expect(correctionCN(400)).toBeCloseTo(0.5, 10)
    // Without the cap a shallow test inflates without limit as σ′ → 0.
    expect(correctionCN(1)).toBe(1.7)
    expect(correctionCN(0)).toBe(1.7)
    expect(correctionCN(-5)).toBe(1.7)
  })
})

describe('N60', () => {
  it('matches a hand calculation', () => {
    // N = 7 + 8 = 15; safety hammer 60%; 100 mm hole C_B = 1.0;
    // standard sampler C_S = 1.0; 7.5 m rods C_R = 0.95.
    // N60 = 15 × (60/60) × 1.0 × 1.0 × 0.95 = 14.25
    const r = sptCorrections({ test: test(), boreholeDiameter: 100 })
    expect(r.N).toBe(15)
    expect(r.n60).toBeCloseTo(14.25, 10)
  })

  it('uses the seating drive for nothing — N is the 2nd + 3rd increments', () => {
    // Changing only the seating blows must not move N.
    const a = sptCorrections({ test: test({ blows: [4, 7, 8] }) })
    const b = sptCorrections({ test: test({ blows: [25, 7, 8] }) })
    expect(a.N).toBe(b.N)
  })

  it('scales with a measured energy ratio and says it was measured', () => {
    const r = sptCorrections({ test: test({ energyRatio: 80 }), boreholeDiameter: 100 })
    expect(r.energyMeasured).toBe(true)
    expect(r.n60).toBeCloseTo(15 * (80 / 60) * 0.95, 10)
    expect(r.notes.join(' ')).not.toMatch(/default/)
  })

  it('falls back to a hammer default AND warns that it is weak', () => {
    const r = sptCorrections({ test: test({ hammer: 'automatic' }), boreholeDiameter: 100 })
    expect(r.energyMeasured).toBe(false)
    expect(r.energyRatio).toBe(HAMMER_ENERGY.automatic)
    expect(r.notes.join(' ')).toMatch(/vary widely between nominally identical rigs/)
  })

  it('warns when no rod length was recorded', () => {
    const r = sptCorrections({ test: test({ rodLength: undefined }) })
    expect(r.cr).toBe(1.0)
    expect(r.notes.join(' ')).toMatch(/Shallow tests are over-estimated/)
  })
})

describe('(N1)60', () => {
  it('applies C_N only when an effective stress is supplied', () => {
    const without = sptCorrections({ test: test(), boreholeDiameter: 100 })
    expect(without.cn).toBeUndefined()
    expect(without.n160).toBeUndefined()

    const with_ = sptCorrections({ test: test(), boreholeDiameter: 100, effectiveStress: 100 })
    expect(with_.cn).toBeCloseTo(1.0, 10)
    expect(with_.n160).toBeCloseTo(with_.n60, 10)
  })

  it('normalises two depths in the same sand to comparable values', () => {
    // The point of (N1)60: a shallow N and a deep N in the same material
    // should come out closer after normalising than before.
    const shallow = sptCorrections({ test: test({ blows: [2, 4, 5], rodLength: 4 }), boreholeDiameter: 100, effectiveStress: 40 })
    const deep = sptCorrections({ test: test({ blows: [6, 10, 12], rodLength: 15 }), boreholeDiameter: 100, effectiveStress: 250 })

    const rawGap = Math.abs(deep.N - shallow.N)
    const normalisedGap = Math.abs(deep.n160! - shallow.n160!)
    expect(normalisedGap).toBeLessThan(rawGap)
  })

  it('says when the overburden correction hit its cap', () => {
    const r = sptCorrections({ test: test(), boreholeDiameter: 100, effectiveStress: 20 })
    expect(r.cn).toBe(1.7)
    expect(r.notes.join(' ')).toMatch(/1\.7 cap/)
  })
})

describe('refusal is a lower bound, not a measurement', () => {
  const refused = test({ blows: [30, 50, 25], penetration: [150, 150, 75] })

  it('is flagged and explained', () => {
    const r = sptCorrections({ test: refused, boreholeDiameter: 100 })
    expect(r.refusal).toBe(true)
    expect(r.notes.join(' ')).toMatch(/LOWER BOUND/)
    expect(r.notes.join(' ')).toMatch(/correlations must not be applied/)
  })

  it('makes every correlation decline rather than return a number', () => {
    // Correcting a lower bound produces a more precise-looking lower bound,
    // not a better estimate.
    expect(correlatePhi(40, 'clean-sand', true).value).toBeUndefined()
    expect(correlatePhi(40, 'clean-sand', true).declined).toMatch(/refusal/)
    expect(correlateRelativeDensity(40, 'clean-sand', true).declined).toBeTruthy()
    expect(correlateUndrainedStrength(40, 'clay', 20, true).declined).toBeTruthy()
  })
})

describe('correlations carry their provenance, never a bare number', () => {
  it('φ from (N1)60 names the source and the scatter', () => {
    const out = correlatePhi(18, 'clean-sand')
    const v = out.value!
    expect(v.value).toBeCloseTo(Math.sqrt(20 * 18) + 20, 10)
    expect(v.unit).toBe('°')
    expect(v.provenance.kind).toBe('correlated')
    if (v.provenance.kind === 'correlated') {
      expect(v.provenance.source).toMatch(/Hatanaka/)
      expect(v.provenance.scatter).toBe('±3°')
      expect(v.provenance.basis).toMatch(/\(N₁\)₆₀ = 18/)
    }
  })

  it('declines φ for a clay and says what to run instead', () => {
    const out = correlatePhi(18, 'clay')
    expect(out.value).toBeUndefined()
    expect(out.declined).toMatch(/triaxial or direct shear/)
  })

  it('notes when φ is applied to a silty sand — outside the fitted data', () => {
    const out = correlatePhi(18, 'silty-sand')
    expect(out.value!.note).toMatch(/outside the clean-sand data/)
  })

  it('relative density is capped at 100% and declined for clay', () => {
    expect(correlateRelativeDensity(60, 'clean-sand').value!.value).toBeCloseTo(100, 10)
    expect(correlateRelativeDensity(200, 'clean-sand').value!.value).toBe(100)
    expect(correlateRelativeDensity(20, 'clay').declined).toMatch(/not defined for a cohesive soil/)
  })

  it('cu from N60 varies f with plasticity and states the band', () => {
    const low = correlateUndrainedStrength(10, 'clay', 15).value!
    const mid = correlateUndrainedStrength(10, 'clay', 25).value!
    expect(low.value).toBeCloseTo(45, 10)     // f = 4.5
    expect(mid.value).toBeCloseTo(60, 10)     // f = 6
    if (mid.provenance.kind === 'correlated') {
      expect(mid.provenance.scatter).toMatch(/4–6 kPa/)
    }
  })

  it('warns that SPT is a poor test in soft clay', () => {
    expect(correlateUndrainedStrength(3, 'clay', 25).value!.note).toMatch(/vane, UCS or triaxial/)
    expect(correlateUndrainedStrength(20, 'clay', 25).value!.note).toBeUndefined()
  })

  it('declines cu for a granular soil', () => {
    expect(correlateUndrainedStrength(20, 'clean-sand').declined).toMatch(/granular/)
  })

  it('declines a negative or non-finite blow count', () => {
    expect(correlatePhi(-1, 'clean-sand').declined).toBeTruthy()
    expect(correlateRelativeDensity(NaN, 'clean-sand').declined).toBeTruthy()
  })
})

describe('descriptive terms', () => {
  it('maps N60 onto density and consistency (Terzaghi & Peck)', () => {
    expect(densityFromN60(2)).toBe('very loose')
    expect(densityFromN60(8)).toBe('loose')
    expect(densityFromN60(20)).toBe('medium dense')
    expect(densityFromN60(40)).toBe('dense')
    expect(densityFromN60(60)).toBe('very dense')

    expect(consistencyFromN60(1)).toBe('very soft')
    expect(consistencyFromN60(6)).toBe('firm')
    expect(consistencyFromN60(20)).toBe('very stiff')
    expect(consistencyFromN60(40)).toBe('hard')
  })
})
