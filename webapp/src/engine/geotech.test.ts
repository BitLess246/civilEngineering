import { describe, it, expect } from 'vitest'
import {
  rankineKa, rankineKp, activeThrust, passiveThrust,
  bearingFactors, infiniteSlopeFS,
} from './geotech'
import { generalBearingCapacity } from './bearingGeneral'

describe('Rankine earth-pressure coefficients', () => {
  it('Ka = (1−sinφ)/(1+sinφ); Kp is its reciprocal', () => {
    expect(rankineKa(30)).toBeCloseTo(1 / 3, 6)          // textbook 0.333
    expect(rankineKp(30)).toBeCloseTo(3, 6)
    expect(rankineKa(30) * rankineKp(30)).toBeCloseTo(1, 9)
  })
  it('φ = 0 gives K = 1 (hydrostatic-like)', () => {
    expect(rankineKa(0)).toBeCloseTo(1, 9)
    expect(rankineKp(0)).toBeCloseTo(1, 9)
  })
})

describe('active / passive thrust', () => {
  const wall = { gamma: 18, H: 5, phiDeg: 30 }
  it('active thrust Pa = ½·Ka·γ·H² acting at H/3', () => {
    const r = activeThrust(wall)
    expect(r.P).toBeCloseTo(0.5 * (1 / 3) * 18 * 25, 4)   // 75 kN/m
    expect(r.lineOfAction).toBeCloseTo(5 / 3, 6)
    expect(r.basePressure).toBeCloseTo((1 / 3) * 18 * 5, 6)
  })
  it('a surcharge raises the thrust and the line of action', () => {
    const bare = activeThrust(wall)
    const sur = activeThrust({ ...wall, surcharge: 20 })
    expect(sur.P).toBeGreaterThan(bare.P)
    expect(sur.lineOfAction).toBeGreaterThan(bare.lineOfAction)   // rectangular block at H/2
    expect(sur.P).toBeCloseTo(bare.P + (1 / 3) * 20 * 5, 6)        // + Ka·q·H
  })
  it('passive thrust is far larger than active (Kp ≫ Ka)', () => {
    expect(passiveThrust(wall).P).toBeGreaterThan(activeThrust(wall).P * 8)
  })
})

describe('bearing-capacity factors (Vesić Nγ)', () => {
  it('match published values at φ = 30°', () => {
    const f = bearingFactors(30)
    expect(f.Nq).toBeCloseTo(18.40, 1)
    expect(f.Nc).toBeCloseTo(30.14, 1)
    expect(f.Ngamma).toBeCloseTo(22.40, 1)
  })
  it('φ = 0: Nc = 5.14, Nq = 1, Nγ = 0', () => {
    expect(bearingFactors(0)).toEqual({ Nc: 5.14, Nq: 1, Ngamma: 0 })
  })
  it('factors increase with φ', () => {
    expect(bearingFactors(35).Nq).toBeGreaterThan(bearingFactors(30).Nq)
  })
})

