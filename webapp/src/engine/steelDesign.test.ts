import { describe, it, expect } from 'vitest'
import { shapeByName } from './aiscSections'
import {
  deriveWSection, beamFlexure, beamShear,
  columnAxial, weakAxisFlexure, combinedLoading,
  boltShear, weldStrength, beamLoadingSimple, E_STEEL,
  boltGroupGeom, eccentricBoltGroup, shearTabBlockShear,
} from './steelDesign'

const W250x33 = shapeByName('W250x33')!
const p = deriveWSection(W250x33)

describe('deriveWSection', () => {
  it('Ix from box formula matches tabulated value ±2 %', () => {
    // Official W250x33 Ix ≈ 48.5e6 mm⁴
    expect(p.Ix).toBeGreaterThan(47e6)
    expect(p.Ix).toBeLessThan(50e6)
  })
  it('Zx from first-moment formula matches tabulated value ±2 %', () => {
    // Official W250x33 Zx ≈ 418 000 mm³
    expect(p.Zx).toBeGreaterThan(410_000)
    expect(p.Zx).toBeLessThan(430_000)
  })
  it('hw = d − 2·tf', () => {
    const { d, tf } = W250x33
    expect(p.hw).toBeCloseTo(d! - 2 * tf!, 5)
  })
  it('rts is positive', () => {
    expect(p.rts).toBeGreaterThan(0)
  })
})

describe('beamFlexure §F2', () => {
  const Fy = 345
  it('Lb = 0 → plastic zone, phiMn = 0.9·Fy·Zx', () => {
    const r = beamFlexure(W250x33, p, Fy, 0)
    expect(r.ltbZone).toBe('plastic')
    expect(r.phiMn).toBeCloseTo(0.9 * Fy * p.Zx / 1e6, 4)
  })
  it('Lb = 1 m (< Lp) → plastic', () => {
    expect(beamFlexure(W250x33, p, Fy, 1000).ltbZone).toBe('plastic')
  })
  it('large Lb → elastic or inelastic, phiMn < Mp·0.9', () => {
    const r = beamFlexure(W250x33, p, Fy, 10_000)
    expect(r.phiMn).toBeLessThan(0.9 * r.Mp)
    expect(['inelastic', 'elastic']).toContain(r.ltbZone)
  })
  it('W250x33 A992 compact flange and web', () => {
    const r = beamFlexure(W250x33, p, 345, 0)
    expect(r.compactFlange).toBe(true)
    expect(r.compactWeb).toBe(true)
    expect(r.compact).toBe(true)
  })
  it('Cb > 1 increases Mn but not above Mp', () => {
    const r1 = beamFlexure(W250x33, p, Fy, 5000, 1.0)
    const r2 = beamFlexure(W250x33, p, Fy, 5000, 1.5)
    expect(r2.phiMn).toBeGreaterThanOrEqual(r1.phiMn)
    expect(r2.Mn).toBeLessThanOrEqual(r2.Mp + 1e-9)
  })
})

describe('beamShear §G2.1', () => {
  it('compact web → phiV = 1.0, Cv1 = 1.0', () => {
    const r = beamShear(W250x33, p, 345)
    expect(r.phiV).toBe(1.0)
    expect(r.Cv1).toBe(1.0)
  })
  it('phiVn = phiV · 0.6 · Fy · d · tw', () => {
    const Fy = 345
    const r = beamShear(W250x33, p, Fy)
    const expected = (r.phiV * 0.6 * Fy * W250x33.d! * W250x33.tw!) / 1000
    expect(r.phiVn).toBeCloseTo(expected, 6)
  })
})

