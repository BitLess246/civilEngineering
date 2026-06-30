// ─────────────────────────────────────────────────────────────────────────
// Soil-nail wall — local design checks (FHWA GEC-7, Soil Nail Walls).
// A soil-nail wall stabilises a cut with grouted steel bars in tension. This
// module covers the per-nail capacity/demand checks (preliminary design):
//   Demand   Tmax = Ka·(γ·z + q)·Sh·Sv          (tributary active load)
//   Tensile  Tn   = Ab·fy ,  φTn = φ·Tn          (bar yield, §FHWA 5.4)
//   Pullout  Qult = π·DDH·Le·qu ,  Qall = Qult/FS (grout-ground bond, §FHWA 5.3)
// where Sh,Sv = horizontal/vertical nail spacing, z = nail depth, DDH = drill-
// hole diameter, Le = bond (resisting) length beyond the slip surface, qu =
// ultimate bond strength. Global (slip-surface) stability is out of scope —
// use the slope-stability tools and a limit-equilibrium search for that.
// Units: lengths m; bar Ø mm; γ kN/m³; q,qu kPa; fy MPa; forces kN.
// ─────────────────────────────────────────────────────────────────────────
import { rankineKa } from './geotech'

/** Nominal bar tensile capacity Tn = Ab·fy (kN) and the allowable Tn/FS. */
export function nailTensileCapacity(p: { barDia: number; fy: number; FS?: number }): { Tn: number; Tall: number } {
  const Ab = (Math.PI / 4) * p.barDia ** 2          // mm²
  const Tn = (p.fy * Ab) / 1000                      // kN
  return { Tn, Tall: Tn / (p.FS ?? 1.8) }
}

/** Grout-ground pullout: ultimate Qult = π·DDH·Le·qu and allowable Qult/FS (kN). */
export function nailPulloutCapacity(p: { drillDia: number; bondLength: number; qu: number; FS?: number }): { Qult: number; Qall: number } {
  const Qult = Math.PI * p.drillDia * p.bondLength * p.qu     // kN
  return { Qult, Qall: Qult / (p.FS ?? 2.0) }
}

/** Bond length Le (m) needed so the allowable pullout carries the nail force T. */
export function requiredBondLength(p: { T: number; drillDia: number; qu: number; FS?: number }): number {
  const denom = Math.PI * p.drillDia * p.qu
  return denom > 0 ? (p.T * (p.FS ?? 2.0)) / denom : Infinity
}

export interface SoilNailResult {
  Ka: number
  /** Tributary nail force demand, kN. */
  Tmax: number
  Tn: number; Tall: number
  Qult: number; Qall: number
  /** Factor of safety in each mode = ultimate capacity / demand. */
  fsTensile: number; fsPullout: number
  /** Bond length required to reach the target pullout FS at this demand, m. */
  bondLengthReq: number
  tensileOK: boolean; pulloutOK: boolean
}

/**
 * Per-nail check at depth z: tributary active demand vs bar-tensile and
 * grout-ground pullout capacities. `bondLength` is the resisting length Le
 * beyond the assumed slip surface.
 */
export function designSoilNail(p: {
  z: number; Sh: number; Sv: number;
  gamma: number; phiDeg: number; surcharge?: number;
  barDia: number; fy: number;
  drillDia: number; bondLength: number; qu: number;
  FSpullout?: number; FStensile?: number;
}): SoilNailResult {
  const Ka = rankineKa(p.phiDeg)
  const q = p.surcharge ?? 0
  const FSp = p.FSpullout ?? 2.0, FSt = p.FStensile ?? 1.8
  const Tmax = Ka * (p.gamma * p.z + q) * p.Sh * p.Sv          // kN
  const { Tn, Tall } = nailTensileCapacity({ barDia: p.barDia, fy: p.fy, FS: FSt })
  const { Qult, Qall } = nailPulloutCapacity({ drillDia: p.drillDia, bondLength: p.bondLength, qu: p.qu, FS: FSp })
  const fsTensile = Tmax > 0 ? Tn / Tmax : Infinity           // ultimate / demand
  const fsPullout = Tmax > 0 ? Qult / Tmax : Infinity
  const bondLengthReq = requiredBondLength({ T: Tmax, drillDia: p.drillDia, qu: p.qu, FS: FSp })
  return {
    Ka, Tmax, Tn, Tall, Qult, Qall, fsTensile, fsPullout, bondLengthReq,
    tensileOK: fsTensile >= FSt, pulloutOK: fsPullout >= FSp,
  }
}
