// ─────────────────────────────────────────────────────────────────────────
// Direct shear — Mohr–Coulomb failure envelope. Layer 8. ASTM D3080.
//
//   τf = c′ + σ′n · tan φ′
//
// Three or more specimens are sheared at different normal stresses, and the
// envelope is the straight line through the peak shear stresses. c′ is its
// intercept and φ′ its slope. That is the whole test, and every subtlety is in
// how the line is fitted and how far it may be trusted.
//
// A NEGATIVE FITTED COHESION IS AN ARTEFACT, NOT A SOIL PROPERTY. Least squares
// through three scattered points will happily produce c′ = −4 kPa, which would
// then be carried into a bearing-capacity calculation as a real (and
// unconservative in reverse) number. When the fit comes out negative this
// module REFITS through the origin — the physically meaningful constraint for a
// cohesionless soil — and says it did.
//
// c′ AND φ′ ARE ONLY VALID OVER THE STRESSES TESTED. The envelope of a real
// soil is curved; a straight line through 50–200 kPa says nothing about
// behaviour at 600 kPa under a raft. The module reports the tested range so a
// caller can check the footing stress against it, and warns when asked.
//
// UNITS: stresses kPa; angles degrees.
// ─────────────────────────────────────────────────────────────────────────

import { type LabNote, info, warn } from '../notes'

export interface ShearPoint {
  /** Effective normal stress on the shear plane, kPa. */
  normalStress: number
  /** Peak shear stress at failure, kPa. */
  peakShear: number
  /** Residual (post-peak) shear stress, kPa. Optional. */
  residualShear?: number
}

export interface DirectShearData {
  points: ShearPoint[]
  /** 'CD' consolidated drained (the usual) or 'UU'. */
  testType?: 'CD' | 'CU' | 'UU'
}

export interface Envelope {
  /** Cohesion intercept, kPa. Never negative — see the module header. */
  cohesion: number
  /** Friction angle, degrees. */
  frictionAngle: number
  /** Coefficient of determination of the fit. */
  r2: number
  /** True when the free fit gave a negative intercept and was refitted through the origin. */
  refittedThroughOrigin: boolean
}

export interface DirectShearResult {
  peak: Envelope
  /** Residual envelope, when residual shear stresses were recorded. */
  residual?: Envelope
  /** Lowest and highest normal stress tested, kPa. */
  stressRange: { min: number; max: number }
  notes: LabNote[]
}

/**
 * Least-squares line τ = c + σ·m through the points, with the negative-intercept
 * refit described in the module header.
 */
export function fitEnvelope(points: { x: number; y: number }[]): Envelope {
  const n = points.length
  if (n < 2) throw new Error('A failure envelope needs at least two specimens.')

  const mx = points.reduce((s, p) => s + p.x, 0) / n
  const my = points.reduce((s, p) => s + p.y, 0) / n
  const sxx = points.reduce((s, p) => s + (p.x - mx) ** 2, 0)
  const sxy = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0)

  if (sxx < 1e-12) {
    throw new Error('Every specimen was sheared at the same normal stress — the envelope has no slope.')
  }

  let slope = sxy / sxx
  let intercept = my - slope * mx
  let refitted = false

  if (intercept < 0) {
    // Refit through the origin: slope = Σxy / Σx².
    const sxy0 = points.reduce((s, p) => s + p.x * p.y, 0)
    const sxx0 = points.reduce((s, p) => s + p.x * p.x, 0)
    slope = sxx0 > 1e-12 ? sxy0 / sxx0 : 0
    intercept = 0
    refitted = true
  }

  // R² against the fitted line (through the origin when refitted).
  const ssTot = points.reduce((s, p) => s + (p.y - my) ** 2, 0)
  const ssRes = points.reduce((s, p) => s + (p.y - (intercept + slope * p.x)) ** 2, 0)
  const r2 = ssTot > 1e-12 ? 1 - ssRes / ssTot : 1

  return {
    cohesion: intercept,
    // A negative slope is not a friction angle. It means the specimens got
    // weaker with confinement, which is a test problem, and atan would quietly
    // return a negative angle that reads as a real result.
    frictionAngle: (Math.atan(Math.max(slope, 0)) * 180) / Math.PI,
    r2,
    refittedThroughOrigin: refitted,
  }
}

export function directShear(d: DirectShearData): DirectShearResult {
  const notes: LabNote[] = []
  const pts = d.points.filter((p) => Number.isFinite(p.normalStress) && Number.isFinite(p.peakShear))

  if (pts.length < 2) {
    throw new Error('A direct-shear envelope needs at least two specimens with a normal and a peak shear stress.')
  }
  if (pts.length < 3) {
    notes.push(warn('Only two specimens. D3080 asks for at least three so the envelope can be seen to be straight — with two, any scatter is invisible.'))
  }

  const peak = fitEnvelope(pts.map((p) => ({ x: p.normalStress, y: p.peakShear })))

  const withResidual = pts.filter((p) => Number.isFinite(p.residualShear))
  const residual = withResidual.length >= 2
    ? fitEnvelope(withResidual.map((p) => ({ x: p.normalStress, y: p.residualShear! })))
    : undefined

  const stresses = pts.map((p) => p.normalStress)
  const stressRange = { min: Math.min(...stresses), max: Math.max(...stresses) }

  if (peak.refittedThroughOrigin) {
    notes.push(warn(
      'The free fit gave a NEGATIVE cohesion intercept, which is a fitting artefact rather than a soil property. The envelope was refitted through the origin and c′ reported as 0.',
    ))
  }
  if (peak.r2 < 0.95) {
    notes.push(warn(
      `The envelope fits poorly (R² = ${peak.r2.toFixed(3)}). Either the soil's envelope is curved over this stress range, or one specimen is an outlier — plot the points before trusting c′ and φ′.`,
    ))
  }
  if (peak.frictionAngle > 45) {
    notes.push(warn(`φ′ = ${peak.frictionAngle.toFixed(1)}° is above the range most soils reach. Verify the shear-box area correction.`))
  }
  if (residual && residual.frictionAngle > peak.frictionAngle + 0.5) {
    notes.push(warn('The residual friction angle exceeds the peak, which cannot happen in a real soil — check which column is which.'))
  }

  notes.push(info(
    `c′ and φ′ are fitted over ${stressRange.min.toFixed(0)}–${stressRange.max.toFixed(0)} kPa and are valid only there. A real envelope is curved; extrapolating to a much higher footing stress overestimates strength.`,
  ))

  return { peak, residual, stressRange, notes }
}

/**
 * Shear strength predicted by an envelope at a given normal stress, with a
 * warning when that stress is outside the tested range.
 */
export function strengthAt(
  env: Envelope, normalStress: number, range: { min: number; max: number },
): { tau: number; extrapolated: boolean } {
  const tau = env.cohesion + normalStress * Math.tan((env.frictionAngle * Math.PI) / 180)
  return { tau, extrapolated: normalStress < range.min || normalStress > range.max }
}
