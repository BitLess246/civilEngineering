import { describe, it, expect } from 'vitest'
import { plannedCurve, type CurveItem } from './progressCurve'

describe('plannedCurve', () => {
  it('a single activity ramps 0 → 100 linearly', () => {
    const c = plannedCurve([{ es: 0, ef: 10, weight: 1 }], 10, 10)
    expect(c[0]).toEqual({ t: 0, planned: 0 })
    expect(c[c.length - 1]).toEqual({ t: 10, planned: 100 })
    const mid = c.find((p) => p.t === 5)!
    expect(mid.planned).toBeCloseTo(50, 9)
  })

  it('is monotonic non-decreasing', () => {
    const items: CurveItem[] = [
      { es: 0, ef: 4, weight: 4 },
      { es: 4, ef: 10, weight: 6 },
    ]
    const c = plannedCurve(items, 10, 20)
    for (let i = 1; i < c.length; i++) expect(c[i].planned).toBeGreaterThanOrEqual(c[i - 1].planned - 1e-9)
    expect(c[0].planned).toBe(0)
    expect(c[c.length - 1].planned).toBeCloseTo(100, 9)
  })

  it('weights the mean by activity weight', () => {
    // A (weight 3) done by t=5; B (weight 1) not started until t=5.
    const c = plannedCurve([{ es: 0, ef: 5, weight: 3 }, { es: 5, ef: 10, weight: 1 }], 10, 10)
    const at5 = c.find((p) => p.t === 5)!
    expect(at5.planned).toBeCloseTo(75, 9)     // 3/4 of the weight complete
  })

  it('handles an empty set and zero duration without NaN', () => {
    expect(plannedCurve([], 10).every((p) => p.planned === 0)).toBe(true)
    const z = plannedCurve([{ es: 0, ef: 0, weight: 1 }], 0, 5)
    expect(z.every((p) => Number.isFinite(p.planned))).toBe(true)
  })
})
