// ─────────────────────────────────────────────────────────────────────────
// BRIDGE RATING — AASHTO MBE (Manual for Bridge Evaluation) design-load
// rating factor on the HL-93 machinery from bridgeLoading.ts.
//
//   RF = (φ·Rn − γDC·DC − γDW·DW) / (γLL·(1+IM)·LL)      [MBE 6A.4.2.1-1]
//
//   Design-load rating (Strength-I, HL-93):
//     γDC = 1.25, γDW = 1.50                      (LRFD Table 3.4.1-2)
//     γLL = 1.75 inventory · 1.35 operating       (MBE Table 6A.4.3.2.1-1)
//     φ = 1.0 flexure · 1.0 shear                 (MBE Table 6A.4.2.3-1, RC)
//     IM = 0.33 default
//
//   RF ≥ 1.0 at inventory → the bridge meets the LRFD design live load.
//   RF ≥ 1.0 at operating → safe for the AASHTO operating level.
//
// The live-load side comes straight from hl93SimpleSpan (lever-rule DF,
// envelope walks) so the rating and the wave-3 design calculator can
// never drift apart. A user-supplied static LL effect (e.g. from an FE
// model) can override the HL-93 walk per effect.
// ─────────────────────────────────────────────────────────────────────────

import { hl93SimpleSpan, type DeckInput, type BridgeResult } from './bridgeLoading'

export const GAMMA_DC = 1.25
export const GAMMA_DW = 1.5
export const GAMMA_LL_INVENTORY = 1.75
export const GAMMA_LL_OPERATING = 1.35
export const PHI_FLEXURE = 1.0
export const PHI_SHEAR = 1.0

export interface RatingInput {
  /** Span length, m. */
  L: number
  /** Deck transverse case for the lever rule (or DF override below). */
  deck: DeckInput
  /** Structural dead load per girder, kN/m. */
  DC: number
  /** Wearing surface + utilities per girder, kN/m. */
  DW: number
  /** Nominal flexural resistance at the critical section, kN·m. */
  Mn: number
  /** Nominal shear resistance, kN. */
  Vn: number
  /** Dynamic load allowance (default 0.33). */
  IM?: number
  phiM?: number
  phiV?: number
  gammaDC?: number
  gammaDW?: number
  /** Distribution-factor override (skips the lever rule when given). */
  DF?: number
  /** Static live-load moment per girder WITHOUT dynamic allowance, kN·m (FE override). */
  LLm?: number
  /** Static live-load shear per girder WITHOUT dynamic allowance, kN (FE override). */
  LLv?: number
}

export interface RatingEffect {
  /** Nominal resistance used. */
  Rn: number
  /** φ·Rn. */
  phiRn: number
  /** Factored permanent-load part of the numerator. */
  permPart: number
  /** Numerator φ·Rn − γDC·DC − γDW·DW (the demand that LL must fit). */
  numerator: number
  /** Static LL effect per girder (no IM), for the worked solution. */
  LLstatic: number
  /** LL effect with (1+IM) — the MBE "LL" times the allowance. */
  LLwithIM: number
  RF_inventory: number
  RF_operating: number
  util_inventory: number
}

export interface RatingResult {
  L: number
  DF: number
  IM: number
  /** The HL-93 result backing the live load (when not overridden). */
  hl: BridgeResult
  Mdc: number
  Mdw: number
  Vdc: number
  Vdw: number
  flexure: RatingEffect
  shear: RatingEffect
  governing: 'flexure' | 'shear'
  /** Worst rating factor across both effects at inventory. */
  RFmin: number
  verdict: string
  notes: string[]
}

function rateEffect(
  Rn: number,
  phi: number,
  perm: number,
  LLstatic: number,
  IM: number,
  gammaLLinv: number,
  gammaLLop: number,
): RatingEffect {
  const phiRn = phi * Rn
  const permPart = perm
  const numerator = phiRn - permPart
  const LLwithIM = (1 + IM) * LLstatic
  const RF_inventory = numerator / (gammaLLinv * LLwithIM)
  const RF_operating = numerator / (gammaLLop * LLwithIM)
  return {
    Rn,
    phiRn,
    permPart,
    numerator,
    LLstatic,
    LLwithIM,
    RF_inventory,
    RF_operating,
    util_inventory: 1 / RF_inventory,
  }
}

