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
// SCOPE (fail closed). φPn above is the WHOLE compression check, so it is
// only valid for a section where flexural buckling of nonslender elements is
// the governing mode. `compressionScope` says which ones are:
//   · single angle  — §E5 effective slenderness (eccentric end connection
//                     through one leg), legs nonslender (Table B4.1a case 3)
//   · W             — doubly symmetric, flanges/web nonslender (cases 1, 5)
//   · HSS / PIPE    — walls nonslender (cases 6, 9)
//   · WT, C, 2L     — singly symmetric: §E4 flexural-torsional buckling (and
//                     §E6 for built-up double angles) can govern and is NOT
//                     implemented ⇒ unsupported in compression
//   · any slender element ⇒ §E7 (Q / effective width) not implemented ⇒
//                     unsupported in compression
// Tension (§D2(a) yielding) is valid for every family; §D2(b) rupture needs
// the end connection, which the truss model does not define — reported by
// `trussNotAssessed`, never silently passed.
// Units: A mm², r mm, E/Fy MPa, L mm, forces kN.
// ─────────────────────────────────────────────────────────────────────────
import type { MemberForce } from './truss'
import type { EffectiveSection } from './aiscSections'

export interface TrussSection {
  A: number          // gross area, mm²
  r: number          // governing radius of gyration, mm
  E: number; Fy: number   // MPa
  K?: number         // effective-length factor (default 1.0)
  /** Single angle loaded through one leg: §E5 effective slenderness replaces
   *  K·L/r (K is not used — E5 carries its own end-condition calibration). */
  e5?: SingleAngleE5
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

/** Is the §E3 flexural-buckling check the whole compression story for this
 *  section? Element limits are λr of AISC 360-16 Table B4.1a (axial). */
export function compressionScope(sec: EffectiveSection, E: number, Fy: number): CompressionScope {
  const s = sec.base, rt = Math.sqrt(E / Fy)
  const slender = (what: string, lam: number, lim: number, kase: number): CompressionScope =>
    ({ supported: false, reason: `${sec.label}: ${what} ${lam.toFixed(1)} > λr ${lim.toFixed(1)} (Table B4.1a case ${kase}) — slender-element compression §E7 is not implemented` })
  if (s.name === 'custom')
    return { supported: false, reason: 'custom section: local (§E7) and torsional (§E4) buckling cannot be checked from A and r alone' }
  if (sec.double)
    return { supported: false, reason: `${sec.label}: built-up double angle — §E4 flexural-torsional buckling and §E6 connector spacing are not implemented` }
  switch (s.family) {
    case 'WT': return { supported: false, reason: `${sec.label}: tee — §E4 flexural-torsional buckling is not implemented` }
    case 'C': return { supported: false, reason: `${sec.label}: channel — §E4 flexural-torsional buckling is not implemented` }
    case 'L': {
      const bl = Math.max(s.leg1!, s.leg2!), bs = Math.min(s.leg1!, s.leg2!), t = s.t!
      const lim = 0.45 * rt
      if (bl / t > lim) return slender('leg b/t', bl / t, lim, 3)
      // §E5 condition (e): unequal legs need bl/bs < 1.7
      if (bl / bs >= 1.7) return { supported: false, reason: `${sec.label}: leg ratio ${(bl / bs).toFixed(2)} ≥ 1.7 — outside §E5, and §E4 is not implemented` }
      // The connected leg is not modelled, so take the conservative side: the
      // smaller geometric r, and the shorter-leg-connected increment.
      const legTerm = bl / bs > 1 + 1e-9 ? 4 * ((bl / bs) ** 2 - 1) : 0
      return { supported: true, e5: { r: Math.min(s.rx, s.ry), legTerm, rz: s.rz ?? Math.min(s.rx, s.ry) } }
    }
    case 'W': {
      const lf = s.bf! / (2 * s.tf!), limF = 0.56 * rt
      if (lf > limF) return slender('flange bf/2tf', lf, limF, 1)
      const lw = (s.d! - 2 * s.tf!) / s.tw!, limW = 1.49 * rt   // h ≈ d − 2tf: fillets ignored, conservative
      if (lw > limW) return slender('web h/tw', lw, limW, 5)
      return { supported: true }
    }
    case 'HSS': {
      const lw = (Math.max(s.b!, s.h!) - 3 * s.t!) / s.t!, lim = 1.40 * rt   // §B4.1b(d): b = B − 3t
      if (lw > lim) return slender('wall b/t', lw, lim, 6)
      return { supported: true }
    }
    case 'PIPE': {
      const lD = s.D! / s.t!, lim = 0.11 * E / Fy
      if (lD > lim) return slender('D/t', lD, lim, 9)
      return { supported: true }
    }
  }
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
