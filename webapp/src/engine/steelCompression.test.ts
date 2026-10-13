import { describe, it, expect } from 'vitest'
import { steelCompression, torsionProps, torsionalFe, doubleAngleCompression } from './steelCompression'
import { shapeByName } from './aiscSections'

const sh = (n: string) => shapeByName(n)!
const Fy = 345

describe('torsional properties — thin-wall, against the AISC Manual', () => {
  it('C250x22.8 (C10×15.3): shear centre 0.796 in off the web back (AISC eo), Cw by DG9', () => {
    const tp = torsionProps(sh('C250x22.8'))!
    const e = tp.xo - (66 - 6.1 / 2) ** 2 * 11.1 / (2 * (66 - 3.05) * 11.1 + (254 - 11.1) * 6.1)   // xo − x̄
    expect((e - 6.1 / 2) / 25.4).toBeCloseTo(0.796, 2)            // AISC tabulates eo = 0.796 in
    // b′ 62.95, h′ 242.9: tf·b′³·h′²/12 · (3b′tf + 2h′tw)/(6b′tf + h′tw) = 1.2139e10 mm⁶
    expect(tp.Cw / 1e10).toBeCloseTo(1.2139, 3)
    expect(tp.J / 25.4 ** 4).toBeLessThan(0.209)                  // thin-wall J is LOW (no fillets): conservative
    expect(tp.symmetry).toBe('x')
    expect(tp.yo).toBe(0)
  })
  it('closed sections and angles have no §E4 properties', () => {
    expect(torsionProps(sh('HSS203x203x12.7'))).toBeNull()
    expect(torsionProps(sh('PIPE 4 STD'))).toBeNull()
    expect(torsionProps(sh('L51x51x6.4'))).toBeNull()
  })
})

describe('§E4 — hand calcs (E = 200 000, G = 77 200 MPa)', () => {
  it('W200x15 braced at 1 m both ways, Lcz = 6 m: TORSIONAL buckling governs (E4-2)', () => {
    // J = (2·100·5.21³ + 189.58·4.32³)/3 = 14 523 mm⁴, Cw = Iy(d−tf)²/4 = 8.297e9 mm⁶
    // Fe = (π²E·Cw/6000² + G·J)/(Ix+Iy) = 115.42 MPa  vs  Fey(1 m) = 903.98
    const r = steelCompression(sh('W200x15'), Fy, 1000, 1000, 6000)
    expect(r.FeTorsional).toBeCloseTo(115.42, 1)
    expect(r.FeFlexural).toBeCloseTo(903.98, 1)
    expect(r.mode).toBe('torsional')
    expect(r.Fcr).toBeCloseTo(101.23, 1)                          // 0.658^(345/115.42)·345
    expect(r.clause.startsWith('E4')).toBe(true)
  })
  it('C250x22.8 at 3 m: Fez 255.36, H 0.8713, E4-3 with Fex → 251.04 MPa; flexure about y still governs', () => {
    const s = sh('C250x22.8'), tp = torsionProps(s)!
    expect(torsionalFe(s, tp, 3000, 3000, 3000)).toBeCloseTo(251.04, 1)
    const r = steelCompression(s, Fy, 3000, 3000, 3000)
    expect(r.FeFlexural).toBeCloseTo(71.85, 1)                    // y: 3000/18.1
    expect(r.mode).toBe('flexural')
  })
  it('WT155x19.4 at 3 m: FLEXURAL-TORSIONAL governs (Fe 260.30 < Fey 323.41), stem slender → E7', () => {
    // ȳ 31.77, yo 26.95, J 59 395, Cw 4.677e7, r̄o² 4 181.1, H 0.8263, Fez 446.80
    const r = steelCompression(sh('WT155x19.4'), Fy, 3000, 3000, 3000)
    expect(r.FeTorsional).toBeCloseTo(260.30, 1)
    expect(r.mode).toBe('flexural-torsional')
    expect(r.Fcr).toBeCloseTo(198.11, 1)
    // stem d/tw 26.54 > 0.75√(E/Fy) 18.06 and > 18.06·√(Fy/Fcr) = 23.83 → reduced:
    // Fel = (1.49·18.06/26.54)²·345 = 354.56, be/b = (1 − 0.22·1.3378)·1.3378 = 0.94407
    expect(r.Ae).toBeCloseTo(2409.37, 1)
    expect(r.phiPn).toBeCloseTo(429.58, 1)
    expect(r.clause).toBe('E4 + E7')
  })
  it('E4-3 never exceeds either uncoupled mode, and equals the lesser when the shear centre is on the centroid', () => {
    const s = sh('WT155x19.4'), tp = torsionProps(s)!
    for (const L of [1000, 2000, 4000, 8000]) {
      const Fe = torsionalFe(s, tp, L, L, L)
      const Fey = Math.PI ** 2 * 200_000 / (L / s.ry) ** 2
      expect(Fe).toBeLessThanOrEqual(Fey + 1e-9)
      const sym = torsionalFe(s, { ...tp, yo: 1e-9 }, L, L, L)
      const ro2 = (tp.Ix + tp.Iy) / s.A
      const Fez = (Math.PI ** 2 * 200_000 * tp.Cw / L ** 2 + 77_200 * tp.J) / (s.A * ro2)
      expect(sym).toBeCloseTo(Math.min(Fey, Fez), 3)
    }
  })
})

