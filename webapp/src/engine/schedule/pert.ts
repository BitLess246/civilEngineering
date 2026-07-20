// ─────────────────────────────────────────────────────────────────────────
// PERT (Program Evaluation and Review Technique) engine.
//
//   Expected time   TE = (O + 4M + P) / 6          (beta-distribution mean)
//   Variance        σ² = ((P − O) / 6)²
//   Std deviation   σ  = (P − O) / 6
//
// The project is scheduled with each activity's TE as its CPM duration; the
// project expected duration is the resulting critical-path length and the
// project variance is the sum of variances of the activities on that path.
// Completion probability for a target date T uses the normal approximation
//   z = (T − TE_project) / σ_project ,  P[finish ≤ T] = Φ(z).
//
// LIMITATION: project variance is summed over the flagged critical activities.
// For a single dominant critical chain this is exact; when parallel critical
// chains exist it is conservative (a full probabilistic merge is a later
// refinement). This matches standard PERT textbook practice.
// ─────────────────────────────────────────────────────────────────────────

import type { Dependency } from './model'
import { computeCPM } from './cpm'
import type { CpmResult } from './cpm'

/** Activity with an optional three-point estimate. When O/M/P are all present
 *  the beta estimate drives TE/variance; otherwise `duration` is used with zero
 *  variance (a deterministic activity in an otherwise probabilistic network). */
export interface PertActivityInput {
  id: string
  optimistic?: number
  mostLikely?: number
  pessimistic?: number
  predecessors?: Dependency[]
  /** Fallback deterministic duration when O/M/P are absent (variance 0). */
  duration?: number
}

export interface PertActivityResult {
  id: string
  te: number
  variance: number
  sd: number
}

export interface PertResult {
  activities: Map<string, PertActivityResult>
  /** CPM solve using TE as each activity's duration. */
  cpm: CpmResult
  /** Project expected duration (= critical-path length in TE). */
  projectTe: number
  /** Sum of variances along the critical path. */
  projectVariance: number
  projectSd: number
}

/** Expected time TE = (O + 4M + P) / 6. */
export function pertExpected(o: number, m: number, p: number): number {
  return (o + 4 * m + p) / 6
}

/** Activity variance σ² = ((P − O) / 6)². */
export function pertVariance(o: number, p: number): number {
  return ((p - o) / 6) ** 2
}

/** Activity standard deviation σ = (P − O) / 6. */
export function pertStdDev(o: number, p: number): number {
  return (p - o) / 6
}

/**
 * Solve the PERT network: TE/σ² per activity, a CPM pass on TE durations, and
 * the project expected duration + variance along the critical path.
 */
export function computePert(activities: PertActivityInput[]): PertResult {
  const results = new Map<string, PertActivityResult>()
  const cpmInput = activities.map((a) => {
    const { optimistic: o, mostLikely: m, pessimistic: p } = a
    // Inline null checks so TypeScript narrows O/M/P to `number` in the branch.
    const te = o != null && m != null && p != null ? pertExpected(o, m, p) : (a.duration ?? 0)
    const variance = o != null && p != null ? pertVariance(o, p) : 0
    results.set(a.id, { id: a.id, te, variance, sd: Math.sqrt(variance) })
    return { id: a.id, duration: te, predecessors: a.predecessors }
  })

  const cpm = computeCPM(cpmInput)
  const projectVariance = cpm.criticalPath.reduce(
    (sum, id) => sum + (results.get(id)?.variance ?? 0),
    0,
  )

  return {
    activities: results,
    cpm,
    projectTe: cpm.duration,
    projectVariance,
    projectSd: Math.sqrt(projectVariance),
  }
}

// ── Normal distribution helpers ─────────────────────────────────────────────

/** Gauss error function (Abramowitz & Stegun 7.1.26, |error| ≤ 1.5e-7). */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax)
  return sign * y
}

/** Standard-normal CDF Φ(z) = ½·(1 + erf(z/√2)). */
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2))
}

/**
 * Inverse standard-normal CDF (Peter Acklam's rational approximation,
 * relative error < 1.15e-9 across 0 < p < 1). Returns ±∞ at the limits.
 */
export function invNormalCdf(p: number): number {
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity

  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416]
  const plow = 0.02425
  const phigh = 1 - plow

  let q: number, r: number
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p <= phigh) {
    q = p - 0.5
    r = q * q
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  }
  q = Math.sqrt(-2 * Math.log(1 - p))
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
}

/**
 * Probability the project finishes on or before `targetDuration` (working
 * units on the same axis as `projectTe`). Returns 1 for a zero-variance
 * project that meets the target, 0 if it cannot.
 */
export function completionProbability(pert: PertResult, targetDuration: number): number {
  if (pert.projectSd <= 0) return targetDuration >= pert.projectTe ? 1 : 0
  return normalCdf((targetDuration - pert.projectTe) / pert.projectSd)
}

/**
 * The project duration achievable at a given confidence `prob` (0–1):
 *   T = TE_project + z(prob)·σ_project.
 */
export function durationForProbability(pert: PertResult, prob: number): number {
  return pert.projectTe + invNormalCdf(prob) * pert.projectSd
}
