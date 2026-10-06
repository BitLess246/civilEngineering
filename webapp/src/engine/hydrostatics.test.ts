import { describe, expect, it } from 'vitest'
import {
  planeForce, curvedGateForce, floatingStability, manometer,
  accelTilt, accelPressure, rotationRise,
} from './hydrostatics'

describe('hydrostatic force on plane surfaces', () => {
  it('vertical 2×3 m plate, centroid 1.5 m: F = 88.29 kN at yp = 2.0 m', () => {
    // F = 9.81·1.5·6; yp = 1.5 + 4.5/(1.5·6) = 2.0
    const r = planeForce({ shape: { kind: 'rect', b: 2, h: 3 }, hc: 1.5, thetaDeg: 90 })
    expect(r.F).toBeCloseTo(88.29, 2)
    expect(r.ypPlane).toBeCloseTo(2.0, 9)
    expect(r.hpVertical).toBeCloseTo(2.0, 9)
  })
  it('inclined 60° plate reads deeper along the plane, same vertical CP', () => {
    // yc = 1.5/sin60 = 1.7321; yp = 1.7321 + 4.5/(1.7321·6) = 2.16506; hp = 1.875
    const r = planeForce({ shape: { kind: 'rect', b: 2, h: 3 }, hc: 1.5, thetaDeg: 60 })
    expect(r.ycPlane).toBeCloseTo(1.73205, 4)
    expect(r.ypPlane).toBeCloseTo(2.16506, 4)
    expect(r.hpVertical).toBeCloseTo(1.875, 9)
    expect(r.F).toBeCloseTo(88.29, 2) // inclination never changes the magnitude
  })
  it('circular plate d = 2 at hc = 2 m', () => {
    // A = π, I = π/4; F = 9.81·2·π = 61.638; yp = 2 + 0.7854/(2π) = 2.125
    const r = planeForce({ shape: { kind: 'circle', d: 2 }, hc: 2, thetaDeg: 90 })
    expect(r.F).toBeCloseTo(61.638, 2)
    expect(r.ypPlane).toBeCloseTo(2.125, 9)
  })
  it('rejects dry centroids and flat plates', () => {
    expect(() => planeForce({ shape: { kind: 'rect', b: 2, h: 3 }, hc: 0, thetaDeg: 90 })).toThrow()
    expect(() => planeForce({ shape: { kind: 'rect', b: 2, h: 3 }, hc: 1, thetaDeg: 0 })).toThrow()
  })
})

describe('quarter-circular gate', () => {
  it('R = 2, W = 3, hc = 1: Fh = 58.86, Fv = 92.46, R = 109.60 at 57.52°', () => {
    const r = curvedGateForce({ R: 2, W: 3, hc: 1 })
    expect(r.Fh).toBeCloseTo(58.86, 2)
    expect(r.Fv).toBeCloseTo(92.457, 2)
    expect(r.R).toBeCloseTo(109.603, 2)
    expect(r.thetaDeg).toBeCloseTo(57.518, 2)
  })
  it('submerged: water 2 m over the top of an R = 2, W = 3 gate carries the block above the arc too', () => {
    // hc = 2 + 1 = 3: Fh = 9.81·3·6 = 176.58; Fv = 9.81·3·(2·2 + π·4/4) = 9.81·3·7.14159 = 210.177
    const r = curvedGateForce({ R: 2, W: 3, hc: 3 })
    expect(r.Fh).toBeCloseTo(176.58, 2)
    expect(r.Fv).toBeCloseTo(210.177, 2)
    // the old quarter-circle-only Fv (92.46) would hold for hc = 1 alone
    expect(r.Fv).toBeGreaterThan(curvedGateForce({ R: 2, W: 3, hc: 1 }).Fv)
  })
  it('a free surface below the gate top is refused, not silently computed', () => {
    expect(() => curvedGateForce({ R: 2, W: 3, hc: 0.9 })).toThrow(/gate top/)
  })
})

describe('box-barge flotation and stability', () => {
  it('10×4 m barge at 1.5 m draft, KG 1.2: GM = 0.4389 m, stable', () => {
    // V = 60, Fb = 588.6; KB = 0.75; BM = (10·64/12)/60 = 0.8889
    const r = floatingStability({ L: 10, B: 4, draft: 1.5, KG: 1.2 })
    expect(r.V).toBe(60)
    expect(r.Fb).toBeCloseTo(588.6, 9)
    expect(r.BM).toBeCloseTo(0.888889, 5)
    expect(r.GM).toBeCloseTo(0.438889, 5)
    expect(r.stable).toBe(true)
  })
  it('a high KG capsizes the verdict', () => {
    const r = floatingStability({ L: 10, B: 4, draft: 1.5, KG: 2.5 })
    expect(r.stable).toBe(false)
  })
})

describe('manometer walk', () => {
  it('adds down-legs and subtracts up-legs', () => {
    // 50 + 133.1·0.1 − 9.81·0.2 = 61.348 kPa
    expect(manometer(50, [
      { gamma: 133.1, h: 0.1, sign: 1 },
      { gamma: 9.81, h: 0.2, sign: -1 },
    ])).toBeCloseTo(61.348, 9)
  })
})

describe('relative equilibrium', () => {
  it('ax = 3 m/s² tilts the surface to 17.0°', () => {
    const r = accelTilt(3)
    expect(r.tanTheta).toBeCloseTo(3 / 9.81, 9)
    expect(r.thetaDeg).toBeCloseTo(17.004, 2)
  })
  it('upward acceleration pressurizes: 2 m at az = 2 → 23.62 kPa', () => {
    expect(accelPressure(2, 2)).toBeCloseTo(23.62, 9)
  })
  it('forced vortex ω = 3, R = 1 rises 0.4587 m', () => {
    expect(rotationRise(3, 1)).toBeCloseTo(0.458716, 5)
  })
})