describe('columnAxial §E3', () => {
  it('short column approaches Fy · A', () => {
    const r = columnAxial(W250x33, 345, 0.5, 1, 1)
    expect(r.phiPn).toBeLessThanOrEqual(0.9 * 345 * W250x33.A / 1000 + 1e-6)
    expect(r.phiPn).toBeGreaterThan(0.85 * 345 * W250x33.A / 1000)
  })
  it('governing slenderness = max(KxL/rx, KyL/ry)', () => {
    const r = columnAxial(W250x33, 345, 4, 1, 1)
    const rx = W250x33.rx, ry = W250x33.ry
    expect(r.slendernessX).toBeCloseTo(1 * 4000 / rx, 6)
    expect(r.slendernessY).toBeCloseTo(1 * 4000 / ry, 6)
    expect(r.slenderness).toBeCloseTo(Math.max(r.slendernessX, r.slendernessY), 6)
  })
  it('slenderOK false when KL/r > 200', () => {
    const r = columnAxial(W250x33, 345, 15, 1, 1)
    expect(r.slenderOK).toBe(false)
  })
})

describe('weakAxisFlexure §F6', () => {
  it('phiMny > 0', () => {
    expect(weakAxisFlexure(W250x33, p, 345).phiMny).toBeGreaterThan(0)
  })
})

describe('combinedLoading §H1-1', () => {
  it('H1-1a: Pu/φPn ≥ 0.2 → ratio = pr + 8/9·mr', () => {
    const r = combinedLoading(500, 1000, 100, 200, 0, Infinity)
    // pr = 0.5 ≥ 0.2 → H1-1a
    expect(r.equation).toBe('H1-1a')
    expect(r.ratio).toBeCloseTo(0.5 + (8 / 9) * (100 / 200), 10)
  })
  it('H1-1b: Pu/φPn < 0.2 → ratio = pr/2 + mr', () => {
    const r = combinedLoading(100, 1000, 100, 200, 0, Infinity)
    // pr = 0.1 < 0.2 → H1-1b
    expect(r.equation).toBe('H1-1b')
    expect(r.ratio).toBeCloseTo(0.1 / 2 + 100 / 200, 10)
  })
  it('ok flag reflects ≤ 1.0', () => {
    // pr=0.8 + 8/9*0.8 = 1.511 > 1 → fails
    expect(combinedLoading(160, 200, 160, 200).ok).toBe(false)
    const r = combinedLoading(100, 1000, 10, 200)
    expect(r.ok).toBe(r.ratio <= 1.0)
  })
})

describe('boltShear §J3.6 + §J3.10', () => {
  it('A325M d=19, threads in plane → phiRn_shear = 0.75·310·π/4·19²/1000', () => {
    const r = boltShear('A325M', 19, 50, 10, 400, true)
    const Ab = Math.PI / 4 * 19 ** 2
    expect(r.phiRn_shear).toBeCloseTo(0.75 * 310 * Ab / 1000, 5)
  })
  it('bearing governs when plate is thin', () => {
    // thin plate → small phiRn_bearing
    const r = boltShear('A325M', 22, 50, 6, 400, false)
    expect(r.phiRn_bearing).toBeLessThan(r.phiRn_shear)
    expect(r.phiRn).toBe(r.phiRn_bearing)
  })
  it('n_reqd = ceil(Vu / phiRn)', () => {
    const r = boltShear('A490M', 22, 200, 12, 400)
    expect(r.n_reqd).toBe(Math.ceil(200 / r.phiRn))
  })
})

describe('weldStrength §J2.4', () => {
  it('E70 weld size 8 mm → phiRnw = 0.75·0.6·482·0.707·8/1000 kN/mm', () => {
    const r = weldStrength('E70', 8, 100)
    expect(r.phiRnw).toBeCloseTo(0.75 * 0.6 * 482 * 0.707 * 8 / 1000, 8)
  })
  it('L_reqd = Vu / phiRnw', () => {
    const Vu = 150
    const r = weldStrength('E70', 8, Vu)
    expect(r.L_reqd).toBeCloseTo(Vu / r.phiRnw, 6)
  })
})

