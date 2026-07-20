import { describe, it, expect } from 'vitest'
import {
  WOOD_SPECIES, getWoodRef, loadDurationFactor, sizeFactorTimber, volumeFactorGlulam,
  effectiveBendingLength, beamStabilityFactor, columnStabilityFactor, woodSectionProps,
  woodAdjusted, checkWoodBeam, checkWoodColumn, woodUnitWeight,
  speciesList, gradesOf, resolveWoodSpecies, woodRefOf, validateWoodRef,
} from './woodDesign'

describe('reference value library', () => {
  it('DFL Select Structural ≈ NDS Table 4A (1500/180/1700 psi → MPa)', () => {
    const ref = getWoodRef('DFL-SS')!.ref
    expect(ref.Fb).toBeCloseTo(10.342, 2)     // 1500 psi
    expect(ref.Fv).toBeCloseTo(1.241, 2)      // 180 psi
    expect(ref.Fc).toBeCloseTo(11.721, 2)     // 1700 psi
    expect(ref.E).toBeCloseTo(13100, 0)       // 1.9e6 psi
    expect(ref.Emin).toBeCloseTo(4757.4, 0)   // 0.69e6 psi
  })
  it('every species has strictly positive design values', () => {
    for (const s of Object.values(WOOD_SPECIES)) {
      for (const v of Object.values(s.ref)) expect(v).toBeGreaterThan(0)
      expect(s.ref.Emin).toBeLessThan(s.ref.E)   // stability modulus < mean E
    }
  })
})

describe('structured library — species / grade separation', () => {
  it('keeps the stable flat ids for back-compatibility', () => {
    for (const id of ['DFL-SS', 'DFL-1', 'DFL-2', 'HF-2', 'SPF-2', 'SP-2', 'GLULAM-24F'])
      expect(getWoodRef(id), id).toBeTruthy()
  })
  it('speciesList returns the distinct species (DFL first, 5 total)', () => {
    const sp = speciesList()
    expect(sp.map((s) => s.species)).toEqual(['DFL', 'HF', 'SPF', 'SP', 'GLULAM'])
    expect(sp[0].label).toBe('Douglas Fir-Larch')
  })
  it('gradesOf lists the grades within a species', () => {
    expect(gradesOf('DFL').map((g) => g.grade)).toEqual(['SS', '1', '2'])
    expect(gradesOf('HF')).toHaveLength(1)
  })
  it('resolveWoodSpecies composes the id from species + grade', () => {
    expect(resolveWoodSpecies('DFL', '2')!.id).toBe('DFL-2')
    expect(resolveWoodSpecies('DFL', 'nope')).toBeUndefined()
  })
})

describe('woodRefOf — the section → reference-values contract', () => {
  const custom = { Fb: 30, Ft: 20, Fv: 4, FcPerp: 8, Fc: 18, E: 15000, Emin: 5200, G: 0.75 }
  it('an explicit woodRef (custom material) wins over the library id', () => {
    expect(woodRefOf({ woodSpecies: 'DFL-2', woodRef: custom })).toBe(custom)
  })
  it('falls back to the library id when no woodRef is stored', () => {
    expect(woodRefOf({ woodSpecies: 'DFL-2' })).toBe(getWoodRef('DFL-2')!.ref)
  })
  it('returns undefined when neither is available', () => {
    expect(woodRefOf({})).toBeUndefined()
    expect(woodRefOf({ woodSpecies: 'not-a-species' })).toBeUndefined()
  })
})

describe('validateWoodRef — guards the custom-material path', () => {
  it('accepts a sound reference set', () => {
    expect(validateWoodRef({ Fb: 24, Ft: 16, Fv: 2.5, FcPerp: 6, Fc: 16, E: 16000, Emin: 5500, G: 0.8 })).toEqual([])
  })
  it('rejects non-positive stresses', () => {
    expect(validateWoodRef({ Fb: 0, Ft: 16, Fv: 2.5, FcPerp: 6, Fc: 16, E: 16000, Emin: 5500, G: 0.8 })).not.toHaveLength(0)
  })
  it('requires Emin < E and G ≤ 1.4', () => {
    expect(validateWoodRef({ Fb: 24, Ft: 16, Fv: 2.5, FcPerp: 6, Fc: 16, E: 16000, Emin: 16000, G: 0.8 }).some((e) => /Emin/.test(e))).toBe(true)
    expect(validateWoodRef({ Fb: 24, Ft: 16, Fv: 2.5, FcPerp: 6, Fc: 16, E: 16000, Emin: 5500, G: 1.6 }).some((e) => /gravity/.test(e))).toBe(true)
  })
})

