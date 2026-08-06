// ─────────────────────────────────────────────────────────────────────────
// Triaxial compression. Layer 8. ASTM D2850 (UU) / D4767 (CU) / D7181 (CD).
//
// A cylindrical specimen is held at a cell pressure σ3 and loaded axially until
// it fails at a deviator stress Δσf = σ1 − σ3. Each specimen is one MOHR CIRCLE
// on the σ–τ plane, centred at p = (σ1+σ3)/2 with radius q = (σ1−σ3)/2, and the
// strength envelope is the line TANGENT to the whole family.
//
// THE ENVELOPE IS A TANGENT, NOT A LINE THROUGH THE TOPS OF THE CIRCLES. Those
// are different lines, and the difference is not small: the tops sit at τ = q
// directly above the centres, and a line through them is the Kf line, whose
// slope is sin φ — not tan φ. Reading tan φ off it UNDERSTATES φ′ by several
// degrees (a Kf line at α = 30° is φ = 35.3°, not 30°). So the fit is
// done in the p–q plane, where the relation is linear and least squares is
// meaningful, and converted:
//
//     q = a + p·tan α       (the Kf line, fitted)
//     sin φ = tan α,   c = a / cos φ
//
// which is exactly the common tangent: the distance from a centre (p, 0) to the
// line τ = c + σ·tan φ is c·cos φ + p·sin φ = a + p·tan α = q, the radius. The
// test asserts that to machine precision rather than trusting the algebra here.
//
// TOTAL AND EFFECTIVE ARE DIFFERENT ENVELOPES OF THE SAME TEST. In a CU test the
// pore pressure at failure is measured, so both can be drawn: the effective
// circles are the total circles SHIFTED LEFT by u (same diameter — u changes no
// deviator stress), and φ′ is typically much larger than φ while c′ is smaller.
// Quoting one and using the other is a classic and expensive error, so this
// module returns both, labelled, and never silently picks.
//
// A UU TEST ON A SATURATED CLAY HAS φ = 0. Every specimen fails at the same
// deviator stress whatever the cell pressure, because the added confinement all
// goes into pore water. The envelope is horizontal and c = su, the undrained
// shear strength. A UU series that comes out with a real friction angle is
// telling you the specimen was not saturated (or the cell pressures were not
// what the sheet says), and the module says so instead of reporting φ.
//
// UNITS: stresses kPa; angles degrees.
// ─────────────────────────────────────────────────────────────────────────

import { fitEnvelope } from './directShear'

export type TriaxialType = 'UU' | 'CU' | 'CD'

/** One specimen, at failure. */
export interface TriaxialSpecimen {
  /** Cell (confining) pressure σ3, kPa. */
  cellPressure: number
  /**
   * Deviator stress at failure σ1 − σ3, kPa — AREA-CORRECTED, as the laboratory
   * reports it. A specimen barrels as it strains and the raw load over the
   * initial area overstates the strength by 10–20% at failure strains.
   */
  deviatorStress: number
  /**
   * Pore-water pressure at failure, kPa. CU only: it is what turns the total
   * circles into effective ones. Absent ⇒ only the total envelope exists.
   */
  porePressure?: number
}

export interface TriaxialData {
  testType: TriaxialType
  specimens: TriaxialSpecimen[]
}

/**
 * The stresses ON THE FAILURE PLANE — the point where the envelope touches the
 * circle, which is the state the specimen actually failed at.
 *
 * Not the maximum shear stress: that is the crown, τmax = r, on a plane at 45°.
 * The soil fails on the plane where τ first reaches its available strength, and
 * that plane carries LESS shear than the crown and less normal stress than the
 * centre. Quoting τmax as the failure shear stress overstates it by 1/cos φ.
 */
export interface FailurePoint {
  /** Normal stress on the failure plane, kPa: σf = p − r·sin φ. */
  sigma: number
  /** Shear stress on the failure plane, kPa: τf = r·cos φ. */
  tau: number
  /** Inclination of the failure plane to the major principal plane, degrees: θ = 45 + φ/2. */
  theta: number
}

/** One specimen as a Mohr circle, in whichever stress basis it was built. */
export interface MohrCircle {
  /** Minor principal stress σ3, kPa. */
  sigma3: number
  /** Major principal stress σ1 = σ3 + Δσf, kPa. */
  sigma1: number
  /** Centre p = (σ1+σ3)/2, kPa. */
  center: number
  /** Radius q = (σ1−σ3)/2, kPa — the maximum shear stress in the specimen. */
  radius: number
  /**
   * Where the fitted envelope touches this circle. Attached after the fit, so
   * it is absent when no envelope could be fitted (a single specimen) — and
   * computed ONCE here rather than in each of the chart and the results table,
   * which would be two readings of the same construction.
   */
  failure?: FailurePoint
}

