import { describe, it, expect } from 'vitest'
import { designTorsion } from './torsionDesign'

// Reference section: 400 × 600 mm, cover=40, ds=12, db=20, fc=28, fy=fyt=415
// Tu=80 kN·m, Vu=200 kN, legs=2, lambda=1
const BASE = {
  b: 400, h: 600, cover: 40, stirrupDia: 12, barDia: 20,
  fc: 28, fy: 415, fyt: 415, Tu: 80, Vu: 200,
}

describe('designTorsion — section geometry', () => {
  const r = designTorsion(BASE)

  it('effective depth d = h − cover − ds − db/2', () => {
    // 600 − 40 − 12 − 10 = 538
    expect(r.d).toBeCloseTo(538, 9)
  })

  it('Acp = b·h  and  pcp = 2(b+h)', () => {
    expect(r.Acp).toBeCloseTo(400 * 600, 9)
    expect(r.pcp).toBeCloseTo(2 * (400 + 600), 9)
  })

  it('cSt = cover + ds/2', () => {
    // 40 + 6 = 46 mm
    expect(r.cSt).toBeCloseTo(46, 9)
  })

  it('x1, y1, Aoh, ph, Ao', () => {
    const x1 = 400 - 2 * 46        // 308
    const y1 = 600 - 2 * 46        // 508
    expect(r.x1).toBeCloseTo(x1, 9)
    expect(r.y1).toBeCloseTo(y1, 9)
    expect(r.Aoh).toBeCloseTo(x1 * y1, 9)
    expect(r.ph).toBeCloseTo(2 * (x1 + y1), 9)
    expect(r.Ao).toBeCloseTo(0.85 * x1 * y1, 9)
  })
})

describe('designTorsion — torsion thresholds §22.7.4.1 / §22.7.3', () => {
  const r = designTorsion(BASE)
  const sqrtFc = Math.sqrt(28)
  const Acp2_pcp = (400 * 600) ** 2 / (2 * (400 + 600))

  it('Tu_th = φ·λ·√f\'c·Acp²/(12·pcp) (kN·m)', () => {
    const expected = 0.75 * 1 * sqrtFc * Acp2_pcp / 12 / 1e6
    expect(r.Tu_th).toBeCloseTo(expected, 9)
  })

  it('Tcr = λ·√f\'c·Acp²/(3·pcp) (kN·m)', () => {
    const expected = 1 * sqrtFc * Acp2_pcp / 3 / 1e6
    expect(r.Tcr).toBeCloseTo(expected, 9)
  })

  it('Tcr/Tu_th = 4/φ = 16/3 (for λ=1, φ=0.75)', () => {
    // Tcr uses /3, Tu_th uses /12 and ×φ → ratio = (1/3)/(φ/12) = 4/φ
    expect(r.Tcr / r.Tu_th).toBeCloseTo(4 / 0.75, 6)
  })

  it('torsionNeeded = true when Tu ≥ Tu_th', () => {
    // Tu=80 >> Tu_th ≈ 9.5 kN·m
    expect(r.torsionNeeded).toBe(true)
  })

  it('torsionNeeded = false when Tu < Tu_th', () => {
    const r2 = designTorsion({ ...BASE, Tu: 1 })   // 1 kN·m << threshold
    expect(r2.torsionNeeded).toBe(false)
  })

  it('AtPerS = 0 when torsion not needed', () => {
    const r2 = designTorsion({ ...BASE, Tu: 1 })
    expect(r2.AtPerS).toBe(0)
    expect(r2.AtPerS_min).toBe(0)
  })
})

describe('designTorsion — shear concrete capacity', () => {
  const r = designTorsion(BASE)
  const sqrtFc = Math.sqrt(28)
  const d = 600 - 40 - 12 - 20 / 2  // 538

  it('Vc = λ·√f\'c·b·d / (6·1000)  (kN)', () => {
    const expected = 1 * sqrtFc * 400 * d / (6 * 1000)
    expect(r.Vc).toBeCloseTo(expected, 9)
  })

  it('phiVc = 0.75·Vc', () => {
    expect(r.phiVc).toBeCloseTo(0.75 * r.Vc, 9)
  })
})

describe('designTorsion — interaction check §22.7.7.1', () => {
  const r = designTorsion(BASE)
  const d = 538
  const x1 = 308, y1 = 508
  const Aoh = x1 * y1
  const ph = 2 * (x1 + y1)
  const sqrtFc = Math.sqrt(28)

  it('lhs = √[(Vu/bwd)² + (Tu·ph/1.7Aoh²)²]  (MPa)', () => {
    const vu = (200 * 1000) / (400 * d)
    const tu = (80 * 1e6 * ph) / (1.7 * Aoh ** 2)
    const expected = Math.sqrt(vu ** 2 + tu ** 2)
    expect(r.lhs).toBeCloseTo(expected, 9)
  })

  it('rhs = φ·(Vc/bwd + 2/3·√f\'c)  (MPa)', () => {
    const expected = 0.75 * (r.Vc * 1000 / (400 * d) + (2 / 3) * sqrtFc)
    expect(r.rhs).toBeCloseTo(expected, 9)
  })

  it('interactionOK = true for the reference section', () => {
    expect(r.interactionOK).toBe(true)
  })

  it('interactionOK = false when section is inadequate', () => {
    // Very large torsion overwhelms the section
    const r2 = designTorsion({ ...BASE, Tu: 500, Vu: 500 })
    expect(r2.interactionOK).toBe(false)
  })
})