describe('load-duration factor CD (NDS Table 2.3.2)', () => {
  it('permanent 0.9 · normal 1.0 · snow 1.15 · wind/seismic 1.6 · impact 2.0', () => {
    expect(loadDurationFactor('permanent')).toBe(0.9)
    expect(loadDurationFactor('ten-year')).toBe(1.0)
    expect(loadDurationFactor('two-month')).toBe(1.15)
    expect(loadDurationFactor('ten-minute')).toBe(1.6)
    expect(loadDurationFactor('impact')).toBe(2.0)
  })
})

describe('section properties (solid rectangle)', () => {
  it('A = b·d, S = b·d²/6, I = b·d³/12', () => {
    const { A, S, I } = woodSectionProps(150, 350)
    expect(A).toBe(52500)
    expect(S).toBeCloseTo((150 * 350 ** 2) / 6, 6)
    expect(I).toBeCloseTo((150 * 350 ** 3) / 12, 6)
  })
})

describe('size factor CF (sawn timbers, §4.3.6.2)', () => {
  it('CF = 1.0 for d ≤ 300 mm, (300/d)^(1/9) < 1 for deeper', () => {
    expect(sizeFactorTimber(250)).toBe(1)
    expect(sizeFactorTimber(300)).toBe(1)
    expect(sizeFactorTimber(400)).toBeCloseTo(Math.pow(300 / 400, 1 / 9), 9)
    expect(sizeFactorTimber(400)).toBeLessThan(1)
  })
  it('deeper members have a smaller size factor', () => {
    expect(sizeFactorTimber(600)).toBeLessThan(sizeFactorTimber(400))
  })
})

describe('beam stability factor CL (§3.3.3) — literal anchor', () => {
  // b=100, d=300, le=4000, E′min=4760, Fb*=10.34  →  RB=√120, FbE=47.6, CL≈0.9865
  const s = beamStabilityFactor(100, 300, 4000, 4760, 10.34)
  it('RB = √(le·d/b²)', () => expect(s.RB).toBeCloseTo(Math.sqrt(120), 6))
  it('FbE = 1.2·E′min/RB²', () => expect(s.FbE).toBeCloseTo((1.2 * 4760) / 120, 4))
  it('CL matches the §3.3.3.8 closed form', () => expect(s.CL).toBeCloseTo(0.9865, 3))
  it('CL ≤ 1 and shrinks as the unbraced length grows', () => {
    expect(s.CL).toBeLessThanOrEqual(1)
    expect(beamStabilityFactor(100, 300, 9000, 4760, 10.34).CL).toBeLessThan(s.CL)
  })
})

describe('column stability factor CP (§3.7.1) — literal anchor', () => {
  // le=3000, d=140, E′min=4760, Fc*=11.72, c=0.8  →  le/d≈21.43, FcE≈8.521, CP≈0.5731
  const s = columnStabilityFactor(3000, 140, 4760, 11.72, 0.8)
  it('slenderness = le/d', () => expect(s.slenderness).toBeCloseTo(3000 / 140, 6))
  it('FcE = 0.822·E′min/(le/d)²', () => expect(s.FcE).toBeCloseTo((0.822 * 4760) / (3000 / 140) ** 2, 4))
  it('CP matches the §3.7.1.5 closed form', () => expect(s.CP).toBeCloseTo(0.5731, 3))
  it('a longer/slenderer column has a smaller CP', () => {
    expect(columnStabilityFactor(4500, 140, 4760, 11.72, 0.8).CP).toBeLessThan(s.CP)
  })
})

