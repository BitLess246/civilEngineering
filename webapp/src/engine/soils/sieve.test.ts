import { describe, it, expect } from 'vitest'
import {
  gradation, interpolateD, passingAt, isWellGraded,
  SIEVE_NO4, SIEVE_NO200, type SieveInput,
} from './sieve'

/** A well-graded sand: 500 g stack closing exactly. */
const wellGradedSand: SieveInput = {
  totalMass: 500,
  readings: [
    { size: 9.5, designation: '3/8 in', massRetained: 10 },
    { size: 4.75, designation: 'No. 4', massRetained: 40 },
    { size: 2.0, designation: 'No. 10', massRetained: 75 },
    { size: 0.85, designation: 'No. 20', massRetained: 100 },
    { size: 0.425, designation: 'No. 40', massRetained: 110 },
    { size: 0.15, designation: 'No. 100', massRetained: 100 },
    { size: 0.075, designation: 'No. 200', massRetained: 45 },
  ],
  panMass: 20,
}

describe('gradation table', () => {
  const r = gradation(wellGradedSand)

  it('computes percent retained, cumulative and passing', () => {
    expect(r.rows[0].percentRetained).toBeCloseTo(2, 10)      // 10/500
    expect(r.rows[0].percentPassing).toBeCloseTo(98, 10)
    expect(r.rows[1].cumulativeRetained).toBeCloseTo(10, 10)  // (10+40)/500
    expect(r.rows[1].percentPassing).toBeCloseTo(90, 10)
  })

  it('orders the stack coarse to fine regardless of input order', () => {
    const shuffled = gradation({
      ...wellGradedSand,
      readings: [...wellGradedSand.readings].reverse(),
    })
    expect(shuffled.rows.map((x) => x.size)).toEqual([9.5, 4.75, 2.0, 0.85, 0.425, 0.15, 0.075])
  })

  it('closes the mass balance', () => {
    expect(r.massError).toBeCloseTo(0, 10)
    expect(r.notes.join(' ')).not.toMatch(/Mass balance/)
  })

  it('splits gravel, sand and fines at the D2487 boundaries', () => {
    // Passing No.4 = 90%, passing No.200 = 4%.
    expect(r.gravel).toBeCloseTo(10, 10)
    expect(r.sand).toBeCloseTo(86, 10)
    expect(r.fines).toBeCloseTo(4, 10)
    expect(r.gravel + r.sand + r.fines + r.cobbles).toBeCloseTo(100, 8)
  })
})

describe('mass balance is reported, never silently corrected', () => {
  it('flags a stack that does not close within 1%', () => {
    const r = gradation({ ...wellGradedSand, panMass: 60 })   // 40 g surplus = 8%
    expect(Math.abs(r.massError)).toBeGreaterThan(1)
    expect(r.notes.join(' ')).toMatch(/Mass balance is off by 8\.0%/)
  })

  it('never prints a negative percent passing', () => {
    // An over-weighed stack would drive the cumulative past 100%; the reader
    // would read a negative passing value as a data-entry error in the wrong
    // place, so it is clamped and the mass error reported instead.
    const r = gradation({
      totalMass: 100,
      readings: [{ size: 4.75, massRetained: 80 }, { size: 0.075, massRetained: 40 }],
    })
    expect(r.rows.every((x) => x.percentPassing >= 0)).toBe(true)
    expect(r.notes.join(' ')).toMatch(/Mass balance/)
  })

  it('refuses a zero or negative total mass', () => {
    expect(() => gradation({ totalMass: 0, readings: [] })).toThrow(/greater than zero/)
  })
})

