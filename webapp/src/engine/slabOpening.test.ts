import { describe, it, expect } from 'vitest'
import type { SlabOpening } from './model'
import {
  interruptedBars, replacementEachSide, diagonalLength, openingBox, openingStripCheck,
  designSlabOpening, buildSlabOpeningDetail, DIAGONAL_MIN_LENGTH,
  type SlabOpeningInput,
} from './slabOpening'

// ─────────────────────────────────────────────────────────────────────────
// WORKED EXAMPLE — the fixture every assertion below is checked against.
//
//   Panel        6.00 × 5.00 m, slab h = 150 mm, cover 20 mm
//   Mat          ⌀12 @ 200 c/c both ways, f'c = 21 MPa, fy = 415 MPa
//   Opening      1.00 (x) × 0.80 (y) m, its corner at (2.50, 2.00) m
//
// BY HAND
//
//   Bars interrupted
//     running in x — cut across their spacing by the opening's 800 mm y extent
//       n = ⌊800/200⌋ + 1 = 5           → 3 each side (half, rounded up)
//     running in y — cut by the 1000 mm x extent
//       n = ⌊1000/200⌋ + 1 = 6          → 3 each side
//
//   Development length §425.4.2.3 (SI, coefficient 1/1.1)
//     cb   = min(cover + db/2, s/2) = min(26, 100) = 26 mm; Ktr = 0 (no ties
//            in a slab mat) → (cb+Ktr)/db = 26/12 = 2.167 ≤ 2.5
//     ψt   = 1.0 (only 124 mm of concrete below the top mat, not >300)
//     ψe   = 1.0 uncoated, ψs = 0.8 (db ≤ 20), λ = 1.0, √f'c = 4.583
//     ld   = 415·1.0·1.0·0.8·12 / (1.1·1.0·4.583·2.167)
//          = 3984 / 10.922 = 364.8 mm   (>300 mm floor, so it governs)
//
//   Replacement bar length = opening + ℓd each side
//     x bars: 1000 + 2(364.8) = 1729.5 mm
//     y bars:  800 + 2(364.8) = 1529.5 mm
//
//   Diagonal corner bar: 2·ld = 729.5 mm < the 1000 mm practical minimum → 1000
//
//   §408.5.4.2 zone: column strips run 0.25·min(6,5) = 1.25 m in from each
//     edge. The opening spans x 2.50–3.50 and y 2.00–2.80, inside neither, so
//     it is the middle ∩ middle case — any size permitted, §408.5.4.2(a).
//
//   §422.6.4.3 clearance: d = 150 − 20 − 1.5(12) = 112 mm; the critical section
//     sits d/2 = 56 mm off the column face and the reach is 4h = 600 mm →
//     656 mm required. Nearest corner is √(2.50² + 2.00²) = 3.202 m. Clear.
// ─────────────────────────────────────────────────────────────────────────
const opening: SlabOpening = { id: 'O1', kind: 'rect', x: 2.5, y: 2.0, w: 1.0, h: 0.8 }
const panel: SlabOpeningInput = {
  lx: 6, ly: 5, h: 150, opening,
  barDia: 12, spacingX: 200, spacingY: 200,
  cover: 20, fc: 21, fy: 415, mark: 'S1/O1',
}
const LD = 364.75   // mm, the hand calc above

describe('counting the interrupted bars', () => {
  it('takes the phase-independent upper bound ⌊cut/s⌋ + 1', () => {
    // A 1.0 m hole in a 200 mm mat catches 5 bars if it lands between bar lines
    // and 6 if it lands on one. The set-out is not known when the detail is
    // drawn, so only the 6 is safe to detail.
    expect(interruptedBars(1.0, 200)).toBe(6)
    expect(interruptedBars(0.8, 200)).toBe(5)
    // exactly on a multiple: the +1 is the bar at the far edge
    expect(interruptedBars(0.6, 300)).toBe(3)
  })
  it('is zero for a degenerate opening or spacing', () => {
    expect(interruptedBars(0, 200)).toBe(0)
    expect(interruptedBars(1, 0)).toBe(0)
    expect(interruptedBars(-1, 200)).toBe(0)
  })
})

