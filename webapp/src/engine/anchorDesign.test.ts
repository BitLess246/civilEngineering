import { describe, it, expect } from 'vitest'
import { checkAnchorGroup, anchorAse, heavyHexAbrg } from './anchorDesign'

// Four ⌀25 F1554-36 headed rods at 260 × 210 in a 600 × 600 pedestal (edges
// 170 / 195), hef 300, f′c 28, cracked, Nua 50 kN, Vua 20 kN — every mode by hand.
const base = {
  nx: 2, ny: 2, sx: 260, sy: 210, edges: [170, 170, 195, 195] as [number, number, number, number],
  hef: 300, da: 25, futa: 400, fya: 248, fc: 28, Nua: 50, Vua: 20,
}
const r = checkAnchorGroup(base)
const sq = Math.sqrt(28)

describe('anchor rod properties', () => {
  it('Ase = π/4·(d − 0.9382p)²: a 1″ rod (8 tpi) 380.9 mm² (AISC 0.606 in² = 391)', () => {
    expect(anchorAse(25)).toBeCloseTo((Math.PI / 4) * (25 - 0.9382 * 3.175) ** 2, 9)
    expect(anchorAse(25)).toBeGreaterThan(375)
    expect(anchorAse(25)).toBeLessThan(395)
  })
  it('a heavy hex nut bears on (√3/2)(1.625d)² − πd²/4: 938 mm² for 1″ (DG1: 1.50 in² = 968)', () => {
    expect(heavyHexAbrg(25)).toBeCloseTo((Math.sqrt(3) / 2) * 40.625 ** 2 - (Math.PI / 4) * 625, 9)
    expect(Math.abs(heavyHexAbrg(25) - 968) / 968).toBeLessThan(0.05)
  })
})

describe('ACI 318-14 Ch. 17 — the pedestal group, by hand', () => {
  it('four edges inside 1.5·hef: h′ef = max(195/1.5, 260/3) = 130 (§17.4.2.3)', () => {
    expect(r.hefUsed).toBeCloseTo(130, 9)
  })
  it('steel tension: 4 · Ase · 400 · φ0.75 (§17.4.1)', () => {
    expect(r.tension.steel.phiN).toBeCloseTo((0.75 * 4 * anchorAse(25) * 400) / 1000, 6)
  })
  it('breakout: ANc/ANco = 600²/(9·130²) = 2.367, ψed = 0.7 + 0.3·170/195, Nb = 10√f′c·130^1.5 → φNcbg 124.9 kN', () => {
    const Nb = 10 * sq * 130 ** 1.5
    const Ncbg = (360000 / (9 * 130 * 130)) * (0.7 + (0.3 * 170) / 195) * Nb
    expect(r.tension.breakout.phiN).toBeCloseTo((0.7 * Ncbg) / 1000, 6)
    expect(r.tension.breakout.phiN).toBeCloseTo(124.9, 0)
  })
  it('pullout: 4 · 8·Abrg·f′c · φ0.70 (§17.4.3, headed)', () => {
    expect(r.tension.pullout.phiN).toBeCloseTo((0.7 * 4 * 8 * heavyHexAbrg(25) * 28) / 1000, 6)
  })
  it('no side-face blowout: hef 300 ≤ 2.5·ca1 = 425 (§17.4.4)', () => {
    expect(r.tension.sideFace).toBeNull()
  })
  it('steel shear: 4 · 0.6·Ase·futa · 0.8 grout pad · φ0.65 (§17.5.1)', () => {
    expect(r.shear.steel.phiN).toBeCloseTo((0.65 * 4 * 0.6 * anchorAse(25) * 400 * 0.8) / 1000, 6)
  })
  it('shear breakout toward the 170 edge: AVc 600·255, AVco 4.5·170², Vb = 3.7√f′c·170^1.5 governs, ψed(195) → φVcbg 33.2 kN', () => {
    const Vb = Math.min(0.6 * (200 / 25) ** 0.2 * 5 * sq * 170 ** 1.5, 3.7 * sq * 170 ** 1.5)
    expect(Vb).toBeCloseTo(3.7 * sq * 170 ** 1.5, 9)
    const Vcbg = ((600 * 255) / (4.5 * 170 * 170)) * (0.7 + (0.3 * 195) / 255) * Vb
    expect(r.shear.breakout.phiN).toBeCloseTo((0.7 * Vcbg) / 1000, 6)
    expect(r.shear.breakout.phiN).toBeCloseTo(33.2, 0)
  })
  it('pryout: 2·Ncbg · φ0.70 (§17.5.3, hef ≥ 65)', () => {
    expect(r.shear.pryout.phiN).toBeCloseTo((2 * r.tension.breakout.phiN), 6)
  })
  it('both over 20 %: N/φNn + V/φVn = 0.400 + 0.602 = 1.002 ≤ 1.2 → interaction governs at 0.835 (§17.6)', () => {
    expect(r.interaction).toBeCloseTo(50 / r.phiNn + 20 / r.phiVn, 9)
    expect(r.governs).toMatch(/interaction/)
    expect(r.util).toBeCloseTo(r.interaction / 1.2, 9)
    expect(r.ok).toBe(true)
  })
  it('under seismic load the concrete tension modes drop to 75 % (§17.2.3.4.4); steel does not', () => {
    const s = checkAnchorGroup({ ...base, seismic: true })
    expect(s.tension.breakout.phiN).toBeCloseTo(0.75 * r.tension.breakout.phiN, 9)
    expect(s.tension.pullout.phiN).toBeCloseTo(0.75 * r.tension.pullout.phiN, 9)
    expect(s.tension.steel.phiN).toBeCloseTo(r.tension.steel.phiN, 9)
  })
})

