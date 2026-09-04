import { describe, it, expect } from 'vitest'
import { parseColor, paintedSize, paintDrawing, SVG_REFERENCE_PX } from './drawingPdf'
import type { jsPDF } from 'jspdf'
import type { Drawing } from '../engine/planRenderer'
import { buildBoreholeLog } from '../engine/soils/logRenderer'
import { liquefactionChart } from '../engine/soils/liquefactionPlot'
import { liquefactionProfile } from '../engine/soils/liquefaction'
import type { Borehole } from '../engine/soils/model'

/** A jsPDF stand-in that records the calls a painter makes. */
function fakeDoc() {
  const calls: { fn: string; args: unknown[] }[] = []
  const rec = (fn: string) => (...args: unknown[]) => { calls.push({ fn, args }); return doc }
  const doc = {
    calls,
    line: rec('line'), rect: rec('rect'), circle: rec('circle'), text: rec('text'),
    lines: rec('lines'),
    setDrawColor: rec('setDrawColor'), setFillColor: rec('setFillColor'),
    setTextColor: rec('setTextColor'), setLineWidth: rec('setLineWidth'),
    setLineDashPattern: rec('setLineDashPattern'),
    setFont: rec('setFont'), setFontSize: rec('setFontSize'),
  }
  return doc as unknown as jsPDF & { calls: typeof calls }
}

const of = (d: { calls: { fn: string; args: unknown[] }[] }, fn: string) =>
  d.calls.filter((c) => c.fn === fn)

const BOX = { minX: 0, minY: 0, maxX: 100, maxY: 50 }

describe('colour parsing', () => {
  it('reads 6- and 3-digit hex', () => {
    expect(parseColor('#0056b3')).toEqual([0, 0x56, 0xb3])
    expect(parseColor('#abc')).toEqual([0xaa, 0xbb, 0xcc])
  })

  it('treats none/transparent/undefined as no paint, not as black', () => {
    // Defaulting an absent fill to black would flood every unfilled rect.
    expect(parseColor(undefined)).toBeUndefined()
    expect(parseColor('none')).toBeUndefined()
    expect(parseColor('transparent')).toBeUndefined()
    expect(parseColor('rebeccapurple')).toBeUndefined()
  })
})

describe('fitting a drawing into a box', () => {
  const d: Drawing = { primitives: [], bounds: BOX }

  it('scales to the target width and keeps the aspect ratio', () => {
    const r = paintedSize(d, { x: 0, y: 0, w: 200 })
    expect(r.scale).toBeCloseTo(2, 9)
    expect(r.width).toBeCloseTo(200, 9)
    expect(r.height).toBeCloseTo(100, 9)
  })

  it('shrinks to respect maxH rather than overflowing the page', () => {
    const r = paintedSize(d, { x: 0, y: 0, w: 200, maxH: 60 })
    expect(r.height).toBeLessThanOrEqual(60 + 1e-9)
    expect(r.width / r.height).toBeCloseTo(2, 9)
  })

  it('survives a degenerate bounds box without dividing by zero', () => {
    const flat: Drawing = { primitives: [], bounds: { minX: 5, minY: 5, maxX: 5, maxY: 5 } }
    const r = paintedSize(flat, { x: 0, y: 0, w: 100 })
    expect(Number.isFinite(r.scale)).toBe(true)
  })
})

