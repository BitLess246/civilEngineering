import { describe, it, expect } from 'vitest'
import {
  hydrometer, stokesDiameter, gravityFactor, waterViscosity, effectiveDepth, H152,
  type HydrometerData,
} from './hydrometer'
import { hydrometerChart } from './plots'
import { evaluateTest, summarise, readHydrometer, labSpec, isImplemented } from './index'
import type { LabTest } from '../model'

// ─────────────────────────────────────────────────────────────────────────
// ASTM D7928. Two independent halves, tested separately because they fail
// separately: Stokes' law sets the x-axis (diameter) and the corrected reading
// sets the y-axis (percent finer). A composite correction read as zero moves
// the whole curve down the page without changing a single diameter.
// ─────────────────────────────────────────────────────────────────────────

const base = {
  dryMass: 50,
  specificGravity: 2.7,
  compositeCorrection: 6,
  meniscusCorrection: 1,
}

describe('water viscosity', () => {
  it('is 0.01002 poise at 20 °C, the value the K tables are built on', () => {
    expect(waterViscosity(20)).toBeCloseTo(0.01002, 5)
  })

  it('falls as water warms — and it is why a drifting bath matters', () => {
    expect(waterViscosity(10)).toBeGreaterThan(waterViscosity(20))
    expect(waterViscosity(30)).toBeLessThan(waterViscosity(20))
    // ~25% across the range a laboratory drifts over
    expect(waterViscosity(10) / waterViscosity(30)).toBeGreaterThan(1.5)
  })

  it('refuses a temperature at or below freezing', () => {
    expect(() => waterViscosity(0)).toThrow(/above 0/)
  })
})

describe("Stokes' law sets the diameter", () => {
  it('agrees with the published K for Gs 2.65 at 20 °C to within the table rounding', () => {
    // D = K·√(L/t); the tables print K = 0.01344 at 20 °C, Gs 2.65. Computing
    // it from μ and the constants gives 0.01366 — a 1.6% difference in D, which
    // is a sixtieth of a decade on a log axis and well inside what the method
    // resolves. Asserted so the gap is a known quantity rather than a surprise.
    const K = stokesDiameter(1, 1, 2.65, 20)          // L = 1 cm, t = 1 min ⇒ D = K
    expect(K).toBeCloseTo(0.01366, 4)
    expect(Math.abs(K - 0.01344) / 0.01344).toBeLessThan(0.02)
  })

  it('scales as √(L/t) exactly', () => {
    const d1 = stokesDiameter(10, 4, 2.7, 20)
    expect(stokesDiameter(40, 4, 2.7, 20)).toBeCloseTo(d1 * 2, 12)     // 4× depth
    expect(stokesDiameter(10, 16, 2.7, 20)).toBeCloseTo(d1 / 2, 12)    // 4× time
  })

  it('gives smaller grains at longer times, always', () => {
    let prev = Infinity
    for (const t of [1, 2, 5, 15, 30, 60, 250, 1440]) {
      const d = stokesDiameter(12, t, 2.7, 20)
      expect(d).toBeLessThan(prev)
      prev = d
    }
    // and the 24-hour reading is in the clay range
    expect(stokesDiameter(12, 1440, 2.7, 20)).toBeLessThan(0.002)
  })

  it('refuses a zero time or a bulb above the suspension', () => {
    expect(() => stokesDiameter(10, 0, 2.7, 20)).toThrow(/time/)
    expect(() => stokesDiameter(0, 10, 2.7, 20)).toThrow(/effective depth/)
  })
})

