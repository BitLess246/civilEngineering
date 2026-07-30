import { describe, it, expect } from 'vitest'
import {
  atterberg, aLine, uLine, chartPosition, liquidLimitFromFlow, consistencyFromLI,
} from './atterberg'

describe('Casagrande chart lines (ASTM D2487 Fig. 3)', () => {
  it('A-line passes through the published anchor points', () => {
    // PI = 0.73(LL − 20): zero at LL = 20, and 29.2 at LL = 60.
    expect(aLine(20)).toBeCloseTo(0, 10)
    expect(aLine(60)).toBeCloseTo(29.2, 10)
    expect(aLine(50)).toBeCloseTo(21.9, 10)
  })

  it('U-line passes through its anchor points and sits above the A-line', () => {
    expect(uLine(8)).toBeCloseTo(0, 10)
    expect(uLine(50)).toBeCloseTo(37.8, 10)
    for (const LL of [20, 40, 60, 80, 100]) expect(uLine(LL)).toBeGreaterThan(aLine(LL))
  })

  it('treats a point ON the A-line as clay, per D2487', () => {
    const on = chartPosition(50, aLine(50))
    expect(on.aboveALine).toBe(true)
  })

  it('flags a point above the U-line as physically implausible', () => {
    expect(chartPosition(40, uLine(40) + 1).aboveULine).toBe(true)
    expect(chartPosition(40, uLine(40) - 1).aboveULine).toBe(false)
  })

  it('splits high and low plasticity at LL = 50', () => {
    expect(chartPosition(49.9, 20).highPlasticity).toBe(false)
    expect(chartPosition(50, 20).highPlasticity).toBe(true)
  })
})

describe('atterberg — the worked case from the spec', () => {
  it('LL 48, PL 25 gives PI 23 and plots as a clay', () => {
    const r = atterberg({ liquidLimit: 48, plasticLimit: 25 })
    expect(r.plasticityIndex).toBeCloseTo(23, 10)
    expect(r.nonPlastic).toBe(false)
    expect(r.chart.aboveALine).toBe(true)       // A-line at LL 48 is 20.4
    expect(r.chart.highPlasticity).toBe(false)  // LL < 50 ⇒ the L suffix
  })

  it('LL 42, PL 23 gives PI 19', () => {
    const r = atterberg({ liquidLimit: 42, plasticLimit: 23 })
    expect(r.plasticityIndex).toBeCloseTo(19, 10)
  })
})

describe('non-plastic is not PI = 0', () => {
  it('marks a soil with no obtainable plastic limit as non-plastic', () => {
    const r = atterberg({ liquidLimit: 22, nonPlastic: true })
    expect(r.nonPlastic).toBe(true)
    expect(r.notes.join(' ')).toMatch(/not the same as PI = 0/)
  })

  it('treats a missing plastic limit as non-plastic rather than assuming zero', () => {
    expect(atterberg({ liquidLimit: 22 }).nonPlastic).toBe(true)
  })

  it('gives no liquidity index for a non-plastic soil', () => {
    // LI = (w − PL)/PI would divide by zero; reporting a number would be worse.
    const r = atterberg({ liquidLimit: 22, nonPlastic: true, naturalMoisture: 18 })
    expect(r.liquidityIndex).toBeUndefined()
  })
})

describe('liquidity index', () => {
  it('computes (w − PL)/PI', () => {
    const r = atterberg({ liquidLimit: 48, plasticLimit: 25, naturalMoisture: 36.5 })
    expect(r.liquidityIndex).toBeCloseTo(0.5, 10)
  })

  it('warns when the soil is at or above its liquid limit', () => {
    const r = atterberg({ liquidLimit: 42, plasticLimit: 23, naturalMoisture: 50 })
    expect(r.liquidityIndex!).toBeGreaterThan(1)
    expect(r.notes.join(' ')).toMatch(/sensitive or quick/)
  })

  it('warns when the soil is drier than its plastic limit', () => {
    const r = atterberg({ liquidLimit: 42, plasticLimit: 23, naturalMoisture: 15 })
    expect(r.liquidityIndex!).toBeLessThan(0)
    expect(r.notes.join(' ')).toMatch(/desiccated|overconsolidated/)
  })

  it('maps LI onto a consistency description', () => {
    expect(consistencyFromLI(1.2)).toMatch(/liquid/)
    expect(consistencyFromLI(0.6)).toBe('firm')
    expect(consistencyFromLI(-0.2)).toMatch(/hard/)
  })
})

