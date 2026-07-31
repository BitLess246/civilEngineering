// ─────────────────────────────────────────────────────────────────────────
// General bearing-capacity equation, with the method chosen explicitly. L8.
//
//   q_u = c·Nc·sc·dc·ic + q·Nq·sq·dq·iq + ½·γ′·B′·Nγ·sγ·dγ·iγ
//
// Reference: Das, "Principles of Foundation Engineering" §3–4, collecting
// Meyerhof (1963), Hansen (1970) and Vesić (1973).
//
// WHY THE METHOD IS AN INPUT. The three differ only in Nγ and in their shape
// and depth factors, and they disagree by 20–30% on a typical granular footing.
// That spread is a real property of the state of the art, not a defect to be
// averaged away, so the caller picks and the result records WHICH — a bearing
// pressure quoted without its method is not reproducible.
//
// Nq and Nc are Prandtl/Reissner in all three:
//   Nq = e^(π tanφ) tan²(45 + φ/2),  Nc = (Nq − 1)cotφ,  Nc = 5.14 at φ = 0.
//
// WHAT THIS IS NOT: a settlement check. On sand, allowable pressure is usually
// governed by settlement rather than by bearing failure, and dividing q_u by 3
// says nothing about how far the footing moves.
//
// UNITS: lengths m; unit weights kN/m³; stresses/pressures kPa; angles degrees.
// ─────────────────────────────────────────────────────────────────────────

import { bearingFactors, type BearingFactors } from './geotech'

const rad = (d: number) => (d * Math.PI) / 180

export type BearingMethod = 'meyerhof' | 'hansen' | 'vesic'

export const BEARING_METHOD_LABEL: Record<BearingMethod, string> = {
  meyerhof: 'Meyerhof (1963)',
  hansen: 'Hansen (1970)',
  vesic: 'Vesić (1973)',
}

/**
 * Nγ, the only N-factor the three methods disagree on.
 *
 *   Meyerhof  Nγ = (Nq − 1) tan(1.4φ)
 *   Hansen    Nγ = 1.5 (Nq − 1) tanφ
 *   Vesić     Nγ = 2 (Nq + 1) tanφ        ← the largest of the three
 */
export function nGamma(phiDeg: number, method: BearingMethod): number {
  if (phiDeg <= 0) return 0
  const phi = rad(phiDeg)
  const { Nq } = bearingFactors(phiDeg)
  switch (method) {
    case 'meyerhof': return (Nq - 1) * Math.tan(1.4 * phi)
    case 'hansen': return 1.5 * (Nq - 1) * Math.tan(phi)
    case 'vesic': return 2 * (Nq + 1) * Math.tan(phi)
  }
}

export interface BearingFactorSet {
  /** Shape. */
  sc: number; sq: number; sgamma: number
  /** Depth. */
  dc: number; dq: number; dgamma: number
  /** Load inclination. */
  ic: number; iq: number; igamma: number
}

/**
 * Shape factors.
 *
 *   Meyerhof:   sc = 1 + 0.2 Kp (B/L),  sq = sγ = 1 + 0.1 Kp (B/L)  [φ ≥ 10°]
 *   Hansen/Vesić (De Beer):
 *               sc = 1 + (B/L)(Nq/Nc),  sq = 1 + (B/L) tanφ,  sγ = 1 − 0.4(B/L)
 *
 * Meyerhof's sq and sγ collapse to 1.0 below φ = 10°, which is his own stated
 * limit and not a smoothing convenience.
 */
export function shapeFactors(
  phiDeg: number, B: number, L: number, method: BearingMethod, f: BearingFactors,
): { sc: number; sq: number; sgamma: number } {
  // The short/long ratio, whichever order the caller passed. Clamping B/L at
  // 1 instead would silently turn a 4×2 footing into a square and OVERSTATE
  // sc and sq.
  const bl = Math.min(B, L) / Math.max(B, L)
  if (method === 'meyerhof') {
    const Kp = Math.tan(rad(45 + phiDeg / 2)) ** 2
    const sc = 1 + 0.2 * Kp * bl
    const s = phiDeg >= 10 ? 1 + 0.1 * Kp * bl : 1
    return { sc, sq: s, sgamma: s }
  }
  return {
    sc: 1 + bl * (f.Nq / f.Nc),
    sq: 1 + bl * Math.tan(rad(phiDeg)),
    sgamma: Math.max(0.6, 1 - 0.4 * bl),
  }
}

/**
 * Depth factors. Both families switch form at Df/B = 1: past it the factor
 * grows with arctan(Df/B) in RADIANS rather than with the ratio itself, which
 * keeps a deep footing from being credited without limit.
 *
 * THE TWO BRANCHES DO NOT MEET. At Df/B = 1 the ratio gives 1.0 and arctan(1)
 * gives 0.785, so the published factors step down by about 6% crossing the
 * boundary. That discontinuity is in the source (Hansen; Das Table 3.4) and is
 * reproduced rather than smoothed — a factor invented to bridge the gap would
 * be neither method.
 */
