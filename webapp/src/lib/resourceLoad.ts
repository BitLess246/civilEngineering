// ─────────────────────────────────────────────────────────────────────────
// Resource loading (pure). Spreads each activity's resource assignment evenly
// over its scheduled working-day span (quantity ÷ duration per day) and sums,
// per resource, the daily demand across the project timeline. Flags days where
// demand exceeds the resource's `availablePerDay` (over-allocation).
//
// Times are CPM working-day offsets (integers for whole-day durations); the
// load array is indexed by day offset 0 … duration−1.
// ─────────────────────────────────────────────────────────────────────────

import type { CpmResult } from '../engine/schedule/cpm'
import type { Resource, ActivityResource } from '../engine/schedule/model'

/** Minimal activity shape the loader needs (full `Activity` satisfies it). */
export interface LoadActivity {
  id: string
  duration: number
  resources?: ActivityResource[]
}

export interface ResourceLoad {
  resource: Resource
  /** Daily demand indexed by working-day offset (length = project duration). */
  perDay: number[]
  /** Peak daily demand and the day it occurs. */
  peak: number
  peakDay: number
  /** Number of days demand exceeds availablePerDay (0 when no limit set). */
  overDays: number
  /** availablePerDay, or null when the resource has no stated limit. */
  available: number | null
  /** Total resource-units consumed (Σ assignment quantities across activities). */
  total: number
}

/**
 * Per-resource daily load over [0, duration). A milestone (duration ≤ 0)
 * contributes no daily demand. Activities absent from the CPM result are
 * skipped.
 */
export function resourceLoad(
  activities: LoadActivity[],
  cpm: CpmResult,
  resources: Resource[],
  duration: number,
): ResourceLoad[] {
  const days = Math.max(0, Math.ceil(duration))
  const EPS = 1e-9

  return resources.map((resource) => {
    const perDay = new Array<number>(days).fill(0)
    let total = 0
    for (const a of activities) {
      if (a.duration <= 0) continue
      const assign = (a.resources ?? []).filter((r) => r.resourceId === resource.id)
      if (assign.length === 0) continue
      const c = cpm.activities.get(a.id)
      if (!c) continue
      const qty = assign.reduce((s, r) => s + r.quantity, 0)
      total += qty
      const rate = qty / a.duration                    // units per working day
      const from = Math.max(0, Math.floor(c.es))
      const to = Math.min(days, Math.ceil(c.ef))        // active on [es, ef)
      for (let t = from; t < to; t++) perDay[t] += rate
    }

    let peak = 0, peakDay = 0
    for (let t = 0; t < perDay.length; t++) {
      if (perDay[t] > peak) { peak = perDay[t]; peakDay = t }
    }
    const available = resource.availablePerDay ?? null
    const overDays = available == null ? 0 : perDay.filter((v) => v > available + EPS).length

    return { resource, perDay, peak, peakDay, overDays, available, total }
  })
}

/** True when any resource is over-allocated on any day. */
export function hasOverAllocation(loads: ResourceLoad[]): boolean {
  return loads.some((l) => l.overDays > 0)
}
