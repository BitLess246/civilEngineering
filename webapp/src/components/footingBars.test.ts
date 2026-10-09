import { describe, it, expect } from 'vitest'
import {
  barCentres, bandBarCentres, sampleForDraw, matSectionLevels, matEdgeInset,
} from './footingBars'
import foundationSrc from '../pages/FoundationDesign.tsx?raw'
import schematicSrc from './FootingSchematic.tsx?raw'

// Real pads, not invented ones: the page defaults (2 m square, ⌀20, 75 cover)
// and a 3.2 × 2.0 rectangular footing, which is where the §13.3.3.3 band
// actually means something.
const SQ = { B: 2, cover: 75, db: 20 }

describe('barCentres', () => {
  it('design path: the outermost centres sit at cover + db/2 from each face', () => {
    // matLayout tiles the run exactly: run = 2000 − 2·75 − 20 = 1830, n = 16.
    const n = 16
    const spacing = 1830 / (n - 1)
    const c = barCentres(SQ.B, SQ.cover, { bars: n, db: SQ.db, spacing })
    expect(c).toHaveLength(n)
    const e = matEdgeInset(SQ.cover, SQ.db) / 1000
    expect(c[0]).toBeCloseTo(e, 12)
    expect(c[c.length - 1]).toBeCloseTo(SQ.B - e, 12)
    // and the gaps are the quoted spacing
    expect(c[1] - c[0]).toBeCloseTo(spacing / 1000, 12)
  })

  it('optimizer path: a spacing module keeps the group inside the cover line', () => {
    // barsAt: n = ⌊1850/150⌋ + 1 = 13; the group is symmetric and its ends
    // clear the cover rule the tiling path would put them on.
    const c = barCentres(SQ.B, SQ.cover, { bars: 13, db: SQ.db, spacing: 150 })
    expect(c).toHaveLength(13)
    const e = matEdgeInset(SQ.cover, SQ.db) / 1000
    expect(c[0]).toBeGreaterThanOrEqual(e - 1e-12)
    expect(c[12]).toBeLessThanOrEqual(SQ.B - e + 1e-12)
    expect(c[1] - c[0]).toBeCloseTo(0.15, 12)
  })

  it('never fewer than two bars, whatever the schedule says', () => {
    expect(barCentres(1, 75, { bars: 0, db: 20, spacing: 100 })).toHaveLength(2)
  })
})

describe('bandBarCentres', () => {
  // 3.2 × 2.0 pad: β = 1.6, γs = 2/(β+1) ≈ 0.769 → 12 of 15 bars in the band.
  const RECT = { B: 3.2, cover: 75, db: 20 }
  const spec = {
    bars: 15, db: RECT.db, spacing: 216,
    bandBars: 12, bandWidth: 2000, bandCentre: 1.6,
  }
  const e = matEdgeInset(RECT.cover, RECT.db) / 1000

  it('splits the schedule: 12 in the band, the rest over the overhangs', () => {
    const r = bandBarCentres(RECT.B, RECT.cover, spec)
    expect(r.band).toHaveLength(12)
    expect(r.left).toHaveLength(2)
    expect(r.right).toHaveLength(1)
    // every group inside its own region
    expect(r.band[0]).toBeGreaterThanOrEqual(0.6)
    expect(r.band[11]).toBeLessThanOrEqual(2.6)
    expect(r.left.every((x) => x >= e && x <= 0.6)).toBe(true)
    expect(r.right.every((x) => x >= 2.6 && x <= RECT.B - e)).toBe(true)
  })

  it('no two bars of different groups land on the same spot', () => {
    const r = bandBarCentres(RECT.B, RECT.cover, spec)
    const all = [...r.left, ...r.band, ...r.right].sort((a, b) => a - b)
    for (let i = 1; i < all.length; i++) {
      expect(all[i] - all[i - 1]).toBeGreaterThanOrEqual(0.004)
    }
  })

  it('all centres stay inside the cover line', () => {
    const r = bandBarCentres(RECT.B, RECT.cover, spec)
    for (const x of [...r.left, ...r.band, ...r.right]) {
      expect(x).toBeGreaterThanOrEqual(e - 1e-12)
      expect(x).toBeLessThanOrEqual(RECT.B - e + 1e-12)
    }
  })

  it('an edge column clamps the band and folds the lost overhang inward', () => {
    // Column flush right: the band centre rides with it, the right overhang
    // vanishes, and its bar joins the left one. The count is still 15.
    const edge = { ...spec, bandCentre: 3.0 }
    const r = bandBarCentres(RECT.B, RECT.cover, edge)
    expect(r.band.length + r.left.length + r.right.length).toBe(15)
    expect(r.right).toHaveLength(0)
    for (const x of [...r.band, ...r.left]) {
      expect(x).toBeLessThanOrEqual(RECT.B - e + 1e-12)
    }
  })

  it('a pad the width of its own band draws the whole mat as the band', () => {
    const degenerate = { ...spec, bars: 10, bandBars: 8, bandWidth: 3200, bandCentre: 1.6 }
    const r = bandBarCentres(RECT.B, RECT.cover, degenerate)
    expect(r.band).toHaveLength(10)
    expect(r.left).toHaveLength(0)
    expect(r.right).toHaveLength(0)
  })
})

describe('sampleForDraw', () => {
  // minGap is in the SAME unit as the centres — the caller divides the px
  // floor by its own metres-per-px scale (≈4 px at the page's ~147 px/m).
  const MIN_GAP = 0.027
  const dense = Array.from({ length: 40 }, (_, i) => i * 0.02) // 20 mm apart

  it('keeps the two edge bars of a dense mat and strides the middle', () => {
    const s = sampleForDraw(dense, MIN_GAP)
    expect(s[0]).toBe(dense[0])
    expect(s[s.length - 1]).toBe(dense[dense.length - 1])
    expect(s.length).toBeLessThan(dense.length)
  })

  it('honours the minimum gap it is given', () => {
    const s = sampleForDraw(dense, MIN_GAP)
    for (let i = 1; i < s.length; i++) {
      expect(s[i] - s[i - 1]).toBeGreaterThanOrEqual(MIN_GAP - 1e-12)
    }
  })

  it('leaves a sparse mat alone', () => {
    const sparse = [0, 0.3, 0.6, 0.9, 1.2]
    expect(sampleForDraw(sparse, MIN_GAP)).toEqual(sparse)
  })
})

describe('matSectionLevels', () => {
  it('cross bars rest one diameter on top of the in-plane layer', () => {
    const { longY, shortY } = matSectionLevels(20, 75)
    expect(longY).toBe(85)
    expect(shortY).toBe(105)
    expect(shortY - longY).toBe(20)
  })
})

describe('the sheet and the drawing quote the same mat', () => {
  // Source guards, in the style `tours.test.ts` uses — the wiring is the
  // whole contract: the page owns the schedule numbers, the schematic owns
  // the pixels, and the handover is the one place they can diverge.
  it('the page hands over the quoted mat and the real column aspect', () => {
    expect(foundationSrc)
      .toMatch(/bars=\{\{ db: dbEff, cover: form\.cover, long: view\.long, short: view\.short \}\}/)
    expect(foundationSrc).toMatch(/columnWidthY=\{rectCol \? colWidthY : undefined\}/)
  })

  it('the schematic draws steel in the sheet palette, not its own colour', () => {
    expect(schematicSrc).toMatch(/import \{ STEEL, SHEET_NOTE \} from '\.\.\/engine\/sheetInk'/)
  })
})
