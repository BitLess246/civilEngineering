import { describe, it, expect } from 'vitest'
import {
  forecastPopulation, demands, kuichlingFireFlow, storage,
} from './waterDemand'

describe('population forecasting', () => {
  it('arithmetic growth adds the constant increment', () => {
    // P0 = 100 k after 80 k ten years ago → 2 000/yr → 140 k in 20 years.
    const r = forecastPopulation({ P0: 100000, P1: 80000, censusYears: 10, years: 20, method: 'arithmetic' })
    expect(r.Pn).toBeCloseTo(140000, 4)
    expect(r.perYear).toBeCloseTo(2000, 6)
  })

  it('geometric growth compounds', () => {
    const r = forecastPopulation({ P0: 100000, growthPct: 2, years: 20, method: 'geometric' })
    expect(r.Pn).toBeCloseTo(148594.7, 1)
  })

  it('incremental increase adds the quadratic term', () => {
    // Pn = P0 + n·a + n(n+1)/2·b = 100k + 40k + 210·100
    const r = forecastPopulation({ P0: 100000, a: 2000, b: 100, years: 20, method: 'incremental' })
    expect(r.Pn).toBeCloseTo(161000, 4)
  })

  it('decreasing rate subtracts it', () => {
    const r = forecastPopulation({ P0: 100000, a: 2000, b: 100, years: 20, method: 'decreasing' })
    expect(r.Pn).toBeCloseTo(119000, 4)
  })

  it('validates its inputs', () => {
    expect(() => forecastPopulation({ P0: 0, years: 10, method: 'geometric' })).toThrow()
    expect(() => forecastPopulation({ P0: 1000, years: 0, method: 'geometric' })).toThrow()
    expect(() => forecastPopulation({ P0: 1000, years: 10, method: 'arithmetic' })).toThrow()
  })
})

describe('the demand ladder', () => {
  // 140 k people at 120 LPCD: ADD 16 800, MDD ×1.3 = 21 840, PHD ×2.5 = 42 000 m³/d.
  const d = demands(140000, { lpcd: 120 })
  it('carries the factors through', () => {
    expect(d.ADD).toBeCloseTo(16800, 6)
    expect(d.MDD).toBeCloseTo(21840, 6)
    expect(d.PHD).toBeCloseTo(42000, 6)
  })
  it('converts to L/s through ÷86.4', () => {
    expect(d.ADD_lps).toBeCloseTo(194.444, 2)
    expect(d.PHD_lps).toBeCloseTo(486.111, 2)
  })
  it('requires the peak-hour factor above the max-day one', () => {
    expect(() => demands(1000, { lpcd: 120, maxDayFactor: 1.5, peakHourFactor: 1.2 })).toThrow()
  })
})

describe('Kuichling fire demand', () => {
  it('gives 3182·√P L/min', () => {
    const f = kuichlingFireFlow(140000)
    // √140 = 11.83216 → 37 649.9 L/min = 627.50 L/s
    expect(f.lpm).toBeCloseTo(37649.9, 0)
    expect(f.lps).toBeCloseTo(627.5, 1)
  })
  it('scales with the square root', () => {
    expect(kuichlingFireFlow(40000).lpm).toBeCloseTo(kuichlingFireFlow(10000).lpm * 2, 4)
  })
})

describe('the storage breakdown', () => {
  it('assembles operating + fire + emergency', () => {
    const s = storage({ MDD: 21840, fireLps: 627.5, fireHours: 3 })
    expect(s.operating).toBeCloseTo(5460, 4)
    expect(s.fire).toBeCloseTo(627.5 * 3.6 * 3, 3)
    expect(s.emergency).toBeCloseTo(5460, 4)
    expect(s.total).toBeCloseTo(5460 + 627.5 * 3.6 * 3 + 5460, 3)
  })
  it('defaults to three hours and quarter shares', () => {
    const s = storage({ MDD: 1000, fireLps: 100 })
    expect(s.fireHours).toBe(3)
    expect(s.operating).toBe(250)
    expect(s.emergency).toBe(250)
  })
})
