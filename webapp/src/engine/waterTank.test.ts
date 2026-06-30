import { describe, it, expect } from 'vitest'
import { hoopTension, wallCantileverMoment, designCircularTank } from './waterTank'

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

describe('designCircularTank', () => {
  const base = { H: 4, D: 10, t: 250, fc: 28, cover: 40, barDia: 16 }

  it('hoop steel As = T/σst at the permissible stress', () => {
    const r = designCircularTank(base)
    expect(r.T).toBeCloseTo(196.2, 1)
    expect(r.hoopAs).toBeCloseTo((196.2 * 1000) / 130, 0)     // ~1509 mm²/m
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