describe('bearing capacity moved to bearingGeneral', () => {
  // The simple `bearingCapacity()` that used to live here was DELETED, not
  // repaired: it mixed a Vesić Nγ, a Meyerhof s_c, no s_q (only Terzaghi omits
  // one) and a De Beer s_γ, so its answer matched no published method. These
  // cases now exercise the engine that replaced it, and the last one records
  // what the old function got wrong so the bug cannot quietly return.

  it('strip footing is the bare equation, with every shape factor at 1', () => {
    const r = generalBearingCapacity({ c: 20, phiDeg: 30, gamma: 18, B: 2, Df: 1.5, L: Infinity, method: 'vesic' })
    expect(r.sc).toBeCloseTo(1, 9)
    expect(r.sq).toBeCloseTo(1, 9)
    expect(r.sgamma).toBeCloseTo(1, 9)
    const q = 18 * 1.5
    expect(r.surcharge).toBeCloseTo(q, 9)
    // Depth factors still apply to a strip — that is the part the old function
    // never had at all.
    expect(r.qult).toBeCloseTo(
      20 * r.Nc * r.dc + q * r.Nq * r.dq + 0.5 * 18 * 2 * r.Ngamma * r.dgamma, 4,
    )
  })

  it('a square footing raises the cohesion and surcharge terms and lowers the γ term', () => {
    const strip = generalBearingCapacity({ c: 20, phiDeg: 30, gamma: 18, B: 2, Df: 1.5, L: Infinity, method: 'vesic' })
    const square = generalBearingCapacity({ c: 20, phiDeg: 30, gamma: 18, B: 2, Df: 1.5, L: 2, method: 'vesic' })
    expect(square.sc).toBeGreaterThan(1)
    expect(square.sq).toBeGreaterThan(1)
    expect(square.sgamma).toBeLessThan(1)
    expect(square.qult).toBeGreaterThan(strip.qult)
  })

  it('custom FS scales the allowable, on the NET capacity', () => {
    const a = generalBearingCapacity({ c: 10, phiDeg: 25, gamma: 17, B: 1.5, L: 1.5, Df: 1, FS: 2.5 })
    expect(a.qallowNet).toBeCloseTo(a.qnet / 2.5, 6)
  })

  it('APPLIES an s_q, which the deleted function did not', () => {
    // The whole defect in one assertion. With no embedment the surcharge term
    // is zero and the omission is invisible (0.5% on the old numbers); with
    // embedment it understated a square footing by roughly 17%.
    const square = generalBearingCapacity({ c: 20, phiDeg: 30, gamma: 18, B: 2, L: 2, Df: 1.5, method: 'vesic' })
    expect(square.sq).toBeCloseTo(1 + Math.tan((30 * Math.PI) / 180), 6)

    const withoutSq = 20 * square.Nc * square.sc * square.dc
      + square.surcharge * square.Nq * square.dq                       // s_q omitted
      + 0.5 * 18 * 2 * square.Ngamma * square.sgamma * square.dgamma
    expect(square.qult / withoutSq).toBeGreaterThan(1.15)
  })
})

describe('infinite-slope factor of safety', () => {
  it('cohesionless dry slope: FS = tanφ / tanβ', () => {
    const fs = infiniteSlopeFS({ c: 0, phiDeg: 30, gamma: 18, z: 3, betaDeg: 20 })
    expect(fs).toBeCloseTo(Math.tan(30 * Math.PI / 180) / Math.tan(20 * Math.PI / 180), 6)
  })
  it('cohesion raises FS; a steeper slope lowers it', () => {
    const base = infiniteSlopeFS({ c: 5, phiDeg: 30, gamma: 18, z: 3, betaDeg: 20 })
    const noC = infiniteSlopeFS({ c: 0, phiDeg: 30, gamma: 18, z: 3, betaDeg: 20 })
    const steep = infiniteSlopeFS({ c: 5, phiDeg: 30, gamma: 18, z: 3, betaDeg: 30 })
    expect(base).toBeGreaterThan(noC)
    expect(steep).toBeLessThan(base)
  })
  it('seepage parallel to the slope reduces FS (buoyant normal stress)', () => {
    const dry = infiniteSlopeFS({ c: 0, phiDeg: 32, gamma: 20, z: 4, betaDeg: 18 })
    const wet = infiniteSlopeFS({ c: 0, phiDeg: 32, gamma: 20, z: 4, betaDeg: 18, seepage: true, gammaSat: 20, gammaW: 9.81 })
    expect(wet).toBeLessThan(dry)
    // cohesionless with full seepage: FS ≈ (γ′/γsat)·tanφ/tanβ
    const expected = ((20 - 9.81) / 20) * Math.tan(32 * Math.PI / 180) / Math.tan(18 * Math.PI / 180)
    expect(wet).toBeCloseTo(expected, 6)
  })
})
