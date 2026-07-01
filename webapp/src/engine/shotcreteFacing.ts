// ─────────────────────────────────────────────────────────────────────────
// Soil-nail shotcrete facing — flexure & punching (FHWA GEC-7, Soil Nail Walls).
//
// WHY the facing is designed for FLEXURE:
//   The shotcrete facing is not a retaining wall — it is a thin panel that spans
//   BETWEEN the discrete nail heads. Earth pressure pushes on the panel and is
//   reacted only at the nails, so the facing bends like a continuous two-way slab
//   supported on a grid of point supports (spacing S_H × S_V): it hogs (negative
//   moment) over each nail head and sags (positive moment) at midspan. If it
//   can't carry that bending it cracks/yields between nails and the wall loses the
//   ability to transfer soil load into the nails — a facing failure, distinct from
//   nail tensile/pullout failure. Hence FHWA GEC-7 checks the facing flexural
//   nail-head strength R_FF, the punching-shear strength R_FP (the head punching
//   through the panel), and, for permanent facing, headed-stud tension.
//
//   R_FF (per direction) = C_F · (m_neg + m_pos) · 8 · S_perp / S_span
//     from the plastic mechanism of a fixed-ended strip: w_c·S_span² / 8 =
//     m_neg + m_pos, and the nail-head force R = w_c · (S_H·S_V). C_F (Table 6-x)
//     scales for the real, non-uniform (arching) pressure vs. a uniform one.
//   m = A_s·f_y·(d − a/2) per metre width (the panel's flexural resistance).
//   R_FP = 0.33·√f′c · b_o · d  (ACI two-way shear around the bearing plate).
// The facing is adequate when the nail-head force ≤ min(R_FF, R_FP).
// Units: spacings/plate m; h_c/d/cover mm; A_s mm²/m; f MPa; forces kN.
// ─────────────────────────────────────────────────────────────────────────
import { concreteBeamMn } from './scwb'

/** Panel flexural resistance per metre width, m = As·fy·(d − a/2), kN·m/m. */
export function facingMoment(As: number, d: number, fc: number, fy: number): number {
  return concreteBeamMn(1000, d, As, fc, fy)
}

/**
 * Facing flexural nail-head strength in one bending direction (FHWA GEC-7):
 * R_FF = C_F·(m_neg + m_pos)·8·S_perp/S_span. `Sspan` is the nail spacing the
 * reinforcement spans; `Sperp` the tributary spacing perpendicular to it.
 */
export function facingFlexuralStrength(p: { CF: number; mNeg: number; mPos: number; Sspan: number; Sperp: number }): number {
  return (p.CF * (p.mNeg + p.mPos) * 8 * p.Sperp) / p.Sspan
}

/** Facing punching-shear strength around the bearing plate (ACI two-way), kN. */
export function facingPunchingStrength(p: { fc: number; bearingPlate: number; hc: number; cover: number; phi?: number }): number {
  const d = Math.max(p.hc - p.cover, 0.5 * p.hc)          // mm
  const bo = Math.PI * (p.bearingPlate * 1000 + d)        // mm (plate m→mm + d)
  const Vc = 0.33 * Math.sqrt(Math.max(p.fc, 1)) * bo * d // N
  return ((p.phi ?? 0.75) * Vc) / 1000                    // kN
}

export interface FacingResult {
  d: number
  mVert: number; mHoriz: number          // panel moments per width, kN·m/m
  RffVert: number; RffHoriz: number      // flexural strength each direction, kN
  Rff: number; Rfp: number               // governing flexure & punching, kN
  strength: number                       // governing facing nail-head strength, kN
  governs: 'flexure' | 'punching'
  fs: number
  ok: boolean
}

/**
 * Design a soil-nail shotcrete facing panel. Assumes equal reinforcement on both
 * faces (m_neg = m_pos) — typical for a symmetric welded-wire/waler mesh.
 */
export function designFacing(p: {
  SH: number; SV: number;              // nail spacings, m
  hc: number; cover: number;            // facing thickness & cover, mm
  AsVert: number; AsHoriz: number;      // reinforcement each direction, mm²/m
  fc: number; fy: number;
  bearingPlate: number;                 // bearing-plate width, m
  CF?: number;                          // facing pressure factor (Table 6-x, ~2 thin → 1 thick)
  nailHeadForce: number;                // demand, kN
}): FacingResult {
  const d = Math.max(p.hc - p.cover, 0.5 * p.hc)
  const CF = p.CF ?? 2.0
  const mVert = facingMoment(p.AsVert, d, p.fc, p.fy)
  const mHoriz = facingMoment(p.AsHoriz, d, p.fc, p.fy)
  // vertical reinforcement spans S_V (between rows), tributary width S_H
  const RffVert = facingFlexuralStrength({ CF, mNeg: mVert, mPos: mVert, Sspan: p.SV, Sperp: p.SH })
  const RffHoriz = facingFlexuralStrength({ CF, mNeg: mHoriz, mPos: mHoriz, Sspan: p.SH, Sperp: p.SV })
  const Rff = Math.min(RffVert, RffHoriz)
  const Rfp = facingPunchingStrength({ fc: p.fc, bearingPlate: p.bearingPlate, hc: p.hc, cover: p.cover })
  const strength = Math.min(Rff, Rfp)
  return {
    d, mVert, mHoriz, RffVert, RffHoriz, Rff, Rfp, strength,
    governs: Rff <= Rfp ? 'flexure' : 'punching',
    fs: p.nailHeadForce > 0 ? strength / p.nailHeadForce : Infinity,
    ok: strength >= p.nailHeadForce,
  }
}
