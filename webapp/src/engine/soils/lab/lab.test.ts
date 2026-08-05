import { describe, it, expect } from 'vitest'
import { moistureContent, meanWaterContent } from './moisture'
import {
  specificGravity, waterDensity, temperatureCorrection, voidRatio, saturation,
} from './specificGravity'
import {
  LAB_TESTS, labSpec, isImplemented, implementedTests,
  readMoisture, readSpecificGravity, evaluateTest, summarise,
} from './index'
import { STANDARDS } from '../standards'
import { CALCULATIONS } from '../registry'
import type { LabTest, LabTestType } from '../model'

const test = (type: LabTestType, data?: Record<string, unknown>): LabTest => ({
  id: 't1', type, standard: 'd2216', status: 'complete', data,
})

// ── Water content ─────────────────────────────────────────────────────────

describe('water content (ASTM D2216)', () => {
  it('matches a hand calculation', () => {
    // Container 25.00 g, wet 85.00 g, dry 75.00 g
    // water 10.00 g, solids 50.00 g ⇒ w = 20.00%
    const r = moistureContent({ containerMass: 25, wetMass: 85, dryMass: 75 })
    expect(r.waterMass).toBeCloseTo(10, 10)
    expect(r.solidMass).toBeCloseTo(50, 10)
    expect(r.waterContent).toBeCloseTo(20, 10)
  })

  it('is a ratio to the DRY mass, so above 100% is legitimate', () => {
    // A soft organic clay holding more water than solids by mass.
    const r = moistureContent({ containerMass: 20, wetMass: 140, dryMass: 70 })
    expect(r.waterContent).toBeCloseTo(140, 10)
    expect(r.notes.join(' ')).toMatch(/organic/)
  })

  it('does not clamp a high water content', () => {
    const r = moistureContent({ containerMass: 0, wetMass: 300, dryMass: 100 })
    expect(r.waterContent).toBeCloseTo(200, 10)
  })

  it('rejects a dry mass at or below the tare', () => {
    expect(() => moistureContent({ containerMass: 25, wetMass: 30, dryMass: 25 }))
      .toThrow(/check the tare/i)
    expect(() => moistureContent({ containerMass: 25, wetMass: 30, dryMass: 20 }))
      .toThrow(/check the tare/i)
  })

  it('rejects a dry mass above the wet mass', () => {
    expect(() => moistureContent({ containerMass: 25, wetMass: 70, dryMass: 75 }))
      .toThrow(/impossible/i)
  })

  it('notes a non-standard drying temperature', () => {
    const r = moistureContent({ containerMass: 25, wetMass: 85, dryMass: 75, temperature: 90 })
    expect(r.notes.join(' ')).toMatch(/110 ± 5 °C/)
  })

  it('does not complain about 60 °C, which D2216 allows for organics', () => {
    const r = moistureContent({ containerMass: 25, wetMass: 85, dryMass: 75, temperature: 60 })
    expect(r.notes.join(' ')).not.toMatch(/110 ± 5/)
  })

  it('notes a specimen too small to weigh reliably', () => {
    const r = moistureContent({ containerMass: 25, wetMass: 31, dryMass: 30 })
    expect(r.notes.join(' ')).toMatch(/proportional weighing error/)
  })
})

describe('averaging determinations', () => {
  const at = (w: number) => moistureContent({ containerMass: 0, wetMass: 100 + w, dryMass: 100 })

  it('averages and reports the spread', () => {
    const r = meanWaterContent([at(20), at(22)])
    expect(r.mean).toBeCloseTo(21, 10)
    expect(r.range).toBeCloseTo(2, 10)
    expect(r.notes).toEqual([])
  })

  it('flags duplicates that disagree instead of averaging them silently', () => {
    // Usually a tare or transcription error rather than natural variation.
    const r = meanWaterContent([at(20), at(28)])
    expect(r.notes.join(' ')).toMatch(/check the tare masses before averaging/)
  })

  it('refuses an empty set', () => {
    expect(() => meanWaterContent([])).toThrow(/No determinations/)
  })
})

