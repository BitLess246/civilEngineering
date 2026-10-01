import { describe, it, expect } from 'vitest'
import {
  SAWN_STOCK, GLULAM_WIDTHS, GLULAM_LAM, GLULAM_ID, TIMBER_DEFAULT_SIZES, TIMBER_FLOOR_SDL,
  isStockSawn, nextTimberSize, lighterTimberSize, toStockSize, toGlulam, withinStockLength, SAWN_MAX_LENGTH,
} from './timberStock'
import { WOOD_SPECIES } from './woodDesign'
import type { RectSection } from './model'

const wood = (b: number, h: number, extra: Partial<RectSection> = {}): RectSection => ({
  id: 'W', name: `${b}×${h}`, b, h, fc: 28, fy: 415, barDia: 16, tieDia: 10, cover: 40,
  material: 'wood', woodSpecies: 'PH-APITONG-80', woodKind: 'sawn', ...extra,
})
const S = (b: number, d: number) => (b * d * d) / 6

describe('timber stock — the catalogue', () => {
  it('lists 2×3 … 12×12 as nominal mm, b ≤ d, on the 25 mm module', () => {
    expect(SAWN_STOCK).toHaveLength(25)
    for (const [b, d] of SAWN_STOCK) { expect(b).toBeLessThanOrEqual(d); expect(b % 25).toBe(0); expect(d % 25).toBe(0) }
    expect(isStockSawn(100, 300)).toBe(true)
    expect(isStockSawn(300, 100)).toBe(true)      // either way round
    expect(isStockSawn(300, 400)).toBe(false)
  })

  it('the defaults are stocked sizes, and the timber floor SDL is the light one', () => {
    for (const [b, d] of Object.values(TIMBER_DEFAULT_SIZES)) expect(isStockSawn(b, d)).toBe(true)
    // 0.19 finish + 0.10 ceiling + 0.20 services + 0.50 partitions ≈ 1.0 kPa, against RC's 4.8
    expect(TIMBER_FLOOR_SDL).toBeCloseTo(0.19 + 0.10 + 0.20 + 0.50, 1)
  })

  it('the glulam grade exists in the wood library', () => {
    expect(WOOD_SPECIES[GLULAM_ID]?.kind).toBe('glulam')
  })
})

describe('timber stock — growing', () => {
  it('a 4×10 beam at util 1.3 needs S ≥ 1.3 × 1.042e6 = 1.354e6 mm³: 4×12 (1.5e6), the cheapest that carries it', () => {
    const r = nextTimberSize(wood(100, 250), 1.3, 'beam')
    expect([r.b, r.h]).toEqual([100, 300])
    expect(S(100, 300)).toBeGreaterThanOrEqual(1.3 * S(100, 250))
    // 6×10 also carries it (S 1.56e6) but costs 37 500 mm² against 30 000
    expect(S(150, 250)).toBeGreaterThan(1.3 * S(100, 250))
  })

  it('a 4×12 at util 2 skips 6×12 (S 2.25e6 < 3.0e6) for 8×12', () => {
    const r = nextTimberSize(wood(100, 300), 2, 'girder')
    expect([r.b, r.h]).toEqual([200, 300])
  })

  it('a 6×6 post at util 1.5 needs A ≥ 33 750 and I_min ≥ 63.3e6: 6×10 (37 500, 70.3e6)', () => {
    const r = nextTimberSize(wood(150, 150), 1.5, 'column')
    expect([r.b, r.h]).toEqual([150, 250])
    expect(r.h / r.b).toBeLessThanOrEqual(2)      // posts stay squarish
  })

  it('past the top of stock a beam becomes 24F glulam on a standard width, in whole 38 mm lams', () => {
    const r = nextTimberSize(wood(300, 300), 1.5, 'girder')
    expect(r.woodKind).toBe('glulam')
    expect(r.woodSpecies).toBe(GLULAM_ID)
    expect(r.woodRef).toEqual(WOOD_SPECIES[GLULAM_ID]!.ref)
    expect(GLULAM_WIDTHS).toContain(r.b)
    expect(r.h % GLULAM_LAM).toBe(0)
    expect(S(r.b, r.h)).toBeGreaterThanOrEqual(1.5 * S(300, 300))
  })

  it('a glulam beam grows in lams, stepping to a wider glulam past d = 7b', () => {
    const g = nextTimberSize(wood(300, 300), 1.5, 'girder')
    const g2 = nextTimberSize(g, 1.4, 'girder')
    expect(g2.h % GLULAM_LAM).toBe(0)
    expect(S(g2.b, g2.h)).toBeGreaterThanOrEqual(1.4 * S(g.b, g.h))
    const deep = nextTimberSize({ ...g, b: 80, h: 532 }, 1.3, 'beam')
    expect(deep.h / deep.b).toBeLessThanOrEqual(7)
  })

  it('a post past stock becomes a squarish glulam that carries the area and the buckling axis', () => {
    const r = nextTimberSize(wood(300, 300), 1.2, 'column')
    expect(r.woodKind).toBe('glulam')
    expect(r.b * r.h).toBeGreaterThanOrEqual(1.2 * 300 * 300)
    expect(Math.min(r.b, r.h) ** 3 * Math.max(r.b, r.h) / 12).toBeGreaterThanOrEqual(1.2 * 300 ** 4 / 12)
    expect(r.h / r.b).toBeLessThanOrEqual(2.1)
  })

  it('at util ≤ 1 nothing grows', () => {
    const s = wood(100, 250)
    expect(nextTimberSize(s, 1, 'beam')).toBe(s)
  })
})

