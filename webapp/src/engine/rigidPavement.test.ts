import { describe, it, expect } from 'vitest'
import { logW18Rigid, requiredD, zrFromReliability, J_OPTIONS } from './rigidPavement'

// Hand check at D = 10 in: ZR(90 %) = −1.28155, S0 = 0.35, ΔPSI = 2.0,
// pt = 2.5, sc' = 650 psi, Cd = 1, J = 3.2, E = 4e6 psi, k = 200 pci.
//   ZR·S0 = −0.44854
//   7.35·log10(11) − 0.06 = 7.59424
//   log10(2/3)/(1 + 1.624e7/11^8.46) = −0.17609/1.025124 = −0.17179
//   stress = 650·(5.623413 − 1.132)/(215.63·3.2·(5.623413 − 18.42/11.89205))
//          = 2919.42/2811.40 = 1.03842 → 3.42·log10 = +0.05597
//   logW18(10) = 7.02989  →  W18 = 10.71e6
const CASE = { ZR: -1.28155, S0: 0.35, dPSI: 2.0, pt: 2.5, scPsi: 650, Cd: 1, J: 3.2, Epsi: 4e6, kPci: 200 }

describe('the rigid design equation', () => {
  it('matches the hand evaluation at 10 inches', () => {
    expect(logW18Rigid(10, CASE)).toBeCloseTo(7.0299, 2)
  })

  it('is strictly increasing in the slab thickness', () => {
    const f = (D: number) => logW18Rigid(D, CASE)
    expect(f(8)).toBeLessThan(f(10))
    expect(f(10)).toBeLessThan(f(12))
    expect(f(14)).toBeLessThan(f(16))
  })

  it('recovers 10 inches from the hand W18 by bisection', () => {
    const r = requiredD({
      W18: 10 ** 7.0299, reliability: 90, S0: 0.35, pi: 4.5, pt: 2.5,
      sc_MPa: 650 / 145.038, Cd: 1, J: 3.2, E_MPa: 27580, k_MNpm3: 54.2894,
    })
    expect(r.D_in).toBeCloseTo(10.0, 1)
    expect(r.ZR).toBeCloseTo(-1.28155, 3)
    expect(r.kPci).toBeCloseTo(200, 0)
    expect(r.logW18).toBeCloseTo(7.0299, 2)
  })

  it('a softer subgrade needs more slab', () => {
    const base = {
      W18: 5e6, reliability: 90, S0: 0.35, sc_MPa: 4.48, E_MPa: 27580,
    }
    expect(requiredD({ ...base, k_MNpm3: 13.6 }).D)
      .toBeGreaterThan(requiredD({ ...base, k_MNpm3: 54.3 }).D)
  })

  it('thicker demand comes from larger W18', () => {
    const base = { reliability: 90, S0: 0.35, sc_MPa: 4.48, E_MPa: 27580, k_MNpm3: 54.3 }
    const a = requiredD({ W18: 1e6, ...base })
    const b = requiredD({ W18: 1e7, ...base })
    expect(b.D).toBeGreaterThan(a.D)
  })

  it('a better shoulder (smaller J) needs less slab', () => {
    const base = { W18: 5e6, reliability: 90, sc_MPa: 4.48, E_MPa: 27580, k_MNpm3: 54.3 }
    expect(requiredD({ ...base, J: 2.8 }).D).toBeLessThan(requiredD({ ...base, J: 3.2 }).D)
  })

  it('validates its inputs', () => {
    const base = { sc_MPa: 4.5, E_MPa: 27580, k_MNpm3: 54.3 }
    expect(() => requiredD({ W18: 0, ...base })).toThrow()
    expect(() => requiredD({ W18: 1e5, ...base, pi: 2.0, pt: 2.5 })).toThrow()
    expect(() => requiredD({ W18: 1e5, ...base, reliability: 105 })).toThrow()
    expect(() => requiredD({ W18: 1e5, sc_MPa: 4.5, E_MPa: 27580, k_MNpm3: 0 })).toThrow()
  })

  it('exposes the standard shoulder ladder', () => {
    expect(J_OPTIONS[0].j).toBe(3.2)
    expect(J_OPTIONS.at(-1)!.j).toBe(2.8)
  })
})

describe('the reliability quantile', () => {
  it('reproduces the printed ZR ladder', () => {
    expect(zrFromReliability(50)).toBeCloseTo(0, 3)
    expect(zrFromReliability(90)).toBeCloseTo(-1.282, 2)
    expect(zrFromReliability(95)).toBeCloseTo(-1.645, 2)
    expect(zrFromReliability(99)).toBeCloseTo(-2.327, 2)
  })
  it('keeps the sign below 50 % reliability (R = 30 → +0.524)', () => {
    expect(zrFromReliability(30)).toBeCloseTo(0.524, 2)
  })
})
