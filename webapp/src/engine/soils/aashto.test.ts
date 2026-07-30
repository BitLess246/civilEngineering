import { describe, it, expect } from 'vitest'
import { classifyAASHTO, groupIndex, partialGroupIndex } from './aashto'
import { classifyUSCS } from './uscs'

describe('group index (AASHTO M 145 Eq. 1)', () => {
  it('is zero for a clean granular soil', () => {
    expect(groupIndex(10, 20, 3)).toBe(0)
    expect(groupIndex(35, 40, 10)).toBe(0)
  })

  it('matches a hand calculation', () => {
    // F = 60, LL = 45, PI = 20:
    //   (60−35)[0.2 + 0.005(45−40)] + 0.01(60−15)(20−10)
    // = 25(0.225) + 0.01(45)(10) = 5.625 + 4.5 = 10.125 → 10
    expect(groupIndex(60, 45, 20)).toBe(10)
  })

  it('never returns a negative index', () => {
    // M 145: "when the calculated group index is negative, the group index
    // shall be reported as zero". The raw value here is −1.5.
    //   (40−35)[0.2 + 0.005(20−40)] + 0.01(40−15)(2−10)
    // = 5(0.1) + 0.01(25)(−8) = 0.5 − 2.0 = −1.5
    expect(groupIndex(40, 20, 2)).toBe(0)
    expect(groupIndex(45, 25, 5)).toBe(0)
  })

  it('is only meaningful inside the domain M 145 applies it to', () => {
    // F = LL = PI = 0 is not a soil, and the expression returns 2 there. The
    // classifier never calls it outside the silt-clay groups and A-2-6/7, and
    // the docstring says so — better than bending the formula to flatter a
    // degenerate input.
    expect(groupIndex(0, 0, 0)).toBe(2)
    const granular = classifyAASHTO({ passing10: 45, passing40: 25, passing200: 10, liquidLimit: 20, plasticityIndex: 3 })
    expect(granular.groupIndex).toBe(0)
  })

  it('evaluates the equation signed rather than clamping each term first', () => {
    // Clamping (LL−40) and (PI−10) at zero before summing is a DIFFERENT
    // equation: it would drop the −2.0 above and report 1 instead of 0.
    const signed = (40 - 35) * (0.2 + 0.005 * (20 - 40)) + 0.01 * (40 - 15) * (2 - 10)
    expect(signed).toBeCloseTo(-1.5, 10)
    expect(groupIndex(40, 20, 2)).toBe(0)
  })

  it('rises with fines and with plasticity', () => {
    expect(groupIndex(70, 45, 20)).toBeGreaterThan(groupIndex(50, 45, 20))
    expect(groupIndex(60, 45, 30)).toBeGreaterThan(groupIndex(60, 45, 15))
  })

  it('partial index uses only the plasticity term, for A-2-6 and A-2-7', () => {
    expect(partialGroupIndex(30, 20)).toBe(Math.round(0.01 * 15 * 10))
    expect(partialGroupIndex(30, 5)).toBe(0)
  })
})

describe('granular soils (≤ 35% passing No. 200)', () => {
  it('classifies well-graded gravel as A-1-a', () => {
    const r = classifyAASHTO({ passing10: 45, passing40: 25, passing200: 10, liquidLimit: 20, plasticityIndex: 3 })
    expect(r.group).toBe('A-1-a')
    expect(r.groupIndex).toBe(0)
    expect(r.rating).toBe('excellent to good')
  })

  it('classifies coarse sand as A-1-b', () => {
    const r = classifyAASHTO({ passing10: 80, passing40: 45, passing200: 20, liquidLimit: 20, plasticityIndex: 4 })
    expect(r.group).toBe('A-1-b')
  })

  it('classifies non-plastic fine sand as A-3', () => {
    const r = classifyAASHTO({ passing10: 95, passing40: 80, passing200: 8, liquidLimit: 0, plasticityIndex: 0 })
    expect(r.group).toBe('A-3')
  })

  it('does not call a plastic fine sand A-3', () => {
    // A-3 requires non-plastic; with PI 5 the soil drops to the A-2 family.
    const r = classifyAASHTO({ passing10: 95, passing40: 80, passing200: 8, liquidLimit: 25, plasticityIndex: 5 })
    expect(r.group).toBe('A-2-4')
  })

  it('splits the A-2 family on LL 41 and PI 11', () => {
    const base = { passing10: 90, passing40: 70, passing200: 30 }
    expect(classifyAASHTO({ ...base, liquidLimit: 35, plasticityIndex: 8 }).group).toBe('A-2-4')
    expect(classifyAASHTO({ ...base, liquidLimit: 45, plasticityIndex: 8 }).group).toBe('A-2-5')
    expect(classifyAASHTO({ ...base, liquidLimit: 35, plasticityIndex: 15 }).group).toBe('A-2-6')
    expect(classifyAASHTO({ ...base, liquidLimit: 45, plasticityIndex: 15 }).group).toBe('A-2-7')
  })

  it('gives a group index only to A-2-6 and A-2-7', () => {
    const base = { passing10: 90, passing40: 70, passing200: 30 }
    expect(classifyAASHTO({ ...base, liquidLimit: 35, plasticityIndex: 8 }).groupIndex).toBe(0)
    expect(classifyAASHTO({ ...base, liquidLimit: 35, plasticityIndex: 20 }).groupIndex)
      .toBe(partialGroupIndex(30, 20))
  })

  it('reads the table in order — the first satisfied group wins', () => {
    // This soil satisfies A-1-b's criteria and would also satisfy A-2-4 if the
    // groups were tested independently. M 145 is an elimination procedure, so
    // A-1-b is the answer.
    const r = classifyAASHTO({ passing10: 60, passing40: 40, passing200: 20, liquidLimit: 25, plasticityIndex: 5 })
    expect(r.group).toBe('A-1-b')
  })
})

