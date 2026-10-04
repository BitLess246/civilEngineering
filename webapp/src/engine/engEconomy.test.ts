import { describe, expect, it } from 'vitest'
import {
  pf, fp, pa, ap, fa, af, arithGradientPW, arithGradientAW, geomGradientPW,
  effRate, npv, irr, payback, discountedPayback, benefitCost, capitalizedCost,
  deprSL, deprSYD, deprDB, breakEven,
} from './engEconomy'

describe('single-payment and uniform-series factors', () => {
  it('(P/F, 8 %, 5) = 0.68058 — the board-exam staple', () => {
    expect(pf(0.08, 5)).toBeCloseTo(0.680583, 5)
    expect(fp(0.08, 5)).toBeCloseTo(1.469328, 5)
  })
  it('(A/P, 10 %, 10) = 0.16275 and inverts (P/A)', () => {
    expect(ap(0.1, 10)).toBeCloseTo(0.162745, 5)
    expect(pa(0.1, 10)).toBeCloseTo(1 / 0.1627453949, 4)
  })
  it('(F/A, 6 %, 20) = 36.7856 and inverts (A/F)', () => {
    expect(fa(0.06, 20)).toBeCloseTo(36.7856, 3)
    expect(af(0.06, 20)).toBeCloseTo(1 / 36.7855912, 5)
  })
  it('zero interest degrades to counting periods', () => {
    expect(pa(0, 7)).toBe(7)
    expect(ap(0, 7)).toBeCloseTo(1 / 7, 12)
    expect(fa(0, 7)).toBe(7)
    expect(af(0, 7)).toBeCloseTo(1 / 7, 12)
  })
})

describe('gradients', () => {
  it('arithmetic (P/G, 8 %, 5) on G = 100 → 737.24', () => {
    // 100·[(1.08⁵ − 0.08·5 − 1)/(0.08²·1.08⁵)] = 100·7.372426
    expect(arithGradientPW(0.08, 100, 5)).toBeCloseTo(737.2426, 3)
    expect(arithGradientAW(0.08, 100, 5)).toBeCloseTo(737.2426 * 0.250456, 2)
  })
  it('geometric A1 = 1000, g = 5 %, i = 8 %, n = 10 → 8183.55', () => {
    // 1000·[1 − (1.05/1.08)¹⁰]/0.03
    expect(geomGradientPW(0.08, 0.05, 1000, 10)).toBeCloseTo(8183.55, 1)
  })
  it('geometric with i = g falls back to A1·n/(1+i)', () => {
    expect(geomGradientPW(0.08, 0.08, 1000, 10)).toBeCloseTo(10000 / 1.08, 6)
  })
})

describe('nominal vs effective', () => {
  it('12 % nominal monthly → 12.6825 % effective', () => {
    expect(effRate(0.12, 12)).toBeCloseTo(0.126825, 5)
  })
  it('annual compounding is the identity', () => {
    expect(effRate(0.09, 1)).toBeCloseTo(0.09, 12)
  })
})

describe('project measures on cash flows', () => {
  const FIVE = [-1000, 300, 300, 300, 300, 300]
  it('NPV discounts every year back to t = 0', () => {
    expect(npv(0.1, FIVE)).toBeCloseTo(137.236, 2)
    expect(npv(0, FIVE)).toBe(500)
  })
  it('IRR of −1000, +300 ×5 ≈ 15.24 %', () => {
    expect(irr(FIVE)).toBeCloseTo(0.1524, 3)
  })
  it('no sign change means no IRR', () => {
    expect(irr([100, 200, 300])).toBeNull()
    expect(irr([-100, -200])).toBeNull()
  })
  it('simple payback interpolates the crossing year', () => {
    expect(payback([-1000, 400, 400, 400])).toBeCloseTo(2.5, 9)
    expect(payback([-1000, 200, 200])).toBeNull()
  })
  it('discounted payback on −1000, +500 ×3 at 10 % ≈ 2.352 yr', () => {
    expect(discountedPayback(0.1, [-1000, 500, 500, 500])).toBeCloseTo(2.352, 2)
  })
  it('benefit–cost is PW benefits over PW costs', () => {
    expect(benefitCost(2000, 1000)).toBe(2)
  })
  it('capitalized cost is A/i', () => {
    expect(capitalizedCost(5000, 0.05)).toBe(100000)
  })
})

describe('depreciation schedules', () => {
  it('straight line spreads evenly and lands on salvage', () => {
    const s = deprSL(10000, 2000, 5)
    for (const y of s) expect(y.dep).toBeCloseTo(1600, 9)
    expect(s[4].book).toBeCloseTo(2000, 9)
  })
  it('sum-of-years-digits front-loads: year 1 = 5/15 of base', () => {
    const s = deprSYD(10000, 2000, 5)
    expect(s[0].dep).toBeCloseTo((8000 * 5) / 15, 6) // 2666.67
    expect(s[4].book).toBeCloseTo(2000, 6)
    expect(s.reduce((t, y) => t + y.dep, 0)).toBeCloseTo(8000, 6)
  })
  it('declining balance never crosses salvage', () => {
    const s = deprDB(10000, 2000, 5, 0.4)
    expect(s[0].dep).toBeCloseTo(4000, 9)
    for (const y of s) expect(y.book).toBeGreaterThanOrEqual(2000 - 1e-9)
  })
})

describe('break-even', () => {
  it('fixed/(price − variable): 50 000/(120 − 70) = 1000 units', () => {
    expect(breakEven(50000, 120, 70)).toBe(1000)
  })
  it('rejects a price at or below variable cost', () => {
    expect(() => breakEven(50000, 70, 70)).toThrow()
  })
})