describe('liquid limit from a multipoint flow curve (D4318 Method A)', () => {
  it('reads LL at 25 blows off a straight-line fit', () => {
    // Constructed so the fit is exact: w = 50 − 10·log₁₀(N/25).
    const pts = [15, 25, 35].map((blows) => ({
      blows, moisture: 50 - 10 * Math.log10(blows / 25),
    }))
    const { liquidLimit, flowIndex } = liquidLimitFromFlow(pts)
    expect(liquidLimit).toBeCloseTo(50, 6)
    expect(flowIndex).toBeCloseTo(10, 6)
  })

  it('recovers the point value when a trial lands exactly on 25 blows', () => {
    const pts = [
      { blows: 20, moisture: 51.0 },
      { blows: 25, moisture: 50.0 },
      { blows: 31, moisture: 49.1 },
    ]
    expect(liquidLimitFromFlow(pts).liquidLimit).toBeCloseTo(50, 1)
  })

  it('warns when 25 blows is extrapolated rather than bracketed', () => {
    const r = atterberg({
      flowPoints: [{ blows: 30, moisture: 48 }, { blows: 38, moisture: 46 }],
      plasticLimit: 22,
    })
    expect(r.notes.join(' ')).toMatch(/extrapolated/)
  })

  it('warns when a trial falls outside the 15–40 blow range D4318 asks for', () => {
    const r = atterberg({
      flowPoints: [{ blows: 12, moisture: 52 }, { blows: 25, moisture: 50 }, { blows: 44, moisture: 47 }],
      plasticLimit: 22,
    })
    expect(r.notes.join(' ')).toMatch(/15 and 40/)
  })

  it('refuses a flow curve with fewer than two usable trials', () => {
    expect(() => liquidLimitFromFlow([{ blows: 25, moisture: 50 }])).toThrow(/at least two/)
    expect(() => liquidLimitFromFlow([])).toThrow(/at least two/)
  })

  it('falls back to the mean when every trial is at the same blow count', () => {
    // No slope is defined; the mean is the best available estimate, and a
    // divide-by-zero producing NaN would be far worse.
    const { liquidLimit, flowIndex } = liquidLimitFromFlow([
      { blows: 25, moisture: 50 }, { blows: 25, moisture: 52 },
    ])
    expect(liquidLimit).toBeCloseTo(51, 10)
    expect(flowIndex).toBe(0)
    expect(Number.isFinite(liquidLimit)).toBe(true)
  })
})

describe('bad data is reported, not silently absorbed', () => {
  it('clamps a negative PI to zero AND says why', () => {
    const r = atterberg({ liquidLimit: 35, plasticLimit: 40 })
    expect(r.plasticityIndex).toBe(0)
    expect(r.notes.join(' ')).toMatch(/plastic limit exceeds the liquid limit/i)
  })

  it('flags a point above the U-line', () => {
    const r = atterberg({ liquidLimit: 30, plasticLimit: 2 })   // PI 28 vs U-line 19.8
    expect(r.chart.aboveULine).toBe(true)
    expect(r.notes.join(' ')).toMatch(/above the U-line/)
  })

  it('refuses to run with neither a liquid limit nor a flow curve', () => {
    expect(() => atterberg({ plasticLimit: 20 })).toThrow(/either a liquid limit or the flow-curve/)
  })
})
