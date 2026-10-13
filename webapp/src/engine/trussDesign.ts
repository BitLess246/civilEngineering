// ─────────────────────────────────────────────────────────────────────────
// Steel truss member capacity (AISC 360 / NSCP 2015 Ch. 5, LRFD):
//   · Tension yielding:  φt·Pn = 0.90·Fy·Ag                       (D2)
//   · Compression (flexural buckling, E3):
//       λ = KL/r;  Fe = π²E/λ²;
//       Fcr = (0.658^(Fy/Fe))·Fy   if  KL/r ≤ 4.71·√(E/Fy)        (inelastic)
//             0.877·Fe             otherwise                       (elastic)
//       φc·Pn = 0.90·Fcr·Ag
// A member's utilisation is |N| / φPn for its force sign.
//
// A catalogue section in compression goes through `steelCompression`
// (§E3 + §E4 torsional / flexural-torsional + §E7 effective area); the bare
// A, r form above is only for a custom (A, r) section the user typed.
//
// SCOPE (fail closed). `compressionScope` says what that covers:
//   · W, C, WT, HSS, pipe — supported, slender elements by §E7
//   · single angle  — §E5 effective slenderness (eccentric end connection
//                     through one leg), slender legs by §E7; legs past
//                     0.71√(E/Fy) need the single-angle §E4 (E4-4) ⇒ refused,
//                     as is a leg ratio ≥ 1.7 (outside §E5)
//   · double angle  — §E6 built-up members (connector spacing) ⇒ refused
//   · custom (A, r) — nothing to check local or torsional buckling with ⇒ refused
// Tension (§D2(a) yielding) is valid for every family; §D2(b) rupture needs
// the end connection, which the truss model does not define — reported by
// `trussNotAssessed`, never silently passed.
// Units: A mm², r mm, E/Fy MPa, L mm, forces kN.
// ─────────────────────────────────────────────────────────────────────────
import type { MemberForce } from './truss'
import type { EffectiveSection, AiscShape } from './aiscSections'
import { steelCompression, doubleAngleCompression, type DoubleAngleE6 } from './steelCompression'

export interface TrussSection {
  A: number          // gross area, mm²
  r: number          // governing radius of gyration, mm
  E: number; Fy: number   // MPa
  K?: number         // effective-length factor (default 1.0)
  /** Single angle loaded through one leg: §E5 effective slenderness replaces
   *  K·L/r (K is not used — E5 carries its own end-condition calibration). */
  e5?: SingleAngleE5
  /** The catalogue shape, when there is one: compression then runs the full
   *  Chapter E check (§E4, §E7) instead of A·Fcr at Lc/r. */
  shape?: AiscShape
  /** Back-to-back double angle of `shape`: the gap between the backs (mm)
   *  and how many intermediate connectors (fillers) each member gets — the
   *  connector spacing is then L/(n + 1) (§E6). */
  doubleAngle?: { gap: number; connectors: number }
}

/** §E5(a) inputs: r about the geometric axis parallel to the connected leg,
 *  the unequal-leg increment 4[(bl/bs)² − 1], and rz for the 0.95·L/rz floor. */
export interface SingleAngleE5 { r: number; legTerm: number; rz: number }

/** §E5(a), planar-truss members: Lc/r from L/rx (Eq. E5-1 / E5-2), plus the
 *  unequal-leg term with its floor of 0.95·L/rz. L in mm. */
export function e5Slenderness(Lmm: number, e5: SingleAngleE5): number {
  const lr = Lmm / e5.r
  const base = lr <= 80 ? 72 + 0.75 * lr : 32 + 1.25 * lr
  return e5.legTerm > 0 ? Math.max(base + e5.legTerm, 0.95 * Lmm / e5.rz) : base
}

export interface CompressionScope {
  supported: boolean
  /** Why the section is outside the compression check — clause included. */
  reason?: string
  /** Set for single angles: feed into TrussSection.e5. */
  e5?: SingleAngleE5
}

/** Does the Chapter E compression check (`steelCompression`) cover this
 *  section? See the header for what it refuses and why. */