// ── Specific gravity ──────────────────────────────────────────────────────

describe('water density and the D854 temperature correction', () => {
  it('reproduces the standard table', () => {
    expect(waterDensity(4)).toBeCloseTo(1.0000, 4)
    expect(waterDensity(20)).toBeCloseTo(0.99821, 4)
    expect(waterDensity(25)).toBeCloseTo(0.99705, 4)
  })

  it('is 1.0 at the 20 °C reference and below 1 when warmer', () => {
    expect(temperatureCorrection(20)).toBeCloseTo(1, 12)
    expect(temperatureCorrection(25)).toBeLessThan(1)
    expect(temperatureCorrection(15)).toBeGreaterThan(1)
  })
})

describe('specific gravity (ASTM D854)', () => {
  it('matches a hand calculation', () => {
    // Ms 25.00, Mpw 675.00, Mpws 690.60 ⇒ displaced 9.40 ⇒ Gs 2.6596
    const r = specificGravity({ solidMass: 25, pycWaterMass: 675, pycWaterSolidMass: 690.6 })
    expect(r.displacedMass).toBeCloseTo(9.4, 10)
    expect(r.gsAtTest).toBeCloseTo(2.6596, 4)
    expect(r.gs).toBeCloseTo(2.6596, 4)     // no correction at 20 °C
  })

  it('corrects to 20 °C and says it did', () => {
    const warm = specificGravity({
      solidMass: 25, pycWaterMass: 675, pycWaterSolidMass: 690.6, temperature: 25,
    })
    expect(warm.k).toBeLessThan(1)
    expect(warm.gs).toBeLessThan(warm.gsAtTest)
    expect(warm.notes.join(' ')).toMatch(/Corrected from 25\.0 °C to 20 °C/)
  })

  it('rejects solids that displaced no water', () => {
    expect(() => specificGravity({ solidMass: 25, pycWaterMass: 675, pycWaterSolidMass: 700 }))
      .toThrow(/physically impossible/)
  })

  it('rejects a zero dry mass', () => {
    expect(() => specificGravity({ solidMass: 0, pycWaterMass: 675, pycWaterSolidMass: 680 }))
      .toThrow(/greater than zero/)
  })

  it('flags a Gs outside the usual mineral range, and says which way it errs', () => {
    // Under-de-aired suspensions trap air, displace too little, and read LOW.
    const low = specificGravity({ solidMass: 25, pycWaterMass: 675, pycWaterSolidMass: 689 })
    expect(low.gs).toBeLessThan(2.4)
    expect(low.notes.join(' ')).toMatch(/de-airing.*reads low/i)
  })

  it('notes a specimen small enough to magnify the weighing error', () => {
    const r = specificGravity({ solidMass: 5, pycWaterMass: 675, pycWaterSolidMass: 678.1 })
    expect(r.notes.join(' ')).toMatch(/magnifies every weighing error/)
  })
})

describe('what Gs is actually for', () => {
  it('gives the void ratio from the dry unit weight', () => {
    // e = Gs·γw/γd − 1 = 2.68 × 9.81 / 16.0 − 1 = 0.6432
    expect(voidRatio(2.68, 16)).toBeCloseTo(0.6432, 4)
  })

  it('gives the degree of saturation', () => {
    // S = w·Gs/e = 20 × 2.68 / 0.6432 = 83.3%
    expect(saturation(20, 2.68, voidRatio(2.68, 16))).toBeCloseTo(83.33, 1)
  })

  it('rejects degenerate inputs rather than returning Infinity', () => {
    expect(() => voidRatio(2.68, 0)).toThrow(/greater than zero/)
    expect(() => saturation(20, 2.68, 0)).toThrow(/greater than zero/)
  })
})

