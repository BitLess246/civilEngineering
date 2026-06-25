import { describe, it, expect } from 'vitest'
import { elasticResponseSpectrum, nscp208DesignCurve } from './accelSpectrum'
import { nscp208Spectrum } from './responseSpectrum'
import { GRAVITY } from './modal'

/** Sampled harmonic ground acceleration a_g(t) = A·sin(2πf t), m/s². */
function harmonic(A: number, f: number, dur: number, dt: number): number[] {
  const n = Math.round(dur / dt) + 1
  return Array.from({ length: n }, (_, i) => A * Math.sin(2 * Math.PI * f * i * dt))
}

describe('elasticResponseSpectrum — pseudo-spectral relationships', () => {
  const ag = harmonic(1, 2, 20, 0.005)   // 1 m/s², 2 Hz (T = 0.5 s), 20 s
  const spec = elasticResponseSpectrum(ag, 0.005)!

  it('returns a spectrum anchored at T = 0 with S_a(0) = PGA', () => {
    expect(spec.points[0].T).toBe(0)
    expect(spec.points[0].PSA).toBeCloseTo(spec.pga, 9)
    expect(spec.pga).toBeCloseTo(1, 2)
  })

  it('PSV = ω·Sd and PSA = ω²·Sd hold exactly at every finite period', () => {
    for (const p of spec.points) {
      if (p.T === 0) continue
      const w = (2 * Math.PI) / p.T
      expect(p.PSV).toBeCloseTo(w * p.Sd, 9)
      expect(p.PSA).toBeCloseTo(w * w * p.Sd, 9)
      expect(p.PSAg).toBeCloseTo(p.PSA / GRAVITY, 9)
      expect(p.PSA).toBeGreaterThanOrEqual(0)
    }
  })

  it('points are sorted ascending in period', () => {
    for (let i = 1; i < spec.points.length; i++)
      expect(spec.points[i].T).toBeGreaterThan(spec.points[i - 1].T)
  })
})

describe('elasticResponseSpectrum — resonance amplification', () => {
  it('a 2 Hz harmonic peaks near T = 0.5 s, amplified well above PGA', () => {
    const ag = harmonic(1, 2, 25, 0.005)
    const spec = elasticResponseSpectrum(ag, 0.005, { zeta: 0.05, Tmin: 0.1, Tmax: 2, nT: 80 })!
    // resonance near the input period; ζ = 5 % gives ~1/(2ζ) = 10× amplification
    expect(spec.peakPSAT).toBeGreaterThan(0.4)
    expect(spec.peakPSAT).toBeLessThan(0.6)
    expect(spec.peakPSA).toBeGreaterThan(3 * spec.pga)   // strongly amplified
    expect(spec.peakPSA).toBeLessThan(15 * spec.pga)     // sanity bound
  })

  it('higher damping reduces the resonant peak', () => {
    const ag = harmonic(1, 2, 25, 0.005)
    const lo = elasticResponseSpectrum(ag, 0.005, { zeta: 0.02, Tmin: 0.1, Tmax: 2, nT: 80 })!
    const hi = elasticResponseSpectrum(ag, 0.005, { zeta: 0.10, Tmin: 0.1, Tmax: 2, nT: 80 })!
    expect(hi.peakPSA).toBeLessThan(lo.peakPSA)
  })
})

describe('elasticResponseSpectrum — guards', () => {
  it('empty record or non-positive dt → null', () => {
    expect(elasticResponseSpectrum([], 0.01)).toBeNull()
    expect(elasticResponseSpectrum([0, 1, 0], 0)).toBeNull()
  })

  it('zero ground motion → flat zero spectrum (PGA = 0)', () => {
    const spec = elasticResponseSpectrum(new Array(500).fill(0), 0.01)!
    expect(spec.pga).toBe(0)
    expect(spec.peakPSA).toBe(0)
    expect(spec.points.every((p) => p.PSA === 0 && p.Sd === 0)).toBe(true)
  })
})

describe('nscp208DesignCurve — overlay sampling', () => {
  it('matches nscp208Spectrum at each period and exposes Sa/g', () => {
    const Ts = [0, 0.2, 0.5, 1, 2]
    const curve = nscp208DesignCurve(Ts, 0.44, 0.64, 1, 8.5)
    curve.forEach((pt, i) => {
      expect(pt.T).toBe(Ts[i])
      expect(pt.Sa).toBeCloseTo(nscp208Spectrum(Ts[i], 0.44, 0.64, 1, 8.5), 9)
      expect(pt.SaG).toBeCloseTo(pt.Sa / GRAVITY, 9)
    })
    // plateau (short T) ≥ velocity branch (long T)
    expect(curve[1].Sa).toBeGreaterThanOrEqual(curve[4].Sa)
  })
})
