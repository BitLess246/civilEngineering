import { describe, it, expect } from 'vitest'
import { combineGrading, passingOnCurve, CLAY_SIZE } from './grading'
import { gradation, type SieveInput } from './sieve'
import { hydrometer, type HydrometerData } from './lab/hydrometer'

// ─────────────────────────────────────────────────────────────────────────
// The merge exists for one measurable reason: a soil with more than ~10%
// fines has no D₁₀ from sieving, so no Cu, so no dual symbol. These check
// that joining the curves produces it, that the join is policed rather than
// papered over, and that a pass-through with no sedimentation run changes
// nothing.
// ─────────────────────────────────────────────────────────────────────────

/** 11% fines: the band where D2487 wants a dual symbol and sieving cannot finish. */
const DUAL_BAND: SieveInput = {
  totalMass: 500,
  readings: [
    { size: 4.75, massRetained: 25 },
    { size: 2.0, massRetained: 150 },
    { size: 0.425, massRetained: 180 },
    { size: 0.075, massRetained: 90 },
  ],
  panMass: 55,
}

/** 33% fines, so the sieve curve stops well short of 10% passing. */
const FINE: SieveInput = {
  totalMass: 500,
  readings: [
    { size: 4.75, massRetained: 25 },
    { size: 2.0, massRetained: 60 },
    { size: 0.425, massRetained: 130 },
    { size: 0.075, massRetained: 120 },
  ],
  panMass: 165,
}

const hyd = (over: Partial<HydrometerData> = {}) => hydrometer({
  dryMass: 50, specificGravity: 2.7,
  compositeCorrection: 5, meniscusCorrection: 1, fractionOfTotal: 11,
  readings: [
    { time: 1, reading: 50, temperature: 22 },
    { time: 30, reading: 38, temperature: 22 },
    { time: 250, reading: 26, temperature: 22 },
    { time: 1440, reading: 16, temperature: 22 },
  ],
  ...over,
})

describe('with no sedimentation run it is a pass-through', () => {
  it('returns the sieve curve and the sieve D-values unchanged', () => {
    const g = gradation(FINE)
    const c = combineGrading(g)
    expect(c.combined).toBe(false)
    expect(c.points).toHaveLength(g.rows.length)
    expect(c.points.every((p) => p.source === 'sieve')).toBe(true)
    expect(c.d10).toBe(g.d10)
    expect(c.cu).toBe(g.cu)
    expect(c.gravel).toBeCloseTo(g.gravel, 9)
    expect(c.clay).toBeUndefined()
    expect(c.notes).toEqual([])
  })
})

describe('joining the curves is what produces D₁₀', () => {
  it('reaches 10% passing where the sieve alone could not, and finishes Cu and Cc', () => {
    const g = gradation(DUAL_BAND)
    expect(g.fines).toBeCloseTo(11, 6)
    expect(g.d10).toBeUndefined()          // the whole problem
    expect(g.cu).toBeUndefined()

    const c = combineGrading(g, hyd())
    expect(c.combined).toBe(true)
    expect(c.d10).toBeDefined()
    expect(c.d10!).toBeLessThan(0.075)     // below the finest sieve, by definition
    expect(c.cu).toBeCloseTo(c.d60! / c.d10!, 9)
    expect(c.cc).toBeCloseTo((c.d30! * c.d30!) / (c.d10! * c.d60!), 9)
    expect(c.notes.join(' ')).toMatch(/D₁₀ = .* comes from the sedimentation run/)
  })

  it('keeps the D2487 fractions where the sieve put them', () => {
    // The merge extends the curve; it does not re-cut gravel, sand and fines,
    // which are defined at sieve openings the sieve actually measured.
    const g = gradation(DUAL_BAND)
    const c = combineGrading(g, hyd())
    expect(c.gravel).toBeCloseTo(g.gravel, 9)
    expect(c.sand).toBeCloseTo(g.sand, 9)
    expect(c.fines).toBeCloseTo(g.fines, 9)
  })

  it('orders the curve coarse to fine with the sieve first, never interleaved', () => {
    const c = combineGrading(gradation(DUAL_BAND), hyd())
    const sizes = c.points.map((p) => p.size)
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a))
    const firstHydro = c.points.findIndex((p) => p.source === 'hydrometer')
    expect(firstHydro).toBeGreaterThan(0)
    expect(c.points.slice(firstHydro).every((p) => p.source === 'hydrometer')).toBe(true)
  })

  it('gives a size-based clay fraction, and the silt that is left over', () => {
    const g = gradation(FINE)
    const c = combineGrading(g, hyd({ fractionOfTotal: 33 }))
    expect(c.clay).toBeDefined()
    expect(c.clay!).toBeGreaterThan(0)
    expect(c.clay!).toBeLessThan(g.fines)
    expect(c.silt).toBeCloseTo(g.fines - c.clay!, 9)
    // and it agrees with reading the curve directly at 0.002 mm
    expect(passingOnCurve(c.points, CLAY_SIZE)).toBeCloseTo(c.clay!, 9)
  })
})

