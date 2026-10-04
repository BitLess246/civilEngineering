// ─────────────────────────────────────────────────────────────────────────
// HYDROSTATICS — fluid at rest and in rigid-body motion.
//
// The board-exam hydrostatics core (syllabus Hydraulics B.1): hydrostatic
// force on plane surfaces with the center of pressure, curved-surface
// components, buoyancy and floating stability (metacenter), manometers, and
// relative equilibrium — accelerating tanks and rotating vessels.
//
// SI throughout: lengths m, forces kN, γ water = 9.81 kN/m³.
// ─────────────────────────────────────────────────────────────────────────

/** Unit weight of water at 4 °C, kN/m³. */
export const GAMMA_W = 9.81

export type PlaneShape =
  | { kind: 'rect'; b: number; h: number }
  | { kind: 'circle'; d: number }

/** Centroidal moment of inertia about the axis parallel to the surface. */
function planeIxx(shape: PlaneShape): number {
  return shape.kind === 'rect'
    ? (shape.b * shape.h ** 3) / 12
    : (Math.PI * shape.d ** 4) / 64
}

/** Plane area. */
function planeArea(shape: PlaneShape): number {
  return shape.kind === 'rect' ? shape.b * shape.h : (Math.PI * shape.d ** 2) / 4
}

export interface PlaneInput {
  shape: PlaneShape
  /** Vertical depth of the centroid, m. */
  hc: number
  /** Inclination from the horizontal, degrees (90 = vertical plate). */
  thetaDeg: number
  /** Fluid unit weight, kN/m³ (default water). */
  gamma?: number
}

export interface PlaneResult {
  F: number        // resultant hydrostatic force, kN
  A: number        // area, m²
  Ixxc: number     // centroidal inertia, m⁴
  ycPlane: number  // centroid distance along the plane from the surface, m
  ypPlane: number  // center of pressure along the plane from the surface, m
  hpVertical: number // center of pressure as a vertical depth, m
}

/** Hydrostatic force on a submerged plane: F = γ·hc·A, acting at
 *  yp = yc + Ixx,c/(yc·A) measured along the plane from the free surface. */
export function planeForce(p: PlaneInput): PlaneResult {
  if (!(p.hc > 0)) throw new Error('Centroid depth must be positive.')
  if (!(p.thetaDeg > 0 && p.thetaDeg <= 90)) throw new Error('Inclination must be 0–90° from the horizontal.')
  const gamma = p.gamma ?? GAMMA_W
  if (!(gamma > 0)) throw new Error('Unit weight must be positive.')
  const A = planeArea(p.shape)
  const Ixxc = planeIxx(p.shape)
  const sinT = Math.sin((p.thetaDeg * Math.PI) / 180)
  const F = gamma * p.hc * A
  const ycPlane = p.hc / sinT
  const ypPlane = ycPlane + Ixxc / (ycPlane * A)
  return { F, A, Ixxc, ycPlane, ypPlane, hpVertical: ypPlane * sinT }
}

export interface CurvedGateInput {
  /** Gate radius, m (quarter-circular arc). */
  R: number
  /** Gate width into the page, m. */
  W: number
  /** Vertical depth of the arc's horizontal-diameter level, m. */
  hc: number
  /** Fluid unit weight, kN/m³ (default water). */
  gamma?: number
}

export interface CurvedGateResult {
  Fh: number       // horizontal component, kN
  Fv: number       // vertical component (fluid weight above), kN
  R: number        // resultant magnitude, kN
  thetaDeg: number // resultant angle above horizontal, degrees
}

/** Quarter-circular gate: Fh on the vertical projection, Fv as the fluid
 *  weight over it; the resultant passes through the arc's center. */
export function curvedGateForce(p: CurvedGateInput): CurvedGateResult {
  if (!(p.R > 0)) throw new Error('Radius must be positive.')
  if (!(p.W > 0)) throw new Error('Width must be positive.')
  if (!(p.hc > 0)) throw new Error('Centroid depth must be positive.')
  const gamma = p.gamma ?? GAMMA_W
  if (!(gamma > 0)) throw new Error('Unit weight must be positive.')
  const Fh = gamma * p.hc * (p.R * p.W)
  const Fv = gamma * ((Math.PI * p.R * p.R) / 4) * p.W
  return {
    Fh, Fv,
    R: Math.hypot(Fh, Fv),
    thetaDeg: (Math.atan2(Fv, Fh) * 180) / Math.PI,
  }
}