describe('woodAdjusted', () => {
  const ref = getWoodRef('DFL-SS')!.ref
  it('dry / normal duration leaves E unchanged and folds CD·CF into Fb*', () => {
    const a = woodAdjusted(ref, 'sawn', 350)               // CF(350) < 1, CD=1
    expect(a.CD).toBe(1)
    expect(a.CF).toBeCloseTo(sizeFactorTimber(350), 9)
    expect(a.E).toBeCloseTo(ref.E, 6)
    expect(a.FbStar).toBeCloseTo(ref.Fb * a.CF, 6)
  })
  it('wind duration raises the allowables by CD = 1.6', () => {
    const dry = woodAdjusted(ref, 'sawn', 200)
    const wind = woodAdjusted(ref, 'sawn', 200, { duration: 'ten-minute' })
    expect(wind.FbStar / dry.FbStar).toBeCloseTo(1.6, 6)
    expect(wind.FvAllow / dry.FvAllow).toBeCloseTo(1.6, 6)
  })
  it('wet service reduces Fb, Fc, Fc⊥ and E; Fc⊥ carries no CD', () => {
    const wet = woodAdjusted(ref, 'sawn', 200, { wet: true })
    const dry = woodAdjusted(ref, 'sawn', 200)
    expect(wet.FbStar).toBeLessThan(dry.FbStar)
    expect(wet.E).toBeCloseTo(dry.E * 0.9, 6)
    expect(wet.FcPerpAllow).toBeCloseTo(ref.FcPerp * 0.67, 6)   // no CD on bearing
  })
})

describe('checkWoodBeam — composition against the parts', () => {
  const ref = getWoodRef('DFL-SS')!.ref
  const p = { ref, kind: 'sawn' as const, b: 150, d: 350, length: 5000, M: 25, V: 30 }
  const r = checkWoodBeam(p)
  it('fb = M/S and fv = 1.5V/A', () => {
    const { A, S } = woodSectionProps(150, 350)
    expect(r.fb).toBeCloseTo((25 * 1e6) / S, 6)
    expect(r.fv).toBeCloseTo((1.5 * 30 * 1e3) / A, 6)
  })
  it('F′b = Fb* · CL with le auto per §3.3.3', () => {
    const adj = woodAdjusted(ref, 'sawn', 350)
    const le = effectiveBendingLength(5000, 350)
    const { CL } = beamStabilityFactor(150, 350, le, adj.Emin, adj.FbStar)
    expect(r.CL).toBeCloseTo(CL, 6)
    expect(r.FbPrime).toBeCloseTo(adj.FbStar * CL, 6)
  })
  it('governing ratio = max(bending, shear); this section passes', () => {
    expect(r.ratio).toBeCloseTo(Math.max(r.bendingRatio, r.shearRatio), 9)
    expect(r.ok).toBe(true)
  })
  it('doubling the moment overstresses the beam', () => {
    expect(checkWoodBeam({ ...p, M: 55 }).ok).toBe(false)
  })
})

describe('checkWoodColumn — axial + beam-column interaction', () => {
  const ref = getWoodRef('DFL-SS')!.ref
  it('pure axial: fc = P/A and ratio = fc/F′c', () => {
    const r = checkWoodColumn({ ref, kind: 'sawn', b: 140, d: 140, length: 3000, P: 100 })
    expect(r.fc).toBeCloseTo((100 * 1e3) / (140 * 140), 6)
    expect(r.axialRatio).toBeCloseTo(r.fc / r.FcPrime, 9)
    expect(r.interaction).toBe(0)
    expect(r.ratio).toBeCloseTo(r.axialRatio, 9)
  })
  it('CP uses the governing (larger) slenderness of the two planes', () => {
    // Same le both planes but b < d → weak axis governs (larger le/b).
    const r = checkWoodColumn({ ref, kind: 'sawn', b: 100, d: 200, length: 3000, P: 50 })
    expect(r.slenderness).toBeCloseTo(3000 / 100, 6)
  })
  it('adding a moment engages §3.9.2 and raises the demand above pure axial', () => {
    const axial = checkWoodColumn({ ref, kind: 'sawn', b: 200, d: 200, length: 3000, P: 120 })
    const bent = checkWoodColumn({ ref, kind: 'sawn', b: 200, d: 200, length: 3000, P: 120, Mx: 15 })
    expect(bent.interaction).toBeGreaterThan(axial.axialRatio)
    expect(bent.ratio).toBeGreaterThan(axial.ratio)
  })
  it('a very slender column is governed by buckling (CP ≪ 1)', () => {
    const r = checkWoodColumn({ ref, kind: 'sawn', b: 100, d: 100, length: 4000, P: 10 })
    expect(r.CP).toBeLessThan(0.5)
  })
})

