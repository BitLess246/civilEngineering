import { describe, it, expect } from 'vitest'
import { classifyUSCS, overrideClassification } from './uscs'
import { aLine } from './atterberg'

// ─────────────────────────────────────────────────────────────────────────
// Cases taken from the ASTM D2487 Table 1 decision tree, plus the two
// worked examples in the module specification. The borderline bands are
// where a simplified classifier goes quietly wrong, so they get the most
// coverage: 5–12% fines, the CL-ML band, and the A-line itself.
// ─────────────────────────────────────────────────────────────────────────

describe('coarse-grained, clean (< 5% fines)', () => {
  it('classifies a well-graded sand as SW', () => {
    const r = classifyUSCS({ gravel: 10, sand: 87, fines: 3, cu: 8, cc: 1.5 })
    expect(r.symbol).toBe('SW')
    expect(r.name).toBe('Well-graded sand')
    expect(r.dual).toBe(false)
  })

  it('classifies a uniform sand as SP — Cu below 6 fails the sand criterion', () => {
    const r = classifyUSCS({ gravel: 2, sand: 95, fines: 3, cu: 3, cc: 1.2 })
    expect(r.symbol).toBe('SP')
    expect(r.reason).toMatch(/poorly graded/)
  })

  it('uses the gravel criterion (Cu ≥ 4) when gravel dominates', () => {
    // Cu = 5 is well graded for a gravel but would fail for a sand.
    expect(classifyUSCS({ gravel: 70, sand: 27, fines: 3, cu: 5, cc: 2 }).symbol).toBe('GW')
    expect(classifyUSCS({ gravel: 27, sand: 70, fines: 3, cu: 5, cc: 2 }).symbol).toBe('SP')
  })

  it('adds "with gravel" when the secondary fraction reaches 15%', () => {
    expect(classifyUSCS({ gravel: 20, sand: 77, fines: 3, cu: 8, cc: 1.5 }).name)
      .toBe('Well-graded sand with gravel')
    expect(classifyUSCS({ gravel: 10, sand: 87, fines: 3, cu: 8, cc: 1.5 }).name)
      .toBe('Well-graded sand')
  })

  it('refuses to classify a clean sand without a gradation curve', () => {
    const r = classifyUSCS({ gravel: 10, sand: 87, fines: 3 })
    expect(r.symbol).toBeUndefined()
    expect(r.reason).toMatch(/Cu and Cc/)
  })
})

describe('coarse-grained with fines (> 12%)', () => {
  it('classifies the specification example — 62% sand, 33% fines, LL 42, PI 19 — as SC', () => {
    const r = classifyUSCS({ gravel: 5, sand: 62, fines: 33, liquidLimit: 42, plasticityIndex: 19 })
    expect(r.symbol).toBe('SC')
    expect(r.name).toMatch(/Clayey sand/)
  })

  it('classifies non-plastic fines as SM', () => {
    // PI 4 at LL 25: below the A-line (16.1 → wait, A-line at 25 is 3.65) and
    // PI ≤ 7, so it is not clayey.
    const r = classifyUSCS({ gravel: 5, sand: 70, fines: 25, liquidLimit: 25, plasticityIndex: 2 })
    expect(r.symbol).toBe('SM')
    expect(r.name).toMatch(/Silty sand/)
  })

  it('takes the dual symbol SC-SM when the fines land in the CL-ML band', () => {
    // PI 6 at LL 25: between 4 and 7, and above the A-line (3.65).
    const r = classifyUSCS({ gravel: 5, sand: 70, fines: 25, liquidLimit: 25, plasticityIndex: 6 })
    expect(r.symbol).toBe('SC-SM')
    expect(r.dual).toBe(true)
    expect(r.reason).toMatch(/CL-ML band/)
  })

  it('classifies a gravel with clayey fines as GC', () => {
    const r = classifyUSCS({ gravel: 55, sand: 15, fines: 30, liquidLimit: 45, plasticityIndex: 25 })
    expect(r.symbol).toBe('GC')
  })

  it('refuses to guess the fines plasticity from the fines content', () => {
    const r = classifyUSCS({ gravel: 5, sand: 62, fines: 33 })
    expect(r.symbol).toBeUndefined()
    expect(r.reason).toMatch(/D4318/)
  })
})