export interface FloatInput {
  /** Barge length, m. */
  L: number
  /** Barge beam (width), m. */
  B: number
  /** Draft (submerged depth), m. */
  draft: number
  /** Center of gravity above the keel, m. */
  KG: number
  /** Fluid unit weight, kN/m³ (default water). */
  gamma?: number
}

export interface FloatResult {
  V: number        // displaced volume, m³
  Fb: number       // buoyant force, kN
  KB: number       // center of buoyancy above keel, m
  BM: number       // metacentric radius I/V, m
  GM: number       // metacentric height, m (> 0 stable)
  stable: boolean
}

/** Box-barge flotation and transverse stability: KB = d/2, BM = I_oo/V with
 *  I_oo = L·B³/12 about the rolling axis, GM = KB + BM − KG. */
export function floatingStability(p: FloatInput): FloatResult {
  if (!(p.L > 0 && p.B > 0)) throw new Error('Length and beam must be positive.')
  if (!(p.draft > 0)) throw new Error('Draft must be positive.')
  if (!(p.KG >= 0)) throw new Error('KG cannot be negative.')
  const gamma = p.gamma ?? GAMMA_W
  if (!(gamma > 0)) throw new Error('Unit weight must be positive.')
  const V = p.L * p.B * p.draft
  const KB = p.draft / 2
  const BM = ((p.L * p.B ** 3) / 12) / V
  const GM = KB + BM - p.KG
  return { V, Fb: gamma * V, KB, BM, GM, stable: GM > 0 }
}

export interface ManometerLeg {
  /** Fluid unit weight, kN/m³. */
  gamma: number
  /** Column height, m — positive going down from the reference point. */
  h: number
  /** +1 moving down the leg, −1 moving up. */
  sign: 1 | -1
}

/** Walk a manometer from a point of known pressure: p += Σ sign·γ·h.
 *  Returns the pressure at the far end, kPa. */
export function manometer(pStartKpa: number, legs: ManometerLeg[]): number {
  if (legs.length < 1) throw new Error('At least one manometer leg is needed.')
  let p = pStartKpa
  for (const [k, leg] of legs.entries()) {
    if (!(leg.gamma > 0)) throw new Error(`Leg ${k + 1}: unit weight must be positive.`)
    if (!(leg.h >= 0)) throw new Error(`Leg ${k + 1}: height cannot be negative.`)
    p += leg.sign * leg.gamma * leg.h
  }
  return p
}

/** Free-surface tilt of a tank under horizontal acceleration: tanθ = ax/g. */
export function accelTilt(ax: number, g = 9.81): { tanTheta: number; thetaDeg: number } {
  if (!(g > 0)) throw new Error('Gravity must be positive.')
  const tanTheta = ax / g
  return { tanTheta, thetaDeg: (Math.atan(tanTheta) * 180) / Math.PI }
}

/** Pressure at depth h under vertical acceleration (positive = upward):
 *  p = ρ(g + az)·h, kPa. */
export function accelPressure(h: number, az: number, gamma = GAMMA_W): number {
  if (!(h >= 0)) throw new Error('Depth cannot be negative.')
  if (!(gamma > 0)) throw new Error('Unit weight must be positive.')
  return ((gamma * (9.81 + az)) / 9.81) * h
}

/** Forced-vortex paraboloid: surface rise at radius r is z = ω²r²/2g. */
export function rotationRise(omega: number, r: number, g = 9.81): number {
  if (!(omega >= 0)) throw new Error('Angular velocity cannot be negative.')
  if (!(r >= 0)) throw new Error('Radius cannot be negative.')
  if (!(g > 0)) throw new Error('Gravity must be positive.')
  return ((omega * omega * r * r) / (2 * g))
}
