import { describe, it, expect } from 'vitest'
import {
  designAxialColumn, interaction, capacityAtEccentricity, breslerReciprocal,
  momentMagnificationNonsway,
} from './columnDesign'

describe('axial — tied (review Concrete 7, Problem 2)', () => {
  // 400 sq tied, D=1400 kN, L=790 kN → Pu = 1.2D + 1.6L = 2944 kN; 28 mm bars.
  const Pu = 1.2 * 1400 + 1.6 * 790
  const r = designAxialColumn({
    shape: 'tied', b: 400, h: 400, cover: 40, barDia: 28, tieDia: 10,
    fc: 28, fy: 415, Pu,
  })

  it('factored load and required bars (8 ⌀28)', () => {
    expect(Pu).toBeCloseTo(2944, 6)
    expect(r.bars).toBe(8)
    expect(r.axialOK).toBe(true)
    expect(r.rhoOK).toBe(true)
  })

  it('§425.7.2 spacing = min(16×28=448, 48×10=480, 400) = 400 mm', () => {
    expect(r.tieSpacing).toBe(400)
    expect(r.tieGovern).toBe('least dim')
    expect(r.tieSpacingFinal).toBe(400)   // gravity → same as §425.7.2
  })
})

describe('axial — tied, SMF seismic §418.7.5', () => {
  // 500×500 column, barDia=25, tieDia=10, Lu=3000 mm, hx=200 (lateral tie spacing)
  const r = designAxialColumn({
    shape: 'tied', b: 500, h: 500, cover: 40, barDia: 25, tieDia: 10,
    fc: 28, fy: 415, Pu: 2000,
    system: 'smf', columnLength: 3000, hx: 200,
  })

  it('§425.7.2 gives ≥300 mm but SMF conf. governs', () => {
    expect(r.tieSpacing).toBeGreaterThanOrEqual(300)
    expect(r.seismicSConf).toBeDefined()
    expect(r.tieSpacingFinal).toBeLessThan(r.tieSpacing)
    expect(r.tieSpacingLabel).toContain('SMF')
  })

  it('SMF conf. spacing ≤ min(bMin/4, 6db, so)', () => {
    const bMin = 500, db = 25, hx = 200
    const so = Math.min(Math.max(100 + (350 - hx) / 3, 100), 150)
    const expected = Math.min(bMin / 4, 6 * db, so)
    expect(r.seismicSConf).toBeCloseTo(expected, 6)
  })

  it('so = clamp(100 + (350−hx)/3, 100, 150) for hx = 200', () => {
    // so = 100 + (350-200)/3 = 100 + 50 = 150 mm
    expect(r.seismicSConf!).toBeCloseTo(Math.min(500 / 4, 6 * 25, 150), 6)
  })

  it('SMF confinement zone lo ≥ max(bMax, Lu/6, 450)', () => {
    // max(500, 3000/6=500, 450) = 500
    expect(r.seismicLoZone).toBeCloseTo(Math.max(500, 3000 / 6, 450), 6)
  })

  it('outside confinement zone: s ≤ min(6db, 150)', () => {
    expect(r.seismicSOut).toBeCloseTo(Math.min(6 * 25, 150), 6)
  })
})

describe('axial — tied, IMF seismic §418.4.3', () => {
  const r = designAxialColumn({
    shape: 'tied', b: 400, h: 400, cover: 40, barDia: 25, tieDia: 10,
    fc: 28, fy: 415, Pu: 1500, system: 'imf',
  })

  it('IMF conf. spacing = min(8db, 24dt, bMin/2, 300)', () => {
    const expected = Math.min(8 * 25, 24 * 10, 400 / 2, 300)
    expect(r.seismicSConf).toBeCloseTo(expected, 6)
  })

  it('IMF hinge zone lo = max(bMax, 450)', () => {
    expect(r.seismicLoZone).toBeCloseTo(Math.max(400, 450), 6)
  })
})

describe('axial — spiral (review Concrete 7, Problem 3 / key 2,423.70 kN)', () => {
  const r = designAxialColumn({
    shape: 'spiral', D: 400, cover: 40, barDia: 25, tieDia: 10,
    fc: 21, fy: 415, Pu: 1000, numBars: 8,
  })

  it('Po and design strength φPn = 0.75·0.85·Po', () => {
    expect(r.phiPnMax).toBeCloseTo(2424.2, 0)   // key rounds π to 2423.70
    expect(r.phi).toBe(0.75)
    expect(r.alpha).toBe(0.85)
  })

  it('spiral ratio ≥ max[0.45(Ag/Ach−1), 0.12]·f′c/fyt and clear pitch 25–75', () => {
    const Ag = (Math.PI / 4) * 400 ** 2
    const Ach = (Math.PI / 4) * 320 ** 2
    const expected = Math.max(0.45 * (Ag / Ach - 1), 0.12) * (21 / 415)
    expect(r.rhoS).toBeCloseTo(expected, 9)
    const clear = r.spiralPitch - 10
    expect(clear).toBeGreaterThanOrEqual(25 - 1e-9)
    expect(clear).toBeLessThanOrEqual(75 + 1e-9)
  })
})

