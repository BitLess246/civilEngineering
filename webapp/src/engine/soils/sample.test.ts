import { describe, it, expect } from 'vitest'
import { sampleInvestigation } from './sample'
import { validateInvestigation } from './validate'
import { classifySample } from './classifySample'
import { evaluateTest } from './lab'
import { buildSoilsReport } from './report'

// ─────────────────────────────────────────────────────────────────────────
// The example investigation is what every new visitor sees first, so it is
// load-bearing: if it does not demonstrate the module, the module looks
// broken. These pin the three things that make it a demonstration rather
// than a skeleton — it validates clean, its laboratory data agrees with the
// geology it was logged as, and it exercises BOTH report paths (results
// tabulated, and one test left out and accounted for).
// ─────────────────────────────────────────────────────────────────────────

const inv = () => sampleInvestigation()

describe('the example investigation is clean', () => {
  it('validates with zero errors and zero warnings', () => {
    // The guard the module has kept since Phase 0: a fixture that trips its own
    // validator teaches every reader to ignore the validator.
    expect(validateInvestigation(inv())).toEqual([])
  })

  it('every sieve stack closes its mass balance', () => {
    // D6913 wants closure within 1%. An example that shows the engine's
    // "re-weigh before using this grading" warning on every sample teaches the
    // reader that the warning is background noise.
    const sieves = inv().boreholes
      .flatMap((b) => b.samples)
      .flatMap((s) => s.tests.filter((t) => t.type === 'sieve'))
    expect(sieves.length).toBeGreaterThan(3)
    for (const t of sieves) {
      const { outcome } = evaluateTest(t)
      if (outcome?.kind !== 'sieve') throw new Error(`${t.id} produced no gradation`)
      expect(Math.abs(outcome.result.massError), t.id).toBeLessThanOrEqual(1)
    }
  })
})

describe('its laboratory data agrees with its geology', () => {
  const samples = () => inv().boreholes.flatMap((b) =>
    b.samples.map((s) => ({ b, s, layer: b.layers.find((l) => l.id === s.layerId)! })))

  it('every sample classifies, and the symbol matches the name it was logged under', () => {
    const got = samples().map(({ s, layer }) => [layer.name, classifySample(s).uscs?.symbol])
    expect(got).toEqual([
      ['Silty Sand', 'SM'],
      ['Lean Clay', 'CL'],
      ['Poorly Graded Sand', 'SP'],
      ['Lean Clay', 'CL'],
    ])
  })

  it('a layer carries a group symbol only where a sample speaks for it', () => {
    const layers = inv().boreholes.flatMap((b) => b.layers)
    const sampled = new Set(inv().boreholes.flatMap((b) => b.samples.map((s) => s.layerId)))
    for (const l of layers) {
      // Fill and BH-02's sand were never tested; leaving them unclassified is
      // the honest record, and it keeps a real gap in the example.
      expect(Boolean(l.symbol), l.name).toBe(sampled.has(l.id))
    }
  })

  it('shows all three classification systems disagreeing on one sample, as they should', () => {
    // BH-01 S-02 is the only sample carrying a hydrometer, and it is there so
    // the example can show what each system actually answers: USCS names the
    // soil, AASHTO rates it under a pavement, USDA names its grains by size.
    const c = classifySample(inv().boreholes[0].samples[1])
    expect(c.uscs!.symbol).toBe('CL')
    expect(c.aashto!.group).toBe('A-7-6')
    expect(c.usda!.texture).toBe('clay loam')
    // 34% finer than 0.002 mm against 75% finer than the No. 200 sieve — the
    // gap between "fines" and "clay" that makes the hydrometer necessary.
    expect(c.usda!.composition.clay).toBeCloseTo(33.6, 0)
    expect(c.gradation!.fines).toBeCloseTo(75, 6)
  })

  it('joins the two curves into one grading, and §9 plots it', () => {
    const c = classifySample(inv().boreholes[0].samples[1])
    expect(c.curve!.combined).toBe(true)
    // The sieve stopped at 75% passing; the sedimentation run carries the same
    // curve down past the clay boundary.
    expect(c.gradation!.rows[c.gradation!.rows.length - 1].size).toBe(0.075)
    expect(c.curve!.points[c.curve!.points.length - 1].size).toBeLessThan(0.002)
    expect(c.curve!.clay).toBeCloseTo(33.6, 0)
    expect(c.curve!.silt).toBeCloseTo(c.gradation!.fines - c.curve!.clay!, 6)

    const s9 = buildSoilsReport(inv()).sections.find((s) => s.no === 9)!
    expect(s9.figures.map((f) => f.caption)).toEqual([
      'Combined grading, sieve + sedimentation — BH-01, S-02',
    ])
  })

  it('the samples without a hydrometer get the two engineering systems and a reason for the third', () => {
    const without = inv().boreholes.flatMap((b) => b.samples).filter((s) => s.id !== 'bh1-s2')
    for (const s of without) {
      const c = classifySample(s)
      expect(c.uscs!.symbol, s.name).toBeTruthy()
      expect(c.aashto!.group, s.name).toBeTruthy()
      expect(c.usda, s.name).toBeUndefined()
      expect(c.usdaGap, s.name).toMatch(/0\.002 mm/)
    }
  })

  it('the consolidation curve is lightly overconsolidated, as planted', () => {
    const t = inv().boreholes[0].samples[1].tests.find((x) => x.type === 'consolidation')!
    const { outcome } = evaluateTest(t)
    expect(outcome?.kind).toBe('consolidation')
    if (outcome?.kind !== 'consolidation') return
    // Cc against Terzaghi's 0.009(LL − 10) = 0.315 for this sample's LL of 45
    expect(outcome.result.cc).toBeGreaterThan(0.25)
    expect(outcome.result.cc).toBeLessThan(0.40)
    expect(outcome.result.cr).toBeLessThan(outcome.result.cc / 4)
    // σ′p above the ~85 kPa effective overburden at 5 m, but not by much
    expect(outcome.result.preconsolidationPressure).toBeGreaterThan(90)
    expect(outcome.result.preconsolidationPressure).toBeLessThan(200)
  })
})

describe('it exercises both halves of the report', () => {
  const lab = () => buildSoilsReport(inv()).sections.find((s) => s.no === 8)!

  it('tabulates the tests that produced a result, with their plots', () => {
    const s = lab()
    expect(s.tables[0].rows.length).toBeGreaterThan(10)
    expect(s.figures.length).toBeGreaterThan(3)
  })

  it('leaves exactly one booked test out, and says so', () => {
    // The planned triaxial is deliberately unrun: without it the example would
    // never show what an incomplete programme looks like.
    const s = lab()
    expect(s.status).toBe('partial')
    expect(s.gap).toMatch(/1 of 15 booked tests produced no result/)
    expect(s.gap).toMatch(/1 not yet run/)
  })
})
