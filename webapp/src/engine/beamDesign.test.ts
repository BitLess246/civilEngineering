import { describe, it, expect } from 'vitest'
import { designBeam, type BeamDesignInput } from './beamDesign'

const base: BeamDesignInput = {
  b: 300, h: 500, cover: 40, barDia: 20, stirrupDia: 10,
  fc: 28, fy: 415, Mu: 180, Vu: 150,
}

describe('beam design — SRRB', () => {
  it('moderate moment stays singly reinforced', () => {
    const r = designBeam(base)
    expect(r.mode).toBe('SRRB')
    expect(r.d).toBeCloseTo(500 - 40 - 10 - 10) // 440
    expect(r.As).toBeGreaterThan(0)
    expect(r.bars).toBeGreaterThanOrEqual(2)
    expect(r.rho).toBeGreaterThanOrEqual(r.rhoMin)
    expect(r.rho).toBeLessThanOrEqual(r.rhoMax + 1e-9)
    expect(r.comprBars).toBe(0)
  })

  it('tiny moment falls back to ρ_min', () => {
    const r = designBeam({ ...base, Mu: 10 })
    expect(r.usedMin).toBe(true)
  })

  it('ρ_max = 0.75 ρ_b (legacy limit)', () => {
    const r = designBeam(base)
    expect(r.rhoMax).toBeCloseTo(0.75 * r.rhoB, 12)
  })
})

describe('beam design — DRRB', () => {
  it('Mu beyond the singly-reinforced ceiling designs compression steel', () => {
    const r = designBeam({ ...base, b: 250, h: 400, Mu: 600 })
    expect(r.mode).toBe('DRRB')
    expect(600).toBeGreaterThan(r.phiMnMax)
    expect(r.As).toBeCloseTo(r.As1 + r.As2, 6)
    expect(r.AsPrime).toBeGreaterThan(0)
    expect(r.comprBars).toBeGreaterThanOrEqual(2)
    // when f's < fy, A's is scaled up from As2
    if (!r.fsYields) expect(r.AsPrime).toBeGreaterThan(r.As2)
    else expect(r.AsPrime).toBeCloseTo(r.As2, 6)
  })

  it('the classification boundary is exact at φMn_max', () => {
    const probe = designBeam(base)
    const atCeiling = designBeam({ ...base, Mu: probe.phiMnMax - 0.01 })
    const beyond = designBeam({ ...base, Mu: probe.phiMnMax + 0.01 })
    expect(atCeiling.mode).toBe('SRRB')
    expect(beyond.mode).toBe('DRRB')
  })
})

describe('beam design — shear', () => {
  it('low shear needs no stirrups, mid shear needs minimum', () => {
    const r = designBeam(base)
    const lo = designBeam({ ...base, Vu: r.phiVc * 0.4 })
    const mid = designBeam({ ...base, Vu: r.phiVc * 0.9 })
    expect(lo.region).toBe('none')
    expect(mid.region).toBe('minimum')
    expect(mid.sAdopt).toBeGreaterThan(0)
  })

  it('high shear designs stirrups with spacing ≤ s_max', () => {
    const r = designBeam({ ...base, Vu: 280 })
    expect(r.region).toBe('designed')
    expect(r.sAdopt).toBeLessThanOrEqual(r.sMax)
    expect(r.sAdopt).toBeGreaterThan(0)
  })

  it('flags an inadequate section when Vs exceeds the cap', () => {
    const r = designBeam({ ...base, b: 200, h: 350, Vu: 600 })
    expect(r.region).toBe('inadequate')
  })
})
