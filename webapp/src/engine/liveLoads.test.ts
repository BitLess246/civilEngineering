import { describe, it, expect } from 'vitest'
import { TABLE_205_1, TABLE_206, liveLoadReduction } from './liveLoads'

describe('TABLE_205_1 — NSCP 2015 uniform live loads (kPa)', () => {
  it('contains at least one residential and one office entry', () => {
    expect(TABLE_205_1.some((o) => o.group === 'Residential')).toBe(true)
    expect(TABLE_205_1.some((o) => o.group === 'Office')).toBe(true)
  })

  it('dwelling basic floor = 1.9 kPa', () => {
    const item = TABLE_205_1.find((o) => o.id === 'res-dwelling')!
    expect(item).toBeDefined()
    expect(item.kPa).toBeCloseTo(1.9, 2)
  })

  it('storage heavy = 12.0 kPa', () => {
    const item = TABLE_205_1.find((o) => o.id === 'storage-heavy')!
    expect(item.kPa).toBeCloseTo(12.0, 2)
  })

  it('all kPa values are positive', () => {
    expect(TABLE_205_1.every((o) => o.kPa > 0)).toBe(true)
  })

  it('all entries have id, label, and group', () => {
    for (const o of TABLE_205_1) {
      expect(o.id.length).toBeGreaterThan(0)
      expect(o.label.length).toBeGreaterThan(0)
      expect(o.group.length).toBeGreaterThan(0)
    }
  })
})

describe('TABLE_206 — other minimum loads', () => {
  it('partition allowance = 1.0 kPa', () => {
    const part = TABLE_206.find((o) => o.id === 'partition-allow')!
    expect(part.kPa).toBeCloseTo(1.0, 2)
  })

  it('all entries have positive kPa', () => {
    expect(TABLE_206.every((o) => o.kPa > 0)).toBe(true)
  })
})

describe('liveLoadReduction — §205.6', () => {
  it('no reduction when KLL·AT ≤ 37.16 m²', () => {
    // KLL=2, AT=18 → 36 ≤ 37.16
    expect(liveLoadReduction(2.4, 18, 2, 1)).toBeCloseTo(2.4, 9)
  })

  it('applies reduction above the threshold', () => {
    // KLL=2, AT=100 → factor = 0.25 + 4.57/√200 ≈ 0.573; floor = max(0.573,0.50) = 0.573
    const Lo = 2.4
    const factor = 0.25 + 4.57 / Math.sqrt(2 * 100)
    const reduced = Lo * Math.min(1, Math.max(factor, 0.50))
    expect(liveLoadReduction(Lo, 100, 2, 1)).toBeCloseTo(reduced, 9)
  })

  it('reduced live load never exceeds Lo', () => {
    expect(liveLoadReduction(4.8, 200, 4, 1)).toBeLessThanOrEqual(4.8)
  })

  it('one-floor minimum factor = 0.50·Lo', () => {
    // Use very large AT to make the formula factor < 0.50
    const Lo = 2.4
    const result = liveLoadReduction(Lo, 10_000, 2, 1)
    expect(result).toBeGreaterThanOrEqual(Lo * 0.50 - 1e-9)
  })

  it('two-or-more-floor minimum factor = 0.40·Lo', () => {
    const Lo = 2.4
    const result = liveLoadReduction(Lo, 10_000, 2, 2)
    expect(result).toBeGreaterThanOrEqual(Lo * 0.40 - 1e-9)
    // Two-floor minimum is lower than one-floor minimum
    expect(result).toBeLessThanOrEqual(liveLoadReduction(Lo, 10_000, 2, 1) + 1e-9)
  })

  it('uses default KLL=2 (beam) when not specified', () => {
    // KLL=2 is the default for beams; result should match explicit KLL=2
    const Lo = 3.6, AT = 60
    expect(liveLoadReduction(Lo, AT)).toBeCloseTo(liveLoadReduction(Lo, AT, 2, 1), 9)
  })
})
