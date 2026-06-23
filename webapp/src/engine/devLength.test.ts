import { describe, it, expect } from 'vitest'
import { calcDevLength } from './devLength'

// Reference inputs — Grade 415, fc=28, db=20 (≤20 → ψs=0.8), not top, uncoated, n.w., Ψ=1.5
const BASE = {
  db: 20, fc: 28, fy: 415,
  topBar: false, epoxy: 'none' as const,
  lambda: 1.0, cbKtr_db: 1.5,
}

describe('calcDevLength — modification factors §25.4.2.4', () => {
  it('psi_t = 1.0 for non-top bars', () => {
    expect(calcDevLength(BASE).psi_t).toBe(1.0)
  })

  it('psi_t = 1.3 for top bars (>300 mm concrete below)', () => {
    expect(calcDevLength({ ...BASE, topBar: true }).psi_t).toBe(1.3)
  })

  it('psi_e = 1.0 / 1.2 / 1.5 for none / light / heavy epoxy', () => {
    expect(calcDevLength({ ...BASE, epoxy: 'none' }).psi_e).toBe(1.0)
    expect(calcDevLength({ ...BASE, epoxy: 'coated-light' }).psi_e).toBe(1.2)
    expect(calcDevLength({ ...BASE, epoxy: 'coated-heavy' }).psi_e).toBe(1.5)
  })

  it('psi_s = 0.8 for db ≤ 20 mm', () => {
    expect(calcDevLength(BASE).psi_s).toBe(0.8)           // db=20
    expect(calcDevLength({ ...BASE, db: 12 }).psi_s).toBe(0.8)
  })

  it('psi_s = 1.0 for db > 20 mm', () => {
    expect(calcDevLength({ ...BASE, db: 25 }).psi_s).toBe(1.0)
    expect(calcDevLength({ ...BASE, db: 32 }).psi_s).toBe(1.0)
  })

  it('psi_te = psi_t × psi_e when product ≤ 1.7', () => {
    // top=true (1.3) × coated-light (1.2) = 1.56 < 1.7
    const r = calcDevLength({ ...BASE, topBar: true, epoxy: 'coated-light' })
    expect(r.psi_te).toBeCloseTo(1.3 * 1.2, 9)
  })

  it('psi_te capped at 1.7 when psi_t × psi_e > 1.7', () => {
    // top=true (1.3) × coated-heavy (1.5) = 1.95 > 1.7
    const r = calcDevLength({ ...BASE, topBar: true, epoxy: 'coated-heavy' })
    expect(r.psi_te).toBeCloseTo(1.7, 9)
  })
})

describe('calcDevLength — confinement cap §25.4.2.3', () => {
  it('confine = cbKtr_db when ≤ 2.5', () => {
    expect(calcDevLength({ ...BASE, cbKtr_db: 1.5 }).confine).toBeCloseTo(1.5, 9)
    expect(calcDevLength({ ...BASE, cbKtr_db: 2.0 }).confine).toBeCloseTo(2.0, 9)
  })

  it('confine capped at 2.5', () => {
    expect(calcDevLength({ ...BASE, cbKtr_db: 4.0 }).confine).toBeCloseTo(2.5, 9)
  })
})

