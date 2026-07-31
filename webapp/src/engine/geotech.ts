// ─────────────────────────────────────────────────────────────────────────
// Geotechnical engineering — lateral earth pressure, bearing capacity and
// slope stability. Classic closed-form soil mechanics, used by retaining-wall,
// foundation and slope checks.
//   Lateral pressure : Rankine active/passive coefficients & thrust.
//   Bearing capacity : Terzaghi/Meyerhof equation with Vesić N-factors.
//   Slope stability  : infinite-slope factor of safety (dry / seepage).
// Angles are passed in DEGREES; γ in kN/m³, lengths m, cohesion kPa,
// pressures kPa, thrust kN per metre run.
// ─────────────────────────────────────────────────────────────────────────

const rad = (deg: number) => (deg * Math.PI) / 180

// ── Rankine lateral earth pressure ──────────────────────────────────────────
/** Active earth-pressure coefficient Ka = tan²(45 − φ/2) (level backfill). */
export function rankineKa(phiDeg: number): number {
  return Math.tan(rad(45 - phiDeg / 2)) ** 2
}
/** Passive earth-pressure coefficient Kp = tan²(45 + φ/2) (level backfill). */
export function rankineKp(phiDeg: number): number {
  return Math.tan(rad(45 + phiDeg / 2)) ** 2
}

export interface EarthThrust {
  K: number
  /** Total horizontal thrust per metre run, kN/m. */
  P: number
  /** Height of the resultant above the base, m. */
  lineOfAction: number
  /** Pressure at the base of the wall, kPa. */
  basePressure: number
}

/**
 * Rankine ACTIVE thrust on a wall of height H retaining cohesionless soil
 * (γ, φ) with an optional uniform surcharge q (kPa). The triangular soil part
 * acts at H/3; the rectangular surcharge part at H/2 — the resultant line of
 * action is the weighted average.
 */
export function activeThrust(p: { gamma: number; H: number; phiDeg: number; surcharge?: number }): EarthThrust {
  const Ka = rankineKa(p.phiDeg)
  const q = p.surcharge ?? 0
  const Psoil = 0.5 * Ka * p.gamma * p.H ** 2          // triangular, acts at H/3
  const Pq = Ka * q * p.H                              // rectangular, acts at H/2
  const P = Psoil + Pq
  const lineOfAction = P > 0 ? (Psoil * (p.H / 3) + Pq * (p.H / 2)) / P : p.H / 3
  return { K: Ka, P, lineOfAction, basePressure: Ka * (p.gamma * p.H + q) }
}

/** Rankine PASSIVE thrust on a wall of height H (cohesionless soil). */
export function passiveThrust(p: { gamma: number; H: number; phiDeg: number }): EarthThrust {
  const Kp = rankineKp(p.phiDeg)
  const P = 0.5 * Kp * p.gamma * p.H ** 2
  return { K: Kp, P, lineOfAction: p.H / 3, basePressure: Kp * p.gamma * p.H }
}

// ── Bearing capacity ────────────────────────────────────────────────────────
export interface BearingFactors { Nc: number; Nq: number; Ngamma: number }

/**
 * Bearing-capacity factors. Nq and Nc follow Prandtl/Reissner (used by Meyerhof,
 * Hansen and Vesić); Nγ is the Vesić form Nγ = 2(Nq + 1)·tanφ.
 *   Nq = e^(π·tanφ)·tan²(45 + φ/2),  Nc = (Nq − 1)·cotφ  (Nc = 5.14 at φ = 0).
 */
export function bearingFactors(phiDeg: number): BearingFactors {
  const phi = rad(phiDeg)
  if (phiDeg <= 0) return { Nc: 5.14, Nq: 1, Ngamma: 0 }
  const Nq = Math.exp(Math.PI * Math.tan(phi)) * Math.tan(rad(45 + phiDeg / 2)) ** 2
  const Nc = (Nq - 1) / Math.tan(phi)
  const Ngamma = 2 * (Nq + 1) * Math.tan(phi)
  return { Nc, Nq, Ngamma }
}

// ── Bearing capacity ────────────────────────────────────────────────────────
// The bearing-capacity equation lives in `bearingGeneral.ts`, which carries
// shape, depth and inclination factors and makes the METHOD an explicit input.
//
// A second, simpler `bearingCapacity()` used to live here. It was removed
// rather than repaired because it was not a simplification of any published
// procedure — it combined a Vesić Nγ, a Meyerhof s_c, NO s_q at all (which
// only Terzaghi's formulation omits) and a De Beer s_γ. Four sources, so the
// number it returned corresponded to no method anyone could check it against.
//
// Repairing it would have meant choosing which of those methods to align to,
// which is exactly the choice `generalBearingCapacity` asks the caller to make
// out loud. `bearingFactors` below is still shared by both.

// ── Infinite-slope stability ────────────────────────────────────────────────
/**
 * Factor of safety of an infinite slope at depth z, inclination β.
 *   dry:      FS = (c + γ·z·cos²β·tanφ) / (γ·z·sinβ·cosβ)
 *   seepage parallel to the slope (water table at surface): the effective
 *   normal uses the buoyant unit weight γ′ = γsat − γw, while the driving
 *   shear still uses γsat:
 *             FS = (c + (γsat − γw)·z·cos²β·tanφ) / (γsat·z·sinβ·cosβ)
 * For a cohesionless dry slope this reduces to FS = tanφ / tanβ.
 */
export function infiniteSlopeFS(p: {
  c: number; phiDeg: number; gamma: number; z: number; betaDeg: number;
  seepage?: boolean; gammaSat?: number; gammaW?: number;
}): number {
  const beta = rad(p.betaDeg), phi = rad(p.phiDeg)
  const cosB = Math.cos(beta), sinB = Math.sin(beta)
  const gSat = p.gammaSat ?? p.gamma
  const gW = p.gammaW ?? 9.81
  const drivingGamma = p.seepage ? gSat : p.gamma
  const normalGamma = p.seepage ? gSat - gW : p.gamma
  const driving = drivingGamma * p.z * sinB * cosB
  if (driving <= 0) return Infinity
  const resisting = p.c + normalGamma * p.z * cosB * cosB * Math.tan(phi)
  return resisting / driving
}