describe('the replacement rule — §408.5.4.2', () => {
  it('splits half each side, rounding UP so nothing is left unreplaced', () => {
    expect(replacementEachSide(6)).toBe(3)     // 3 + 3 = 6, exact
    expect(replacementEachSide(5)).toBe(3)     // 3 + 3 = 6 ≥ 5, never 2 + 2
    expect(replacementEachSide(1)).toBe(1)
    expect(replacementEachSide(0)).toBe(0)
  })
  it('never provides fewer bars than the opening interrupted', () => {
    for (let n = 0; n <= 40; n++) expect(2 * replacementEachSide(n)).toBeGreaterThanOrEqual(n)
  })
})

describe('diagonal corner bars', () => {
  it('is ℓd each side of the corner, floored at the practical minimum', () => {
    expect(diagonalLength(364.75)).toBe(DIAGONAL_MIN_LENGTH)   // 729.5 < 1000
    expect(diagonalLength(700)).toBe(1400)                     // ℓd governs
  })
})

describe('opening geometry', () => {
  it('boxes a rectangle from its corner and a circle from its centre', () => {
    expect(openingBox(opening)).toEqual({ x0: 2.5, y0: 2.0, x1: 3.5, y1: 2.8 })
    expect(openingBox({ id: 'C', kind: 'circle', x: 3, y: 2, r: 0.4 }))
      .toEqual({ x0: 2.6, y0: 1.6, x1: 3.4, y1: 2.4 })
  })
})

describe('§408.5.4.2 strip zones', () => {
  const b = (x0: number, y0: number, w: number, h: number) => ({ x0, y0, x1: x0 + w, y1: y0 + h })

  it('puts the worked example in middle ∩ middle, where any size is permitted', () => {
    const s = openingStripCheck(b(2.5, 2.0, 1.0, 0.8), 6, 5)
    expect(s.zone).toBe('middle-middle')
    expect(s.csWidth).toBeCloseTo(2.5, 9)      // 0.25·min(6,5) each side of the line
    expect(s.limit).toBe(1)
    expect(s.ok).toBe(true)
  })

  it('applies the ⅛ limit where two column strips intersect — (b)', () => {
    // Hard against the panel corner: inside the 1.25 m column strip both ways.
    const s = openingStripCheck(b(0.2, 0.2, 1.2, 1.2), 6, 5)
    expect(s.zone).toBe('column-column')
    expect(s.limit).toBeCloseTo(1 / 8, 9)
    expect(s.fracX).toBeCloseTo(1.2 / 2.5, 9)  // 48% of the strip
    expect(s.ok).toBe(false)
    // …and a small one in the same place passes: 0.30/2.5 = 12% ≤ 12.5%
    expect(openingStripCheck(b(0.2, 0.2, 0.30, 0.30), 6, 5).ok).toBe(true)
  })

  it('applies the ¼ limit across one column and one middle strip — (c)', () => {
    const s = openingStripCheck(b(0.2, 2.0, 1.0, 0.8), 6, 5)   // column in x, middle in y
    expect(s.zone).toBe('column-middle')
    expect(s.limit).toBeCloseTo(1 / 4, 9)
    expect(s.ok).toBe(false)                                   // 1.00/2.5 = 40% > 25%
    // the same opening 400 mm narrower passes: 0.60/2.5 = 24%
    expect(openingStripCheck(b(0.2, 2.0, 0.6, 0.6), 6, 5).ok).toBe(true)
  })
})

