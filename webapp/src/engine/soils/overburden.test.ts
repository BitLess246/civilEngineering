import { describe, it, expect } from 'vitest'
import {
  verticalStress, effectiveStressAt, buoyantUnitWeight, GAMMA_W, type StressLayer,
} from './overburden'

const profile: StressLayer[] = [
  { thickness: 3, gamma: 18, gammaSat: 20 },
  { thickness: 6, gamma: 17, gammaSat: 19 },
  { thickness: 6, gamma: 19, gammaSat: 21 },
]

describe('dry profile', () => {
  it('accumulates γ·H with no pore pressure', () => {
    const r = verticalStress(profile, 3)
    expect(r.total).toBeCloseTo(3 * 18, 10)
    expect(r.pore).toBe(0)
    expect(r.effective).toBeCloseTo(54, 10)
  })

  it('sums across layers', () => {
    const r = verticalStress(profile, 9)
    expect(r.total).toBeCloseTo(3 * 18 + 6 * 17, 10)   // 54 + 102 = 156
    expect(r.effective).toBeCloseTo(156, 10)
  })

  it('is zero at the surface', () => {
    const r = verticalStress(profile, 0)
    expect(r.total).toBe(0)
    expect(r.effective).toBe(0)
  })
})

describe('with a water table', () => {
  it('uses saturated unit weight below the table and moist above', () => {
    // Water table at 3 m; stress at 9 m.
    // Total = 3(18) + 6(19) = 54 + 114 = 168
    // Pore  = 6 × 9.81 = 58.86
    // σ′    = 109.14
    const r = verticalStress(profile, 9, 3)
    expect(r.total).toBeCloseTo(168, 10)
    expect(r.pore).toBeCloseTo(6 * GAMMA_W, 10)
    expect(r.effective).toBeCloseTo(168 - 6 * GAMMA_W, 10)
  })

  it('splits a layer that straddles the water table', () => {
    // Table at 5 m, inside the second layer (3–9 m).
    // Total = 3(18) + 2(17) + 4(19) = 54 + 34 + 76 = 164
    const r = verticalStress(profile, 9, 5)
    expect(r.total).toBeCloseTo(164, 10)
    expect(r.pore).toBeCloseTo(4 * GAMMA_W, 10)
  })

  it('does NOT use the midpoint unit weight for a straddling layer', () => {
    // Taking whichever γ applies at the layer midpoint would give
    // 3(18) + 6(19) = 168 (midpoint 6 m is below the 5 m table).
    // The correct split gives 164 — a 4 kPa difference that grows with
    // thickness and flows straight into (N₁)₆₀.
    expect(verticalStress(profile, 9, 5).total).not.toBeCloseTo(168, 6)
  })

  it('gives buoyant unit weight below the table', () => {
    // Effective stress increment per metre below the table is γsat − γw.
    const a = verticalStress(profile, 4, 3).effective
    const b = verticalStress(profile, 5, 3).effective
    expect(b - a).toBeCloseTo(19 - GAMMA_W, 10)
    expect(buoyantUnitWeight(19)).toBeCloseTo(19 - GAMMA_W, 10)
  })

  it('reads lower than the same profile dry — buoyancy is not optional', () => {
    expect(verticalStress(profile, 15, 3).effective)
      .toBeLessThan(verticalStress(profile, 15).effective)
  })
})

describe('missing data is reported, not absorbed', () => {
  it('warns when a submerged layer has no saturated unit weight', () => {
    const noSat: StressLayer[] = [{ thickness: 10, gamma: 18 }]
    const r = verticalStress(noSat, 8, 2)
    expect(r.notes.join(' ')).toMatch(/no saturated unit weight/)
    expect(r.notes.join(' ')).toMatch(/read low/)
  })

  it('does not warn when the layer never gets wet', () => {
    const noSat: StressLayer[] = [{ thickness: 10, gamma: 18 }]
    expect(verticalStress(noSat, 8).notes).toEqual([])
  })

  it('warns when asked below the logged profile', () => {
    const r = verticalStress(profile, 25)
    expect(r.notes.join(' ')).toMatch(/below the logged profile/)
    // It still returns the stress at the base rather than throwing.
    expect(r.total).toBeCloseTo(3 * 18 + 6 * 17 + 6 * 19, 10)
  })

  it('rejects a negative depth', () => {
    expect(() => verticalStress(profile, -1)).toThrow(/must not be negative/)
  })
})

describe('effectiveStressAt shorthand', () => {
  it('matches the full result', () => {
    expect(effectiveStressAt(profile, 9, 3)).toBeCloseTo(verticalStress(profile, 9, 3).effective, 10)
  })

  it('feeds a sensible C_N range for a real profile', () => {
    // A shallow test in this profile should sit above the reference stress
    // only near the surface; by 9 m σ′ is comfortably above 100 kPa.
    expect(effectiveStressAt(profile, 2, 3)).toBeLessThan(100)
    expect(effectiveStressAt(profile, 9, 3)).toBeGreaterThan(100)
  })
})