export function depthFactors(
  phiDeg: number, B: number, Df: number, method: BearingMethod,
): { dc: number; dq: number; dgamma: number } {
  if (!(B > 0)) throw new Error('Footing width must be greater than zero.')
  const ratio = Df / B
  const k = ratio <= 1 ? ratio : Math.atan(ratio)   // radians past Df/B = 1

  if (method === 'meyerhof') {
    const sqrtKp = Math.tan(rad(45 + phiDeg / 2))
    const dc = 1 + 0.2 * sqrtKp * k
    const d = phiDeg >= 10 ? 1 + 0.1 * sqrtKp * k : 1
    return { dc, dq: d, dgamma: d }
  }
  const phi = rad(phiDeg)
  const dq = phiDeg <= 0 ? 1 : 1 + 2 * Math.tan(phi) * (1 - Math.sin(phi)) ** 2 * k
  return { dc: 1 + 0.4 * k, dq, dgamma: 1 }
}

/**
 * Load-inclination factors (Meyerhof; Hanna & Meyerhof), where β is the
 * inclination of the resultant from vertical, in degrees:
 *
 *     ic = iq = (1 − β/90)²,      iγ = (1 − β/φ)²
 *
 * iγ IS ZERO ONCE β EXCEEDS φ. That is not a numerical guard — a load inclined
 * more steeply than the friction angle cannot be carried by friction at all,
 * and the surcharge and cohesion terms are all that remain.
 */
export function inclinationFactors(
  phiDeg: number, betaDeg: number,
): { ic: number; iq: number; igamma: number } {
  const beta = Math.max(0, betaDeg)
  if (beta > 90) throw new Error('Load inclination must not exceed 90° from vertical.')
  const ic = (1 - beta / 90) ** 2
  const igamma = phiDeg <= 0 ? 0 : beta >= phiDeg ? 0 : (1 - beta / phiDeg) ** 2
  return { ic, iq: ic, igamma }
}

export interface GeneralBearingInput {
  /** Cohesion, kPa. */
  c: number
  phiDeg: number
  /** Moist unit weight above the water table, kN/m³. */
  gamma: number
  /** Saturated unit weight, kN/m³. Defaults to gamma. */
  gammaSat?: number
  /** Footing short side and long side, m. A strip footing is L = Infinity. */
  B: number
  L?: number
  /** Founding depth, m. */
  Df: number
  /** Depth to the water table below ground, m. Omit for none. */
  waterTable?: number
  /** Load eccentricity along B and L, m — Meyerhof's effective area. */
  eB?: number
  eL?: number
  /** Inclination of the resultant from vertical, degrees. */
  loadInclination?: number
  method?: BearingMethod
  /** Factor of safety on the NET capacity. */
  FS?: number
}

export interface GeneralBearingResult extends BearingFactors, BearingFactorSet {
  method: BearingMethod
  /** Effective footing dimensions after eccentricity, m. */
  effectiveB: number
  effectiveL: number
  /** Surcharge at founding level, kPa. */
  surcharge: number
  /** Unit weight used in the Nγ term after the water-table correction, kN/m³. */
  gammaEffective: number
  /** Ultimate gross bearing capacity, kPa. */
  qult: number
  /** Net ultimate, q_u − q, kPa. */
  qnet: number
  /** Allowable NET pressure = q_net/FS, kPa — the one to compare a footing to. */
  qallowNet: number
  /** Allowable gross = q_net/FS + q, kPa. */
  qallowGross: number
  notes: string[]
}

/**
 * Water-table correction (Das, three cases):
 *
 *   I    dw ≤ Df           surcharge uses γ′ below the table; γ̄ = γ′
 *   II   Df < dw ≤ Df + B  surcharge unaffected; γ̄ = γ′ + (dw−Df)/B (γ − γ′)
 *   III  dw > Df + B       no effect
 *
 * The failure wedge extends about B below the base, which is why case II
 * interpolates over exactly that depth rather than over the whole profile.
 */
function waterCorrection(
  gamma: number, gammaSat: number, B: number, Df: number, dw: number | undefined,
): { surcharge: number; gammaEff: number; note?: string } {
  const GAMMA_W = 9.81
  const gPrime = gammaSat - GAMMA_W
  if (dw == null || dw >= Df + B) {
    return { surcharge: gamma * Df, gammaEff: gamma }
  }
  if (dw <= Df) {
    const above = Math.max(0, dw)
    return {
      surcharge: gamma * above + gPrime * (Df - above),
      gammaEff: gPrime,
      note: `Water table at ${dw.toFixed(2)} m is at or above founding level: the surcharge uses the buoyant unit weight below it and the Nγ term uses γ′ = ${gPrime.toFixed(2)} kN/m³. Submergence roughly halves the Nγ term.`,
    }
  }
  const gammaBar = gPrime + ((dw - Df) / B) * (gamma - gPrime)
  return {
    surcharge: gamma * Df,
    gammaEff: gammaBar,
    note: `Water table at ${dw.toFixed(2)} m sits within B below the footing, so the Nγ term uses an interpolated γ̄ = ${gammaBar.toFixed(2)} kN/m³ over the failure wedge.`,
  }
}

