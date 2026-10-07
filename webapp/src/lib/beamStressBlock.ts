// ─────────────────────────────────────────────────────────────────────────
// The internal couple of a designed beam section — what the stress diagram
// beside the section draws (ACI 318-14 §22.2.2: Whitney's rectangular block,
// 0.85f′c over a = β1·c). Read from `designBeam`'s result; nothing re-solved.
// Units: mm, MPa → kN, kN·m.
// ─────────────────────────────────────────────────────────────────────────
import { beta1 } from '../engine/flexure'
import type { BeamDesignResult } from '../engine/beamDesign'

export interface StressBlock {
  /** Depth of the equivalent block from the compression face, mm. */
  a: number
  /** Neutral-axis depth, mm. */
  c: number
  /** Concrete compression 0.85f′c·a·b, kN, acting at a/2. */
  Cc: number
  /** Compression steel force A′s(f′s − 0.85f′c), kN, at d′ — DRRB only. */
  Cs: number
  /** Tension T, kN, at d — equal to Cc + Cs. */
  T: number
  /** Nominal moment from the couple, kN·m. */
  Mn: number
}

type R = Pick<BeamDesignResult, 'a' | 'cNA' | 'd' | 'dPrime' | 'AsProv' | 'AsPrime' | 'fsPrime' | 'comprEffective' | 'mode' | 'bFlex'>

export function beamStressBlock(r: R, fc: number, fy: number): StressBlock {
  const a = r.a
  const Cc = (0.85 * fc * a * r.bFlex) / 1000
  const drrb = r.mode === 'DRRB' && r.comprEffective && r.AsPrime > 0
  const Cs = drrb ? (r.AsPrime * (Math.min(r.fsPrime, fy) - 0.85 * fc)) / 1000 : 0
  // SRRB: the provided bars at yield ARE the tension, and a was solved from
  // them, so T = As·fy = Cc to rounding. DRRB: T balances both compressions.
  const T = drrb ? Cc + Cs : (r.AsProv * fy) / 1000
  const c = drrb && r.cNA > 0 ? r.cNA : a / beta1(fc)
  const Mn = (Cc * (r.d - a / 2) + Cs * (r.d - r.dPrime)) / 1000
  return { a, c, Cc, Cs, T, Mn }
}
