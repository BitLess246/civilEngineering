import { describe, it, expect } from 'vitest'
import {
  tabPlateChecks, tabWeldCheck, sizeTabWeld, copedTee, copedBeamChecks, cantileverLambda, qFactor, netPlasticModulus,
} from './shearTabChecks'
import { designBolts, type ShearTab } from './steelConnections'

// 3-M20 at 75 mm pitch, 40 mm edges, bolt line 60 mm off the weld line:
// the tab is 230 high and 140 wide (60 + 2·40). Plate A36: Fy 248, Fu 400.
const bolts = designBolts(200, { dia: 20, aMm: 60, locations: [0, 1, 2].map((k) => ({ id: `B${k + 1}`, x: 60, y: 40 + 75 * k })) })
const tab: ShearTab = { t: 10, wMm: 140, hMm: 230, weldSizeMm: 6, phiVn: 0, phiWeldVn: 0 }

describe('tabPlateChecks — every plate limit state, by hand', () => {
  const r = tabPlateChecks(bolts, tab, 200)
  it('§J4.2(a) shear yielding: 1.0·0.6·248·10·230 = 342.24 kN', () => {
    expect(r.phiVy).toBeCloseTo(342.24, 6)
  })
  it('§J4.2(b) shear rupture: Anv = (230 − 3·22)·10 = 1640 → 0.75·0.6·400·1640 = 295.2 kN', () => {
    expect(r.Anv).toBeCloseTo(1640, 9)
    expect(r.phiVr).toBeCloseTo(295.2, 6)
  })
  it('§J4.3 block shear: Lv = 2·75 + 40, Lt = 80 → Agv 1900, Anv 1350, Ant 690; shear-yield cap governs at 419.04 kN', () => {
    expect(r.blockShear.Agv).toBeCloseTo(1900, 9)
    expect(r.blockShear.Anv).toBeCloseTo(1350, 9)
    expect(r.blockShear.Ant).toBeCloseTo(690, 9)
    // min(0.6·400·1350, 0.6·248·1900) + 400·690 = 282 720 + 276 000 N
    expect(r.blockShear.phiRn).toBeCloseTo(0.75 * 558.72, 6)
  })
  it('flexure at the bolt line: Mu = 200·60; Znet = 10·230²/4 − 10·22²/4 − 2·10·22·75 = 98 040 mm³', () => {
    expect(r.flexure.Mu).toBeCloseTo(12000, 9)
    expect(r.flexure.Znet).toBeCloseTo(98040, 6)
    expect(r.flexure.phiMnRupture).toBeCloseTo(0.75 * 400 * 98040 / 1000, 6)
    // Eq. 10-5: (200/342.24)² + (12 000/(0.9·248·132 250/1000))²
    expect(r.flexure.interaction).toBeCloseTo((200 / 342.24) ** 2 + (12000 / (0.9 * 248 * 132250 / 1000)) ** 2, 9)
    expect(r.flexure.interaction).toBeCloseTo(0.50677, 4)
  })
  it('a 230 mm plate cantilevered 60 mm does not buckle: λ = 0.204, Q = 1', () => {
    expect(r.flexure.lambda).toBeCloseTo(230 * Math.sqrt(248 / 6.894757) / (10 * 10 * Math.sqrt(475 + 280 * (230 / 60) ** 2)), 12)
    expect(r.flexure.lambda).toBeCloseTo(0.2036, 4)
    expect(r.flexure.Q).toBe(1)
    expect(r.flexure.phiMnBuckling).toBeCloseTo(0.9 * 248 * 10 * 230 ** 2 / 6 / 1000, 6)
  })
  it('governs on the largest ratio — the Eq. 10-5 interaction √0.5068 = 0.712 over rupture 200/295.2 = 0.678', () => {
    expect(r.governs).toBe('flexure (yield + shear)')
    expect(r.util).toBeCloseTo(Math.sqrt(0.50677), 4)
    expect(r.ok).toBe(true)
  })
  it('a 6 mm plate fails on the same interaction: (200/205.34)² + (12 000/17 711)² = 1.408', () => {
    const thin = tabPlateChecks(bolts, { ...tab, t: 6 }, 200)
    expect(thin.ok).toBe(false)
    const phiVy = 0.6 * 248 * 6 * 230 / 1000, phiMy = 0.9 * 248 * 6 * 230 ** 2 / 4 / 1000
    expect(thin.util).toBeCloseTo(Math.sqrt((200 / phiVy) ** 2 + (12000 / phiMy) ** 2), 9)
    expect(thin.governs).toBe('flexure (yield + shear)')
  })
})

describe('Manual Part 9 λ and Q', () => {
  it('Q is continuous at both breaks', () => {
    expect(qFactor(0.7)).toBe(1)
    expect(1.34 - 0.486 * 0.7).toBeCloseTo(1, 2)
    expect(qFactor(1.41)).toBeCloseTo(1.3 / 1.41 ** 2, 2)
    expect(qFactor(2)).toBeCloseTo(1.3 / 4, 12)
  })
  it('λ grows as the cantilever lengthens', () => {
    expect(cantileverLambda(288, 5.8, 300, 345)).toBeGreaterThan(cantileverLambda(288, 5.8, 95, 345))
  })
  it('net plastic modulus: no holes is t·h²/4; a hole off the axis takes t·dh·|y|', () => {
    expect(netPlasticModulus(200, 10, [], 22)).toBe(100000)
    expect(netPlasticModulus(200, 10, [50], 22)).toBeCloseTo(100000 - 10 * 22 * 50, 9)
  })
})

