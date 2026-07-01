import { describe, it, expect } from 'vitest'
import { facingMoment, facingFlexuralStrength, facingPunchingStrength, designFacing } from './shotcreteFacing'
import { concreteBeamMn } from './scwb'

describe('facingMoment', () => {
  it('m = As·fy·(d − a/2) per metre width (matches concreteBeamMn at b = 1000)', () => {
    expect(facingMoment(500, 90, 21, 415)).toBeCloseTo(concreteBeamMn(1000, 90, 500, 21, 415), 9)
  })
})

describe('facingFlexuralStrength — FHWA GEC-7', () => {
  it('R_FF = C_F·(m_neg + m_pos)·8·S_perp/S_span', () => {
    const r = facingFlexuralStrength({ CF: 2, mNeg: 10, mPos: 10, Sspan: 1.5, Sperp: 1.5 })
    expect(r).toBeCloseTo((2 * 20 * 8 * 1.5) / 1.5, 6)   // 320 kN
  })
  it('closer spacing (smaller S_span) raises the strength', () => {
    const wide = facingFlexuralStrength({ CF: 2, mNeg: 10, mPos: 10, Sspan: 2.0, Sperp: 1.5 })
    const tight = facingFlexuralStrength({ CF: 2, mNeg: 10, mPos: 10, Sspan: 1.0, Sperp: 1.5 })
    expect(tight).toBeGreaterThan(wide)
  })
})

describe('facingPunchingStrength — ACI two-way', () => {
  it('φ·0.33·√f′c·bo·d around the bearing plate', () => {
    const d = 100 - 30
    const bo = Math.PI * (0.2 * 1000 + d)
    const expected = (0.75 * 0.33 * Math.sqrt(21) * bo * d) / 1000
    expect(facingPunchingStrength({ fc: 21, bearingPlate: 0.2, hc: 100, cover: 30 })).toBeCloseTo(expected, 6)
  })
  it('a thicker facing punches harder to fail', () => {
    expect(facingPunchingStrength({ fc: 21, bearingPlate: 0.2, hc: 150, cover: 30 }))
      .toBeGreaterThan(facingPunchingStrength({ fc: 21, bearingPlate: 0.2, hc: 100, cover: 30 }))
  })
})

describe('designFacing', () => {
  const base = {
    SH: 1.5, SV: 1.5, hc: 100, cover: 30, AsVert: 400, AsHoriz: 400,
    fc: 21, fy: 415, bearingPlate: 0.2, CF: 2.0, nailHeadForce: 60,
  }
  it('governing strength = min(flexure, punching); FoS = strength/demand', () => {
    const r = designFacing(base)
    expect(r.strength).toBeCloseTo(Math.min(r.Rff, r.Rfp), 9)
    expect(r.governs).toBe(r.Rff <= r.Rfp ? 'flexure' : 'punching')
    expect(r.fs).toBeCloseTo(r.strength / 60, 9)
    expect(r.ok).toBe(r.strength >= 60)
  })
  it('equal spacing & steel ⇒ the two flexure directions match', () => {
    const r = designFacing(base)
    expect(r.RffVert).toBeCloseTo(r.RffHoriz, 6)
  })
  it('more facing reinforcement raises the flexural strength', () => {
    const light = designFacing({ ...base, AsVert: 300, AsHoriz: 300 })
    const heavy = designFacing({ ...base, AsVert: 700, AsHoriz: 700 })
    expect(heavy.Rff).toBeGreaterThan(light.Rff)
  })
  it('a heavy nail-head force fails a thin, lightly-meshed facing', () => {
    const r = designFacing({ ...base, nailHeadForce: 500 })
    expect(r.ok).toBe(false)
    expect(r.fs).toBeLessThan(1)
  })
})
