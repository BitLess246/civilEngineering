import { describe, it, expect } from 'vitest'
import { swell, swellStrain, reloadPressure } from './swell'
import { evaluateTest, summarise, readSwell, labSpec, isImplemented, implementedTests } from './index'
import type { LabTest } from '../model'

// ─────────────────────────────────────────────────────────────────────────
// ASTM D4546. The arithmetic is one subtraction; everything that can go wrong
// is in what the number is attached to:
//   • the SIGN — the same test measures swell and collapse, opposite behaviours
//   • the STRESS it was measured at, without which a percentage says nothing
//   • the METHOD behind a swelling pressure, since C measures it and A/B infer
//     it by a different stress path
// ─────────────────────────────────────────────────────────────────────────

const base = { initialHeight: 20, inundationStress: 25 }

describe('the strain on wetting, signed', () => {
  it('matches a hand calculation for a swelling soil', () => {
    // 20.00 → 20.90 mm is +4.50%
    const r = swell({ ...base, method: 'B', wettedHeight: 20.9 })
    expect(r.strain).toBeCloseTo(4.5, 10)
    expect(r.behaviour).toBe('swell')
    expect(swellStrain(20, 20.9)).toBeCloseTo(4.5, 10)
  })

  it('reports a COLLAPSE as a negative strain, not a magnitude', () => {
    // 20.00 → 19.64 mm is −1.80%: the specimen went DOWN on wetting
    const r = swell({ ...base, method: 'B', wettedHeight: 19.64 })
    expect(r.strain).toBeCloseTo(-1.8, 10)
    expect(r.behaviour).toBe('collapse')
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/COLLAPSED on wetting/)
    // and it says which way a foundation moves, since that is the point
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/settles when the ground gets wet; it does not heave/)
  })

  it('calls a hair of movement negligible rather than a behaviour', () => {
    const r = swell({ ...base, method: 'B', wettedHeight: 20.01 })
    expect(r.behaviour).toBe('negligible')
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/neither expansive nor collapsible/)
  })

  it('carries the inundation stress into the result and the note', () => {
    const r = swell({ initialHeight: 20, inundationStress: 7, method: 'A', wettedHeight: 21.4 })
    expect(r.inundationStress).toBe(7)
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/under 7\.0 kPa/)
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/belongs to that stress and to no other/)
  })

  it('distinguishes free swell (A) from swell at the in-situ stress (B)', () => {
    expect(swell({ ...base, method: 'A', wettedHeight: 21 }).notes.map((n) => n.text).join(' '))
      .toMatch(/FREE swell — the largest figure this soil can produce/)
    expect(swell({ ...base, method: 'B', wettedHeight: 21 }).notes.map((n) => n.text).join(' '))
      .toMatch(/estimated in-situ vertical stress/)
  })

  it('refuses methods A and B without a wetted height', () => {
    expect(() => swell({ ...base, method: 'A' })).toThrow(/height after wetting/)
    expect(() => swell({ ...base, method: 'B', wettedHeight: 0 })).toThrow(/greater than zero/)
  })

  it('refuses a zero initial height and a negative inundation stress', () => {
    expect(() => swell({ initialHeight: 0, inundationStress: 25, method: 'A', wettedHeight: 21 }))
      .toThrow(/initial specimen height/)
    expect(() => swell({ initialHeight: 20, inundationStress: -5, method: 'A', wettedHeight: 21 }))
      .toThrow(/cannot be negative/)
  })
})

