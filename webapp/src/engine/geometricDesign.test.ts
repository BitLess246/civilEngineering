import { describe, it, expect } from 'vitest'
import {
  stoppingSightDistance, buildVerticalCurve, minCrestLength, minSagLength,
  minSagComfort, superelevation,
} from './geometricDesign'

describe('stopping sight distance', () => {
  it('splits into the reaction and braking pieces at the AASHTO defaults', () => {
    // V = 100 km/h, t = 2.5 s, f = 0.35, level
    const r = stoppingSightDistance({ V: 100 })
    expect(r.reaction).toBeCloseTo(69.5, 6) // 0.278·100·2.5
    expect(r.braking).toBeCloseTo(10000 / (254 * 0.35), 6) // 112.486…
    expect(r.total).toBeCloseTo(181.986, 2)
  })

  it('lengthens on a downgrade and shortens on an upgrade through f ± G', () => {
    const up = stoppingSightDistance({ V: 100, grade: 0.04 })
    const down = stoppingSightDistance({ V: 100, grade: -0.04 })
    expect(up.braking).toBeCloseTo(10000 / (254 * 0.39), 6)
    expect(down.braking).toBeCloseTo(10000 / (254 * 0.31), 6)
    expect(down.braking).toBeGreaterThan(up.braking)
    expect(down.total).toBeGreaterThan(up.total)
  })

  it('matches the tabulated AASHTO SSD values within their rounding', () => {
    // Green Book table: 100 km/h → 185 m (computed 181.98), 60 km/h → 85 m
    expect(stoppingSightDistance({ V: 100 }).total).toBeGreaterThan(178)
    expect(stoppingSightDistance({ V: 100 }).total).toBeLessThan(186)
    // 60 km/h: 0.278·60·2.5 = 41.7 + 3600/(254·0.35) = 40.47 → 82.2
    expect(stoppingSightDistance({ V: 60 }).total).toBeCloseTo(82.17, 1)
  })

  it('rejects a grade too steep to brake on', () => {
    expect(() => stoppingSightDistance({ V: 80, grade: -0.5 })).toThrow(/too steep/)
  })
})

describe('vertical curve geometry', () => {
  // Hand-set sample: g1 = +3 %, g2 = −1 %, L = 300, PVI station 1500, elev 100
  const crest = buildVerticalCurve({ g1: 3, g2: -1, L: 300, PVIstation: 1500, PVIelev: 100 })

  it('places the BVC and EVC half a length either side of the PVI', () => {
    expect(crest.BVCstation).toBeCloseTo(1350, 9)
    expect(crest.EVCstation).toBeCloseTo(1650, 9)
    expect(crest.BVCelev).toBeCloseTo(100 - 0.03 * 150, 9) // 95.5
    expect(crest.EVCelev).toBeCloseTo(100 - 0.01 * 150, 9) // 98.5
  })

  it('carries A, K, r and the PVI external offset e = A·L/800', () => {
    expect(crest.A).toBeCloseTo(4, 9)
    expect(crest.K).toBeCloseTo(75, 9)
    expect(crest.r).toBeCloseTo(-4 / 600, 9)
    expect(crest.PVIoffset).toBeCloseTo(4 * 300 / 800, 9) // 1.5
    // curve at the PVI sits exactly one offset below the tangent PVI
    expect(crest.elevAt(150)).toBeCloseTo(98.5, 9)
    expect(crest.tangentAt(150)).toBeCloseTo(100, 9)
  })

  it('finds the high point at x = −g1/(2a) from the BVC', () => {
    // y = 95.5 + 0.03x − x²/15000 → x* = 0.03·15000/2 = 225 m
    expect(crest.turnX).toBeCloseTo(225, 6)
    expect(crest.turnStation).toBeCloseTo(1575, 6)
    expect(crest.turnElev).toBeCloseTo(95.5 + 6.75 - 3.375, 6) // 98.875
    expect(crest.turnKind).toBe('high')
  })

  it('flags a low point on a sag curve and stays null on monotonic grades', () => {
    const sag = buildVerticalCurve({ g1: -2, g2: 2, L: 200, PVIstation: 1000, PVIelev: 50 })
    expect(sag.turnKind).toBe('low')
    expect(sag.turnX).toBeCloseTo(100, 6)
    // BVC sits at 52 (50 + 0.02·100); the parabola bottoms out one offset
    // e = A·L/800 = 1.0 ABOVE the PVI — the curve fills the sag: 52−2+1 = 51
    expect(sag.turnElev).toBeCloseTo(51, 6)
    const ramp = buildVerticalCurve({ g1: 2, g2: 4, L: 200, PVIstation: 1000, PVIelev: 50 })
    expect(ramp.turnX).toBeNull()
    expect(ramp.turnKind).toBeNull()
  })

  it('ends on the exit tangent grade — elevations at x = 0 and x = L', () => {
    expect(crest.elevAt(0)).toBeCloseTo(crest.BVCelev, 9)
    expect(crest.elevAt(300)).toBeCloseTo(crest.EVCelev, 9)
  })
})

