// ─────────────────────────────────────────────────────────────────────────
// Steel member compression — AISC 360-16 Chapter E (NSCP 2015 §505)
//
//   §E3  flexural buckling about both principal axes, Fe = π²E/(Lc/r)²
//   §E4  torsional (doubly symmetric, Eq. E4-2) and flexural-torsional
//        (singly symmetric, Eq. E4-3) buckling of OPEN sections:
//          W      doubly symmetric — Cw = Iy·ho²/4
//          C      symmetric about x (the strong axis): Fex couples with Fez
//          WT     symmetric about y (the stem): Fey couples with Fez
//        Closed sections (HSS, pipe) are not torsionally weak — §E4's user
//        note excludes them — so they take §E3 only.
//   §E7  effective area of slender elements at the governing Fcr (effective
//        width E7-2/E7-3 with Table E7.1 c1/c2; round HSS by E7-7). The
//        element limits and widths are `braceElements` / `braceEffectiveArea`
//        (steelBrace), the same E7 the braces already used — one copy.
//
// Fcr from Fe by Eq. E3-2/E3-3 (Fy/Fe ≤ 2.25 ⇔ inelastic), Pn = Fcr·Ae.
//
// Torsional properties are THIN-WALL, from centre-line dimensions (DG9):
//   W   J = (2·bf·tf³ + (d − 2tf)·tw³)/3            Cw = Iy·(d − tf)²/4
//   C   b′ = bf − tw/2, h′ = d − tf
//       J  = (2b′tf³ + h′tw³)/3
//       e  = 3b′²tf/(6b′tf + h′tw)                  shear centre off the web
//       Cw = tf·b′³·h′²/12 · (3b′tf + 2h′tw)/(6b′tf + h′tw)
//       x̄  = b′²tf/(2b′tf + h′tw)                   centroid off the web
//       xo = e + x̄
//   WT  ȳ from the flange top; shear centre at the flange mid-plane, so
//       yo = ȳ − tf/2;  J = (bf·tf³ + (d − tf/2)·tw³)/3
//       Cw = tf³bf³/144 + tw³(d − tf/2)³/36
// Ix, Iy are the tabulated A·r². Thin-wall J ignores the fillets, so it is
// LOW (C250x22.8: 0.181 against 0.209 in⁴) — the conservative side for Fez.
//
// Lcz is the torsional unbraced length: the member length with Kz = 1 unless
// the caller knows better (warping restrained ends would allow less).
//
// FAIL CLOSED: single angles outside §E5 (their §E4 is the general cubic of
// E4-4, not implemented) and built-up double angles (§E6) are not covered.
//
// Units: mm, mm², mm⁴, mm⁶, MPa; Pn and φPn in kN.
// ─────────────────────────────────────────────────────────────────────────

import type { AiscShape } from './aiscSections'
import { E_STEEL } from './steelDesign'
import { braceElements, braceEffectiveArea, type BraceElement } from './steelBrace'

const G_STEEL = 77_200
const PHI_C = 0.90

export interface TorsionProps {
  J: number; Cw: number
  /** Shear centre relative to the centroid along x (strong axis) and y, mm. */
  xo: number; yo: number
  Ix: number; Iy: number
  /** Which principal axis the section is symmetric about, or 'both'. */
  symmetry: 'both' | 'x' | 'y'
}

/** Thin-wall torsional properties of an open rolled shape; null for closed
 *  sections (HSS, pipe), which §E4 does not apply to, and for angles. */
