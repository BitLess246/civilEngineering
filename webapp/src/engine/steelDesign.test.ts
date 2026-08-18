import { describe, it, expect } from 'vitest'
import { shapeByName } from './aiscSections'
import {
  deriveWSection, beamFlexure, beamFlexureScope, beamShear,
  columnAxial, weakAxisFlexure, combinedLoading,
  boltShear, weldStrength, beamLoadingSimple, E_STEEL,
  boltGroupGeom, boltGeomFromPositions, eccentricBoltGroup, shearTabBlockShear, outOfPlaneBoltGroup, pryingAction,
} from './steelDesign'

const W250x33 = shapeByName('W250x32.7')!
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

describe('beamFlexure §F3 — flange local buckling', () => {
  // AUD-001. The old code computed compactness, PRINTED it, and then returned
  // the compact §F2 strength regardless. A noncompact flange therefore came out
  // at full Mp — a false pass. §F3 takes the lesser of LTB and FLB.

  // W150x22 is the one shape in the library whose flange is noncompact at both
  // grades: λf = bf/2tf = 152/(2×6.6) = 11.515.
  const W150x22 = shapeByName('W150x22')!
  const p22 = deriveWSection(W150x22)

  it('classifies W150x22 as a noncompact flange on a compact web → §F3', () => {
    const sc = beamFlexureScope(W150x22, p22, 248)
    expect(sc.lambdaF).toBeCloseTo(11.515, 3)
    expect(sc.lambdaPF).toBeCloseTo(0.38 * Math.sqrt(E_STEEL / 248), 6)   // 10.791
    expect(sc.lambdaRF).toBeCloseTo(1.0 * Math.sqrt(E_STEEL / 248), 6)    // 28.398
    expect(sc.flangeClass).toBe('noncompact')
    expect(sc.webClass).toBe('compact')
    expect(sc.clause).toBe('F3')
    expect(sc.applicable).toBe(true)
    expect(sc.compact).toBe(false)
  })

  it('reduces Mn by §F3-1 rather than handing back Mp — hand calc, Fy = 345', () => {
    // Hand calc (mm, MPa, kN·m):
    //   Zx = bf·tf(d−tf) + tw·hw²/4 = 152·6.6·145.4 + 5.8·138.8²/4 = 173 800 mm³
    //   Sx = Ix/(d/2) = 156 633 mm³
    //   Mp = 345 × 173 800 / 1e6 = 59.961 kN·m
    //   λpf = 9.149, λrf = 24.077, λf = 11.515
    //   Mn = Mp − (Mp − 0.7·Fy·Sx)·(λf−λpf)/(λrf−λpf)
    //      = 59.961 − (59.961 − 37.827)·(2.366/14.928) = 56.453 kN·m
    const r = beamFlexure(W150x22, p22, 345, 0)   // Lb = 0 ⇒ LTB gives Mp
    expect(r.Mp).toBeCloseTo(59.961, 2)
    expect(r.MnLTB).toBeCloseTo(r.Mp, 9)
    expect(r.MnFLB).toBeCloseTo(56.453, 2)
    expect(r.Mn).toBeCloseTo(56.453, 2)
    expect(r.governing).toBe('FLB')
    expect(r.phiMn).toBeCloseTo(0.9 * 56.453, 2)
    // …and this is the regression: the old code returned the full Mp here.
    expect(r.Mn).toBeLessThan(r.Mp)
  })

  it('at Fy = 248 the same shape is still noncompact, and still reduced', () => {
    const r = beamFlexure(W150x22, p22, 248, 0)
    expect(r.clause).toBe('F3')
    expect(r.MnFLB).toBeCloseTo(42.448, 2)
    expect(r.Mn / r.Mp).toBeCloseTo(0.9848, 3)
  })

  it('LTB still governs when it is the smaller of the two', () => {
    const near = beamFlexure(W150x22, p22, 345, 0)
    const far  = beamFlexure(W150x22, p22, 345, 12_000)
    expect(far.MnFLB).toBeCloseTo(near.MnFLB, 9)      // FLB does not see Lb
    expect(far.MnLTB).toBeLessThan(far.MnFLB)
    expect(far.governing).toBe('LTB')
    expect(far.Mn).toBeCloseTo(far.MnLTB, 9)
  })

  it('a compact flange has no FLB limit state, so §F2 is unchanged', () => {
    const r = beamFlexure(W250x33, p, 345, 0)
    expect(r.clause).toBe('F2')
    expect(r.MnFLB).toBe(Infinity)
    expect(r.Mn).toBeCloseTo(r.Mp, 9)
    expect(r.governing).toBe('yielding')
  })

  it('§F3-2 governs a slender flange (synthetic plate girder flange)', () => {
    // No rolled shape in the library has a slender flange, so the branch is
    // exercised on a fabricated section: bf/2tf = 400/12 = 33.3 > λrf = 28.4.
    const slender = { name: 'PG-slender', family: 'W' as const, A: 9600, rx: 200, ry: 90,
                      d: 500, bf: 400, tf: 6, tw: 12 }
    const ps = deriveWSection(slender)
    const r = beamFlexure(slender, ps, 248, 0)
    expect(r.flangeClass).toBe('slender')
    expect(r.webClass).toBe('compact')
    expect(r.clause).toBe('F3')
    // kc = 4/√(hw/tw) = 4/√(488/12) = 0.627, inside [0.35, 0.76]
    expect(r.kc).toBeCloseTo(4 / Math.sqrt(ps.hw / 12), 6)
    expect(r.MnFLB).toBeCloseTo((0.9 * E_STEEL * r.kc * ps.Sx) / r.lambdaF ** 2 / 1e6, 6)
    expect(r.Mn).toBeCloseTo(r.MnFLB, 9)
    expect(r.governing).toBe('FLB')
    expect(r.Mn).toBeLessThan(r.Mp)
  })

  it('clamps kc to [0.35, 0.76]', () => {
    const stocky = { name: 'PG-stocky', family: 'W' as const, A: 9000, rx: 100, ry: 60,
                     d: 200, bf: 400, tf: 6, tw: 40 }   // hw/tw = 4.7 → 4/√4.7 = 1.85
    expect(beamFlexure(stocky, deriveWSection(stocky), 248, 0).kc).toBeCloseTo(0.76, 9)
  })
})

