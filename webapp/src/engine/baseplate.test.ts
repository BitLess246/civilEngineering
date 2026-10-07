import { describe, it, expect } from 'vitest'
import { basePlateMoment, designBasePlate, adoptPlateThickness } from './baseplate'

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

describe('base plate — the rods can be installed', () => {
  // W200x26.6: d 207, bf 133 — a light column whose bearing plate would be tiny
  const r = designBasePlate({ Pu: 100, d: 207, bf: 133, fc: 28, rodDia: 25 })
  it('stands the rods outside the flanges: d/2 + max(40, 1.75·da), max(50, 2·da) in from the edge', () => {
    expect(r.rodX).toBeCloseTo(207 / 2 + 43.75, 9)
    expect(r.N).toBeGreaterThanOrEqual(207 + 2 * (43.75 + 50))
    expect(r.N / 2 - r.rodX).toBeGreaterThanOrEqual(50 - 1e-9)
  })
  it('is wide enough for the rods across it to be 4·da apart (ACI §17.7.1)', () => {
    expect(2 * r.rodY).toBeGreaterThanOrEqual(4 * 25 - 1e-9)
  })
})

describe('basePlateMoment — DG1 uniform bearing, axial + moment', () => {
  // N 500 × B 400 plate, f′c 21, A2 = A1: fp(max) = 0.65·0.85·21 = 11.6025 MPa,
  // qmax = 4 641 N/mm. Pu = 500 kN; m = 100 mm; rods 200 mm off the centre.
  const base = { Pu: 500, N: 500, B: 400, m: 100, dBend: 310, tfBend: 15, f: 200, fc: 21, Fy: 248 }

  it('small moment (e 100 ≤ ecrit 196.13): Y = N − 2e = 300, fp = 4.17 MPa, tp = 1.5·m·√(fp/Fy) = 19.44', () => {
    const r = basePlateMoment({ ...base, Mu: 50 })
    expect(r.qmax).toBeCloseTo(4641, 6)
    expect(r.ecrit).toBeCloseTo(196.1323, 3)
    expect(r.regime).toBe('small')
    expect(r.Y).toBeCloseTo(300, 9)
    expect(r.fp).toBeCloseTo(500000 / (300 * 400), 9)
    expect(r.tReq).toBeCloseTo(19.4428, 3)
    expect(r.Tu).toBe(0)
    // the bearing block's centroid IS the load line: N/2 − Y/2 = e
    expect(500 / 2 - r.Y / 2).toBeCloseTo(r.e, 9)
  })

  it('large moment (e 300): Y = 142.16, rods Tu = qmax·Y − Pu = 159.77 kN', () => {
    const r = basePlateMoment({ ...base, Mu: 150 })
    expect(r.regime).toBe('large')
    expect(r.Y).toBeCloseTo(142.1614, 3)
    expect(r.Tu).toBeCloseTo(159.7711, 3)
    // equilibrium, independently of how Y was solved: ΣV and ΣM about the rod line
    expect(r.qmax * r.Y / 1000).toBeCloseTo(500 + r.Tu, 6)
    expect(r.qmax * r.Y * (200 + 250 - r.Y / 2)).toBeCloseTo(500000 * (300 + 200), 0)
    // bearing side at fp(max) over Y ≥ m, tension side about the flange: x = 200 − 155 + 7.5
    expect(r.x).toBeCloseTo(52.5, 9)
    expect(r.tReqBearing).toBeCloseTo(1.5 * 100 * Math.sqrt(11.6025 / 248), 9)
    expect(r.tReqTension).toBeCloseTo(2.11 * Math.sqrt(159771.0989 * 52.5 / (400 * 248)), 3)
  })

  it('a plate too short for the moment has no real Y and says so', () => {
    const r = basePlateMoment({ ...base, Mu: 900 })
    expect(r.regime).toBe('too short')
    expect(r.ok).toBe(false)
  })

  it('net uplift with moment: rods take the couple over 2f plus half the uplift', () => {
    const r = basePlateMoment({ ...base, Pu: -100, Mu: 80 })
    expect(r.regime).toBe('uplift')
    expect(r.Tu).toBeCloseTo(80e6 / 400 / 1000 + 50, 9)
    expect(r.tReqTension).toBeCloseTo(24.2704, 3)
  })
})