describe('tabWeldCheck — elastic weld line with the moment V·a', () => {
  // Vu = 200 kN at a = 60 mm on a 230 mm line: direct 200 000/230 N/mm down,
  // torsional 12·10⁶·115/(230³/12) along the line at its ends.
  const w = tabWeldCheck(bolts, tab, 200, 6, { t: 15, Fu: 450 })
  it('fMax = √(869.6² + 1361.1²) = 1615.1 N/mm against 0.75·0.6·482·0.707·(2·6)', () => {
    expect(w.fMax).toBeCloseTo(Math.hypot(200000 / 230, 12e6 * 115 / (230 ** 3 / 12)), 6)
    expect(w.fMax).toBeCloseTo(1615.12, 1)
    expect(w.phiWeld).toBeCloseTo(0.75 * 0.6 * 482 * 0.707 * 12, 6)
  })
  it('base metal: tab 0.75·0.6·400·10 = 1800, support 2·0.75·0.6·450·15 N/mm', () => {
    expect(w.phiTab).toBeCloseTo(1800, 9)
    expect(w.phiSupport).toBeCloseTo(2 * 0.75 * 0.6 * 450 * 15, 9)
    // the 10 mm tab's own rupture (1800) is below the weld (1840): it governs
    expect(w.governs).toBe('tab base metal')
    expect(w.util).toBeCloseTo(1615.12 / 1800, 3)
  })
  it('a tab opposite on the same support adds its force to the support', () => {
    const both = tabWeldCheck(bolts, tab, 200, 6, { t: 6, Fu: 400 }, 482, 400, 1615.12)
    expect(both.util).toBeCloseTo((1615.12 + w.fMax) / (2 * 0.75 * 0.6 * 400 * 6), 3)
    expect(both.governs).toBe('support base metal')
    expect(both.ok).toBe(false)
  })
  it('the minimum leg is Table J2.4 for the thinner part', () => {
    expect(tabWeldCheck(bolts, tab, 10, 3, { t: 15, Fu: 450 }).governs).toBe('minimum size')   // 10 mm tab → 5
  })
  it('sizeTabWeld picks the smallest whole-mm leg that passes', () => {
    const s = sizeTabWeld(bolts, tab, 200, { t: 15, Fu: 450 })
    expect(s.w).toBe(6)
    expect(tabWeldCheck(bolts, tab, 200, 5, { t: 15, Fu: 450 }).fMax).toBeGreaterThan(0.75 * 0.6 * 482 * 0.707 * 10)
  })
})

describe('coped beam — the tee left at the cope', () => {
  it('a tee with bf = tw is a rectangle: S = tw·ho²/6, Z = tw·ho²/4', () => {
    const r = copedTee(300, 8, 8, 10)
    expect(r.S).toBeCloseTo(8 * 300 ** 2 / 6, 6)
    expect(r.Z).toBeCloseTo(8 * 300 ** 2 / 4, 6)
  })
  // W310x38.7 (d 310, bf 165, tf 9.7, tw 5.8), cope 95 long × 22 deep,
  // Fy 345, Fu 448, Vu 120 kN — e = 95 + 13 mm from the support face.
  const beam = { d: 310, bf: 165, tf: 9.7, tw: 5.8 }
  it('section of the tee by hand: ȳ 77.16 mm, I 27.09·10⁶ mm⁴, S 128 507 mm³, Z 232 362 mm³', () => {
    const r = copedTee(288, 5.8, 165, 9.7)
    expect(r.ybar).toBeCloseTo(77.1555, 3)
    expect(r.I).toBeCloseTo(27094991.28, 0)
    expect(r.S).toBeCloseTo(128506.99, 1)
    expect(r.Z).toBeCloseTo(232361.99, 1)
  })
  it('short cope: λ 0.636 → Q 1, buckling 0.9·345·S; rupture 0.75·448·Z; Mu = 120·108', () => {
    const r = copedBeamChecks(beam, { lengthMm: 95, depthMm: 22 }, bolts, 120, 345, 448)
    expect(r.Mu).toBeCloseTo(12960, 9)
    expect(r.lambda).toBeCloseTo(0.63619, 4)
    expect(r.Q).toBe(1)
    expect(r.phiMnBuckling).toBeCloseTo(39901.42, 1)
    expect(r.phiMnRupture).toBeCloseTo(78073.63, 1)
    expect(r.phiVy).toBeCloseTo(0.6 * 345 * 5.8 * 288 / 1000, 9)
    expect(r.phiVr).toBeCloseTo(0.75 * 0.6 * 448 * (288 - 66) * 5.8 / 1000, 9)
    expect(r.ok).toBe(true)
  })
  it('a long cope buckles first: c = 300 → λ 1.30, Q = 1.34 − 0.486λ', () => {
    const r = copedBeamChecks(beam, { lengthMm: 300, depthMm: 22 }, bolts, 120, 345, 448)
    expect(r.lambda).toBeGreaterThan(0.7)
    expect(r.Q).toBeCloseTo(1.34 - 0.486 * r.lambda, 12)
    expect(r.phiMnBuckling).toBeCloseTo(0.9 * r.Q * 345 * 128506.99 / 1000, 0)
  })
})
