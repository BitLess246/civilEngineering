/**
 * The scale arithmetic, checked against the numbers actually measured in
 * Chromium — not against itself.
 *
 * Every expected value below is a hand calculation from a real reading taken
 * at a stated viewport, recorded in `docs/AuditRemediation.md` § D. That is
 * what makes this a test of the formula rather than a restatement of it: if
 * `renderedTextPx` were wrong, these would not match the browser.
 */
import { describe, it, expect } from 'vitest'
import {
  ANNOTATION_FLOOR_PX, renderedTextPx, minDrawingWidth, clearsFloor,
  maxDrawingWidth, drawingWidthBounds,
} from './drawingScale'

describe('rendered text size', () => {
  it('reproduces what Chromium measured on the shipped drawings', () => {
    // ColumnSchematic: viewBox 420, annotation 11.8 units. Measured 7.14 px at
    // 254 px wide (320 viewport) and 10.90 px at 388 px wide (1280 viewport).
    expect(renderedTextPx(11.8, 254, 420)).toBeCloseTo(7.14, 2)
    expect(renderedTextPx(11.8, 388, 420)).toBeCloseTo(10.90, 2)
    // TSection: viewBox 364, capped at 560 px wide — measured 13.1 px.
    expect(renderedTextPx(8.5, 560, 364)).toBeCloseTo(13.08, 2)
  })

  it('is linear in the width, which is the whole problem', () => {
    // Halving the box halves the text. Nothing in the SVG model stops it.
    expect(renderedTextPx(10, 200, 400)).toBe(5)
    expect(renderedTextPx(10, 100, 400)).toBe(2.5)
  })

  it('returns 0 rather than NaN or Infinity for a box with no width', () => {
    // A drawing inside a collapsed or not-yet-laid-out container measures 0.
    // Propagating NaN would make `clearsFloor` false-y by accident and the
    // wrapper would silently apply a garbage min-width.
    expect(renderedTextPx(10, 0, 400)).toBe(0)
    expect(renderedTextPx(10, 200, 0)).toBe(0)
  })
})

describe('minimum drawing width', () => {
  it('is the width at which the smallest annotation lands exactly on the floor', () => {
    // The defining property, checked by round-tripping through the other
    // function: at the returned width, the text renders at the floor.
    for (const [vb, units] of [[420, 11.8], [672, 7.49], [573, 6.5], [300, 6.5]]) {
      const w = minDrawingWidth(vb, units)
      expect(renderedTextPx(units, w, vb)).toBeCloseTo(ANNOTATION_FLOOR_PX, 6)
    }
  })

  it('gives the numbers the worst shipped drawings actually need', () => {
    // SlabBarSection: viewBox 672, smallest annotation 2.83 px at 254 px wide
    // ⇒ 7.49 units. It needs ~807 px to clear 9 px — i.e. on a 320 px screen
    // it must scroll, and no amount of layout work avoids that while the
    // drawing is 672 units wide with 7.5-unit text.
    expect(minDrawingWidth(672, 2.83 * 672 / 254)).toBeCloseTo(807.8, 1)
    // DevLengthDetail AFTER the split: one 300-unit panel, not a 626-unit
    // sheet of four. 415 px instead of 856 — the split is what makes the
    // floor affordable, which is why the two findings ship together.
    expect(minDrawingWidth(626, 6.58)).toBeCloseTo(856, 0)
    expect(minDrawingWidth(300, 6.5)).toBeCloseTo(415, 0)
  })

  it('scales with the floor, so one constant moves every drawing', () => {
    expect(minDrawingWidth(400, 8, 9)).toBe(450)
    expect(minDrawingWidth(400, 8, 18)).toBe(900)
  })

  it('returns 0 for degenerate input rather than a division blow-up', () => {
    expect(minDrawingWidth(0, 8)).toBe(0)
    expect(minDrawingWidth(400, 0)).toBe(0)
    expect(minDrawingWidth(400, 8, 0)).toBe(0)
  })
})

