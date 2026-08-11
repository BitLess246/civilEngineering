// ─────────────────────────────────────────────────────────────────────────
// LRFD vs ASD — AISC 360-16 §B3.1 / §B3.2. Layer 6/7 support.
//
// AISC is a DUAL-FORMAT specification. Every limit state gives one nominal
// strength Rn, and then two ways to use it:
//
//   LRFD   design strength    = φRn      vs required strength from 1.2D + 1.6L
//   ASD    allowable strength = Rn / Ω   vs required strength from D + L
//
// Both are called the AVAILABLE STRENGTH. They are not two accuracies of the
// same answer — they are two bookkeeping systems, and mixing them is a real
// error: an ASD allowable strength compared against a factored load is
// conservative by roughly 1.5, and the reverse is unconservative by the same.
// That is why the basis travels with the LOAD COMBINATION here and not just
// with the resistance factor.
//
// WHY THIS IS A SEPARATE MODULE. The φ values were scattered as `PHI_B`,
// `PHI_C`, `PHI_J` constants inside `steelDesign.ts`, each used at the point a
// capacity was returned. Adding Ω beside each one would have put the choice in
// a dozen places. Here the pair lives once per limit state, and the engine
// functions keep returning NOMINAL strengths for this module to convert.
//
// Ω = 1.5/φ for every pair below, which is not a coincidence — it is how the
// specification calibrates the two formats against each other — but the values
// are written out rather than derived, because the specification tabulates them
// and a reader checking against the book should find the book's numbers.
// ─────────────────────────────────────────────────────────────────────────

export type DesignBasis = 'LRFD' | 'ASD'

/**
 * The limit states these pages check. Split by RESISTANCE FACTOR, not by
 * chapter: §G2.1 rolled webs and slender webs carry different φ, so they are
 * different entries even though both are "shear".
 */
export type LimitState =
  | 'flexure'        // §F1
  | 'shearRolled'    // §G2.1(a) — h/tw ≤ 2.24√(E/Fy)
  | 'shearSlender'   // §G2.1(b)
  | 'compression'    // §E1
  | 'connection'     // §J — bolts, welds, block shear
  | 'plateFlexure'   // §F1 applied to a fitting flange (prying)

export const SAFETY: Record<LimitState, { phi: number; omega: number }> = {
  flexure:      { phi: 0.90, omega: 1.67 },
  shearRolled:  { phi: 1.00, omega: 1.50 },
  shearSlender: { phi: 0.90, omega: 1.67 },
  compression:  { phi: 0.90, omega: 1.67 },
  connection:   { phi: 0.75, omega: 2.00 },
  plateFlexure: { phi: 0.90, omega: 1.67 },
}

/** The multiplier that turns a nominal strength into an available one. */
export function basisFactor(basis: DesignBasis, ls: LimitState): number {
  const { phi, omega } = SAFETY[ls]
  return basis === 'LRFD' ? phi : 1 / omega
}

/** Available strength: φRn under LRFD, Rn/Ω under ASD. */
export function available(Rn: number, basis: DesignBasis, ls: LimitState): number {
  return Rn * basisFactor(basis, ls)
}

/**
 * Required strength from service dead and live load.
 *
 * LRFD takes the governing factored combination (NSCP 203.3.1 / ASCE 7 2.3);
 * ASD sums them unfactored (NSCP 203.4.1 / ASCE 7 2.4). Both omit the other
 * combinations — wind, seismic, roof live — because these pages take one dead
 * and one live load and nothing else; a combination involving W or E has to
 * come from the model, not from two numbers.
 */
export function requiredFromDL(basis: DesignBasis, D: number, L: number): number {
  return basis === 'LRFD' ? Math.max(1.4 * D, 1.2 * D + 1.6 * L) : D + L
}

/** How the governing combination reads, for the worked solution. */
export function comboLabel(basis: DesignBasis): string {
  return basis === 'LRFD' ? 'max(1.4D, 1.2D + 1.6L)' : 'D + L'
}

/**
 * `φRn` or `Rn/Ω`, for a results-table row label. `sub` is an axis suffix that
 * belongs on the STRENGTH, not on the omega — "Mnx/Ω", never "Mn/Ωx".
 */
export function capacityLabel(basis: DesignBasis, symbol: string, sub = ''): string {
  return basis === 'LRFD' ? `φ${symbol}n${sub}` : `${symbol}n${sub}/Ω`
}

/** `φ = 0.90` or `Ω = 1.67`, for the sub-label under a capacity. */
export function factorLabel(basis: DesignBasis, ls: LimitState): string {
  const { phi, omega } = SAFETY[ls]
  return basis === 'LRFD' ? `φ = ${phi.toFixed(2)}` : `Ω = ${omega.toFixed(2)}`
}

/** Demand symbol: Vu/Mu/Pu are factored, Va/Ma/Pa are service. */
export function demandLabel(basis: DesignBasis, symbol: string): string {
  return `${symbol}${basis === 'LRFD' ? 'u' : 'a'}`
}