// ── Registry ──────────────────────────────────────────────────────────────

describe('the lab catalogue stays in step with the schema', () => {
  it('names a real standard for every test', () => {
    for (const t of LAB_TESTS) {
      expect(STANDARDS[t.standard], t.type).toBeDefined()
    }
  })

  it('names a real registry calculation where it claims one', () => {
    for (const t of LAB_TESTS) {
      if (t.calculation) expect(CALCULATIONS[t.calculation], t.type).toBeDefined()
    }
  })

  it('has no duplicate test types', () => {
    const types = LAB_TESTS.map((t) => t.type)
    expect(new Set(types).size).toBe(types.length)
  })

  it('declares every test the schema knows about', () => {
    // A LabTestType with no catalogue entry would be un-bookable.
    const declared = new Set(LAB_TESTS.map((t) => t.type))
    const schemaTypes: LabTestType[] = [
      'moisture', 'specific-gravity', 'sieve', 'hydrometer', 'atterberg',
      'compaction', 'direct-shear', 'triaxial', 'ucs', 'consolidation',
      'permeability', 'cbr', 'swell',
    ]
    for (const t of schemaTypes) expect(declared.has(t), t).toBe(true)
  })

  it('distinguishes implemented tests from merely declared ones', () => {
    // A test with no engine can still be BOOKED — that is how a laboratory
    // schedule works — but it has no data form, and the list says so rather
    // than hiding it and making the schedule look shorter than it is.
    expect(isImplemented('moisture')).toBe(true)
    expect(isImplemented('specific-gravity')).toBe(true)
    expect(isImplemented('sieve')).toBe(true)
    expect(isImplemented('atterberg')).toBe(true)
    // Direct shear declares no flat fields — its specimens are a table — so a
    // fields-only check reported it as unimplemented.
    expect(isImplemented('direct-shear')).toBe(true)
    expect(isImplemented('ucs')).toBe(true)
    expect(isImplemented('consolidation')).toBe(true)
    expect(isImplemented('compaction')).toBe(true)
    expect(isImplemented('triaxial')).toBe(true)
    expect(isImplemented('permeability')).toBe(true)
    expect(isImplemented('cbr')).toBe(true)
    expect(isImplemented('swell')).toBe(false)
    expect(implementedTests().map((t) => t.type))
      .toEqual(['moisture', 'specific-gravity', 'sieve', 'atterberg', 'compaction',
        'direct-shear', 'triaxial', 'ucs', 'consolidation', 'permeability', 'cbr'])
  })

  it('gives every implemented test enough fields to drive its engine', () => {
    // A plain form carries every input in `fields`. A sieve stack carries its
    // readings in a variable-length table instead, so it needs fewer flat
    // fields — the earlier version of this test demanded three from everything
    // and failed the sieve for being shaped correctly.
    for (const t of implementedTests()) {
      const floor = t.formKind && t.formKind !== 'fields' ? 0 : 3
      expect(t.fields.length, t.type).toBeGreaterThanOrEqual(floor)
      for (const f of t.fields) {
        expect(f.label.length, `${t.type}/${f.key}`).toBeGreaterThan(2)
        expect(f.key, `${t.type}/${f.key}`).toMatch(/^[a-zA-Z]+$/)
      }
    }
  })

  it('every required field is one the engine actually reads', () => {
    // A required field the reader ignores would block a form for no reason.
    const required: Record<string, string[]> = {
      moisture: ['containerMass', 'wetMass', 'dryMass'],
      'specific-gravity': ['solidMass', 'pycWaterMass', 'pycWaterSolidMass'],
      sieve: ['totalMass'],
      atterberg: ['liquidLimit'],
      compaction: ['mouldVolume', 'mouldMass'],
      'direct-shear': [],
      triaxial: [],
      permeability: ['length', 'area', 'time'],
      cbr: [],
      ucs: ['diameter', 'height', 'failureLoad', 'failureDeformation'],
      consolidation: ['initialHeight', 'diameter', 'dryMass', 'specificGravity'],
    }
    for (const t of implementedTests()) {
      const declared = t.fields.filter((f) => !f.optional).map((f) => f.key).sort()
      expect(declared, t.type).toEqual(required[t.type].sort())
    }
  })

  it('marks the tests that need an undisturbed specimen', () => {
    expect(labSpec('triaxial')!.needsUndisturbed).toBe(true)
    expect(labSpec('consolidation')!.needsUndisturbed).toBe(true)
    expect(labSpec('moisture')!.needsUndisturbed).toBe(false)
  })
})

