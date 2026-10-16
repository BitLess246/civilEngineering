import { describe, it, expect } from 'vitest'
import { DEFAULT_FOOTING_SHEAR, footingShearExample } from './codes/footingShear'
import { footingShearIso } from './footingShearIso'

describe('one-way shear in 3-D — the plane and the strip are the provision\'s', () => {
  it('aᵥ is footingShearExample\'s arm, and B·d its shear width × depth', () => {
    for (const i of [DEFAULT_FOOTING_SHEAR, { ...DEFAULT_FOOTING_SHEAR, L: 3.2, B: 2.6, c: 500, d: 520, h: 620 }, { ...DEFAULT_FOOTING_SHEAR, L: 1.8, c: 300, d: 300, h: 400 }]) {
      const g = footingShearIso(i)!, r = footingShearExample(i)!
      expect(g.arm).toBeCloseTo(r.arm * 1000, 9)
      expect(g.Bd).toBeCloseTo(i.B * 1000 * i.d, 9)
      // Vu = qu·B·aᵥ off the drawn strip
      expect(i.qu * i.B * (g.arm / 1000)).toBeCloseTo(r.Vu, 9)
    }
  })

  it('hand calc: 2.4 m pad, 400 column, d 409 → section 609 from the centre, aᵥ = 591', () => {
    const g = footingShearIso(DEFAULT_FOOTING_SHEAR)!
    expect(DEFAULT_FOOTING_SHEAR).toMatchObject({ L: 2.4, c: 400, d: 409 })
    expect(g.section[0][0]).toBeCloseTo(609, 9)
    expect(g.arm).toBeCloseTo(591, 9)
    // the Vc area is the top d of the section, down to the bottom mat
    const zs = g.shearArea.map((p) => p[2])
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(409, 9)
  })

  it('the strip is the part beyond the section, pulled clear, its pressure pushing up', () => {
    const g = footingShearIso(DEFAULT_FOOTING_SHEAR)!
    const s = g.strip!
    expect(s.hi[0] - s.lo[0]).toBeCloseTo(g.arm, 9)
    expect(s.lo[0]).toBeGreaterThan(g.pad.hi[0])
    for (const a of g.arrows) {
      expect(a.to[2]).toBe(0)
      expect(a.from[2]).toBeLessThan(0)
      expect(a.to[0]).toBeGreaterThan(s.lo[0]); expect(a.to[0]).toBeLessThan(s.hi[0])
    }
  })

  it('the bars set d: B·d runs from the top to the bottom mat, the cover under it is apart', () => {
    const i = DEFAULT_FOOTING_SHEAR, g = footingShearIso(i)!
    expect(g.zs).toBe(i.h - i.d)
    const z = (q: readonly (readonly number[])[]) => q.map((p) => p[2])
    expect([Math.min(...z(g.shearArea)), Math.max(...z(g.shearArea))]).toEqual([i.h - i.d, i.h])
    expect([Math.min(...z(g.cover)), Math.max(...z(g.cover))]).toEqual([0, i.h - i.d])
    // every main bar crosses the section ON the B·d face's lower edge, inside the side cover
    expect(g.cuts.length).toBe(11)                      // 2.4 m wide, 200 apart, 75 cover: −1000 … 1000
    for (const c of g.cuts) {
      expect(c[0]).toBe(g.section[0][0]); expect(c[2]).toBe(g.zs)
      expect(Math.abs(c[1])).toBeLessThanOrEqual(1200 - 75)
    }
    // and inside the strip each piece starts at ITS cut face — no bar spans the gap
    const s = g.strip!
    expect(g.stripBars).toHaveLength(g.cuts.length)
    for (const b of g.stripBars) {
      expect(b.a[0]).toBe(s.lo[0]); expect(b.b[0]).toBe(s.hi[0] - 75)
      expect(b.a[2]).toBe(g.zs)
    }
    for (const b of [...g.stripBars, ...g.crossBars]) for (const q of [b.a, b.b]) {
      const inPad = q[0] >= g.pad.lo[0] && q[0] <= g.pad.hi[0], inStrip = q[0] >= s.lo[0] && q[0] <= s.hi[0]
      expect(inPad || inStrip).toBe(true)
      expect(q[0] > g.pad.hi[0] && q[0] < s.lo[0]).toBe(false)
    }
    // cross bars sit on the main bars, along B, inside the strip
    expect(g.crossBars.length).toBeGreaterThan(0)
    for (const b of g.crossBars) { expect(b.a[2]).toBe(g.zs + g.db); expect(b.a[0]).toBe(b.b[0]) }
    expect(g.schematic).toBe(true)
  })

  it('B·aᵥ is the strip\'s UNDERSIDE — the face the soil bears on — and every arrow pushes up on it', () => {
    const i = DEFAULT_FOOTING_SHEAR, g = footingShearIso(i)!, s = g.strip!
    const b = g.bearing!
    for (const q of b) expect(q[2]).toBe(0)                     // the bottom face, not the top (z = h)
    const area = (b[1][0] - b[0][0]) * (b[2][1] - b[1][1])
    expect(area).toBeCloseTo(i.B * 1000 * g.arm, 6)              // B × aᵥ
    expect(i.qu * area / 1e6).toBeCloseTo(footingShearExample(i)!.Vu, 9)
    expect(g.arrows).toHaveLength(9)                             // round(591 / 288) + 1 = 3 across aᵥ × 3 across B
    for (const a of g.arrows) {
      expect(a.to[2]).toBe(0); expect(a.from[2]).toBeLessThan(0)
      expect(a.to[0]).toBeGreaterThan(s.lo[0]); expect(a.to[0]).toBeLessThan(s.hi[0])
      expect(Math.abs(a.to[1])).toBeLessThan(i.B * 500)
    }
    // far rows first, so the near ones paint over them
    const ys = g.arrows.map((a) => a.to[1])
    for (let k = 1; k < ys.length; k++) expect(ys[k]).toBeLessThanOrEqual(ys[k - 1])
  })

  it('draws the design\'s own mat when given one: ⌀ and spacing', () => {
    const g = footingShearIso(DEFAULT_FOOTING_SHEAR, { db: 20, spacing: 150 })!
    expect(g.schematic).toBe(false)
    expect(g.db).toBe(20)
    // 2.4 m, 150 apart, 75 cover: −1050 … 1050 → 15 bars
    expect(g.cuts.map((c) => c[1])).toEqual(Array.from({ length: 15 }, (_, k) => -1050 + 150 * k))
  })

  it('no strip when the section falls past the edge; null for impossible geometry', () => {
    const g = footingShearIso({ ...DEFAULT_FOOTING_SHEAR, L: 1.2, B: 1.2, c: 600, d: 350, h: 450 })!
    expect(g.strip).toBeNull()
    expect(g.arm).toBe(0)
    expect(g.arrows).toHaveLength(0)
    expect(g.bearing).toBeNull()
    expect(g.stripBars).toHaveLength(0)
    expect(g.crossBars).toHaveLength(0)
    expect(footingShearIso({ ...DEFAULT_FOOTING_SHEAR, d: 600, h: 500 })).toBeNull()
  })
})