describe('§E7 — effective area', () => {
  it('HSS305x305x6.4: four walls (b−3t)/t = 48.49 > 33.71, Ae at its own Fcr by E7-3 (c1 0.20, c2 1.38)', () => {
    const s = sh('HSS305x305x6.4')
    const r = steelCompression(s, Fy, 3000, 3000, 3000)
    const lam = (304.8 - 3 * 5.92) / 5.92, lr = 1.4 * Math.sqrt(200_000 / Fy)
    const Fel = (1.38 * lr / lam) ** 2 * Fy, k = Math.sqrt(Fel / r.Fcr)
    expect(r.Ae).toBeCloseTo(s.A - 4 * (1 - (1 - 0.2 * k) * k) * lam * 5.92 ** 2, 6)
    expect(r.Ae).toBeLessThan(s.A)
    expect(r.mode).toBe('flexural')                               // closed: no §E4
    expect(r.clause).toBe('E3 + E7')
  })
  it('at the same λ an element is NOT reduced once Fcr is low enough (λ ≤ λr√(Fy/Fcr))', () => {
    const s = sh('HSS305x305x6.4')
    const long = steelCompression(s, Fy, 30000, 30000, 30000)     // Fcr tiny
    expect(long.Ae).toBeCloseTo(s.A, 9)
  })
  it('round HSS: Ae = [0.038E/(Fy·D/t) + 2/3]·Ag between 0.11 and 0.45 E/Fy (E7-7)', () => {
    const s = sh('PIPE 4 STD'), Fy2 = 1500                        // pushes D/t 20.4 past 0.11E/Fy = 14.7
    const r = steelCompression(s, Fy2, 3000, 3000, 3000)
    expect(r.Ae).toBeCloseTo((0.038 * 200_000 / (Fy2 * 114.3 / 5.61) + 2 / 3) * s.A, 6)
  })
  it('a compact W has Ae = Ag and §E3 only', () => {
    const r = steelCompression(sh('W310x79'), Fy, 4000, 4000, 4000)
    expect(r.Ae).toBe(sh('W310x79').A)
    expect(r.clause).toBe('E3')
  })
})

describe('scope', () => {
  it('a single angle outside §E5 is refused (E4-4 not implemented); with §E5 it is designed', () => {
    expect(steelCompression(sh('L51x51x6.4'), Fy, 1500, 1500, 1500).applicable).toBe(false)
    const r = steelCompression(sh('L51x51x6.4'), Fy, 1500, 1500, 1500, { slenderness: 153.75 })
    expect(r.applicable).toBe(true)
    expect(r.clause).toBe('E5')
    expect(r.FeFlexural).toBeCloseTo(Math.PI ** 2 * 200_000 / 153.75 ** 2, 9)
  })
})

describe('§E6 built-up double angle — hand calcs (2L 64×64×6.4, gap 10 mm, Lc 2 m, Fy 248)', () => {
  const L = sh('L64x64x6.4'), Fy2 = 248
  // ry(2L) = √(19.4² + (18.1 + 5)²) = 30.17; rz = 12.2; J = 2·(2·63.5 − 6.35)·6.35³/3 = 20 594.8
  // ȳ = 18.2145 from the outstanding legs' face → yo 15.0395; r̄o² 1 512.52; H 0.85046; Fez 684.358
  it('fillers at the third points (a = 666.7, a/ri 54.6 > 40): E6-2 lifts KL/r about y from 66.30 to 71.71', () => {
    const r = doubleAngleCompression(L, 10, Fy2, 2000, 2000, 2000 / 3)
    expect(r.e6.aRi).toBeCloseTo(54.645, 2)
    expect(r.e6.slendernessYo).toBeCloseTo(66.300, 2)
    expect(r.e6.slendernessYm).toBeCloseTo(71.710, 2)                // √(66.30² + (0.5·54.645)²)
    expect(r.FeTorsional).toBeCloseTo(335.578, 2)                     // E4-3 with Fey(m) 383.862
    expect(r.slendernessX).toBeCloseTo(103.093, 2)                    // x governs: Fex 185.73
    expect(r.mode).toBe('flexural')
    expect(r.Fcr).toBeCloseTo(141.817, 2)
    expect(r.phiPn).toBeCloseTo(196.048, 2)
    expect(r.e6.spacingOK).toBe(true)                                 // 54.6 ≤ 0.75·103.1
    expect(r.clause).toBe('E6')
  })
  it('no intermediate connectors (a = L, a/ri 163.9): FLEXURAL-TORSIONAL governs, and §E6.2 fails', () => {
    const r = doubleAngleCompression(L, 10, Fy2, 2000, 2000, 2000)
    expect(r.e6.slendernessYm).toBeCloseTo(105.425, 2)
    expect(r.FeTorsional).toBeCloseTo(169.281, 2)                     // < Fex 185.73, < Fey(m) 177.60
    expect(r.mode).toBe('flexural-torsional')
    expect(r.Fcr).toBeCloseTo(134.323, 2)
    expect(r.phiPn).toBeCloseTo(185.688, 2)
    expect(r.e6.spacingOK).toBe(false)                                // 163.9 > 0.75·105.4
    expect(r.clause).toBe('E6 + E4')
  })
  it('a/ri ≤ 40 leaves the slenderness unmodified (E6-1)', () => {
    const r = doubleAngleCompression(L, 10, Fy2, 2000, 2000, 400)     // a/ri 32.8
    expect(r.e6.slendernessYm).toBeCloseTo(r.e6.slendernessYo, 12)
  })
  it('more connectors never weaken the member', () => {
    const p = [2000, 1000, 666.7, 500, 400].map((a) => doubleAngleCompression(L, 10, Fy2, 2000, 2000, a).phiPn)
    for (let k = 1; k < p.length; k++) expect(p[k]).toBeGreaterThanOrEqual(p[k - 1] - 1e-9)
  })
})