export function compressionScope(sec: EffectiveSection, E: number, Fy: number): CompressionScope {
  const s = sec.base, rt = Math.sqrt(E / Fy)
  if (s.name === 'custom')
    return { supported: false, reason: 'custom section: local (§E7) and torsional (§E4) buckling cannot be checked from A and r alone' }
  // a back-to-back double angle: §E6 (modified slenderness, connector
  // spacing), §E4 on the axis of symmetry and §E7 — `doubleAngleCompression`
  if (sec.double) return { supported: true }
  if (s.family === 'L') {
    const bl = Math.max(s.leg1!, s.leg2!), bs = Math.min(s.leg1!, s.leg2!), t = s.t!
    if (bl / t > 0.71 * rt)
      return { supported: false, reason: `${sec.label}: leg b/t ${(bl / t).toFixed(1)} > 0.71√(E/Fy) = ${(0.71 * rt).toFixed(1)} — single-angle flexural-torsional buckling (§E4, Eq. E4-4) is not implemented` }
    // §E5 condition (e): unequal legs need bl/bs < 1.7
    if (bl / bs >= 1.7) return { supported: false, reason: `${sec.label}: leg ratio ${(bl / bs).toFixed(2)} ≥ 1.7 — outside §E5, and Eq. E4-4 is not implemented` }
    // The connected leg is not modelled, so take the conservative side: the
    // smaller geometric r, and the shorter-leg-connected increment.
    const legTerm = bl / bs > 1 + 1e-9 ? 4 * ((bl / bs) ** 2 - 1) : 0
    return { supported: true, e5: { r: Math.min(s.rx, s.ry), legTerm, rz: s.rz ?? Math.min(s.rx, s.ry) } }
  }
  if (s.family === 'W' || s.family === 'C' || s.family === 'WT' || s.family === 'HSS' || s.family === 'PIPE')
    return { supported: true }
  return { supported: false, reason: `${sec.label}: no compression check for this family` }
}

/** Checks the truss workflow does not run, stated so a PASS is read for what
 *  it covers. */
export function trussNotAssessed(forces: readonly MemberForce[]): string[] {
  const out: string[] = []
  if (forces.some((f) => f.N > 1e-6))
    out.push('§D2(b) tensile rupture on the net/effective section — needs the end connection (holes, shear lag U), which the truss model does not define')
  out.push('Chapter J connections — gussets, welds and bolts are not designed here')
  return out
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
  /** §E6 values for a double angle in compression: connector spacing,
   *  a/ri, the modified slenderness and the §E6.2 spacing check. */
  e6?: DoubleAngleE6
}

const PHI = 0.90

/** Capacity & utilisation of one member under its axial force N (kN, tension +). */
export function designTrussMember(f: MemberForce, sec: TrussSection): MemberDesign {
  const K = sec.K ?? 1.0
  const Lmm = f.L * 1000
  const mode: MemberMode = Math.abs(f.N) < 1e-6 ? 'zero' : f.N > 0 ? 'tension' : 'compression'
  // §E5 replaces K·L/r for a single angle in compression; tension keeps L/r
  // (§D1 reads plain L/r of the member).
  const slenderness = sec.e5 && mode !== 'tension' ? e5Slenderness(Lmm, sec.e5) : (K * Lmm) / sec.r

  let phiPn: number, Fcr: number | undefined
  if (mode !== 'tension' && sec.shape && sec.doubleAngle) {
    // §E6 built-up: modified slenderness about the axis of symmetry, §E4 on
    // it, §E7 on all four legs; the member does not pass without §E6.2.
    const a = Lmm / (sec.doubleAngle.connectors + 1)
    const c = doubleAngleCompression(sec.shape, sec.doubleAngle.gap, sec.Fy, K * Lmm, K * Lmm, a, { E: sec.E })
    if (mode === 'compression') { Fcr = c.Fcr; phiPn = c.phiPn }
    else phiPn = (PHI * sec.Fy * sec.A) / 1000
    const util = mode === 'zero' || phiPn <= 0 ? 0 : Math.abs(f.N) / phiPn
    const slenderOK = mode !== 'compression' || c.slenderness <= 200
    return { id: f.id, N: f.N, L: f.L, kind: f.kind, mode, slenderness: c.slenderness, Fcr, phiPn, util,
      ok: util <= 1 + 1e-9 && slenderOK && (mode !== 'compression' || c.e6.spacingOK), slenderOK, e6: c.e6 }
  }
  if (mode !== 'tension' && sec.shape) {
    // Chapter E in full; §E5 (when given) replaces the flexural Lc/r and §E4.
    const c = steelCompression(sec.shape, sec.Fy, K * Lmm, K * Lmm, Lmm,
      { E: sec.E, ...(sec.e5 ? { slenderness } : {}) })
    if (mode === 'compression') { Fcr = c.Fcr; phiPn = c.phiPn }
    else phiPn = (PHI * sec.Fy * sec.A) / 1000
    const util = mode === 'zero' || phiPn <= 0 ? 0 : Math.abs(f.N) / phiPn
    const slend = sec.e5 ? slenderness : c.slenderness
    const slenderOK = mode !== 'compression' || slend <= 200
    return { id: f.id, N: f.N, L: f.L, kind: f.kind, mode, slenderness: slend, Fcr, phiPn, util, ok: util <= 1 + 1e-9 && slenderOK && c.applicable, slenderOK }
  }
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
