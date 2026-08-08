import { describe, it, expect } from 'vitest'
import {
  consolidation, heightOfSolids, fitBreak, overconsolidationRatio,
  type ConsolidationData, type ConsolidationRow,
} from './consolidation'

// A 75 mm × 20 mm specimen, Gs 2.70, dry mass 79.5 g.
// Hs = 79.5 / (2.70 × 0.001 × 4417.86) = 6.664 mm  ⇒  e0 = 20/6.664 − 1 = 2.001
const SPECIMEN = { initialHeight: 20, diameter: 75, dryMass: 79.5, specificGravity: 2.70 }

/**
 * A curve with a deliberate break at 200 kPa: flat (Cr) below, steep (Cc)
 * above. Void ratios are converted back to compressions so the engine has to
 * do the work rather than being handed the answer.
 */
function curveWithBreak(): ConsolidationData {
  const area = (Math.PI / 4) * SPECIMEN.diameter ** 2
  const hs = heightOfSolids(SPECIMEN.dryMass, SPECIMEN.specificGravity, area)
  const e0 = SPECIMEN.initialHeight / hs - 1
  const CR = 0.04, CC = 0.40, SIGMA_P = 200

  const stresses = [12.5, 25, 50, 100, 200, 400, 800, 1600]
  const points = stresses.map((stress) => {
    const e = stress <= SIGMA_P
      ? e0 - CR * Math.log10(stress / stresses[0])
      : e0 - CR * Math.log10(SIGMA_P / stresses[0]) - CC * Math.log10(stress / SIGMA_P)
    const height = (1 + e) * hs
    return { stress, compression: SPECIMEN.initialHeight - height, t50: 5 }
  })
  return { ...SPECIMEN, points }
}

describe('height of solids', () => {
  it('is the datum every void ratio is measured against', () => {
    const area = (Math.PI / 4) * 75 ** 2
    expect(heightOfSolids(79.5, 2.70, area)).toBeCloseTo(6.664, 2)
  })

  it('refuses a zero specific gravity or area', () => {
    expect(() => heightOfSolids(79.5, 0, 100)).toThrow(/greater than zero/)
    expect(() => heightOfSolids(79.5, 2.7, 0)).toThrow(/greater than zero/)
  })
})

describe('the e–log σ′ curve', () => {
  const r = consolidation(curveWithBreak())

  it('recovers the initial void ratio', () => {
    expect(r.initialVoidRatio).toBeCloseTo(2.001, 2)
  })

  it('gives one row per increment, in stress order', () => {
    expect(r.rows).toHaveLength(8)
    expect(r.rows.map((x) => x.stress)).toEqual([12.5, 25, 50, 100, 200, 400, 800, 1600])
  })

  it('recovers Cc from the virgin branch', () => {
    expect(r.cc).toBeCloseTo(0.40, 2)
  })

  it('recovers Cr from the recompression branch, and it is much smaller', () => {
    expect(r.cr).toBeCloseTo(0.04, 2)
    expect(r.cr!).toBeLessThan(r.cc / 5)
  })

  it('void ratio falls monotonically with stress', () => {
    for (let i = 1; i < r.rows.length; i++) {
      expect(r.rows[i].voidRatio).toBeLessThan(r.rows[i - 1].voidRatio)
    }
  })

  it('computes cv from t50 when it was recorded', () => {
    expect(r.rows.every((x) => x.cv != null && x.cv > 0)).toBe(true)
  })
})

/** The same specimen with the break planted at an arbitrary stress. */
function curveBreakingAt(sigmaP: number): ConsolidationData {
  const area = (Math.PI / 4) * SPECIMEN.diameter ** 2
  const hs = heightOfSolids(SPECIMEN.dryMass, SPECIMEN.specificGravity, area)
  const e0 = SPECIMEN.initialHeight / hs - 1
  const points = [12.5, 25, 50, 100, 200, 400, 800, 1600].map((stress) => {
    const e = stress <= sigmaP
      ? e0 - 0.04 * Math.log10(stress / 12.5)
      : e0 - 0.04 * Math.log10(sigmaP / 12.5) - 0.40 * Math.log10(stress / sigmaP)
    return { stress, compression: SPECIMEN.initialHeight - (1 + e) * hs }
  })
  return { ...SPECIMEN, points }
}

