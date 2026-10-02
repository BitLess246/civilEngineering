import { describe, expect, it } from 'vitest'
import { waterNu, hwSlope, hazenWilliams, darcyWeisbach, colebrook, G } from './pipeFlow'

const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol)

describe('water viscosity', () => {
  it('table points come back exactly', () => {
    near(waterNu(0), 1.787e-6)
    near(waterNu(20), 1.004e-6)
    near(waterNu(40), 0.658e-6)
  })
  it('interpolates between points', () => {
    near(waterNu(10), 1.307e-6)
    expect(waterNu(25)).toBeLessThan(waterNu(20))
  })
})

describe('Hazen–Williams', () => {
  it('hwSlope round-trips the velocity law', () => {
    const V = 1.414711, C = 120, R = 0.075
    const S = hwSlope(V, C, R)
    near(V, 0.8492 * C * Math.pow(R, 0.63) * Math.pow(S, 0.54), 1e-10)
  })
  it('Q = 0.1 m³/s in a 300 mm main, C = 120, per 100 m', () => {
    const r = hazenWilliams({ L: 100, D: 0.3, C: 120, Q: 0.1, minorK: 0 })
    // V = Q/A = 1.4147 m/s
    near(r.V, 1.41471, 1e-4)
    // the two classic HW forms agree to a fraction of a percent
    const qForm = 10.67 * 100 * Math.pow(0.1, 1.852) / (Math.pow(120, 1.852) * Math.pow(0.3, 4.8704))
    near(r.hf, qForm, qForm * 0.01)
  })
  it('minor losses add ΣK·V²/2g', () => {
    const r = hazenWilliams({ L: 100, D: 0.3, C: 120, Q: 0.1, minorK: 2 })
    near(r.hm, 2 * r.V * r.V / (2 * G), 1e-12)
    near(r.hTotal, r.hf + r.hm, 1e-12)
  })
  it('larger C → less loss (smoother pipe)', () => {
    const a = hazenWilliams({ L: 1000, D: 0.3, C: 100, Q: 0.1, minorK: 0 })
    const b = hazenWilliams({ L: 1000, D: 0.3, C: 140, Q: 0.1, minorK: 0 })
    expect(b.hf).toBeLessThan(a.hf)
  })
  it('velocity input works without Q', () => {
    const r = hazenWilliams({ L: 100, D: 0.3, C: 120, V: 1.41471, minorK: 0 })
    expect(r.hf).toBeGreaterThan(0)
  })
  it('refuses nonsense inputs', () => {
    expect(() => hazenWilliams({ L: 100, D: 0.3, C: 200, Q: 0.1, minorK: 0 })).toThrow(/C is calibrated/)
    expect(() => hazenWilliams({ L: 100, D: 0.3, C: 120, minorK: 0 })).toThrow(/either Q or V/)
  })
})

describe('Darcy–Weisbach', () => {
  it('laminar: Re = 1000 → f = 0.064 and hf follows', () => {
    const r = darcyWeisbach({ L: 100, D: 0.05, eps: 0, nu: 1e-6, V: 0.02, minorK: 0 })
    expect(r.regime).toBe('laminar')
    near(r.f, 64 / 1000)
    near(r.hf, 0.064 * (100 / 0.05) * 0.02 * 0.02 / (2 * G), 1e-12)
  })
  it('turbulent steel pipe: Colebrook residual is zero', () => {
    const r = darcyWeisbach({ L: 100, D: 0.3, eps: 0.000045, nu: 1.004e-6, V: 1.5, minorK: 0 })
    expect(r.regime).toBe('turbulent')
    const Re = 1.5 * 0.3 / 1.004e-6
    near(r.Re, Re, 1)
    // Colebrook equation satisfied exactly
    const residual = 1 / Math.sqrt(r.f) + 2 * Math.log10(0.000045 / (3.7 * 0.3) + 2.51 / (Re * Math.sqrt(r.f)))
    near(residual, 0, 1e-9)
    // and it sits near the Swamee–Jain explicit value
    const sj = 0.25 / Math.pow(Math.log10(0.000045 / (3.7 * 0.3) + 5.74 / Math.pow(Re, 0.9)), 2)
    near(r.f, sj, sj * 0.04)
  })
  it('smooth pipe limit: f drops but stays finite', () => {
    const r = darcyWeisbach({ L: 100, D: 0.3, eps: 0, nu: 1.004e-6, V: 1.5, minorK: 0 })
    expect(r.f).toBeGreaterThan(0.008)
    expect(r.f).toBeLessThan(0.02)
  })
  it('rougher pipe → bigger f at the same Re', () => {
    const a = darcyWeisbach({ L: 100, D: 0.3, eps: 0.000045, nu: 1.004e-6, V: 1.5, minorK: 0 })
    const b = darcyWeisbach({ L: 100, D: 0.3, eps: 0.001, nu: 1.004e-6, V: 1.5, minorK: 0 })
    expect(b.f).toBeGreaterThan(a.f)
  })
  it('flags the transition band', () => {
    const r = darcyWeisbach({ L: 100, D: 0.05, eps: 0.00001, nu: 1e-6, V: 0.06, minorK: 0 })
    expect(r.Re).toBeGreaterThan(2300)
    expect(r.Re).toBeLessThan(4000)
    expect(r.regime).toBe('transition')
    expect(r.warnings.some((w) => w.includes('transition'))).toBe(true)
  })
})

describe('colebrook()', () => {
  it('fully-rough asymptote: 1/√f → −2log₁₀(ε/3.7D) as Re → ∞', () => {
    const epsOverD = 0.01
    const f = colebrook(epsOverD, 1e10)
    const rough = Math.pow(-2 * Math.log10(epsOverD / 3.7), -2)
    near(f, rough, rough * 1e-6)
  })
})
