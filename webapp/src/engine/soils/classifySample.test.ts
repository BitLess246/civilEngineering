import { describe, it, expect } from 'vitest'
import { classifySample, governingTest } from './classifySample'
import { readSieve, readAtterberg, evaluateTest } from './lab'
import type { Sample, LabTest } from './model'
import type { SieveInput } from './sieve'

// A 500 g stack that classifies as SC when paired with LL 42 / PL 23:
// gravel 5%, sand 62%, fines 33%.
const SIEVE_DATA: SieveInput = {
  totalMass: 500,
  readings: [
    { size: 4.75, designation: 'No. 4', massRetained: 25 },
    { size: 2.0, designation: 'No. 10', massRetained: 60 },
    { size: 0.425, designation: 'No. 40', massRetained: 130 },
    { size: 0.075, designation: 'No. 200', massRetained: 120 },
  ],
  panMass: 165,
}

const test = (over: Partial<LabTest> & Pick<LabTest, 'type'>): LabTest => ({
  id: `t${Math.random().toString(36).slice(2, 8)}`,
  standard: 'd6913', status: 'complete', ...over,
})

const sample = (tests: LabTest[]): Sample => ({
  id: 's1', name: 'S-01', type: 'split-spoon',
  depthTop: 1.5, depthBottom: 1.95, tests,
})

const sieveTest = (data: SieveInput = SIEVE_DATA, over: Partial<LabTest> = {}) =>
  test({ type: 'sieve', standard: 'd6913', data: data as unknown as Record<string, unknown>, ...over })

const atterbergTest = (data: Record<string, unknown>, over: Partial<LabTest> = {}) =>
  test({ type: 'atterberg', standard: 'd4318', data, ...over })

// ── Readers ───────────────────────────────────────────────────────────────

describe('reading a sieve stack from stored data', () => {
  it('reads a well-formed stack', () => {
    const d = readSieve(sieveTest())!
    expect(d.totalMass).toBe(500)
    expect(d.readings).toHaveLength(4)
    expect(d.panMass).toBe(165)
  })

  it('DROPS a malformed row rather than reading it as zero', () => {
    // A zero mass retained is a real measurement; an absent one is not.
    const d = readSieve(sieveTest({
      ...SIEVE_DATA,
      readings: [
        { size: 4.75, massRetained: 25 },
        { size: 2.0 } as unknown as { size: number; massRetained: number },
        { massRetained: 60 } as unknown as { size: number; massRetained: number },
        { size: 0.075, massRetained: 120 },
      ],
    }))!
    expect(d.readings.map((r) => r.size)).toEqual([4.75, 0.075])
  })

  it('keeps a genuine zero mass', () => {
    const d = readSieve(sieveTest({
      ...SIEVE_DATA, readings: [{ size: 9.5, massRetained: 0 }, { size: 4.75, massRetained: 25 }],
    }))!
    expect(d.readings).toHaveLength(2)
    expect(d.readings[0].massRetained).toBe(0)
  })

  it('returns undefined when there is nothing usable', () => {
    expect(readSieve(sieveTest({ ...SIEVE_DATA, readings: [] }))).toBeUndefined()
    expect(readSieve(test({ type: 'sieve' }))).toBeUndefined()
    expect(readSieve(sieveTest({ totalMass: NaN, readings: SIEVE_DATA.readings } as never))).toBeUndefined()
  })
})

describe('reading Atterberg limits', () => {
  it('reads limits and keeps a missing plastic limit as NON-PLASTIC', () => {
    // Absent PL is a different claim from PI = 0.
    const d = readAtterberg(atterbergTest({ liquidLimit: 22 }))!
    expect(d.liquidLimit).toBe(22)
    expect(d.plasticLimit).toBeUndefined()

    const r = evaluateTest(atterbergTest({ liquidLimit: 22 })).outcome!
    expect(r.kind).toBe('atterberg')
    if (r.kind === 'atterberg') expect(r.result.nonPlastic).toBe(true)
  })

  it('requires a liquid limit', () => {
    expect(readAtterberg(atterbergTest({ plasticLimit: 23 }))).toBeUndefined()
  })
})

