import { describe, it, expect } from 'vitest'
import { permeability, viscosityRatio } from './permeability'
import { cbr, originCorrection, STANDARD_STRESS, type CbrPoint } from './cbr'
import { cbrChart } from './plots'
import { evaluateTest, summarise, readPermeability, readCbr, labSpec, isImplemented } from './index'
import type { LabTest } from '../model'

// ─────────────────────────────────────────────────────────────────────────
// D2434 / D5084 permeability and D1883 CBR. Both reductions are short, and
// both have one step that decides the answer and is easy to skip:
//   • k is meaningless without the method's own range and the 20 °C correction
//   • CBR is read off a curve AFTER the origin correction, which is where a
//     third of the value can hide
// ─────────────────────────────────────────────────────────────────────────

describe('constant head (ASTM D2434)', () => {
  it('matches a hand calculation', () => {
    // Q = 500 cm³ = 500 000 mm³, L = 100 mm, A = 7854 mm², h = 400 mm, t = 60 s
    // k = 500000·100 / (7854·400·60) = 0.26525762 mm/s = 2.6525762e-4 m/s
    const r = permeability({
      method: 'constant-head', length: 100, area: 7854, head: 400, volume: 500, time: 60,
    })
    expect(r.k).toBeCloseTo(2.6525762e-4, 11)
    expect(r.k20).toBeCloseTo(r.k, 12)          // no temperature ⇒ no correction
    expect(r.k20cmPerSec).toBeCloseTo(r.k20 * 100, 12)
    expect(r.gradient).toBeCloseTo(4, 10)
  })

  it('scales the way Darcy says it does', () => {
    const base = { method: 'constant-head' as const, length: 100, area: 7854, head: 400, volume: 500, time: 60 }
    // twice the head, half the k; twice the time, half the k
    expect(permeability({ ...base, head: 800 }).k).toBeCloseTo(permeability(base).k / 2, 12)
    expect(permeability({ ...base, time: 120 }).k).toBeCloseTo(permeability(base).k / 2, 12)
  })

  it('says a constant-head test cannot measure a fine soil', () => {
    // A tiny volume over a long time: arithmetically 1e-8 m/s, and the burette
    // cannot tell that from evaporation.
    const r = permeability({
      method: 'constant-head', length: 100, area: 7854, head: 400, volume: 0.02, time: 3600,
    })
    expect(r.k20).toBeLessThan(1e-5)
    expect(r.notes.join(' ')).toMatch(/below the range a constant-head test measures/)
    expect(r.notes.join(' ')).toMatch(/the number is the apparatus, not the soil/)
  })

  it('warns when the gradient is steep enough to break Darcy', () => {
    const r = permeability({
      method: 'constant-head', length: 100, area: 7854, head: 5000, volume: 500, time: 60,
    })
    expect(r.gradient).toBeCloseTo(50, 8)
    expect(r.notes.join(' ')).toMatch(/turbulent/)
  })
})

describe('falling head (ASTM D5084)', () => {
  it('matches a hand calculation', () => {
    // a = 78.5, L = 100, A = 7854, t = 600, h1 = 900, h2 = 400
    // k = (78.5·100)/(7854·600) · ln(2.25) = 1.665724e-3 · 0.8109302
    //   = 1.3508620e-3 mm/s = 1.3508620e-6 m/s
    const r = permeability({
      method: 'falling-head', length: 100, area: 7854, standpipeArea: 78.5,
      headStart: 900, headEnd: 400, time: 600,
    })
    expect(r.k).toBeCloseTo(1.3508620e-6, 13)
    expect(r.notes.join(' ')).toMatch(/No water temperature recorded/)
  })

  it('refuses a head that rises', () => {
    expect(() => permeability({
      method: 'falling-head', length: 100, area: 7854, standpipeArea: 78.5,
      headStart: 400, headEnd: 900, time: 600,
    })).toThrow(/must FALL/)
  })

  it('says a falling-head test cannot resolve a clean sand', () => {
    const r = permeability({
      method: 'falling-head', length: 100, area: 7854, standpipeArea: 7854,
      headStart: 900, headEnd: 100, time: 10,
    })
    expect(r.k20).toBeGreaterThan(1e-4)
    expect(r.notes.join(' ')).toMatch(/faster than it can be read/)
  })
})