export function torsionProps(s: AiscShape): TorsionProps | null {
  const Ix = s.A * s.rx ** 2, Iy = s.A * s.ry ** 2
  const { d, bf, tf, tw } = s
  if (d == null || bf == null || tf == null || tw == null) return null
  if (s.family === 'W') {
    const J = (2 * bf * tf ** 3 + (d - 2 * tf) * tw ** 3) / 3
    return { J, Cw: (Iy * (d - tf) ** 2) / 4, xo: 0, yo: 0, Ix, Iy, symmetry: 'both' }
  }
  if (s.family === 'C') {
    const b = bf - tw / 2, h = d - tf
    const J = (2 * b * tf ** 3 + h * tw ** 3) / 3
    const e = (3 * b * b * tf) / (6 * b * tf + h * tw)
    const Cw = ((tf * b ** 3 * h ** 2) / 12) * ((3 * b * tf + 2 * h * tw) / (6 * b * tf + h * tw))
    const xbar = (b * b * tf) / (2 * b * tf + h * tw)
    return { J, Cw, xo: e + xbar, yo: 0, Ix, Iy, symmetry: 'x' }
  }
  if (s.family === 'WT') {
    const Af = bf * tf, As = (d - tf) * tw
    const ybar = (Af * tf / 2 + As * (tf + (d - tf) / 2)) / (Af + As)
    const hs = d - tf / 2
    const J = (bf * tf ** 3 + hs * tw ** 3) / 3
    const Cw = (tf ** 3 * bf ** 3) / 144 + (tw ** 3 * hs ** 3) / 36
    return { J, Cw, xo: 0, yo: ybar - tf / 2, Ix, Iy, symmetry: 'y' }
  }
  return null
}

/** §E4 elastic buckling stress, MPa, for torsional / flexural-torsional
 *  modes. `Lcx`, `Lcy`, `Lcz` in mm. */
export function torsionalFe(s: AiscShape, tp: TorsionProps, Lcx: number, Lcy: number, Lcz: number, E = E_STEEL): number {
  const ro2 = tp.xo ** 2 + tp.yo ** 2 + (tp.Ix + tp.Iy) / s.A          // E4-11
  const Fez = ((Math.PI ** 2 * E * tp.Cw) / Lcz ** 2 + G_STEEL * tp.J) / (s.A * ro2)   // E4-9
  if (tp.symmetry === 'both')
    return ((Math.PI ** 2 * E * tp.Cw) / Lcz ** 2 + G_STEEL * tp.J) / (tp.Ix + tp.Iy)  // E4-2
  const H = 1 - (tp.xo ** 2 + tp.yo ** 2) / ro2                        // E4-10
  // E4-3 is written for y as the axis of symmetry; a channel is symmetric
  // about x, so its coupled flexural mode is the x one.
  const Fes = tp.symmetry === 'y'
    ? (Math.PI ** 2 * E) / (Lcy / s.ry) ** 2                      // E4-8
    : (Math.PI ** 2 * E) / (Lcx / s.rx) ** 2                      // E4-7
  const sum = Fes + Fez
  return (sum / (2 * H)) * (1 - Math.sqrt(1 - (4 * Fes * Fez * H) / sum ** 2))   // E4-3
}

export type CompressionMode = 'flexural' | 'torsional' | 'flexural-torsional'

export interface SteelCompression {
  applicable: boolean
  reason?: string
  /** Lc/r about x and y, and the larger (or the §E5 value when given). */
  slendernessX: number; slendernessY: number; slenderness: number
  FeFlexural: number
  /** §E4 Fe, MPa — Infinity where §E4 does not apply. */
  FeTorsional: number
  Fe: number
  mode: CompressionMode
  Fcr: number
  elements: BraceElement[]
  /** Effective area after §E7, mm² (= Ag when no element is slender at Fcr). */
  Ae: number
  Pn: number; phiPn: number
  /** Lc/r ≤ 200 (§E2 user note). */
  slenderOK: boolean
  /** Clauses that produced Pn, e.g. "E3 + E7" or "E4". */
  clause: string
}

/**
 * Design compressive strength of one rolled shape.
 * Lcx, Lcy, Lcz: effective lengths about x, y and for torsion, mm.
 * `slenderness`: a §E5 single-angle effective slenderness that REPLACES the
 * §E3 Lc/r (and §E4, which §E5 accounts for).
 */
