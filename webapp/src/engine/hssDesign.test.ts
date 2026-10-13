import { describe, it, expect } from 'vitest'
import { hssKind, hssProps, hssFlexure, hssShear } from './hssDesign'
import { shapeByName } from './aiscSections'

const IN3 = 16387.064   // mm³ per in³
const sh = (n: string) => shapeByName(n)!

describe('hssProps — against the AISC Manual (tabulated, design wall)', () => {
  it('kind', () => {
    expect(hssKind(sh('HSS203x203x12.7'))).toBe('rect')
    expect(hssKind(sh('PIPE 4 STD'))).toBe('round')
    expect(hssKind(sh('W310x52'))).toBeNull()
  })
  it('HSS8×8×½ (HSS203x203x12.7): Z = 37.5 in³, I = 125 in⁴ — within 1.5 %, Z not above the table by > 0.5 %', () => {
    const p = hssProps(sh('HSS203x203x12.7'))
    expect(p.Ix / (25.4 ** 4)).toBeCloseTo(125, -1)
    expect(Math.abs(p.Zx / IN3 / 37.5 - 1)).toBeLessThan(0.015)
    expect(p.Zx / IN3).toBeLessThan(37.5 * 1.005)
    expect(p.Zy).toBeCloseTo(p.Zx, 6)                 // square
  })
  it('HSS6×6×¼ (HSS152x152x6.4): Z = 11.2 in³', () => {
    const p = hssProps(sh('HSS152x152x6.4'))
    expect(Math.abs(p.Zx / IN3 / 11.2 - 1)).toBeLessThan(0.02)
  })
  it('Pipe 4 Std: Z = (D³ − (D−2t)³)/6 = 4.05 in³ (D 4.5″, t 0.221″)', () => {
    const p = hssProps(sh('PIPE 4 STD'))
    expect(p.Zx / IN3).toBeCloseTo(4.05, 1)
    expect(p.Sx).toBeCloseTo((2 * p.Ix) / 114.3, 6)
  })
  it('rect J is Bredt: 4·Am²·t/p on the mid-wall line', () => {
    const p = hssProps(sh('HSS305x152x9.5'))
    const Am = (152.4 - 8.86) * (304.8 - 8.86), per = 2 * ((152.4 - 8.86) + (304.8 - 8.86))
    expect(p.J).toBeCloseTo((4 * Am ** 2 * 8.86) / per, 3)
  })
})

describe('§F7 rectangular HSS flexure — hand calcs (Fy = 345 MPa)', () => {
  const Fy = 345
  it('compact (HSS203x203x12.7, (b−3t)/t = 14.2 ≤ 26.97): Mn = Mp = Fy·Z', () => {
    const f = hssFlexure(sh('HSS203x203x12.7'), Fy, 'x', 3000)
    expect(f.flangeClass).toBe('compact')
    expect(f.lambdaF).toBeCloseTo((203.2 - 3 * 11.8) / 11.8, 9)
    expect(f.lambdaPF).toBeCloseTo(26.966, 2)
    expect(f.Mn).toBeCloseTo(f.Mp, 9)
    expect(f.phiMn).toBeCloseTo(0.9 * Fy * hssProps(sh('HSS203x203x12.7')).Zx / 1e6, 9)
    expect(f.governing).toBe('yielding')
  })
  it('noncompact flange (HSS305x305x9.5, λ = 31.40): Eq. F7-2', () => {
    const s = sh('HSS305x305x9.5'), p = hssProps(s)
    const f = hssFlexure(s, Fy, 'x', 3000)
    const lam = (304.8 - 3 * 8.86) / 8.86                       // 31.40
    expect(f.flangeClass).toBe('noncompact')
    const Mp = Fy * p.Zx / 1e6, My = Fy * p.Sx / 1e6
    const k = 3.57 * lam * Math.sqrt(Fy / 200_000) - 4.0        // 0.6560
    expect(k).toBeCloseTo(0.6560, 3)
    expect(f.Mn).toBeCloseTo(Mp - (Mp - My) * k, 9)
    expect(f.Mn).toBeLessThan(f.Mp)
    expect(f.governing).toBe('FLB')
  })
  it('slender flange is out of scope — no strength, the clause named', () => {
    const f = hssFlexure(sh('HSS305x305x6.4'), Fy, 'x', 3000)   // λ = 48.5 > 33.71
    expect(f.applicable).toBe(false)
    expect(f.phiMn).toBe(0)
    expect(f.reason).toContain('§F7.2(c)')
  })
  it('weak axis swaps flange and web walls and has no LTB', () => {
    const f = hssFlexure(sh('HSS305x152x9.5'), Fy, 'y', 1e9)
    expect(f.lambdaF).toBeCloseTo((304.8 - 3 * 8.86) / 8.86, 9)
    expect(f.MnLTB).toBe(Infinity)
  })
  it('§F7.4 LTB: Lp and Lr by Eq. F7-12/-13; square tubes never', () => {
    const s = sh('HSS305x152x9.5'), p = hssProps(s)
    const f = hssFlexure(s, Fy, 'x', 3000)
    const JA = Math.sqrt(p.J * s.A)
    expect(f.Lp).toBeCloseTo((0.13 * 200_000 * s.ry * JA) / (f.Mp * 1e6), 6)
    expect(f.Lr).toBeCloseTo((2 * 200_000 * s.ry * JA) / (0.7 * Fy * p.Sx), 6)
    expect(f.Lp / 1000).toBeCloseTo(4.82, 2)                  // 4.82 m — a long rect tube CAN be LTB-limited
    expect(f.MnLTB).toBe(Infinity)                             // Lb = 3 m < Lp
    const mid = (f.Lp + f.Lr) / 2
    const inel = hssFlexure(s, Fy, 'x', mid)
    expect(inel.MnLTB).toBeCloseTo(Math.min(inel.Mp, inel.Mp - (inel.Mp - 0.7 * Fy * p.Sx / 1e6) * 0.5), 9)   // F7-10, Cb = 1
    expect(inel.governing).toBe('LTB')
    const long = hssFlexure(s, Fy, 'x', f.Lr * 1.5)
    expect(long.MnLTB).toBeCloseTo(Math.min(long.Mp, (2 * 200_000 * JA) / (f.Lr * 1.5 / s.ry) / 1e6), 9)
    expect(hssFlexure(sh('HSS203x203x12.7'), Fy, 'x', 1e12).MnLTB).toBe(Infinity)
  })
})