describe('the 20 °C correction', () => {
  it('is unity at 20 °C, to within half a percent', () => {
    expect(viscosityRatio(20)).toBeCloseTo(1, 2)
    expect(Math.abs(viscosityRatio(20) - 1)).toBeLessThan(0.005)
  })

  it('falls as the water warms — warm water flows more easily, so k reads high', () => {
    expect(viscosityRatio(10)).toBeGreaterThan(1)
    expect(viscosityRatio(30)).toBeLessThan(1)
    // and the correction is worth about 30% across that span
    expect(viscosityRatio(10) / viscosityRatio(30)).toBeGreaterThan(1.25)
  })

  it('is applied to k and reported as a factor', () => {
    const at30 = permeability({
      method: 'constant-head', length: 100, area: 7854, head: 400, volume: 500, time: 60, temperature: 30,
    })
    expect(at30.temperatureFactor).toBeCloseTo(viscosityRatio(30), 12)
    expect(at30.k20).toBeCloseTo(at30.k * viscosityRatio(30), 12)
    expect(at30.k20).toBeLessThan(at30.k)
    expect(at30.notes.join(' ')).toMatch(/Corrected to 20 °C/)
  })

  it('rejects a temperature at or below freezing', () => {
    expect(() => viscosityRatio(0)).toThrow(/above 0/)
  })
})

// ── CBR ───────────────────────────────────────────────────────────────────

/** A straight load–penetration line of slope m through a planted origin. */
const straight = (m: number, origin: number, xs: number[]): CbrPoint[] =>
  xs.map((x) => ({ penetration: x, stress: Math.max(0, (x - origin) * m) }))

describe('the D1883 origin correction', () => {
  it('finds a planted origin shift', () => {
    // Straight line of slope 2 MPa/mm starting at 0.5 mm: the correction must
    // recover 0.50, not 0.
    const pts = straight(2, 0.5, [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7])
    expect(originCorrection(pts)).toBeCloseTo(0.5, 8)
  })

  it('is zero for a curve already straight from the origin', () => {
    expect(originCorrection(straight(2, 0, [0, 0.5, 1, 2, 3, 5, 7]))).toBeCloseTo(0, 8)
  })

  it('recovers the CBR the shift is worth', () => {
    // With the correction, stress at 2.54 mm is 2·2.54 = 5.08 MPa ⇒ 73.6%.
    // Without it the curve is read at 2.54 mm raw, which is 2·2.04 = 4.08 MPa
    // ⇒ 59.1% — the third of the value that hides in this step.
    const pts = straight(2, 0.5, [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7])
    const r = cbr({ points: pts })
    expect(r.originShift).toBeCloseTo(0.5, 8)
    expect(r.stress2_54).toBeCloseTo(5.08, 6)
    expect(r.cbr2_54).toBeCloseTo((5.08 / STANDARD_STRESS.at2_54) * 100, 6)
    expect(r.cbr2_54).toBeCloseTo(73.6, 1)
    expect(r.notes.join(' ')).toMatch(/origin correction moved the zero by 0\.50 mm/)
    expect(r.notes.join(' ')).toMatch(/59\.1%/)      // what it would have read
  })
})