describe('beamLoadingSimple', () => {
  it('wu = max(1.4D, 1.2D+1.6L)', () => {
    const r = beamLoadingSimple({ wDead: 20, wLive: 30, L: 6 }, p.Ix)
    expect(r.wu).toBeCloseTo(Math.max(1.4 * 20, 1.2 * 20 + 1.6 * 30), 10)
  })
  it('Mu = wu·L²/8, Vu = wu·L/2', () => {
    const r = beamLoadingSimple({ wDead: 10, wLive: 20, L: 8 }, p.Ix)
    expect(r.Mu).toBeCloseTo(r.wu * 64 / 8, 10)
    expect(r.Vu).toBeCloseTo(r.wu * 8 / 2, 10)
  })
  it('deflections use 5wL⁴/384EI', () => {
    const bl = { wDead: 15, wLive: 25, L: 7 }
    const r = beamLoadingSimple(bl, p.Ix)
    const Lmm = 7000
    const coef = 5 * Lmm ** 4 / (384 * E_STEEL * p.Ix)
    expect(r.deltaD).toBeCloseTo(15 * coef, 8)
    expect(r.deltaL).toBeCloseTo(25 * coef, 8)
  })
})

describe('boltGroupGeom', () => {
  it('2×1 single column: centroid mid-height, Ip correct', () => {
    const g = boltGroupGeom(2, 1, 70, 70, 40, 40)
    expect(g.n).toBe(2)
    expect(g.Cx).toBeCloseTo(40, 6)
    expect(g.Cy).toBeCloseTo(75, 6)   // (40+110)/2
    // bolts at y = ±35 from centroid
    expect(g.bolts[0].y).toBeCloseTo(-35, 6)
    expect(g.bolts[1].y).toBeCloseTo(35, 6)
    expect(g.Ip).toBeCloseTo(2 * 35 ** 2, 6)   // all x=0
  })
  it('2×2 grid: Ip = 4 * (sx/2)² + 4 * (sy/2)²', () => {
    const sx = 70, sy = 70, ex = 40, ey = 40
    const g = boltGroupGeom(2, 2, sx, sy, ex, ey)
    expect(g.n).toBe(4)
    expect(g.Ip).toBeCloseTo(4 * (sx/2)**2 + 4 * (sy/2)**2, 3)
  })
})

describe('eccentricBoltGroup', () => {
  it('zero eccentricity: all bolts equal force V/n', () => {
    const g = boltGroupGeom(3, 1, 70, 70, 40, 40)
    const Vu = 90, n = 3
    const r = eccentricBoltGroup(g, Vu, 0, 0, 0, 100, 20, 10)
    r.bolts.forEach(b => expect(b.R).toBeCloseTo(Vu / n, 4))
    expect(r.M).toBeCloseTo(0, 10)
  })
  it('critical bolt has max resultant', () => {
    const g = boltGroupGeom(3, 1, 70, 70, 40, 40)
    const r = eccentricBoltGroup(g, 100, 0, 50, 0, 100, 20, 10)
    expect(r.Rmax).toBeGreaterThanOrEqual(Math.max(...r.bolts.map(b => b.R)) - 1e-9)
  })
  it('bearing stress = R·1000 / (db·t)', () => {
    const g = boltGroupGeom(2, 1, 70, 70, 40, 40)
    const db = 20, t = 10
    const r = eccentricBoltGroup(g, 60, 0, 0, 0, 100, db, t)
    r.bolts.forEach(b => expect(b.fbr).toBeCloseTo(b.R * 1000 / (db * t), 6))
  })
})

describe('shearTabBlockShear §J4.3', () => {
  it('returns two cases', () => {
    const cases = shearTabBlockShear(3, 70, 40, 40, 35, 20, 10, 248, 400)
    expect(cases).toHaveLength(2)
  })
  it('phiRn = 0.75 * min(Rn_fract, Rn_cap)', () => {
    const cases = shearTabBlockShear(3, 70, 40, 40, 35, 20, 10, 248, 400)
    for (const c of cases) {
      expect(c.phiRn).toBeCloseTo(0.75 * Math.min(c.Rn_fract, c.Rn_cap), 6)
    }
  })
  it('longer shear path → larger phiRn', () => {
    const cA = shearTabBlockShear(3, 70, 40, 40, 35, 20, 10, 248, 400)
    const cB = shearTabBlockShear(4, 70, 40, 40, 35, 20, 10, 248, 400)
    expect(cB[0].phiRn).toBeGreaterThan(cA[0].phiRn)
  })
})
