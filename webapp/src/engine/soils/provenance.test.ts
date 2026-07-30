import { describe, it, expect } from 'vitest'
import {
  measured, derived, correlated, assumed,
  describeProvenance, isEvidenceBased, provenanceMix, standardsUsed,
  type SourcedValue,
} from './provenance'
import { isCalcId } from './registry'
import { isStandardId } from './standards'

const phiMeasured = measured(31, '°', { testId: 't1', standard: 'd3080', sampleId: 'S-02' })
const phiCorrelated = correlated(34, '°', {
  basis: 'corrected SPT (N₁)₆₀ = 18',
  source: 'Hatanaka & Uchida (1996)',
  scatter: '±3°',
})
const piDerived = derived(23, '%', { calculation: 'atterberg.plasticity-index', from: ['LL', 'PL'] })
const nuAssumed = assumed(0.3, '—', { rationale: 'Typical for a medium dense sand; no test available.' })

describe('provenance describes where a value came from', () => {
  it('names the standard for a measured value', () => {
    expect(describeProvenance(phiMeasured.provenance))
      .toBe('Measured — ASTM D3080 on sample S-02')
  })

  it('names the correlation AND its scatter', () => {
    // A correlation quoted without its scatter reads far more precise than it
    // is — which is exactly the misreading this module exists to prevent.
    const text = describeProvenance(phiCorrelated.provenance)
    expect(text).toContain('Hatanaka & Uchida (1996)')
    expect(text).toContain('±3°')
    expect(text.startsWith('Correlated')).toBe(true)
  })

  it('names the calculation for a derived value', () => {
    expect(describeProvenance(piDerived.provenance))
      .toBe('Derived — atterberg.plasticity-index from LL, PL')
  })

  it('requires a rationale for an assumption and prints it', () => {
    expect(describeProvenance(nuAssumed.provenance)).toContain('no test available')
  })

  it('never returns an empty description for any kind', () => {
    // A value whose provenance cannot be described is a bug; a blank would hide it.
    const all = [phiMeasured, phiCorrelated, piDerived, nuAssumed]
    for (const v of all) expect(describeProvenance(v.provenance).length).toBeGreaterThan(10)
  })
})

describe('evidence', () => {
  it('counts measured and derived as evidence-based, correlated and assumed as not', () => {
    expect(isEvidenceBased(phiMeasured.provenance)).toBe(true)
    expect(isEvidenceBased(piDerived.provenance)).toBe(true)
    expect(isEvidenceBased(phiCorrelated.provenance)).toBe(false)
    expect(isEvidenceBased(nuAssumed.provenance)).toBe(false)
  })

  it('summarises the mix across a parameter set', () => {
    const mix = provenanceMix([phiMeasured, phiCorrelated, piDerived, nuAssumed, phiCorrelated])
    expect(mix).toEqual({ measured: 1, derived: 1, correlated: 2, assumed: 1 })
  })

  it('lists the standards a set of values was measured to, without duplicates', () => {
    const values: SourcedValue[] = [
      phiMeasured,
      measured(2.67, '—', { testId: 't2', standard: 'd854' }),
      measured(29, '°', { testId: 't3', standard: 'd3080' }),
      phiCorrelated,
    ]
    expect(standardsUsed(values)).toEqual(['d3080', 'd854'])
  })
})

describe('provenance ids point at things that exist', () => {
  it('a derived value names a real registry calculation', () => {
    // Catches a typo'd calculation id, which would otherwise surface as a blank
    // equation in a printed calculation sheet.
    expect(isCalcId(piDerived.provenance.kind === 'derived' && piDerived.provenance.calculation)).toBe(true)
  })

  it('a measured value names a real standard', () => {
    expect(isStandardId(phiMeasured.provenance.kind === 'measured' && phiMeasured.provenance.standard)).toBe(true)
  })
})

describe('SourcedValue carries its own unit', () => {
  it('so a parameter table can render without a lookup', () => {
    expect(phiMeasured.unit).toBe('°')
    expect(piDerived.unit).toBe('%')
  })

  it('round-trips through JSON — the model has to be storable', () => {
    const back = JSON.parse(JSON.stringify(phiCorrelated)) as SourcedValue
    expect(back).toEqual(phiCorrelated)
    expect(describeProvenance(back.provenance)).toBe(describeProvenance(phiCorrelated.provenance))
  })
})
