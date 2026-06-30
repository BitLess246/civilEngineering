// ─────────────────────────────────────────────────────────────────────────
// Rock / ground anchor — tendon & grout-ground bond capacity.
// PTI DC35.1 / FHWA-IF-99-015 (Ground Anchors and Anchored Systems).
//   GUTS  = fpu · Aps                              (guaranteed ultimate strength)
//   Tendon design  Td = 0.60·GUTS                  (max design load, permanent)
//   Proof/test     Tt = min(1.33·T, 0.80·GUTS)     (field acceptance)
//   Ground bond    Qult = π·Dhole·Lbond·τult ,  allow = Qult / FS  (FS ≥ 2 perm.)
// Anchor is adequate when the applied design tension T ≤ the tendon design load
// AND ≤ the allowable ground-bond capacity. Governing = the smaller capacity.
// Units: fpu MPa; Aps mm²; Ø/lengths m; τult kPa; forces kN.
// ─────────────────────────────────────────────────────────────────────────

/** Guaranteed ultimate tensile strength (kN) and the 0.60·GUTS design load. */
export function tendonCapacity(p: { fpu: number; Aps: number; designFactor?: number }): { GUTS: number; Td: number } {
  const GUTS = (p.fpu * p.Aps) / 1000          // kN
  return { GUTS, Td: (p.designFactor ?? 0.60) * GUTS }
}

/** Grout-ground (rock socket) bond: ultimate and allowable capacity (kN). */
export function groundBondCapacity(p: { holeDia: number; bondLength: number; tauUlt: number; FS?: number }): { Qult: number; Qall: number } {
  const Qult = Math.PI * p.holeDia * p.bondLength * p.tauUlt    // kN (m·m·kPa)
  return { Qult, Qall: Qult / (p.FS ?? 2.0) }
}

/** Bond length (m) needed so the allowable ground bond carries the demand T. */
export function requiredBondLength(p: { T: number; holeDia: number; tauUlt: number; FS?: number }): number {
  const denom = Math.PI * p.holeDia * p.tauUlt
  return denom > 0 ? (p.T * (p.FS ?? 2.0)) / denom : Infinity
}

export interface RockAnchorResult {
  GUTS: number; Td: number          // tendon strength & design load, kN
  testLoad: number                  // proof/acceptance load, kN
  Qult: number; Qall: number        // ground bond, kN
  allowable: number                 // governing min(Td, Qall), kN
  governs: 'tendon' | 'bond'
  fs: number                        // governing allowable / demand
  bondLengthReq: number             // m, for the bond FS at demand
  tendonOK: boolean; bondOK: boolean; ok: boolean
}

/** Design a rock anchor: demand T (kN) vs tendon design load and ground bond. */
export function designRockAnchor(p: {
  fpu: number; Aps: number;
  holeDia: number; bondLength: number; tauUlt: number; FS?: number;
  T: number; designFactor?: number;
}): RockAnchorResult {
  const { GUTS, Td } = tendonCapacity({ fpu: p.fpu, Aps: p.Aps, designFactor: p.designFactor })
  const { Qult, Qall } = groundBondCapacity({ holeDia: p.holeDia, bondLength: p.bondLength, tauUlt: p.tauUlt, FS: p.FS })
  const allowable = Math.min(Td, Qall)
  const governs = Td <= Qall ? 'tendon' : 'bond'
  const testLoad = Math.min(1.33 * p.T, 0.80 * GUTS)
  return {
    GUTS, Td, testLoad, Qult, Qall, allowable, governs,
    fs: p.T > 0 ? allowable / p.T : Infinity,
    bondLengthReq: requiredBondLength({ T: p.T, holeDia: p.holeDia, tauUlt: p.tauUlt, FS: p.FS }),
    tendonOK: Td >= p.T, bondOK: Qall >= p.T, ok: allowable >= p.T,
  }
}
