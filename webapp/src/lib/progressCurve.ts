// ─────────────────────────────────────────────────────────────────────────
// Planned-progress S-curve (pure). Samples the cumulative planned %-complete
// across the project timeline (0 → duration) as the weight-weighted mean of
// each activity's planned fraction. The dashboard overlays the actual %.
// ─────────────────────────────────────────────────────────────────────────

import { plannedFraction } from '../engine/schedule/earnedValue'

export interface CurveItem {
  es: number
  ef: number
  /** Weight (duration or budget) used for the cumulative mean. */
  weight: number
}

export interface CurvePoint {
  /** Working-day offset from project start. */
  t: number
  /** Cumulative planned % complete (0–100) at t. */
  planned: number
}

/**
 * Sample the planned S-curve over [0, duration] at `samples`+1 points. The
 * curve is monotonic non-decreasing, 0 at t=0 and 100 at t=duration.
 */
export function plannedCurve(items: CurveItem[], duration: number, samples = 40): CurvePoint[] {
  const totalW = items.reduce((s, i) => s + i.weight, 0)
  const n = Math.max(1, Math.round(samples))
  const span = Math.max(0, duration)
  const out: CurvePoint[] = []
  for (let k = 0; k <= n; k++) {
    const t = (span * k) / n
    const planned = totalW > 0
      ? (items.reduce((s, i) => s + i.weight * plannedFraction(i.es, i.ef, t), 0) / totalW) * 100
      : 0
    out.push({ t, planned })
  }
  return out
}