describe('ACI 318-14 Ch. 17 — the rules around the numbers', () => {
  it('far from every edge the full hef stands and the projected area caps at n·ANco', () => {
    const f = checkAnchorGroup({ ...base, edges: [1e4, 1e4, 1e4, 1e4] })
    expect(f.hefUsed).toBe(300)
    // 280 ≤ hef ≤ 635: Nb = 3.9√f′c·hef^(5/3); spacings < 3hef so ANc < 4·ANco
    const ANc = (450 + 260 + 450) * (450 + 210 + 450)
    expect(f.tension.breakout.phiN).toBeCloseTo((0.7 * (ANc / (9 * 300 * 300)) * 3.9 * sq * 300 ** (5 / 3)) / 1000, 6)
  })
  it('a deep anchor 100 mm from an edge checks side-face blowout', () => {
    const d = checkAnchorGroup({ ...base, edges: [100, 1e4, 1e4, 1e4], hef: 400 })
    expect(d.tension.sideFace).not.toBeNull()
    expect(d.edgeOK).toBe(false)                 // 100 < 6·25
  })
  it('one mode alone when the other is ≤ 20 % of its strength', () => {
    const t = checkAnchorGroup({ ...base, Vua: 1 })
    expect(t.interaction).toBeCloseTo(50 / t.phiNn, 9)
    const v = checkAnchorGroup({ ...base, Nua: 0 })
    expect(v.interaction).toBeCloseTo(20 / v.phiVn, 9)
  })
  it('edge reinforcement lifts shear breakout by ψc,V 1.2 / 1.4 (§17.5.2.7)', () => {
    expect(checkAnchorGroup({ ...base, edgeReinf: 'bars' }).shear.breakout.phiN).toBeCloseTo(1.2 * r.shear.breakout.phiN, 9)
    expect(checkAnchorGroup({ ...base, edgeReinf: 'bars+ties' }).shear.breakout.phiN).toBeCloseTo(1.4 * r.shear.breakout.phiN, 9)
  })
  it('a hooked rod pulls out at 0.9·f′c·eh·da — far below a headed one', () => {
    const h = checkAnchorGroup({ ...base, head: 'hooked', eh: 4.5 * 25 })
    expect(h.tension.pullout.phiN).toBeCloseTo((0.7 * 4 * 0.9 * 28 * 112.5 * 25) / 1000, 6)
    expect(h.tension.pullout.phiN).toBeLessThan(r.tension.pullout.phiN / 2.5)   // 198 vs 589 kN
  })
})