describe('the reading sets the percent finer', () => {
  it('the specific-gravity factor is unity at Gs = 2.65', () => {
    expect(gravityFactor(2.65)).toBeCloseTo(1, 10)
    expect(gravityFactor(2.7)).toBeCloseTo((1.65 * 2.7) / (1.7 * 2.65), 12)
    expect(gravityFactor(2.7)).toBeLessThan(1)
    expect(() => gravityFactor(1)).toThrow(/greater than 1/)
  })

  it('matches a hand calculation', () => {
    // R = 30, composite 6 ⇒ Rc = 24; a(2.7) = 0.9889012; Ms = 50
    // P = 0.9889012·24/50·100 = 47.4673%
    const r = hydrometer({
      ...base,
      readings: [
        { time: 2, reading: 30, temperature: 20 },
        { time: 60, reading: 20, temperature: 20 },
      ],
    })
    expect(r.gravityFactor).toBeCloseTo(0.9889012, 7)
    expect(r.rows[0].correctedReading).toBe(24)
    expect(r.rows[0].percentFinerOfSpecimen).toBeCloseTo(47.4673, 4)
    expect(r.rows[0].percentFiner).toBeCloseTo(47.4673, 4)   // no scaling
  })

  it('uses the MENISCUS-corrected reading for the depth and the raw one for the mass', () => {
    // L = 16.3 − 0.1641·(30+1) = 11.213 cm
    const r = hydrometer({ ...base, readings: [
      { time: 2, reading: 30, temperature: 20 },
      { time: 60, reading: 20, temperature: 20 },
    ] })
    expect(r.rows[0].effectiveDepth).toBeCloseTo(H152.intercept - H152.slope * 31, 10)
    expect(effectiveDepth(31)).toBeCloseTo(11.2129, 4)
    // the composite correction never touches the depth
    expect(r.rows[0].effectiveDepth).not.toBeCloseTo(effectiveDepth(24), 3)
  })

  it('scales onto the whole sample when the suspension was only the fines', () => {
    const whole = hydrometer({ ...base, readings: [
      { time: 2, reading: 30, temperature: 20 }, { time: 60, reading: 20, temperature: 20 },
    ] })
    const fines = hydrometer({ ...base, fractionOfTotal: 40, readings: [
      { time: 2, reading: 30, temperature: 20 }, { time: 60, reading: 20, temperature: 20 },
    ] })
    expect(fines.rows[0].percentFinerOfSpecimen).toBeCloseTo(whole.rows[0].percentFinerOfSpecimen, 10)
    expect(fines.rows[0].percentFiner).toBeCloseTo(whole.rows[0].percentFiner * 0.4, 10)
    expect(fines.notes.join(' ')).toMatch(/same basis as the sieve curve/)
  })

  it('refuses a fraction outside 0–100%', () => {
    expect(() => hydrometer({ ...base, fractionOfTotal: 140, readings: [
      { time: 2, reading: 30, temperature: 20 }, { time: 60, reading: 20, temperature: 20 },
    ] })).toThrow(/between 0 and 100/)
  })
})

describe('what the curve refuses to hide', () => {
  const run = (d: Partial<HydrometerData>) => hydrometer({
    ...base,
    readings: [
      { time: 2, reading: 30, temperature: 20 },
      { time: 15, reading: 24, temperature: 20 },
      { time: 60, reading: 18, temperature: 20 },
      { time: 1440, reading: 12, temperature: 20 },
    ],
    ...d,
  })

  it('flags a reading that is all correction and no soil', () => {
    const r = run({ compositeCorrection: 14 })
    expect(r.notes.join(' ')).toMatch(/at or below the composite correction/)
  })

  it('flags more soil in suspension than was put in', () => {
    const r = run({ dryMass: 10 })
    expect(r.notes.join(' ')).toMatch(/more soil than was put in the cylinder/)
  })

  it('flags a curve that climbs, which sedimentation cannot do', () => {
    const r = hydrometer({ ...base, readings: [
      { time: 2, reading: 20, temperature: 20 },
      { time: 60, reading: 30, temperature: 20 },     // more in suspension, later
    ] })
    expect(r.notes.join(' ')).toMatch(/cannot climb/)
  })

  it('flags a bath that drifted', () => {
    const r = hydrometer({ ...base, readings: [
      { time: 2, reading: 30, temperature: 19 },
      { time: 1440, reading: 12, temperature: 26 },
    ] })
    expect(r.notes.join(' ')).toMatch(/moved 7\.0 °C/)
  })

  it('always says the diameters are equivalent, not measured', () => {
    expect(run({}).notes.join(' ')).toMatch(/EQUIVALENT SPHERICAL diameter/)
  })

  it('needs two readings to be a curve at all', () => {
    expect(() => hydrometer({ ...base, readings: [{ time: 2, reading: 30, temperature: 20 }] }))
      .toThrow(/at least two readings/)
  })
})

describe('the numbers the rest of the module wants', () => {
  const r = hydrometer({
    ...base,
    readings: [
      { time: 2, reading: 36, temperature: 20 },
      { time: 15, reading: 30, temperature: 20 },
      { time: 60, reading: 24, temperature: 20 },
      { time: 250, reading: 18, temperature: 20 },
      { time: 1440, reading: 13, temperature: 20 },
    ],
  })

  it('interpolates D50 on the LOG axis, inside the sizes measured', () => {
    expect(r.d50).toBeDefined()
    const sizes = r.rows.map((x) => x.diameter)
    expect(r.d50!).toBeLessThan(Math.max(...sizes))
    expect(r.d50!).toBeGreaterThan(Math.min(...sizes))
    // 50% finer must sit between the two readings that straddle it
    const above = r.rows.filter((x) => x.percentFiner >= 50).map((x) => x.diameter)
    expect(r.d50!).toBeLessThanOrEqual(Math.max(...above) + 1e-9)
  })

  it('reports the clay fraction at 0.002 mm, and declines it out of range', () => {
    expect(r.clayFraction).toBeGreaterThan(0)
    expect(r.clayFraction).toBeLessThan(100)
    // a run stopped at an hour never reaches 2 μm
    const short = hydrometer({ ...base, readings: [
      { time: 1, reading: 36, temperature: 20 }, { time: 2, reading: 34, temperature: 20 },
    ] })
    expect(short.clayFraction).toBeUndefined()
  })
})