describe('the join is policed, not papered over', () => {
  it('drops sedimentation readings the sieve already weighed, and says so', () => {
    // A first reading at 6 seconds sits above 0.075 mm: the sieve measured that
    // size directly, and a settling velocity is the weaker of the two.
    const c = combineGrading(gradation(DUAL_BAND), hyd({
      readings: [
        { time: 0.1, reading: 52, temperature: 22 },   // ~0.13 mm
        { time: 1, reading: 50, temperature: 22 },
        { time: 30, reading: 38, temperature: 22 },
        { time: 1440, reading: 16, temperature: 22 },
      ],
    }))
    expect(c.points.filter((p) => p.source === 'hydrometer').every((p) => p.size < 0.075)).toBe(true)
    expect(c.notes.join(' ')).toMatch(/coarser than the 0.075 mm sieve and .* dropped/)
  })

  it('measures the disagreement at an overlapping join rather than averaging it', () => {
    // Scaled to the whole sample as though the suspension were 40% of it when
    // the sieve says 11% passed: the two curves cannot both be right.
    const c = combineGrading(gradation(DUAL_BAND), hyd({
      fractionOfTotal: 40,
      readings: [
        { time: 0.1, reading: 52, temperature: 22 },
        { time: 30, reading: 38, temperature: 22 },
        { time: 1440, reading: 16, temperature: 22 },
      ],
    }))
    expect(c.joinMismatch).toBeDefined()
    expect(c.joinMismatch!).toBeGreaterThan(2)
    expect(c.notes.join(' ')).toMatch(/disagreement of .* points on one specimen/)
  })

  it('refuses to let a subset of the sample be larger than the sample', () => {
    const c = combineGrading(gradation(DUAL_BAND), hyd({ fractionOfTotal: 90 }))
    expect(c.notes.join(' ')).toMatch(/cannot be larger than the sample/)
  })

  it('names an unmeasured band at the join and flags a D-value read across it', () => {
    // Sieve stops at 0.075 mm, first reading at 24 hours is near 0.001 mm: two
    // decades with nothing in them, and D₁₀ lands inside.
    const c = combineGrading(gradation(DUAL_BAND), hyd({
      readings: [
        { time: 1440, reading: 30, temperature: 22 },
        { time: 2880, reading: 24, temperature: 22 },
      ],
    }))
    expect(c.joinGap!).toBeGreaterThan(3)
    expect(c.notes.join(' ')).toMatch(/Nothing was measured between/)
    expect(c.dAcrossGap).toBe(true)
    expect(c.notes.join(' ')).toMatch(/read off the interpolation rather than off a measurement/)
  })

  it('says when even the joined curve never reaches 0.002 mm', () => {
    const c = combineGrading(gradation(FINE), hyd({
      fractionOfTotal: 33,
      readings: [
        { time: 1, reading: 50, temperature: 22 },
        { time: 5, reading: 45, temperature: 22 },
      ],
    }))
    expect(c.clay).toBeUndefined()
    expect(c.silt).toBeUndefined()
    expect(c.notes.join(' ')).toMatch(/above the 0.002 mm clay boundary/)
  })
})

describe('reading the joined curve', () => {
  it('declines off either end rather than extrapolating', () => {
    const c = combineGrading(gradation(DUAL_BAND), hyd())
    const finest = c.points[c.points.length - 1].size
    expect(passingOnCurve(c.points, finest / 10)).toBeUndefined()
    expect(passingOnCurve(c.points, 100)).toBeUndefined()
    expect(passingOnCurve(c.points, finest)).toBeCloseTo(c.points[c.points.length - 1].percentPassing, 9)
  })
})