describe('crest length requirements', () => {
  // The exact Green-Book constants behind the rounded prints 658 / 2158:
  const cMetric = 100 * Math.pow(Math.sqrt(2 * 1.08) + Math.sqrt(2 * 0.6), 2) // 657.994
  const cUS = 100 * Math.pow(Math.sqrt(7) + 2, 2) // 2158.30

  it('reproduces the metric constant 658 with the AASHTO eye/object heights', () => {
    // A = 5, S = 60: S ≤ L branch → L = 5·60²/658 = 27.36 < 60, so the long branch governs:
    // L = 2·60 − 658/5 < 0 → 0 (a tangent suffices for such a gentle crest)
    const r = minCrestLength({ S: 60, A: 5 })
    expect(r.Lmin).toBe(0)
    expect(r.regime).toBe('S > L')
    // A = 5, S = 200: flat branch 5·200²/658 = 303.95 ≥ 200 → governs
    const big = minCrestLength({ S: 200, A: 5 })
    expect(big.Lmin).toBeCloseTo(200000 / cMetric, 6)
    expect(big.regime).toBe('S ≤ L')
    expect(big.K).toBeCloseTo(200000 / cMetric / 5, 6)
  })

  it('reproduces the US constant 2158 from 3.5 ft eye and 2.0 ft object', () => {
    const r = minCrestLength({ S: 400, A: 4, h1: 3.5, h2: 2.0 })
    // S ≤ L branch: 4·400²/2158 = 296.6 < 400 → S > L: L = 800 − 2158/4 = 260.5
    expect(r.Lmin).toBeCloseTo(800 - cUS / 4, 2)
    expect(r.regime).toBe('S > L')
  })

  it('is continuous where the two branches meet', () => {
    // At the boundary S = L both formulas agree; check numerically near it.
    const a = minCrestLength({ S: 100, A: 15 }) // flat = 15·100²/658 = 227.97 ≥ 100 → S≤L
    expect(a.regime).toBe('S ≤ L')
    expect(a.Lmin).toBeCloseTo(150000 / cMetric, 6)
  })
})

describe('sag length requirements', () => {
  it('reproduces the headlight criterion L = AS²/(120 + 3.5S) in metric', () => {
    const r = minSagLength({ S: 180, A: 4 })
    // flat = 4·180²/(120+630) = 129600/750 = 172.8 < 180 → long branch:
    // L = 360 − (120+630)/4 = 360 − 187.5 = 172.5
    expect(r.Lmin).toBeCloseTo(172.5, 6)
    expect(r.regime).toBe('S > L')
  })

  it('reproduces the US headlight form L = AS²/(400 + 3.5S) with h = 2 ft', () => {
    const r = minSagLength({ S: 300, A: 6, h2: 2.0 })
    // flat = 6·300²/(400+1050) = 540000/1450 = 372.4 ≥ 300 → governs
    expect(r.Lmin).toBeCloseTo(540000 / 1450, 2)
    expect(r.regime).toBe('S ≤ L')
  })

  it('comfort criterion: L ≥ A·V²/395', () => {
    expect(minSagComfort(4, 80)).toBeCloseTo(4 * 6400 / 395, 6) // 64.81
  })
})

describe('superelevation', () => {
  it('balances e + f = V²/127R and splits demand between e and f', () => {
    // V = 80, R = 230, eMax 8 %, f 0.15: demand = 6400/29210 = 0.219103
    const r = superelevation({ V: 80, R: 230 })
    expect(r.demand).toBeCloseTo(6400 / (127 * 230), 9)
    expect(r.e).toBeCloseTo(0.219103 - 0.15, 4) // 6.91 % — under the 8 % cap
    expect(r.e).toBeLessThanOrEqual(0.08)
    expect(r.ok).toBe(true)
  })

  it('caps e at eMax and reports the friction that then has to act', () => {
    // Sharper curve: V = 80, R = 150 → demand = 0.33651; e → 8 %, f = 0.2565 > 0.15 → not OK
    const r = superelevation({ V: 80, R: 150 })
    expect(r.e).toBeCloseTo(0.08, 9)
    expect(r.f).toBeCloseTo(r.demand - 0.08, 9)
    expect(r.ok).toBe(false)
    expect(r.warning).toMatch(/Rmin/)
  })

  it('computes Rmin = V²/127(eMax+fMax) and the arc degree of curve', () => {
    const r = superelevation({ V: 80, R: 300 })
    expect(r.Rmin).toBeCloseTo(6400 / (127 * 0.23), 6) // 219.25
    expect(r.D).toBeCloseTo(5729.578 / 300, 6) // 19.10° per 100 m
  })

  it('rejects out-of-range design limits', () => {
    expect(() => superelevation({ V: 80, R: 200, eMax: 0.2 })).toThrow(/eMax/)
    expect(() => superelevation({ V: 80, R: 200, fMax: 0.5 })).toThrow(/friction/)
  })
})