describe('silt-clay soils (> 35% passing No. 200)', () => {
  const base = { passing10: 100, passing40: 95 }

  it('classifies A-4 through A-6', () => {
    expect(classifyAASHTO({ ...base, passing200: 60, liquidLimit: 30, plasticityIndex: 8 }).group).toBe('A-4')
    expect(classifyAASHTO({ ...base, passing200: 60, liquidLimit: 45, plasticityIndex: 8 }).group).toBe('A-5')
    expect(classifyAASHTO({ ...base, passing200: 60, liquidLimit: 35, plasticityIndex: 20 }).group).toBe('A-6')
  })

  it('splits A-7-5 and A-7-6 on PI vs LL − 30', () => {
    // LL 60: A-7-5 while PI ≤ 30, A-7-6 above it.
    expect(classifyAASHTO({ ...base, passing200: 70, liquidLimit: 60, plasticityIndex: 28 }).group).toBe('A-7-5')
    expect(classifyAASHTO({ ...base, passing200: 70, liquidLimit: 60, plasticityIndex: 35 }).group).toBe('A-7-6')
    expect(classifyAASHTO({ ...base, passing200: 70, liquidLimit: 60, plasticityIndex: 30 }).group).toBe('A-7-5')
  })

  it('labels the group with its index', () => {
    // LL 45, PI 20: PI > LL − 30 = 15, so this is A-7-6, not A-7-5.
    const r = classifyAASHTO({ ...base, passing200: 60, liquidLimit: 45, plasticityIndex: 20 })
    expect(r.label).toBe(`A-7-6 (${r.groupIndex})`)
    expect(r.groupIndex).toBe(groupIndex(60, 45, 20))
    expect(r.groupIndex).toBe(10)
  })

  it('rates silt-clay as fair to poor subgrade', () => {
    expect(classifyAASHTO({ ...base, passing200: 60, liquidLimit: 30, plasticityIndex: 8 }).rating).toBe('fair to poor')
  })
})

describe('boundaries and missing data', () => {
  it('puts the granular / silt-clay split at 35%', () => {
    const base = { passing10: 100, passing40: 90, liquidLimit: 30, plasticityIndex: 8 }
    expect(classifyAASHTO({ ...base, passing200: 35 }).granular).toBe(true)
    expect(classifyAASHTO({ ...base, passing200: 35.1 }).granular).toBe(false)
  })

  it('refuses to classify without Atterberg limits when they matter', () => {
    const r = classifyAASHTO({ passing10: 100, passing40: 95, passing200: 60 })
    expect(r.group).toBeUndefined()
    expect(r.rating).toBe('unknown')
    expect(r.reason).toMatch(/D4318/)
  })

  it('notes a grading where passing increases with sieve size', () => {
    const r = classifyAASHTO({ passing10: 40, passing40: 60, passing200: 20, liquidLimit: 25, plasticityIndex: 4 })
    expect(r.notes.join(' ')).toMatch(/must not increase with sieve size/)
  })
})

describe('AASHTO and USCS answer different questions', () => {
  it('disagrees on the fines boundary, and both are right', () => {
    // 40% fines: AASHTO calls this silt-clay (>35%), USCS calls it
    // coarse-grained (<50%). A report quoting both should not reconcile them.
    const aashto = classifyAASHTO({ passing10: 100, passing40: 85, passing200: 40, liquidLimit: 35, plasticityIndex: 15 })
    const uscs = classifyUSCS({ gravel: 10, sand: 50, fines: 40, liquidLimit: 35, plasticityIndex: 15 })

    expect(aashto.granular).toBe(false)
    expect(aashto.group).toBe('A-6')
    expect(uscs.coarseGrained).toBe(true)
    expect(uscs.symbol).toBe('SC')
  })
})
