import { describe, it, expect } from 'vitest'
import { designTBeam, effectiveFlange, tBeamCapacity, beta1 } from './tbeam'

// Base: interior T, bw 300, h 600, hf 100, cover 40, ⌀10 stirrups, ⌀25 bars,
// f'c 21, fy 415, ln 6 m, sw 2.7 m → dt = 600−40−10−12.5 = 537.5 mm.
const base = {
  kind: 'interior' as const, bw: 300, h: 600, hf: 100,
  ln: 6, sw: 2.7, cover: 40, stirrupDia: 10, barDia: 25,
  fc: 21, fy: 415, Mu: 400,
}

describe('effective flange width — ACI Table 6.3.2.1', () => {
  it('interior: bw + 2·min(8hf, sw/2, ln/8)', () => {
    // 8hf = 800, sw/2 = 1350, ln/8 = 750 → overhang 750 → bf = 300+1500 = 1800? no:
    // min = 750 (ln/8) → bf = 300 + 2·750 = 1800
    const { bf, govern } = effectiveFlange(base)
    expect(bf).toBeCloseTo(300 + 2 * 750, 9)
    expect(govern).toContain('ln/8')
  })
  it('8hf governs when the slab is thin', () => {
    const { bf, govern } = effectiveFlange({ ...base, hf: 75 })
    expect(bf).toBeCloseTo(300 + 2 * 8 * 75, 9)
    expect(govern).toContain('8hf')
  })
  it('edge (L) beam: one overhang, ln/12', () => {
    const { bf } = effectiveFlange({ ...base, kind: 'edge' })
    expect(bf).toBeCloseTo(300 + Math.min(6 * 100, 1350, 500), 9)
  })
  it('isolated: bf ≤ 4bw and hf ≥ bw/2 flag', () => {
    const r = effectiveFlange({ ...base, kind: 'isolated', bfGiven: 1500 })
    expect(r.bf).toBe(1200)
    expect(r.isolatedOK).toBe(false)       // hf 100 < bw/2 = 150
    expect(effectiveFlange({ ...base, kind: 'isolated', hf: 150, bfGiven: 1000 }).isolatedOK).toBe(true)
  })
})

describe('designTBeam — rectangular behaviour (a ≤ hf)', () => {
  const r = designTBeam(base)   // Mu = 400 kN·m
  it('block stays in the flange and the capacity covers Mu', () => {
    expect(r.tBehavior).toBe(false)
    expect(r.a).toBeLessThanOrEqual(base.hf)
    expect(r.phiMn).toBeGreaterThanOrEqual(400)
    expect(r.ok).toBe(true)
  })
  it('hand calc: Rn with b = bf = 1800 → As ≈ Mu/(0.9·fy·(d−a/2))', () => {
    // a = As·fy/(0.85·f'c·bf); iterate ≈ jd ~ 0.98d. With d = 537.5:
    // Rn = 400e6/(0.9·1800·537.5²) = 0.855 MPa → ρ = 0.85·21/415·(1−√(1−2·0.855/17.85))
    const Rn = 400e6 / (0.9 * 1800 * 537.5 ** 2)
    const rho = ((0.85 * 21) / 415) * (1 - Math.sqrt(1 - (2 * Rn) / (0.85 * 21)))
    expect(r.As).toBeCloseTo(Math.max(rho * 1800 * 537.5, r.AsMin), 6)
  })
  it('εt ≥ 0.005 → φ = 0.90 (shallow block, tension-controlled)', () => {
    expect(r.et).toBeGreaterThan(0.005)
    expect(r.phi).toBeCloseTo(0.90, 9)
  })
})

describe('designTBeam — true T behaviour (a > hf)', () => {
  // Push the demand up and shrink the flange so the block enters the web.
  const inp = { ...base, bfGiven: 700, hf: 75, Mu: 520, h: 650 }  // dt = 587.5
  const r = designTBeam(inp)
  it('splits into flange couple Asf + web remainder', () => {
    expect(r.tBehavior).toBe(true)
    expect(r.a).toBeGreaterThan(inp.hf)
    // Asf = 0.85·f'c·(bf−bw)·hf/fy = 0.85·21·400·75/415
    expect(r.Asf).toBeCloseTo((0.85 * 21 * (700 - 300) * 75) / 415, 3)
    expect(r.As).toBeGreaterThan(r.Asf)
  })
  it('capacity from equilibrium covers the demand', () => {
    expect(r.phiMn).toBeGreaterThanOrEqual(520 * 0.999)
  })
  it('capacity function is consistent: recompute at the provided steel', () => {
    const cap = tBeamCapacity(inp, r.bf, r.d, r.dt, r.bars * ((Math.PI / 4) * 25 ** 2))
    expect(cap.phiMn).toBeCloseTo(r.phiMn, 6)
    expect(cap.a).toBeGreaterThan(inp.hf)
  })
})

describe('minimum steel and hogging (flange in tension)', () => {
  it('As,min = max(0.25√f\'c, 1.4)/fy·bw·d governs tiny moments', () => {
    const r = designTBeam({ ...base, Mu: 20 })
    expect(r.minGoverns).toBe(true)
    expect(r.As).toBeCloseTo((Math.max(0.25 * Math.sqrt(21), 1.4) / 415) * 300 * r.d, 3)
  })
  it('negative moment designs the web rectangle (b = bw) and doubles bw,min when determinate', () => {
    const r = designTBeam({ ...base, Mu: -150 })
    expect(r.tBehavior).toBe(false)
    const rDet = designTBeam({ ...base, Mu: -20, determinate: true })
    const rInd = designTBeam({ ...base, Mu: -20 })
    expect(rDet.AsMin).toBeCloseTo(2 * rInd.AsMin, 3)   // min(2bw, bf) = 600
  })
})

describe('tension-controlled cap', () => {
  it('AsMax corresponds to c = 3/8·dt (block may cross into the web)', () => {
    const r = designTBeam(base)
    const cTC = (3 / 8) * r.dt, aTC = beta1(21) * cTC
    const Cc = aTC <= base.hf ? 0.85 * 21 * r.bf * aTC : 0.85 * 21 * ((r.bf - 300) * 100 + 300 * aTC)
    expect(r.AsMax).toBeCloseTo(Cc / 415, 3)
  })
  it('an over-reinforced analyze case is flagged not-ok', () => {
    const r = designTBeam({ ...base, bfGiven: 400, AsGiven: 12000, Mu: 100 })
    expect(r.ok).toBe(false)
    expect(r.notes.join(' ')).toContain('tension-controlled')
  })
})