describe('clearsFloor', () => {
  it('fails every drawing at the width it actually shipped at 320 px', () => {
    // The finding, restated as the predicate. viewBox / units / measured width.
    const shipped: [string, number, number, number][] = [
      ['DevLengthDetail', 626, 6.58, 238],
      ['SlabBarSection', 672, 7.49, 254],
      ['RetainingWallSection', 573, 6.50, 246],
      ['ColumnSchematic', 420, 11.8, 254],
    ]
    for (const [name, vb, units, w] of shipped) {
      expect(clearsFloor(units, w, vb), `${name} unexpectedly passed`).toBe(false)
    }
  })

  it('passes once the drawing is given its minimum width', () => {
    for (const [vb, units] of [[626, 6.58], [672, 7.49], [420, 11.8]]) {
      expect(clearsFloor(units, minDrawingWidth(vb, units), vb)).toBe(true)
    }
  })

  it('is inclusive at the floor, so the minimum width is itself allowed', () => {
    // Off-by-one here would make the wrapper demand one pixel more than it
    // computes, forever.
    expect(clearsFloor(9, 100, 100)).toBe(true)
    expect(clearsFloor(8.999, 100, 100)).toBe(false)
  })
})

describe('the height ceiling', () => {
  it('derives the width at which a figure is exactly the allowed height', () => {
    // RetainingWallSection, measured: 1410 × 1594 at 1920. That is an aspect
    // ratio of 0.8845, so on a 1200-tall screen with a 0.72 budget (864 px) it
    // should want 764 px of width.
    expect(maxDrawingWidth(1410, 1594, 864)).toBeCloseTo(764, 0)
    // A square figure wants its height.
    expect(maxDrawingWidth(100, 100, 500)).toBe(500)
    // A wide figure wants more width than height, which is the whole point of
    // driving the cap off the aspect ratio rather than a constant.
    expect(maxDrawingWidth(200, 100, 500)).toBe(1000)
  })

  it('returns 0 for degenerate input', () => {
    expect(maxDrawingWidth(0, 100, 500)).toBe(0)
    expect(maxDrawingWidth(100, 0, 500)).toBe(0)
    expect(maxDrawingWidth(100, 100, 0)).toBe(0)
  })
})

describe('width bounds — the floor beats the ceiling', () => {
  it('lets the ceiling bind when the figure is comfortably legible', () => {
    // A wide, coarsely annotated figure: the floor is cheap, so the height
    // budget is what decides.
    const b = drawingWidthBounds(400, 200, 20, 300)
    expect(b.min).toBeCloseTo(180, 0)   // 400 × 9 / 20
    expect(b.max).toBeCloseTo(600, 0)   // 300 × 400/200
    expect(b.max).toBeGreaterThan(b.min)
  })

  it('never lets the ceiling push a figure below the legibility floor', () => {
    // THE CASE THAT ACTUALLY OCCURS. RetainingWallSection needs 794 px to
    // clear 9 px, but its height budget on a 1200-tall screen only allows
    // 764 — the two constraints genuinely conflict. Given a figure you must
    // scroll or a figure you cannot read, the floor wins.
    const b = drawingWidthBounds(573, 648, 6.5, 864)
    expect(b.min).toBeCloseTo(793.4, 1)
    expect(b.max).toBe(b.min)           // ceiling clamped UP to the floor
    expect(clearsFloor(6.5, b.max, 573)).toBe(true)
  })

  it('keeps max ≥ min for every shipped figure, so the style is never invalid', () => {
    // `min-width` above `max-width` is a CSS contradiction the browser resolves
    // by ignoring one of them — silently, and differently per engine. The
    // clamp above exists to make that unreachable; this asserts it.
    const shipped: [number, number, number][] = [
      [573, 648, 6.5], [672, 300, 7.49], [420, 484, 11.8], [300, 152, 6.5],
      [364, 260, 8.5], [290, 290, 7.0],
    ]
    for (const [w, h, units] of shipped) {
      for (const budget of [300, 600, 864, 1400]) {
        const b = drawingWidthBounds(w, h, units, budget)
        expect(b.max, `${w}×${h} @${budget}`).toBeGreaterThanOrEqual(b.min)
      }
    }
  })

  it('reports no bounds at all when the height budget is unknown', () => {
    const b = drawingWidthBounds(400, 200, 20, 0)
    expect(b.max).toBe(0)               // no ceiling — the frame leaves it off
  })
})