export function steelCompression(
  s: AiscShape, Fy: number, Lcx: number, Lcy: number, Lcz: number,
  opts: { slenderness?: number; E?: number } = {},
): SteelCompression {
  // E feeds the buckling stresses; the Table B4.1a / E7 element limits stay on
  // the specification's E = 200 000 MPa.
  const E = opts.E ?? E_STEEL
  const slendernessX = Lcx / s.rx, slendernessY = Lcy / s.ry
  const fail = (reason: string): SteelCompression => ({
    applicable: false, reason, slendernessX, slendernessY, slenderness: Math.max(slendernessX, slendernessY),
    FeFlexural: 0, FeTorsional: Infinity, Fe: 0, mode: 'flexural', Fcr: 0, elements: [], Ae: 0, Pn: 0, phiPn: 0,
    slenderOK: false, clause: 'out-of-scope',
  })

  let slenderness: number, FeTors = Infinity
  if (opts.slenderness != null) {
    slenderness = opts.slenderness                                     // §E5
  } else {
    if (s.family === 'L')
      return fail(`${s.name}: single angle outside §E5 — its §E4 flexural-torsional buckling (Eq. E4-4) is not implemented`)
    slenderness = Math.max(slendernessX, slendernessY)
    const tp = torsionProps(s)
    if (tp) FeTors = torsionalFe(s, tp, Lcx, Lcy, Lcz, E)
  }
  const FeFlex = (Math.PI ** 2 * E) / slenderness ** 2
  const Fe = Math.min(FeFlex, FeTors)
  const mode: CompressionMode = FeTors < FeFlex
    ? (torsionProps(s)?.symmetry === 'both' ? 'torsional' : 'flexural-torsional')
    : 'flexural'
  const Fcr = Fy / Fe <= 2.25 ? 0.658 ** (Fy / Fe) * Fy : 0.877 * Fe   // E3-2 / E3-3
  const elements = braceElements(s, Fy)
  const Ae = braceEffectiveArea(s, Fy, Fcr, elements)
  const Pn = (Fcr * Ae) / 1000
  const clause = [opts.slenderness != null ? 'E5' : mode === 'flexural' ? 'E3' : 'E4', ...(Ae < s.A - 1e-9 ? ['E7'] : [])].join(' + ')
  return {
    applicable: true, slendernessX, slendernessY, slenderness,
    FeFlexural: FeFlex, FeTorsional: FeTors, Fe, mode, Fcr, elements, Ae,
    Pn, phiPn: PHI_C * Pn, slenderOK: slenderness <= 200, clause,
  }
}

// ── §E6 built-up members: back-to-back double angles ─────────────────────
//
// Two angles, long legs back to back across a gap (gusset / filler plate
// thickness), connected by intermediate fillers at spacing a — the 2L the
// catalogue builds (`doubleAngle`): y is the vertical axis of symmetry
// through the gap, x the horizontal axis through the centroid; the
// outstanding (short) legs lie at the bottom.
//
//   §E6.1 buckling about y slides the two angles past each other, so the
//         connectors carry shear and the member is softer than a solid one:
//           a/ri ≤ 40:  (Lc/r)m = (Lc/r)o                         (E6-1)
//           a/ri > 40:  (Lc/r)m = √[(Lc/r)o² + (Ki·a/ri)²],  Ki = 0.50 for
//                       angles back-to-back                       (E6-2)
//         ri = the least r of ONE angle (rz). Buckling about x moves both
//         angles together — no connector shear, plain §E3.
//   §E4   a 2L is singly symmetric (about y): flexural-torsional buckling by
//         E4-3 with Fey from the MODIFIED slenderness (as the AISC Manual's
//         double-angle tables do). Shear centre at the outstanding legs'
//         mid-plane on the symmetry axis, J = 2·Σb·t³/3, Cw ≈ 0 (small for
//         angles; neglecting it is conservative).
//   §E7   slender legs, all four, at the governing Fcr.
//   §E6.2 dimensional: a/ri ≤ ¾ of the governing slenderness of the
//         built-up member — reported as `e6.spacingOK`, and the member does
//         not pass without it. End connections are assumed welded or
//         pretensioned-bolted (also §E6.2), which is what a gusset 2L is.
// ─────────────────────────────────────────────────────────────────────────

export interface DoubleAngleE6 {
  /** Connector spacing, its ratio to the single angle's rz, and Ki. */
  a: number; ri: number; aRi: number; Ki: number
  /** Built-up slenderness about y before and after §E6.1. */
  slendernessYo: number; slendernessYm: number
  /** §E6.2: a/ri ≤ 0.75·(Lc/r) governing. */
  spacingOK: boolean
}