describe('interaction — balanced condition (review Concrete 8, Problem 4 keys)', () => {
  // 300×400, f'c = 21, fy = 415, 6 ⌀28 (3 per 300 mm face), cover to centroid 60.
  // Keys: Pb = 881.87 kN, Mb = 314.86 kN·m, eb = 357.03 mm.
  const inp = {
    b: 300, h: 400, cover: 40, barDia: 28, tieDia: 6,  // 40+6+14 = 60 to centroid
    fc: 21, fy: 415, numBars: 6,
  }

  it('Pb, Mb, eb match the answer key', () => {
    const r = interaction(inp)
    expect(r.dPrime).toBeCloseTo(60, 9)
    expect(r.balanced.Pb).toBeCloseTo(881.87, 0)
    expect(r.balanced.Mb).toBeCloseTo(314.86, 0)
    expect(r.balanced.eb * 1000).toBeCloseTo(357.03, 0)
  })

  it('the curve passes through Po at large c and φ transitions 0.65 → 0.90', () => {
    const r = interaction(inp)
    const top = r.curve[r.curve.length - 1]
    expect(top.Pn).toBeCloseTo(r.Po, 0)
    expect(top.phi).toBe(0.65)
    const bottom = r.curve[0]
    expect(bottom.phi).toBeCloseTo(0.90, 9)
  })

  it('capacityAtEccentricity recovers the balanced point at e = eb', () => {
    const r = interaction(inp)
    const p = capacityAtEccentricity(inp, r.balanced.eb)
    expect(p.Pn).toBeCloseTo(r.balanced.Pb, 0)
    expect(p.Mn).toBeCloseTo(r.balanced.Mb, 0)
  })
})

describe('Bresler reciprocal', () => {
  it('1/Pn = 1/Pnx + 1/Pny − 1/Po', () => {
    expect(breslerReciprocal(2000, 1500, 4000)).toBeCloseTo(1 / (1 / 2000 + 1 / 1500 - 1 / 4000), 9)
    // uniaxial degenerate: Pny = Po → Pn = Pnx
    expect(breslerReciprocal(2000, 4000, 4000)).toBeCloseTo(2000, 6)
  })
})

describe('slenderness — nonsway moment magnification (RC-06 conventions)', () => {
  it('limit 34 + 12(M1/M2) ≤ 40; single curvature (−) lowers it', () => {
    const single = momentMagnificationNonsway({
      Pu: 500, M1: -100, M2: 100, k: 1, Lu: 3, h: 300, EI: 910000 / 1000,
    })
    expect(single.limit).toBeCloseTo(22, 9)      // 34 − 12
    expect(single.Cm).toBeCloseTo(1.0, 9)        // 0.6 + 0.4
    const dbl = momentMagnificationNonsway({
      Pu: 500, M1: 100, M2: 100, k: 1, Lu: 3, h: 300, EI: 910000 / 1000,
    })
    expect(dbl.limit).toBeCloseTo(40, 9)         // 34 + 12 capped at 40 → 46 → 40
    expect(dbl.Cm).toBeCloseTo(0.2, 9)
  })

  it('Euler load, δ ≥ 1 and M2,min = Pu(15 + 0.03h)', () => {
    const r = momentMagnificationNonsway({
      Pu: 1000, M1: -80, M2: 100, k: 0.8, Lu: 4, h: 400, EI: 50000,
    })
    expect(r.Pc).toBeCloseTo((Math.PI ** 2 * 50000) / (0.8 * 4) ** 2, 3)
    expect(r.stable).toBe(true)
    expect(r.delta).toBeGreaterThanOrEqual(1)
    expect(r.M2min).toBeCloseTo((1000 * (15 + 12)) / 1000, 6)   // 27 kN·m
    expect(r.Mc).toBeCloseTo(r.delta * 100, 6)
  })

  it('Pu ≥ 0.75Pc → stable=false with δ, Mc = ∞ (no silent clamp to 1.0)', () => {
    // EI = 10 000 kN·m², kLu = 5 m → Pc = π²·10000/25 ≈ 3947.8 kN; 0.75Pc ≈ 2960.9 kN
    const base = { M1: -80, M2: 100, k: 1, Lu: 5, h: 400, EI: 10000 }
    const Pc = (Math.PI ** 2 * 10000) / 25
    const unstable = momentMagnificationNonsway({ ...base, Pu: 0.80 * Pc })
    expect(unstable.stable).toBe(false)          // Pu = 0.80Pc > 0.75Pc
    expect(unstable.delta).toBe(Infinity)
    expect(unstable.Mc).toBe(Infinity)
    // just below the threshold the magnifier is finite and large, not clamped
    const nearLimit = momentMagnificationNonsway({ ...base, Pu: 0.70 * Pc })
    expect(nearLimit.stable).toBe(true)
    expect(Number.isFinite(nearLimit.delta)).toBe(true)
    expect(nearLimit.delta).toBeGreaterThan(1)
  })
})