describe('swelling pressure', () => {
  it('is recovered where the re-loading curve crosses the original height', () => {
    // Planted: the specimen swelled to 20.9 and comes back through 20.00 mm
    // between 100 and 200 kPa. Interpolated on LOG stress, the crossing of a
    // curve that is straight there.
    const points = [
      { stress: 25, height: 20.9 },
      { stress: 50, height: 20.6 },
      { stress: 100, height: 20.2 },
      { stress: 200, height: 19.8 },
      { stress: 400, height: 19.4 },
    ]
    const p = reloadPressure(20, points)!
    expect(p).toBeGreaterThan(100)
    expect(p).toBeLessThan(200)
    // log-interpolation between (100, 20.2) and (200, 19.8): t = 0.5 ⇒ 141.4
    expect(p).toBeCloseTo(Math.pow(10, Math.log10(100) + 0.5 * Math.log10(2)), 6)
    expect(p).toBeCloseTo(141.42, 2)

    const r = swell({ ...base, method: 'B', wettedHeight: 20.9, points })
    expect(r.swellPressure).toBeCloseTo(141.42, 2)
    expect(r.swellPressureFrom).toBe('reload-to-original-height')
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/INFERRED by re-loading/)
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/usually reports a higher value/)
  })

  it('declines to extrapolate when the loading never gets back there', () => {
    const points = [
      { stress: 25, height: 20.9 },
      { stress: 50, height: 20.7 },
      { stress: 100, height: 20.5 },
    ]
    expect(reloadPressure(20, points)).toBeUndefined()
    const r = swell({ ...base, method: 'B', wettedHeight: 20.9, points })
    expect(r.swellPressure).toBeUndefined()
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/GREATER than that and is not reported/)
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/would invent it/)
  })

  it('method C measures it directly, and its zero strain is by construction', () => {
    const r = swell({ ...base, method: 'C', constantVolumePressure: 180 })
    expect(r.swellPressure).toBe(180)
    expect(r.swellPressureFrom).toBe('constant-volume')
    expect(r.strain).toBe(0)
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/zero BY CONSTRUCTION and carries no information/)
  })

  it('refuses method C without the pressure it exists to measure', () => {
    expect(() => swell({ ...base, method: 'C' })).toThrow(/that pressure is required/)
  })

  it('says so when there is no re-loading curve at all', () => {
    const r = swell({ ...base, method: 'B', wettedHeight: 20.9 })
    expect(r.swellPressure).toBeUndefined()
    expect(r.notes.map((n) => n.text).join(' ')).toMatch(/No re-loading curve, so no swelling pressure/)
  })

  it('reports the remaining strain at every re-loading stress', () => {
    const r = swell({
      ...base, method: 'B', wettedHeight: 20.9,
      points: [{ stress: 100, height: 20.2 }, { stress: 25, height: 20.9 }],
    })
    expect(r.rows!.map((x) => x.stress)).toEqual([25, 100])      // sorted
    expect(r.rows![0].strain).toBeCloseTo(4.5, 10)
    expect(r.rows![1].strain).toBeCloseTo(1.0, 10)
  })

  it('always warns that swell belongs to a fabric, not just a mineralogy', () => {
    expect(swell({ ...base, method: 'A', wettedHeight: 21 }).notes.map((n) => n.text).join(' '))
      .toMatch(/remoulded or disturbed specimen does not answer for the ground/)
  })
})

// ── Plumbing ──────────────────────────────────────────────────────────────

const labTest = (data: Record<string, unknown>): LabTest =>
  ({ id: 's1', type: 'swell', standard: 'd4546', status: 'complete', data })

describe('swell through the lab registry', () => {
  it('is implemented — and it was the last test that was not', () => {
    expect(isImplemented('swell')).toBe(true)
    expect(labSpec('swell')?.formKind).toBe('swell-reload')
    expect(labSpec('swell')?.calculation).toBe('swell.strain')
    // every LabTestType now has an engine
    expect(implementedTests().length).toBe(13)
  })

  it('insists on the fields the CHOSEN method needs', () => {
    // C needs its pressure; A and B need a wetted height. Neither substitutes.
    expect(readSwell(labTest({ ...base, method: 'C' }))).toBeUndefined()
    expect(readSwell(labTest({ ...base, method: 'C', constantVolumePressure: 180 })))
      .toMatchObject({ method: 'C' })
    expect(readSwell(labTest({ ...base, method: 'B' }))).toBeUndefined()
    expect(readSwell(labTest({ ...base, method: 'B', wettedHeight: 20.9 })))
      .toMatchObject({ method: 'B' })
  })

  it('falls back to method A rather than trusting an unknown one', () => {
    expect(readSwell(labTest({ ...base, method: 'Z', wettedHeight: 20.9 }))?.method).toBe('A')
    expect(readSwell(labTest({ ...base, wettedHeight: 20.9 }))?.method).toBe('A')
  })

  it('drops a re-loading row missing a coordinate', () => {
    const d = readSwell(labTest({
      ...base, method: 'B', wettedHeight: 20.9,
      points: [{ stress: 100, height: 20.2 }, { stress: 200 }],
    }))
    expect(d?.points?.length).toBe(1)
  })

  it('summarises by the signed strain, and by σs for method C', () => {
    const up = evaluateTest(labTest({ ...base, method: 'B', wettedHeight: 20.9 }))
    expect(summarise(up.outcome!)).toEqual({ label: 'swell', value: expect.closeTo(4.5, 8), unit: '%' })

    const down = evaluateTest(labTest({ ...base, method: 'B', wettedHeight: 19.64 }))
    const s = summarise(down.outcome!)
    expect(s.label).toBe('collapse')
    expect(s.value).toBeLessThan(0)          // the sign survives to the headline

    const cv = evaluateTest(labTest({ ...base, method: 'C', constantVolumePressure: 180 }))
    expect(summarise(cv.outcome!)).toEqual({ label: 'σs', value: 180, unit: 'kPa' })
  })

  it('surfaces an impossible specimen as an error, not a crash', () => {
    const { outcome, error } = evaluateTest(labTest({ ...base, method: 'B', wettedHeight: -1 }))
    expect(outcome).toBeUndefined()
    expect(error).toMatch(/greater than zero/)
  })
})