describe('beamFlexure — sections with no implemented clause', () => {
  // §F4/§F5 (noncompact/slender web) and §F9 (tees) are NOT implemented. The
  // module must say so instead of returning the compact strength.
  const mk = (over: Partial<{ d: number; bf: number; tf: number; tw: number }>) =>
    ({ name: 'PG', family: 'W' as const, A: 12000, rx: 300, ry: 60,
       d: 1200, bf: 300, tf: 20, tw: 10, ...over })

  it('a noncompact web is §F4 → out of scope, Mn = 0', () => {
    // hw/tw = 1160/10 = 116 → λpw = 106.8 < 116 ≤ λrw = 161.9
    const s = mk({})
    const r = beamFlexure(s, deriveWSection(s), 248, 0)
    expect(r.webClass).toBe('noncompact')
    expect(r.clause).toBe('out-of-scope')
    expect(r.applicable).toBe(false)
    expect(r.reason).toMatch(/§F4/)
    expect(r.Mn).toBe(0)
    expect(r.phiMn).toBe(0)
    expect(r.Mp).toBeGreaterThan(0)      // Mp is still reported, just not used
  })

  it('a slender web is §F5 → out of scope', () => {
    const s = mk({ tw: 6 })              // hw/tw = 193 > λrw = 161.9
    const r = beamFlexure(s, deriveWSection(s), 248, 0)
    expect(r.webClass).toBe('slender')
    expect(r.reason).toMatch(/§F5/)
    expect(r.applicable).toBe(false)
    expect(r.phiMn).toBe(0)
  })

  it('a tee is §F9 → out of scope, because deriveWSection is wrong for it too', () => {
    const wt = shapeByName('WT155x19.4')!
    const r = beamFlexure(wt, deriveWSection(wt), 248, 0)
    expect(r.clause).toBe('out-of-scope')
    expect(r.reason).toMatch(/tee/)
    expect(r.phiMn).toBe(0)
  })

  it('a channel is out of scope for the doubly-symmetric equations', () => {
    const c = shapeByName('C100x10.8')!
    expect(c.family).toBe('C')
    const r = beamFlexureScope(c, deriveWSection(c), 248)
    expect(r.applicable).toBe(false)
    expect(r.reason).toMatch(/doubly-symmetric/)
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
  it('a compact flange has no §F6.2 reduction — Mny = min(Fy·Zy, 1.6·Fy·Sy)', () => {
    const r = weakAxisFlexure(W250x33, p, 345)
    expect(r.flangeClass).toBe('compact')
    expect(r.MnFLB).toBe(Infinity)
    expect(r.Mny).toBeCloseTo(r.MnY, 9)
    expect(r.Mny).toBeCloseTo(345 * Math.min(p.Zy, 1.6 * r.Sy) / 1e6, 6)
  })
  it('a noncompact flange takes the §F6-2 reduction', () => {
    // Same AUD-001 failure class about the weak axis: §F6.1 alone would return
    // the full plastic strength for a flange that buckles first.
    const W150x22 = shapeByName('W150x22')!
    const p22 = deriveWSection(W150x22)
    const r = weakAxisFlexure(W150x22, p22, 345)
    expect(r.flangeClass).toBe('noncompact')
    expect(r.MnFLB).toBeLessThan(r.MnY)
    expect(r.Mny).toBeCloseTo(r.MnFLB, 9)
    const lf = 152 / (2 * 6.6), lpf = 0.38 * Math.sqrt(E_STEEL / 345), lrf = Math.sqrt(E_STEEL / 345)
    expect(r.Mny).toBeCloseTo(r.MnY - (r.MnY - 0.7 * 345 * r.Sy / 1e6) * ((lf - lpf) / (lrf - lpf)), 6)
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

describe('outOfPlaneBoltGroup §J3.7', () => {
  const g = boltGroupGeom(3, 1, 70, 70, 40, 40)   // 3 bolts in vertical column
  // dummy in-plane bolts with fv = 0 for isolation of tension calc
  const zeroShear = g.bolts.map(b => ({
    id: b.id, x: b.x, y: b.y, Vx: 0, Vy: 0, R: 0, utilShear: 0, fbr: 0, fv: 0
  }))

  it('zero e_out → all T = 0', () => {
    const r = outOfPlaneBoltGroup(g, zeroShear, 0, 100, 'A325M', 20, true)
    r.bolts.forEach(b => expect(b.T).toBe(0))
    expect(r.M_op).toBe(0)
  })

  it('top bolt gets maximum tension (largest yi)', () => {
    const r = outOfPlaneBoltGroup(g, zeroShear, 50, 100, 'A325M', 20, true)
    // bolts ordered B1(bottom) to B3(top); top bolt yi is largest
    const top = r.bolts.reduce((a, b) => b.yi > a.yi ? b : a, r.bolts[0])
    expect(top.T).toBeCloseTo(r.Tmax, 6)
    expect(r.critical).toBe(top.id)
  })

  it('T_i = M_op * yi / sumYi2 formula', () => {
    const Vu = 80, e_out = 75
    const r = outOfPlaneBoltGroup(g, zeroShear, e_out, Vu, 'A325M', 22, false)
    const M_op = Vu * e_out
    r.bolts.forEach(b => {
      const expected = r.sumYi2 > 0 ? M_op * b.yi / r.sumYi2 : 0
      expect(b.T).toBeCloseTo(expected, 6)
    })
  })

  it('§J3.7 reduced tensile strength decreases with shear stress', () => {
    const phi = 0.75, Fnt = 620, Fnv = 310
    const withShear = [{ id: 'B3', x: 0, y: 70, Vx: 0, Vy: 0, R: 50, utilShear: 0, fbr: 0,
      fv: 50 * 1000 / ((Math.PI/4)*20**2) }]
    // top bolt only — provide fv for it
    const mixed = g.bolts.map(b =>
      b.id === 'B3' ? withShear[0] : { ...b, Vx: 0, Vy: 0, R: 0, utilShear: 0, fbr: 0, fv: 0 }
    )
    const r = outOfPlaneBoltGroup(g, mixed, 50, 100, 'A325M', 20, true)
    const critB = r.bolts.find(b => b.id === 'B3')!
    const expected = Math.min(1.3 * Fnt - (Fnt / (phi * Fnv)) * critB.frv, Fnt)
    expect(critB.phiFnt_prime).toBeCloseTo(Math.max(0, expected), 4)
  })
})

describe('pryingAction §J3.9', () => {
  // geometry: b=45mm (bolt CL to web face), a=35mm (to free edge),
  // p=70mm (bolt pitch), tf=12mm, db=20mm, Fy=248MPa
  const b = 45, a = 35, p = 70, tf = 12, db = 20, Fy = 248
  const db2 = db / 2, dh = db + 2
  const b_p = b - db2          // 35
  const a_p = Math.min(a, 1.25 * b)  // 35 (a < 1.25b=56.25)
  const rho  = b_p / a_p       // 1.0
  const delta = 1 - dh / p     // 1 - 22/70

  it('geometry: b_prime, a_prime, rho, delta computed correctly', () => {
    const r = pryingAction(50, 100, b, a, p, tf, db, Fy)
    expect(r.b_prime).toBeCloseTo(b_p, 6)
    expect(r.a_prime).toBeCloseTo(a_p, 6)
    expect(r.rho).toBeCloseTo(rho, 6)
    expect(r.delta).toBeCloseTo(delta, 6)
  })

  it('T_req = 0 → Q = 0, no prying', () => {
    const r = pryingAction(0, 100, b, a, p, tf, db, Fy)
    expect(r.Q).toBe(0)
    expect(r.T_total).toBe(0)
    expect(r.ok).toBe(true)
  })

  it('T_total = T_req + Q formula', () => {
    const r = pryingAction(40, 100, b, a, p, tf, db, Fy)
    expect(r.T_total).toBeCloseTo(r.Q + 40, 6)
  })

  it('thick plate (T_req << phi_Bn) → low alpha, Q small', () => {
    // When bolt utilisation is low, beta >> 1 → α = 1 (maximum prying for given T)
    // but T_total should still be ≤ phi_Bn
    const r = pryingAction(20, 150, b, a, p, tf, db, Fy)
    expect(r.T_total).toBeLessThanOrEqual(150 + 1e-9)
    expect(r.ok).toBe(true)
  })

  it('t_req formula: 4·T·b_prime / (phi_f·Fy·p·(1+δα))', () => {
    const r = pryingAction(50, 120, b, a, p, tf, db, Fy)
    const phi_f = 0.90
    const expected = Math.sqrt((4 * 50 * 1000 * r.b_prime) / (phi_f * Fy * p * (1 + r.delta * r.alpha)))
    expect(r.t_req).toBeCloseTo(expected, 4)
  })

  it('t_no_prying > t_req (thicker plate needed to eliminate prying)', () => {
    const r = pryingAction(60, 100, b, a, p, tf, db, Fy)
    // t_no_prying is always ≥ t_req when prying present
    expect(r.t_no_prying).toBeGreaterThanOrEqual(r.t_req - 1e-9)
  })
})

describe('double shear §J3.6', () => {
  // Shear strength is counted PER SHEAR PLANE; bearing is a plate check and is
  // not. Getting that wrong the other way — doubling bearing too — would make a
  // splice look stronger than it is, in the direction that matters.
  it('doubles the shear capacity and leaves bearing alone', () => {
    const single = boltShear('A325M', 20, 150, 10, 400, true, 1)
    const double = boltShear('A325M', 20, 150, 10, 400, true, 2)
    expect(double.phiRn_shear).toBeCloseTo(2 * single.phiRn_shear, 9)
    expect(double.phiRn_bearing).toBeCloseTo(single.phiRn_bearing, 9)
  })

  it('lets bearing govern once shear is doubled', () => {
    // 20 mm A325M-N on a thin 6 mm ply: shear governs at one plane, bearing at
    // two. If the governing min() were skipped this test would not move.
    const single = boltShear('A325M', 20, 150, 6, 400, true, 1)
    const double = boltShear('A325M', 20, 150, 6, 400, true, 2)
    expect(single.phiRn).toBeCloseTo(single.phiRn_shear, 9)
    expect(double.phiRn).toBeCloseTo(double.phiRn_bearing, 9)
    expect(double.phiRn).toBeGreaterThan(single.phiRn)
  })

  it('defaults to one plane, so existing calls are unchanged', () => {
    const implicit = boltShear('A490M', 22, 200, 12, 400)
    const explicit = boltShear('A490M', 22, 200, 12, 400, true, 1)
    expect(implicit).toEqual(explicit)
  })
})

describe('a free-form bolt pattern is the same solver as the grid', () => {
  // The custom-pattern path exists so an eccentric bracket can be checked. The
  // risk is that it becomes a SECOND implementation that quietly disagrees with
  // the grid one, so this feeds the grid's own absolute coordinates back
  // through `boltGeomFromPositions` and demands an identical answer.
  const grid = boltGroupGeom(3, 2, 70, 70, 40, 45)
  const asPositions = grid.bolts.map((b) => ({ id: b.id, x: b.x + grid.Cx, y: b.y + grid.Cy }))
  const rebuilt = boltGeomFromPositions(asPositions)

  it('reproduces the geometry', () => {
    expect(rebuilt.n).toBe(grid.n)
    expect(rebuilt.Cx).toBeCloseTo(grid.Cx, 9)
    expect(rebuilt.Cy).toBeCloseTo(grid.Cy, 9)
    expect(rebuilt.Ip).toBeCloseTo(grid.Ip, 6)
    for (let i = 0; i < grid.n; i++) {
      expect(rebuilt.bolts[i].x).toBeCloseTo(grid.bolts[i].x, 9)
      expect(rebuilt.bolts[i].y).toBeCloseTo(grid.bolts[i].y, 9)
    }
  })

  it('reproduces the bolt forces, including which bolt is critical', () => {
    const a = eccentricBoltGroup(grid,    150, 20, 90, 0, 73, 20, 10)
    const b = eccentricBoltGroup(rebuilt, 150, 20, 90, 0, 73, 20, 10)
    expect(b.Rmax).toBeCloseTo(a.Rmax, 9)
    expect(b.critical).toBe(a.critical)
    expect(b.M).toBeCloseTo(a.M, 9)
    for (let i = 0; i < a.bolts.length; i++) expect(b.bolts[i].R).toBeCloseTo(a.bolts[i].R, 9)
  })

  it('handles a pattern that is NOT a rectangle', () => {
    // The reason the feature exists: three bolts in a triangle have no rows.
    const tri = boltGeomFromPositions([
      { id: 'B1', x: 0, y: 0 }, { id: 'B2', x: 120, y: 0 }, { id: 'B3', x: 60, y: 100 },
    ])
    expect(tri.n).toBe(3)
    expect(tri.Cx).toBeCloseTo(60, 9)
    expect(tri.Cy).toBeCloseTo(100 / 3, 9)
    const r = eccentricBoltGroup(tri, 100, 0, 150, 0, 73, 20, 10)
    expect(r.bolts).toHaveLength(3)
    expect(Number.isFinite(r.Rmax)).toBe(true)
  })
})
