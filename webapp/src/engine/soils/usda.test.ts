import { describe, it, expect } from 'vitest'
import { classifyUSDA, usdaFractions, usdaFromPassing, USDA_SIZES } from './usda'

// ─────────────────────────────────────────────────────────────────────────
// The triangle is checked at points read off the published USDA chart, one
// per class, plus the boundaries where two classes meet — those are where a
// hand-written region test goes wrong, and where a nearest-centroid lookup
// disagrees with the Soil Survey Manual.
// ─────────────────────────────────────────────────────────────────────────

const t = (sand: number, silt: number, clay: number) => classifyUSDA({ sand, silt, clay }).texture

describe('the twelve textures', () => {
  it('names each class from a point inside it', () => {
    expect(t(90, 5, 5)).toBe('sand')
    expect(t(82, 10, 8)).toBe('loamy sand')
    expect(t(65, 25, 10)).toBe('sandy loam')
    expect(t(40, 40, 20)).toBe('loam')
    expect(t(20, 70, 10)).toBe('silt loam')
    expect(t(10, 85, 5)).toBe('silt')
    expect(t(60, 15, 25)).toBe('sandy clay loam')
    expect(t(33, 34, 33)).toBe('clay loam')
    expect(t(10, 60, 30)).toBe('silty clay loam')
    expect(t(55, 10, 35)).toBe('sandy clay')
    expect(t(5, 47, 48)).toBe('silty clay')
    expect(t(20, 20, 60)).toBe('clay')
  })

  it('the three fractions always sum to the composition it reports', () => {
    const r = classifyUSDA({ sand: 30, silt: 45, clay: 25 })
    const { sand, silt, clay } = r.composition
    expect(sand + silt + clay).toBeCloseTo(100, 9)
  })
})

describe('the boundaries, where the manual is explicit', () => {
  it('clay needs sand ≤ 45 AND silt < 40 — otherwise it is a sandy or silty clay', () => {
    expect(t(45, 15, 40)).toBe('clay')            // on both limits at once
    expect(t(50, 5, 45)).toBe('sandy clay')       // sand over 45
    expect(t(20, 40, 40)).toBe('silty clay')      // silt at 40
  })

  it('splits clay loam from silty clay loam at 20% sand, not at a clay content', () => {
    expect(t(21, 45, 34)).toBe('clay loam')
    expect(t(19, 47, 34)).toBe('silty clay loam')
  })

  it('takes the sand corner off the two sloping lines, not off a clay limit', () => {
    // The 'sand' and 'loamy sand' boundaries are silt + 1.5·clay = 15 and
    // silt + 2·clay = 30. A soil can carry more clay and still be a sand.
    expect(t(88, 6, 6)).toBe('loamy sand')        // 6 + 9 = 15 is not < 15 …
    expect(t(89, 6, 5)).toBe('sand')              // … but 6 + 7.5 = 13.5 is
    expect(t(80, 12, 8)).toBe('loamy sand')       // 12 + 16 = 28 < 30
    expect(t(78, 12, 10)).toBe('sandy loam')      // 12 + 20 = 32 ≥ 30
  })

  it('keeps loam off the sand side at 52% sand', () => {
    expect(t(52, 33, 15)).toBe('loam')
    expect(t(55, 30, 15)).toBe('sandy loam')
  })

  it('silt needs clay under 12 as well as silt over 80', () => {
    expect(t(8, 80, 12)).toBe('silt loam')
    expect(t(8, 81, 11)).toBe('silt')
  })
})

describe('what it does with fractions that do not sum to 100', () => {
  it('normalises them and says so', () => {
    // Gravel left in is the usual cause: 30 + 30 + 20 is a whole-sample split
    // with 20% gravel still in it.
    const r = classifyUSDA({ sand: 30, silt: 30, clay: 20 })
    expect(r.composition.sand).toBeCloseTo(37.5, 6)
    expect(r.notes.join(' ')).toMatch(/rather than 100%/)
    expect(r.notes.join(' ')).toMatch(/gravel was left in/)
  })

  it('refuses an empty composition rather than dividing by zero', () => {
    expect(() => classifyUSDA({ sand: 0, silt: 0, clay: 0 })).toThrow(/more than zero/)
  })
})

describe('from a grading curve', () => {
  it('uses the USDA boundaries, which are not any other system’s', () => {
    // 2.0 mm, 0.05 mm and 0.002 mm — the sand/silt split in particular is at
    // 0.05, not the No. 200 sieve at 0.075 that USCS and AASHTO use.
    expect(USDA_SIZES).toEqual({ gravel: 2.0, sand: 0.05, clay: 0.002 })
  })

  it('renormalises onto the fine earth, so gravel does not dilute the texture', () => {
    // 20% gravel, then 40 sand / 25 silt / 15 clay of the WHOLE sample.
    const f = usdaFractions({ gravelBoundary: 80, sandBoundary: 40, clayBoundary: 15 })!
    expect(f.gravel).toBeCloseTo(20, 9)
    // Of the fine earth: sand 40/80, silt 25/80, clay 15/80.
    expect(f.composition.sand).toBeCloseTo(50, 9)
    expect(f.composition.silt).toBeCloseTo(31.25, 9)
    expect(f.composition.clay).toBeCloseTo(18.75, 9)
  })

  it('DECLINES without the 0.002 mm point — a sieve cannot reach it', () => {
    // The whole reason a hydrometer is required for a USDA texture.
    expect(usdaFractions({ gravelBoundary: 95, sandBoundary: 40 })).toBeUndefined()
    expect(usdaFromPassing({ gravelBoundary: 95, sandBoundary: 40 })).toBeUndefined()
  })

  it('declines a curve that climbs with size', () => {
    // More passing 0.002 mm than 0.05 mm is impossible; refuse rather than
    // clamping a negative silt fraction to zero and classifying anyway.
    expect(usdaFractions({ gravelBoundary: 90, sandBoundary: 30, clayBoundary: 45 })).toBeUndefined()
  })

  it('names the gravel as a modifier rather than putting it in the triangle', () => {
    // 40% gravel over a loam fine earth.
    const r = usdaFromPassing({ gravelBoundary: 60, sandBoundary: 36, clayBoundary: 12 })!
    expect(r.texture).toBe('loam')
    expect(r.name).toBe('very gravelly loam')
    expect(r.gravel).toBeCloseTo(40, 9)
    expect(r.notes.join(' ')).toMatch(/keeps that out of the triangle/)
  })

  it('leaves the name alone below 15% gravel', () => {
    const r = usdaFromPassing({ gravelBoundary: 90, sandBoundary: 54, clayBoundary: 18 })!
    expect(r.name).toBe(r.texture)
  })
})
