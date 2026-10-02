import { describe, expect, it } from 'vitest'
import { solveRational, tcKirpich, tcFaa, idfIntensity, type RationalInput } from './rationalMethod'

const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol)

// Hand case: C = 0.6, i = 100 mm/h, A = 2.5 ha → Q = 0.6·100·2.5/360 = 0.41667 m³/s
const SIMPLE: RationalInput = {
  subAreas: [{ name: 'lawn', c: 0.6, a: 2.5 }],
  intensity: { mode: 'direct', mmPerHour: 100 },
  tc: { mode: 'direct', minutes: 12 },
}

describe('tcKirpich (SI)', () => {
  it('L = 500 m, S = 0.02 → ≈ 10.51 min (both unit forms agree to rounding)', () => {
    near(tcKirpich(500, 0.02), 10.51, 1e-2)
    // the US form with the same reach: L = 1640.42 ft, S = 0.02, K = 0.0078 —
    // the SI K is its rounded conversion, so agreement is ~1 ms, not machine
    const us = 0.0078 * Math.pow(500 / 0.3048, 0.77) * Math.pow(0.02, -0.385)
    near(tcKirpich(500, 0.02), us, 2e-3)
  })
  it('refuses non-positive length or slope', () => {
    expect(() => tcKirpich(0, 0.02)).toThrow(/length/)
    expect(() => tcKirpich(500, 0)).toThrow(/slope/)
  })
})

describe('tcFaa', () => {
  it('L = 100 m, S = 2 %, C = 0.5 → ≈ 15.53 min', () => {
    near(tcFaa(100, 2, 0.5), 15.53, 1e-2)
  })
  it('a higher C shortens Tc (1.1 − C shrinks)', () => {
    expect(tcFaa(100, 2, 0.8)).toBeLessThan(tcFaa(100, 2, 0.5))
  })
})

describe('idfIntensity', () => {
  it('i = 760/(Tc + 10) — c defaults to 1', () => {
    near(idfIntensity(760, 10, undefined, 10), 38)
    near(idfIntensity(760, 10, undefined, 30), 19)
  })
  it('exponent form i = a/(Tc + b)^c works', () => {
    near(idfIntensity(1000, 10, 0.5, 15), 1000 / Math.pow(25, 0.5))
  })
})

describe('solveRational', () => {
  const res = solveRational(SIMPLE)

  it('Q = C·i·A/360 = 0.41667 m³/s = 416.67 L/s = 14.71 cfs', () => {
    near(res.Q, 0.4166667, 1e-6)
    near(res.Qls, 416.6667, 1e-4)
    near(res.Qcfs, 14.714, 1e-2)
  })
  it('passes the single C/A through unchanged', () => {
    near(res.C, 0.6)
    near(res.A, 2.5)
    near(res.tcMin, 12)
    expect(res.tcMethod).toBe('direct')
    expect(res.warnings).toHaveLength(0)
  })
  it('composites C = Σ CiAi/ΣAi across sub-areas', () => {
    const r = solveRational({
      ...SIMPLE,
      subAreas: [
        { name: 'roof', c: 0.9, a: 1 },
        { name: 'grass', c: 0.3, a: 3 },
      ],
    })
    near(r.C, (0.9 * 1 + 0.3 * 3) / 4)
    near(r.A, 4)
    near(r.Q, ((0.9 + 0.9) / 4) * 100 * 4 / 360) // C = 0.45
  })
})

describe('solveRational — IDF and Tc plumbing', () => {
  it('IDF reads Tc from the chosen method before computing i', () => {
    // Kirpich for L = 500 m, S = 0.02 → 10.52 min; i = 760/(10.52+10) = 37.03
    const r = solveRational({
      ...SIMPLE,
      intensity: { mode: 'idf', a: 760, b: 10 },
      tc: { mode: 'kirpich', lengthM: 500, slope: 0.02 },
    })
    near(r.tcMin, tcKirpich(500, 0.02), 1e-9)
    near(r.i, 760 / (r.tcMin + 10), 1e-9)
    near(r.Q, (0.6 * r.i * 2.5) / 360, 1e-9)
  })
  it('FAA uses the composite C', () => {
    const r = solveRational({
      ...SIMPLE,
      subAreas: [{ name: 'paved', c: 0.8, a: 2 }],
      tc: { mode: 'faa', lengthM: 100, slopePct: 2 },
    })
    near(r.tcMin, tcFaa(100, 2, 0.8), 1e-9)
  })
  it('floors Tc at 5 minutes with a warning', () => {
    const r = solveRational({
      ...SIMPLE,
      tc: { mode: 'kirpich', lengthM: 20, slope: 0.3 },
    })
    expect(r.tcMin).toBe(5)
    expect(r.warnings.some((w) => w.includes('5-minute'))).toBe(true)
  })
})

describe('solveRational — rejections', () => {
  it('refuses C outside 0–1 and empty catchments', () => {
    expect(() => solveRational({
      ...SIMPLE,
      subAreas: [{ name: 'x', c: 1.5, a: 1 }],
    })).toThrow(/0–1/)
    expect(() => solveRational({
      ...SIMPLE,
      subAreas: [],
    })).toThrow(/sub-area/)
  })
  it('refuses non-positive intensity', () => {
    expect(() => solveRational({ ...SIMPLE, intensity: { mode: 'direct', mmPerHour: 0 } })).toThrow(/intensity/)
  })
})
