// ─────────────────────────────────────────────────────────────────────────
// Two-way (punching) shear for slab–column connections.
// ACI 318-14 §22.6.  φ = 0.75 (§21.2.1).
// SI units: lengths mm, stress MPa, forces kN (output).
// ─────────────────────────────────────────────────────────────────────────
//
// Critical perimeter b0 at d/2 from column face (§22.6.4.1):
//   Interior : b0 = 2(c1+d) + 2(c2+d)
//   Edge     : b0 = (c1+d) + 2(c2+d/2)   c1 ∥ free edge, c2 ⊥ free edge
//   Corner   : b0 = (c1+d/2) + (c2+d/2)
// The section runs d/2 past the far column face and stops AT the free edge —
// so an edge halves the d term in that direction, never the column dimension.
//
// Three Vc equations, Table 22.6.5.2 as ACI 318M-14 / NSCP 2015 PRINT them:
//   Vc1 = 0.17 (1 + 2/βc) λ √f'c b0 d          (b)
//   Vc2 = 0.083 (2 + αs d/b0) λ √f'c b0 d      (c)
//   Vc3 = 0.33 λ √f'c b0 d                     (a)
//   Vc  = min(Vc1, Vc2, Vc3)
// ─────────────────────────────────────────────────────────────────────────

import { criticalSection } from './shear'

const PHI = 0.75

/** Column position relative to slab edge. */
export type ColPosition = 'interior' | 'edge' | 'corner'

export interface PunchingInput {
  c1: number          // column dim parallel to free edge (or x for interior), mm
  c2: number          // column dim perpendicular to free edge (or y for interior), mm
  d: number           // effective slab depth, mm
  fc: number          // f'c, MPa
  lambda: number      // lightweight factor (1.0 or 0.75)
  Vu: number          // factored column shear, kN
  position: ColPosition
}

export interface PunchingResult {
  b0: number          // critical perimeter, mm
  betac: number       // long/short column aspect ratio (≥ 1)
  alphaS: number      // αs: 40 interior / 30 edge / 20 corner

  Vc1: number         // Eq. 22.6.5.2a, kN
  Vc2: number         // Eq. 22.6.5.2b, kN
  Vc3: number         // Eq. 22.6.5.2c, kN
  Vc: number          // min of Vc1–Vc3, kN
  phiVc: number       // φ·Vc, kN

  ratio: number       // Vu / φVc (demand/capacity)
  ok: boolean         // φVc ≥ Vu
}

export function designPunchingShear(i: PunchingInput): PunchingResult {
  const { c1, c2, d, fc, lambda, position } = i
  const sqrtFc = Math.sqrt(Math.max(fc, 1))

  // Critical perimeter (§22.6.4.1) — from the shared geometry, so this page
  // and the footing engines cannot disagree about the same clause.
  //
  // The edge and corner forms here were `c/2 + d` where the section gives
  // `c + d/2`: the section extends d/2 PAST the far face and stops AT the free
  // edge, which halves the d term, not the column. b0 came out 19% short at an
  // edge and 30% at a corner — conservative, but not the clause. `criticalSection`
  // truncates in its x, and this module names the ⊥ dimension c2, so the two
  // are passed the other way round.
  const b0 = criticalSection(c2, c1, d, position).bo

  // Column aspect ratio
  const betac = Math.max(c1, c2) / Math.min(c1, c2)

  // αs per column location
  const alphaS = position === 'interior' ? 40 : position === 'edge' ? 30 : 20

  // Vc in N, Table 22.6.5.2 — the same coefficients as `twoWayVc` in
  // shear.ts, which the footing engines use. This module carried its own
  // expansions, (0.17 + 0.33/βc) and (0.083αs·d/b0 + 0.17), and both are a
  // little ABOVE the printed forms: 0.17(1 + 2/β) is 0.17 + 0.34/β, and
  // 0.083(2 + αs·d/b0) starts at 0.166, not 0.17. So the page and a footing
  // could report different capacities for the same column, and the page's
  // was the unconservative one — by up to 2.4% on (c) and 1.0% on (b) at β = 4.
  const base = lambda * sqrtFc * b0 * d
  const Vc1 = 0.17 * (1 + 2 / betac) * base / 1000
  const Vc2 = 0.083 * (2 + alphaS * d / b0) * base / 1000
  const Vc3 = 0.33 * base / 1000

  const Vc    = Math.min(Vc1, Vc2, Vc3)
  const phiVc = PHI * Vc

  const ratio = i.Vu / phiVc
  const ok    = ratio <= 1 + 1e-9

  return { b0, betac, alphaS, Vc1, Vc2, Vc3, Vc, phiVc, ratio, ok }
}
