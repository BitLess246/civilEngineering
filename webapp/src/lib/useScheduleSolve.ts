import { useMemo } from 'react'
import type { ScheduleProject, WorkingCalendar } from '../engine/schedule/model'
import { computeCPM, type CpmResult } from '../engine/schedule/cpm'
import { validateProject, type ValidationIssue } from '../engine/schedule/validate'
import { parseISO, toISO, offsetToDate, durationEndDate, defaultCalendar } from '../engine/schedule/calendar'

// Shared derived state for the scheduling views: validate → (if clean) run CPM →
// project the working-day offsets onto calendar dates. Guards the cycle/unknown-
// predecessor cases so a half-built project never throws in the UI.

export interface ActivityDates {
  start: string
  finish: string
}

export interface ScheduleSolve {
  /** True when no error-level issues blocked the solve and CPM ran. */
  ok: boolean
  issues: ValidationIssue[]
  errorCount: number
  warningCount: number
  cpm: CpmResult | null
  /** Per-activity ISO start/finish dates (empty when not solved). */
  dates: Map<string, ActivityDates>
  /** Project finish date (latest activity finish), or null. */
  finishDate: string | null
  /** Project duration in working days. */
  duration: number
}

const EMPTY = (issues: ValidationIssue[]): ScheduleSolve => ({
  ok: false,
  issues,
  errorCount: issues.filter((i) => i.severity === 'error').length,
  warningCount: issues.filter((i) => i.severity === 'warning').length,
  cpm: null,
  dates: new Map(),
  finishDate: null,
  duration: 0,
})

function projectCalendar(project: ScheduleProject): WorkingCalendar {
  return project.calendars.find((c) => c.id === project.defaultCalendarId) ?? defaultCalendar(project.defaultCalendarId)
}

export function solveSchedule(project: ScheduleProject): ScheduleSolve {
  const issues = validateProject(project)
  if (issues.some((i) => i.severity === 'error')) return EMPTY(issues)

  try {
    const cpm = computeCPM(project.activities)
    const cal = projectCalendar(project)
    const start = parseISO(project.meta.start)
    const dates = new Map<string, ActivityDates>()
    let finish = start

    for (const a of project.activities) {
      const c = cpm.activities.get(a.id)
      if (!c) continue
      const s = offsetToDate(cal, start, c.es)
      const f = a.duration <= 0 ? s : durationEndDate(cal, s, a.duration)
      dates.set(a.id, { start: toISO(s), finish: toISO(f) })
      if (f.getTime() > finish.getTime()) finish = f
    }

    return {
      ok: true,
      issues,
      errorCount: 0,
      warningCount: issues.length,
      cpm,
      dates,
      finishDate: project.activities.length ? toISO(finish) : null,
      duration: cpm.duration,
    }
  } catch {
    return EMPTY(issues)   // defensive: unexpected solve failure
  }
}

export function useScheduleSolve(project: ScheduleProject | null): ScheduleSolve {
  return useMemo(() => (project ? solveSchedule(project) : EMPTY([])), [project])
}
