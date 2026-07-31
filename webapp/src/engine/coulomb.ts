// ─────────────────────────────────────────────────────────────────────────
// Coulomb earth pressure, and its seismic extension. Layer 8.
//
// Rankine assumes a smooth vertical wall and a planar ground surface, so it
// cannot represent the two things that most change a real retaining wall:
// FRICTION on the back face and an INCLINED back face. Coulomb (1776) carries
// both, plus a sloping backfill:
//
//   Ka = cos²(φ − θ) / { cos²θ cos(δ+θ) [1 + √( sin(δ+φ)sin(φ−β) /
//                                               (cos(δ+θ)cos(θ−β)) )]² }
//
//   θ  back-face inclination from VERTICAL (0 = vertical wall)
//   δ  wall friction angle (commonly ⅔φ for concrete on soil)
//   β  backfill slope from horizontal
//
// At δ = θ = β = 0 this reduces exactly to tan²(45 − φ/2), which is asserted
// rather than assumed — the reduction is the cheapest check that the whole
// expression is transcribed correctly.
//
// THE THRUST IS NOT HORIZONTAL. Coulomb's resultant acts at δ from the normal
// to the back face, so it has a vertical component. Ignoring it and treating
// P as horizontal is a common slip: the vertical component helps overturning
// and sliding, and leaving it out is conservative for those but wrong for
// bearing pressure under the toe.
//
// UNITS: lengths m; unit weight kN/m³; thrust kN per metre run; angles degrees.
// ─────────────────────────────────────────────────────────────────────────

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

export interface WallGeometry {
  /** Soil friction angle φ, degrees. */
  phiDeg: number
  /** Wall friction angle δ, degrees. Zero gives a smooth wall. */
  deltaDeg?: number
  /** Back-face inclination from vertical, degrees. Positive leans back. */
  thetaDeg?: number
  /** Backfill slope from horizontal, degrees. */
  betaDeg?: number
}

/**
 * Coulomb ACTIVE coefficient.
 *
 * Throws when β > φ: a cohesionless slope cannot stand steeper than its own
 * friction angle, and the expression would take the root of a negative number.
 * Returning NaN there would let an impossible wall print a pressure.
 */
export function coulombKa(g: WallGeometry): number {
  const phi = rad(g.phiDeg)
  const delta = rad(g.deltaDeg ?? 0)
  const theta = rad(g.thetaDeg ?? 0)
  const beta = rad(g.betaDeg ?? 0)

  if (g.betaDeg != null && g.betaDeg > g.phiDeg) {
    throw new Error(
      `Backfill slope β = ${g.betaDeg}° exceeds φ = ${g.phiDeg}°. A cohesionless slope cannot stand steeper than its own friction angle, so no active wedge exists.`,
    )
  }
  const denomCos = Math.cos(delta + theta) * Math.cos(theta - beta)
  if (denomCos <= 0) throw new Error('Wall geometry is inadmissible: cos(δ+θ)·cos(θ−β) is not positive.')

  const root = Math.sqrt((Math.sin(delta + phi) * Math.sin(phi - beta)) / denomCos)
  const num = Math.cos(phi - theta) ** 2
  const den = Math.cos(theta) ** 2 * Math.cos(delta + theta) * (1 + root) ** 2
  return num / den
}

/**
 * Coulomb PASSIVE coefficient.
 *
 * KNOWN TO BE UNCONSERVATIVE. The planar failure surface Coulomb assumes is a
 * poor model on the passive side, where the real surface is markedly curved,
 * and the error grows with δ: at φ = 30° and δ = 20° this returns Kp ≈ 6.1
 * against Rankine's 3.0. `coulombPassiveThrust` warns rather than leaving the
 * caller to discover that from a textbook.
 */
export function coulombKp(g: WallGeometry): number {
  const phi = rad(g.phiDeg)
  const delta = rad(g.deltaDeg ?? 0)
  const theta = rad(g.thetaDeg ?? 0)
  const beta = rad(g.betaDeg ?? 0)

  const denomCos = Math.cos(delta - theta) * Math.cos(theta - beta)
  if (denomCos <= 0) throw new Error('Wall geometry is inadmissible: cos(δ−θ)·cos(θ−β) is not positive.')

  const root = Math.sqrt((Math.sin(phi + delta) * Math.sin(phi + beta)) / denomCos)
  if (root >= 1) {
    throw new Error('No passive solution for this geometry: the Coulomb wedge degenerates (1 − √… ≤ 0).')
  }
  const num = Math.cos(phi + theta) ** 2
  const den = Math.cos(theta) ** 2 * Math.cos(delta - theta) * (1 - root) ** 2
  return num / den
}

