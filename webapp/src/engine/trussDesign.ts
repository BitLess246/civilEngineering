// ─────────────────────────────────────────────────────────────────────────
// Steel truss member capacity (AISC 360 / NSCP 2015 Ch. 5, LRFD):
//   · Tension yielding:  φt·Pn = 0.90·Fy·Ag                       (D2)
//   · Compression (flexural buckling, E3):
//       λ = KL/r;  Fe = π²E/λ²;
//       Fcr = (0.658^(Fy/Fe))·Fy   if  KL/r ≤ 4.71·√(E/Fy)        (inelastic)
//             0.877·Fe             otherwise                       (elastic)
//       φc·Pn = 0.90·Fcr·Ag
// A member's utilisation is |N| / φPn for its force sign.
// Units: A mm², r mm, E/Fy MPa, L mm, forces kN.
// ─────────────────────────────────────────────────────────────────────────
import type { MemberForce } from './truss'

export interface TrussSection {
  A: number          // gross area, mm²
  r: number          // governing radius of gyration, mm
  E: number; Fy: number   // MPa
  K?: number         // effective-length factor (default 1.0)
}

export type MemberMode = 'tension' | 'compression' | 'zero'
export interface MemberDesign {
  id: string; N: number; L: number; kind: MemberForce['kind']
  mode: MemberMode
  slenderness: number      // KL/r
  Fcr?: number             // MPa (compression)
  phiPn: number            // kN
  util: number
  ok: boolean
  /** §E2 — KL/r > 200 is discouraged for compression; flagged. */
  slenderOK: boolean
}

const PHI = 0.90

/** Capacity & utilisation of one member under its axial force N (kN, tension +). */
export function designTrussMember(f: MemberForce, sec: TrussSection): MemberDesign {
  const K = sec.K ?? 1.0
  const Lmm = f.L * 1000
  const slenderness = (K * Lmm) / sec.r
  const mode: MemberMode = Math.abs(f.N) < 1e-6 ? 'zero' : f.N > 0 ? 'tension' : 'compression'

  let phiPn: number, Fcr: number | undefined
  if (mode === 'compression') {
    const Fe = (Math.PI ** 2 * sec.E) / (slenderness * slenderness)        // MPa
    const limit = 4.71 * Math.sqrt(sec.E / sec.Fy)
    Fcr = slenderness <= limit ? Math.pow(0.658, sec.Fy / Fe) * sec.Fy : 0.877 * Fe
    phiPn = (PHI * Fcr * sec.A) / 1000                                     // kN
  } else {
    phiPn = (PHI * sec.Fy * sec.A) / 1000                                  // tension yielding (kN)
  }
  const util = mode === 'zero' || phiPn <= 0 ? 0 : Math.abs(f.N) / phiPn
  const slenderOK = mode !== 'compression' || slenderness <= 200
  return { id: f.id, N: f.N, L: f.L, kind: f.kind, mode, slenderness, Fcr, phiPn, util, ok: util <= 1 + 1e-9 && slenderOK, slenderOK }
}

export interface TrussDesignResult { members: MemberDesign[]; maxUtil: number; allOK: boolean }
export function designTruss(forces: MemberForce[], sec: TrussSection): TrussDesignResult {
  const members = forces.map((f) => designTrussMember(f, sec))
  const maxUtil = members.reduce((m, d) => Math.max(m, d.util), 0)
  return { members, maxUtil, allOK: members.every((d) => d.ok) }
}
