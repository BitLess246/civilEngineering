import { describe, expect, it } from 'vitest'
import { solveEarthwork, type EarthworkInput } from './earthwork'

const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol)

// Hand case — 20 m stations:
//   0+000: cut 0,  fill 10
//   0+020: cut 12, fill 0
//   0+040: cut 8,  fill 2
// Interval 1: cut (0+12)/2·20 = 120 · fill (10+0)/2·20 = 100 → net +20
// Interval 2: cut (12+8)/2·20 = 200 · fill (0+2)/2·20  = 20  → net +180
// Totals: cut 320, fill 120, balance +200. Mass ordinates: +20, +200.
const STRIP: EarthworkInput = {
  sections: [
    { station: 0, cut: 0, fill: 10 },
    { station: 20, cut: 12, fill: 0 },
    { station: 40, cut: 8, fill: 2 },
  ],
}

describe('solveEarthwork — average end area', () => {
  const res = solveEarthwork(STRIP)

  it('interval volumes match the hand arithmetic', () => {
    near(res.rows[0].cutVol, 120)
    near(res.rows[0].fillVol, 100)
    near(res.rows[0].net, 20)
    near(res.rows[1].cutVol, 200)
    near(res.rows[1].fillVol, 20)
    near(res.rows[1].net, 180)
  })
  it('totals and balance: 320 cut, 120 fill, +200 surplus', () => {
    near(res.totalCut, 320)
    near(res.totalFill, 120)
    near(res.balance, 200)
  })
  it('mass-haul ordinates accumulate the net', () => {
    near(res.rows[0].massOrdinate, 20)
    near(res.rows[1].massOrdinate, 200)
    near(res.maxOrdinate, 200)
    expect(res.maxOrdinateStation).toBe(40)
    near(res.minOrdinate, 0, 1e-12)
  })
})

describe('solveEarthwork — prismoidal check', () => {
  it('applies V = d/6 (A1 + 4Am + A2) and reports the correction', () => {
    // Interval 1 with middle cut area 4: prismoidal = 20/6·(0+16+12) = 93.3333
    const res = solveEarthwork({
      sections: [
        { station: 0, cut: 0, fill: 10, midCut: 4, midFill: 3 },
        { station: 20, cut: 12, fill: 0 },
      ],
    })
    near(res.rows[0].cutPrism!, (20 / 6) * (0 + 16 + 12), 1e-9)
    near(res.rows[0].cutVol, 120)
    near(res.rows[0].cutCorrection!, 120 - (20 / 6) * 28, 1e-9)
    // fill prismoid: 20/6·(10+12+0) = 36.6667 vs end-area 100
    near(res.rows[0].fillPrism!, (20 / 6) * (10 + 4 * 3 + 0), 1e-9)
    expect(res.rows[0].fillCorrection!).toBeGreaterThan(0)
  })
  it('a straight-sided prismoid (Am = average) gives zero correction', () => {
    const res = solveEarthwork({
      sections: [{ station: 0, cut: 6, fill: 0, midCut: 9 }, { station: 30, cut: 12, fill: 0 }],
    })
    near(res.rows[0].cutCorrection!, 0, 1e-9)
  })
})

describe('solveEarthwork — factors and haul', () => {
  it('shrinkage scales the cut before it hits the mass curve', () => {
    const res = solveEarthwork({ ...STRIP, cutFactor: 0.9 })
    near(res.rows[0].cutVol, 108)
    near(res.rows[0].massOrdinate, 8) // 108 − 100
    near(res.rows[1].massOrdinate, 168) // 8 + (180·0.9 − 20)
    near(res.balance, 320 * 0.9 - 120)
  })
  it('haul upper bound = Σ |ordinate| · distance', () => {
    const res = solveEarthwork(STRIP)
    near(res.totalHaulUpper, 20 * 20 + 200 * 20)
  })
})

describe('solveEarthwork — fill-dominant ground', () => {
  it('negative ordinates flag the borrow pit', () => {
    const res = solveEarthwork({
      sections: [
        { station: 0, cut: 2, fill: 20 },
        { station: 25, cut: 0, fill: 30 },
      ],
    })
    near(res.rows[0].net, 25 - 625)
    near(res.minOrdinate, -600)
    expect(res.balance).toBeLessThan(0)
  })
  it('needs two sections and positive spacing', () => {
    expect(() => solveEarthwork({ sections: [{ station: 0, cut: 1, fill: 0 }] })).toThrow(/two/)
    expect(() => solveEarthwork({
      sections: [{ station: 40, cut: 1, fill: 0 }, { station: 0, cut: 1, fill: 0 }],
      interval: 0,
    })).toThrow(/Interval/)
  })
})
