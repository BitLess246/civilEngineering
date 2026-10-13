// ─────────────────────────────────────────────────────────────────────────
// Hollow structural sections in frame members — AISC 360-16 (NSCP 2015 Ch. 5)
//
// Rectangular/square HSS (family 'HSS' with b, h, t) and round HSS / pipe
// (family 'PIPE', or 'HSS' with D, t). `t` is the DESIGN wall thickness
// (§B4.2: 0.93·t_nom for ERW), which is what the catalogue carries.
//
//   flexure   §F7  rect: yielding, flange local buckling, web local buckling,
//                   lateral-torsional buckling (§F7.4, strong axis only)
//             §F8  round: yielding, local buckling (compact / noncompact /
//                   slender, the last up to its D/t < 0.45E/Fy applicability)
//   shear     §G4  rect: Aw = 2ht, kv = 5, Cv2 by §G2.2
//             §G5  round: Fcr from Lv, Vn = Fcr·Ag/2
//
// FAIL CLOSED. A slender rect flange (§F7.2(c), needs the effective section
// modulus Se) and a slender rect web (§F7.3(c)) are not implemented, and
// neither is round D/t ≥ 0.45E/Fy: those return `applicable: false` with the
// clause, never a strength. Compression scope (§E7 slender walls) is
// `compressionScope` in trussDesign — one gate for every axial check.
//
// Section properties: I = A·r² from the catalogue (tabulated, so the corner
// radii are in it); S = I/c; Z of a rect tube from its sharp-cornered
// geometry scaled by I_tab/I_geom — the corners take area off Z in about the
// same proportion as off I, and the scaling lands on the conservative side of
// the tabulated Z (HSS8×8×½: 37.2 against 37.5 in³). Round Z is exact:
// (D³ − (D−2t)³)/6.
//
// Units: dimensions mm, I mm⁴, S/Z mm³, stress MPa, M kN·m, V kN, L mm.
// ─────────────────────────────────────────────────────────────────────────

import { effectiveSection, type AiscShape } from './aiscSections'
import type { PlateClass } from './steelDesign'
import { compressionScope } from './trussDesign'

const E = 200_000
const PHI_B = 0.90
const PHI_V = 0.90

export type HssKind = 'rect' | 'round'

/** Which hollow kind a shape is, or null when it is not a hollow section. */
export function hssKind(s: AiscShape): HssKind | null {
  if ((s.family === 'HSS' || s.family === 'PIPE') && s.D && s.t) return 'round'
  if (s.family === 'HSS' && s.b && s.h && s.t) return 'rect'
  return null
}

export interface HssProps {
  kind: HssKind
  /** Outside depth (h, or D) and width (b, or D), and design wall t, mm. */
  H: number; B: number; t: number
  Ix: number; Iy: number; Sx: number; Sy: number; Zx: number; Zy: number
  /** Torsional constant, mm⁴ — Bredt for a closed tube. */
  J: number
}

export function hssProps(s: AiscShape): HssProps {
  const kind = hssKind(s)
  if (!kind) throw new Error(`${s.name} is not a hollow section`)
  const t = s.t!
  const Ix = s.A * s.rx ** 2, Iy = s.A * s.ry ** 2
  if (kind === 'round') {
    const D = s.D!, Di = D - 2 * t
    const Z = (D ** 3 - Di ** 3) / 6
    const rm = (D - t) / 2
    return { kind, H: D, B: D, t, Ix, Iy, Sx: (2 * Ix) / D, Sy: (2 * Iy) / D, Zx: Z, Zy: Z, J: 2 * Math.PI * rm ** 3 * t }
  }
  const H = s.h!, B = s.b!
  const hi = H - 2 * t, bi = B - 2 * t
  const IxG = (B * H ** 3 - bi * hi ** 3) / 12, IyG = (H * B ** 3 - hi * bi ** 3) / 12
  const ZxG = (B * H ** 2 - bi * hi ** 2) / 4, ZyG = (H * B ** 2 - hi * bi ** 2) / 4
  const Am = (B - t) * (H - t), p = 2 * ((B - t) + (H - t))
  return {
    kind, H, B, t, Ix, Iy,
    Sx: Ix / (H / 2), Sy: Iy / (B / 2),
    Zx: ZxG * (Ix / IxG), Zy: ZyG * (Iy / IyG),
    J: (4 * Am ** 2 * t) / p,
  }
}

/** Can the frame design check this hollow section as a beam AND a column at
 *  Fy — flexure inside §F7/§F8 about both axes and walls nonslender for §E7?
 *  The optimiser steps only onto such shapes and the UI marks the rest. */
