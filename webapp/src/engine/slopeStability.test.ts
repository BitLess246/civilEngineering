import { describe, it, expect } from 'vitest'
import {
  surfaceY, sliceCircle, felleniusFS, bishopFS, janbuFS, janbuF0, analyzeCircle,
  searchCriticalCircle, type Slice, type SlopeSoil, type Pt,
} from './slopeStability'

const rad = (d: number) => (d * Math.PI) / 180

describe('slopeStability — surfaceY interpolation', () => {
  const poly: Pt[] = [{ x: 0, y: 10 }, { x: 10, y: 10 }, { x: 20, y: 0 }, { x: 40, y: 0 }]
  it('clamps beyond the ends and interpolates within', () => {
    expect(surfaceY(poly, -5)).toBe(10)
    expect(surfaceY(poly, 100)).toBe(0)
    expect(surfaceY(poly, 15)).toBeCloseTo(5, 9)      // midway down the 45° slope
    expect(surfaceY(poly, 5)).toBe(10)
  })
})

// ── Fellenius against an independent hand calc ──────────────────────────────
// c = 10 kPa, φ = 20° (tanφ = 0.363970), three slices b = 2 m:
//   i │ α      W    l = b/cosα
//   1 │ −10°  100   2.030851
//   2 │  15°  150   2.070552
//   3 │  35°  120   2.441441
// driving  Σ W·sinα = −17.3648 + 38.82285 + 68.82912 = 90.28717
// resist   Σ c·l = 65.42844 ; Σ W·cosα·tanφ = 341.66794·0.363970 = 124.3610
//   FS = (65.42844 + 124.3610) / 90.28717 = 2.1020
describe('slopeStability — Fellenius vs hand calc', () => {
  const soil: SlopeSoil = { c: 10, phiDeg: 20, gamma: 18 }
  const mk = (alphaDeg: number, W: number): Slice => {
    const alpha = rad(alphaDeg), b = 2
    return { x: 0, b, h: 1, alpha, W, u: 0, l: b / Math.cos(alpha) }
  }
  const sl = [mk(-10, 100), mk(15, 150), mk(35, 120)]

  it('reproduces the hand-computed FS = 2.102', () => {
    expect(felleniusFS(sl, soil).FS).toBeCloseTo(2.102, 2)
  })

  it('Bishop ≥ Fellenius and converges', () => {
    const f = felleniusFS(sl, soil), b = bishopFS(sl, soil)
    expect(b.converged).toBe(true)
    expect(b.FS).toBeGreaterThanOrEqual(f.FS - 1e-6)   // Bishop is the less conservative
  })

  it('pore pressure lowers the factor of safety', () => {
    const wet = sl.map((s) => ({ ...s, u: 20 }))       // 20 kPa on every base
    expect(felleniusFS(wet, soil).FS).toBeLessThan(felleniusFS(sl, soil).FS)
  })
})

describe('slopeStability — Janbu', () => {
  const soil: SlopeSoil = { c: 15, phiDeg: 22, gamma: 18 }
  const sl = [-8, 12, 30].map((a, i): Slice => {
    const alpha = rad(a), b = 2
    return { x: i * 2, b, h: 3, alpha, W: 110 + i * 20, u: 0, l: b / Math.cos(alpha) }
  })
  it('c-φ correction factor f0 > 1', () => {
    expect(janbuF0(sl, soil)).toBeGreaterThan(1)
  })
  it('returns a finite, converged FS', () => {
    const j = janbuFS(sl, soil)
    expect(j.converged).toBe(true)
    expect(Number.isFinite(j.FS)).toBe(true)
    expect(j.FS).toBeGreaterThan(0)
  })
})

// ── slice geometry from a circle ────────────────────────────────────────────
describe('slopeStability — sliceCircle geometry', () => {
  const flat: Pt[] = [{ x: -50, y: 0 }, { x: 50, y: 0 }]   // level ground
  it('cuts a symmetric chord with positive heights and summed widths', () => {
    // circle centred above the ground, dipping 4 m below it
    const sl = sliceCircle(flat, { xc: 0, yc: 6, R: 10 }, 20, undefined, 18)!
    expect(sl).toBeTruthy()
    const totalB = sl.reduce((s, x) => s + x.b, 0)
    // chord half-width = √(R² − yc²) = √(100−36) = 8 → full chord 16
    expect(totalB).toBeCloseTo(16, 1)
    expect(sl.every((s) => s.h > 0)).toBe(true)
    // symmetric α about the centre: first slice tilts back, last tilts forward
    expect(sl[0].alpha).toBeLessThan(0)
    expect(sl[sl.length - 1].alpha).toBeGreaterThan(0)
    expect(sl[0].alpha).toBeCloseTo(-sl[sl.length - 1].alpha, 6)
  })
  it('returns null when the circle floats above the ground (no mass)', () => {
    expect(sliceCircle(flat, { xc: 0, yc: 20, R: 5 }, 10, undefined, 18)).toBeNull()
  })
})

// ── critical-circle search on a real slope ──────────────────────────────────
describe('slopeStability — critical circle search', () => {
  // 2:1-ish slope: 10 m high, dropping over 12 m, plateaus each side
  const slope = (drop: number): Pt[] => [
    { x: 0, y: drop }, { x: 10, y: drop }, { x: 22, y: 0 }, { x: 45, y: 0 },
  ]
  const soil: SlopeSoil = { c: 20, phiDeg: 25, gamma: 18 }
  const coarse = { xc: { min: 8, max: 24, step: 2 }, yc: { min: 10, max: 22, step: 2 }, R: { min: 8, max: 30, step: 2 } }

  it('finds a critical circle with a physically sane FS', () => {
    const r = searchCriticalCircle(slope(10), soil, { n: 20, ...coarse })!
    expect(r).toBeTruthy()
    expect(r.evaluated).toBeGreaterThan(0)
    expect(r.FS).toBeGreaterThan(0.3)
    expect(r.FS).toBeLessThan(5)
    expect(r.critical.bishop.FS).toBeCloseTo(r.FS, 9)
  })

  it('a steeper (taller) slope gives a lower FS', () => {
    const gentle = searchCriticalCircle(slope(6), soil, { n: 20, ...coarse })!
    const steep = searchCriticalCircle(slope(14), soil, {
      n: 20, xc: { min: 8, max: 24, step: 2 }, yc: { min: 14, max: 28, step: 2 }, R: { min: 8, max: 34, step: 2 },
    })!
    expect(steep.FS).toBeLessThan(gentle.FS)
  })

  it('analyzeCircle exposes all three methods on one circle', () => {
    const c = analyzeCircle(slope(10), soil, { xc: 14, yc: 16, R: 20 }, { n: 25 })
    if (c) {
      expect(c.bishop.FS).toBeGreaterThanOrEqual(c.fellenius.FS - 1e-6)
      expect(Number.isFinite(c.janbu.FS)).toBe(true)
    }
  })
})