export interface TriaxialEnvelope {
  /** Cohesion intercept on the σ–τ plane, kPa. */
  cohesion: number
  /** Friction angle, degrees. */
  frictionAngle: number
  /** Kf-line intercept a and slope angle α, kPa and degrees — what was fitted. */
  kf: { a: number; alpha: number }
  /** Coefficient of determination of the Kf-line fit. */
  r2: number
  /** True when a negative intercept was refitted through the origin. */
  refittedThroughOrigin: boolean
}

export interface TriaxialResult {
  testType: TriaxialType
  /** Total-stress circles, one per specimen. */
  circles: MohrCircle[]
  /** Effective-stress circles — present only when every specimen recorded u. */
  effectiveCircles?: MohrCircle[]
  /** Total-stress envelope. Absent with a single specimen. */
  total?: TriaxialEnvelope
  /** Effective-stress envelope, from the shifted circles. */
  effective?: TriaxialEnvelope
  /**
   * Undrained shear strength su, kPa — the mean radius, reported for a UU test
   * (and for a single specimen of any type), where the envelope is horizontal
   * and c = su by definition.
   */
  undrainedStrength?: number
  /** Cell pressures tested, kPa — the range c and φ may be trusted over. */
  cellRange: { min: number; max: number }
  notes: string[]
}

const DEG = 180 / Math.PI

const circleOf = (sigma3: number, deviator: number): MohrCircle => ({
  sigma3,
  sigma1: sigma3 + deviator,
  center: sigma3 + deviator / 2,
  radius: deviator / 2,
})

/**
 * Fit the tangent envelope to a family of circles through the p–q plane.
 *
 * Returns undefined when the Kf line is too steep to convert — tan α ≥ 1 means
 * sin φ ≥ 1, which no soil has, and is what a transcription error in the cell
 * pressures produces. Reporting φ = 90° would be worse than reporting nothing.
 */
export function fitTangent(circles: MohrCircle[]): TriaxialEnvelope | undefined {
  if (circles.length < 2) return undefined
  // The line fit — including the negative-intercept refit through the origin —
  // is the direct-shear one. Same artefact, same remedy, one home.
  const line = fitEnvelope(circles.map((c) => ({ x: c.center, y: c.radius })))
  const alpha = line.frictionAngle                 // Kf-line slope angle, NOT φ
  const tanA = Math.tan(alpha / DEG)
  // sin φ = tan α, so a Kf line at 45° is sin φ = 1 and anything steeper has no
  // φ at all. The tolerance is arithmetic, not physical: tan(45°) comes back as
  // 0.999999999999999 in floating point, and φ = 89.99999° is not an answer.
  if (!(tanA < 1 - 1e-9)) return undefined
  const phi = Math.asin(tanA) * DEG
  const cohesion = line.cohesion / Math.cos(phi / DEG)
  return {
    cohesion,
    frictionAngle: phi,
    kf: { a: line.cohesion, alpha },
    r2: line.r2,
    refittedThroughOrigin: line.refittedThroughOrigin,
  }
}

/**
 * The tangent point of an envelope on a circle.
 *
 * The radius to the tangency is perpendicular to the envelope, so it points at
 * (−sin φ, cos φ) from the centre — hence σf = p − r·sin φ and τf = r·cos φ.
 * The corresponding plane is at θ = 45 + φ/2 to the major principal plane,
 * because the arc from the σ1 end to the tangency subtends 2θ = 90 + φ.
 */
export function failurePoint(c: MohrCircle, e: TriaxialEnvelope): FailurePoint {
  const phi = e.frictionAngle / DEG
  return {
    sigma: c.center - c.radius * Math.sin(phi),
    tau: c.radius * Math.cos(phi),
    theta: 45 + e.frictionAngle / 2,
  }
}

/** Attach the failure point to every circle an envelope was fitted through. */
const withFailure = (circles: MohrCircle[], e?: TriaxialEnvelope): MohrCircle[] =>
  (e ? circles.map((c) => ({ ...c, failure: failurePoint(c, e) })) : circles)