describe('designSlabOpening — the worked example', () => {
  const r = designSlabOpening(panel)

  it('counts the interrupted bars each way', () => {
    expect(r.x.cut).toBeCloseTo(0.8, 9)        // opening's y extent cuts the x bars
    expect(r.x.interrupted).toBe(5)
    expect(r.y.cut).toBeCloseTo(1.0, 9)
    expect(r.y.interrupted).toBe(6)
  })

  it('replaces them half each side, top and bottom', () => {
    expect(r.x.eachSide).toBe(3)
    expect(r.y.eachSide).toBe(3)
    // 2 sides × 2 faces
    expect(r.x.total).toBe(12)
    expect(r.y.total).toBe(12)
  })

  it('develops each replacement bar ℓd past both faces of the opening', () => {
    expect(r.x.ld).toBeCloseTo(LD, 1)
    expect(r.y.ld).toBeCloseTo(LD, 1)
    expect(r.x.barLength).toBeCloseTo(1000 + 2 * LD, 1)
    expect(r.y.barLength).toBeCloseTo(800 + 2 * LD, 1)
    expect(r.x.fitsSpan).toBe(true)
    expect(r.y.fitsSpan).toBe(true)
  })

  it('trims all four re-entrant corners, both faces', () => {
    expect(r.diagonal.corners).toBe(4)
    expect(r.diagonal.dia).toBe(12)
    expect(r.diagonal.length).toBe(1000)       // the floor, not 2·365
    expect(r.diagonal.total).toBe(8)
  })

  it('clears the column by more than §422.6.4.3 asks', () => {
    expect(r.cornerClear).toBeCloseTo(Math.hypot(2.5, 2.0), 6)
    expect(r.shearClear).toBeCloseTo(0.656, 6) // (112/2 + 4·150)/1000
    expect(r.shearOK).toBe(true)
  })

  it('fits the replacement band between the opening and the supports', () => {
    expect(r.x.band).toBeCloseTo(0.6, 9)       // 3 bars @ 200
    expect(r.edgeClear).toEqual({ x0: 2.5, x1: 2.5, y0: 2.0, y1: 2.2 })
    expect(r.bandFits).toBe(true)
  })

  it('passes overall', () => {
    expect(r.ok).toBe(true)
  })
})

describe('designSlabOpening — the cases the detail exists to catch', () => {
  it('fails an oversized opening where two column strips meet (§408.5.4.2(b))', () => {
    const r = designSlabOpening({
      ...panel, opening: { id: 'O2', kind: 'rect', x: 0.2, y: 0.2, w: 1.2, h: 1.2 },
    })
    expect(r.strip.zone).toBe('column-column')
    expect(r.strip.ok).toBe(false)
    expect(r.ok).toBe(false)
    expect(r.notes.join(' ')).toContain('§408.5.4.2(b)')
  })

  it('flags an opening inside the punching-shear reach of the column (§422.6.4.3)', () => {
    // 0.30 m square in the corner: small enough for the ⅛ strip limit, but
    // 0.28 m from the column against a 0.656 m required clearance.
    const r = designSlabOpening({
      ...panel, opening: { id: 'O3', kind: 'rect', x: 0.2, y: 0.2, w: 0.3, h: 0.3 },
    })
    expect(r.strip.ok).toBe(true)
    expect(r.shearOK).toBe(false)
    expect(r.ok).toBe(false)
    expect(r.notes.join(' ')).toContain('§422.6.4.3')
  })

  it('flags a replacement band that will not fit beside the opening', () => {
    // The opening's own edge is 0.25 m off the support, but three ⌀12 bars at
    // 200 c/c need 0.60 m of slab to sit in.
    const r = designSlabOpening({
      ...panel, opening: { id: 'O4', kind: 'rect', x: 2.5, y: 0.25, w: 1.0, h: 0.8 },
    })
    expect(r.bandFits).toBe(false)
    expect(r.ok).toBe(false)
    expect(r.notes.join(' ')).toContain('bunch them at reduced spacing')
  })

  it('detail a circular opening off its bounding square', () => {
    const r = designSlabOpening({ ...panel, opening: { id: 'C1', kind: 'circle', x: 3, y: 2.5, r: 0.4 } })
    expect(r.box).toEqual({ x0: 2.6, y0: 2.1, x1: 3.4, y1: 2.9 })
    expect(r.x.interrupted).toBe(5)            // ⌊800/200⌋ + 1
    expect(r.y.interrupted).toBe(5)
    expect(r.diagonal.corners).toBe(4)
  })

  it('scales the count with a tighter mat, as the replacement rule requires', () => {
    const tight = designSlabOpening({ ...panel, spacingX: 100, spacingY: 100 })
    expect(tight.x.interrupted).toBe(9)        // ⌊800/100⌋ + 1
    expect(tight.y.interrupted).toBe(11)
    expect(tight.x.eachSide).toBe(5)
    expect(tight.y.eachSide).toBe(6)
  })
})

