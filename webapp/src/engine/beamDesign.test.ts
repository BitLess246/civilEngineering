import { describe, it, expect } from 'vitest'
import { designBeam, type BeamDesignInput } from './beamDesign'

const base: BeamDesignInput = {
  b: 300, h: 500, cover: 40, barDia: 20, stirrupDia: 10,
  fc: 28, fy: 415, Mu: 180, Vu: 150,
}

describe('beam design — flexure', () => {
  it('effective depth and a sane steel area', () => {
    const r = designBeam(base)
    expect(r.d).toBeCloseTo(500 - 40 - 10 - 10) // 440
    expect(r.As).toBeGreaterThan(0)
    expect(r.bars).toBeGreaterThanOrEqual(2)
    expect(r.rho).toBeGreaterThanOrEqual(r.rhoMin)
    expect(r.tensionControlled).toBe(true)
  })

  it('tiny moment falls back to ρ_min', () => {
    const r = designBeam({ ...base, Mu: 10 })
    expect(r.usedMin).toBe(true)
  })

  it('huge moment exceeds the tension-controlled limit', () => {
    const r = designBeam({ ...base, b: 250, h: 400, Mu: 600 })
    expect(r.tensionControlled).toBe(false)
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
    expect(r.sReq).toBeGreaterThan(0)
    expect(r.sAdopt).toBeLessThanOrEqual(r.sMax)
    expect(r.sAdopt).toBeGreaterThan(0)
  })

  it('flags an inadequate section when Vs exceeds the cap', () => {
    const r = designBeam({ ...base, b: 200, h: 350, Vu: 600 })
    expect(r.region).toBe('inadequate')
  })
})
