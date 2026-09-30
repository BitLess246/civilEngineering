import { describe, it, expect } from 'vitest'
import { CONTOUR_OPTIONS, effectiveContour, type ContourContext } from './contourView'

const none: ContourContext = { analysed: false, shells: false }
const all: ContourContext = { analysed: true, shells: true }

describe('the contour radio', () => {
  it('offers none plus the three contours, once each', () => {
    expect(CONTOUR_OPTIONS.map((o) => o.key)).toEqual(['none', 'member', 'plate', 'displacement'])
  })

  it('says why an option is blocked — analysis for the frame fields, shells for the plate', () => {
    const why = (k: string, c: ContourContext) => CONTOUR_OPTIONS.find((o) => o.key === k)!.blocked(c)
    expect(why('none', none)).toBeNull()
    expect(why('member', none)).toMatch(/Analyse/)
    expect(why('displacement', none)).toMatch(/Analyse/)
    expect(why('plate', { analysed: true, shells: false })).toMatch(/Shell elements/)
    // the plate field can be recovered by an isolated slab solve before analysis
    expect(why('plate', { analysed: false, shells: true })).toBeNull()
    for (const o of CONTOUR_OPTIONS) expect(o.blocked(all)).toBeNull()
  })

  it('paints the chosen contour while it can be drawn, and nothing when it cannot', () => {
    expect(effectiveContour('member', all)).toBe('member')
    expect(effectiveContour('member', none)).toBe('none')
    expect(effectiveContour('plate', { analysed: false, shells: true })).toBe('plate')
    expect(effectiveContour('displacement', { analysed: false, shells: true })).toBe('none')
  })
})
