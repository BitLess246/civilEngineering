// ─────────────────────────────────────────────────────────────────────────
// Progress-tracking engine.
//
// Turns per-activity %-complete + actuals + the CPM schedule into activity
// status, a planned-vs-actual roll-up, schedule/forecast metrics and baseline
// variance — the numbers the dashboard, Gantt shading and reports consume.
//
// "Progress" here is duration-weighted (a cost-free schedule-performance view).
// When costs exist, `earnedValue.ts` gives the same shape in currency units.
// All times are on the CPM working-day axis (offset 0 = project start).
// ─────────────────────────────────────────────────────────────────────────

import type { Activity, ActivityStatus } from './model'
import type { CpmResult } from './cpm'
import { plannedFraction, scheduleVarianceTime, type PvActivity } from './earnedValue'

const clampPct = (p: number | undefined): number => Math.min(100, Math.max(0, p ?? 0))

/** Remaining duration = duration · (1 − %complete). */
export function activityRemainingDuration(duration: number, percentComplete: number | undefined): number {
  return duration * (1 - clampPct(percentComplete) / 100)
}

/** Percent an activity *should* be complete at `dataDate`, from its schedule. */
export function plannedPercentComplete(es: number, ef: number, dataDate: number): number {
  return plannedFraction(es, ef, dataDate) * 100
}

/** Duration- (or budget-) weighted mean percent complete. */
export function rollupPercentComplete(items: { weight: number; percentComplete: number }[]): number {
  let num = 0, den = 0
  for (const it of items) { num += it.weight * clampPct(it.percentComplete); den += it.weight }
  return den > 0 ? num / den : 0
}

/** Schedule context for status derivation (from the CPM solve). */
export interface StatusContext {
  dataDate: number
  es: number
  ef: number
}

/**
 * Derive an activity's status from its actuals and the schedule. An explicit
 * `blocked` flag is preserved (it cannot be inferred). Otherwise:
 *   completed  — %≥100 or an actual finish is recorded
 *   delayed    — behind: past its finish unfinished, started but under planned %,
 *                or not started after its planned start
 *   in-progress / not-started otherwise
 */
export function deriveStatus(activity: Activity, ctx: StatusContext): ActivityStatus {
  if (activity.status === 'blocked') return 'blocked'
  const pct = clampPct(activity.percentComplete)
  if (pct >= 100 || activity.actualFinish) return 'completed'

  const started = pct > 0 || !!activity.actualStart
  const eps = 1e-6
  if (started) {
    if (ctx.dataDate > ctx.ef + eps) return 'delayed'          // should have finished
    const planned = plannedPercentComplete(ctx.es, ctx.ef, ctx.dataDate)
    return pct + eps < planned ? 'delayed' : 'in-progress'
  }
  return ctx.dataDate > ctx.es + eps ? 'delayed' : 'not-started'
}

/** Per-activity progress row (schedule + actual + derived status). */
export interface ActivityProgress {
  id: string
  es: number
  ef: number
  duration: number
  percentComplete: number
  plannedPercent: number
  remainingDuration: number
  critical: boolean
  status: ActivityStatus
}

/** Project-level dashboard summary. */
export interface ProjectProgress {
  /** Planned % complete at the data date (duration-weighted). */
  plannedPercent: number
  /** Actual % complete (duration-weighted). */
  actualPercent: number
  /** actualPercent − plannedPercent (>0 ahead). */
  scheduleVariancePercent: number
  /** Duration-based schedule performance index EV/PV (null when nothing planned). */
  spi: number | null
  /** Earned-schedule time variance at the data date, working days (>0 ahead). */
  daysAheadBehind: number
  /** Baseline (planned) project duration = CPM critical-path length. */
  plannedDuration: number
  /** SPI-forecast duration = plannedDuration / SPI. */
  forecastDuration: number
  /** Total remaining duration across activities. */
  remainingDuration: number
  total: number
  completed: number
  inProgress: number
  notStarted: number
  delayed: number
  blocked: number
  critical: number
  activities: ActivityProgress[]
}

/**
 * Roll activities + the CPM solve up into a dashboard summary at `dataDate`.
 * Activities absent from the CPM result (unknown ids) are skipped.
 */
export function projectProgress(
  activities: Activity[],
  cpm: CpmResult,
  dataDate: number,
): ProjectProgress {
  const rows: ActivityProgress[] = []
  const pvActs: PvActivity[] = []
  let plannedWork = 0, earnedWork = 0, totalWork = 0, remaining = 0
  let completed = 0, inProgress = 0, notStarted = 0, delayed = 0, blocked = 0, critical = 0

  for (const a of activities) {
    const c = cpm.activities.get(a.id)
    if (!c) continue
    const pct = clampPct(a.percentComplete)
    const planned = plannedPercentComplete(c.es, c.ef, dataDate)
    const status = deriveStatus(a, { dataDate, es: c.es, ef: c.ef })
    const rem = activityRemainingDuration(a.duration, pct)

    rows.push({
      id: a.id, es: c.es, ef: c.ef, duration: a.duration,
      percentComplete: pct, plannedPercent: planned, remainingDuration: rem,
      critical: c.critical, status,
    })

    const w = a.duration
    plannedWork += w * (planned / 100)
    earnedWork += w * (pct / 100)
    totalWork += w
    remaining += rem
    pvActs.push({ es: c.es, ef: c.ef, bac: w })

    if (c.critical) critical++
    switch (status) {
      case 'completed': completed++; break
      case 'in-progress': inProgress++; break
      case 'not-started': notStarted++; break
      case 'delayed': delayed++; break
      case 'blocked': blocked++; break
    }
  }

  const plannedPercent = totalWork > 0 ? (plannedWork / totalWork) * 100 : 0
  const actualPercent = totalWork > 0 ? (earnedWork / totalWork) * 100 : 0
  const spi = plannedWork > 0 ? earnedWork / plannedWork : null
  const forecastDuration = spi && spi > 0 ? cpm.duration / spi : cpm.duration
  const daysAheadBehind = scheduleVarianceTime(pvActs, earnedWork, dataDate, cpm.duration)

  return {
    plannedPercent, actualPercent,
    scheduleVariancePercent: actualPercent - plannedPercent,
    spi, daysAheadBehind,
    plannedDuration: cpm.duration, forecastDuration, remainingDuration: remaining,
    total: rows.length, completed, inProgress, notStarted, delayed, blocked, critical,
    activities: rows,
  }
}

// ── Baseline variance ───────────────────────────────────────────────────────

/** A start/finish/duration snapshot (working-day offsets, or day counts). */
export interface ScheduleSnapshot {
  start: number
  finish: number
  duration: number
}

export interface BaselineVariance {
  /** current.start − baseline.start (>0 = starts later than baseline). */
  startVariance: number
  /** current.finish − baseline.finish (>0 = finishes later). */
  finishVariance: number
  /** current.duration − baseline.duration (>0 = longer). */
  durationVariance: number
}

/** Compare a current snapshot against its baseline (current − baseline). */
export function baselineVariance(current: ScheduleSnapshot, baseline: ScheduleSnapshot): BaselineVariance {
  return {
    startVariance: current.start - baseline.start,
    finishVariance: current.finish - baseline.finish,
    durationVariance: current.duration - baseline.duration,
  }
}
