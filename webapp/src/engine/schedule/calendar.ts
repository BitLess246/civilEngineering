// ─────────────────────────────────────────────────────────────────────────
// Working-calendar date arithmetic for the scheduling engine.
//
// The CPM engine solves on an abstract working-day axis (offset 0 = the project
// start). This module projects those integer offsets onto real calendar dates,
// skipping non-working weekdays and holidays, and reports working days between
// two dates (used by progress / earned-value math).
//
// All dates are handled at UTC midnight to stay free of timezone / DST drift;
// a date is a pure calendar day. ISO strings are 'YYYY-MM-DD'.
// ─────────────────────────────────────────────────────────────────────────

import type { WorkingCalendar } from './model'

/** Sun…Sat working flags for a Monday–Friday week. */
export const MON_FRI: boolean[] = [false, true, true, true, true, true, false]
/** Sun…Sat working flags for a Monday–Saturday week (common on site). */
export const MON_SAT: boolean[] = [false, true, true, true, true, true, true]

const MS_PER_DAY = 86_400_000
/** Guard against an all-non-working calendar spinning forever. */
const MAX_SCAN_DAYS = 366 * 20

/** Parse an ISO 'YYYY-MM-DD' date to a UTC-midnight Date. */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
}

/** Format a UTC Date as ISO 'YYYY-MM-DD'. */
export function toISO(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** A new Date `n` calendar days after `date` (n may be negative). */
export function addDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * MS_PER_DAY)
}

/** Whole calendar days from `from` to `to` (`to − from`), sign-preserving. */
export function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY)
}

/** True when `date` is a worked weekday and not a holiday on `cal`. */
export function isWorkingDay(cal: WorkingCalendar, date: Date): boolean {
  if (!cal.workweek[date.getUTCDay()]) return false
  return !cal.holidays.includes(toISO(date))
}

function ensureWorkable(cal: WorkingCalendar): void {
  if (!cal.workweek.some(Boolean)) {
    throw new Error(`Calendar "${cal.name}" has no working weekdays.`)
  }
}

/** The first working day on or after `date`. */
export function nextWorkingDay(cal: WorkingCalendar, date: Date): Date {
  ensureWorkable(cal)
  let d = date
  for (let i = 0; i < MAX_SCAN_DAYS; i++) {
    if (isWorkingDay(cal, d)) return d
    d = addDays(d, 1)
  }
  throw new Error(`Calendar "${cal.name}": no working day within ${MAX_SCAN_DAYS} days.`)
}

/** The first working day on or before `date`. */
export function prevWorkingDay(cal: WorkingCalendar, date: Date): Date {
  ensureWorkable(cal)
  let d = date
  for (let i = 0; i < MAX_SCAN_DAYS; i++) {
    if (isWorkingDay(cal, d)) return d
    d = addDays(d, -1)
  }
  throw new Error(`Calendar "${cal.name}": no working day within ${MAX_SCAN_DAYS} days.`)
}

/**
 * The date `n` working days after `start`. `start` is first snapped forward to a
 * working day, which counts as working-day 0; so `addWorkingDays(cal, w, 0)`
 * returns `w` when `w` is a working day, and each unit steps to the next
 * working day. `n` must be ≥ 0.
 */
export function addWorkingDays(cal: WorkingCalendar, start: Date, n: number): Date {
  if (n < 0) throw new Error('addWorkingDays: n must be ≥ 0')
  let d = nextWorkingDay(cal, start)
  let remaining = Math.round(n)
  while (remaining > 0) {
    d = nextWorkingDay(cal, addDays(d, 1))
    remaining--
  }
  return d
}

/** Count of working days in the half-open interval [from, to). Zero when to ≤ from. */
export function workingDaysBetween(cal: WorkingCalendar, from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0
  let count = 0
  let d = from
  for (let i = 0; i < MAX_SCAN_DAYS && d.getTime() < to.getTime(); i++) {
    if (isWorkingDay(cal, d)) count++
    d = addDays(d, 1)
  }
  return count
}

/**
 * Map a CPM working-day `offset` (0 = project start) to a calendar date on
 * `cal`. Offset 0 resolves to the first working day on or after `projectStart`.
 */
export function offsetToDate(cal: WorkingCalendar, projectStart: Date, offset: number): Date {
  return addWorkingDays(cal, projectStart, Math.max(0, offset))
}

/**
 * The inclusive last working day of an activity that starts on `startDate` and
 * spans `duration` working days. A milestone (duration ≤ 0) returns the snapped
 * start day itself.
 */
export function durationEndDate(cal: WorkingCalendar, startDate: Date, duration: number): Date {
  const start = nextWorkingDay(cal, startDate)
  if (duration <= 0) return start
  return addWorkingDays(cal, start, Math.round(duration) - 1)
}

/** A default Mon–Fri calendar with no holidays. */
export function defaultCalendar(id = 'default', name = 'Standard (Mon–Fri)'): WorkingCalendar {
  return { id, name, workweek: [...MON_FRI], holidays: [], hoursPerDay: 8 }
}
