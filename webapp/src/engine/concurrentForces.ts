// ─────────────────────────────────────────────────────────────────────────
// METHOD OF JOINTS, STEP ONE — resolve a concurrent force system.
//
// The method of joints begins the same way every time: pick a joint, draw
// every force that meets there (applied loads and member forces alike), and
// resolve each into x and y components. The joint is in equilibrium only when
// both sums vanish, ΣFx = ΣFy = 0; when they do not, the resultant R of the
// system is exactly the force a support (or the rest of the truss) would have
// to supply.
//
// This module does that arithmetic and nothing else — no UI, no truss model.
// Angles are DIRECTION angles: degrees, measured counter-clockwise from the
// +x axis, the convention the joint diagram draws. A force pulling away from
// the joint along a member that runs 30° below the horizon is simply −30°.
// Forces are kN throughout (any consistent unit works — the sums are linear).
// ─────────────────────────────────────────────────────────────────────────

export interface JointForce {
  /** Label shown on the diagram and in the steps ("F1", "AB", "P1"…). */
  name: string
  /** Magnitude, kN — never negative (a sense reversal is a 180° turn). */
  magnitude: number
  /** Direction, degrees CCW from the +x axis; any real number is accepted. */
  angleDeg: number
}

export interface ForceComponents {
  name: string
  magnitude: number
  angleDeg: number
  /** F·cosθ — the x component. */
  fx: number
  /** F·sinθ — the y component. */
  fy: number
}

export interface JointResultant {
  /** Every input force with its two components, in input order. */
  components: ForceComponents[]
  /** ΣFx, kN. */
  Rx: number
  /** ΣFy, kN. */
  Ry: number
  /** R = √(Rx² + Ry²), kN. */
  R: number
  /** Direction of R, degrees CCW from +x, normalised to [0, 360). */
  thetaDeg: number
  /** Σ of the input magnitudes, kN — the scale the tolerance reads against. */
  sumF: number
  /** True when R is zero to within the tolerance: the joint holds. */
  equilibrium: boolean
}

/** The joint counts as balanced when |R| falls below this share of ΣF. */
export const EQUILIBRIUM_TOL = 1e-9

const norm360 = (deg: number) => {
  const t = deg % 360
  return t < 0 ? t + 360 : t
}

function check(f: JointForce, i: number): void {
  const at = `force ${i + 1}${f.name ? ` (${f.name})` : ''}`
  if (!Number.isFinite(f.magnitude) || f.magnitude < 0)
    throw new Error(`${at}: the magnitude must be a finite, non-negative number.`)
  if (!Number.isFinite(f.angleDeg))
    throw new Error(`${at}: the direction must be a finite angle in degrees.`)
  if (!f.name.trim()) throw new Error(`${at}: give the force a name for the drawing.`)
}

/**
 * Resolve every force at the joint and sum the components.
 *
 * Empty input is a joint with nothing acting on it: trivially in equilibrium.
 * A single force is allowed — the resultant is that force, which is exactly
 * what a one-member joint shows.
 */
export function resolveJointForces(forces: readonly JointForce[]): JointResultant {
  forces.forEach(check)
  const components = forces.map((f) => {
    const rad = (f.angleDeg * Math.PI) / 180
    return { name: f.name.trim(), magnitude: f.magnitude, angleDeg: f.angleDeg, fx: f.magnitude * Math.cos(rad), fy: f.magnitude * Math.sin(rad) }
  })
  const Rx = components.reduce((s, c) => s + c.fx, 0)
  const Ry = components.reduce((s, c) => s + c.fy, 0)
  const sumF = forces.reduce((s, f) => s + f.magnitude, 0)
  const R = Math.hypot(Rx, Ry)
  return {
    components,
    Rx,
    Ry,
    R,
    thetaDeg: norm360((Math.atan2(Ry, Rx) * 180) / Math.PI),
    sumF,
    equilibrium: R <= EQUILIBRIUM_TOL * Math.max(1, sumF),
  }
}
