import { describe, it, expect } from 'vitest'
import { designLintel, lintelLoads, lintelSpan, archTriangleHeight, type LintelInput } from './lintel'

const base: LintelInput = {
  opening: 2.0, bearing: 200,
  b: 200, h: 300, cover: 40, barDia: 12, stirrupDia: 10,
  fc: 21, fy: 415,
  wallThickness: 150, wallHeightAbove: 2.4, wallUnitWeight: 21,
}

describe('lintelSpan — ACI 318-14 §6.3.2.1', () => {
  it('is the clear span plus the depth', () => {
    expect(lintelSpan(2.0, 300, 400)).toBeCloseTo(2.3, 12)
  })

  it('…but never more than the distance between support centres', () => {
    // A short bearing puts the support centres closer than ln + h.
    expect(lintelSpan(2.0, 300, 100)).toBeCloseTo(2.2, 12)
  })
})

describe('archTriangleHeight', () => {
  it('an equilateral triangle stands 0.866 of the span tall', () => {
    expect(archTriangleHeight(2.0, 60)).toBeCloseTo(Math.sqrt(3), 9)
    expect(archTriangleHeight(2.0, 60) / 2.0).toBeCloseTo(0.866, 3)
  })

  it('a shallower arch is a lower triangle, and so a lighter lintel', () => {
    expect(archTriangleHeight(2.0, 45)).toBeCloseTo(1, 9)
    expect(archTriangleHeight(2.0, 45)).toBeLessThan(archTriangleHeight(2.0, 60))
  })
})

describe('lintelLoads — what the wall actually delivers', () => {
  it('a tall wall arches, and only the triangle bears on the lintel', () => {
    const span = lintelSpan(base.opening, base.h, base.bearing)
    const l = lintelLoads(base, span)
    expect(l.arching).toBe(true)
    // ½ · base · height · thickness · γ
    const hTri = archTriangleHeight(span, 60)
    expect(l.masonry).toBeCloseTo(0.5 * span * hTri * 0.15 * 21, 9)
  })

  it('a wall too short for the arch delivers the WHOLE rectangle', () => {
    // The case that catches people out: a lintel just under a slab soffit.
    const span = lintelSpan(base.opening, base.h, base.bearing)
    const l = lintelLoads({ ...base, wallHeightAbove: 0.4 }, span)
    expect(l.arching).toBe(false)
    expect(l.triangleHeight).toBe(0)
    expect(l.masonry).toBeCloseTo(span * 0.4 * 0.15 * 21, 9)
  })

  it('the short wall is the heavier case here, which is the whole point', () => {
    const span = lintelSpan(base.opening, base.h, base.bearing)
    const tall = lintelLoads(base, span)
    const short = lintelLoads({ ...base, wallHeightAbove: 1.5 }, span)
    expect(short.arching).toBe(false)
    expect(short.masonry).toBeGreaterThan(tall.masonry)
  })

  it('carries the lintel’s own weight whatever the wall does', () => {
    const l = lintelLoads(base, 2.3)
    expect(l.selfWeight).toBeCloseTo(0.2 * 0.3 * 24, 9)
  })

  it('a load above the apex is arched round — reported, not silently dropped', () => {
    const span = lintelSpan(base.opening, base.h, base.bearing)
    const l = lintelLoads({ ...base, udlAbove: 8 }, span)
    expect(l.arching).toBe(true)
    expect(l.udlDead).toBe(0)
    expect(l.udlArched).toBe(8)
    // …and with no arch to carry it, the same load is on the lintel
    const flat = lintelLoads({ ...base, wallHeightAbove: 0.4, udlAbove: 8 }, span)
    expect(flat.udlDead).toBe(8)
    expect(flat.udlArched).toBe(0)
  })
})

describe('designLintel', () => {
  const r = designLintel(base)

  it('treats the triangle as a TRIANGULAR load — Wℓ/6, not Wℓ/8', () => {
    // Smeared to a uniform load of the same total it would read 33% low.
    const Wu = 1.2 * r.loads.masonry
    const wu = 1.2 * r.loads.selfWeight
    expect(r.Mu).toBeCloseTo((Wu * r.span) / 6 + (wu * r.span ** 2) / 8, 9)
    const smeared = ((Wu / r.span + wu) * r.span ** 2) / 8
    expect(r.Mu / smeared).toBeGreaterThan(1.2)
  })

  it('half the triangle goes to each end', () => {
    const Wu = 1.2 * r.loads.masonry
    const wu = 1.2 * r.loads.selfWeight
    expect(r.Vu).toBeCloseTo(Wu / 2 + (wu * r.span) / 2, 9)
  })

  it('a rectangle of wall is a UDL, and is designed as one', () => {
    const flat = designLintel({ ...base, wallHeightAbove: 0.4 })
    const Wu = 1.2 * flat.loads.masonry
    const wu = 1.2 * flat.loads.selfWeight
    expect(flat.Mu).toBeCloseTo(((Wu / flat.span + wu) * flat.span ** 2) / 8, 9)
    expect(flat.notes.some((n) => /whole rectangle/.test(n))).toBe(true)
  })

  it('designs the section and reports steel', () => {
    expect(r.design.As).toBeGreaterThan(0)
    expect(r.design.bars).toBeGreaterThanOrEqual(2)
    expect(r.ok).toBe(true)
  })

  it('checks bearing on the jamb — §22.8.3.2 φ(0.85 f′c)', () => {
    expect(r.bearingLimit).toBeCloseTo(0.65 * 0.85 * 21, 9)
    expect(r.bearingStress).toBeCloseTo(r.Vu / (0.2 * 0.2 * 1000), 9)
    expect(r.bearingOK).toBe(true)
  })

  it('fails a bearing too short to carry the reaction, and says what to do', () => {
    // A 10 mm nib under a 2 m opening still passes — 8.4 MPa against an 11.6
    // limit — so the case has to be one that genuinely overloads it.
    const nib = designLintel({ ...base, opening: 6, bearing: 10, wallHeightAbove: 6 })
    expect(nib.bearingOK).toBe(false)
    expect(nib.ok).toBe(false)
    expect(nib.notes.some((n) => /lengthen the bearing/.test(n))).toBe(true)
  })

  it('a shallower arch assumption is a heavier lintel', () => {
    const flat = designLintel({ ...base, archAngleDeg: 45 })
    expect(flat.loads.masonry).toBeLessThan(r.loads.masonry)
    expect(flat.Mu).toBeLessThan(r.Mu)
    // …and a steeper one heavier still
    const steep = designLintel({ ...base, archAngleDeg: 70, wallHeightAbove: 6 })
    expect(steep.Mu).toBeGreaterThan(r.Mu)
  })

  it('past the minimum, more moment is more steel — under it, the minimum governs', () => {
    // A 200 × 300 lintel over a 2 m opening is nowhere near its own minimum
    // steel, so widening it a little changes the moment and not the bars. That
    // is the honest answer, and the reason this asserts the minimum first
    // rather than reading equal steel as a broken engine.
    expect(r.design.usedMin).toBe(true)
    const wide = designLintel({ ...base, opening: 3.2, wallHeightAbove: 4 })
    expect(wide.Mu).toBeGreaterThan(r.Mu)
    expect(wide.design.As).toBe(r.design.As)

    const heavy = designLintel({ ...base, opening: 4.5, wallHeightAbove: 5 })
    expect(heavy.design.usedMin).toBe(false)
    expect(heavy.Mu).toBeGreaterThan(wide.Mu)
    expect(heavy.design.As).toBeGreaterThan(r.design.As)
  })
})
