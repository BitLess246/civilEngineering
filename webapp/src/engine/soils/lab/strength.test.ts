import { describe, it, expect } from 'vitest'
import { directShear, fitEnvelope, strengthAt } from './directShear'
import { ucs, consistencyFromQu } from './ucs'
import { readDirectShear, readUcs, evaluateTest, summarise, isImplemented } from './index'
import type { LabTest } from '../model'

const asData = (o: unknown) => o as Record<string, unknown>
const test = (type: LabTest['type'], data?: unknown): LabTest => ({
  id: 't1', type, standard: 'd3080', status: 'complete', data: data == null ? undefined : asData(data),
})

// ── Failure envelope ──────────────────────────────────────────────────────

describe('fitEnvelope', () => {
  it('recovers a line placed exactly on c = 20, φ = 30°', () => {
    const tan30 = Math.tan(Math.PI / 6)
    const pts = [50, 100, 200].map((x) => ({ x, y: 20 + x * tan30 }))
    const e = fitEnvelope(pts)
    expect(e.cohesion).toBeCloseTo(20, 8)
    expect(e.frictionAngle).toBeCloseTo(30, 8)
    expect(e.r2).toBeCloseTo(1, 8)
    expect(e.refittedThroughOrigin).toBe(false)
  })

  it('REFITS through the origin when the free fit gives a negative intercept', () => {
    // Least squares through scattered points will happily report c′ = −4 kPa,
    // which would then be carried into a bearing calculation as real.
    const pts = [{ x: 50, y: 28 }, { x: 100, y: 60 }, { x: 200, y: 122 }]
    const free = { intercept: -4 }   // roughly what an unconstrained fit gives
    expect(free.intercept).toBeLessThan(0)

    const e = fitEnvelope(pts)
    expect(e.refittedThroughOrigin).toBe(true)
    expect(e.cohesion).toBe(0)
    expect(e.frictionAngle).toBeGreaterThan(25)
  })

  it('never reports a negative friction angle', () => {
    // Specimens getting weaker with confinement is a test problem, and atan
    // would quietly return a negative angle that reads as a real result.
    const e = fitEnvelope([{ x: 50, y: 100 }, { x: 200, y: 40 }])
    expect(e.frictionAngle).toBe(0)
  })

  it('refuses fewer than two specimens, or all at one stress', () => {
    expect(() => fitEnvelope([{ x: 50, y: 30 }])).toThrow(/at least two/)
    expect(() => fitEnvelope([{ x: 100, y: 30 }, { x: 100, y: 60 }])).toThrow(/no slope/)
  })
})

describe('direct shear (ASTM D3080)', () => {
  const clean = {
    points: [
      { normalStress: 50, peakShear: 48.9 },
      { normalStress: 100, peakShear: 77.7 },
      { normalStress: 200, peakShear: 135.5 },
    ],
  }

  it('reports c′, φ′ and the stress range they are valid over', () => {
    const r = directShear(clean)
    expect(r.peak.cohesion).toBeCloseTo(20, 0)
    expect(r.peak.frictionAngle).toBeCloseTo(30, 0)
    expect(r.stressRange).toEqual({ min: 50, max: 200 })
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/valid only there/)
  })

  it('warns when only two specimens were run', () => {
    const r = directShear({ points: clean.points.slice(0, 2) })
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/at least three/)
  })

  it('says when it refitted through the origin', () => {
    const r = directShear({
      points: [
        { normalStress: 50, peakShear: 28 },
        { normalStress: 100, peakShear: 60 },
        { normalStress: 200, peakShear: 122 },
      ],
    })
    expect(r.peak.cohesion).toBe(0)
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/NEGATIVE cohesion intercept.*fitting artefact/)
  })

  it('warns on a poor fit rather than reporting c′ and φ′ as if they were solid', () => {
    const r = directShear({
      points: [
        { normalStress: 50, peakShear: 90 },
        { normalStress: 100, peakShear: 60 },
        { normalStress: 200, peakShear: 140 },
      ],
    })
    expect(r.peak.r2).toBeLessThan(0.95)
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/plot the points before trusting/)
  })

  it('fits a residual envelope when residual stresses were recorded', () => {
    const r = directShear({
      points: clean.points.map((p, i) => ({ ...p, residualShear: [30, 55, 105][i] })),
    })
    expect(r.residual).toBeDefined()
    expect(r.residual!.frictionAngle).toBeLessThan(r.peak.frictionAngle + 1)
  })

  it('flags a residual angle above the peak, which cannot happen', () => {
    const r = directShear({
      points: [
        { normalStress: 50, peakShear: 40, residualShear: 20 },
        { normalStress: 200, peakShear: 60, residualShear: 160 },
      ],
    })
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/cannot happen in a real soil/)
  })

  it('refuses a single specimen', () => {
    expect(() => directShear({ points: [{ normalStress: 50, peakShear: 30 }] }))
      .toThrow(/at least two specimens/)
  })
})

