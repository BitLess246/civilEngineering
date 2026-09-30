import { describe, it, expect } from 'vitest'
import { markerLabelPos, sameValue, LABEL_ABOVE, LABEL_BELOW, type PlotBox } from './diagramLabel'

describe('sameValue', () => {
  it('a uniform load is one value — its max and min are not both labelled', () => {
    expect(sameValue(23.5, 23.5 + 1e-9)).toBe(true)
    expect(sameValue(23.5, 23.4)).toBe(false)
    expect(sameValue(-71.9, 69.4)).toBe(false)
  })
})

// Diagram's own plot: 520×220 with padL 52, padR 18, padT 28, padB 30. Its
// title sits on y = 16, the x tick labels on y = 205.
const box: PlotBox = { left: 52, right: 502, top: 28, bottom: 190 }
const TEXT = '12.5@3.00m'

describe('markerLabelPos', () => {
  it('keeps the usual places when there is room', () => {
    expect(markerLabelPos(250, 100, 'above', TEXT, box)).toEqual({ x: 250, y: 100 - LABEL_ABOVE, anchor: 'middle' })
    expect(markerLabelPos(250, 100, 'below', TEXT, box)).toEqual({ x: 250, y: 100 + LABEL_BELOW, anchor: 'middle' })
  })

  it('a max on the top edge goes under its diamond, not into the title band', () => {
    const p = markerLabelPos(60, box.top, 'above', TEXT, box)
    expect(p.y).toBe(box.top + LABEL_BELOW)
    expect(p.y - 7).toBeGreaterThan(20)            // clear of the title's baseline + descent
  })

  it('a min on the bottom edge goes over its diamond, not onto the x tick labels', () => {
    const p = markerLabelPos(250, box.bottom, 'below', TEXT, box)
    expect(p.y).toBe(box.bottom - LABEL_ABOVE)
    expect(p.y).toBeLessThan(box.bottom)
  })

  it('hugs the plot edge instead of centring out past it', () => {
    expect(markerLabelPos(box.left, 100, 'above', TEXT, box)).toMatchObject({ x: box.left + 2, anchor: 'start' })
    expect(markerLabelPos(box.right, 100, 'above', TEXT, box)).toMatchObject({ x: box.right - 2, anchor: 'end' })
  })
})