describe('painting primitives', () => {
  it('maps drawing coordinates into the target box', () => {
    const d: Drawing = {
      bounds: BOX,
      primitives: [{ kind: 'line', x1: 0, y1: 0, x2: 100, y2: 50, stroke: '#000000' }],
    }
    const doc = fakeDoc()
    paintDrawing(doc, d, { x: 10, y: 20, w: 100 })
    // scale 1: (0,0) → (10,20) and (100,50) → (110,70)
    expect(of(doc, 'line')[0].args).toEqual([10, 20, 110, 70])
  })

  it('treats stroke width as a PEN WEIGHT in px, not as geometry', () => {
    // This is the one quantity on a primitive that is NOT in the drawing's own
    // units. `planToSvg` emits it raw — `stroke-width="${p.width}"` — whatever
    // the scale, while `text.size` and `dash` are lengths in the drawing and
    // do scale. Scaling the pen with the geometry is what made a framing plan
    // print as slabs of solid colour.
    const d: Drawing = {
      bounds: BOX,
      primitives: [{ kind: 'line', x1: 0, y1: 0, x2: 1, y2: 1, stroke: '#000', width: 1.2 }],
    }
    const doc = fakeDoc()
    const fit = paintDrawing(doc, d, { x: 0, y: 0, w: 200 })
    // 1.2 px of the 1052 px the same drawing spans on screen, on 200 mm of paper
    expect(of(doc, 'setLineWidth')[0].args[0]).toBeCloseTo((1.2 * 200) / SVG_REFERENCE_PX, 9)
    expect(fit.penScale).toBeCloseTo(200 / SVG_REFERENCE_PX, 12)
  })

  it('gives the same pen to the same weight however big the drawing is', () => {
    // The defect grew with the drawing's world size: a notes sheet whose
    // bounds are fractions of a unit looked nearly right while an 18 m framing
    // plan came out unreadable. Two drawings of wildly different extent, drawn
    // into the same box, must now print the same weight.
    const pen = (span: number) => {
      const d: Drawing = {
        bounds: { minX: 0, minY: 0, maxX: span, maxY: span },
        primitives: [{ kind: 'line', x1: 0, y1: 0, x2: span, y2: span, stroke: '#000', width: 1.4 }],
      }
      const doc = fakeDoc()
      paintDrawing(doc, d, { x: 0, y: 0, w: 170 })
      return of(doc, 'setLineWidth')[0].args[0] as number
    }
    expect(pen(0.65)).toBeCloseTo(pen(18), 12)
    // …and it is a drafting weight, not a slab: well under a millimetre.
    expect(pen(18)).toBeLessThan(0.4)
    expect(pen(18)).toBeGreaterThan(0.1)
  })

  it('still scales dashes and text, which ARE lengths in the drawing', () => {
    const d: Drawing = {
      bounds: BOX,
      primitives: [
        { kind: 'line', x1: 0, y1: 0, x2: 1, y2: 1, stroke: '#000', width: 1, dash: [0.4, 0.2] },
        { kind: 'text', x: 0, y: 0, text: 'A', size: 0.5 },
      ],
    }
    const doc = fakeDoc()
    paintDrawing(doc, d, { x: 0, y: 0, w: 200 })   // scale 2
    expect(of(doc, 'setLineDashPattern')[0].args[0]).toEqual([0.8, 0.4])
    expect(of(doc, 'setFontSize')[0].args[0]).toBeCloseTo(1.0 * 2.834645, 6)
  })

  it('never lets a pen vanish — a hairline still marks the page', () => {
    const d: Drawing = {
      bounds: BOX,
      primitives: [{ kind: 'line', x1: 0, y1: 0, x2: 1, y2: 1, stroke: '#000', width: 0.05 }],
    }
    const doc = fakeDoc()
    paintDrawing(doc, d, { x: 0, y: 0, w: 20 })
    expect(of(doc, 'setLineWidth')[0].args[0]).toBeGreaterThanOrEqual(0.05)
  })

  it('picks the right jsPDF paint style for fill / stroke / both', () => {
    const d: Drawing = {
      bounds: BOX,
      primitives: [
        { kind: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#ffffff' },
        { kind: 'rect', x: 0, y: 0, w: 10, h: 10, stroke: '#000000' },
        { kind: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#fff', stroke: '#000' },
      ],
    }
    const doc = fakeDoc()
    paintDrawing(doc, d, { x: 0, y: 0, w: 100 })
    expect(of(doc, 'rect').map((c) => c.args[4])).toEqual(['F', 'S', 'FD'])
  })

  it('SKIPS a primitive with neither fill nor stroke instead of painting it black', () => {
    const d: Drawing = {
      bounds: BOX,
      primitives: [{ kind: 'rect', x: 0, y: 0, w: 10, h: 10, fill: 'none' }],
    }
    const doc = fakeDoc()
    paintDrawing(doc, d, { x: 0, y: 0, w: 100 })
    expect(of(doc, 'rect')).toHaveLength(0)
  })

  it('passes an EMPTY dash array for solid lines, which jsPDF requires', () => {
    const d: Drawing = {
      bounds: BOX,
      primitives: [{ kind: 'line', x1: 0, y1: 0, x2: 1, y2: 1, stroke: '#000' }],
    }
    const doc = fakeDoc()
    paintDrawing(doc, d, { x: 0, y: 0, w: 100 })
    expect(of(doc, 'setLineDashPattern')[0].args[0]).toEqual([])
  })

  it('scales the dash pattern with the drawing', () => {
    const d: Drawing = {
      bounds: BOX,
      primitives: [{ kind: 'line', x1: 0, y1: 0, x2: 1, y2: 1, stroke: '#000', dash: [2, 1] }],
    }
    const doc = fakeDoc()
    paintDrawing(doc, d, { x: 0, y: 0, w: 200 })
    expect(of(doc, 'setLineDashPattern')[0].args[0]).toEqual([4, 2])
  })

  it('RESETS the dash pattern when it finishes', () => {
    // A dashed pattern left set would leak into whatever the report draws next.
    const d: Drawing = {
      bounds: BOX,
      primitives: [{ kind: 'line', x1: 0, y1: 0, x2: 1, y2: 1, stroke: '#000', dash: [2, 1] }],
    }
    const doc = fakeDoc()
    paintDrawing(doc, d, { x: 0, y: 0, w: 100 })
    const last = of(doc, 'setLineDashPattern').at(-1)!
    expect(last.args[0]).toEqual([])
  })

  it('honours text anchor, weight and rotation', () => {
    const d: Drawing = {
      bounds: BOX,
      primitives: [
        { kind: 'text', x: 10, y: 10, text: 'mid', size: 3, anchor: 'middle', weight: 700 },
        { kind: 'text', x: 10, y: 20, text: 'end', size: 3, anchor: 'end' },
        { kind: 'text', x: 10, y: 30, text: 'rot', size: 3, rotate: -90 },
      ],
    }
    const doc = fakeDoc()
    paintDrawing(doc, d, { x: 0, y: 0, w: 100 })
    const t = of(doc, 'text')
    expect((t[0].args[3] as { align: string }).align).toBe('center')
    expect((t[1].args[3] as { align: string }).align).toBe('right')
    expect((t[2].args[3] as { angle: number }).angle).toBe(90)
    expect(of(doc, 'setFont')[0].args[1]).toBe('bold')
    expect(of(doc, 'setFont')[1].args[1]).toBe('normal')
  })
})

// ── Against the drawings this actually has to print ───────────────────────

const HOLE: Borehole = {
  id: 'bh', name: 'BH-01', kind: 'borehole', actualDepth: 12, diameter: 100,
  groundwaterDepth: 1.5,
  layers: [
    { id: 'l1', depthTop: 0, depthBottom: 4, name: 'Silty Sand', symbol: 'SM' },
    { id: 'l2', depthTop: 4, depthBottom: 12, name: 'Lean Clay', symbol: 'CL' },
  ],
  samples: [],
  spt: [
    { id: 'n1', depth: 3, blows: [2, 3, 3], penetration: [150, 150, 150], hammer: 'safety', rodLength: 4.5 },
    { id: 'n2', depth: 6, blows: [3, 4, 5], penetration: [150, 150, 150], hammer: 'safety', rodLength: 7.5 },
  ],
}

describe('the real drawings paint without blowing up', () => {
  it('paints a borehole log', () => {
    const doc = fakeDoc()
    const r = paintDrawing(doc, buildBoreholeLog(HOLE), { x: 14, y: 40, w: 180, maxH: 200 })
    expect(r.height).toBeLessThanOrEqual(200 + 1e-9)
    expect(doc.calls.length).toBeGreaterThan(20)
    expect(doc.calls.some((c) => c.fn === 'text')).toBe(true)
  })

  it('paints a liquefaction FS profile', () => {
    const p = liquefactionProfile(HOLE, { l1: { gamma: 18, gammaSat: 20 }, l2: { gamma: 17, gammaSat: 19 } },
      { amax: 0.4, magnitude: 7.5 })
    const doc = fakeDoc()
    paintDrawing(doc, liquefactionChart(p, { waterTable: 1.5, holeDepth: 12 }), { x: 14, y: 40, w: 160 })
    expect(doc.calls.some((c) => c.fn === 'rect')).toBe(true)
    expect(doc.calls.some((c) => c.fn === 'line')).toBe(true)
  })

  it('emits no NaN into any drawing call', () => {
    // A NaN coordinate produces a silently blank or corrupt PDF.
    const doc = fakeDoc()
    paintDrawing(doc, buildBoreholeLog(HOLE), { x: 14, y: 40, w: 180 })
    for (const c of doc.calls) {
      for (const a of c.args) {
        if (typeof a === 'number') expect(Number.isFinite(a), `${c.fn}(${String(a)})`).toBe(true)
      }
    }
  })

  it('keeps everything within the target box', () => {
    const doc = fakeDoc()
    const box = { x: 14, y: 40, w: 180, maxH: 150 }
    const r = paintDrawing(doc, buildBoreholeLog(HOLE), box)
    for (const c of of(doc, 'line')) {
      const [x1, y1, x2, y2] = c.args as number[]
      for (const x of [x1, x2]) expect(x).toBeGreaterThanOrEqual(box.x - 0.01)
      for (const x of [x1, x2]) expect(x).toBeLessThanOrEqual(box.x + r.width + 0.01)
      for (const y of [y1, y2]) expect(y).toBeGreaterThanOrEqual(box.y - 0.01)
      for (const y of [y1, y2]) expect(y).toBeLessThanOrEqual(box.y + r.height + 0.01)
    }
  })
})