describe('CBR (ASTM D1883)', () => {
  it('is the plunger stress over the standard stress, at both penetrations', () => {
    // Read straight off the definition: 3.45 MPa at 2.54 mm is exactly 50%.
    const r = cbr({
      points: [
        { penetration: 0, stress: 0 },
        { penetration: 2.54, stress: 3.45 },
        { penetration: 5.08, stress: 5.15 },
        { penetration: 7.62, stress: 6.0 },
      ],
    })
    expect(r.originShift).toBe(0)
    expect(r.cbr2_54).toBeCloseTo(50, 8)
    expect(r.cbr5_08).toBeCloseTo(50, 8)
    expect(r.cbr).toBeCloseTo(50, 8)
    expect(r.governing).toBe(2.54)
  })

  it('reports the 5.08 mm value when it is higher, and calls for the re-run', () => {
    const r = cbr({
      points: [
        { penetration: 0, stress: 0 },
        { penetration: 2.54, stress: 3.45 },     // 50%
        { penetration: 5.08, stress: 6.18 },     // 60%
        { penetration: 7.62, stress: 7.0 },
      ],
    })
    expect(r.governing).toBe(5.08)
    expect(r.cbr).toBeCloseTo(60, 6)
    expect(r.notes.join(' ')).toMatch(/RE-RUN/)
    expect(r.notes.join(' ')).toMatch(/§11\.3/)
  })

  it('says when the 5.08 mm ordinate was extrapolated', () => {
    const r = cbr({
      points: [
        { penetration: 0, stress: 0 },
        { penetration: 1.27, stress: 1.8 },
        { penetration: 2.54, stress: 3.45 },
        { penetration: 3.81, stress: 4.4 },
      ],
    })
    expect(r.notes.join(' ')).toMatch(/EXTRAPOLATED/)
  })

  it('never lets an unsoaked value pass without saying so', () => {
    const pts = [
      { penetration: 0, stress: 0 }, { penetration: 2.54, stress: 3.45 },
      { penetration: 5.08, stress: 5.15 }, { penetration: 7.62, stress: 6 },
    ]
    expect(cbr({ points: pts }).notes.join(' ')).toMatch(/UNSOAKED/)
    expect(cbr({ points: pts, soaked: true }).notes.join(' ')).toMatch(/Soaked \(four-day\)/)
    expect(cbr({ points: pts, soaked: true, swell: 4.5 }).notes.join(' ')).toMatch(/expansive/)
    expect(cbr({ points: pts }).notes.join(' ')).toMatch(/belongs to a compaction state/)
  })

  it('refuses a curve too short to read', () => {
    expect(() => cbr({ points: [{ penetration: 0, stress: 0 }, { penetration: 2.54, stress: 3 }] }))
      .toThrow(/at least three/)
  })
})

// ── Plumbing ──────────────────────────────────────────────────────────────

const test = (type: 'permeability' | 'cbr', data: Record<string, unknown>): LabTest =>
  ({ id: 'p1', type, standard: type === 'cbr' ? 'd1883' : 'd5084', status: 'complete', data })

