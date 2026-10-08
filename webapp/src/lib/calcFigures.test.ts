import { describe, it, expect } from 'vitest'
import { designBeam } from '../engine/beamDesign'
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
  it('draws the layers the design stacked, so d lands on the steel it names', () => {
    // The reported case: 300×500, ⌀28, six bottom bars the web cannot hold in
    // one row. The design stacks them (4+2) and reports d to the layered
    // centroid — a cut drawn as one row of six sat 18 mm deeper than the d
    // dimension said, showed a clear spacing the design had ruled out, and put
    // the strain diagram's steel level in air.
    const r = designBeam({ b: 300, h: 500, cover: 40, barDia: 28, stirrupDia: 10, fc: 28, fy: 415, fyt: 415, Mu: 400, Vu: 150 })
    expect(r.layers).toEqual([4, 2])
    const d = calcBeamSection({
      b: 300, h: 500, cover: 40, barDia: 28, stirrupDia: 10,
      bars: r.bars, comprBars: r.comprBars, spacing: r.sAdopt,
      layers: r.layers, comprLayers: r.comprLayers,
    })
    const bot = d.result.bars.filter((b) => b.role === 'bottom')
    expect(bot).toHaveLength(6)
    // v runs down the page from the TOP face: four bars at dt, two one pitch above
    const dt = (500 - 40 - 10 - 14) / 1000
    const vs = new Set(bot.map((b) => +b.v.toFixed(6)))
    expect(vs.has(+dt.toFixed(6))).toBe(true)
    expect(vs.has(+(dt - 53 / 1000).toFixed(6))).toBe(true)
    // …and the drawn centroid IS the d the design reports — the join
    const centroid = bot.reduce((s, b) => s + b.v, 0) / bot.length
    expect(centroid * 1000).toBeCloseTo(r.d, 0)
  })

  it('swaps the faces on a hogging cut, each stack reading extreme-first', () => {
    // Tension steel at the TOP in the design's layers; compression at the
    // bottom in its own. Mirroring maps the layer nearest one face onto the
    // layer nearest the other, so the array carries over unchanged.
    const d = calcBeamSection({
      b: 300, h: 500, cover: 40, barDia: 28, stirrupDia: 10,
      bars: 6, comprBars: 4, hogging: true, spacing: 100,
      layers: [4, 2], comprLayers: [2, 2],
    })
    const top = d.result.bars.filter((b) => b.role === 'top')
    const bot = d.result.bars.filter((b) => b.role === 'bottom')
    const inset = (40 + 10 + 14) / 1000
    // 6 top bars, two layers down from the compression (bottom-of-page) face…
    expect(top.filter((b) => Math.abs(b.v - inset) < 1e-9)).toHaveLength(4)
    expect(top.filter((b) => Math.abs(b.v - inset - 53 / 1000) < 1e-9)).toHaveLength(2)
    // …and the support cut keeps the continuous share of the bottom face,
    // which sits in the compression stack's own extreme layer
    expect(bot.filter((b) => Math.abs(b.v - (0.5 - inset)) < 1e-9)).toHaveLength(2)
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
