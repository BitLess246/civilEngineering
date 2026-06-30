import { describe, it, expect } from 'vitest'
import { tendonCapacity, groundBondCapacity, requiredBondLength, designRockAnchor } from './rockAnchor'

describe('tendonCapacity', () => {
  it('GUTS = fpu·Aps; Td = 0.60·GUTS', () => {
    const r = tendonCapacity({ fpu: 1860, Aps: 1000 })
    expect(r.GUTS).toBeCloseTo((1860 * 1000) / 1000, 6)     // 1860 kN
    expect(r.Td).toBeCloseTo(0.6 * r.GUTS, 9)
  })
  it('a custom design factor scales the design load', () => {
    expect(tendonCapacity({ fpu: 1860, Aps: 1000, designFactor: 0.5 }).Td).toBeCloseTo(0.5 * 1860, 6)
  })
})

describe('groundBondCapacity', () => {
  it('Qult = π·Dhole·Lbond·τult; Qall = Qult/FS', () => {
    const r = groundBondCapacity({ holeDia: 0.115, bondLength: 6, tauUlt: 700, FS: 2 })
    expect(r.Qult).toBeCloseTo(Math.PI * 0.115 * 6 * 700, 6)
    expect(r.Qall).toBeCloseTo(r.Qult / 2, 9)
  })
  it('requiredBondLength round-trips to the demand at the FS', () => {
    const Le = requiredBondLength({ T: 500, holeDia: 0.115, tauUlt: 700, FS: 2 })
    const r = groundBondCapacity({ holeDia: 0.115, bondLength: Le, tauUlt: 700, FS: 2 })
    expect(r.Qall).toBeCloseTo(500, 6)
  })
})

describe('designRockAnchor', () => {
  const base = { fpu: 1860, Aps: 1000, holeDia: 0.115, bondLength: 6, tauUlt: 700, FS: 2, T: 600 }
  it('governing allowable is the smaller of tendon design load and ground bond', () => {
    const r = designRockAnchor(base)
    expect(r.allowable).toBeCloseTo(Math.min(r.Td, r.Qall), 9)
    expect(r.governs).toBe(r.Td <= r.Qall ? 'tendon' : 'bond')
  })
  it('proof/test load = min(1.33·T, 0.80·GUTS)', () => {
    const r = designRockAnchor(base)
    expect(r.testLoad).toBeCloseTo(Math.min(1.33 * 600, 0.8 * r.GUTS), 6)
  })
  it('FS = allowable/demand, with mode OK flags', () => {
    const r = designRockAnchor(base)
    expect(r.fs).toBeCloseTo(r.allowable / 600, 9)
    expect(r.tendonOK).toBe(r.Td >= 600)
    expect(r.bondOK).toBe(r.Qall >= 600)
    expect(r.ok).toBe(r.allowable >= 600)
  })
  it('a short bond zone makes bond govern; lengthening it relieves it', () => {
    const short = designRockAnchor({ ...base, bondLength: 1.5 })
    const long = designRockAnchor({ ...base, bondLength: 10 })
    expect(short.Qall).toBeLessThan(long.Qall)
    expect(short.governs).toBe('bond')
  })
})
