// ─────────────────────────────────────────────────────────────────────────
// A STEEL BRACE — the member, AISC 360-16 Chapters D and E.
//
//   tension      §D2(a) yielding 0.90·Fy·Ag; §D2(b) rupture 0.75·Fu·Ae with
//                Ae = U·An from the END DETAIL the gusset design chose (a
//                slotted HSS loses the slot, Table D3.1 cases 5/6 give U from
//                the weld length) — passed in, so member and connection agree
//   compression  §E3 flexural buckling at K·L/r (a pin-ended brace, K = 1,
//                about the least r — rz for a single angle, conservatively
//                in place of §E5), with §E7 effective area where an element
//                is slender (Table B4.1a; effective width, Table E7.1, or the
//                round-HSS form E7-7)
//   slenderness  K·L/r ≤ 200 in compression (§E2 user note), L/r ≤ 300 in
//                tension (§D1 user note)
//
// Pure, no model types. Units: mm, MPa, kN; L in m.
// ─────────────────────────────────────────────────────────────────────────
import type { AiscShape } from './aiscSections'
import { E_STEEL } from './steelDesign'

const PHI_T_Y = 0.9, PHI_T_R = 0.75, PHI_C = 0.9

export interface BraceElement {
  /** Which element, its width-to-thickness ratio, the Table B4.1a limit, and
   *  whether it is slender in compression. */
  label: string; lambda: number; lambdaR: number; slender: boolean
}

export interface BraceCompression {
  KLr: number; Fe: number; Fcr: number
  elements: BraceElement[]
  /** Effective area after §E7, mm² (Ag when nothing is slender). */
  Ae: number
  phiPn: number
}

export interface BraceTension {
  phiPnYield: number
  /** Net and effective net area at the end detail, mm², and its U. */
  An: number; U: number; Ae: number
  phiPnRupture: number
  phiPn: number
}

export interface BraceMemberDesign {
  shape: string; family: AiscShape['family']
  L: number; K: number; rmin: number
  Pu: number; Tu: number
  compression: BraceCompression
  tension: BraceTension
  KLr: number; Lr: number
  slendernessOk: boolean
  util: number
  governs: 'compression' | 'tension yielding' | 'tension rupture' | 'slenderness'
  ok: boolean
}

/** The least radius of gyration the brace buckles about, mm. */
export const braceRmin = (s: AiscShape): number =>
  s.family === 'L' ? Math.min(s.rz ?? s.rx, s.rx, s.ry) : Math.min(s.rx, s.ry)

/** Table B4.1a element slenderness, in compression, for the brace families. */
export function braceElements(s: AiscShape, Fy: number): BraceElement[] {
  const r = Math.sqrt(E_STEEL / Fy)
  const el = (label: string, lambda: number, lambdaR: number): BraceElement => ({ label, lambda, lambdaR, slender: lambda > lambdaR })
  if (s.family === 'HSS' && s.D == null && s.b && s.h && s.t) {
    // walls of rectangular HSS: flat width b − 3t (§B4.1b(d)), case 6: 1.40√(E/Fy)
    return [el('wall b', (s.b - 3 * s.t) / s.t, 1.4 * r), el('wall h', (s.h - 3 * s.t) / s.t, 1.4 * r)]
  }
  if ((s.family === 'HSS' || s.family === 'PIPE') && s.D && s.t) return [el('D/t', s.D / s.t, (0.11 * E_STEEL) / Fy)]
  if (s.family === 'L' && s.leg1 && s.t) return [el('leg b/t', Math.max(s.leg1, s.leg2 ?? 0) / s.t, 0.45 * r)]
  if ((s.family === 'W' || s.family === 'WT' || s.family === 'C') && s.d && s.bf && s.tf && s.tw) {
    return [
      el('flange b/t', s.family === 'C' ? s.bf / s.tf : s.bf / (2 * s.tf), 0.56 * r),
      el(s.family === 'WT' ? 'stem d/tw' : 'web h/tw', s.family === 'WT' ? s.d / s.tw : (s.d - 2 * s.tf) / s.tw, s.family === 'WT' ? 0.75 * r : 1.49 * r),
    ]
  }
  return []
}

