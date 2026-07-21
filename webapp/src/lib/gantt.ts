// ─────────────────────────────────────────────────────────────────────────
// Gantt timeline geometry (pure). Maps ISO calendar dates onto horizontal
// pixels at a chosen zoom, and generates axis ticks. No React — the page
// consumes this to place bars, milestones, the data-date line and tick labels.
//
// A bar spans its start day through its finish day INCLUSIVE, so a same-day
// (1-day) task is one day wide and a milestone collapses to a point.
// ─────────────────────────────────────────────────────────────────────────

import { parseISO, addDays } from '../engine/schedule/calendar'

const DAY = 86_400_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type ZoomLevel = 'day' | 'week' | 'month' | 'quarter' | 'year'
export type TickUnit = 'day' | 'week' | 'month' | 'quarter'

export interface ZoomConfig { pxPerDay: number; tick: TickUnit }

/** Pixels-per-day + tick granularity for each zoom preset. */
export const ZOOM: Record<ZoomLevel, ZoomConfig> = {
  day: { pxPerDay: 26, tick: 'day' },
  week: { pxPerDay: 11, tick: 'week' },
  month: { pxPerDay: 3.4, tick: 'month' },
  quarter: { pxPerDay: 1.5, tick: 'quarter' },
  year: { pxPerDay: 0.7, tick: 'quarter' },
}

export const ZOOM_LEVELS: ZoomLevel[] = ['day', 'week', 'month', 'quarter', 'year']

export interface GanttScale {
  origin: Date
  pxPerDay: number
  totalDays: number
  totalWidth: number
  /** Whole days from the timeline origin to `iso`. */
  dayOffset(iso: string): number
  /** Left pixel of the start of day `iso`. */
  x(iso: string): number
  /** Bar width in px for [startIso, finishIso] inclusive (≥ one day / a floor). */
  barWidth(startIso: string, finishIso: string): number
}

/** Build a scale spanning [startIso, finishIso] with `pad` days on each side. */
export function buildScale(startIso: string, finishIso: string, pxPerDay: number, pad = 2): GanttScale {
  const origin = addDays(parseISO(startIso), -pad)
  const end = addDays(parseISO(finishIso), pad)
  const originMs = origin.getTime()
  const totalDays = Math.max(1, Math.round((end.getTime() - originMs) / DAY) + 1)
  const dayOffset = (iso: string) => Math.round((parseISO(iso).getTime() - originMs) / DAY)
  const minBar = Math.max(pxPerDay, 3)
  return {
    origin, pxPerDay, totalDays, totalWidth: totalDays * pxPerDay,
    dayOffset,
    x: (iso) => dayOffset(iso) * pxPerDay,
    barWidth: (s, f) => {
      const days = Math.round((parseISO(f).getTime() - parseISO(s).getTime()) / DAY) + 1
      return Math.max(minBar, days * pxPerDay)
    },
  }
}

export interface GanttTick { x: number; label: string; major: boolean }

/** Axis ticks at the given granularity, positioned on the scale. */
export function buildTicks(scale: GanttScale, unit: TickUnit): GanttTick[] {
  const ticks: GanttTick[] = []
  const originMs = scale.origin.getTime()
  const endMs = originMs + scale.totalDays * DAY
  // Clamp to ≥0 so the period CONTAINING the (padded) origin is labelled at the
  // left edge instead of being dropped off-screen.
  const push = (dt: Date, label: string, major: boolean) =>
    ticks.push({ x: Math.max(0, Math.round((dt.getTime() - originMs) / DAY) * scale.pxPerDay), label, major })

  if (unit === 'day') {
    for (let t = originMs; t < endMs; t += DAY) {
      const dt = new Date(t)
      push(dt, String(dt.getUTCDate()), dt.getUTCDate() === 1)
    }
  } else if (unit === 'week') {
    let dt = new Date(originMs)
    while (dt.getUTCDay() !== 1) dt = new Date(dt.getTime() + DAY) // first Monday
    for (; dt.getTime() < endMs; dt = new Date(dt.getTime() + 7 * DAY)) {
      push(dt, `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCDate()}`, dt.getUTCDate() <= 7)
    }
  } else if (unit === 'month') {
    // Start at the first of the month CONTAINING origin (clamped to x=0 above).
    let dt = new Date(Date.UTC(scale.origin.getUTCFullYear(), scale.origin.getUTCMonth(), 1))
    for (; dt.getTime() < endMs; dt = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1))) {
      const jan = dt.getUTCMonth() === 0
      push(dt, jan ? `${MONTHS[0]} ${dt.getUTCFullYear()}` : MONTHS[dt.getUTCMonth()], jan)
    }
  } else {
    // quarter — start at the quarter CONTAINING origin (clamped to x=0 above).
    const m0 = Math.floor(scale.origin.getUTCMonth() / 3) * 3
    let dt = new Date(Date.UTC(scale.origin.getUTCFullYear(), m0, 1))
    for (; dt.getTime() < endMs; dt = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 3, 1))) {
      const q = Math.floor(dt.getUTCMonth() / 3) + 1
      push(dt, `Q${q} '${String(dt.getUTCFullYear()).slice(2)}`, dt.getUTCMonth() === 0)
    }
  }
  return ticks
}
