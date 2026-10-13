import { describe, it, expect } from 'vitest'
import { channelFlexure, channelWeakFlexure, channelShear, channelGeom, teeFlexure, teeShear, teeGeom } from './openFlexure'
import { shapeByName } from './aiscSections'

const IN3 = 16387.064, IN4 = 25.4 ** 4
const sh = (n: string) => shapeByName(n)!
const Fy = 345

describe('channel geometry — against the AISC Manual (C250x22.8 = C10×15.3)', () => {
  it('Zx = 15.86 in³ (Manual 15.9), Ix 67.5 in⁴ (Manual 67.3)', () => {
    const f = channelFlexure(sh('C250x22.8'), Fy, 500)
    expect(f.Zx / IN3).toBeCloseTo(15.86, 2)
    expect(Math.abs(f.Zx / IN3 / 15.9 - 1)).toBeLessThan(0.005)
    expect(Math.abs(f.Ix / IN4 / 67.3 - 1)).toBeLessThan(0.005)
  })
  it('the 1:6 flange taper puts x̄ on the Manual: 0.6385 in (tabulated 0.634); rectangles would say 0.722', () => {
    const g = channelGeom(sh('C250x22.8'))
    expect(g.xbar / 25.4).toBeCloseTo(0.6385, 3)
    expect(Math.abs(g.xbar / 25.4 / 0.634 - 1)).toBeLessThan(0.01)
  })
})

describe('§F2 channel strong-axis flexure — hand calcs (C250x22.8, Fy 345)', () => {
  // Mp = 345·259 888.7 = 89.66 kN·m; rts 22.014, c 1.0726, Lp 767.0, Lr 2513.0 mm
  it('Lb ≤ Lp: Mn = Mp', () => {
    const f = channelFlexure(sh('C250x22.8'), Fy, 500)
    expect(f.Mp).toBeCloseTo(89.662, 2)
    expect(f.Lp).toBeCloseTo(767.00, 1)
    expect(f.Lr).toBeCloseTo(2513.04, 0)
    expect(f.Mn).toBeCloseTo(f.Mp, 9)
    expect(f.ltbZone).toBe('plastic')
  })
  it('inelastic LTB (F2-2) at 1 m and 2 m: 84.83 / 64.07 kN·m', () => {
    expect(channelFlexure(sh('C250x22.8'), Fy, 1000).Mn).toBeCloseTo(84.826, 2)
    const f = channelFlexure(sh('C250x22.8'), Fy, 2000)
    expect(f.Mn).toBeCloseTo(64.074, 2)
    expect(f.governing).toBe('LTB')
    expect(f.ltbZone).toBe('inelastic')
  })
  it('elastic LTB (F2-3/F2-4) at 6 m: 18.37 kN·m', () => {
    const f = channelFlexure(sh('C250x22.8'), Fy, 6000)
    expect(f.Mn).toBeCloseTo(18.368, 2)
    expect(f.ltbZone).toBe('elastic')
    expect(f.phiMn).toBeCloseTo(0.9 * f.Mn, 9)
  })
  it('Cb scales the LTB branch and never lifts Mn past Mp', () => {
    const f1 = channelFlexure(sh('C250x22.8'), Fy, 2000, 1.0), f2 = channelFlexure(sh('C250x22.8'), Fy, 2000, 2.0)
    expect(f2.Mn).toBeGreaterThan(f1.Mn)
    expect(f2.Mn).toBeLessThanOrEqual(f2.Mp + 1e-9)
  })
})

describe('§F6 channel weak axis and §G2.1 shear', () => {
  it('C250x22.8: Zy 38 535 mm³, Sy 19 019 mm³ → Mn = min(Fy·Zy, 1.6·Fy·Sy) = 10.498 kN·m (the 1.6 cap governs)', () => {
    const w = channelWeakFlexure(sh('C250x22.8'), Fy)
    expect(w.Zy).toBeCloseTo(38535.06, 0)
    expect(w.Sy).toBeCloseTo(19018.73, 0)
    expect(w.Mn).toBeCloseTo(10.498, 2)
    expect(w.flangeClass).toBe('compact')                      // bf/tf 5.95 ≤ 9.15
  })
  it('shear: Aw = d·tw, h/tw 38.0 ≤ 61.2 → Cv1 = 1, and φ = 0.90 (not the I-shape 1.00): 288.65 kN', () => {
    const v = channelShear(sh('C250x22.8'), Fy)
    expect(v.Cv).toBe(1)
    expect(v.phiV).toBe(0.9)
    expect(v.phiVn).toBeCloseTo(288.653, 2)
  })
})

describe('§F9 tee — both senses (WT155x19.4 = WT6×13, flange up, Fy 345)', () => {
  it('geometry: Ix 11.70 in⁴ (Manual 11.7); ȳ 31.77 mm from the flange top; Zx 68 535 mm³', () => {
    const g = teeGeom(sh('WT155x19.4'))
    expect(g.Ix / IN4).toBeCloseTo(11.70, 1)
    expect(g.ybar).toBeCloseTo(31.774, 2)
    expect(g.Zx).toBeCloseTo(68534.99, 0)
    expect(g.Sxt).toBeLessThan(g.Sxc)                          // the stem tip is the far fibre
  })
  it('stem in TENSION (sagging), Lb 2 m: Mp = min(Fy·Zx, 1.6My) = 21.822, F9-6 → 21.607 kN·m', () => {
    const f = teeFlexure(sh('WT155x19.4'), Fy, 2000, 'tension')
    expect(f.My).toBeCloseTo(13.6387, 3)
    expect(f.Mp).toBeCloseTo(21.8219, 3)                      // 1.6·My governs Mp
    expect(f.Lp).toBeCloseTo(1627.23, 1)
    expect(f.Lr).toBeCloseTo(15816.4, 0)
    expect(f.Mn).toBeCloseTo(21.6069, 3)
    expect(f.MnFLB).toBe(Infinity)                             // bf/2tf 8.55 ≤ 9.15: compact flange
  })
  it('stem in COMPRESSION (hogging), Lb 2 m: Mcr(B<0) 29.12 → ≤ My 13.64; stem LB d/tw 26.54 → Fcr 297.49, Mn 11.761 kN·m', () => {
    const f = teeFlexure(sh('WT155x19.4'), Fy, 2000, 'compression')
    expect(f.Mp).toBeCloseTo(f.My, 9)
    expect(f.MnLTB).toBeCloseTo(13.6387, 3)
    expect(f.MnLB).toBeCloseTo(11.7606, 3)
    expect(f.Mn).toBeCloseTo(11.7606, 3)
    expect(f.governing).toBe('local buckling')
  })
  it('the stem-compression capacity is far below the stem-tension one — why a beam must check both', () => {
    const t = teeFlexure(sh('WT155x19.4'), Fy, 2000, 'tension'), c = teeFlexure(sh('WT155x19.4'), Fy, 2000, 'compression')
    expect(c.phiMn / t.phiMn).toBeLessThan(0.6)
  })
  it('§G3 shear: kv 1.2, d/tw 26.54 ≤ 29.01 → Cv2 = 1: φVn = 168.64 kN', () => {
    const v = teeShear(sh('WT155x19.4'), Fy)
    expect(v.Cv).toBe(1)
    expect(v.phiVn).toBeCloseTo(168.639, 2)
    expect(v.clause).toBe('G3')
  })
})
