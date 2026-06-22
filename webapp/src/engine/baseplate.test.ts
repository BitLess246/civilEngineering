import { describe, it, expect } from 'vitest'
import { designBasePlate, adoptPlateThickness } from './baseplate'

describe('designBasePlate §J8 / DG1', () => {
  // W250x67-ish column: d≈257, bf≈204; Pu = 1500 kN; f'c = 28; A36 plate.
  const base = { Pu: 1500, d: 257, bf: 204, fc: 28, Fy: 248 }

  it('bearing capacity uses φc·0.85f′c·√(A2/A1)', () => {
    const r = designBasePlate({ ...base, a2OverA1: 1 })
    expect(r.sqrtRatio).toBeCloseTo(1, 6)
    expect(r.fpMax).toBeCloseTo(0.65 * 0.85 * 28 * 1, 6)
  })

  it('√(A2/A1) is capped at 2.0 even for a large pier', () => {
    const r = designBasePlate({ ...base, a2OverA1: 9 })
    expect(r.sqrtRatio).toBe(2.0)
  })

  it('adopted plate satisfies bearing (util ≤ 1, A1 ≥ A1req)', () => {
    const r = designBasePlate(base)
    expect(r.A1).toBeGreaterThanOrEqual(r.A1req - 1e-6)
    expect(r.bearingUtil).toBeLessThanOrEqual(1 + 1e-9)
    expect(r.bearingOK).toBe(true)
  })

  it('plate covers the column footprint', () => {
    const r = designBasePlate(base)
    expect(r.N).toBeGreaterThanOrEqual(base.d)
    expect(r.B).toBeGreaterThanOrEqual(base.bf)
  })

  it('cantilever ℓ = max(m, n, n′) and tReq = ℓ√(2fp/(0.9Fy))', () => {
    const r = designBasePlate(base)
    expect(r.ell).toBeCloseTo(Math.max(r.m, r.n, r.nPrime), 6)
    expect(r.tReq).toBeCloseTo(r.ell * Math.sqrt((2 * r.fp) / (0.9 * 248)), 5)
  })

  it('bigger pier (higher A2/A1) → smaller required area', () => {
    const small = designBasePlate({ ...base, a2OverA1: 1 })
    const big = designBasePlate({ ...base, a2OverA1: 4 })
    expect(big.A1req).toBeLessThan(small.A1req)
  })

  it('no uplift → anchors OK and zero required area', () => {
    const r = designBasePlate(base)
    expect(r.Tu).toBe(0)
    expect(r.rodAbReq).toBe(0)
    expect(r.anchorOK).toBe(true)
  })

  it('net uplift sizes anchor rods (φt·0.75·Fu)', () => {
    const r = designBasePlate({ ...base, Tu: 200, nRods: 4, rodGrade: 'A307', rodDia: 25 })
    const Fu = 414
    expect(r.rodAbReq).toBeCloseTo((200 * 1000) / (4 * 0.75 * 0.75 * Fu), 4)
    // 4 × ⌀25 A307 rods vs the demand
    const Ab = (Math.PI / 4) * 25 * 25
    const cap = 4 * (0.75 * 0.75 * Fu * Ab) / 1000
    expect(r.anchorOK).toBe(cap >= 200)
  })

  it('higher Pu needs a thicker plate', () => {
    const a = designBasePlate({ ...base, Pu: 800 })
    const b = designBasePlate({ ...base, Pu: 2500 })
    expect(b.tReq).toBeGreaterThan(a.tReq)
  })
})

describe('adoptPlateThickness', () => {
  it('rounds up to the next plate stock size', () => {
    expect(adoptPlateThickness(11)).toBe(12)
    expect(adoptPlateThickness(20)).toBe(20)
    expect(adoptPlateThickness(21)).toBe(22)
  })
})
