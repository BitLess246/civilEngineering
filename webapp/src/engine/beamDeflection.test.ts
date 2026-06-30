import { describe, it, expect } from 'vitest'
import { minBeamThickness, deflCoeff, crackedInertia, longTermMultiplier } from './beamDeflection'
import { Ec } from './slabDeflection'

describe('minBeamThickness — Table 409.3.1.1', () => {
  it('ℓ/16, ℓ/18.5, ℓ/21, ℓ/8 at fy = 420 (no fy modifier)', () => {
    expect(minBeamThickness(6, 'simple', 420)).toBeCloseTo(6000 / 16, 6)
    expect(minBeamThickness(6, 'one-end', 420)).toBeCloseTo(6000 / 18.5, 6)
    expect(minBeamThickness(6, 'both-ends', 420)).toBeCloseTo(6000 / 21, 6)
    expect(minBeamThickness(6, 'cantilever', 420)).toBeCloseTo(6000 / 8, 6)
  })
  it('applies the (0.4 + fy/700) factor for fy ≠ 420', () => {
    expect(minBeamThickness(6, 'simple', 280)).toBeCloseTo((6000 / 16) * (0.4 + 280 / 700), 6)
    expect(minBeamThickness(6, 'simple', 280)).toBeLessThan(minBeamThickness(6, 'simple', 420))
  })
})

describe('deflection coefficients', () => {
  it('simple 5, fixed-fixed 1, cantilever 48', () => {
    expect(deflCoeff('simple')).toBe(5)
    expect(deflCoeff('both-ends')).toBe(1)
    expect(deflCoeff('cantilever')).toBe(48)
  })
})

describe('crackedInertia (doubly reinforced)', () => {
  const base = { b: 300, d: 440, As: 1500, fc: 28 }
  it('singly-reinforced matches the transformed-section neutral-axis result', () => {
    const n = 200000 / Ec(28)
    const rhoN = (n * 1500) / (300 * 440)
    const k = Math.sqrt(2 * rhoN + rhoN ** 2) - rhoN
    const kd = k * 440
    const expected = (300 * kd ** 3) / 3 + n * 1500 * (440 - kd) ** 2
    expect(crackedInertia(base)).toBeCloseTo(expected, 0)
  })
  it('compression steel increases Icr', () => {
    expect(crackedInertia({ ...base, AsPrime: 800, dPrime: 50 })).toBeGreaterThan(crackedInertia(base))
  })
  it('Icr is well below the gross Ig (section is cracked)', () => {
    expect(crackedInertia(base)).toBeLessThan((300 * 500 ** 3) / 12)
  })
})

describe('longTermMultiplier λΔ = ξ/(1+50ρ′)', () => {
  it('ξ = 2.0 with no compression steel; compression steel reduces it', () => {
    expect(longTermMultiplier(0)).toBeCloseTo(2.0, 9)
    expect(longTermMultiplier(0.01)).toBeCloseTo(2 / (1 + 0.5), 9)
    expect(longTermMultiplier(0.02)).toBeLessThan(longTermMultiplier(0.01))
  })
})