export function hssDesignable(s: AiscShape, Fy: number): boolean {
  return hssFlexure(s, Fy, 'x', 1).applicable && hssFlexure(s, Fy, 'y', 1).applicable
    && compressionScope(effectiveSection(s), E, Fy).supported
}

export type HssFlexClause = 'F7' | 'F8' | 'out-of-scope'

export interface HssFlexure {
  applicable: boolean
  /** Why not, with the clause — set when `applicable` is false. */
  reason?: string
  clause: HssFlexClause
  Mp: number; Mn: number; phiMn: number            // kN·m (0 when not applicable)
  /** Element slenderness of the compression flange and of the webs (rect:
   *  (b−3t)/t and (h−3t)/t about the bending axis; round: D/t in both). */
  lambdaF: number; lambdaPF: number; lambdaRF: number; flangeClass: PlateClass
  lambdaW: number; lambdaPW: number; lambdaRW: number; webClass: PlateClass
  MnFLB: number; MnWLB: number; MnLTB: number        // kN·m, Infinity when not a limit state
  Lp: number; Lr: number                             // mm, §F7.4 (Infinity when LTB cannot occur)
  governing: 'yielding' | 'FLB' | 'WLB' | 'LTB' | 'local buckling'
}

const cls = (lam: number, lp: number, lr: number): PlateClass => lam <= lp ? 'compact' : lam <= lr ? 'noncompact' : 'slender'

/**
 * Design flexural strength about the strong ('x', depth H) or weak ('y') axis.
 * Lb (mm) is the unbraced length for §F7.4; Cb as for §F2 (1.0 conservative).
 */
export function hssFlexure(s: AiscShape, Fy: number, axis: 'x' | 'y', Lb: number, Cb = 1.0): HssFlexure {
  const p = hssProps(s)
  const rt = Math.sqrt(E / Fy)
  const S = axis === 'x' ? p.Sx : p.Sy, Z = axis === 'x' ? p.Zx : p.Zy
  const Mp = (Fy * Z) / 1e6
  const out = (o: Partial<HssFlexure> & Pick<HssFlexure, 'lambdaF' | 'lambdaPF' | 'lambdaRF' | 'lambdaW' | 'lambdaPW' | 'lambdaRW' | 'clause'>): HssFlexure => {
    const MnFLB = o.MnFLB ?? Infinity, MnWLB = o.MnWLB ?? Infinity, MnLTB = o.MnLTB ?? Infinity
    const Mn = o.applicable === false ? 0 : Math.min(Mp, MnFLB, MnWLB, MnLTB)
    const governing: HssFlexure['governing'] = Mn >= Mp - 1e-9 ? 'yielding'
      : Mn === MnLTB ? 'LTB' : Mn === MnFLB ? (p.kind === 'round' ? 'local buckling' : 'FLB') : 'WLB'
    return {
      applicable: o.applicable ?? true, reason: o.reason, clause: o.clause,
      Mp, Mn, phiMn: PHI_B * Mn,
      lambdaF: o.lambdaF, lambdaPF: o.lambdaPF, lambdaRF: o.lambdaRF, flangeClass: cls(o.lambdaF, o.lambdaPF, o.lambdaRF),
      lambdaW: o.lambdaW, lambdaPW: o.lambdaPW, lambdaRW: o.lambdaRW, webClass: cls(o.lambdaW, o.lambdaPW, o.lambdaRW),
      MnFLB, MnWLB, MnLTB, Lp: o.Lp ?? Infinity, Lr: o.Lr ?? Infinity, governing,
    }
  }

  if (p.kind === 'round') {
    // §F8 / Table B4.1b case 20: λp = 0.07E/Fy, λr = 0.31E/Fy; §F8 applies to D/t < 0.45E/Fy
    const lam = p.H / p.t, lp = 0.07 * E / Fy, lr = 0.31 * E / Fy
    const base = { lambdaF: lam, lambdaPF: lp, lambdaRF: lr, lambdaW: lam, lambdaPW: lp, lambdaRW: lr, clause: 'F8' as const }
    if (lam >= 0.45 * E / Fy)
      return out({ ...base, clause: 'out-of-scope', applicable: false, reason: `${s.name}: D/t ${lam.toFixed(1)} ≥ 0.45E/Fy = ${(0.45 * E / Fy).toFixed(1)} — outside §F8` })
    let MnLB = Infinity
    if (lam > lp) {
      const Fcr = lam <= lr ? 0.021 * E / lam + Fy   // §F8-2
        : 0.33 * E / lam                              // §F8-3/-4
      MnLB = (Fcr * S) / 1e6
    }
    return out({ ...base, MnFLB: MnLB })
  }

  // rect: the compression flange is the wall PERPENDICULAR to the bending axis
  const flangeW = axis === 'x' ? p.B : p.H, webH = axis === 'x' ? p.H : p.B
  const lamF = (flangeW - 3 * p.t) / p.t, lamW = (webH - 3 * p.t) / p.t   // §B4.1b(d)
  const lpF = 1.12 * rt, lrF = 1.40 * rt     // Table B4.1b case 17
  const lpW = 2.42 * rt, lrW = 5.70 * rt     // Table B4.1b case 19
  const base = { lambdaF: lamF, lambdaPF: lpF, lambdaRF: lrF, lambdaW: lamW, lambdaPW: lpW, lambdaRW: lrW, clause: 'F7' as const }
  if (lamF > lrF)
    return out({ ...base, clause: 'out-of-scope', applicable: false,
      reason: `${s.name}: slender flange b/t ${lamF.toFixed(1)} > λr ${lrF.toFixed(1)} — §F7.2(c) (effective section modulus) is not implemented` })
  if (lamW > lrW)
    return out({ ...base, clause: 'out-of-scope', applicable: false,
      reason: `${s.name}: slender web h/t ${lamW.toFixed(1)} > λr ${lrW.toFixed(1)} — §F7.3(c) is not implemented` })
  const MySF = (Fy * S) / 1e6
  // §F7-2 noncompact flange
  const MnFLB = lamF > lpF ? Math.min(Mp, Mp - (Mp - MySF) * (3.57 * lamF * Math.sqrt(Fy / E) - 4.0)) : Infinity
  // §F7-6 noncompact web
  const MnWLB = lamW > lpW ? Math.min(Mp, Mp - (Mp - MySF) * (0.305 * lamW * Math.sqrt(Fy / E) - 0.738)) : Infinity
  // §F7.4 LTB — strong-axis bending of a rectangular (not square) tube only
  let MnLTB = Infinity, Lp = Infinity, Lr = Infinity
  if (axis === 'x' && p.H > p.B + 1e-9) {
    const ry = s.ry, JA = Math.sqrt(p.J * s.A), MpN = Mp * 1e6
    Lp = (0.13 * E * ry * JA) / MpN                       // §F7-12
    Lr = (2 * E * ry * JA) / (0.7 * Fy * S)               // §F7-13
    if (Lb > Lr) MnLTB = Math.min(Mp, (2 * E * Cb * JA) / (Lb / ry) / 1e6)                       // §F7-11
    else if (Lb > Lp) MnLTB = Math.min(Mp, Cb * (Mp - (Mp - 0.7 * MySF) * ((Lb - Lp) / (Lr - Lp))))  // §F7-10
  }
  return out({ ...base, MnFLB, MnWLB, MnLTB, Lp, Lr })
}