describe('using an envelope outside the stresses it was fitted over', () => {
  it('flags extrapolation, because a real envelope is curved', () => {
    const r = directShear({
      points: [
        { normalStress: 50, peakShear: 48.9 },
        { normalStress: 100, peakShear: 77.7 },
        { normalStress: 200, peakShear: 135.5 },
      ],
    })
    expect(strengthAt(r.peak, 150, r.stressRange).extrapolated).toBe(false)
    expect(strengthAt(r.peak, 600, r.stressRange).extrapolated).toBe(true)
    expect(strengthAt(r.peak, 10, r.stressRange).extrapolated).toBe(true)
  })
})

// ── UCS ───────────────────────────────────────────────────────────────────

describe('unconfined compression (ASTM D2166)', () => {
  const spec = { diameter: 38, height: 76, failureLoad: 120, failureDeformation: 6 }

  it('applies the area correction, which lowers qu', () => {
    // A0 = π/4 × 38² = 1134.115 mm²; ε = 6/76 = 0.078947
    // Ac = 1134.115 / 0.921053 = 1231.325 mm²
    // qu = 120 / 1231.325 × 1000 = 97.455 kPa
    const r = ucs(spec)
    expect(r.initialArea).toBeCloseTo(1134.11, 1)
    expect(r.strain).toBeCloseTo(0.07895, 5)
    expect(r.correctedArea).toBeCloseTo(1231.325, 2)
    expect(r.qu).toBeCloseTo(97.45, 1)
    expect(r.quUncorrected).toBeCloseTo(105.81, 1)
    expect(r.qu).toBeLessThan(r.quUncorrected)
  })

  it('says how much the correction moved the answer', () => {
    // Omitting it would overstate the strength — always unconservatively.
    const r = ucs(spec)
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/lowering qu from 106 to 97 kPa/)
  })

  it('halves qu for a saturated cohesive soil and states the assumption', () => {
    const r = ucs(spec)
    expect(r.cu).toBeCloseTo(r.qu / 2, 10)
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/assumes φ = 0/)
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/LOWER BOUND/)
  })

  it('DECLINES cu when the φ = 0 assumption does not hold', () => {
    for (const soil of ['fissured', 'partly-saturated', 'granular'] as const) {
      const r = ucs(spec, soil)
      expect(r.cu, soil).toBeUndefined()
      expect(r.cuDeclined, soil).toBeTruthy()
      expect(r.qu, soil).toBeCloseTo(97.45, 1)   // qu is still a measurement
    }
    expect(ucs(spec, 'fissured').cuDeclined).toMatch(/discontinuity/)
    expect(ucs(spec, 'granular').cuDeclined).toMatch(/triaxial or direct shear/)
  })

  it('warns about a specimen outside the 2.0–2.5 slenderness range', () => {
    expect(ucs({ ...spec, height: 60 }).notes.map((n) => n.text).join(' ')).toMatch(/restrained by the platens/)
    expect(ucs({ ...spec, height: 76 }).notes.map((n) => n.text).join(' ')).not.toMatch(/2\.0–2\.5/)
  })

  it('warns past 20% strain, where the specimen is barrelling not shearing', () => {
    expect(ucs({ ...spec, failureDeformation: 18 }).notes.map((n) => n.text).join(' ')).toMatch(/barrelling/)
  })

  it('rejects impossible geometry rather than returning nonsense', () => {
    expect(() => ucs({ ...spec, diameter: 0 })).toThrow(/greater than zero/)
    expect(() => ucs({ ...spec, failureDeformation: 76 })).toThrow(/units on the dial gauge/)
    expect(() => ucs({ ...spec, failureDeformation: 100 })).toThrow(/units on the dial gauge/)
    expect(() => ucs({ ...spec, failureLoad: -1 })).toThrow(/must not be negative/)
  })

  it('describes the consistency from qu (Terzaghi & Peck)', () => {
    expect(consistencyFromQu(20)).toBe('very soft')
    expect(consistencyFromQu(75)).toBe('medium stiff')
    expect(consistencyFromQu(150)).toBe('stiff')
    expect(consistencyFromQu(500)).toBe('hard')
    expect(ucs(spec).consistency).toBe('medium stiff')
  })
})