// ── Guards ────────────────────────────────────────────────────────────────

describe('stored data is untrusted input', () => {
  it('reads a well-formed blob', () => {
    const d = readMoisture(test('moisture', { containerMass: 25, wetMass: 85, dryMass: 75 }))
    expect(d).toEqual({ container: undefined, containerMass: 25, wetMass: 85, dryMass: 75, temperature: undefined })
  })

  it('returns undefined rather than a half-populated object', () => {
    // An investigation round-trips through JSON and through a file a user may
    // have edited, so a missing field must not become NaN downstream.
    expect(readMoisture(test('moisture', { containerMass: 25, wetMass: 85 }))).toBeUndefined()
    expect(readMoisture(test('moisture', {}))).toBeUndefined()
    expect(readMoisture(test('moisture'))).toBeUndefined()
    expect(readMoisture(test('moisture', { containerMass: 'x', wetMass: 85, dryMass: 75 }))).toBeUndefined()
  })

  it('rejects NaN and Infinity, which survive JSON round trips as null or numbers', () => {
    expect(readMoisture(test('moisture', { containerMass: NaN, wetMass: 85, dryMass: 75 }))).toBeUndefined()
    expect(readMoisture(test('moisture', { containerMass: Infinity, wetMass: 85, dryMass: 75 }))).toBeUndefined()
  })

  it('ignores an array or a primitive where an object is expected', () => {
    expect(readMoisture({ ...test('moisture'), data: [] as unknown as Record<string, unknown> })).toBeUndefined()
  })

  it('reads specific gravity the same way', () => {
    expect(readSpecificGravity(test('specific-gravity', {
      solidMass: 25, pycWaterMass: 675, pycWaterSolidMass: 690.6,
    }))).toBeTruthy()
    expect(readSpecificGravity(test('specific-gravity', { solidMass: 25 }))).toBeUndefined()
  })
})

describe('evaluateTest', () => {
  it('computes an implemented test', () => {
    const { outcome, error } = evaluateTest(test('moisture', { containerMass: 25, wetMass: 85, dryMass: 75 }))
    expect(error).toBeUndefined()
    expect(outcome!.kind).toBe('moisture')
    expect(summarise(outcome!)).toEqual({ label: 'w', value: 20, unit: '%' })
  })

  it('returns an ERROR for impossible data rather than throwing', () => {
    // The page shows the message; it does not die.
    const { outcome, error } = evaluateTest(test('moisture', { containerMass: 25, wetMass: 70, dryMass: 75 }))
    expect(outcome).toBeUndefined()
    expect(error).toMatch(/impossible/)
  })

  it('returns nothing for a test with no data or no engine', () => {
    expect(evaluateTest(test('moisture'))).toEqual({})
    expect(evaluateTest(test('triaxial', { anything: 1 }))).toEqual({})
  })

  it('summarises specific gravity', () => {
    const { outcome } = evaluateTest(test('specific-gravity', {
      solidMass: 25, pycWaterMass: 675, pycWaterSolidMass: 690.6,
    }))
    const s = summarise(outcome!)
    expect(s.label).toBe('Gs')
    expect(s.value).toBeCloseTo(2.6596, 3)
  })
})
