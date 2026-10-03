import { describe, it, expect } from 'vitest'
import { weirDischarge, headForQ, froudeOfApproach } from './weirFlow'

describe('rectangular weirs (Francis)', () => {
  it('suppressed: Q = 1.84·L·H^1.5', () => {
    // L = 2, H = 0.5 → 1.84·2·0.5^1.5 = 1.3010
    const r = weirDischarge({ shape: 'rectSuppressed', H: 0.5, L: 2 })
    expect(r.Q).toBeCloseTo(1.84 * 2 * Math.pow(0.5, 1.5), 12)
    expect(r.effectiveLength).toBe(2)
  })

  it('contracted: two end contractions steal 0.1·n·H of crest', () => {
    // L = 2, H = 0.5, n = 2 → L′ = 1.9 → Q = 1.2335
    const r = weirDischarge({ shape: 'rectContracted', H: 0.5, L: 2, n: 2 })
    expect(r.effectiveLength).toBeCloseTo(1.9, 12)
    expect(r.Q).toBeCloseTo(1.84 * 1.9 * Math.pow(0.5, 1.5), 12)
    expect(r.notes[0]).toMatch(/1\.900/)
  })

  it('velocity of approach: H + ha with the ha^1.5 term removed', () => {
    // L = 2, H = 0.5, ha = 0.04: Q = 1.84·2·(0.54^1.5 − 0.04^1.5)
    const r = weirDischarge({ shape: 'rectSuppressed', H: 0.5, L: 2, ha: 0.04 })
    const expectQ = 1.84 * 2 * (Math.pow(0.54, 1.5) - Math.pow(0.04, 1.5))
    expect(r.Q).toBeCloseTo(expectQ, 12)
    expect(r.Q).toBeGreaterThan(1.84 * 2 * Math.pow(0.5, 1.5))
    expect(r.notes[0]).toMatch(/approach/)
  })
})

describe('Cipolletti', () => {
  it('Q = 1.86·L·H^1.5 — no contraction correction needed', () => {
    const r = weirDischarge({ shape: 'cipolletti', H: 0.5, L: 2 })
    expect(r.Q).toBeCloseTo(1.86 * 2 * Math.pow(0.5, 1.5), 12)
  })
})

describe('V-notch', () => {
  it('general formula Q = (8/15)·Cd·√(2g)·tan(θ/2)·H^2.5', () => {
    // θ = 90°, Cd = 0.6, H = 0.3 → (8/15)·0.6·4.4294·1·0.3^2.5
    const r = weirDischarge({ shape: 'vnotch', H: 0.3, angle: 90, Cd: 0.6 })
    const expectQ = (8 / 15) * 0.6 * Math.sqrt(2 * 9.81) * Math.tan(Math.PI / 4) * Math.pow(0.3, 2.5)
    expect(r.Q).toBeCloseTo(expectQ, 12)
    expect(r.effectiveLength).toBeCloseTo(0.6, 12) // 2·H·tan(45°)
  })

  it('carries Cone\'s 90° empirical fit as a cross-check note', () => {
    const r = weirDischarge({ shape: 'vnotch', H: 0.3, angle: 90, Cd: 0.6 })
    const cone = 1.343 * Math.pow(0.3, 2.48)
    expect(r.notes[0]).toContain(cone.toFixed(4))
    // Cone's fit sits within ~4 % of the general Cd = 0.6 formula
    expect(Math.abs(r.Q - cone) / cone).toBeLessThan(0.05)
  })

  it('scales with tan(θ/2): a 60° notch passes about 42 % less than 90°', () => {
    const q90 = weirDischarge({ shape: 'vnotch', H: 0.3, angle: 90 }).Q
    const q60 = weirDischarge({ shape: 'vnotch', H: 0.3, angle: 60 }).Q
    expect(q60 / q90).toBeCloseTo(Math.tan(Math.PI / 6) / Math.tan(Math.PI / 4), 12)
  })
})

describe('broad-crested', () => {
  it('ideal critical flow: Q = 1.705·b·H^1.5', () => {
    const r = weirDischarge({ shape: 'broadCrested', H: 0.4, L: 1.5 })
    expect(r.Q).toBeCloseTo(1.705 * 1.5 * Math.pow(0.4, 1.5), 12)
    expect(r.notes[0]).toMatch(/1\.705/)
  })

  it('accepts a loss coefficient below 1', () => {
    const r = weirDischarge({ shape: 'broadCrested', H: 0.4, L: 1.5, Cb: 0.9 })
    expect(r.Q).toBeCloseTo(0.9 * 1.705 * 1.5 * Math.pow(0.4, 1.5), 12)
  })
})

describe('head for a target discharge (inverse)', () => {
  it('round-trips every shape to machine precision', () => {
    const cases = [
      { shape: 'rectSuppressed' as const, Q: 1.3010, L: 2 },
      { shape: 'rectContracted' as const, Q: 1.2335, L: 2, n: 2 },
      { shape: 'cipolletti' as const, Q: 1.3152, L: 2 },
      { shape: 'vnotch' as const, Q: 0.07, angle: 90 },
      { shape: 'broadCrested' as const, Q: 0.647, L: 1.5 },
    ]
    for (const c of cases) {
      const H = headForQ(c)
      const back = weirDischarge({ ...c, H }).Q
      expect(back, `${c.shape}`).toBeCloseTo(c.Q, 6)
    }
  })

  it('recovers a known head: inverting the general formula at its own 0.6 m value returns 0.6', () => {
    const target = (8 / 15) * 0.6 * Math.sqrt(2 * 9.81) * Math.pow(0.6, 2.5)
    const H = headForQ({ shape: 'vnotch', Q: target, angle: 90, Cd: 0.6 })
    expect(H).toBeCloseTo(0.6, 6)
    // Cone's empirical fit at the same head sits within ~5 % of the general formula
    expect(1.343 * Math.pow(0.6, 2.48) / target).toBeGreaterThan(0.94)
    expect(1.343 * Math.pow(0.6, 2.48) / target).toBeLessThan(1.0)
  })

  it('refuses a non-positive target', () => {
    expect(() => headForQ({ shape: 'rectSuppressed', Q: 0, L: 2 })).toThrow(/positive/)
  })
})

describe('approach Froude number', () => {
  it('flags subcritical approach flow', () => {
    // 1 m² area, 1 m top width, 0.5 m³/s → V = 0.5, Fr = 0.5/√(9.81·1) = 0.16
    expect(froudeOfApproach(0.5, 1, 1)).toBeCloseTo(0.5 / Math.sqrt(9.81), 9)
  })
})
