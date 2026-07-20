// ─────────────────────────────────────────────────────────────────────────
// Baseline management — capture the current schedule as dated snapshots and
// compare a live schedule against a stored baseline (start/finish/duration
// variance in calendar days). Bridges the numeric CPM offsets (`progress.ts`)
// to the ISO dates stored on a `Baseline`.
// ─────────────────────────────────────────────────────────────────────────

import type { Baseline, ScheduleProject, WorkingCalendar } from './model'
import { computeCPM } from './cpm'
import { parseISO, toISO, offsetToDate, durationEndDate, calendarDaysBetween, defaultCalendar } from './calendar'

function projectCalendar(project: ScheduleProject): WorkingCalendar {
  return project.calendars.find((c) => c.id === project.defaultCalendarId) ?? defaultCalendar(project.defaultCalendarId)
}

/**
 * Capture the project's current CPM schedule as a `Baseline`: per-activity
 * planned start/finish (calendar dates) and duration. Milestones record the
 * same start and finish date.
 */
export function captureBaseline(
  project: ScheduleProject,
  id: string,
  name: string,
  createdAt = new Date().toISOString(),
): Baseline {
  const cpm = computeCPM(project.activities)
  const cal = projectCalendar(project)
  const start = parseISO(project.meta.start)

  const activities: Baseline['activities'] = {}
  for (const act of project.activities) {
    const c = cpm.activities.get(act.id)
    if (!c) continue
    const startDate = offsetToDate(cal, start, c.es)
    const finishDate = act.duration <= 0 ? startDate : durationEndDate(cal, startDate, act.duration)
    activities[act.id] = { start: toISO(startDate), finish: toISO(finishDate), duration: act.duration }
  }
  return { id, name, createdAt, activities }
}

export interface DateVariance {
  /** current start − baseline start, calendar days (>0 = starts later). */
  startVarianceDays: number
  /** current finish − baseline finish, calendar days (>0 = finishes later). */
  finishVarianceDays: number
  /** current duration − baseline duration, working days (>0 = longer). */
  durationVariance: number
}

/**
 * Compare the project's live CPM schedule against a stored baseline. Returns a
 * per-activity variance map; activities absent from either side are skipped.
 */
export function baselineDateVariance(
  project: ScheduleProject,
  baseline: Baseline,
): Map<string, DateVariance> {
  const cpm = computeCPM(project.activities)
  const cal = projectCalendar(project)
  const start = parseISO(project.meta.start)
  const out = new Map<string, DateVariance>()

  for (const act of project.activities) {
    const base = baseline.activities[act.id]
    const c = cpm.activities.get(act.id)
    if (!base || !c) continue
    const curStart = offsetToDate(cal, start, c.es)
    const curFinish = act.duration <= 0 ? curStart : durationEndDate(cal, curStart, act.duration)
    out.set(act.id, {
      startVarianceDays: calendarDaysBetween(parseISO(base.start), curStart),
      finishVarianceDays: calendarDaysBetween(parseISO(base.finish), curFinish),
      durationVariance: act.duration - base.duration,
    })
  }
  return out
}
