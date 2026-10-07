import { describe, it, expect } from 'vitest'
import { columnJ10, type ColumnSection } from './columnJointChecks'

// W310x79 column (d 307, bf 254, tf 14.6, tw 8.76, A 10 100), Fy 345; the
// beam flange is 165 × 9.7 (W310x38.7). k is taken as tf (fillet ignored).
const col: ColumnSection = { name: 'W310x79', d: 307, bf: 254, tf: 14.6, tw: 8.76, A: 10100, Fy: 345 }
const beam = (Pf: number, id = 'B1') => ({ beamId: id, Pf, bfb: 165, tfb: 9.7 })
const interior = { atEnd: false, twoSided: false, Pr: 500, beamDepth: 310 }

describe('§J10 concentrated forces on the column, by hand', () => {
  const r = columnJ10(col, [beam(200)], interior)
  it('§J10.1 flange local bending: 0.9·6.25·345·14.6² = 413.66 kN', () => {
    expect(r.flangeLocalBending.phiRn).toBeCloseTo(413.6636, 3)
  })
  it('§J10.2 web local yielding: 1.0·345·8.76·(5·14.6 + 9.7) = 249.94 kN', () => {
    expect(r.webLocalYielding.phiRn).toBeCloseTo(249.9359, 3)
  })
  it('§J10.3 web crippling: 0.75·0.80·tw²[1 + 3(lb/d)(tw/tf)^1.5]√(E·Fy·tf/tw) = 515.50 kN', () => {
    expect(r.webCrippling.phiRn).toBeCloseTo(515.503, 2)
  })
  it('one-sided: §J10.5 does not apply; web yielding governs and passes at 200 kN', () => {
    expect(r.webBuckling).toBeUndefined()
    expect(r.governs).toBe('web local yielding')
    expect(r.phiRnMin).toBeCloseTo(249.9359, 3)
    expect(r.stiffeners).toBeUndefined()
  })
  it('§J10.6 panel zone, Pr ≤ 0.4Py: 0.9·0.6·345·307·8.76 = 501.02 kN', () => {
    expect(r.panel.Py).toBeCloseTo(3484.5, 6)
    expect(r.panel.phiRv).toBeCloseTo(501.0203, 3)
    expect(r.ok).toBe(true)
  })
  it('a heavily loaded column takes the (1.4 − Pr/Py) reduction', () => {
    const h = columnJ10(col, [beam(200)], { ...interior, Pr: 0.6 * 3484.5 })
    expect(h.panel.phiRv).toBeCloseTo(501.0203 * (1.4 - 0.6), 3)
  })
})

describe('§J10 at the column end, and from both sides', () => {
  it('at the end: §J10.1 halves, §J10.2 takes 2.5k + lb', () => {
    const r = columnJ10(col, [beam(100)], { ...interior, atEnd: true })
    expect(r.flangeLocalBending.phiRn).toBeCloseTo(413.6636 / 2, 3)
    expect(r.webLocalYielding.phiRn).toBeCloseTo(345 * 8.76 * (2.5 * 14.6 + 9.7) / 1000, 9)
  })
  it('two-sided: §J10.5 web buckling 0.9·24·tw³√(E·Fy)/h = 434.17 kN joins the set', () => {
    const r = columnJ10(col, [beam(200, 'L'), beam(200, 'R')], { ...interior, twoSided: true })
    expect(r.webBuckling!.phiRn).toBeCloseTo(434.1686, 3)
  })
})

describe('stiffening: continuity plates and a doubler sized for the deficit', () => {
  // Ru 300 > 249.94 (web yielding): the pair carries 50.06 kN.
  const r = columnJ10(col, [beam(300, 'L'), beam(300, 'R')], { ...interior, twoSided: true })
  it('§J10.7 continuity plates: Fst = Ru − φRn,min; the plate fills the outstand (254 − 8.76)/2 → 120, ts ≥ max(tfb/2, bs/16) = 7.5 → 8', () => {
    expect(r.stiffeners!.Fst).toBeCloseTo(300 - 249.9359, 3)
    expect(r.stiffeners!.bs).toBe(120)
    expect(r.stiffeners!.bs).toBeGreaterThanOrEqual(165 / 3 - 8.76 / 2)   // §J10.8 minimum
    expect(r.stiffeners!.ts).toBe(8)
    expect(r.stiffeners!.phiRn).toBeGreaterThanOrEqual(r.stiffeners!.Fst)
    // fillets: Table J2.4 minimum for the 8 mm plate governs over 1.3 mm by strength
    expect(r.stiffeners!.weld).toBe(5)
    expect(r.stiffeners!.fullDepth).toBe(false)
  })
  it('§J10.9 doubler: Vu = 600 > 501.02 → tw + td needs 1.73 mm more → 8 mm stock', () => {
    expect(r.panel.ok).toBe(false)
    expect(r.doubler!.td).toBe(8)
    expect(r.doubler!.phiRv).toBeCloseTo(0.9 * 0.6 * 345 * 307 * (8.76 + 8) / 1000, 6)
    expect(r.doubler!.Vd).toBeCloseTo(600 * 8 / 16.76, 6)
    expect(r.ok).toBe(true)
  })
})