describe('unit weight (self-weight only)', () => {
  it('γ ≈ G·9.81 kN/m³', () => {
    expect(woodUnitWeight(0.5)).toBeCloseTo(4.905, 3)
    expect(woodUnitWeight(0.42)).toBeLessThan(woodUnitWeight(0.55))   // SPF lighter than Southern Pine
  })
})

describe('NDS Appendix N — LRFD format conversion', () => {
  const ref = getWoodRef('DFL-SS')!.ref
  it('strength values scale by KF·φ·λ = 2.16·λ vs the CD = 1 ASD baseline', () => {
    const asd = woodAdjusted(ref, 'sawn', 200, { duration: 'ten-year' })       // CD = 1
    const lrfd = woodAdjusted(ref, 'sawn', 200, { method: 'LRFD', lambda: 0.8 })
    expect(lrfd.FbStar / asd.FbStar).toBeCloseTo(2.16 * 0.8, 6)
    expect(lrfd.FcStar / asd.FcStar).toBeCloseTo(2.16 * 0.8, 6)
    expect(lrfd.FvAllow / asd.FvAllow).toBeCloseTo(2.16 * 0.8, 6)
  })
  it('Emin (stability) scales by ≈1.50 and carries no λ; service E is unchanged', () => {
    const asd = woodAdjusted(ref, 'sawn', 200)
    const lrfd = woodAdjusted(ref, 'sawn', 200, { method: 'LRFD', lambda: 1.0 })
    expect(lrfd.Emin / asd.Emin).toBeCloseTo(1.496, 3)
    expect(lrfd.E).toBeCloseTo(asd.E, 6)                                        // deflection modulus not converted
  })
  it('a wind combo (λ=1.0) allows more than a gravity combo (λ=0.8)', () => {
    const wind = checkWoodColumn({ ref, kind: 'sawn', b: 150, d: 150, length: 3000, P: 200, opts: { method: 'LRFD', lambda: 1.0 } })
    const grav = checkWoodColumn({ ref, kind: 'sawn', b: 150, d: 150, length: 3000, P: 200, opts: { method: 'LRFD', lambda: 0.8 } })
    expect(wind.FcPrime).toBeGreaterThan(grav.FcPrime)
    expect(wind.ratio).toBeLessThan(grav.ratio)
  })
})

describe('glulam volume factor CV (§5.3.6)', () => {
  it('CV ≤ 1 and shrinks with member size', () => {
    const cv = volumeFactorGlulam(130, 600, 8000)
    expect(cv).toBeLessThanOrEqual(1)
    expect(volumeFactorGlulam(130, 900, 12000)).toBeLessThan(cv)
  })
  it('a glulam beam applies the lesser of CV and CL to F′b', () => {
    const ref = getWoodRef('GLULAM-24F')!.ref
    const r = checkWoodBeam({ ref, kind: 'glulam', b: 130, d: 600, length: 8000, M: 120, V: 60 })
    const adj = woodAdjusted(ref, 'glulam', 600)
    const CV = volumeFactorGlulam(130, 600, 8000)
    // F′b must not exceed Fb*·CV nor Fb*·CL (whichever is smaller).
    expect(r.FbPrime).toBeLessThanOrEqual(adj.FbStar * CV + 1e-9)
    expect(r.FbPrime).toBeLessThanOrEqual(adj.FbStar * r.CL + 1e-9)
  })
})