// ── Governing test ────────────────────────────────────────────────────────

describe('choosing which test counts', () => {
  it('ignores a void test entirely', () => {
    // A specimen that failed on a seating error stays in the record but must
    // not classify the soil.
    const s = sample([sieveTest(SIEVE_DATA, { status: 'void' })])
    expect(governingTest(s, 'sieve').test).toBeUndefined()
    expect(classifySample(s).missing).toContain('sieve')
  })

  it('prefers a COMPLETE test over an in-progress one', () => {
    const inProgress = sieveTest(SIEVE_DATA, { status: 'in-progress', testDate: '2026-06-30' })
    const complete = sieveTest(SIEVE_DATA, { status: 'complete', testDate: '2026-06-01' })
    const s = sample([inProgress, complete])
    expect(governingTest(s, 'sieve').test!.id).toBe(complete.id)
  })

  it('takes the most recent when several are complete, and SAYS it chose', () => {
    const older = sieveTest(SIEVE_DATA, { testDate: '2026-06-01' })
    const newer = sieveTest(SIEVE_DATA, { testDate: '2026-06-20' })
    const s = sample([older, newer, atterbergTest({ liquidLimit: 42, plasticLimit: 23 })])
    expect(governingTest(s, 'sieve').test!.id).toBe(newer.id)
    expect(classifySample(s).notes.join(' ')).toMatch(/2 sieve analyses.*most recent complete one was used/)
  })

  it('falls back to a non-void test when none is complete', () => {
    const s = sample([sieveTest(SIEVE_DATA, { status: 'in-progress' })])
    expect(governingTest(s, 'sieve').test).toBeDefined()
  })
})

// ── Classification ────────────────────────────────────────────────────────

describe('classifying from the laboratory record', () => {
  const full = sample([sieveTest(), atterbergTest({ liquidLimit: 42, plasticLimit: 23 })])

  it('produces a USCS symbol from the tests, not from typed numbers', () => {
    const c = classifySample(full)
    expect(c.gradation!.fines).toBeCloseTo(33, 0)
    expect(c.atterberg!.plasticityIndex).toBeCloseTo(19, 10)
    expect(c.uscs!.symbol).toBe('SC')
    expect(c.missing).toEqual([])
  })

  it('produces an AASHTO group too', () => {
    const c = classifySample(full)
    expect(c.aashto!.group).toBeTruthy()
    expect(c.aashto!.groupIndex).toBeGreaterThanOrEqual(0)
  })

  it('carries the gradation and limit notes up', () => {
    const c = classifySample(full)
    // The stack has >10% fines, so D10 is off the curve and the gradation
    // module says a hydrometer would complete it.
    expect(c.notes.join(' ')).toMatch(/hydrometer/)
  })

  it('does NOT list a hydrometer as missing when it would not change the symbol', () => {
    // With 33% fines, D2487 classifies on the plasticity of the fines, not on
    // Cu and Cc. `missing` is for tests that block or change the answer, not
    // every test that would tell you something.
    expect(classifySample(full).missing).not.toContain('hydrometer')
  })

  it('DOES list it when the gradation shape is what governs', () => {
    // The narrow band where it actually matters: 10-12% fines. D2487 needs a
    // dual symbol there, which needs Cu and Cc — but with more than 10% fines
    // the sieve curve never reaches 10% passing, so D10 does not exist and
    // sieving alone cannot finish the job.
    //
    // Below 10% fines the curve DOES reach D10, which is why the 9%-fines
    // stack above classifies as SW-SC with no hydrometer needed.
    const s = sample([
      sieveTest({
        totalMass: 500,
        readings: [
          { size: 4.75, massRetained: 25 },
          { size: 2.0, massRetained: 150 },
          { size: 0.425, massRetained: 180 },
          { size: 0.075, massRetained: 90 },
        ],
        panMass: 55,
      }),
      atterbergTest({ liquidLimit: 30, plasticLimit: 22 }),
    ])
    const c = classifySample(s)
    expect(c.gradation!.fines).toBeCloseTo(11, 6)
    expect(c.gradation!.d10).toBeUndefined()
    expect(c.uscs!.symbol).toBeUndefined()
    expect(c.uscs!.reason).toMatch(/BOTH/)
    expect(c.missing).toContain('hydrometer')
  })
})