/** §E7 effective area at the buckling stress Fcr. Flat elements by the
 *  effective-width method (Eq. E7-2/E7-3, Table E7.1 c1/c2); round HSS by E7-7. */
export function braceEffectiveArea(s: AiscShape, Fy: number, Fcr: number, elements: BraceElement[]): number {
  if (!elements.some((e) => e.slender)) return s.A
  if ((s.family === 'HSS' || s.family === 'PIPE') && s.D && s.t) {
    const Dt = s.D / s.t
    return Dt <= (0.11 * E_STEEL) / Fy ? s.A : Math.min(s.A, ((0.038 * E_STEEL) / (Fy * Dt) + 2 / 3) * s.A)
  }
  // how many of each element the section has, and its thickness
  const countOf = (e: BraceElement): [number, number] => {
    if (s.family === 'HSS') return [2, s.t!]                                // two walls of each width
    if (s.family === 'L') return [s.leg2 != null && Math.abs(s.leg2 - (s.leg1 ?? 0)) < 1e-9 ? 2 : 1, s.t!]
    if (e.label.startsWith('flange')) return [s.family === 'W' ? 4 : 2, s.tf!] // half-flange outstands
    return [1, s.tw!]
  }
  let lost = 0
  for (const e of elements) {
    if (!e.slender || e.lambda <= e.lambdaR * Math.sqrt(Fy / Fcr)) continue
    const [c1, c2] = s.family === 'HSS' ? [0.2, 1.38] : e.label.startsWith('web') ? [0.18, 1.31] : [0.22, 1.49]
    const Fel = (c2 * e.lambdaR / e.lambda) ** 2 * Fy
    const k = Math.sqrt(Fel / Fcr)
    const beOverB = (1 - c1 * k) * k                       // Eq. E7-3
    const [n, t] = countOf(e)
    lost += n * (1 - beOverB) * e.lambda * t * t            // b = λ·t
  }
  return Math.max(0.2 * s.A, s.A - lost)
}

/** Design one brace for its envelope axial forces: `Pu` compression and
 *  `Tu` tension, kN (both ≥ 0). `end`: the net area and shear-lag factor the
 *  end detail gives (`braceConnection`). */
export function designBraceMember(
  s: AiscShape, L: number, Pu: number, Tu: number, Fy: number, Fu: number,
  end: { An: number; U: number }, K = 1,
): BraceMemberDesign {
  const rmin = braceRmin(s)
  const KLr = (K * L * 1000) / rmin
  const Fe = (Math.PI ** 2 * E_STEEL) / KLr ** 2
  const Fcr = KLr <= 4.71 * Math.sqrt(E_STEEL / Fy) ? 0.658 ** (Fy / Fe) * Fy : 0.877 * Fe
  const elements = braceElements(s, Fy)
  const Ae = braceEffectiveArea(s, Fy, Fcr, elements)
  const compression: BraceCompression = { KLr, Fe, Fcr, elements, Ae, phiPn: (PHI_C * Fcr * Ae) / 1000 }

  const phiPnYield = (PHI_T_Y * Fy * s.A) / 1000
  const AeT = end.U * end.An
  const phiPnRupture = (PHI_T_R * Fu * AeT) / 1000
  const tension: BraceTension = { phiPnYield, An: end.An, U: end.U, Ae: AeT, phiPnRupture, phiPn: Math.min(phiPnYield, phiPnRupture) }

  const Lr = (L * 1000) / rmin
  const slendernessOk = (Pu <= 0 || KLr <= 200) && Lr <= 300
  const ratios: [number, BraceMemberDesign['governs']][] = [
    [Pu / compression.phiPn, 'compression'], [Tu / phiPnYield, 'tension yielding'], [Tu / phiPnRupture, 'tension rupture'],
  ]
  const [util, gov] = ratios.reduce((a, b) => (b[0] > a[0] ? b : a))
  return {
    shape: s.name, family: s.family, L, K, rmin, Pu, Tu, compression, tension, KLr, Lr, slendernessOk,
    util, governs: slendernessOk ? gov : 'slenderness', ok: util <= 1 + 1e-9 && slendernessOk,
  }
}
