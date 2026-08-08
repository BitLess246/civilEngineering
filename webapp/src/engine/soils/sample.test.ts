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
    expect(s.gap).toMatch(/1 of 14 booked tests produced no result/)
    expect(s.gap).toMatch(/1 not yet run/)
  })
})