describe('both tests through the lab registry', () => {
  it('are implemented, with the forms their engines need', () => {
    expect(isImplemented('permeability')).toBe(true)
    expect(isImplemented('cbr')).toBe(true)
    expect(labSpec('cbr')?.formKind).toBe('cbr-points')
    expect(labSpec('permeability')?.calculation).toBe('permeability.falling-head')
  })

  it('reads the method first and then insists on THAT method\'s fields', () => {
    const falling = { method: 'falling-head', length: 100, area: 7854, time: 600 }
    // a falling-head blob missing its standpipe is incomplete, not a
    // constant-head test with extra fields
    expect(readPermeability(test('permeability', falling))).toBeUndefined()
    expect(readPermeability(test('permeability', { ...falling, standpipeArea: 78.5, headStart: 900, headEnd: 400 })))
      .toMatchObject({ method: 'falling-head' })
    // no method at all reads as constant head, the D2434 default
    expect(readPermeability(test('permeability', { length: 100, area: 7854, time: 60, head: 400, volume: 500 })))
      .toMatchObject({ method: 'constant-head' })
  })

  it('summarises k at 20 °C in m/s and CBR at its governing penetration', () => {
    const k = evaluateTest(test('permeability', {
      method: 'constant-head', length: 100, area: 7854, head: 400, volume: 500, time: 60,
    }))
    expect(summarise(k.outcome!).label).toBe('k₂₀')
    expect(summarise(k.outcome!).unit).toBe('m/s')
    expect(summarise(k.outcome!).value).toBeCloseTo(2.6525762e-4, 11)

    const c = evaluateTest(test('cbr', {
      points: [
        { penetration: 0, stress: 0 }, { penetration: 2.54, stress: 3.45 },
        { penetration: 5.08, stress: 5.15 }, { penetration: 7.62, stress: 6 },
      ],
    }))
    expect(summarise(c.outcome!)).toEqual({ label: 'CBR @ 2.54 mm', value: expect.closeTo(50, 6), unit: '%' })
  })

  it('drops a CBR row missing a coordinate and refuses a curve of two', () => {
    const points = [
      { penetration: 0, stress: 0 }, { penetration: 2.54, stress: 3.45 },
      { penetration: 5.08, stress: 5.15 }, { stress: 9 },
    ]
    expect(readCbr(test('cbr', { points }))?.points.length).toBe(3)
    expect(readCbr(test('cbr', { points: points.slice(0, 2) }))).toBeUndefined()
  })

  it('surfaces an impossible test as an error, not a crash', () => {
    const { outcome, error } = evaluateTest(test('permeability', {
      method: 'falling-head', length: 100, area: 7854, standpipeArea: 78.5,
      headStart: 100, headEnd: 900, time: 600,
    }))
    expect(outcome).toBeUndefined()
    expect(error).toMatch(/must FALL/)
  })
})

// ── The CBR chart ─────────────────────────────────────────────────────────

describe('the CBR chart', () => {
  const points = straight(2, 0.5, [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7])
  const r = cbr({ points, soaked: true, swell: 1.2 })
  const d = cbrChart(r, points)
  const text = d.primitives.filter((p) => p.kind === 'text').map((p) => p.text).join(' | ')

  it('draws nothing outside its frame, plates included', () => {
    // Every annotation here sits on a plate — the corrected-origin caption ran
    // through the axis tick labels and the ordinate labels were struck by the
    // curve — so the plates are the things most able to escape the frame.
    for (const p of d.primitives) {
      const xs = p.kind === 'line' ? [p.x1, p.x2] : p.kind === 'circle' ? [p.cx] : p.kind === 'rect' ? [p.x, p.x + p.w] : []
      for (const x of xs) {
        expect(x).toBeGreaterThanOrEqual(18 - 1e-6)
        expect(x).toBeLessThanOrEqual(18 + 96 + 1e-6)
      }
      if (p.kind === 'rect') {
        expect(p.y).toBeGreaterThanOrEqual(8 - 1e-6)
        expect(p.y + p.h).toBeLessThanOrEqual(8 + 62 + 1e-6)
      }
    }
  })

  it('draws the origin correction rather than only stating it', () => {
    // The construction is a judgement; a reader has to be able to disagree.
    expect(text).toMatch(/corrected 0 \(\+0\.50\)/)
    const dashed = d.primitives.filter((p) => p.kind === 'line' && p.dash)
    expect(dashed.length).toBeGreaterThan(2)
  })

  it('marks both ordinates with their ratios, and names the governing one', () => {
    expect(text).toMatch(/@ 2\.54/)
    expect(text).toMatch(/@ 5\.08/)
    // A straight line of slope 2 MPa/mm is stiff enough that the 5.08 mm
    // ordinate governs — 98.6% against 73.6% — so the plate carries the re-run.
    expect(text).toMatch(/CBR = 98\.6% at 5\.08 mm — RE-RUN per §11\.3/)
    expect(text).toMatch(/soaked \(4 day\)/)
    expect(text).toMatch(/swell 1\.2%/)
  })

  it('shouts UNSOAKED on the plate when it is', () => {
    const t2 = cbrChart(cbr({ points }), points).primitives
      .filter((p) => p.kind === 'text').map((p) => p.text).join(' | ')
    expect(t2).toMatch(/UNSOAKED/)
  })
})
