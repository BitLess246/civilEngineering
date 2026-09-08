import { describe, it, expect } from 'vitest'
import { calcBeamSection, calcColumnSection } from './calcFigures'
import type { PlanPrimitive } from '../engine/planRenderer'

// A calculator has no model to cut, but it has just designed a cage — so its
// section is the same CUT the drawing set makes, not a picture of one.
const dots = (d: { primitives: PlanPrimitive[] }) =>
  d.primitives.filter((p) => p.kind === 'circle')

describe('calcBeamSection', () => {
  const base = { b: 300, h: 500, cover: 40, barDia: 20, stirrupDia: 10, spacing: 220 }

  it('draws one dot per designed bar, each in its own place', () => {
    // The old figure spread dots from a COUNT. This cuts the cage, so the test
    // that matters is that the cage put no two bars in one place — 4 bottom
    // bars drew 2 dots until `beamCage` laid the face out once.
    const d = calcBeamSection({ ...base, bars: 4 })
    const bottom = d.result.bars.filter((b) => b.role === 'bottom')
    expect(bottom).toHaveLength(4)
    expect(new Set(bottom.map((b) => b.u.toFixed(4))).size).toBe(4)
    expect(dots(d).length).toBeGreaterThanOrEqual(4)
  })

  it('cuts where the designed steel IS — midspan sagging, a support hogging', () => {
    // A cage curtails, so a cut taken anywhere else shows a different bar count
    // from the one the check used.
    expect(calcBeamSection({ ...base, bars: 5 }).result.bars.filter((b) => b.role === 'bottom'))
      .toHaveLength(5)
    expect(calcBeamSection({ ...base, bars: 5, hogging: true }).result.bars.filter((b) => b.role === 'top'))
      .toHaveLength(5)
  })

  it('draws the stirrup the cage bends, not a rectangle', () => {
    // `runPolylines` geometry: the 135° returns are part of the tie, so its
    // polyline has more vertices than a four-corner loop.
    const d = calcBeamSection({ ...base, bars: 3 })
    expect(d.result.ties.length).toBeGreaterThan(0)
    expect(Math.max(...d.result.ties.map((t) => t.pts.length))).toBeGreaterThan(5)
  })

  it('keeps every bar inside the concrete it is drawn in', () => {
    const d = calcBeamSection({ ...base, bars: 4, comprBars: 2 })
    for (const b of d.result.bars) {
      expect(Math.abs(b.u)).toBeLessThan(base.b / 2000)
      expect(b.v).toBeGreaterThan(0)
      expect(b.v).toBeLessThan(base.h / 1000)
    }
  })

  it('prints d and whatever the caller says under it', () => {
    const d = calcBeamSection({ ...base, bars: 4, d: 440, notes: ['4-⌀20 BOT'] })
    const text = d.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text)
    expect(text.some((t) => t.includes('d = 440'))).toBe(true)
    expect(text).toContain('4-⌀20 BOT')
  })
})

describe('calcColumnSection', () => {
  it('cuts the tie SET the cage places — hoop and cross ties, not one loop', () => {
    const d = calcColumnSection({ b: 400, h: 400, cover: 40, barDia: 28, tieDia: 10, bars: 8, spacing: 400 })
    expect(d.result.bars).toHaveLength(8)
    expect(d.result.ties.length).toBeGreaterThan(1)
    for (const b of d.result.bars) {
      expect(Math.abs(b.u)).toBeLessThan(0.2)
      expect(Math.abs(b.v)).toBeLessThan(0.2)
    }
  })

  it('reads a column as a plan — h across the page, b down it', () => {
    const d = calcColumnSection({ b: 300, h: 500, cover: 40, barDia: 20, tieDia: 10, bars: 8, spacing: 300 })
    const us = d.result.bars.map((x) => Math.abs(x.u)), vs = d.result.bars.map((x) => Math.abs(x.v))
    expect(Math.max(...us)).toBeGreaterThan(Math.max(...vs))
  })
})
