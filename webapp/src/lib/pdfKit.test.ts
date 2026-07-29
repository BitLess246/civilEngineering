import { describe, it, expect } from 'vitest'
import { fitFigure, fitTitleSize, truncateToWidth, createSheet, CONTENT_W, TITLE_RESERVED_W, M, PAGE_H, FOOT_Y } from './pdfKit'

describe('fitFigure', () => {
  it('fills the column width when the image is short enough', () => {
    const f = fitFigure(1600, 900, 120)
    expect(f.drawW).toBeCloseTo(CONTENT_W, 6)
    expect(f.drawH).toBeCloseTo(CONTENT_W * 900 / 1600, 6)
    expect(f.x).toBeCloseTo(M, 6)
  })

  it('PRESERVES ASPECT when the height cap bites', () => {
    // The regression: capping the height while leaving the width at the full
    // column squashed a 300×500 beam section into something nearly square.
    const w = 1446, h = 1410, maxH = 150
    const f = fitFigure(w, h, maxH)
    expect(f.drawH).toBeCloseTo(maxH, 6)
    expect(f.drawH / f.drawW).toBeCloseTo(h / w, 6)
    expect(f.drawW).toBeLessThan(CONTENT_W)
  })

  it('centres the image in the column once it is narrower than the column', () => {
    const f = fitFigure(500, 2000, 100)
    expect(f.x - M).toBeCloseTo((CONTENT_W - f.drawW) / 2, 6)
    expect(f.x).toBeGreaterThan(M)
  })

  it('never exceeds either bound, over a sweep of shapes', () => {
    for (const w of [100, 640, 1446, 4000]) {
      for (const h of [80, 900, 1410, 5000]) {
        const f = fitFigure(w, h, 120)
        expect(f.drawW, `${w}x${h}`).toBeLessThanOrEqual(CONTENT_W + 1e-9)
        expect(f.drawH, `${w}x${h}`).toBeLessThanOrEqual(120 + 1e-9)
        expect(f.drawH / f.drawW, `${w}x${h}`).toBeCloseTo(h / w, 6)
      }
    }
  })

  it('degrades safely on a zero-sized image instead of dividing by zero', () => {
    const f = fitFigure(0, 0, 120)
    expect(Number.isFinite(f.drawW)).toBe(true)
    expect(Number.isFinite(f.drawH)).toBe(true)
  })
})

describe('sheet cursor', () => {
  it('breaks to a new page only when the requested space does not fit', () => {
    const s = createSheet()
    const pages = () => s.doc.getNumberOfPages()
    s.y = FOOT_Y - 20
    s.ensure(10)
    expect(pages(), 'should not break — 10mm fits in 20mm').toBe(1)
    s.ensure(30)
    expect(pages(), 'should break — 30mm does not fit in 20mm').toBe(2)
    expect(s.y).toBe(M + 6)
  })

  it('keeps the footer band clear', () => {
    expect(FOOT_Y).toBeLessThan(PAGE_H)
    expect(PAGE_H - FOOT_Y).toBeGreaterThanOrEqual(10)
  })
})

describe('title fitting', () => {
  const AVAIL = CONTENT_W - TITLE_RESERVED_W
  // A real measurer: the same font and metrics the header uses.
  const measurer = (title: string) => {
    const s = createSheet()
    return (pt: number) => { s.setF('sans', 'bold', pt, [0, 0, 0]); return s.doc.getTextWidth(title) }
  }

  const SHORT = 'Structure — Design Calculation'
  const LONG = 'Flexible Combined Footing on Elastic Subgrade — Design Calculation'

  it('leaves a short title at full size', () => {
    expect(fitTitleSize(measurer(SHORT), AVAIL)).toBe(15.5)
  })

  it('shrinks a long title until it clears the verdict chip', () => {
    const m = measurer(LONG)
    // the case is real: at full size this title WOULD run under the chip
    expect(m(15.5)).toBeGreaterThan(AVAIL)
    const size = fitTitleSize(m, AVAIL)
    expect(size).toBeLessThan(15.5)
    expect(size).toBe(9.5)   // this one bottoms out; the ellipsis test covers the rest
  })

  it('stops at the floor rather than shrinking a pathological title to nothing', () => {
    const m = measurer('X'.repeat(400))
    expect(fitTitleSize(m, AVAIL)).toBe(9.5)
  })

  it('ellipsises what still will not fit at the floor, rather than cutting mid-word', () => {
    // Shrinking alone is not enough — this title is still ~130mm at 9.5pt
    // against 126mm available, and would otherwise be sliced at whatever
    // character ran out of room.
    const s = createSheet()
    s.setF('sans', 'bold', 9.5, [0, 0, 0])
    const measure = (t: string) => s.doc.getTextWidth(t)
    const out = truncateToWidth(measure, LONG, AVAIL)
    expect(measure(out)).toBeLessThanOrEqual(AVAIL)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThan(LONG.length)
  })

  it('leaves text that already fits completely untouched', () => {
    const s = createSheet()
    s.setF('sans', 'bold', 15.5, [0, 0, 0])
    const measure = (t: string) => s.doc.getTextWidth(t)
    expect(truncateToWidth(measure, SHORT, AVAIL)).toBe(SHORT)
  })
})
