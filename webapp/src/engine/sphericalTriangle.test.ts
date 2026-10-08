import { describe, it, expect } from 'vitest'
import { sphericalFromSides, sphericalFromSas, withRadius } from './sphericalTriangle'

describe('sphericalFromSides — known triangles', () => {
  it('the octant: three 90° sides give three 90° angles and E = 90°', () => {
    const t = sphericalFromSides({ a: 90, b: 90, c: 90 })
    expect(t.A).toBeCloseTo(90, 9)
    expect(t.B).toBeCloseTo(90, 9)
    expect(t.C).toBeCloseTo(90, 9)
    expect(t.E).toBeCloseTo(90, 9)
  })

  it('a tiny triangle is nearly plane: a 3-4 right spherical triangle keeps near-90° at C', () => {
    // sides a=3°, b=4°, c=5°: the planar 3-4-5 angles carry a small positive
    // excess (E ≈ 0.105° — the triangle's area on the unit sphere) split over
    // the three corners, so C sits about 0.035° above 90.
    const t = sphericalFromSides({ a: 3, b: 4, c: 5 })
    expect(t.C).toBeCloseTo(90.0349, 3)
    expect(t.A).toBeCloseTo(36.9048, 3)
    expect(t.B).toBeCloseTo(53.1650, 3)
    expect(t.E).toBeCloseTo(0.1048, 3)
    expect(t.E).toBeGreaterThan(0)
  })

  it('the classic equilateral case: three 60° sides', () => {
    // cos A = (cos60 − cos60²)/sin60² = (0.5 − 0.25)/0.75 = 1/3 → A ≈ 70.5288°
    const t = sphericalFromSides({ a: 60, b: 60, c: 60 })
    expect(t.A).toBeCloseTo(70.528779, 5)
    expect(t.E).toBeCloseTo(3 * 70.528779 - 180, 5)
  })
})

describe('sphericalFromSas — two sides and the included angle', () => {
  it('a=3°, b=4°, C=90° reproduces the near-plane 3-4-5', () => {
    const t = sphericalFromSas({ a: 3, b: 4, C: 90 })
    // c is the planar 5° to within 0.0015°; the excess (≈0.105°) lands on A and B.
    expect(t.c).toBeCloseTo(4.99854, 4)
    expect(t.A).toBeCloseTo(36.9174, 3)
    expect(t.B).toBeCloseTo(53.1874, 3)
    expect(t.E).toBeCloseTo(0.1048, 3)
  })

  it('an octant built from SAS: a=b=c=90° through C=90°', () => {
    const t = sphericalFromSas({ a: 90, b: 90, C: 90 })
    expect(t.c).toBeCloseTo(90, 9)
    expect(t.E).toBeCloseTo(90, 9)
  })

  it('SAS and SSS agree when fed the same triangle', () => {
    const sss = sphericalFromSides({ a: 50, b: 70, c: 80 })
    const sas = sphericalFromSas({ a: 50, b: 70, C: sss.C })
    expect(sas.c).toBeCloseTo(80, 9)
    expect(sas.A).toBeCloseTo(sss.A, 9)
    expect(sas.B).toBeCloseTo(sss.B, 9)
    expect(sas.E).toBeCloseTo(sss.E, 9)
  })

  it('excess grows with the included angle and stays under 180°', () => {
    const small = sphericalFromSas({ a: 20, b: 30, C: 30 })
    const big = sphericalFromSas({ a: 20, b: 30, C: 150 })
    expect(big.E).toBeGreaterThan(small.E)
    expect(small.E).toBeGreaterThan(0)
    expect(big.E).toBeLessThan(180)
  })
})

describe('sphericalFromSides — refuses what is not a triangle', () => {
  it('sides must sit strictly inside (0°, 180°)', () => {
    expect(() => sphericalFromSides({ a: 0, b: 60, c: 60 })).toThrow(/side a/)
    expect(() => sphericalFromSides({ a: 180, b: 60, c: 60 })).toThrow(/side a/)
    expect(() => sphericalFromSides({ a: NaN, b: 60, c: 60 })).toThrow(/side a/)
  })

  it('a side may not reach the sum of the other two', () => {
    // Degenerate: c = a + b collapses the third vertex onto the a-arc.
    expect(() => sphericalFromSides({ a: 40, b: 60, c: 100 })).toThrow(/less than the sum/)
    expect(() => sphericalFromSides({ a: 40, b: 60, c: 130 })).toThrow(/less than the sum/)
  })

  it('the perimeter must stay under 360°', () => {
    // 150+150+150 = 450: each side passes the inequalities, the perimeter does not.
    expect(() => sphericalFromSides({ a: 150, b: 150, c: 150 })).toThrow(/360°/)
  })
})

describe('withRadius — Girard on the Earth', () => {
  it('arc lengths convert degrees to distance on the sphere', () => {
    const t = sphericalFromSas({ a: 90, b: 90, C: 90 })
    const r = withRadius(t, 6371)
    // 90° of arc on Earth ≈ 10 007.5 km (a quarter meridian)
    expect(r.arcA).toBeCloseTo(Math.PI / 2 * 6371, 6)
    expect(r.arcA).toBeGreaterThan(10000)
    expect(r.arcA).toBeLessThan(10010)
  })

  it('one degree of excess covers ≈ 708,4 km²/… — the standard Earth figure scaled', () => {
    // Area = (π/180)·R² for E = 1°; R = 6371 → ≈ 708 437 km². Round-trip:
    // unit-sphere area equals E in radians (Girard with R = 1).
    const t = sphericalFromSides({ a: 90, b: 90, c: 90 })
    expect(withRadius(t, 1).area).toBeCloseTo(Math.PI / 2, 12) // E = 90° → π/2 sr
    const earth = withRadius(t, 6371)
    expect(earth.area).toBeCloseTo((Math.PI / 2) * 6371 * 6371, 6)
  })

  it('rejects a non-positive radius', () => {
    const t = sphericalFromSides({ a: 60, b: 60, c: 60 })
    expect(() => withRadius(t, 0)).toThrow(/radius/)
    expect(() => withRadius(t, -1)).toThrow(/radius/)
  })
})