describe('buildSlabOpeningDetail', () => {
  const d = buildSlabOpeningDetail(panel, { detailNo: '1', sheetRef: 'S-08' })
  const texts = d.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text)
  const lines = d.primitives.filter((p) => p.kind === 'line') as
    { x1: number; y1: number; x2: number; y2: number; stroke: string }[]
  const rebar = lines.filter((l) => l.stroke === '#b45309')

  it('titles with the panel mark and returns finite, ordered bounds', () => {
    expect(d.title).toBe('SLAB OPENING DETAIL — S1/O1')
    for (const v of Object.values(d.bounds)) expect(Number.isFinite(v)).toBe(true)
    expect(d.bounds.maxX).toBeGreaterThan(d.bounds.minX)
    expect(d.bounds.maxY).toBeGreaterThan(d.bounds.minY)
  })

  it('draws every primitive inside the sheet bounds — text extents included', () => {
    // The sheet is only right if what it draws is ON it. Checking a text
    // primitive's ANCHOR alone passes a note that runs a metre off the right
    // edge, which is exactly what the first render of this sheet did; the
    // string's own width has to be in the check.
    const GLYPH = 0.55                       // mean Arial cap width / font size
    const check = (p: typeof d.primitives[number], sheet = d.bounds) => {
      let xs: number[] = [], ys: number[] = []
      if (p.kind === 'line' || p.kind === 'dim') { xs = [p.x1, p.x2]; ys = [p.y1, p.y2] }
      else if (p.kind === 'rect') { xs = [p.x, p.x + p.w]; ys = [p.y, p.y + p.h] }
      else if (p.kind === 'circle') { xs = [p.cx - p.r, p.cx + p.r]; ys = [p.cy - p.r, p.cy + p.r] }
      else if (p.kind === 'text') {
        const w = p.text.length * GLYPH * p.size, h = p.size
        const a = p.anchor ?? 'start'
        const lead = a === 'middle' ? -w / 2 : a === 'end' ? -w : 0
        // a rotated label spends its length in Y instead of X
        if (p.rotate) { xs = [p.x - h / 2, p.x + h / 2]; ys = [p.y + lead, p.y + lead + w] }
        else { xs = [p.x + lead, p.x + lead + w]; ys = [p.y - h / 2, p.y + h / 2] }
      }
      for (const x of xs) { expect(x).toBeGreaterThanOrEqual(sheet.minX - 1e-9); expect(x).toBeLessThanOrEqual(sheet.maxX + 1e-9) }
      for (const y of ys) { expect(y).toBeGreaterThanOrEqual(sheet.minY - 1e-9); expect(y).toBeLessThanOrEqual(sheet.maxY + 1e-9) }
    }
    for (const p of d.primitives) check(p)
  })

  it('keeps every drawn bar inside the panel it is cast in', () => {
    // An opening hard in the corner pushes both the replacement band and the
    // diagonal bars past the slab edge unless they are bunched and clipped.
    const tight = buildSlabOpeningDetail(
      { ...panel, opening: { id: 'O2', kind: 'rect', x: 0.2, y: 0.2, w: 1.2, h: 1.2 } },
      { detailNo: '2' },
    )
    const bars = tight.primitives.filter((p) => p.kind === 'line' && p.stroke === '#b45309') as
      { x1: number; y1: number; x2: number; y2: number }[]
    expect(bars.length).toBeGreaterThan(0)
    for (const l of bars) {
      for (const x of [l.x1, l.x2]) { expect(x).toBeGreaterThanOrEqual(-1e-9); expect(x).toBeLessThanOrEqual(panel.lx + 1e-9) }
      for (const y of [l.y1, l.y2]) { expect(y).toBeGreaterThanOrEqual(-1e-9); expect(y).toBeLessThanOrEqual(panel.ly + 1e-9) }
    }
    // and it still draws every bar it designed, bunched rather than dropped
    const horiz = bars.filter((l) => Math.abs(l.y1 - l.y2) < 1e-9)
    expect(horiz).toHaveLength(2 * tight.result.x.eachSide)
  })

  it('draws the replacement bars — half each side, both directions', () => {
    const horiz = rebar.filter((l) => Math.abs(l.y1 - l.y2) < 1e-9)
    const vert = rebar.filter((l) => Math.abs(l.x1 - l.x2) < 1e-9)
    expect(horiz).toHaveLength(2 * d.result.x.eachSide)   // 3 above + 3 below
    expect(vert).toHaveLength(2 * d.result.y.eachSide)
    // above the opening and below it, not all on one side
    expect(horiz.filter((l) => l.y1 < d.result.box.y0)).toHaveLength(d.result.x.eachSide)
    expect(horiz.filter((l) => l.y1 > d.result.box.y1)).toHaveLength(d.result.x.eachSide)
  })

  it('runs each replacement bar ℓd past both faces of the opening', () => {
    const horiz = rebar.filter((l) => Math.abs(l.y1 - l.y2) < 1e-9)
    for (const l of horiz) {
      expect(Math.min(l.x1, l.x2)).toBeLessThanOrEqual(d.result.box.x0 - LD / 1000 + 1e-6)
      expect(Math.max(l.x1, l.x2)).toBeGreaterThanOrEqual(d.result.box.x1 + LD / 1000 - 1e-6)
    }
  })

  it('puts a diagonal bar across each corner, perpendicular to the corner crack', () => {
    const diag = rebar.filter((l) => Math.abs(l.x1 - l.x2) > 1e-9 && Math.abs(l.y1 - l.y2) > 1e-9)
    expect(diag).toHaveLength(4)
    for (const l of diag) {
      // 45° to the panel edges, and the drawn length is the designed one
      expect(Math.abs(Math.abs(l.x2 - l.x1) - Math.abs(l.y2 - l.y1))).toBeLessThan(1e-9)
      expect(Math.hypot(l.x2 - l.x1, l.y2 - l.y1)).toBeCloseTo(d.result.diagonal.length / 1000, 6)
    }
    // Each bar must CROSS its corner's 45° crack, not lie along it: the bar
    // direction and the outward corner diagonal are perpendicular.
    const b = d.result.box
    const cornersOf: [number, number][] = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]]
    for (const l of diag) {
      const mx = (l.x1 + l.x2) / 2, my = (l.y1 + l.y2) / 2
      const c = cornersOf.reduce((best, p) =>
        Math.hypot(p[0] - mx, p[1] - my) < Math.hypot(best[0] - mx, best[1] - my) ? p : best)
      const crack = [mx - c[0], my - c[1]], bar = [l.x2 - l.x1, l.y2 - l.y1]
      expect(Math.abs(crack[0] * bar[0] + crack[1] * bar[1])).toBeLessThan(1e-9)
    }
  })

  it('states the rules a bar schedule cannot carry', () => {
    // Notes are wrapped to the sheet width, so a sentence can span two text
    // primitives — flatten the whitespace before looking for a phrase.
    const all = texts.join(' ').replace(/\s+/g, ' ')
    expect(all).toContain('EQUAL IN NUMBER AND SIZE')
    expect(all).toContain('§408.5.4.2')
    expect(all).toContain('§425.4.2')      // ℓd past each face
    expect(all).toContain('§424.3')        // diagonal crack control
    expect(all).toContain('§422.6.4.3')    // clear of the column
    // the bar marks on the drawing, and the full sentence in the notes
    expect(texts).toContain('3-⌀12 × 1730')
    expect(texts).toContain('3-⌀12 × 1530')
    expect(texts).toContain('⌀12 × 1000 DIAG.')
    expect(all).toContain('3-⌀12 × 1730 IN X AND 3-⌀12 × 1530 IN Y')
    expect(all).toContain('EACH SIDE, EACH FACE')
  })

  it('prints the failing rules on the sheet, not just in the result', () => {
    const bad = buildSlabOpeningDetail(
      { ...panel, opening: { id: 'O2', kind: 'rect', x: 0.2, y: 0.2, w: 1.2, h: 1.2 } },
      { detailNo: '2' },
    )
    const t = bad.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text).join(' ').replace(/\s+/g, ' ')
    expect(bad.result.ok).toBe(false)
    expect(t).toContain('⚠')
    expect(t).toContain('§408.5.4.2(B)')
  })

  it('survives a degenerate panel without throwing', () => {
    const bare = buildSlabOpeningDetail({
      ...panel, lx: 0, ly: 0, opening: { id: 'X', kind: 'rect', x: 0, y: 0, w: 0, h: 0 },
    })
    expect(bare.primitives.length).toBeGreaterThan(0)
    for (const v of Object.values(bare.bounds)) expect(Number.isFinite(v)).toBe(true)
  })
})
