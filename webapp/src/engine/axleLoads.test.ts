import { describe, it, expect } from 'vitest'
import { axleLEF, groupLEF, esalFromAxles, t2kn, P_STD, AXLES_IN } from './axleLoads'

describe('the fourth-power law', () => {
  it('is unity at the 80 kN standard axle', () => {
    expect(axleLEF(80)).toBe(1)
    expect(P_STD).toBe(80)
  })

  it('reproduces the textbook ratios', () => {
    expect(axleLEF(120)).toBeCloseTo(5.0625, 6)   // 1.5⁴
    expect(axleLEF(40)).toBeCloseTo(0.0625, 6)    // 0.5⁴
    expect(axleLEF(160)).toBeCloseTo(16, 6)       // 2⁴
  })

  it('follows the exponent when it moves', () => {
    expect(axleLEF(120, 5)).toBeCloseTo(7.59375, 5)   // 1.5⁵
    expect(axleLEF(120, 3)).toBeCloseTo(3.375, 5)     // 1.5³
  })
})

describe('axle groups', () => {
  it('shares the load across the group axles', () => {
    expect(AXLES_IN.tandem).toBe(2)
    expect(groupLEF(150, 'tandem')).toBeCloseTo(2 * (75 / 80) ** 4, 6)
    expect(groupLEF(186, 'tridem')).toBeCloseTo(3 * (62 / 80) ** 4, 6)
  })

  it('a close group costs far less than the axles apart', () => {
    // 150 kN tandem standing alone twice: 2·(150/80)⁴ = 24.6
    expect(groupLEF(150, 'tandem')).toBeLessThan(2 * (150 / 80) ** 4)
  })

  it('refuses a nonsensical load', () => {
    expect(() => groupLEF(-10, 'tandem')).toThrow()
  })
})

describe('the traffic → ESALs run', () => {
  // 120 kN single at 100/day, 50 % directional: daily 253.125 ESALs,
  // W18 = 253.125 × 365 × 20 = 1,847,812.5 with no growth.
  const rows = [{ name: 'dump truck rear', kind: 'single' as const, loadK: 120, perDay: 100 }]
  it('carries the arithmetic with no growth', () => {
    const r = esalFromAxles({ rows, years: 20 })
    expect(r.dailyEsal).toBeCloseTo(253.125, 3)
    expect(r.W18).toBeCloseTo(1847812.5, 0)
    expect(r.growthFactor).toBe(20)
  })

  it('applies the growth factor at r > 0', () => {
    const r = esalFromAxles({ rows, growthPct: 2, years: 20 })
    // (1.02²⁰ − 1)/0.02 = 24.29737
    expect(r.growthFactor).toBeCloseTo(24.29737, 4)
    expect(r.W18).toBeCloseTo(253.125 * 365 * 24.29737, 0)
  })

  it('sums across rows and axle kinds', () => {
    const r = esalFromAxles({
      rows: [
        { name: 'a', kind: 'single', loadK: 120, perDay: 100 },
        { name: 'b', kind: 'tandem', loadK: 150, perDay: 200 },
      ],
      years: 20,
    })
    expect(r.dailyEsal).toBeCloseTo(253.125 + 200 * (2 * (75 / 80) ** 4) * 0.5, 3)
  })

  it('validates its inputs', () => {
    expect(() => esalFromAxles({ rows: [], years: 20 })).toThrow()
    expect(() => esalFromAxles({ rows, years: 0 })).toThrow()
    expect(() => esalFromAxles({ rows, years: 20, exponent: 9 })).toThrow()
  })
})

describe('unit helpers', () => {
  it('converts tonnes to kN', () => {
    expect(t2kn(1)).toBeCloseTo(9.80665, 5)
    expect(t2kn(8.16)).toBeCloseTo(80.02, 1)
  })
})