describe('D-sizes interpolate on a LOG scale', () => {
  it('puts the midpoint at the geometric mean, not the arithmetic one', () => {
    // 50% passing between 2 mm @ 60% and 0.2 mm @ 40%: the log midpoint is
    // √(2 × 0.2) = 0.632 mm. Linear interpolation would give 1.1 mm — nearly
    // double, which is why every grain-size curve is drawn on a log axis.
    const rows = [
      { size: 2.0, massRetained: 0, percentRetained: 0, cumulativeRetained: 40, percentPassing: 60 },
      { size: 0.2, massRetained: 0, percentRetained: 0, cumulativeRetained: 60, percentPassing: 40 },
    ]
    const d50 = interpolateD(rows, 50)!
    expect(d50).toBeCloseTo(Math.sqrt(2.0 * 0.2), 10)
    expect(d50).toBeCloseTo(0.6325, 4)
    expect(d50).toBeLessThan(1.1)
  })

  it('returns the exact sieve size when a reading lands on the percentage', () => {
    const rows = [
      { size: 2.0, massRetained: 0, percentRetained: 0, cumulativeRetained: 40, percentPassing: 60 },
      { size: 0.5, massRetained: 0, percentRetained: 0, cumulativeRetained: 90, percentPassing: 10 },
    ]
    expect(interpolateD(rows, 60)).toBeCloseTo(2.0, 10)
    expect(interpolateD(rows, 10)).toBeCloseTo(0.5, 10)
  })

  it('returns undefined when the curve never reaches the percentage', () => {
    // "Unknown" is the honest answer — a soil with 15% fines has no D10 from
    // sieving alone, and inventing one would flow straight into Cu and Cc.
    const r = gradation({
      totalMass: 100,
      readings: [
        { size: 4.75, massRetained: 20 },
        { size: 0.425, massRetained: 45 },
        { size: 0.075, massRetained: 20 },
      ],
      panMass: 15,
    })
    expect(r.fines).toBeCloseTo(15, 10)
    expect(r.d10).toBeUndefined()
    expect(r.cu).toBeUndefined()
    expect(r.cc).toBeUndefined()
    expect(r.notes.join(' ')).toMatch(/hydrometer/)
  })
})

describe('passingAt', () => {
  const r = gradation(wellGradedSand)

  it('reads an exact sieve without interpolating', () => {
    expect(passingAt(r.rows, SIEVE_NO4)).toBeCloseTo(90, 10)
    expect(passingAt(r.rows, SIEVE_NO200)).toBeCloseTo(4, 10)
  })

  it('saturates above the coarsest and below the finest sieve', () => {
    expect(passingAt(r.rows, 100)).toBe(100)
    expect(passingAt(r.rows, 0.001)).toBeCloseTo(4, 10)
  })
})

describe('Cu and Cc', () => {
  it('computes the shape parameters from the D-sizes', () => {
    const r = gradation(wellGradedSand)
    expect(r.d10).toBeDefined()
    expect(r.cu).toBeCloseTo(r.d60! / r.d10!, 10)
    expect(r.cc).toBeCloseTo((r.d30! * r.d30!) / (r.d10! * r.d60!), 10)
  })

  it('applies the D2487 gradation criteria — Cu ≥ 6 for sand, ≥ 4 for gravel', () => {
    expect(isWellGraded(6, 2, 'sand')).toBe(true)
    expect(isWellGraded(5.9, 2, 'sand')).toBe(false)
    expect(isWellGraded(5, 2, 'gravel')).toBe(true)
    expect(isWellGraded(3.9, 2, 'gravel')).toBe(false)
  })

  it('requires Cc between 1 and 3 inclusive', () => {
    expect(isWellGraded(10, 1, 'sand')).toBe(true)
    expect(isWellGraded(10, 3, 'sand')).toBe(true)
    expect(isWellGraded(10, 0.9, 'sand')).toBe(false)
    expect(isWellGraded(10, 3.1, 'sand')).toBe(false)
  })

  it('says UNKNOWN rather than "poorly graded" when the parameters are missing', () => {
    // The distinction matters: poorly graded is a finding, unknown is a gap.
    expect(isWellGraded(undefined, 2, 'sand')).toBeUndefined()
    expect(isWellGraded(8, undefined, 'sand')).toBeUndefined()
  })
})

describe('cobbles', () => {
  it('separates the plus-75 mm fraction and says D2487 excludes it', () => {
    const r = gradation({
      totalMass: 1000,
      readings: [
        { size: 100, massRetained: 150 },
        { size: 75, massRetained: 50 },
        { size: 4.75, massRetained: 500 },
        { size: 0.075, massRetained: 250 },
      ],
      panMass: 50,
    })
    // Retained ON the 75 mm sieve and coarser: 150 + 50 = 200 g of 1000 g.
    expect(r.cobbles).toBeCloseTo(20, 10)
    expect(r.gravel).toBeCloseTo(50, 10)
    expect(r.sand).toBeCloseTo(25, 10)
    expect(r.fines).toBeCloseTo(5, 10)
    expect(r.notes.join(' ')).toMatch(/coarser than 75 mm/)
  })
})
