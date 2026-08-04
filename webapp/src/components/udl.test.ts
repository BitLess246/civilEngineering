// The prestressed-beam elevation drew its uniformly distributed load from a
// hand-typed list of fractions that was neither uniform nor symmetric. These
// tests are the reason it cannot come back: they state, as arithmetic, what
// "uniformly distributed" means for a drawing.

import { describe, it, expect } from 'vitest'
import { udlStations } from './udl'

const gaps = (t: number[]) => t.slice(1).map((v, i) => v - t[i])

describe('udlStations', () => {
  it.each([60, 120, 248, 400, 1000])('spans the whole loaded length at %i px', (len) => {
    const t = udlStations(len)
    // An arrow at each end. The old list started 8% in and stopped 4% short,
    // so the load looked like it missed the supports — and missed them by
    // different amounts at each end.
    expect(t[0]).toBe(0)
    expect(t[t.length - 1]).toBe(1)
  })

  it.each([60, 120, 248, 400, 1000])('is evenly spaced at %i px', (len) => {
    const g = gaps(udlStations(len))
    for (const x of g) expect(x).toBeCloseTo(g[0], 12)
  })

  it.each([60, 120, 248, 400, 1000])('is symmetric about mid-span at %i px', (len) => {
    const t = udlStations(len)
    for (let i = 0; i < t.length; i++) {
      expect(t[i]).toBeCloseTo(1 - t[t.length - 1 - i], 12)
    }
  })

  it('adds arrows as the span grows', () => {
    expect(udlStations(1000).length).toBeGreaterThan(udlStations(200).length)
  })

  it('never drops below three arrows, however short the span', () => {
    // Two arrows read as a pair of point loads, not as a distributed one.
    for (const len of [0, 1, 10, 25, 26]) {
      expect(udlStations(len).length).toBeGreaterThanOrEqual(4)
    }
  })

  it('keeps the arrows from becoming a comb on a long span', () => {
    const len = 1000
    const t = udlStations(len)
    const spacingPx = (t[1] - t[0]) * len
    expect(spacingPx).toBeGreaterThanOrEqual(26 - 1e-9)
  })

  it('honours a custom minimum spacing', () => {
    expect(udlStations(240, 60).length).toBe(5)   // 4 gaps of 60
    expect(udlStations(240, 20).length).toBe(13)  // 12 gaps of 20
  })

  it('rejects nothing — a degenerate length still yields a drawable set', () => {
    for (const len of [NaN, -5, Infinity]) {
      const t = udlStations(len)
      expect(t.length).toBeGreaterThanOrEqual(4)
      expect(t.every((v) => Number.isFinite(v))).toBe(true)
    }
  })
})