// ── Readers and evaluation ────────────────────────────────────────────────

describe('reading strength tests from stored data', () => {
  it('drops a shear row missing either stress', () => {
    const d = readDirectShear(test('direct-shear', {
      points: [
        { normalStress: 50, peakShear: 48 },
        { normalStress: 100 },
        { peakShear: 77 },
        { normalStress: 200, peakShear: 135 },
      ],
    }))!
    expect(d.points.map((p) => p.normalStress)).toEqual([50, 200])
  })

  it('returns undefined when fewer than two rows survive', () => {
    expect(readDirectShear(test('direct-shear', { points: [{ normalStress: 50, peakShear: 48 }] })))
      .toBeUndefined()
    expect(readDirectShear(test('direct-shear'))).toBeUndefined()
  })

  it('keeps only a recognised test type', () => {
    expect(readDirectShear(test('direct-shear', {
      points: [{ normalStress: 50, peakShear: 48 }, { normalStress: 200, peakShear: 135 }],
      testType: 'CD',
    }))!.testType).toBe('CD')
    expect(readDirectShear(test('direct-shear', {
      points: [{ normalStress: 50, peakShear: 48 }, { normalStress: 200, peakShear: 135 }],
      testType: 'nonsense',
    }))!.testType).toBeUndefined()
  })

  it('defaults an unrecognised UCS soil to saturated cohesive', () => {
    const r = readUcs(test('ucs', {
      diameter: 38, height: 76, failureLoad: 120, failureDeformation: 6, soil: 'made-up',
    }))!
    expect(r.soil).toBe('saturated-cohesive')
  })

  it('honours a stated UCS soil condition', () => {
    expect(readUcs(test('ucs', {
      diameter: 38, height: 76, failureLoad: 120, failureDeformation: 6, soil: 'fissured',
    }))!.soil).toBe('fissured')
  })
})

describe('evaluateTest covers the new tests', () => {
  it('summarises direct shear by φ′', () => {
    const { outcome } = evaluateTest(test('direct-shear', {
      points: [
        { normalStress: 50, peakShear: 48.9 },
        { normalStress: 100, peakShear: 77.7 },
        { normalStress: 200, peakShear: 135.5 },
      ],
    }))
    expect(outcome!.kind).toBe('direct-shear')
    const s = summarise(outcome!)
    expect(s.label).toBe("φ'")
    expect(s.value).toBeCloseTo(30, 0)
  })

  it('summarises UCS by qu', () => {
    const { outcome } = evaluateTest(test('ucs', {
      diameter: 38, height: 76, failureLoad: 120, failureDeformation: 6,
    }))
    expect(summarise(outcome!)).toEqual({ label: 'qu', value: expect.closeTo(97.45, 1), unit: 'kPa' })
  })

  it('surfaces an impossible specimen as an error, not a crash', () => {
    const { error } = evaluateTest(test('ucs', {
      diameter: 38, height: 76, failureLoad: 120, failureDeformation: 80,
    }))
    expect(error).toMatch(/dial gauge/)
  })

  it('marks both as implemented now', () => {
    expect(isImplemented('direct-shear')).toBe(true)
    expect(isImplemented('ucs')).toBe(true)
    // triaxial joined them in Phase 4g; permeability has no engine yet
    expect(isImplemented('triaxial')).toBe(true)
    expect(isImplemented('permeability')).toBe(true)   // Phase 4h
  })
})
