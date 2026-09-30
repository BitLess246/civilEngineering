import { describe, it, expect } from 'vitest'
import { curveLayout, CURVE_W, CURVE_H, CURVE_MIN_FONT, SIDE_PANEL_CHART_PX } from './capacityCurve'
import { minDrawingWidth } from './drawingScale'
import { textWidth } from '../engine/detailSheet'
import chartSrc from '../components/CapacityCurveChart.tsx?raw'
import pushoverSrc from '../components/PushoverPanel.tsx?raw'
import biaxialSrc from '../components/BiaxialPushoverPanel.tsx?raw'

describe('the capacity curve fits the side panel it is drawn in', () => {
  it('its legibility floor is no wider than the 294 px the panel gives it', () => {
    // It was a 460-unit viewBox with 9-unit ticks: a 460 px floor in a 294 px
    // column, so the frame scrolled and hid the curve's right third.
    expect(minDrawingWidth(460, 9)).toBeGreaterThan(SIDE_PANEL_CHART_PX)
    expect(minDrawingWidth(CURVE_W, CURVE_MIN_FONT)).toBeLessThanOrEqual(SIDE_PANEL_CHART_PX)
  })

  it('CURVE_MIN_FONT really is the smallest text the chart sets', () => {
    const literal = [...chartSrc.matchAll(/fontSize=\{([\d.]+)\}/g)].map((m) => Number(m[1]))
    for (const f of literal) expect(f).toBeGreaterThanOrEqual(CURVE_MIN_FONT)
    expect(chartSrc).toContain('fontSize={CURVE_MIN_FONT}')
  })

  it('both pushover panels draw it, and neither keeps a private 460-wide copy', () => {
    for (const src of [pushoverSrc, biaxialSrc]) {
      expect(src).toContain('<CapacityCurveChart')
      expect(src).not.toMatch(/W = 460|viewBox=\{`0 0 \$\{W\}/)
    }
  })
})

describe('curveLayout', () => {
  const pts = [{ x: 0, y: 0 }, { x: -55, y: -820.7, hot: true }, { x: -620, y: -1324.7, hot: true }]
  const g = curveLayout(pts)

  it('plots magnitudes from the origin to the far corner', () => {
    expect(g.points[0]).toMatchObject({ cx: g.x0, cy: g.y0, hot: false })
    expect(g.points[2].cx).toBeCloseTo(g.x1, 9)
    expect(g.points[2].cy).toBeCloseTo(g.y1, 9)
    expect(g.points[1].hot).toBe(true)
  })

  it('ticks at 0, half and the maximum — the maximum is the displacement it was pushed to', () => {
    expect(g.xTicks.map((t) => t.label)).toEqual(['0.0', '310.0', '620.0'])
    expect(g.yTicks.map((t) => t.label)).toEqual(['0', '662', '1325'])
    expect(g.xTicks[2].x).toBeCloseTo(g.x1, 9)
  })

  it('every label fits inside the viewBox', () => {
    // the end tick is anchored at the plot edge ("end"), so it runs leftward
    expect(g.xTicks[2].x - textWidth('620.0', CURVE_MIN_FONT)).toBeGreaterThan(g.x0)
    expect(g.xTicks[2].x).toBeLessThanOrEqual(CURVE_W)
    const title = textWidth('control-node displacement (mm)', 10)
    expect((g.x0 + g.x1) / 2 - title / 2).toBeGreaterThan(0)
    expect((g.x0 + g.x1) / 2 + title / 2).toBeLessThan(CURVE_W)
    // y tick labels right-aligned left of the axis, clear of the rotated title at x = 11
    expect(g.x0 - 5 - textWidth('1325', CURVE_MIN_FONT)).toBeGreaterThan(11 + 6)
    expect(textWidth('base shear (kN)', 10)).toBeLessThan(g.y0 - g.y1 + 40)
    expect(g.y0).toBeLessThan(CURVE_H)
  })
})
