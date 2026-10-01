import { describe, it, expect } from 'vitest'
import { steelProfile, profileArea, profileCentroid, buildSteelSectionDetail } from './steelSection'
import { shapeByName, effectiveSection, shapesOf } from './aiscSections'

describe('steelProfile — one outline per shape', () => {
  it('a W310x79 outline encloses the catalogue area less its root fillets (within 3 %)', () => {
    const s = shapeByName('W310x79')!
    const a = profileArea(steelProfile(effectiveSection(s)))
    // 2·bf·tf + (d − 2tf)·tw by hand
    expect(a).toBeCloseTo(2 * s.bf! * s.tf! + (s.d! - 2 * s.tf!) * s.tw!, 6)
    expect(a).toBeLessThanOrEqual(s.A)
    expect((s.A - a) / s.A).toBeLessThan(0.03)
  })
  it('every W: the outline is exactly the idealised I (data bounds live in aiscSections.test)', () => {
    for (const s of shapesOf('W')) {
      const a = profileArea(steelProfile(effectiveSection(s)))
      expect(a, s.name).toBeCloseTo(2 * s.bf! * s.tf! + (s.d! - 2 * s.tf!) * s.tw!, 6)
    }
  })
  it('a tube carries its hole, a double angle is two outlines', () => {
    const hss = shapesOf('HSS')[0]!
    const p = steelProfile(effectiveSection(hss))
    expect(p[0]!.holes).toHaveLength(1)
    const b = hss.b!, h = hss.h!, t = hss.t!
    expect(profileArea(p)).toBeCloseTo(b * h - (b - 2 * t) * (h - 2 * t), 6)
    const L = shapesOf('L')[0]!
    expect(steelProfile(effectiveSection(L, true, 10))).toHaveLength(2)
  })
})

describe('steelProfile — centroid on the member axis', () => {
  it('every family comes out with its centroid at the origin', () => {
    for (const fam of ['W', 'WT', 'C', 'L', 'HSS', 'PIPE'] as const)
      for (const s of shapesOf(fam).slice(0, 4)) {
        const [cx, cy] = profileCentroid(steelProfile(effectiveSection(s)))
        expect(Math.hypot(cx, cy), s.name).toBeLessThan(1e-6)
      }
  })
  it('an angle puts its heel x̄ from the axis — the catalogue x̄ within the fillet allowance', () => {
    // L102x102x9.5, fillet-free: x̄ = Σ A·x / A = (102·9.53·51 + (102−9.53)·9.53·4.765)/(193.5·9.53)
    //   = 29.16 mm; AISC tabulates 28.7 (the root fillet pulls it toward the heel)
    const L = shapeByName('L102x102x9.5')!
    const heel = Math.min(...steelProfile(effectiveSection(L))[0]!.outer.map((p) => p[0]))
    expect(-heel).toBeCloseTo((102 * 9.53 * 51 + (102 - 9.53) * 9.53 * 4.765) / ((102 + 102 - 9.53) * 9.53), 6)
    expect(Math.abs(-heel - L.xbar!) / L.xbar!).toBeLessThan(0.03)
  })
  it('a tee hangs its stem below the flange: centroid nearer the flange', () => {
    const p = steelProfile(effectiveSection(shapeByName('WT155x26')!))[0]!.outer
    const top = Math.max(...p.map((q) => q[1])), bot = Math.min(...p.map((q) => q[1]))
    expect(top).toBeLessThan(-bot)
  })
})

describe('buildSteelSectionDetail — the S-10 sheet', () => {
  const d = buildSteelSectionDetail('W310x79')!
  const text = d.primitives.flatMap((p) => (p.kind === 'text' ? [p.text] : [])).join(' | ')
  it('draws the cut solid, dimensions d and bf, calls out tf and tw', () => {
    const s = d.shape
    expect(d.primitives.some((p) => p.kind === 'path' && p.fillRule === 'evenodd')).toBe(true)
    const dims = d.primitives.filter((p) => p.kind === 'dim').map((p) => (p as { text: string }).text)
    expect(dims).toEqual(expect.arrayContaining([`${Math.round(s.d!)}`, `${Math.round(s.bf!)}`]))
    expect(text).toMatch(/tf = 14\.6/)
    expect(text).toMatch(/tw = 8\.8/)
  })
  it('prints the properties the design used, and its mass', () => {
    expect(text).toMatch(/A = \d+ mm²/)
    expect(text).toMatch(/Ix = [\d.]+×10⁶ mm⁴/)
    expect(text).toMatch(/MASS = [\d.]+ kg\/m/)
    expect(text).toMatch(/STEEL SECTION — W310x79/)
  })
  it('has nothing to draw for a name the catalogue does not hold', () => {
    expect(buildSteelSectionDetail('W999x1')).toBeNull()
  })
})
