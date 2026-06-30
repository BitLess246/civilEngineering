import { describe, it, expect } from 'vitest'
import {
  nearSourceFactors, seismicCoefficients, importanceFactor, nscpSeismicParams,
  baseShearCoeff, STRUCTURAL_SYSTEMS,
} from './nscpSeismic'

describe('nearSourceFactors — Tables 208-4 / 208-5', () => {
  it('source A endpoints: Na 1.5→1.0 (2→10 km), Nv 2.0→1.0 (2→15 km)', () => {
    expect(nearSourceFactors('A', 2)).toEqual({ Na: 1.5, Nv: 2.0 })
    expect(nearSourceFactors('A', 5)).toEqual({ Na: 1.2, Nv: 1.6 })
    expect(nearSourceFactors('A', 10).Na).toBeCloseTo(1.0, 9)
    expect(nearSourceFactors('A', 15).Nv).toBeCloseTo(1.0, 9)
  })
  it('clamps below 2 km and above the last knot', () => {
    expect(nearSourceFactors('A', 1)).toEqual({ Na: 1.5, Nv: 2.0 })
    expect(nearSourceFactors('A', 50)).toEqual({ Na: 1.0, Nv: 1.0 })
  })
  it('interpolates linearly (A at 3.5 km is midway 2→5)', () => {
    expect(nearSourceFactors('A', 3.5).Na).toBeCloseTo((1.5 + 1.2) / 2, 9)
    expect(nearSourceFactors('A', 3.5).Nv).toBeCloseTo((2.0 + 1.6) / 2, 9)
  })
  it('source C is always unity', () => {
    expect(nearSourceFactors('C', 2)).toEqual({ Na: 1.0, Nv: 1.0 })
  })
})

describe('seismicCoefficients — Tables 208-7 / 208-8', () => {
  it('Zone 2 SD: Ca 0.28, Cv 0.40 (no near-source)', () => {
    expect(seismicCoefficients(2, 'SD')).toEqual({ Ca: 0.28, Cv: 0.40 })
  })
  it('Zone 4 SD source C: Ca 0.44, Cv 0.64', () => {
    const { Na, Nv } = nearSourceFactors('C', 10)
    expect(seismicCoefficients(4, 'SD', Na, Nv)).toEqual({ Ca: 0.44, Cv: 0.64 })
  })
  it('Zone 4 SD source A at 2 km applies Na/Nv', () => {
    const c = seismicCoefficients(4, 'SD', 1.5, 2.0)
    expect(c.Ca).toBeCloseTo(0.44 * 1.5, 9)
    expect(c.Cv).toBeCloseTo(0.64 * 2.0, 9)
  })
  it('Zone 2 ignores near-source factors', () => {
    expect(seismicCoefficients(2, 'SC', 1.5, 2.0)).toEqual({ Ca: 0.24, Cv: 0.32 })
  })
})

describe('importanceFactor — Table 208-1', () => {
  it('essential/hazardous 1.5, special 1.25, standard 1.0', () => {
    expect(importanceFactor('essential')).toBe(1.5)
    expect(importanceFactor('hazardous')).toBe(1.5)
    expect(importanceFactor('special')).toBe(1.25)
    expect(importanceFactor('standard')).toBe(1.0)
  })
})

describe('STRUCTURAL_SYSTEMS', () => {
  it('includes SMRF concrete R = 8.5 and OMRF concrete R = 3.5', () => {
    expect(STRUCTURAL_SYSTEMS.find((s) => s.id === 'smrf-concrete')!.R).toBe(8.5)
    expect(STRUCTURAL_SYSTEMS.find((s) => s.id === 'omrf-concrete')!.R).toBe(3.5)
  })
})

describe('nscpSeismicParams — resolve all', () => {
  it('Zone 4 essential SMRF on SD near a type-A source', () => {
    const r = nscpSeismicParams({ zone: 4, soil: 'SD', occupancy: 'essential', R: 8.5, source: 'A', distanceKm: 2 })
    expect(r.Z).toBe(0.4)
    expect(r.Na).toBe(1.5); expect(r.Nv).toBe(2.0)
    expect(r.Ca).toBeCloseTo(0.44 * 1.5, 9)
    expect(r.Cv).toBeCloseTo(0.64 * 2.0, 9)
    expect(r.I).toBe(1.5); expect(r.R).toBe(8.5)
  })
  it('Zone 2 standard ignores source (Na = Nv = 1)', () => {
    const r = nscpSeismicParams({ zone: 2, soil: 'SC', occupancy: 'standard', R: 5.5 })
    expect(r.Z).toBe(0.2); expect(r.Na).toBe(1); expect(r.Nv).toBe(1)
    expect(r.Ca).toBe(0.24); expect(r.Cv).toBe(0.32); expect(r.I).toBe(1)
  })
})

describe('baseShearCoeff — Cs governing logic (§208.5.2.1)', () => {
  const p = { Ca: 0.44, Cv: 0.64, I: 1, R: 8.5, Z: 0.4, Nv: 1 }
  it('basic Cs = Cv·I/(R·T) when within bounds', () => {
    const r = baseShearCoeff({ ...p, T: 0.6 })
    expect(r.Csraw).toBeCloseTo((0.64 * 1) / (8.5 * 0.6), 9)
    expect(['basic', 'max-cap']).toContain(r.governs)
  })
  it('upper cap 2.5·Ca·I/R governs at very short period', () => {
    const r = baseShearCoeff({ ...p, T: 0.1 })
    expect(r.Cs).toBeCloseTo((2.5 * 0.44 * 1) / 8.5, 9)
    expect(r.governs).toBe('max-cap')
  })
  it('lower / Zone-4 floor governs at long period', () => {
    const r = baseShearCoeff({ ...p, T: 5, Nv: 1.2 })
    expect(r.Cs).toBeGreaterThanOrEqual(0.11 * 0.44 * 1)
    expect(['min-floor', 'zone4-floor']).toContain(r.governs)
  })
})