/**
 * Compressive strength of a back-to-back double angle.
 * `angle`: one angle; `gap`: separation between backs, mm; Lcx/Lcy mm (with
 * Cw ≈ 0 the torsional term has no length in it, so there is no Lcz);
 * `a`: intermediate connector spacing, mm (the member length when there are
 * none — then a/ri is large and E6-2 penalises it accordingly).
 */
export function doubleAngleCompression(
  angle: AiscShape, gap: number, Fy: number, Lcx: number, Lcy: number, a: number,
  opts: { E?: number } = {},
): SteelCompression & { e6: DoubleAngleE6 } {
  const E = opts.E ?? E_STEEL
  const t = angle.t!, legV = Math.max(angle.leg1!, angle.leg2!), legH = Math.min(angle.leg1!, angle.leg2!)
  const A = 2 * angle.A
  // built-up radii (as `doubleAngle`): rx unchanged, ry by parallel axis across the gap
  const xbar = angle.xbar ?? 0
  const rx = angle.rx, ry = Math.sqrt(angle.ry ** 2 + (xbar + gap / 2) ** 2)
  const ri = angle.rz ?? Math.min(angle.rx, angle.ry)
  const aRi = a / ri, Ki = 0.5
  const slendernessX = Lcx / rx
  const slendernessYo = Lcy / ry
  const slendernessYm = aRi <= 40 ? slendernessYo : Math.sqrt(slendernessYo ** 2 + (Ki * aRi) ** 2)   // E6-1 / E6-2
  const slenderness = Math.max(slendernessX, slendernessYm)

  // §E4-3 about the symmetry axis y, with Fey from (Lc/r)m
  const Ix = A * rx ** 2, Iy = A * ry ** 2
  const Ah = legH * t, Av = (legV - t) * t
  const ybar = (Ah * t / 2 + Av * (t + (legV - t) / 2)) / (Ah + Av)   // from the outstanding legs' outer face
  const yo = ybar - t / 2                                              // to the shear centre (outstanding-leg mid-plane)
  const J = 2 * ((legV + legH - t) * t ** 3) / 3
  const ro2 = yo ** 2 + (Ix + Iy) / A                                  // E4-11
  const H = 1 - yo ** 2 / ro2                                          // E4-10
  const Fez = (G_STEEL * J) / (A * ro2)                                // E4-9 with Cw ≈ 0
  const Fey = (Math.PI ** 2 * E) / slendernessYm ** 2
  const sum = Fey + Fez
  const FeFT = (sum / (2 * H)) * (1 - Math.sqrt(1 - (4 * Fey * Fez * H) / sum ** 2))   // E4-3
  const Fex = (Math.PI ** 2 * E) / slendernessX ** 2

  const FeFlex = Math.min(Fex, Fey)
  const Fe = Math.min(FeFlex, FeFT)
  const mode: CompressionMode = FeFT < FeFlex ? 'flexural-torsional' : 'flexural'
  const Fcr = Fy / Fe <= 2.25 ? 0.658 ** (Fy / Fe) * Fy : 0.877 * Fe  // E3-2 / E3-3
  const elements = braceElements(angle, Fy)
  const Ae = 2 * braceEffectiveArea(angle, Fy, Fcr, elements)          // §E7, both angles
  const Pn = (Fcr * Ae) / 1000
  const spacingOK = aRi <= 0.75 * slenderness + 1e-9                  // §E6.2
  const clause = ['E6', ...(mode === 'flexural-torsional' ? ['E4'] : []), ...(Ae < A - 1e-9 ? ['E7'] : [])].join(' + ')
  return {
    applicable: true, slendernessX, slendernessY: slendernessYm, slenderness,
    FeFlexural: FeFlex, FeTorsional: FeFT, Fe, mode, Fcr, elements, Ae,
    Pn, phiPn: PHI_C * Pn, slenderOK: slenderness <= 200, clause,
    e6: { a, ri, aRi, Ki, slendernessYo, slendernessYm, spacingOK },
  }
}
