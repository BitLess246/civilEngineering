import { describe, expect, it } from 'vitest'
import { wcFromStrength, caBulkVolume, designMix, type MixInput } from './mixDesign'

const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol)

// Hand case (review-textbook classic): f'cr = 28 MPa, 75–100 mm slump,
// 25 mm rock, mild exposure, FM = 2.80, DRUW = 1600, SG 2.68/2.65.
const BASE: MixInput = {
  fcrMPa: 28,
  slumpBand: '75-100',
  maxAgg: 25,
  exposure: 'mild',
  FM: 2.8,
  druwc: 1600,
  sgCA: 2.68,
  sgFA: 2.65,
  mcCA: 0.015,
  absCA: 0.008,
  mcFA: 0.045,
  absFA: 0.010,
  volume: 1,
}

describe('wcFromStrength (ACI Table 6.3.4(a))', () => {
  it('returns the printed psi-table rows exactly in MPa terms', () => {
    // 41.37 MPa = 6000 psi, 27.58 = 4000, 20.68 = 3000, 13.79 = 2000
    near(wcFromStrength(41.37, false), 0.41, 1e-3)
    near(wcFromStrength(27.58, false), 0.57, 1e-3)
    near(wcFromStrength(20.68, false), 0.68, 1e-3)
    near(wcFromStrength(13.79, false), 0.82, 1e-3)
  })
  it('air-entrained column: 3000 psi → 0.59, 2000 psi → 0.74', () => {
    near(wcFromStrength(20.68, true), 0.59, 1e-3)
    near(wcFromStrength(13.79, true), 0.74, 1e-3)
  })
  it('interpolates between psi rows: 30 MPa → 0.5384, 25 MPa → 0.6112', () => {
    near(wcFromStrength(30, false), 0.5384, 1e-3)
    near(wcFromStrength(25, false), 0.6112, 1e-3)
    // the psi table is the canonical source; the rounded metric print
    // (30 → 0.54, 25 → 0.62) stays within a hair of the interpolation
    expect(Math.abs(wcFromStrength(30, false) - 0.54)).toBeLessThan(0.01)
    expect(Math.abs(wcFromStrength(25, false) - 0.62)).toBeLessThan(0.01)
  })
  it('for the same strength, air-entrained needs a lower w/c', () => {
    expect(wcFromStrength(21, true)).toBeLessThan(wcFromStrength(21, false))
  })
  it('clamps beyond the table edge instead of extrapolating wildly', () => {
    near(wcFromStrength(60, false), 0.41, 1e-12)
    near(wcFromStrength(8, false), 0.82, 1e-12)
  })
})

describe('caBulkVolume (ACI Table 6.3.6)', () => {
  it('printed values at FM = 2.40 / 2.60 / 2.80 / 3.00', () => {
    near(caBulkVolume(25, 2.4), 0.71)
    near(caBulkVolume(25, 2.6), 0.69)
    near(caBulkVolume(25, 2.8), 0.67)
    near(caBulkVolume(25, 3.0), 0.65)
  })
  it('coarser rock carries more coarse aggregate', () => {
    expect(caBulkVolume(37.5, 2.8)).toBeGreaterThan(caBulkVolume(19, 2.8))
  })
})

describe('designMix — the hand case', () => {
  const r = designMix(BASE)

  it('w/c = 0.5645 by interpolation between 4000 and 5000 psi', () => {
    near(r.wc, 0.564505, 1e-4)
  })
  it('water 193 kg/m³ (25 mm, 75–100 slump, non-AE), cement = w/(w/c) ≈ 341.9', () => {
    near(r.water, 193)
    near(r.cement, 341.90, 0.05)
  })
  it('coarse aggregate: 0.67 × 1600 = 1072 kg/m³', () => {
    near(r.caBulk, 0.67)
    near(r.caDry, 1072)
  })
  it('absolute volumes close to 1.0 and sand fills the remainder', () => {
    near(r.vCement + r.vWater + r.vAir + r.vCA + r.vFA, 1, 1e-12)
    near(r.vCement, 341.90 / 3150, 1e-3)
    near(r.faDry, 751.2, 0.5)
  })
  it('fresh density lands near the ACI first estimate (2370)', () => {
    near(r.freshDensity, 2358.1, 2)
    near(r.densityEstimate, 2370)
    expect(Math.abs(r.freshDensity - r.densityEstimate) / r.densityEstimate).toBeLessThan(0.04)
  })
  it('moisture corrections: wet stock weighs more, added water shrinks', () => {
    near(r.batchCA, 1072 * 1.015, 0.1)
    near(r.batchFA, 751.2 * 1.045, 0.5)
    near(r.freeWater, 1072 * 0.007 + 751.2 * 0.035, 0.5)
    near(r.batchWater, 193 - r.freeWater, 0.5)
  })
  it('the water budget still balances after corrections', () => {
    // batch water + free moisture on the aggregates = the design water
    const surfCA = r.caDry * (0.015 - 0.008)
    const surfFA = r.faDry * (0.045 - 0.010)
    near(r.batchWater + surfCA + surfFA, 193, 0.5)
  })
  it('scales by batch volume and counts 40-kg bags', () => {
    const b = designMix({ ...BASE, volume: 3.5 })
    near(b.totals.cement, r.cement * 3.5, 0.1)
    expect(b.totals.bags40).toBe(Math.ceil(r.cement * 3.5 / 40))
  })
})

describe('designMix — air entrainment', () => {
  it('moderate exposure on 25 mm rock: 4.5 % total air, AE water table', () => {
    const r = designMix({ ...BASE, exposure: 'moderate' })
    near(r.airPct, 4.5)
    near(r.water, 175)
    // AE column at 28 MPa: between 3000 psi (0.59) and 4000 psi (0.48)
    near(r.wc, 0.4751, 1e-3)
    expect(r.cement).toBeGreaterThan(340)
  })
  it('mild exposure keeps only entrapped air', () => {
    const r = designMix({ ...BASE })
    near(r.airPct, 1.5)
    expect(r.airEntrained).toBe(false)
  })
  it('severe exposure follows ACI 211.1 Table 6.3.3 (25 mm → 6.0 %, 50 mm → 5.0 %)', () => {
    // Transcription guard: the severe column once shipped 1 % low for ≥25 mm rock.
    const r25 = designMix({ ...BASE, exposure: 'severe' })
    near(r25.airPct, 6.0)
    const r50 = designMix({ ...BASE, exposure: 'severe', maxAgg: 50 })
    near(r50.airPct, 5.0)
    expect(r25.airEntrained).toBe(true)
  })
})

describe('designMix — input guards', () => {
  it('rejects strengths outside the table era', () => {
    expect(() => designMix({ ...BASE, fcrMPa: 10 })).toThrow(/14 and 45/)
    expect(() => designMix({ ...BASE, fcrMPa: 50 })).toThrow(/14 and 45/)
  })
  it('rejects an FM outside the CA-table range', () => {
    expect(() => designMix({ ...BASE, FM: 4.2 })).toThrow(/Fineness modulus/)
  })
  it('warns when the fresh density drifts from the first estimate', () => {
    // light rock + heavy sand pulls the resolved density far off the table
    const odd = designMix({ ...BASE, sgCA: 2.05, sgFA: 3.15 })
    expect(odd.warnings.some((w) => w.includes('first estimate'))).toBe(true)
  })
})