describe('it will not invent a missing input', () => {
  it('declines without a sieve analysis and names it', () => {
    const c = classifySample(sample([atterbergTest({ liquidLimit: 42, plasticLimit: 23 })]))
    expect(c.uscs).toBeUndefined()
    expect(c.missing).toContain('sieve')
    expect(c.notes.join(' ')).toMatch(/gravel\/sand\/fines split is unknown/)
  })

  it('names the Atterberg test when a fine-grained soil lacks it', () => {
    // 33% fines with no limits: D2487 needs the plasticity of the fines.
    const c = classifySample(sample([sieveTest()]))
    expect(c.missing).toContain('atterberg')
    expect(c.uscs!.symbol).toBeUndefined()
    expect(c.uscs!.reason).toMatch(/D4318/)
  })

  it('reports an evaluation error rather than classifying around it', () => {
    const broken = sample([
      sieveTest({ ...SIEVE_DATA, totalMass: 0 }),
      atterbergTest({ liquidLimit: 42, plasticLimit: 23 }),
    ])
    const c = classifySample(broken)
    expect(c.notes.join(' ')).toMatch(/could not be evaluated/)
    expect(c.uscs).toBeUndefined()
  })
})

describe('non-plastic fines are a finding, not a gap', () => {
  it('passes PI = 0 through so the classifier can call the fines silty', () => {
    // A clean-ish sand with non-plastic fines should come out SM, not refuse.
    const s = sample([
      sieveTest({
        totalMass: 500,
        readings: [
          { size: 4.75, massRetained: 25 },
          { size: 2.0, massRetained: 60 },
          { size: 0.425, massRetained: 130 },
          { size: 0.075, massRetained: 120 },
        ],
        panMass: 165,
      }),
      atterbergTest({ liquidLimit: 22 }),   // no plastic limit ⇒ non-plastic
    ])
    const c = classifySample(s)
    expect(c.atterberg!.nonPlastic).toBe(true)
    expect(c.uscs!.symbol).toBe('SM')
  })
})

// ── USDA texture ──────────────────────────────────────────────────────────