describe('§F8 round HSS flexure', () => {
  it('compact pipe: Mn = Mp (Pipe 4 Std, D/t 20.4 ≤ 0.07E/Fy = 40.6 at 345)', () => {
    const f = hssFlexure(sh('PIPE 4 STD'), 345, 'x', 3000)
    expect(f.lambdaF).toBeCloseTo(114.3 / 5.61, 9)
    expect(f.flangeClass).toBe('compact')
    expect(f.Mn).toBeCloseTo(f.Mp, 9)
  })
  it('noncompact: Fcr = 0.021E/(D/t) + Fy (Eq. F8-2) times S', () => {
    // at Fy = 690, λp = 0.07E/Fy = 20.3 < 20.37 → just noncompact
    const s = sh('PIPE 4 STD'), p = hssProps(s), Fy = 690
    const f = hssFlexure(s, Fy, 'x', 3000)
    const Dt = 114.3 / 5.61
    expect(f.flangeClass).toBe('noncompact')
    expect(f.MnFLB).toBeCloseTo(((0.021 * 200_000) / Dt + Fy) * p.Sx / 1e6, 9)
  })
})

describe('§G4 / §G5 shear', () => {
  it('rect: Aw = 2ht with h = H − 3t, kv = 5, Cv2 = 1 for a stocky wall', () => {
    const v = hssShear(sh('HSS203x203x12.7'), 345, 'x', 3000)
    const h = 203.2 - 3 * 11.8
    expect(v.Aw).toBeCloseTo(2 * h * 11.8, 9)
    expect(v.Cv).toBe(1)
    expect(v.Vn).toBeCloseTo(0.6 * 345 * 2 * h * 11.8 / 1000, 9)   // 819.7 kN
    expect(v.Vn).toBeCloseTo(819.7, 0)
    expect(v.phiVn).toBeCloseTo(0.9 * v.Vn, 9)
  })
  it('rect Cv2 inelastic branch: 1.10√(kvE/Fy)/(h/t)', () => {
    // HSS305x305x6.4 at 345: h/t = 48.5 < 59.2 → Cv2 = 1; at Fy = 690: limit 41.9 → inelastic
    const v = hssShear(sh('HSS305x305x6.4'), 690, 'x', 3000)
    const ht = (304.8 - 3 * 5.92) / 5.92, l1 = 1.10 * Math.sqrt(5 * 200_000 / 690)
    expect(ht).toBeGreaterThan(l1)
    expect(v.Cv).toBeCloseTo(l1 / ht, 9)
  })
  it('round: Fcr capped at 0.6Fy for a stocky pipe, Vn = Fcr·Ag/2', () => {
    const v = hssShear(sh('PIPE 4 STD'), 345, 'x', 3000)
    expect(v.Cv).toBe(1)
    expect(v.Vn).toBeCloseTo(0.6 * 345 * 1910 / 2 / 1000, 9)
  })
})
