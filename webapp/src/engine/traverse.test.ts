import { describe, expect, it } from 'vitest'
import { solveTraverse, parseDir, azToBearing, type TraverseInput } from './traverse'

const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol)

// A perfect 100 m square: closure 0, area 10 000 m² = 1.0000 ha.
const SQUARE: TraverseInput = {
  courses: [
    { name: 'AB', length: 100, dir: 'N 0-0 E' },
    { name: 'BC', length: 100, dir: 'S 90-0 E' },
    { name: 'CD', length: 100, dir: 'S 0-0 W' },
    { name: 'DA', length: 100, dir: 'N 90-0 W' },
  ],
}

// Board-exam style lot with a deliberate misclosure: the closing course DA is
// 0.5 m short of perfection (141.42 would close exactly).
const LOT: TraverseInput = {
  courses: [
    { name: 'AB', length: 100, dir: 'N 0 E' },
    { name: 'BC', length: 100, dir: 'S 90 E' },
    { name: 'CA', length: 141.0, dir: 'S 45 W' },
  ],
}

describe('parseDir', () => {
  it('reads quadrant bearings in every spelling', () => {
    near(parseDir('N 45-30 E').az, (45.5 * Math.PI) / 180)
    near(parseDir('N45°30\'E').az, (45.5 * Math.PI) / 180)
    expect(parseDir('N 45-30 E').label).toBe('N 45°30′ E')
    near(parseDir('S 45 E').az, 3 * Math.PI / 4)
    near(parseDir('S 45 W').az, 5 * Math.PI / 4)
    near(parseDir('N 45 W').az, 7 * Math.PI / 4)
  })
  it('reads whole-circle azimuths', () => {
    near(parseDir('90').az, Math.PI / 2)
    expect(parseDir('135.5').label).toBe('Az 135.5000°')
    near(parseDir('370').az, (10 * Math.PI) / 180, 1e-12)
  })
  it('rejects garbage', () => {
    expect(() => parseDir('E 45 N')).toThrow()
    expect(() => parseDir('N 30-75 E')).toThrow(/Minutes/)
  })
})

describe('azToBearing', () => {
  it('round-trips the four quadrants', () => {
    expect(azToBearing(0)).toBe('N 0° E')
    expect(azToBearing(Math.PI / 2)).toBe('N 90° E')
    expect(azToBearing(Math.PI)).toBe('S 0° E')
    expect(azToBearing((270 * Math.PI) / 180)).toBe('N 90° W')
  })
})

describe('solveTraverse — perfect square', () => {
  const res = solveTraverse(SQUARE)

  it('closes exactly', () => {
    near(res.eLat, 0, 1e-9)
    near(res.eDep, 0, 1e-9)
    near(res.linear, 0, 1e-9)
  })
  it('area = 10 000 m² = 1.0000 ha by DMD', () => {
    near(res.areaM2, 10000, 1e-6)
    near(res.areaHa, 1.0, 1e-10)
  })
  it('adjustments vanish and vertices land on the square', () => {
    for (const r of res.rows) { near(r.adjLength, 100); near(r.cLat, 0); near(r.cDep, 0) }
    const v = res.vertices.map((p) => [p.x, p.y])
    expect(v[1][1]).toBeCloseTo(100) // B north of A
    expect(v[2][0]).toBeCloseTo(100) // C east
    expect(v[4][0]).toBeCloseTo(v[0][0]) // closes
    expect(v[4][1]).toBeCloseTo(v[0][1])
  })
  it('the closing vertex re-takes the start name (same monument, not a new station)', () => {
    const names = res.vertices.map((p) => p.name)
    expect(names[0]).toBe('A')
    expect(names[names.length - 1]).toBe('A')
  })
})

describe('solveTraverse — misclosed lot (Bowditch)', () => {
  const res = solveTraverse(LOT)

  it('raw closure equals the deliberate 0.5 m cut on the closing course', () => {
    // CA at 141.0 on S 45 W gives lat = dep = −99.70206 vs the exact −100:
    // ΣLat = ΣDep = +0.29794 (the chain falls 0.298 short on both axes)
    near(res.eLat, 100 - 141.0 * Math.cos(Math.PI / 4), 1e-9)
    near(res.eDep, res.eLat, 1e-9)
    near(res.linear, res.eLat * Math.SQRT2, 1e-9)
  })
  it('precision ≈ 1 in 809', () => {
    expect(res.precisionN).toBeGreaterThan(800)
    expect(res.precisionN).toBeLessThan(820)
  })
  it('Bowditch shares each correction in proportion to length', () => {
    const P = res.perimeter
    const [ab, , ca] = res.rows
    near(ab.cLat, -res.eLat * (100 / P))
    near(ca.cLat, -res.eLat * (141 / P))
    // adjusted chain sums to zero on both axes
    near(res.rows.reduce((s, r) => s + r.adjLat, 0), 0, 1e-7)
    near(res.rows.reduce((s, r) => s + r.adjDep, 0), 0, 1e-7)
  })
  it('area lands just under the perfect right triangle (5 000 m²)', () => {
    expect(res.areaM2).toBeGreaterThan(4900)
    expect(res.areaM2).toBeLessThan(5000)
  })
  it('transit rule also closes and lands within a hair of Bowditch here', () => {
    const t = solveTraverse({ ...LOT, rule: 'transit' })
    near(t.rows.reduce((s, r) => s + r.adjLat, 0), 0, 1e-7)
    expect(Math.abs(t.areaM2 - res.areaM2)).toBeLessThan(10)
  })
})

describe('solveTraverse — transit on a degenerate straight line', () => {
  it('refuses the transit rule with no latitude component instead of NaN', () => {
    // E 100 / W 60 / W 40: every lat is 0, so Σ|lat| = 0 divides the correction.
    expect(() => solveTraverse({
      courses: [
        { name: 'AB', length: 100, dir: 'N 90 E' },
        { name: 'BC', length: 60, dir: 'S 90 E' },
        { name: 'CA', length: 40, dir: 'S 90 E' },
      ],
      rule: 'transit',
    })).toThrow(/Transit rule/)
  })
})

describe('solveTraverse — rejections', () => {
  it('needs three courses', () => {
    expect(() => solveTraverse({ courses: SQUARE.courses.slice(0, 2) })).toThrow(/three/)
  })
  it('rejects non-positive lengths', () => {
    expect(() => solveTraverse({
      courses: [...SQUARE.courses.slice(0, 2), { name: 'CD', length: 0, dir: 'S 0 W' }],
    })).toThrow(/length/)
  })
  it('rejects unreadable directions', () => {
    expect(() => solveTraverse({
      courses: [...SQUARE.courses.slice(0, 2), { name: 'CD', length: 100, dir: 'toward the tree' }],
    })).toThrow(/Cannot read/)
  })
})
