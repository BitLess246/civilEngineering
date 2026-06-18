import { describe, it, expect } from 'vitest'
import { AISC_SHAPES, shapesOf, shapeByName, effectiveSection, doubleAngle } from './aiscSections'

describe('AISC section library', () => {
  it('every shape has area + radii and a unique name', () => {
    const names = new Set<string>()
    for (const s of AISC_SHAPES) {
      expect(s.A).toBeGreaterThan(0)
      expect(s.rx).toBeGreaterThan(0)
      expect(s.ry).toBeGreaterThan(0)
      expect(names.has(s.name)).toBe(false)
      names.add(s.name)
    }
    expect(shapesOf('L').length).toBeGreaterThan(0)
    expect(shapesOf('HSS').every((s) => s.family === 'HSS')).toBe(true)
  })

  it('single section r_min governs (angle uses rz; tube uses min rx/ry)', () => {
    const ang = effectiveSection(shapeByName('L102x102x9.5')!, false)
    expect(ang.A).toBe(1850)
    expect(ang.rmin).toBeCloseTo(20.1, 3)            // rz of the single angle
    const hss = effectiveSection(shapeByName('HSS152x102x6.4')!)
    expect(hss.rmin).toBeCloseTo(38.0, 3)            // min(rx 53, ry 38)
  })

  it('double angle doubles the area and increases ry across the gap', () => {
    const L = shapeByName('L102x102x9.5')!
    const d = doubleAngle(L, 10)
    expect(d.double).toBe(true)
    expect(d.A).toBeCloseTo(2 * L.A, 6)
    expect(d.rx).toBeCloseTo(L.rx, 6)                // unchanged about the geometric x
    expect(d.ry).toBeGreaterThan(L.ry)              // parallel-axis shift across the gap
    expect(d.rmin).toBeCloseTo(Math.min(d.rx, d.ry), 6)
    // wider gap → larger ry
    expect(doubleAngle(L, 20).ry).toBeGreaterThan(d.ry)
  })

  it('effectiveSection only doubles angle families', () => {
    const w = effectiveSection(shapeByName('W250x33')!, true)   // double flag ignored for W
    expect(w.double).toBe(false)
    expect(w.A).toBe(4190)
  })
})
