import { describe, it, expect } from 'vitest'
import { muskingumCoefficients, muskingumStep, muskingumRoute } from './muskingum'

describe('Muskingum coefficients', () => {
  it('K = 2.3 h, X = 0.2, Δt = 1 h → C0 0.017094, C1 0.410256, C2 0.572650', () => {
    const { C0, C1, C2 } = muskingumCoefficients(2.3, 0.2, 1)
    expect(C0).toBeCloseTo(0.0170940, 6)
    expect(C1).toBeCloseTo(0.4102564, 6)
    expect(C2).toBeCloseTo(0.5726496, 6)
  })

  it('coefficients always sum to one', () => {
    for (const [K, X, dt] of [[3, 0.1, 2], [5, 0.25, 4], [1.2, 0, 0.8], [2, 0.4, 1.7]]) {
      const { C0, C1, C2 } = muskingumCoefficients(K, X, dt)
      expect(C0 + C1 + C2).toBeCloseTo(1, 10)
    }
  })

  it('pure translation X = 0.5, Δt = K splits into halves', () => {
    const { C0, C1, C2 } = muskingumCoefficients(2, 0.5, 2)
    expect(C0).toBeCloseTo(0, 10)
    expect(C1).toBeCloseTo(1, 10)
    expect(C2).toBeCloseTo(0, 10)
  })

  it('refuses the unstable windows (C0 < 0 or C2 < 0)', () => {
    expect(() => muskingumCoefficients(2.3, 0.2, 0.5)).toThrow(/2KX/)
    expect(() => muskingumCoefficients(2.3, 0.2, 4)).toThrow(/2K\(1−X\)/)
    expect(() => muskingumCoefficients(2.3, 0.6, 1)).toThrow(/0 and 0\.5/)
  })
})

describe('routing recurrence', () => {
  it('first two ordinates match the hand computation', () => {
    // K = 2.3, X = 0.2, Δt = 1; I = [10, 50, 90, 60, 30, 10, 10]
    const r = muskingumRoute({ K: 2.3, X: 0.2, dt: 1, inflow: [10, 50, 90, 60, 30, 10, 10] })
    // O1 = C0·50 + C1·10 + C2·10 = 0.85470 + 4.10256 + 5.72650
    expect(r.outflow[1]).toBeCloseTo(10.68376, 4)
    // O2 = C0·90 + C1·50 + C2·10.683761
    expect(r.outflow[2]).toBeCloseTo(28.169333, 5)
  })

  it('steady inflow passes through unchanged', () => {
    const r = muskingumRoute({ K: 2, X: 0.25, dt: 1, inflow: Array(8).fill(42) })
    for (const o of r.outflow) expect(o).toBeCloseTo(42, 9)
  })

  it('volumes use the full trapezoid on a nonzero-start hydrograph', () => {
    // 8 × 42 m³/s at Δt = 1 h: (336 − 42)·3600 = 1 058 400 m³. Dropping the
    // first ordinate would report 1 134 000 m³ (+7.1 %).
    const r = muskingumRoute({ K: 2, X: 0.25, dt: 1, inflow: Array(8).fill(42) })
    expect(r.volumeIn).toBeCloseTo(1058400, 3)
    expect(r.volumeOut).toBeCloseTo(1058400, 3)
  })

  it('continuity: trap(I) − trap(O) = S_end − S_0 exactly', () => {
    const inflow = [0, 20, 55, 80, 60, 35, 15, 5, 2, 0, 0]
    const dt = 1
    const r = muskingumRoute({ K: 2.3, X: 0.2, dt, inflow })
    const trap = (qs: number[]) => qs.reduce((s, q) => s + q, 0) - (qs[0] + qs[qs.length - 1]) / 2
    const S = (I: number, O: number) => 2.3 * (0.2 * I + 0.8 * O)
    const dS = S(inflow[inflow.length - 1], r.outflow[r.outflow.length - 1]) - S(inflow[0], r.outflow[0])
    expect(trap(inflow) - trap(r.outflow)).toBeCloseTo(dS, 6)
  })

  it('attenuates the peak and lags it', () => {
    const r = muskingumRoute({ K: 1, X: 0.2, dt: 0.5, inflow: [0, 10, 30, 60, 90, 70, 45, 25, 12, 5, 0] })
    expect(r.peakOut).toBeCloseTo(65.0317, 3)
    expect(r.peakOut).toBeLessThan(r.peakIn)
    expect(r.tPeakOut).toBeCloseTo(3.0, 6)
    expect(r.tPeakIn).toBeCloseTo(2.0, 6)
    expect(r.lagHr).toBeCloseTo(1.0, 6)
  })

  it('single-step recurrence matches its algebra', () => {
    expect(muskingumStep(0.1, 0.5, 0.4, 100, 200, 80)).toBeCloseTo(0.1 * 200 + 0.5 * 100 + 0.4 * 80, 10)
  })
})
