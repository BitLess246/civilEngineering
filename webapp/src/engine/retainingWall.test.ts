import { describe, it, expect } from 'vitest'
import { designRetainingWall } from './retainingWall'

// Reference: 3 m stem, 500 mm base, 300 mm stem, 500 toe, 1500 heel
// Soil γ=18 kN/m³, φ=30°, q_sur=0, μ=0.5, qa=200 kPa
// Concrete fc=28, fy=415, cover=75, db=16
const BASE = {
  Hs: 3000, tb: 500, ts: 300, bt: 500, bh: 1500,
  gamma_s: 18, phi_deg: 30, q_sur: 0, mu: 0.5, qa: 200,
  fc: 28, fy: 415, cover: 75, barDia: 16,
}

describe('designRetainingWall — geometry', () => {
  const r = designRetainingWall(BASE)

  it('B = (bt + ts + bh) / 1000 in metres', () => {
    expect(r.B).toBeCloseTo((500 + 300 + 1500) / 1000, 9)  // 2.3 m
  })

  it('H = (Hs + tb) / 1000 in metres', () => {
    expect(r.H).toBeCloseTo((3000 + 500) / 1000, 9)  // 3.5 m
  })

  it('Ka = tan²(45 − φ/2) for φ=30° → 1/3', () => {
    expect(r.Ka).toBeCloseTo(1 / 3, 9)
  })
})

describe('designRetainingWall — earth pressure', () => {
  const r = designRetainingWall(BASE)

  it('Pa = ½·Ka·γs·H²', () => {
    const expected = 0.5 * (1 / 3) * 18 * 3.5 ** 2
    expect(r.Pa).toBeCloseTo(expected, 6)  // ≈ 36.75 kN/m
  })

  it('Pq = 0 when surcharge = 0', () => {
    expect(r.Pq).toBeCloseTo(0, 9)
  })

  it('Pq = Ka·q·H when surcharge > 0', () => {
    const r2 = designRetainingWall({ ...BASE, q_sur: 10 })
    expect(r2.Pq).toBeCloseTo((1 / 3) * 10 * 3.5, 6)
  })

  it('Fh = Pa + Pq', () => {
    expect(r.Fh).toBeCloseTo(r.Pa + r.Pq, 9)
  })

  it('MO = Pa·H/3 + Pq·H/2', () => {
    const expected = r.Pa * (3.5 / 3) + r.Pq * (3.5 / 2)
    expect(r.MO).toBeCloseTo(expected, 6)
  })
})

describe('designRetainingWall — vertical loads', () => {
  const r = designRetainingWall(BASE)
  const gc = 23.6

  it('W_stem = γc·ts·Hs (per m)', () => {
    expect(r.W_stem).toBeCloseTo(gc * 0.3 * 3.0, 6)
  })

  it('arm_stem = bt + ts/2', () => {
    expect(r.arm_stem).toBeCloseTo(0.5 + 0.15, 9)
  })

  it('W_base = γc·B·tb', () => {
    expect(r.W_base).toBeCloseTo(gc * 2.3 * 0.5, 6)
  })

  it('arm_base = B/2', () => {
    expect(r.arm_base).toBeCloseTo(2.3 / 2, 9)
  })

  it('W_soil = γs·bh·hs', () => {
    expect(r.W_soil).toBeCloseTo(18 * 1.5 * 3.0, 6)
  })

  it('arm_soil = bt + ts + bh/2', () => {
    expect(r.arm_soil).toBeCloseTo(0.5 + 0.3 + 0.75, 9)
  })

  it('W_sur = q_sur·bh  (= 0 here)', () => {
    expect(r.W_sur).toBeCloseTo(0, 9)
  })

  it('sumV = sum of all vertical loads', () => {
    expect(r.sumV).toBeCloseTo(r.W_stem + r.W_base + r.W_soil + r.W_sur, 9)
  })

  it('MR = sum of W·arm', () => {
    const expected =
      r.W_stem * r.arm_stem + r.W_base * r.arm_base +
      r.W_soil * r.arm_soil + r.W_sur * r.arm_sur
    expect(r.MR).toBeCloseTo(expected, 9)
  })
})

