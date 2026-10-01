import { describe, it, expect } from 'vitest'
import { boltZDoubleSteel, designPostBase } from './postBase'
import { WOOD_SPECIES } from './woodDesign'

describe('NDS §12.3.1 yield limit — double shear, steel side plates', () => {
  // Imperial hand calc, ½″ bolt through a 3½″ DFL (G 0.50) main member with ¼″
  // A36 side plates, parallel to grain: Fem 5 600, Fes 87 000, Fyb 45 000 psi.
  //   Im   0.5·3.5·5600/4                         = 2 450 lbf
  //   Is   2·0.5·0.25·87000/4                     = 5 437 lbf
  //   IIIs k3 = 7.7924 → 2·k3·0.5·0.25·5600/(2.0644·3.2) = 1 651 lbf  ← governs
  //   IV   (2·0.25/3.2)·√(2·5600·45000/(3·1.0644)) = 1 963 lbf
  const r = boltZDoubleSteel(12.7, 88.9, 6.35, 0.5, 0)
  it('reproduces the imperial result in SI: IIIs governs at 1 651 lbf = 7 346 N', () => {
    expect(r.mode).toBe('IIIs')
    expect(Math.abs(r.Z - 1651.4 * 4.44822) / (1651.4 * 4.44822)).toBeLessThan(0.005)
  })
  it('perpendicular to grain uses Fe⊥ = 212·G^1.45/√D and Kθ = 1.25 — a smaller Z', () => {
    const q = boltZDoubleSteel(12.7, 88.9, 6.35, 0.5, 90)
    expect(q.Z).toBeLessThan(r.Z)
    // Im at 90°: D·ℓm·Fe⊥/(4·1.25), the bearing mode in the post
    const Fe = (212 * 0.5 ** 1.45) / Math.sqrt(12.7)
    expect(q.Z).toBeLessThanOrEqual((12.7 * 88.9 * Fe) / 5 + 1e-9)
  })
})

describe('post base — a 150 × 150 Apitong post on a 450 pedestal', () => {
  const ref = WOOD_SPECIES['PH-APITONG-80']!.ref
  const base = { b: 150, d: 150, ref, kind: 'sawn' as const, pedestalSide: 450, pedestalHeight: 1250, fc: 28 }

  it('gravity only: the post bears on the plate, nothing pulls, everything passes', () => {
    const r = designPostBase({ ...base, Pu: 80, Tu: 0, Vu: 5 })
    const bearing = r.checks.find((c) => c.name === 'post end bearing')!
    expect(bearing.util).toBeGreaterThan(0)
    expect(r.ok).toBe(true)
    expect(r.plate).toEqual({ N: 350, B: 190, t: r.plate.t })   // d + 4·50, b + 40
    expect(r.rods.x).toBe(125)                                  // d/2 + 50, outboard of the straps
  })

  it('uplift grows the bolts until n·Z′∥ carries it, with 7D end and 4D spacing in the post', () => {
    const r = designPostBase({ ...base, Pu: 0, Tu: 40, Vu: 10, seismic: true })
    expect(r.bolts.n * r.ZparPrime).toBeGreaterThanOrEqual(40)
    expect(r.bolts.end).toBe(7 * r.bolts.D)
    expect(r.bolts.spacing).toBe(4 * r.bolts.D)
    expect(r.straps.h).toBe(7 * r.bolts.D + 4 * r.bolts.D * (r.bolts.n - 1) + 2 * r.bolts.D)
    // LRFD: Z′ = Z·KF 3.32·φz 0.65·λ 1.0 (seismic)
    const Z = boltZDoubleSteel(r.bolts.D, 150, r.straps.t, ref.G, 0).Z
    expect(r.ZparPrime).toBeCloseTo((Z * 3.32 * 0.65 * 1.0) / 1000, 9)
  })

  it('the rods are checked by ACI 318-14 Ch. 17 under the same uplift and shear', () => {
    const r = designPostBase({ ...base, Pu: 0, Tu: 40, Vu: 10, seismic: true })
    expect(r.anchors.n).toBe(2)
    expect(r.checks.some((c) => c.clause === 'ACI 318-14 Ch. 17')).toBe(true)
    expect(r.rods.hef).toBeLessThanOrEqual(1250 - 100)
  })

  it('wet service takes CM 0.7 on the dowels', () => {
    const dry = designPostBase({ ...base, Pu: 0, Tu: 10, Vu: 0 })
    const wet = designPostBase({ ...base, Pu: 0, Tu: 10, Vu: 0, wet: true })
    if (dry.bolts.D === wet.bolts.D && dry.straps.t === wet.straps.t)
      expect(wet.ZparPrime).toBeCloseTo(0.7 * dry.ZparPrime, 9)
  })

  it('an uplift no bolt group can carry is reported, not passed', () => {
    const r = designPostBase({ ...base, Pu: 0, Tu: 2000, Vu: 0 })
    expect(r.ok).toBe(false)
    expect(r.util).toBeGreaterThan(1)
  })
})