export interface HssShear {
  /** Shear area, mm²: rect 2·h·t with h = H − 3t (§G4); round Ag/2 (§G5). */
  Aw: number
  /** Rect: web-shear coefficient Cv2 (§G2.2); round: Fcr/(0.6Fy). */
  Cv: number
  /** h/t for rect, D/t for round. */
  slenderness: number
  Vn: number; phiVn: number; phiV: number            // kN
}

/**
 * Design shear strength along the depth ('x' bending ⇒ shear on the H walls).
 * Lv (mm) is the distance from max to zero shear, used by §G5 only; the
 * member length is the conservative default (longer Lv ⇒ lower Fcr).
 */
export function hssShear(s: AiscShape, Fy: number, axis: 'x' | 'y', Lv: number): HssShear {
  const p = hssProps(s)
  if (p.kind === 'round') {
    const Dt = p.H / p.t
    const Fcr = Math.min(0.6 * Fy, Math.max(
      (1.60 * E) / (Math.sqrt(Math.max(Lv, 1) / p.H) * Dt ** 1.25),   // §G5-2a
      (0.78 * E) / Dt ** 1.5,                                        // §G5-2b
    ))
    const Vn = (Fcr * s.A / 2) / 1000
    return { Aw: s.A / 2, Cv: Fcr / (0.6 * Fy), slenderness: Dt, Vn, phiVn: PHI_V * Vn, phiV: PHI_V }
  }
  const webH = axis === 'x' ? p.H : p.B
  const h = webH - 3 * p.t, ht = h / p.t, kv = 5
  const l1 = 1.10 * Math.sqrt(kv * E / Fy), l2 = 1.37 * Math.sqrt(kv * E / Fy)
  const Cv = ht <= l1 ? 1.0 : ht <= l2 ? l1 / ht : (1.51 * kv * E) / (ht ** 2 * Fy)   // §G2-9..11
  const Aw = 2 * h * p.t
  const Vn = (0.6 * Fy * Aw * Cv) / 1000
  return { Aw, Cv, slenderness: ht, Vn, phiVn: PHI_V * Vn, phiV: PHI_V }
}
