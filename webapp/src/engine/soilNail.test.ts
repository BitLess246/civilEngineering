import { describe, it, expect } from 'vitest'
import { nailTensileCapacity, nailPulloutCapacity, requiredBondLength, designSoilNail } from './soilNail'
import { rankineKa } from './geotech'

describe('nailTensileCapacity', () => {
  it('Tn = Ab·fy; allowable = Tn/FS', () => {
    const Ab = (Math.PI / 4) * 25 ** 2
    const r = nailTensileCapacity({ barDia: 25, fy: 415, FS: 1.8 })
    expect(r.Tn).toBeCloseTo((415 * Ab) / 1000, 6)
    expect(r.Tall).toBeCloseTo(r.Tn / 1.8, 9)
  })
  it('a larger bar carries more', () => {
    expect(nailTensileCapacity({ barDia: 32, fy: 415 }).Tn).toBeGreaterThan(nailTensileCapacity({ barDia: 25, fy: 415 }).Tn)
  })
})

describe('nailPulloutCapacity', () => {
  it('Qult = π·DDH·Le·qu and Qall = Qult/FS', () => {
    const r = nailPulloutCapacity({ drillDia: 0.15, bondLength: 6, qu: 150, FS: 2 })
    expect(r.Qult).toBeCloseTo(Math.PI * 0.15 * 6 * 150, 6)
    expect(r.Qall).toBeCloseTo(r.Qult / 2, 9)
  })
  it('longer bond length ⇒ more pullout capacity', () => {
    const a = nailPulloutCapacity({ drillDia: 0.15, bondLength: 4, qu: 150 })
    const b = nailPulloutCapacity({ drillDia: 0.15, bondLength: 8, qu: 150 })
    expect(b.Qult).toBeCloseTo(2 * a.Qult, 6)
  })
})

describe('requiredBondLength', () => {
  it('inverts the pullout equation: Le = T·FS/(π·DDH·qu)', () => {
    const Le = requiredBondLength({ T: 100, drillDia: 0.15, qu: 150, FS: 2 })
    expect(Le).toBeCloseTo((100 * 2) / (Math.PI * 0.15 * 150), 6)
    // the recovered Le gives exactly Qall = T at that FS
    const q = nailPulloutCapacity({ drillDia: 0.15, bondLength: Le, qu: 150, FS: 2 })
    expect(q.Qall).toBeCloseTo(100, 6)
  })
})

describe('designSoilNail — per-nail demand vs capacity', () => {
  const base = {
    z: 6, Sh: 1.5, Sv: 1.5, gamma: 18, phiDeg: 30, surcharge: 10,
    barDia: 25, fy: 415, drillDia: 0.15, bondLength: 6, qu: 150, FSpullout: 2,
  }
  it('demand Tmax = Ka·(γ·z + q)·Sh·Sv', () => {
    const r = designSoilNail(base)
    expect(r.Ka).toBeCloseTo(rankineKa(30), 9)
    expect(r.Tmax).toBeCloseTo(rankineKa(30) * (18 * 6 + 10) * 1.5 * 1.5, 6)
  })
  it('factors of safety are ultimate/demand and drive the OK flags', () => {
    const r = designSoilNail(base)
    expect(r.fsTensile).toBeCloseTo(r.Tn / r.Tmax, 9)
    expect(r.fsPullout).toBeCloseTo(r.Qult / r.Tmax, 9)
    expect(r.tensileOK).toBe(r.fsTensile >= 1.8)
    expect(r.pulloutOK).toBe(r.fsPullout >= 2.0)
  })
  it('deeper nails and wider spacing raise the demand', () => {
    expect(designSoilNail({ ...base, z: 9 }).Tmax).toBeGreaterThan(designSoilNail(base).Tmax)
    expect(designSoilNail({ ...base, Sh: 2 }).Tmax).toBeGreaterThan(designSoilNail(base).Tmax)
  })
  it('the reported required bond length achieves the pullout FS', () => {
    const r = designSoilNail(base)
    const checked = designSoilNail({ ...base, bondLength: r.bondLengthReq })
    expect(checked.fsPullout).toBeCloseTo(base.FSpullout, 4)
  })
})