export interface CoulombThrust {
  K: number
  /** Total thrust along its own line of action, kN/m. */
  P: number
  /** Horizontal and vertical components, kN/m. */
  horizontal: number
  vertical: number
  /** Inclination of the resultant from horizontal, degrees. */
  inclinationDeg: number
  /** Height of the resultant above the base, m. */
  lineOfAction: number
  notes: string[]
}

/** Split a Coulomb resultant into components. It acts at (δ + θ) from horizontal. */
function components(P: number, deltaDeg: number, thetaDeg: number) {
  const a = rad(deltaDeg + thetaDeg)
  return { horizontal: P * Math.cos(a), vertical: P * Math.sin(a), inclinationDeg: deltaDeg + thetaDeg }
}

/**
 * Active thrust on a wall of height H, with an optional uniform surcharge.
 *
 * The soil part is triangular and acts at H/3; the surcharge part is
 * rectangular and acts at H/2. H is measured along the VERTICAL, so an
 * inclined back face retains the same soil height.
 */
export function coulombActiveThrust(p: WallGeometry & {
  gamma: number; H: number; surcharge?: number;
}): CoulombThrust {
  const notes: string[] = []
  if (!(p.H > 0)) throw new Error('Wall height must be greater than zero.')
  const Ka = coulombKa(p)
  const q = p.surcharge ?? 0

  const Psoil = 0.5 * Ka * p.gamma * p.H ** 2
  const Pq = Ka * q * p.H
  const P = Psoil + Pq
  const lineOfAction = P > 0 ? (Psoil * (p.H / 3) + Pq * (p.H / 2)) / P : p.H / 3

  const delta = p.deltaDeg ?? 0
  const theta = p.thetaDeg ?? 0
  if (delta > p.phiDeg) {
    notes.push(`δ = ${delta}° exceeds φ = ${p.phiDeg}°. Wall friction cannot be mobilised beyond the soil's own strength; δ ≈ ⅔φ is the usual assumption.`)
  }
  if (delta > 0) {
    notes.push(
      `The resultant acts at ${(delta + theta).toFixed(1)}° from horizontal, not horizontally. Its vertical component (${components(P, delta, theta).vertical.toFixed(1)} kN/m) resists overturning and sliding but ADDS to the bearing pressure under the toe — include it in all three checks, not just the convenient ones.`,
    )
  }
  notes.push('Cohesionless backfill assumed: Coulomb has no c term. A cohesive backfill needs a different analysis, and drainage matters more than either.')

  return { K: Ka, P, ...components(P, delta, theta), lineOfAction, notes }
}

/** Passive thrust, with the warning the method requires. */
export function coulombPassiveThrust(p: WallGeometry & { gamma: number; H: number }): CoulombThrust {
  if (!(p.H > 0)) throw new Error('Wall height must be greater than zero.')
  const Kp = coulombKp(p)
  const P = 0.5 * Kp * p.gamma * p.H ** 2
  const delta = p.deltaDeg ?? 0
  const theta = p.thetaDeg ?? 0
  const notes: string[] = []

  if (delta > p.phiDeg / 3) {
    notes.push(
      `Coulomb PASSIVE pressure is unconservative at δ = ${delta}°: the planar failure surface it assumes is a poor model on the passive side, and the error grows with δ. Compare against a curved-surface method (Caquot–Kérisel) before relying on this, or take δ ≤ φ/3.`,
    )
  }
  notes.push('Full passive resistance needs wall movement of roughly 2–5% of H — far more than active. Where that movement is unacceptable, only a fraction of Kp is available.')

  return { K: Kp, P, ...components(P, delta, theta), lineOfAction: p.H / 3, notes }
}

// ── Seismic: Mononobe–Okabe ───────────────────────────────────────────────

export interface SeismicThrust extends CoulombThrust {
  /** Seismic inertia angle ψ = arctan[kh/(1−kv)], degrees. */
  psiDeg: number
  /** Static Coulomb thrust for the same wall, kN/m. */
  staticP: number
  /** The seismic INCREMENT, ΔPae = Pae − Pa, kN/m. */
  increment: number
  /** Height of the increment above the base, m — higher than the static part. */
  incrementLineOfAction: number
}

