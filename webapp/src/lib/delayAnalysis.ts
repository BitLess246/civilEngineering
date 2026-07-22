// ─────────────────────────────────────────────────────────────────────────
// Delay analysis (pure). Compares the live CPM schedule against a captured
// baseline: per-activity start/finish/duration slip (via baseline.ts), flags
// activities that finish later than baseline, and marks a slip CRITICAL when
// the activity sits on the current critical path (i.e. it pushes the project
// finish). Rolls up a project-slip summary.
// ─────────────────────────────────────────────────────────────────────────

import type { ScheduleProject, Baseline } from '../engine/schedule/model'
import type { CpmResult } from '../engine/schedule/cpm'
import { baselineDateVariance } from '../engine/schedule/baseline'

export interface ActivityDelay {
  id: string
  name: string
  /** current − baseline, calendar days (>0 = starts later). */
  startVarianceDays: number
  /** current − baseline, calendar days (>0 = finishes later). */
  finishVarianceDays: number
  /** current − baseline, working days (>0 = longer). */
  durationVariance: number
  critical: boolean
  /** Finishes later than baseline. */
  delayed: boolean
  /** Delayed AND on the critical path — drives the project finish. */
  criticalDelay: boolean
}

export interface DelaySummary {
  activities: ActivityDelay[]
  delayedCount: number
  criticalDelayedCount: number
  /** Project finish slip vs baseline (the current end activity's finish slip), days. */
  projectSlipDays: number
  /** The activity with the greatest finish slip, or null when nothing slipped. */
  worst: ActivityDelay | null
}

/** Analyse delays of the live schedule (`cpm`) against `baseline`. */
export function analyzeDelays(project: ScheduleProject, cpm: CpmResult, baseline: Baseline): DelaySummary {
  const variance = baselineDateVariance(project, baseline)
  const nameOf = new Map(project.activities.map((a) => [a.id, a.name]))

  const activities: ActivityDelay[] = []
  for (const [id, v] of variance) {
    const critical = cpm.activities.get(id)?.critical ?? false
    const delayed = v.finishVarianceDays > 0
    activities.push({
      id, name: nameOf.get(id) ?? id,
      startVarianceDays: v.startVarianceDays,
      finishVarianceDays: v.finishVarianceDays,
      durationVariance: v.durationVariance,
      critical, delayed, criticalDelay: delayed && critical,
    })
  }
  activities.sort((a, b) => b.finishVarianceDays - a.finishVarianceDays)

  // Project slip = the finish slip of the current project-ending activity.
  let endId = '', maxEf = -Infinity
  for (const [id, c] of cpm.activities) if (c.ef > maxEf) { maxEf = c.ef; endId = id }
  const projectSlipDays = variance.get(endId)?.finishVarianceDays ?? 0

  const delayedCount = activities.filter((a) => a.delayed).length
  const criticalDelayedCount = activities.filter((a) => a.criticalDelay).length
  const worst = activities.length && activities[0].finishVarianceDays > 0 ? activities[0] : null

  return { activities, delayedCount, criticalDelayedCount, projectSlipDays, worst }
}