/** MBE design-load rating of a simple span on the wave-3 HL-93 engine. */
export function bridgeRating(p: RatingInput): RatingResult {
  if (!(p.L > 0)) throw new Error('Span must be positive.')
  if (!(p.DC >= 0) || !(p.DW >= 0)) throw new Error('Dead loads cannot be negative.')
  if (!(p.Mn > 0) || !(p.Vn > 0)) throw new Error('Nominal resistances must be positive.')

  const im = p.IM ?? 0.33
  const gDC = p.gammaDC ?? GAMMA_DC
  const gDW = p.gammaDW ?? GAMMA_DW

  const hl = hl93SimpleSpan({ L: p.L, deck: p.deck, IM: im })
  const DF = p.DF ?? hl.DF
  // A DF override rescales the lever-rule live load to the chosen factor.
  const dfScale = p.DF != null ? p.DF / hl.DF : 1

  // — per-girder live load (static, no IM) —
  // IM rides on the vehicle part only: strip it there and leave the lane
  // part alone (dividing the combined effect deflates the lane slice).
  const llMStatic = p.LLm ?? (hl.moment.vehPart / (1 + im) + hl.moment.lanePart) * dfScale
  const llVStatic = p.LLv ?? (hl.shear.vehPart / (1 + im) + hl.shear.lanePart) * dfScale

  // — permanent-load effects on one girder —
  const Mdc = p.DC * p.L * p.L / 8
  const Mdw = p.DW * p.L * p.L / 8
  const Vdc = p.DC * p.L / 2
  const Vdw = p.DW * p.L / 2

  const flexure = rateEffect(p.Mn, p.phiM ?? PHI_FLEXURE, gDC * Mdc + gDW * Mdw, llMStatic, im, GAMMA_LL_INVENTORY, GAMMA_LL_OPERATING)
  const shear = rateEffect(p.Vn, p.phiV ?? PHI_SHEAR, gDC * Vdc + gDW * Vdw, llVStatic, im, GAMMA_LL_INVENTORY, GAMMA_LL_OPERATING)

  const governing: 'flexure' | 'shear' = Math.min(flexure.RF_inventory, shear.RF_inventory) === flexure.RF_inventory ? 'flexure' : 'shear'
  const RFmin = Math.min(flexure.RF_inventory, shear.RF_inventory)

  const notes: string[] = []
  if (p.DF != null) notes.push('Distribution factor overridden — the lever rule was skipped.')
  if (p.LLm != null || p.LLv != null) notes.push('Live-load effect(s) supplied by the user (static, per girder) instead of the HL-93 span walk.')
  if (flexure.RF_inventory >= 1 && shear.RF_inventory >= 1) notes.push('Both effects pass at inventory: the girder meets the LRFD Strength-I design live load (HL-93).')
  else if (flexure.RF_operating >= 1 && shear.RF_operating >= 1) notes.push('Fails at inventory but passes at operating — post the operating rating and consider a load permitting study.')
  else notes.push('Fails at both rating levels — the girder needs strengthening or a load restriction.')

  const verdict =
    RFmin >= 1
      ? `Passes at inventory — RF = ${RFmin.toFixed(3)}`
      : flexure.RF_operating >= 1 && shear.RF_operating >= 1
        ? `Operating only — inventory RF = ${RFmin.toFixed(3)}`
        : `Restricted — inventory RF = ${RFmin.toFixed(3)}`

  return {
    L: p.L,
    DF,
    IM: im,
    hl,
    Mdc,
    Mdw,
    Vdc,
    Vdw,
    flexure,
    shear,
    governing,
    RFmin,
    verdict,
    notes,
  }
}
