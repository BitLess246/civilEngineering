import { describe, expect, it } from 'vitest'
import { solveCurve } from './circularCurve'

const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol)

// Hand values for R = 400 m, Δ = 30°, PI = 3+000:
//   T = 400·tan15° = 107.17968   L = 400·π/6 = 209.43951
//   LC = 800·sin15° = 207.05524  M = 400(1−cos15°) = 13.62967
//   E = 400(sec15°−1) = 14.11047  D20 = (20/L)·30 = 2.86479°
//   D100ft = (30.48/L)·30 = 4.36594° (100 ft = 30.48 m of arc; ≡ 5729.578/R_ft)
//   PC = 2892.82032 · PT = 3102.25982
const CURVE = { R: 400, deltaDeg: 30, piStation: 3000, interval: 20 }

describe('solveCurve — classical elements', () => {
  const res = solveCurve(CURVE)
  const el = res.el

  it('T, L, LC, M, E all match the hand formulas', () => {
    near(el.T, 107.17968, 1e-4)
    near(el.L, 209.43951, 1e-4)
    near(el.LC, 207.05524, 1e-4)
    near(el.M, 13.62967, 1e-4)
    near(el.E, 14.11047, 1e-4)
  })
  it('degree of curve: 20 m arc → 2.86479°, 100 ft arc → 4.36594°', () => {
    near(el.D20, 2.86479, 1e-4)
    near(el.D100ft, (30.48 / 209.43951) * 30, 1e-4)
    near(el.D100ft, 4.36594, 1e-4)
  })
  it('stations: PC = PI − T, PT = PC + L', () => {
    near(el.pc, 2892.82032, 1e-4)
    near(el.pi, 3000)
    near(el.pt, 3102.25982, 1e-4)
  })
})

describe('solveCurve — deflection staking table', () => {
  const res = solveCurve(CURVE)

  it('starts at the PC with a zero row and walks half-station chords', () => {
    expect(res.stakes[0].station).toBeCloseTo(2892.82032, 4)
    near(res.stakes[0].chord, 0)
    expect(res.stakes[1].station).toBe(2900)
    near(res.firstSub, 7.17968, 1e-4)
    near(res.lastSub, 2.25982, 1e-4)
  })
  it('chord from PC: c = 2R·sin(arc/2R)', () => {
    const s1 = res.stakes[1]
    near(s1.arcFromPc, 7.17968, 1e-4)
    near(s1.chord, 800 * Math.sin(res.firstSub / 800), 1e-9)
  })
  it('total deflection hits Δ/2 = 15° at the PT, 7.5° at mid-curve', () => {
    const last = res.stakes[res.stakes.length - 1]
    near(last.totDef, 15, 1e-6)
    near(last.chord, res.el.LC, 1e-6)
    // deflection is proportional to arc: totDef = arc/(2R) for every stake
    for (const s of res.stakes) {
      near(s.totDef, (s.arcFromPc / (2 * res.el.R)) * (180 / Math.PI), 1e-9)
    }
  })
  it('incremental deflections sum station by station', () => {
    let tot = 0
    for (const s of res.stakes) {
      tot += s.incDef
      near(s.totDef, tot, 1e-9)
    }
  })
})

describe('solveCurve — rejections', () => {
  it('refuses Δ ≥ 180° and non-positive radius', () => {
    expect(() => solveCurve({ R: 400, deltaDeg: 180 })).toThrow(/between/)
    expect(() => solveCurve({ R: 0, deltaDeg: 30 })).toThrow(/Radius/)
  })
  it('refuses a PC before station zero', () => {
    expect(() => solveCurve({ R: 400, deltaDeg: 30, piStation: 50 })).toThrow(/PI/)
  })
})