export function triaxial(d: TriaxialData): TriaxialResult {
  const notes: string[] = []
  const specimens = [...d.specimens]
    .filter((s) => Number.isFinite(s.cellPressure) && Number.isFinite(s.deviatorStress))
    .sort((a, b) => a.cellPressure - b.cellPressure)

  if (!specimens.length) throw new Error('A triaxial test needs at least one specimen.')
  for (const s of specimens) {
    if (s.cellPressure < 0) throw new Error('A cell pressure cannot be negative.')
    if (!(s.deviatorStress > 0)) {
      throw new Error('A specimen failed at zero or negative deviator stress. Check the load column.')
    }
  }

  const circles = specimens.map((s) => circleOf(s.cellPressure, s.deviatorStress))
  const cellRange = {
    min: specimens[0].cellPressure,
    max: specimens[specimens.length - 1].cellPressure,
  }

  // Effective stresses need u on EVERY specimen: a partial set would fit an
  // envelope through a mixture of total and effective circles, which is not an
  // envelope of anything.
  const withU = specimens.filter((s) => Number.isFinite(s.porePressure))
  let effectiveCircles: MohrCircle[] | undefined
  if (withU.length === specimens.length && specimens.length > 0) {
    effectiveCircles = specimens.map((s) => circleOf(s.cellPressure - (s.porePressure ?? 0), s.deviatorStress))
    if (effectiveCircles.some((c) => c.sigma3 < 0)) {
      notes.push(
        'A pore pressure at failure exceeds its cell pressure, which puts an effective minor principal stress below zero. Soil cannot sustain tension — check the sign convention on the pore-pressure column (a NEGATIVE u, from a dilating dense soil, is normal and shifts the circle to the RIGHT).',
      )
    }
  } else if (withU.length > 0) {
    notes.push(
      `Pore pressure recorded on ${withU.length} of ${specimens.length} specimens, so no effective-stress envelope is drawn. Fitting one through a mixture of total and effective circles would not be an envelope of anything.`,
    )
  }

  const total = fitTangent(circles)
  const effective = effectiveCircles ? fitTangent(effectiveCircles) : undefined

  if (specimens.length === 1) {
    notes.push('One specimen gives one circle, and one circle has infinitely many tangents — su is reported, c and φ are not. A series needs three.')
  } else if (specimens.length === 2) {
    notes.push('Two specimens fix a line exactly, so the fit has no residual and R² carries no information about whether the envelope is straight. Three is the minimum that can disagree with itself.')
  }
  if (!total && specimens.length >= 2) {
    notes.push('The fitted Kf line is at or beyond 45°, which converts to sin φ ≥ 1 — no soil has that. Check the cell pressures and deviator stresses for a transcription error.')
  }
  if (total && total.frictionAngle > 50) {
    notes.push(
      `φ = ${total.frictionAngle.toFixed(1)}° is above anything a soil sustains — dense angular gravel reaches the high forties. The arithmetic is valid, so the input is what to check: a cell pressure entered as a total stress, or a deviator stress that is really σ1.`,
    )
  }

  const meanRadius = circles.reduce((s, c) => s + c.radius, 0) / circles.length
  let undrainedStrength: number | undefined

  if (d.testType === 'UU') {
    undrainedStrength = meanRadius
    const spread = Math.max(...circles.map((c) => c.radius)) - Math.min(...circles.map((c) => c.radius))
    const relative = meanRadius > 0 ? spread / meanRadius : 0
    notes.push(
      `Unconsolidated–undrained: on a SATURATED specimen every circle has the same diameter whatever the cell pressure, the envelope is horizontal, and c = su = ${meanRadius.toFixed(1)} kPa with φ = 0.`,
    )
    if (specimens.length > 1 && relative > 0.1 && total && total.frictionAngle > 2) {
      notes.push(
        `The deviator stress at failure varies by ${(relative * 100).toFixed(0)}% across the cell pressures and the fit returns φ = ${total.frictionAngle.toFixed(1)}°. In a UU test that is not a friction angle — it says the specimens were not fully saturated, or were not all the same soil. Use su, and check B before quoting anything else.`,
      )
    }
  } else if (specimens.length === 1) {
    undrainedStrength = meanRadius
  }

  if (d.testType === 'CU' && !effective) {
    notes.push(
      'A consolidated–undrained test without pore pressures gives only the TOTAL envelope, and total-stress parameters from a CU test apply to nothing in particular — they are neither the drained strength nor su. Record u at failure, or run CD.',
    )
  }
  if (d.testType === 'CU' && effective && total) {
    notes.push(
      `Effective φ′ = ${effective.frictionAngle.toFixed(1)}° with c′ = ${effective.cohesion.toFixed(1)} kPa, against total φ = ${total.frictionAngle.toFixed(1)}° and c = ${total.cohesion.toFixed(1)} kPa. These are two descriptions of the same specimens and are not interchangeable: use the effective pair with effective stresses in a drained analysis, the total pair only in the short term.`,
    )
  }
  if (d.testType === 'CD' && withU.length) {
    notes.push('A drained test is run slowly so that u stays at the back pressure; its circles are already effective, and the pore pressures recorded here have not been subtracted a second time.')
  }
  if (total && total.refittedThroughOrigin) {
    notes.push('The free fit gave a NEGATIVE cohesion intercept, which is an artefact of scatter rather than a soil property, so the envelope was refitted through the origin — the c = 0 a cohesionless soil actually has.')
  }
  if (total && specimens.length >= 3 && total.r2 < 0.95) {
    notes.push(`R² = ${total.r2.toFixed(3)} on the Kf line. A real envelope curves, and over a wide range of cell pressures a straight line through it is an approximation — check the plotted circles before quoting a single c and φ.`)
  }

  return {
    testType: d.testType,
    circles: withFailure(circles, total),
    effectiveCircles: effectiveCircles ? withFailure(effectiveCircles, effective) : undefined,
    total,
    effective,
    undrainedStrength,
    cellRange,
    notes,
  }
}