describe('calcDevLength — tension development §25.4.2.3', () => {
  it('ld_raw = fy·ψte·ψs·db / (1.1·λ·√f\'c·Ψ)', () => {
    const r = calcDevLength(BASE)
    const sqrtFc = Math.sqrt(28)
    const expected = (415 * 1.0 * 0.8 * 20) / (1.1 * 1.0 * sqrtFc * 1.5)
    expect(r.ld_raw).toBeCloseTo(expected, 6)
  })

  it('ld = max(ld_raw, 300)', () => {
    const r = calcDevLength(BASE)
    expect(r.ld).toBeCloseTo(Math.max(r.ld_raw, 300), 9)
    expect(r.ld).toBeGreaterThanOrEqual(300)
  })

  it('ld floor: 300 mm minimum applies for very small db or high confinement', () => {
    // db=10, cbKtr_db=2.5 (max confinement) → very short raw length → floor kicks in
    const r = calcDevLength({ ...BASE, db: 10, cbKtr_db: 2.5 })
    expect(r.ld).toBeGreaterThanOrEqual(300)
  })

  it('larger confinement (Ψ=2.5) → shorter ld than Ψ=1.5', () => {
    const r15 = calcDevLength({ ...BASE, cbKtr_db: 1.5 })
    const r25 = calcDevLength({ ...BASE, cbKtr_db: 2.5 })
    expect(r25.ld_raw).toBeLessThan(r15.ld_raw)
  })

  it('top bar increases ld (ψt=1.3)', () => {
    const r_other = calcDevLength(BASE)
    const r_top   = calcDevLength({ ...BASE, topBar: true })
    expect(r_top.ld).toBeGreaterThan(r_other.ld)
  })
})

describe('calcDevLength — compression development §25.4.9.2', () => {
  it('ldc_1 = 0.24·fy·db / (λ·√f\'c)', () => {
    const r = calcDevLength(BASE)
    const sqrtFc = Math.sqrt(28)
    const expected = (0.24 * 415 * 20) / (1.0 * sqrtFc)
    // ldc = max(ldc_1, ldc_2, 200), so just verify ldc_1 is the leading term here
    expect(r.ldc).toBeCloseTo(Math.max(expected, 0.043 * 415 * 20, 200), 6)
  })

  it('ldc ≥ 200 mm always', () => {
    expect(calcDevLength(BASE).ldc).toBeGreaterThanOrEqual(200)
  })

  it('ldc = max of both formula terms and 200 mm floor', () => {
    const r = calcDevLength(BASE)
    const sqrtFc = Math.sqrt(28)
    const ldc_1 = (0.24 * 415 * 20) / (1.0 * sqrtFc)
    const ldc_2 = 0.043 * 415 * 20
    expect(r.ldc).toBeCloseTo(Math.max(ldc_1, ldc_2, 200), 6)
  })
})

describe('calcDevLength — tension splices §25.5.2', () => {
  it('ls_A = 1.0 × ld (Class A)', () => {
    const r = calcDevLength(BASE)
    expect(r.ls_A).toBeCloseTo(r.ld, 9)
  })

  it('ls_B = 1.3 × ld (Class B)', () => {
    const r = calcDevLength(BASE)
    expect(r.ls_B).toBeCloseTo(1.3 * r.ld, 9)
  })

  it('ls_A ≥ 300 mm', () => {
    expect(calcDevLength(BASE).ls_A).toBeGreaterThanOrEqual(300)
  })
})

describe('calcDevLength — compression splices §25.5.5', () => {
  it('lsc = 0.0725·fy·db for fy ≤ 420 MPa', () => {
    const r = calcDevLength(BASE)  // fy=415 ≤ 420
    const expected = Math.max(0.0725 * 415 * 20, 300)
    expect(r.lsc).toBeCloseTo(expected, 6)
  })

  it('lsc = (0.13·fy − 24)·db for fy > 420 MPa', () => {
    const r = calcDevLength({ ...BASE, fy: 520 })
    const expected = Math.max((0.13 * 520 - 24) * 20, 300)
    expect(r.lsc).toBeCloseTo(expected, 6)
  })

  it('lsc × 4/3 when f\'c < 21 MPa', () => {
    const r_hi = calcDevLength({ ...BASE, fc: 28 })
    const r_lo = calcDevLength({ ...BASE, fc: 17 })
    expect(r_lo.lsc).toBeCloseTo(r_hi.lsc * (4 / 3), 6)
  })

  it('lsc ≥ 300 mm always', () => {
    // Tiny bar, fy at limit
    const r = calcDevLength({ ...BASE, db: 10, fy: 280 })
    expect(r.lsc).toBeGreaterThanOrEqual(300)
  })
})