describe('preconsolidation pressure — an estimate, not a measurement', () => {
  it('RECOVERS a planted break, wherever it sits', () => {
    // The first version of this used a numerical Casagrande construction and
    // returned 536 kPa for a break planted at 100 — wrong by a factor of five,
    // and my tolerance was wide enough to hide it. A method that cannot recover
    // a break it was handed cannot estimate one from real data.
    for (const planted of [100, 200, 400]) {
      const found = consolidation(curveBreakingAt(planted)).preconsolidationPressure
      expect(found, `planted ${planted}`).toBeDefined()
      expect(found!, `planted ${planted}`).toBeCloseTo(planted, 0)
    }
  })

  it('recovers the two indices on either side of the break', () => {
    const r = consolidation(curveBreakingAt(200))
    expect(r.cc).toBeCloseTo(0.40, 6)
    expect(r.cr).toBeCloseTo(0.04, 6)
  })

  it('says in as many words that it is an estimate, and not Casagrande', () => {
    const r = consolidation(curveWithBreak())
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/ESTIMATE from a two-segment fit, not a measurement/)
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/not the graphical Casagrande construction/)
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/changes a prediction by a factor/)
  })

  it('returns undefined for a curve with no break, and explains both causes', () => {
    // A normally consolidated clay: one straight virgin line throughout.
    const area = (Math.PI / 4) * SPECIMEN.diameter ** 2
    const hs = heightOfSolids(SPECIMEN.dryMass, SPECIMEN.specificGravity, area)
    const e0 = SPECIMEN.initialHeight / hs - 1
    const points = [12.5, 25, 50, 100, 200, 400, 800].map((stress) => {
      const e = e0 - 0.35 * Math.log10(stress / 12.5)
      return { stress, compression: SPECIMEN.initialHeight - (1 + e) * hs }
    })
    const r = consolidation({ ...SPECIMEN, points })
    expect(r.preconsolidationPressure).toBeUndefined()
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/normally consolidated/)
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/too few increments were run below the break/)
  })

  it('will not report a σ′p outside the stresses actually applied', () => {
    // A break beyond the tested range is an extrapolation the data cannot support.
    const straight: ConsolidationRow[] = [100, 200, 400, 800, 1600].map((stress, i) => ({
      stress, compression: 0, height: 20, voidRatio: 2.0 - 0.01 * i,
    }))
    expect(fitBreak(straight)).toBeUndefined()
  })

  it('needs enough points to fit two segments at all', () => {
    expect(fitBreak([])).toBeUndefined()
    expect(fitBreak([
      { stress: 100, compression: 0, height: 20, voidRatio: 2.0 },
      { stress: 200, compression: 0, height: 20, voidRatio: 1.9 },
    ])).toBeUndefined()
  })

  it('refuses a break where the virgin branch is FLATTER than recompression', () => {
    // Physically backwards; the fit must not report an intersection for it.
    const backwards: ConsolidationRow[] = [12.5, 25, 50, 100, 200, 400].map((stress, i) => ({
      stress, compression: 0, height: 20,
      voidRatio: 2.0 - (i < 3 ? 0.4 : 0.02) * Math.log10(stress / 12.5),
    }))
    const f = fitBreak(backwards)
    if (f) expect(f.cc).toBeGreaterThan(f.cr)
  })
})

describe('overconsolidation ratio', () => {
  it('is σ′p over the effective overburden', () => {
    expect(overconsolidationRatio(200, 100)).toBeCloseTo(2, 10)
  })

  it('refuses a zero overburden rather than returning Infinity', () => {
    expect(() => overconsolidationRatio(200, 0)).toThrow(/greater than zero/)
  })
})

describe('impossible data is rejected, not absorbed', () => {
  it('rejects a specimen with no voids', () => {
    // Hs ≥ H means the solids alone fill the ring.
    expect(() => consolidation({ ...SPECIMEN, initialHeight: 5, points: curveWithBreak().points }))
      .toThrow(/leaves no voids/)
  })

  it('rejects compression past the height of solids', () => {
    const d = curveWithBreak()
    d.points = [...d.points, { stress: 3200, compression: 19.5 }]
    expect(() => consolidation(d)).toThrow(/below its height of solids/)
  })

  it('rejects a zero height or diameter', () => {
    expect(() => consolidation({ ...curveWithBreak(), initialHeight: 0 })).toThrow(/height must be greater/)
    expect(() => consolidation({ ...curveWithBreak(), diameter: 0 })).toThrow(/diameter must be greater/)
  })

  it('refuses fewer than three increments', () => {
    const d = curveWithBreak()
    d.points = d.points.slice(0, 2)
    expect(() => consolidation(d)).toThrow(/at least three load increments/)
  })
})

describe('warnings that matter', () => {
  it('flags Cr not smaller than Cc, which no real soil does', () => {
    const area = (Math.PI / 4) * SPECIMEN.diameter ** 2
    const hs = heightOfSolids(SPECIMEN.dryMass, SPECIMEN.specificGravity, area)
    const e0 = SPECIMEN.initialHeight / hs - 1
    // Steep first, flat later — the branches read the wrong way round.
    const points = [12.5, 25, 50, 100, 200, 400].map((stress, i) => {
      const e = e0 - (i < 3 ? 0.4 : 0.05) * Math.log10(stress / 12.5)
      return { stress, compression: SPECIMEN.initialHeight - (1 + e) * hs }
    })
    const r = consolidation({ ...SPECIMEN, points })
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/wrong way round/)
  })

  it('says the RATE is unavailable without t50, but the magnitude is not', () => {
    const d = curveWithBreak()
    d.points = d.points.map(({ stress, compression }) => ({ stress, compression }))
    const r = consolidation(d)
    expect(r.rows.every((x) => x.cv === undefined)).toBe(true)
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/RATE of settlement — cannot be computed. The magnitude can/)
  })

  it('warns when too few increments were run', () => {
    const d = curveWithBreak()
    d.points = d.points.slice(0, 4)
    expect(consolidation(d).notes.map((n) => n.text).join(' ')).toMatch(/Only 4 increments/)
  })
})