describe('designTorsion — transverse steel At/s §22.7.6.1', () => {
  const r = designTorsion(BASE)
  const sqrtFc = Math.sqrt(28)
  const Ao = 0.85 * 308 * 508

  it('AtPerS = Tu·1e6 / (φ·2·Ao·fyt)', () => {
    const expected = 80 * 1e6 / (0.75 * 2 * Ao * 415)
    expect(r.AtPerS).toBeCloseTo(expected, 9)
  })

  it('AtPerS_min = max(0.0625√f\'c/fyt, 0.35/fyt)', () => {
    const expected = Math.max(0.0625 * sqrtFc / 415, 0.35 / 415)
    expect(r.AtPerS_min).toBeCloseTo(expected, 9)
  })

  it('AtPerS_design = max(AtPerS, AtPerS_min)', () => {
    expect(r.AtPerS_design).toBeCloseTo(Math.max(r.AtPerS, r.AtPerS_min), 9)
    // For Tu=80, AtPerS >> AtPerS_min
    expect(r.AtPerS_design).toBeCloseTo(r.AtPerS, 9)
  })
})

describe('designTorsion — longitudinal steel Al §22.7.5', () => {
  const r = designTorsion(BASE)
  const sqrtFc = Math.sqrt(28)
  const ph = 2 * (308 + 508)

  it('Al = AtPerS_design·ph·(fyt/fy)', () => {
    const expected = r.AtPerS_design * ph * (415 / 415)
    expect(r.Al).toBeCloseTo(expected, 9)
  })

  it('Al_min = max(0, 5√f\'c·Acp/(12·fy) − AtPerS·ph·(fyt/fy))', () => {
    const term = 5 * sqrtFc * (400 * 600) / (12 * 415) - r.AtPerS_design * ph * (415 / 415)
    const expected = Math.max(0, term)
    expect(r.Al_min).toBeCloseTo(expected, 9)
  })

  it('Al_min = 0 when AtPerS is large enough to cover minimum', () => {
    // For Tu=80 the formula Al_min is negative → clamped to 0
    expect(r.Al_min).toBeCloseTo(0, 9)
    expect(r.Al_design).toBeCloseTo(r.Al, 9)
  })

  it('Al_min is positive when At/s is at minimum only', () => {
    // Use Tu just at threshold so AtPerS_design = AtPerS_min (very small)
    const r2 = designTorsion({ ...BASE, Tu: r.Tu_th + 0.001 })
    expect(r2.Al_min).toBeGreaterThan(0)
  })
})

describe('designTorsion — combined stirrups and spacing', () => {
  const r = designTorsion(BASE)
  const d = 538

  it('Vs = max(0, Vu/φ − Vc)', () => {
    const expected = Math.max(0, 200 / 0.75 - r.Vc)
    expect(r.Vs).toBeCloseTo(expected, 9)
  })

  it('AvPerS = Vs·1000 / (fyt·d)', () => {
    const expected = r.Vs > 0 ? (r.Vs * 1000) / (415 * d) : 0
    expect(r.AvPerS).toBeCloseTo(expected, 9)
  })

  it('AvPlus2At_min = max(0.0625√f\'c, 0.35)·b/fyt  (§22.5.10.5)', () => {
    const sqrtFc = Math.sqrt(28)
    const expected = Math.max(0.0625 * sqrtFc, 0.35) * 400 / 415
    expect(r.AvPlus2At_min).toBeCloseTo(expected, 9)
  })

  it('AvPlus2At = max(AvPerS + 2·AtPerS_design, combined_min)', () => {
    const raw = r.AvPerS + 2 * r.AtPerS_design
    expect(r.AvPlus2At).toBeCloseTo(Math.max(raw, r.AvPlus2At_min), 9)
  })

  it('sReq = legs·Ab / AvPlus2At', () => {
    const Ab = (Math.PI / 4) * 12 ** 2
    const expected = (2 * Ab) / r.AvPlus2At
    expect(r.sReq).toBeCloseTo(expected, 6)
  })

  it('sMax = min(ph/8, 300, d/2, 600)', () => {
    const ph = 2 * (308 + 508)
    const expected = Math.min(ph / 8, 300, d / 2, 600)
    expect(r.sMax).toBeCloseTo(expected, 9)
  })

  it('sAdopt = min(sReq, sMax)', () => {
    expect(r.sAdopt).toBeCloseTo(Math.min(r.sReq, r.sMax), 9)
  })

  it('respects legs=4 (double-leg) properly', () => {
    const r4 = designTorsion({ ...BASE, legs: 4 })
    const Ab = (Math.PI / 4) * 12 ** 2
    expect(r4.sReq).toBeCloseTo((4 * Ab) / r4.AvPlus2At, 6)
    // More legs → larger sReq (less congested)
    expect(r4.sReq).toBeGreaterThan(r.sReq)
  })
})