describe('timber stock — trimming and snapping', () => {
  it('trims a 4×12 beam to 4×10 — the largest stocked size below it, never wider or deeper', () => {
    const r = lighterTimberSize(wood(100, 300), 'beam')!
    expect([r.b, r.h]).toEqual([100, 250])
  })

  it('trims glulam one lam at a time, and stops at four lams', () => {
    const g = { ...wood(130, 380), woodKind: 'glulam' as const }
    expect(lighterTimberSize(g, 'beam')!.h).toBe(380 - 38)
    expect(lighterTimberSize({ ...g, h: 152 }, 'beam')).toBeNull()
  })

  it('has nothing below the smallest stock', () => {
    expect(lighterTimberSize(wood(50, 75), 'beam')).toBeNull()
  })

  it('snaps a typed-in 300×400 girder to stock that carries it, or to glulam past stock', () => {
    const r = toStockSize(wood(300, 400), 'girder')
    expect(r.woodKind).toBe('glulam')                       // nothing stocked carries a 300×400 in bending
    expect(S(r.b, r.h)).toBeGreaterThanOrEqual(S(300, 400))
    const t = toStockSize(wood(120, 240), 'beam')            // 120×240 → 4×12 (S 1.5e6 ≥ 1.15e6 at the least area)
    expect([t.b, t.h]).toEqual([100, 300])
    expect(S(t.b, t.h)).toBeGreaterThanOrEqual(S(120, 240))
    const ok = wood(100, 250)
    expect(toStockSize(ok, 'beam')).toBe(ok)                // stocked already
    const rc: RectSection = { ...ok, material: undefined }
    expect(toStockSize(rc, 'beam')).toBe(rc)                // not timber
  })
})

describe('timber stock — length', () => {
  it('a sawn piece comes up to 6.1 m (20 ft); glulam to any length', () => {
    expect(SAWN_MAX_LENGTH).toBeCloseTo(6.1, 9)
    expect(withinStockLength('sawn', 6.0)).toBe(true)
    expect(withinStockLength('sawn', 6.1)).toBe(true)
    expect(withinStockLength('sawn', 7.0)).toBe(false)
    expect(withinStockLength('glulam', 12)).toBe(true)
  })
  it('toGlulam keeps at least the member’s bending capacity, on a standard width in whole lams', () => {
    const g = toGlulam(wood(100, 300), 'girder')
    expect(g.woodKind).toBe('glulam')
    expect(GLULAM_WIDTHS).toContain(g.b)
    expect(g.h % GLULAM_LAM).toBe(0)
    expect(S(g.b, g.h)).toBeGreaterThanOrEqual(S(100, 300))
    const already = { ...wood(130, 380), woodKind: 'glulam' as const }
    expect(toGlulam(already, 'beam')).toBe(already)
  })
})