// ── Plumbing ──────────────────────────────────────────────────────────────

const labTest = (data: Record<string, unknown>): LabTest =>
  ({ id: 'h1', type: 'hydrometer', standard: 'd7928', status: 'complete', data })

describe('hydrometer through the lab registry', () => {
  const data = {
    ...base,
    readings: [
      { time: 2, reading: 36, temperature: 20 },
      { time: 60, reading: 24, temperature: 20 },
      { time: 1440, reading: 13, temperature: 20 },
    ],
  }

  it('is implemented, with the corrections as REQUIRED fields', () => {
    expect(isImplemented('hydrometer')).toBe(true)
    expect(labSpec('hydrometer')?.formKind).toBe('hydrometer-readings')
    const required = labSpec('hydrometer')!.fields.filter((f) => !f.optional).map((f) => f.key)
    expect(required).toContain('compositeCorrection')
    expect(required).toContain('meniscusCorrection')
  })

  it('refuses a blob missing a correction rather than assuming zero', () => {
    const { compositeCorrection: _c, ...noComposite } = data
    expect(readHydrometer(labTest(noComposite))).toBeUndefined()
    expect(readHydrometer(labTest(data))).toBeDefined()
  })

  it('drops a reading missing its temperature', () => {
    const d = readHydrometer(labTest({
      ...data, readings: [...data.readings, { time: 5, reading: 30 }],
    }))
    expect(d?.readings.length).toBe(3)
  })

  it('summarises by the clay fraction', () => {
    const { outcome } = evaluateTest(labTest(data))
    expect(outcome?.kind).toBe('hydrometer')
    const s = summarise(outcome!)
    expect(s.label).toBe('clay (< 2 μm)')
    expect(s.unit).toBe('%')
    expect(s.value).toBeGreaterThan(0)
  })

  it('surfaces an impossible test as an error, not a crash', () => {
    const { outcome, error } = evaluateTest(labTest({ ...data, dryMass: 0, specificGravity: 2.7 }))
    expect(outcome).toBeUndefined()
    expect(error).toMatch(/dry mass/i)
  })
})

// ── The chart ─────────────────────────────────────────────────────────────

describe('the hydrometer chart', () => {
  const r = hydrometer({
    ...base,
    readings: [
      { time: 2, reading: 36, temperature: 20 },
      { time: 15, reading: 30, temperature: 20 },
      { time: 60, reading: 24, temperature: 20 },
      { time: 250, reading: 18, temperature: 20 },
      { time: 1440, reading: 13, temperature: 20 },
    ],
  })
  const d = hydrometerChart(r)
  const text = d.primitives.filter((p) => p.kind === 'text').map((p) => p.text).join(' | ')

  it('draws nothing outside its frame', () => {
    for (const p of d.primitives) {
      const xs = p.kind === 'line' ? [p.x1, p.x2] : p.kind === 'circle' ? [p.cx] : p.kind === 'rect' ? [p.x, p.x + p.w] : []
      for (const x of xs) {
        expect(x).toBeGreaterThanOrEqual(18 - 1e-6)
        expect(x).toBeLessThanOrEqual(18 + 96 + 1e-6)
      }
    }
  })

  it('runs coarse to fine, the way a grading curve is read', () => {
    // the sieve curve's convention, so the two halves read as one distribution
    const marks = d.primitives.filter((p) => p.kind === 'circle')
    const sorted = [...r.rows].sort((a, b) => b.diameter - a.diameter)
    expect(marks[0].cx).toBeLessThan(marks[marks.length - 1].cx)
    expect(sorted[0].diameter).toBeGreaterThan(sorted[sorted.length - 1].diameter)
  })

  it('keeps a boundary label inside the frame when its line is at the edge', () => {
    // 0.075 mm lands at the left edge for a run that starts finer than it, and
    // a centred label there hangs over the y-axis.
    const texts = d.primitives.filter((p) => p.kind === 'text')
    const sand = texts.find((p) => p.text === 'sand | fines')!
    expect(sand.x).toBeGreaterThanOrEqual(18 - 1e-6)
    expect(sand.anchor === 'start' || sand.anchor === 'middle').toBe(true)
    if (sand.anchor === 'start') expect(sand.x).toBeGreaterThan(18)
  })

  it('marks the clay boundary and prints the fraction', () => {
    expect(text).toMatch(/silt \| clay/)
    expect(text).toMatch(/clay \(< 2 μm\) = \d+\.\d%/)
    expect(text).toMatch(/D50 = 0\.\d+ mm/)
  })
})