describe('designRetainingWall — stability', () => {
  const r = designRetainingWall(BASE)

  it('FS_OT = MR / MO', () => {
    expect(r.FS_OT).toBeCloseTo(r.MR / r.MO, 9)
  })

  it('FS_SL = μ·ΣV / Fh', () => {
    expect(r.FS_SL).toBeCloseTo(0.5 * r.sumV / r.Fh, 9)
  })

  it('reference wall is stable (FS_OT > 2 and FS_SL > 1.5)', () => {
    expect(r.stableOT).toBe(true)
    expect(r.stableSL).toBe(true)
  })

  it('stableOT = false when FS_OT < 2 (narrow heel)', () => {
    const r2 = designRetainingWall({ ...BASE, bh: 200 })
    expect(r2.stableOT).toBe(false)
  })

  it('stableSL = false when μ is very small', () => {
    const r2 = designRetainingWall({ ...BASE, mu: 0.1 })
    expect(r2.stableSL).toBe(false)
  })
})

describe('designRetainingWall — bearing pressure', () => {
  const r = designRetainingWall(BASE)

  it('xbar = (MR − MO) / ΣV', () => {
    expect(r.xbar).toBeCloseTo((r.MR - r.MO) / r.sumV, 9)
  })

  it('e = B/2 − xbar', () => {
    expect(r.e).toBeCloseTo(r.B / 2 - r.xbar, 9)
  })

  it('q_max = (ΣV/B)·(1 + 6e/B)', () => {
    const q_avg = r.sumV / r.B
    expect(r.q_max).toBeCloseTo(q_avg * (1 + 6 * r.e / r.B), 6)
  })

  it('q_min = (ΣV/B)·(1 − 6e/B)', () => {
    const q_avg = r.sumV / r.B
    expect(r.q_min).toBeCloseTo(q_avg * (1 - 6 * r.e / r.B), 6)
  })

  it('reference wall: bearingOK and tensionOK', () => {
    expect(r.bearingOK).toBe(true)
    expect(r.tensionOK).toBe(true)
  })

  it('bearingOK = false when qa is too small', () => {
    const r2 = designRetainingWall({ ...BASE, qa: 10 })
    expect(r2.bearingOK).toBe(false)
  })
})

describe('designRetainingWall — stem design', () => {
  const r = designRetainingWall(BASE)
  const hs = 3.0, Ka = 1 / 3

  it('d_stem = ts − cover − barDia/2', () => {
    expect(r.d_stem).toBeCloseTo(300 - 75 - 8, 9)
  })

  it('Pa_stem = ½·Ka·γs·Hs²', () => {
    expect(r.Pa_stem).toBeCloseTo(0.5 * Ka * 18 * hs ** 2, 6)
  })

  it('Mu_stem = Pa_stem·Hs/3 + Pq_stem·Hs/2', () => {
    const expected = r.Pa_stem * (hs / 3) + r.Pq_stem * (hs / 2)
    expect(r.Mu_stem).toBeCloseTo(expected, 6)
  })

  it('Vc_stem = φ·(√f\'c/6)·b·d / 1000  (kN/m, b=1000 mm)', () => {
    const expected = 0.75 * (Math.sqrt(28) / 6) * 1000 * r.d_stem / 1000
    expect(r.Vc_stem).toBeCloseTo(expected, 6)
  })

  it('As_design ≥ As_min', () => {
    expect(r.As_design).toBeGreaterThanOrEqual(r.As_min - 1e-9)
  })

  it('As_design ≥ As_stem (formula value)', () => {
    expect(r.As_design).toBeGreaterThanOrEqual(r.As_stem - 1e-9)
  })

  it('higher surcharge → larger Mu_stem', () => {
    const r2 = designRetainingWall({ ...BASE, q_sur: 20 })
    expect(r2.Mu_stem).toBeGreaterThan(r.Mu_stem)
  })
})
