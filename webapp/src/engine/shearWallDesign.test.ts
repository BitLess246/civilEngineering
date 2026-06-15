import { describe, it, expect } from 'vitest'
import { designShearWall } from './shearWallDesign'

const BASE = {
  lw: 4, hw: 3, thickness: 200, fc: 28, fy: 415, Vu: 600, barDia: 12,
}

describe('designShearWall — in-plane shear', () => {
  it('produces a usable design', () => {
    const r = designShearWall(BASE)
    expect(r.Acv).toBeCloseTo(4000 * 200, 6)
    expect(r.aspect).toBeCloseTo(0.75, 6)
    expect(r.phiVn).toBeGreaterThan(0)
    expect(r.horiz.spacing).toBeGreaterThan(0)
    expect(r.vert.spacing).toBeGreaterThan(0)
  })

  it('squat wall (hw/lw ≤ 1.5) uses αc = 0.25', () => {
    const r = designShearWall({ ...BASE, lw: 4, hw: 3 })  // 0.75 ≤ 1.5
    expect(r.alphaC).toBeCloseTo(0.25, 6)
  })

  it('slender wall (hw/lw ≥ 2) uses αc = 0.17', () => {
    const r = designShearWall({ ...BASE, lw: 3, hw: 9 })  // 3.0 ≥ 2
    expect(r.alphaC).toBeCloseTo(0.17, 6)
  })

  it('αc interpolates linearly between 1.5 and 2.0', () => {
    const r = designShearWall({ ...BASE, lw: 4, hw: 7 })  // 1.75
    expect(r.alphaC).toBeCloseTo(0.21, 6)
  })

  it('adopted ratios never fall below the 0.0025 minimum', () => {
    const r = designShearWall({ ...BASE, Vu: 1 })          // tiny demand
    expect(r.horiz.rho).toBeGreaterThanOrEqual(0.0025)
    expect(r.vert.rho).toBeGreaterThanOrEqual(0.0025)
    expect(r.horiz.usedMin).toBe(true)
  })

  it('higher shear demands more horizontal steel (smaller spacing)', () => {
    const lo = designShearWall({ ...BASE, Vu: 800 })
    const hi = designShearWall({ ...BASE, Vu: 1600 })
    expect(hi.horiz.rho).toBeGreaterThan(lo.horiz.rho)
    expect(hi.horiz.spacing).toBeLessThanOrEqual(lo.horiz.spacing)
  })

  it('φVn ≥ Vu when the design passes', () => {
    const r = designShearWall(BASE)
    if (r.shearOK) expect(r.phiVn).toBeGreaterThanOrEqual(BASE.Vu - 1e-6)
  })

  it('excess shear is flagged by the web-crushing cap', () => {
    const r = designShearWall({ ...BASE, Vu: 50000 })
    expect(r.capOK).toBe(false)
    expect(r.shearOK).toBe(false)
    expect(r.notes.some((n) => n.includes('cap'))).toBe(true)
  })

  it('thick walls (t ≥ 250) require two curtains', () => {
    const r = designShearWall({ ...BASE, thickness: 300, Vu: 10 })
    expect(r.twoCurtains).toBe(true)
  })

  it('low shear, thin wall permits a single curtain', () => {
    const r = designShearWall({ ...BASE, thickness: 150, Vu: 10 })
    expect(r.twoCurtains).toBe(false)
  })

  it('spacing never exceeds min(lw/5, 3t, 450)', () => {
    const r = designShearWall(BASE)
    const sMax = Math.min(4000 / 5, 3 * 200, 450)
    expect(r.sMax).toBeCloseTo(sMax, 6)
    expect(r.horiz.spacing).toBeLessThanOrEqual(sMax + 1e-6)
    expect(r.vert.spacing).toBeLessThanOrEqual(sMax + 1e-6)
  })

  it('squat wall ties vertical ratio to the horizontal ratio', () => {
    const r = designShearWall({ ...BASE, lw: 4, hw: 3, Vu: 1500 })  // aspect 0.75 ≤ 2
    expect(r.vert.rho).toBeGreaterThanOrEqual(r.horiz.rho - 1e-9)
  })

  it('high axial + moment triggers boundary elements', () => {
    const r = designShearWall({ ...BASE, Pu: 8000, Mu: 6000 })
    expect(r.boundaryElement).toBe(true)
    expect(r.notes.some((n) => n.includes('boundary'))).toBe(true)
  })

  it('no axial/moment → no boundary element', () => {
    const r = designShearWall(BASE)
    expect(r.boundaryElement).toBe(false)
  })
})