describe('the 5–12% fines band requires a DUAL symbol', () => {
  it('gives SW-SC, not SW with a footnote', () => {
    const r = classifyUSCS({ gravel: 5, sand: 87, fines: 8, cu: 8, cc: 1.5, liquidLimit: 40, plasticityIndex: 20 })
    expect(r.symbol).toBe('SW-SC')
    expect(r.dual).toBe(true)
    expect(r.reason).toMatch(/5–12% band/)
  })

  it('gives SP-SM for a poorly graded sand with silty fines', () => {
    const r = classifyUSCS({ gravel: 5, sand: 88, fines: 7, cu: 3, cc: 1.1, liquidLimit: 22, plasticityIndex: 2 })
    expect(r.symbol).toBe('SP-SM')
  })

  it('gives GW-GM for a gravel', () => {
    const r = classifyUSCS({ gravel: 70, sand: 20, fines: 10, cu: 6, cc: 2, liquidLimit: 20, plasticityIndex: 2 })
    expect(r.symbol).toBe('GW-GM')
  })

  it('needs BOTH gradation and plasticity, and says so when one is missing', () => {
    const noPlasticity = classifyUSCS({ gravel: 5, sand: 87, fines: 8, cu: 8, cc: 1.5 })
    expect(noPlasticity.symbol).toBeUndefined()
    expect(noPlasticity.reason).toMatch(/BOTH/)

    const noGradation = classifyUSCS({ gravel: 5, sand: 87, fines: 8, liquidLimit: 40, plasticityIndex: 20 })
    expect(noGradation.symbol).toBeUndefined()
  })

  it('boundary: 5% is dual, 4.9% is clean, 12% is dual, 12.1% is "with fines"', () => {
    const g = { gravel: 5, cu: 8, cc: 1.5, liquidLimit: 40, plasticityIndex: 20 }
    expect(classifyUSCS({ ...g, sand: 90.1, fines: 4.9 }).dual).toBe(false)
    expect(classifyUSCS({ ...g, sand: 90, fines: 5 }).dual).toBe(true)
    expect(classifyUSCS({ ...g, sand: 83, fines: 12 }).dual).toBe(true)
    expect(classifyUSCS({ ...g, sand: 82.9, fines: 12.1 }).dual).toBe(false)
  })
})

describe('fine-grained (≥ 50% fines)', () => {
  it('classifies the specification example — LL 48, PI 23 — as CL', () => {
    const r = classifyUSCS({ gravel: 0, sand: 10, fines: 90, liquidLimit: 48, plasticityIndex: 23 })
    expect(r.symbol).toBe('CL')
    expect(r.name).toMatch(/Lean clay/)
  })

  it('classifies a high-plasticity clay as CH', () => {
    expect(classifyUSCS({ gravel: 0, sand: 5, fines: 95, liquidLimit: 65, plasticityIndex: 40 }).symbol).toBe('CH')
  })

  it('classifies silts below the A-line as ML and MH', () => {
    expect(classifyUSCS({ gravel: 0, sand: 10, fines: 90, liquidLimit: 40, plasticityIndex: 10 }).symbol).toBe('ML')
    expect(classifyUSCS({ gravel: 0, sand: 10, fines: 90, liquidLimit: 60, plasticityIndex: 20 }).symbol).toBe('MH')
  })

  it('puts a point exactly ON the A-line into the clay group', () => {
    const LL = 45
    const r = classifyUSCS({ gravel: 0, sand: 10, fines: 90, liquidLimit: LL, plasticityIndex: aLine(LL) })
    expect(r.symbol).toBe('CL')
  })

  it('takes CL-ML in the 4–7 band above the A-line', () => {
    // LL 25, A-line 3.65, PI 5 ⇒ in the band.
    const r = classifyUSCS({ gravel: 0, sand: 10, fines: 90, liquidLimit: 25, plasticityIndex: 5 })
    expect(r.symbol).toBe('CL-ML')
    expect(r.dual).toBe(true)
  })

  it('classifies organic soils as OL / OH', () => {
    expect(classifyUSCS({ gravel: 0, sand: 10, fines: 90, liquidLimit: 40, plasticityIndex: 15, organic: true }).symbol).toBe('OL')
    expect(classifyUSCS({ gravel: 0, sand: 10, fines: 90, liquidLimit: 60, plasticityIndex: 25, organic: true }).symbol).toBe('OH')
  })

  it('adds sandy / gravelly modifiers at 30% coarse', () => {
    expect(classifyUSCS({ gravel: 5, sand: 35, fines: 60, liquidLimit: 48, plasticityIndex: 23 }).name)
      .toMatch(/^Sandy/)
    expect(classifyUSCS({ gravel: 35, sand: 5, fines: 60, liquidLimit: 48, plasticityIndex: 23 }).name)
      .toMatch(/^Gravelly/)
  })

  it('refuses to classify without Atterberg limits', () => {
    const r = classifyUSCS({ gravel: 0, sand: 10, fines: 90 })
    expect(r.symbol).toBeUndefined()
    expect(r.reason).toMatch(/Atterberg limits/)
    expect(r.reason).toMatch(/D4318/)
  })

  it('boundary: 50% fines is fine-grained, 49.9% is coarse', () => {
    expect(classifyUSCS({ gravel: 5, sand: 45, fines: 50, liquidLimit: 48, plasticityIndex: 23 }).coarseGrained).toBe(false)
    expect(classifyUSCS({ gravel: 5, sand: 45.1, fines: 49.9, liquidLimit: 48, plasticityIndex: 23 }).coarseGrained).toBe(true)
  })
})

