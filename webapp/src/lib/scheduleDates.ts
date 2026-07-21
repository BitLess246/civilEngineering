// ─────────────────────────────────────────────────────────────────────────
// Schedule date↔offset conversions (pure). Keeps the dashboard (and later the
// reports) on ONE convention that agrees with `useScheduleSolve.finishDate` /
// `calendar.durationEndDate`: a schedule of D working days finishes on the
// INCLUSIVE last worked day = offset D−1, and a data date is measured as the
// working days ELAPSED through the end of that date. Reconciling these two
// removes the "complete project reads ahead" / "on-time reads late" off-by-ones.
// ─────────────────────────────────────────────────────────────────────────

import type { WorkingCalendar } from '../engine/schedule/model'
import { parseISO, toISO, addDays, offsetToDate, workingDaysBetween } from '../engine/schedule/calendar'

/** Guard against a pathological forecast (tiny SPI) looping over huge offsets. */
const MAX_OFFSET = 366 * 20

/**
 * Working-day offset for a data date, counted INCLUSIVELY through the end of
 * that date (elapsed working days). At the schedule's last working day this
 * equals the project duration D, so a fully-complete schedule reads 100 %
 * planned. Dates before the project start clamp to 0.
 */
export function dataDateOffset(cal: WorkingCalendar, startIso: string, dataDateIso: string): number {
  const start = parseISO(startIso)
  const day = parseISO(dataDateIso)
  if (day.getTime() < start.getTime()) return 0
  return workingDaysBetween(cal, start, addDays(day, 1))
}

/**
 * Calendar finish date for a schedule of `duration` working days — the
 * INCLUSIVE last worked day (offset duration−1), mirroring
 * `calendar.durationEndDate` and `useScheduleSolve.finishDate`. So an
 * on-schedule forecast (SPI = 1 ⇒ forecastDuration = D) lands exactly on the
 * planned finish rather than one working day late.
 */
export function forecastFinishISO(cal: WorkingCalendar, startIso: string, duration: number): string {
  const offset = Math.min(MAX_OFFSET, Math.max(0, Math.round(duration) - 1))
  return toISO(offsetToDate(cal, parseISO(startIso), offset))
}
