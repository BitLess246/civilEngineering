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

  it('no strip when the section falls past the edge; null for impossible geometry', () => {
    const g = footingShearIso({ ...DEFAULT_FOOTING_SHEAR, L: 1.2, B: 1.2, c: 600, d: 350, h: 450 })!
    expect(g.strip).toBeNull()
    expect(g.arm).toBe(0)
    expect(g.arrows).toHaveLength(0)
    expect(footingShearIso({ ...DEFAULT_FOOTING_SHEAR, d: 600, h: 500 })).toBeNull()
  })
})
