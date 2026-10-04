// ─────────────────────────────────────────────────────────────────────────
// MUSKINGUM CHANNEL ROUTING — hydrograph translation + storage attenuation.
//
//   Storage      S = K·[X·I + (1 − X)·O]        (K hr, X weighting 0–0.5)
//   Continuity   (I1 + I2)/2 − (O1 + O2)/2 = (S2 − S1)/Δt
//   Routing      O2 = C0·I2 + C1·I1 + C2·O1
//     C0 = (0.5Δt − K·X) / D
//     C1 = (0.5Δt + K·X) / D            D = K(1−X) + 0.5Δt
//     C2 = (K(1−X) − 0.5Δt) / D
//     C0 + C1 + C2 = 1  (volume conservation)
//
//   Stability: all coefficients must be ≥ 0  ⇔  2KX ≤ Δt ≤ 2K(1−X).
//   Outside that window the routed outflow oscillates (negative C0 or C2)
//   and the method refuses to run. Accuracy is best for K/3 ≤ Δt ≤ K.
//
// Units: K and Δt in hours, flows in m³/s. The initial condition is steady
// flow O0 = I0, so a constant inflow passes through unchanged.
// ─────────────────────────────────────────────────────────────────────────

export interface MuskingumInput {
  /** Storage time constant, hr. */
  K: number
  /** Weighting factor 0–0.5 (0 = reservoir-like, 0.5 = pure translation). */
  X: number
  /** Routing interval, hr. */
  dt: number
  /** Inflow hydrograph ordinates (m³/s) sampled at 0, dt, 2dt… */
  inflow: number[]
}

export interface MuskingumResult {
  C0: number
  C1: number
  C2: number
  /** Routed outflow ordinates, same clock as the inflow. */
  outflow: number[]
  peakIn: number
  peakOut: number
  /** Time of the inflow peak, hr. */
  tPeakIn: number
  /** Time of the outflow peak, hr. */
  tPeakOut: number
  /** Peak attenuation, % of the inflow peak. */
  attenuationPct: number
  /** Lag of the outflow peak behind the inflow peak, hr. */
  lagHr: number
  /** Inflow volume (m³). */
  volumeIn: number
  /** Outflow volume (m³). */
  volumeOut: number
  notes: string[]
}

export function muskingumCoefficients(K: number, X: number, dt: number): { C0: number; C1: number; C2: number } {
  if (!(K > 0)) throw new Error('Storage constant K must be positive.')
  if (!(X >= 0 && X <= 0.5)) throw new Error('Weighting factor X must lie between 0 and 0.5.')
  if (!(dt > 0)) throw new Error('Routing interval Δt must be positive.')
  if (dt < 2 * K * X) {
    throw new Error(`Δt = ${dt} h is below the stability floor 2KX = ${(2 * K * X).toFixed(2)} h — C0 would go negative and the routed hydrograph would oscillate. Reduce K, raise X, or use a larger Δt.`)
  }
  if (dt > 2 * K * (1 - X)) {
    throw new Error(`Δt = ${dt} h exceeds the stability ceiling 2K(1−X) = ${(2 * K * (1 - X)).toFixed(2)} h — C2 would go negative and the routed hydrograph would oscillate. Raise K, lower X, or use a smaller Δt.`)
  }
  const D = K * (1 - X) + 0.5 * dt
  return {
    C0: (0.5 * dt - K * X) / D,
    C1: (0.5 * dt + K * X) / D,
    C2: (K * (1 - X) - 0.5 * dt) / D,
  }
}

/** Route one step: O2 = C0·I2 + C1·I1 + C2·O1. */
export function muskingumStep(C0: number, C1: number, C2: number, I1: number, I2: number, O1: number): number {
  return C0 * I2 + C1 * I1 + C2 * O1
}

export function muskingumRoute(input: MuskingumInput): MuskingumResult {
  const { K, X, dt, inflow } = input
  if (inflow.length < 3) throw new Error('Give at least three inflow ordinates.')
  if (inflow.some((q) => !(q >= 0))) throw new Error('Inflow ordinates cannot be negative.')

  const { C0, C1, C2 } = muskingumCoefficients(K, X, dt)
  const notes: string[] = []
  if (dt > K) notes.push(`Δt = ${dt} h is larger than K = ${K} h — the linear-interpolation assumption behind the method degrades; a smaller Δt routes the peak more faithfully.`)
  if (dt < K / 3) notes.push(`Δt = ${dt} h is below K/3 — several routing steps fall inside one storage response time; the results are stable but the interval could be widened.`)

  const outflow: number[] = [inflow[0]] // steady start: O0 = I0
  for (let i = 1; i < inflow.length; i++) {
    outflow.push(muskingumStep(C0, C1, C2, inflow[i - 1], inflow[i], outflow[i - 1]))
  }

  const peakIn = Math.max(...inflow)
  const peakOut = Math.max(...outflow)
  const tPeakIn = inflow.indexOf(peakIn) * dt
  const tPeakOut = outflow.indexOf(peakOut) * dt
  const dtSec = dt * 3600
  // Full trapezoid on both ends: (Σq − (first + last)/2)·Δt. Dropping the
  // first ordinate overstates the volume by inflow[0]·Δt/2 whenever the
  // hydrograph does not start at zero.
  const trap = (qs: number[]) => (qs.reduce((s, q) => s + q, 0) - (qs[0] + qs[qs.length - 1]) / 2) * dtSec
  const volumeIn = trap(inflow)
  const volumeOut = trap(outflow)

  return {
    C0, C1, C2, outflow,
    peakIn, peakOut, tPeakIn, tPeakOut,
    attenuationPct: peakIn > 0 ? (1 - peakOut / peakIn) * 100 : 0,
    lagHr: tPeakOut - tPeakIn,
    volumeIn, volumeOut,
    notes,
  }
}
