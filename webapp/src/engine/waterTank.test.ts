import { describe, it, expect } from 'vitest'
import { hoopTension, wallCantileverMoment, designCircularTank, cylinderWallFixedBase } from './waterTank'

describe('hoopTension', () => {
  it('T(z) = γw·z·D/2, max at the base', () => {
    expect(hoopTension(4, 10)).toBeCloseTo((9.81 * 4 * 10) / 2, 6)      // 196.2 kN/m
    expect(hoopTension(4, 10, 2)).toBeCloseTo((9.81 * 2 * 10) / 2, 6)   // 98.1 at mid-height
  })
  it('scales with diameter and head', () => {
    expect(hoopTension(4, 12)).toBeGreaterThan(hoopTension(4, 10))
    expect(hoopTension(6, 10)).toBeGreaterThan(hoopTension(4, 10))
  })
})

describe('wallCantileverMoment', () => {
  it('M = γw·H³/6 (triangular hydrostatic on a vertical cantilever)', () => {
    expect(wallCantileverMoment(4)).toBeCloseTo((9.81 * 4 ** 3) / 6, 6)   // 104.64 kN·m/m
  })
  it('grows with the cube of the depth', () => {
    expect(wallCantileverMoment(6) / wallCantileverMoment(3)).toBeCloseTo(8, 6)
  })
})

describe('cylinderWallFixedBase — the wall as a shell, not a cantilever', () => {
  // PCA, Circular Concrete Tanks without Prestressing, Table A-7 (triangular
  // load, fixed base, free top): base moment coefficient on γw·H³ against H²/Dt.
  const pcaA7: [number, number][] = [[0.4, 0.1205], [0.8, 0.0795], [1.2, 0.0602], [6, 0.0187], [16, 0.0079]]
  for (const [shape, coef] of pcaA7) {
    it(`H²/Dt = ${shape}: M0 = ${coef}·γw·H³ (PCA Table A-7)`, () => {
      const H = 4, t = 250, D = (H * H) / (shape * 0.25)
      const w = cylinderWallFixedBase(H, D, t)
      expect(w.shape).toBeCloseTo(shape, 9)
      expect(w.M0).toBeLessThan(0)                                    // tension on the water face
      expect(Math.abs(-w.coefM0 / coef - 1)).toBeLessThan(0.025)
    })
  }

  it('a tall wall meets the long-cylinder closed form: M0 = (1 − 1/βH)·γw·a·H·t/√(12(1−ν²))', () => {
    const H = 4, D = 10, t = 250, w = cylinderWallFixedBase(H, D, t)
    const closed = (1 - 1 / (w.beta * H)) * 9.81 * 5 * H * 0.25 / Math.sqrt(12 * (1 - 0.04))
    expect(w.beta * H).toBeGreaterThan(4)                             // the top no longer reaches the base
    expect(Math.abs(w.M0) / closed).toBeCloseTo(1, 3)
  })

  it('radial equilibrium closes: base shear + ∫N/a dx = γw·H²/2', () => {
    const H = 4, D = 10, a = 5, w = cylinderWallFixedBase(H, D, 250)
    let ring = 0
    const n = 2000
    for (let i = 0; i < n; i++) ring += (w.at((H * (i + 0.5)) / n).N / a) * (H / n)
    expect(w.Q0 + ring).toBeCloseTo((9.81 * H * H) / 2, 4)
  })

  it('the free top carries no moment or shear', () => {
    const w = cylinderWallFixedBase(4, 10, 250)
    expect(w.at(4).M).toBeCloseTo(0, 9)
    expect(w.at(4).Q).toBeCloseTo(0, 9)
  })

  it('a short, stiff wall tends to the cantilever from below; a slender one to ring action', () => {
    const coef = (shape: number) => -cylinderWallFixedBase(4, 64 / (shape * 0.25), 250).coefM0
    expect(coef(0.05)).toBeLessThan(1 / 6)
    expect(coef(0.05)).toBeGreaterThan(0.15)
    expect(coef(0.4)).toBeGreaterThan(coef(6))
    expect(coef(6)).toBeGreaterThan(coef(16))
    // and the ring then carries most of the head: hoop peak well below the base's free-ring γw·H·D/2
    const w = cylinderWallFixedBase(4, 10, 250)
    expect(w.Tmax / hoopTension(4, 10)).toBeGreaterThan(0.45)
    expect(w.Tmax / hoopTension(4, 10)).toBeLessThan(0.6)
    expect(w.xT).toBeGreaterThan(1)                                   // and it peaks up the wall, not at the fixed base
  })
})

describe('designCircularTank', () => {
  const base = { H: 4, D: 10, t: 250, fc: 28, cover: 40, barDia: 16 }

  it('hoop steel As = T/σst at the permissible stress', () => {
    const r = designCircularTank(base)
    expect(r.T).toBeCloseTo(196.2, 1)
    expect(r.hoopAs).toBeCloseTo((196.2 * 1000) / 130, 0)     // ~1509 mm²/m
  })

  it('the base moment is the shell\'s, about a ninth of a free cantilever on 4 m × ⌀10 m × 250', () => {
    const r = designCircularTank(base)
    expect(r.Mcantilever).toBeCloseTo(104.64, 2)
    expect(r.M).toBeCloseTo(11.35, 1)
    expect(r.M).toBeCloseTo(Math.abs(r.shell.M0), 9)
    // which no longer asks ⌀16 for more than it can give: it was 4 578 mm²/m, "@ 50" (4 021 provided)
    expect(r.vertAs).toBeLessThan(600)
    expect(r.steelFits).toBe(true)
  })

  it('flags steel a bar size cannot supply at the 50 mm floor', () => {
    const r = designCircularTank({ ...base, H: 9, D: 40, barDia: 10 })
    expect(r.hoopSpacing).toBe(50)
    expect((1000 * Math.PI * 25) / 50).toBeLessThan(r.hoopAs)
    expect(r.steelFits).toBe(false)
  })

  it('vertical steel As = M/(σst·j·d)', () => {
    const r = designCircularTank(base)
    const d = 250 - 40 - 8
    expect(r.vertAs).toBeCloseTo((r.M * 1e6) / (130 * 0.87 * d), 0)
  })

  it('concrete tensile stress check vs σct (thicker wall ⇒ lower fct)', () => {
    const thin = designCircularTank({ ...base, t: 200 })
    const thick = designCircularTank({ ...base, t: 400 })
    expect(thick.fct).toBeLessThan(thin.fct)
    expect(thick.thicknessOK).toBe(thick.fct <= 1.3)
  })

  it('a custom permissible steel stress changes the steel area', () => {
    const a = designCircularTank({ ...base, sigmaSt: 130 })
    const b = designCircularTank({ ...base, sigmaSt: 150 })
    expect(b.hoopAs).toBeLessThan(a.hoopAs)                   // higher allowable ⇒ less steel
  })

  it('spacing is capped at min(3t, 300) for liquid-tightness', () => {
    const r = designCircularTank(base)
    expect(r.hoopSpacing).toBeLessThanOrEqual(Math.min(3 * 250, 300))
    expect(r.hoopSpacing).toBeGreaterThan(0)
  })

  it('flags inadequate freeboard (< 300 mm)', () => {
    expect(designCircularTank({ ...base, freeboard: 0.15 }).freeboardOK).toBe(false)
    expect(designCircularTank({ ...base, freeboard: 0.30 }).freeboardOK).toBe(true)
  })
})
