import { describe, it, expect } from 'vitest'
import {
  zrFromReliability, ZR_PRINTED, esals, logW18, requiredSN,
  layerSN, checkLayers, TYPICAL_A,
} from './pavement'

describe('ZR — standard normal deviate vs the AASHTO printed table', () => {
  it('matches every printed row (the Guide rounds 99.99 % to −3.750)', () => {
    for (const { R, zr } of ZR_PRINTED) {
      // R = 99.99: printed −3.750 vs the exact quantile −3.7190 — the Guide's
      // own table rounds; the engine uses the exact inverse normal CDF.
      const tol = R >= 99.99 ? 5e-2 : 2e-3
      expect(Math.abs(zrFromReliability(R) - zr)).toBeLessThan(tol)
    }
  })

  it('rejects out-of-range reliability', () => {
    expect(() => zrFromReliability(0)).toThrow()
    expect(() => zrFromReliability(101)).toThrow()
  })
})

describe('ESALs — hand-computed growth', () => {
  it('references the uniform-growth future ESALs', () => {
    const r = esals({
      adt: 3000, truckPct: 15, truckFactor: 1.2,
      directional: 0.6, laneFactor: 0.9, growthPct: 4, years: 20,
    })
    // G = (1.04^20 − 1)/0.04 = 29.7780786
    expect(r.growthFactor).toBeCloseTo(29.7780786, 6)
    // first year = 3000·0.15·1.2·0.6·0.9·365 = 106,434
    expect(r.firstYear).toBeCloseTo(106434, 3)
    // W18 = 3,169,400
    expect(r.W18).toBeCloseTo(3169400.0, 0)
    expect(r.dailyTrucks).toBeCloseTo(450, 9)
  })

  it('zero growth just multiplies by the years', () => {
    const r = esals({ adt: 1000, truckPct: 10, truckFactor: 1, growthPct: 0, years: 5 })
    expect(r.growthFactor).toBe(5)
    expect(r.W18).toBeCloseTo(1000 * 0.1 * 1 * 0.5 * 365 * 5, 9)
  })

  it('validates the inputs', () => {
    expect(() => esals({ adt: 0, truckPct: 10, truckFactor: 1, years: 5 })).toThrow()
    expect(() => esals({ adt: 100, truckPct: 120, truckFactor: 1, years: 5 })).toThrow()
    expect(() => esals({ adt: 100, truckPct: 10, truckFactor: 0, years: 5 })).toThrow()
    expect(() => esals({ adt: 100, truckPct: 10, truckFactor: 1, years: 0 })).toThrow()
  })
})

describe('required SN — hand-solved design equation', () => {
  it('SN = 4.3447 for W18 = 5e6, MR = 50 MPa, R = 90 %, ΔPSI = 2.0', () => {
    const r = requiredSN({ W18: 5e6, MR_MPa: 50, pt: 2.2 }) // ΔPSI = 4.2 − 2.2 = 2.0
    expect(r.SN).toBeCloseTo(4.34473, 3)
    expect(r.ZR).toBeCloseTo(-1.28155, 3)
    expect(r.MRpsi).toBeCloseTo(7251.9, 0)
    // the equation closes on the target
    expect(r.logW18).toBeCloseTo(Math.log10(5e6), 8)
  })

  it('SN = 4.0633 for W18 = 1e7, MR = 100 MPa, R = 95 %, ΔPSI = 1.9', () => {
    const r = requiredSN({ W18: 1e7, MR_MPa: 100, reliability: 95, pt: 2.3 })
    expect(r.SN).toBeCloseTo(4.06327, 3)
    expect(r.logW18).toBeCloseTo(7.0, 8)
  })

  it('the equation itself is strictly increasing in SN', () => {
    let prev = -Infinity
    for (let sn = 0.5; sn <= 15; sn += 0.5) {
      const v = logW18(sn, -1.282, 0.45, 2.0, 7252)
      expect(v).toBeGreaterThan(prev)
      prev = v
    }
  })

  it('higher reliability demands a larger SN', () => {
    const a = requiredSN({ W18: 5e6, MR_MPa: 50, reliability: 85 })
    const b = requiredSN({ W18: 5e6, MR_MPa: 50, reliability: 99 })
    expect(b.SN).toBeGreaterThan(a.SN)
  })

  it('rejects impossible inputs', () => {
    expect(() => requiredSN({ W18: 0, MR_MPa: 50 })).toThrow()
    expect(() => requiredSN({ W18: 1e5, MR_MPa: -1 })).toThrow()
    expect(() => requiredSN({ W18: 1e5, MR_MPa: 50, pi: 3, pt: 3.5 })).toThrow()
  })
})

describe('layer equation', () => {
  it('sums a·D·m over the layers (mm units)', () => {
    const r = layerSN([
      { name: 'Asphalt', a: TYPICAL_A.asphalt, D: 100 },
      { name: 'Base', a: TYPICAL_A.base, D: 200 },
      { name: 'Subbase', a: TYPICAL_A.subbase, D: 300, m: 1.2 },
    ])
    // 1.65354 + 1.10236 + 1.29921·1.2 = 4.31496
    expect(r.SNprovided).toBeCloseTo(4.31496, 4)
    expect(r.rows).toHaveLength(3)
    expect(r.rows[0].contribution).toBeCloseTo(1.65354, 4)
  })

  it('drainage coefficients scale only their layer', () => {
    const a = layerSN([{ name: 'Base', a: 0.00551181, D: 200 }])
    const b = layerSN([{ name: 'Base', a: 0.00551181, D: 200, m: 1.2 }])
    expect(b.SNprovided).toBeCloseTo(a.SNprovided * 1.2, 10)
  })

  it('checkLayers flags the shortfall against the required SN', () => {
    const r = checkLayers(4.345, 4.055)
    expect(r.ok).toBe(false)
    expect(r.shortfall).toBeCloseTo(0.29, 3)
    const ok = checkLayers(4.345, 4.5)
    expect(ok.ok).toBe(true)
    expect(ok.shortfall).toBe(0)
  })

  it('validates the layer inputs', () => {
    expect(() => layerSN([])).toThrow()
    expect(() => layerSN([{ name: 'X', a: 0, D: 100 }])).toThrow()
    expect(() => layerSN([{ name: 'X', a: 0.01, D: -5 }])).toThrow()
  })
})
