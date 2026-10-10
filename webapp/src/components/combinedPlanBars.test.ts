import { describe, expect, it } from 'vitest'
import {
  bandExtent, bandWidth, slabWidthAt, topZone, transverseCentres,
} from './combinedPlanBars'

// The page defaults make a fair harness: a 400 mm column over a ~0.5 m slab
// gives d ≈ 495 mm, so the band runs ~1.39 m across the length — wide enough
// to tile, and the geometry the plan has to draw.
describe('combinedPlanBars — where the combined plan places the bars', () => {
  it('bands the transverse bars at the column dimension + 2d', () => {
    expect(bandWidth(0.4, 0.495)).toBeCloseTo(1.39, 12)
    const [a, b] = bandExtent(2.0, 0.4, 0.495, 7.0)
    expect(a).toBeCloseTo(1.305, 12)
    expect(b).toBeCloseTo(2.695, 12)
  })

  it('clips a band that runs past the pad end, and never leaves [0, L]', () => {
    const [a, b] = bandExtent(0.2, 0.4, 0.495, 7.0)   // column near the left end
    expect(a).toBe(0)
    expect(b).toBeCloseTo(0.2 + 0.695, 12)
    expect(bandExtent(6.9, 0.4, 0.495, 7.0)[1]).toBe(7.0)
  })

  it('tiles the band with the schedule spacing, symmetric about the column', () => {
    const cs = transverseCentres(2.0, 0.4, 0.495, 150, 7.0, 20)
    const w = 1.39
    expect(cs.length).toBe(Math.floor(w / 0.15) + 1)          // the module path
    expect(cs[cs.length - 1] - cs[0]).toBeLessThanOrEqual(w)
    const mid = (cs[0] + cs[cs.length - 1]) / 2
    expect(mid).toBeCloseTo(2.0, 9)                            // centred on the column
    for (let i = 1; i < cs.length; i++) expect(cs[i] - cs[i - 1]).toBeCloseTo(0.15, 9)
    // every bar stays inside the band
    expect(cs[0]).toBeGreaterThanOrEqual(2.0 - 0.695 - 1e-9)
    expect(cs[cs.length - 1]).toBeLessThanOrEqual(2.0 + 0.695 + 1e-9)
  })

  it('still draws the column centre when the band cannot take a full module', () => {
    // a 0.25 m band against a 300 mm spacing: one bar, on the column
    expect(transverseCentres(0.125, 0.5, 0.0, 300, 0.25, 20)).toEqual([0.125])
  })

  it('reads the trapezoid width at each station, and the rectangle as flat', () => {
    expect(slabWidthAt(0, 1.2, 1.8, 6.0)).toBeCloseTo(1.2, 12)
    expect(slabWidthAt(6.0, 1.2, 1.8, 6.0)).toBeCloseTo(1.8, 12)
    expect(slabWidthAt(3.0, 1.2, 1.8, 6.0)).toBeCloseTo(1.5, 12)
    expect(slabWidthAt(2.0, 1.5, 1.5, 6.0)).toBeCloseTo(1.5, 12)
  })

  it('spans the top steel from column outer face to column outer face', () => {
    const [a, b] = topZone(1.2, 0.5, 4.6, 0.4)
    expect(a).toBeCloseTo(0.95, 12)
    expect(b).toBeCloseTo(4.8, 12)
  })
})