/** The general bearing-capacity equation with every factor stated. */
export function generalBearingCapacity(i: GeneralBearingInput): GeneralBearingResult {
  const notes: string[] = []
  if (!(i.B > 0)) throw new Error('Footing width must be greater than zero.')
  if (i.Df < 0) throw new Error('Founding depth must not be negative.')

  const method = i.method ?? 'vesic'
  const L = i.L ?? Infinity
  if (L < i.B) {
    notes.push('L was shorter than B; the two were swapped so B remains the short side, as every shape factor assumes.')
  }
  const B0 = Math.min(i.B, L)
  const L0 = Math.max(i.B, L)

  // Meyerhof's effective area: the footing is reduced so the load sits at the
  // centre of what is left. It does NOT model the pressure redistribution —
  // it is a device that keeps the bearing equation usable under a moment.
  const eB = Math.abs(i.eB ?? 0)
  const eL = Math.abs(i.eL ?? 0)
  const effectiveB = B0 - 2 * eB
  const effectiveL = Number.isFinite(L0) ? L0 - 2 * eL : Infinity
  if (effectiveB <= 0 || effectiveL <= 0) {
    throw new Error('Eccentricity exceeds the footing: no effective area remains (e ≥ B/2).')
  }
  if (eB > B0 / 6 || (Number.isFinite(L0) && eL > L0 / 6)) {
    notes.push('Eccentricity is outside the middle third, so part of the base lifts off. The effective-area method still applies, but the contact-pressure distribution is no longer trapezoidal.')
  }

  // The short side of the EFFECTIVE area governs the Nγ term and the shape
  // factors — using the gross B here is the usual mistake, and it is
  // unconservative.
  const Beff = Math.min(effectiveB, effectiveL)
  const Leff = Math.max(effectiveB, effectiveL)

  const f = bearingFactors(i.phiDeg)
  const Ngamma = nGamma(i.phiDeg, method)
  const s = shapeFactors(i.phiDeg, Beff, Leff, method, f)
  const d = depthFactors(i.phiDeg, B0, i.Df, method)
  const inc = inclinationFactors(i.phiDeg, i.loadInclination ?? 0)

  const gammaSat = i.gammaSat ?? i.gamma
  const w = waterCorrection(i.gamma, gammaSat, Beff, i.Df, i.waterTable)
  if (w.note) notes.push(w.note)

  const qult =
    i.c * f.Nc * s.sc * d.dc * inc.ic +
    w.surcharge * f.Nq * s.sq * d.dq * inc.iq +
    0.5 * w.gammaEff * Beff * Ngamma * s.sgamma * d.dgamma * inc.igamma

  const qnet = qult - w.surcharge
  const FS = i.FS ?? 3

  if ((i.loadInclination ?? 0) > 0 && (i.loadInclination ?? 0) >= i.phiDeg && i.phiDeg > 0) {
    notes.push(
      `The load is inclined ${(i.loadInclination ?? 0).toFixed(0)}°, at or beyond φ′ = ${i.phiDeg.toFixed(0)}°, so iγ = 0 and the Nγ term drops out entirely. Check sliding as well — at this inclination it usually governs before bearing does.`,
    )
  }
  if (i.Df / B0 > 4) {
    notes.push(`Df/B = ${(i.Df / B0).toFixed(1)}. Shallow-foundation bearing theory is being applied well past the Df/B ≈ 3–4 range it was calibrated over; a deep-foundation method is the defensible one here.`)
  }
  if (i.phiDeg > 0 && i.c > 0) {
    notes.push('Both c and φ are non-zero. That is a drained c′–φ′ envelope; for an undrained short-term check use φ = 0 with c = cu, which is a different analysis and usually governs a clay.')
  }
  notes.push(
    `Bearing capacity is not a settlement check. On granular soil the allowable pressure is normally governed by settlement, and q_net/${FS} says nothing about how far the footing moves.`,
  )

  return {
    ...f, Ngamma, method,
    ...s, ...d, ...inc,
    effectiveB, effectiveL,
    surcharge: w.surcharge,
    gammaEffective: w.gammaEff,
    qult, qnet,
    qallowNet: qnet / FS,
    qallowGross: qnet / FS + w.surcharge,
    notes,
  }
}

/** Run all three methods on one footing, so the spread is visible. */
export function compareMethods(i: GeneralBearingInput): Record<BearingMethod, GeneralBearingResult> {
  return {
    meyerhof: generalBearingCapacity({ ...i, method: 'meyerhof' }),
    hansen: generalBearingCapacity({ ...i, method: 'hansen' }),
    vesic: generalBearingCapacity({ ...i, method: 'vesic' }),
  }
}