/**
 * Mononobe–Okabe seismic active thrust — Coulomb's wedge with the earthquake
 * applied as a pseudo-static body force, rotating the whole problem by
 * ψ = arctan[kh/(1−kv)].
 *
 *   Kae = cos²(φ − θ − ψ) / { cosψ cos²θ cos(δ+θ+ψ)
 *          [1 + √( sin(φ+δ)sin(φ − β − ψ) / (cos(δ+θ+ψ)cos(β − θ)) )]² }
 *   Pae = ½ γ H² (1 − kv) Kae
 *
 * THE INCREMENT ACTS HIGHER UP. Seed & Whitman place ΔPae at about 0.6H above
 * the base against H/3 for the static part, so the seismic case raises the
 * overturning moment by more than the thrust alone suggests. Both heights are
 * returned rather than one blended value.
 *
 * φ − β − ψ ≥ 0 is a physical requirement, not a numerical one: past it no
 * wedge can be in equilibrium and the wall problem has no M–O solution.
 */
export function mononobeOkabe(p: WallGeometry & {
  gamma: number; H: number;
  /** Horizontal and vertical seismic coefficients, fractions of g. */
  kh: number; kv?: number;
}): SeismicThrust {
  if (!(p.H > 0)) throw new Error('Wall height must be greater than zero.')
  const kv = p.kv ?? 0
  if (kv >= 1) throw new Error('Vertical seismic coefficient must be less than 1.')
  if (p.kh < 0) throw new Error('Horizontal seismic coefficient must not be negative.')

  const psi = Math.atan(p.kh / (1 - kv))
  const psiDeg = deg(psi)
  const phi = rad(p.phiDeg)
  const delta = rad(p.deltaDeg ?? 0)
  const theta = rad(p.thetaDeg ?? 0)
  const beta = rad(p.betaDeg ?? 0)

  if (p.phiDeg - (p.betaDeg ?? 0) - psiDeg < 0) {
    throw new Error(
      `No Mononobe–Okabe solution: φ − β − ψ = ${(p.phiDeg - (p.betaDeg ?? 0) - psiDeg).toFixed(1)}° is negative at k_h = ${p.kh}. The wedge cannot be in equilibrium — the slope is being shaken beyond what its friction can hold, and the wall needs a displacement-based (Newmark sliding-block) check instead.`,
    )
  }

  const denomCos = Math.cos(delta + theta + psi) * Math.cos(beta - theta)
  if (denomCos <= 0) throw new Error('Wall geometry is inadmissible for Mononobe–Okabe.')

  const root = Math.sqrt((Math.sin(phi + delta) * Math.sin(phi - beta - psi)) / denomCos)
  const num = Math.cos(phi - theta - psi) ** 2
  const den = Math.cos(psi) * Math.cos(theta) ** 2 * Math.cos(delta + theta + psi) * (1 + root) ** 2
  const Kae = num / den

  const Pae = 0.5 * p.gamma * p.H ** 2 * (1 - kv) * Kae
  const staticP = 0.5 * coulombKa(p) * p.gamma * p.H ** 2
  const increment = Pae - staticP

  // Weighted centroid of the static part at H/3 and the increment at 0.6H.
  const lineOfAction = Pae > 0
    ? (staticP * (p.H / 3) + increment * 0.6 * p.H) / Pae
    : p.H / 3

  const notes: string[] = [
    `ψ = ${psiDeg.toFixed(1)}°. The seismic increment ΔPae = ${increment.toFixed(1)} kN/m acts at 0.6H (Seed & Whitman), well above the static resultant at H/3, so the overturning moment rises faster than the thrust does.`,
    'Mononobe–Okabe is PSEUDO-STATIC: it replaces the earthquake with a constant body force and predicts no displacement. A wall can satisfy it and still move, and a wall that fails it may only slide a tolerable amount — a Newmark sliding-block check is what answers that.',
  ]
  if (p.kh > 0.3) {
    notes.push(`k_h = ${p.kh} is high for a pseudo-static analysis; the method's usual range is roughly half the site PGA. Check what k_h was intended to represent.`)
  }

  const d = p.deltaDeg ?? 0
  const t = p.thetaDeg ?? 0
  return {
    K: Kae, P: Pae, ...components(Pae, d, t),
    lineOfAction, psiDeg, staticP, increment,
    incrementLineOfAction: 0.6 * p.H,
    notes,
  }
}
