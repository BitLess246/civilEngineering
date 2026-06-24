import { describe, it, expect } from 'vitest'
import { nscp208Spectrum, cqcCorrel, computeResponseSpectrum } from './responseSpectrum'
import { modalAnalysis, GRAVITY } from './modal'
import { generateGridModel } from './modelBuilder'
import type { RectSection } from './model'

const Ca = 0.44, Cv = 0.64, I = 1.0, R = 8.5
const Ts = Cv / (2.5 * Ca)   // ≈ 0.582 s

const section: RectSection = {
  id: 'S1', name: '400×400', b: 400, h: 400, fc: 28, fy: 415,
  barDia: 20, tieDia: 10, cover: 40, material: 'concrete',
}

// ── Design spectrum ──────────────────────────────────────────────────────────
describe('nscp208Spectrum', () => {
  it('plateau governs at T = 0 (velocity → ∞, capped)', () => {
    expect(nscp208Spectrum(0, Ca, Cv, I, R)).toBeCloseTo((2.5 * Ca * I / R) * GRAVITY, 9)
  })

  it('plateau governs at T = Ts (velocity branch meets plateau)', () => {
    // Cv·I/(R·Ts) = Cv·I·2.5·Ca/(R·Cv) = 2.5·Ca·I/R = plateau
    expect(nscp208Spectrum(Ts, Ca, Cv, I, R)).toBeCloseTo((2.5 * Ca * I / R) * GRAVITY, 6)
  })

  it('velocity branch: Sa = Cv·I·g/(R·T) for Ts < T < T_min', () => {
    const T = 1.0   // > Ts ≈ 0.582
    expect(nscp208Spectrum(T, Ca, Cv, I, R)).toBeCloseTo(Cv * I * GRAVITY / (R * T), 9)
  })

  it('minimum floor governs at long periods', () => {
    // R cancels: velocity = Cv*I/(R*T), minimum = 0.11*Ca*I/R
    // equal when T = Cv/(0.11*Ca) = 0.64/(0.11*0.44) ≈ 13.2 s; use T = 20 s
    expect(nscp208Spectrum(20, Ca, Cv, I, R)).toBeCloseTo(0.11 * Ca * I * GRAVITY / R, 9)
  })

  it('Sa is monotonically non-increasing (or flat)', () => {
    const vals = [0.01, 0.1, 0.5, Ts, 1.0, 2.0, 5.0].map((T) => nscp208Spectrum(T, Ca, Cv, I, R))
    for (let k = 1; k < vals.length; k++) expect(vals[k]).toBeLessThanOrEqual(vals[k - 1] + 1e-9)
  })
})

// ── CQC correlation ──────────────────────────────────────────────────────────
describe('cqcCorrel', () => {
  it('diagonal is 1 (identical frequencies)', () => {
    expect(cqcCorrel(5.0, 5.0, 0.05)).toBeCloseTo(1, 9)
  })

  it('approaches 0 for well-separated modes', () => {
    expect(cqcCorrel(1, 100, 0.05)).toBeLessThan(0.01)
  })

  it('is symmetric: ρ(i,j) = ρ(j,i)', () => {
    expect(cqcCorrel(3, 7, 0.05)).toBeCloseTo(cqcCorrel(7, 3, 0.05), 12)
  })

  it('lies in [0, 1] for a range of frequency ratios', () => {
    for (const beta of [0.1, 0.5, 0.8, 0.95, 0.99]) {
      const r = cqcCorrel(beta, 1, 0.05)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(1 + 1e-9)
    }
  })
})

// ── Full RSA ─────────────────────────────────────────────────────────────────
describe('computeResponseSpectrum', () => {
  const model = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.5, 3], section })
  const modal = modalAnalysis(model, 12)!
  const p = { Ca, Cv, I, R }

  it('CQC ≥ SRSS (positive cross-correlations add to SRSS)', () => {
    const rsa = computeResponseSpectrum(modal, p)
    for (let dir = 0; dir < 3; dir++)
      expect(rsa.cqc[dir]).toBeGreaterThanOrEqual(rsa.srss[dir] - 1e-6)
  })

  it('all base shears are non-negative', () => {
    const rsa = computeResponseSpectrum(modal, p)
    for (const mf of rsa.modalForces)
      for (const v of mf.baseShear) expect(v).toBeGreaterThanOrEqual(-1e-9)
    for (const v of rsa.srss) expect(v).toBeGreaterThanOrEqual(0)
    for (const v of rsa.cqc)  expect(v).toBeGreaterThanOrEqual(0)
  })

  it('Ts = Cv/(2.5·Ca)', () => {
    const rsa = computeResponseSpectrum(modal, p)
    expect(rsa.params.Ts).toBeCloseTo(Cv / (2.5 * Ca), 9)
  })

  it('SRSS equals √(Σ V_i²) computed independently', () => {
    const rsa = computeResponseSpectrum(modal, p)
    const manual = Math.sqrt(rsa.modalForces.reduce((s, mf) => s + mf.baseShear[0] ** 2, 0))
    expect(rsa.srss[0]).toBeCloseTo(manual, 6)
  })

  it('single mode: CQC = SRSS = Sa·effMass', () => {
    const modal1 = { modes: [modal.modes[0]], totalMass: modal.totalMass, cumRatio: modal.cumRatio }
    const rsa = computeResponseSpectrum(modal1, p)
    expect(rsa.cqc[0]).toBeCloseTo(rsa.srss[0], 9)
    const expected = modal.modes[0].effMass[0] * nscp208Spectrum(modal.modes[0].period, Ca, Cv, I, R)
    expect(rsa.srss[0]).toBeCloseTo(expected, 6)
  })

  it('cqcRatio populated only when staticV is non-zero', () => {
    const staticV: [number, number, number] = [500, 0, 500]
    const rsa = computeResponseSpectrum(modal, { ...p, staticV })
    expect(rsa.cqcRatio[0]).not.toBeNull()
    expect(rsa.cqcRatio[1]).toBeNull()   // staticV[1] = 0
    expect(rsa.cqcRatio[2]).not.toBeNull()
    expect(rsa.cqcRatio[0]).toBeCloseTo(rsa.cqc[0] / 500, 9)
  })

  it('empty modes → zero base shears', () => {
    const emptyModal = { modes: [], totalMass: [0, 0, 0] as [number,number,number], cumRatio: [0,0,0] as [number,number,number] }
    const rsa = computeResponseSpectrum(emptyModal, p)
    expect(rsa.srss).toEqual([0, 0, 0])
    expect(rsa.cqc).toEqual([0, 0, 0])
  })
})
