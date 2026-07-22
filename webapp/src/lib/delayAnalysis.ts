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
import { parseISO, calendarDaysBetween } from '../engine/schedule/calendar'

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

/** Analyse delays of the live schedule against `baseline`. `currentFinishIso` is
 *  the live project finish date (e.g. `useScheduleSolve.finishDate`). */
export function analyzeDelays(project: ScheduleProject, cpm: CpmResult, baseline: Baseline, currentFinishIso: string): DelaySummary {
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

  // Project slip = current project finish − baseline project finish, in calendar
  // days. Measured over ALL finishes (not one governing activity's own row), so
  // it stays correct when the tail activity changes identity vs the baseline or
  // the current end activity postdates the baseline. ISO dates compare in order.
  const baselineFinishes = Object.values(baseline.activities).map((e) => e.finish)
  const baselineFinishIso = baselineFinishes.length
    ? baselineFinishes.reduce((a, b) => (b > a ? b : a))
    : currentFinishIso
  const projectSlipDays = calendarDaysBetween(parseISO(baselineFinishIso), parseISO(currentFinishIso))

  const delayedCount = activities.filter((a) => a.delayed).length
  const criticalDelayedCount = activities.filter((a) => a.criticalDelay).length
  const worst = activities.length && activities[0].finishVarianceDays > 0 ? activities[0] : null

  return { activities, delayedCount, criticalDelayedCount, projectSlipDays, worst }
}
