import { describe, expect, it } from 'vitest'
import { designBeam } from '../engine/beamDesign'
import { beamStressBlock } from './beamStressBlock'

describe('beamStressBlock', () => {
  it('SRRB: C = T = As·fy, a = As·fy / (0.85 f′c b), c = a/β1, Mn = T(d − a/2)', () => {
    const r = designBeam({ b: 300, h: 500, cover: 40, barDia: 20, stirrupDia: 10, fc: 28, fy: 415, fyt: 415, Mu: 180, Vu: 150 })
    expect(r.mode).toBe('SRRB')
    const s = beamStressBlock(r, 28, 415)
    expect(s.T).toBeCloseTo((r.AsProv * 415) / 1000, 9)
    expect(s.Cc).toBeCloseTo(s.T, 6)                       // equilibrium
    expect(s.a).toBeCloseTo((r.AsProv * 415) / (0.85 * 28 * 300), 6)
    expect(s.c).toBeCloseTo(s.a / 0.85, 9)                 // β1 = 0.85 at 28 MPa
    expect(s.Cs).toBe(0)
    expect(s.Mn).toBeCloseTo((s.T * (r.d - s.a / 2)) / 1000, 9)
    // φMn ≥ Mu — the couple carries the design moment
    expect(0.9 * s.Mn).toBeGreaterThanOrEqual(180)
  })

  it('DRRB: T = Cc + Cs and the neutral axis is the engine\'s', () => {
    const r = designBeam({ b: 250, h: 400, cover: 40, barDia: 20, stirrupDia: 10, fc: 21, fy: 415, fyt: 275, Mu: 260, Vu: 80 })
    expect(r.mode).toBe('DRRB')
    const s = beamStressBlock(r, 21, 415)
    expect(s.Cs).toBeGreaterThan(0)
    expect(s.T).toBeCloseTo(s.Cc + s.Cs, 9)
    expect(s.c).toBeCloseTo(r.cNA, 9)
  })
})