describe('the USDA texture needs a sedimentation test, and says so when there is none', () => {
  const full = sample([sieveTest(), atterbergTest({ liquidLimit: 42, plasticLimit: 23 })])

  it('gives USCS and AASHTO but no texture from a sieve alone', () => {
    const c = classifySample(full)
    expect(c.uscs!.symbol).toBe('SC')
    expect(c.aashto!.group).toBeTruthy()
    expect(c.usda).toBeUndefined()
    expect(c.usdaGap).toMatch(/0\.002 mm/)
    expect(c.usdaGap).toMatch(/D7928/)
  })

  const hydrometerTest = (over: Record<string, unknown> = {}) =>
    test({
      type: 'hydrometer', standard: 'd7928',
      data: {
        dryMass: 50, specificGravity: 2.7,
        compositeCorrection: 5, meniscusCorrection: 1, fractionOfTotal: 33,
        readings: [
          { time: 2, reading: 50, temperature: 22 },
          { time: 30, reading: 38, temperature: 22 },
          { time: 250, reading: 26, temperature: 22 },
          { time: 1440, reading: 18, temperature: 22 },
        ],
        ...over,
      },
    })

  it('reads the 0.05 mm boundary ACROSS the join between the two curves', () => {
    // The sieve stops at 0.075 mm and this run starts near 0.025 mm, so the
    // USDA sand/silt boundary at 0.05 mm falls between them and is reached by
    // interpolating the combined curve — the sieve's fines content is NOT it.
    const c = classifySample(sample([
      sieveTest(), atterbergTest({ liquidLimit: 42, plasticLimit: 23 }), hydrometerTest(),
    ]))
    expect(c.usda).toBeDefined()
    const { sand, silt, clay } = c.usda!.composition
    expect(sand + silt + clay).toBeCloseTo(100, 6)
    // Everything between 0.05 and 0.075 mm is USDA sand but USCS fines, so the
    // texture carries MORE sand than reading the boundary off the No. 200 sieve
    // would give. Quoting one system's fraction inside the other's name is the
    // error this guards.
    const fineEarth = 100 - c.usda!.gravel
    const sandIfSieveWereTheBoundary = ((fineEarth - c.gradation!.fines) / fineEarth) * 100
    expect(sand).toBeGreaterThan(sandIfSieveWereTheBoundary)
    // and the clay is a part of the fines, never all of them
    expect(clay).toBeGreaterThan(0)
    expect((clay * fineEarth) / 100).toBeLessThan(c.gradation!.fines)
  })

  it('stops advising a hydrometer once one is on file, and says what is still missing', () => {
    // The sieve engine's "a hydrometer would complete it" is correct until the
    // test exists; printing it beside the sedimentation result reads as a
    // contradiction. It is replaced rather than stacked.
    const withOut = classifySample(sample([sieveTest(), atterbergTest({ liquidLimit: 42, plasticLimit: 23 })]))
    expect(withOut.notes.join(' ')).toMatch(/need a hydrometer analysis/)

    const withIt = classifySample(sample([
      sieveTest(), atterbergTest({ liquidLimit: 42, plasticLimit: 23 }), hydrometerTest(),
    ]))
    expect(withIt.notes.join(' ')).not.toMatch(/need a hydrometer analysis/)
    expect(withIt.notes.join(' ')).toMatch(/still come from the sieve alone/)
    expect(withIt.gradation!.d10).toBeUndefined()
  })

  it('keeps the gravel out of the triangle and names it as a modifier', () => {
    const c = classifySample(sample([
      // 30% gravel: 150 g of a 500 g stack retained above 2.0 mm.
      sieveTest({
        totalMass: 500,
        readings: [
          { size: 4.75, massRetained: 90 },
          { size: 2.0, massRetained: 60 },
          { size: 0.425, massRetained: 130 },
          { size: 0.075, massRetained: 120 },
        ],
        panMass: 100,
      }),
      atterbergTest({ liquidLimit: 42, plasticLimit: 23 }),
      hydrometerTest({ fractionOfTotal: 20 }),
    ]))
    expect(c.usda!.gravel).toBeCloseTo(30, 6)
    expect(c.usda!.name).toMatch(/^gravelly /)
    // The triangle itself sums over the fine earth only.
    const { sand, silt, clay } = c.usda!.composition
    expect(sand + silt + clay).toBeCloseTo(100, 6)
    expect(c.notes.join(' ')).toMatch(/keeps that out of the triangle/)
  })

  it('reports an unreadable sedimentation run rather than classifying around it', () => {
    const c = classifySample(sample([
      sieveTest(), atterbergTest({ liquidLimit: 42, plasticLimit: 23 }),
      hydrometerTest({ specificGravity: 0.5 }),   // Gs below water
    ]))
    expect(c.uscs!.symbol).toBe('SC')             // the sieve is still good
    expect(c.usda).toBeUndefined()
    expect(c.notes.join(' ')).toMatch(/Hydrometer analysis could not be evaluated/)
  })
})

describe('an empty sample', () => {
  it('returns both tests as missing without throwing', () => {
    const c = classifySample(sample([]))
    expect(c.uscs).toBeUndefined()
    expect(c.missing).toEqual(expect.arrayContaining(['sieve', 'atterberg']))
  })
})