describe('the result always explains itself', () => {
  const cases = [
    { gravel: 10, sand: 87, fines: 3, cu: 8, cc: 1.5 },
    { gravel: 5, sand: 62, fines: 33, liquidLimit: 42, plasticityIndex: 19 },
    { gravel: 0, sand: 10, fines: 90, liquidLimit: 48, plasticityIndex: 23 },
    { gravel: 0, sand: 10, fines: 90 },                       // unclassifiable
    { gravel: 5, sand: 87, fines: 8, cu: 8, cc: 1.5, liquidLimit: 40, plasticityIndex: 20 },
  ]

  it.each(cases)('states a reason for %j', (input) => {
    const r = classifyUSCS(input)
    expect(r.reason.length).toBeGreaterThan(25)
    // When it cannot classify, the reason must name the missing test.
    if (!r.symbol) expect(r.reason).toMatch(/D4318|Cu and Cc|BOTH/)
  })
})

describe('data sanity', () => {
  it('notes fractions that do not sum to 100%', () => {
    const r = classifyUSCS({ gravel: 10, sand: 50, fines: 30, liquidLimit: 40, plasticityIndex: 20 })
    expect(r.notes.join(' ')).toMatch(/sum to 90%/)
  })

  it('notes a fine-grained point above the U-line', () => {
    const r = classifyUSCS({ gravel: 0, sand: 10, fines: 90, liquidLimit: 30, plasticityIndex: 30 })
    expect(r.notes.join(' ')).toMatch(/above the U-line/)
  })
})

describe('engineer override', () => {
  it('records both the computed value and the override', () => {
    const r = classifyUSCS({ gravel: 5, sand: 62, fines: 33, liquidLimit: 42, plasticityIndex: 19 })
    const o = overrideClassification(r, 'SM', 'Fines are non-plastic on re-test; the original PI was from a contaminated specimen.', 'RV')
    expect(o.computed).toBe('SC')
    expect(o.override).toBe('SM')
    expect(o.by).toBe('RV')
  })

  it('refuses an override with no reason', () => {
    // A silent override is the one thing worse than a wrong automatic answer:
    // six months on it is indistinguishable from a typing error.
    const r = classifyUSCS({ gravel: 5, sand: 62, fines: 33, liquidLimit: 42, plasticityIndex: 19 })
    expect(() => overrideClassification(r, 'SM', '')).toThrow(/requires a stated reason/)
    expect(() => overrideClassification(r, 'SM', '   ')).toThrow(/requires a stated reason/)
  })
})
