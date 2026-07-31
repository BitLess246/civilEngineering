// ─────────────────────────────────────────────────────────────────────────
// Shared chart geometry for the soils module. Layer 8.
//
// Axis frames, round ticks and annotation plates, factored out of the
// laboratory plots so the liquefaction profile draws on the same furniture
// rather than growing its own. Duplicating an axis routine is how two charts
// in one report end up with different tick conventions — the module has
// already made the one-rule-two-homes mistake three times (see `soilFamily`),
// and this is the same mistake in drawing form.
//
// Everything here is pure geometry over `PlanPrimitive`; `planToSvg` paints.
//
// CONVENTIONS every soils chart follows:
//   • log data gets a log axis
//   • linear axes get 1–2–5 round ticks
//   • extrapolation beyond the data is dashed, never solid
//   • annotations sit on an opaque plate, in a corner the data cannot reach
//
// UNITS: chart coordinates are millimetres of paper, as with the borehole log.
// ─────────────────────────────────────────────────────────────────────────

import type { PlanPrimitive } from '../planRenderer'

export const AXIS = '#334155'
export const GRID = '#e2e8f0'
export const INK = '#0f172a'
export const ACCENT = '#0056b3'
export const WARN = '#b45309'
export const DANGER = '#b91c1c'
export const OK = '#047857'

export interface ChartBox {
  /** Plot area, mm of paper. */
  w: number
  h: number
  left: number
  top: number
}

export const BOX: ChartBox = { w: 96, h: 62, left: 18, top: 8 }

/** Nice round decade ticks spanning [lo, hi] on a log axis. */
export function decadeTicks(lo: number, hi: number): number[] {
  if (!(lo > 0) || !(hi > lo)) return []
  const out: number[] = []
  const first = Math.floor(Math.log10(lo))
  const last = Math.ceil(Math.log10(hi))
  for (let d = first; d <= last; d++) {
    for (const m of [1, 2, 5]) {
      const v = m * Math.pow(10, d)
      if (v >= lo / 1.001 && v <= hi * 1.001) out.push(v)
    }
  }
  return out
}

/**
 * `raw` rounded to the NEAREST step in the 1–2–5 series.
 *
 * Nearest, not up: rounding a raw step of 57.5 up to 100 leaves an axis with
 * three labels on it, which is not more readable than the arithmetic it was
 * meant to replace.
 */
function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const f = raw / mag
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag
}

/** Decimal places that print `step` exactly, so a 0.05 step is not labelled "0". */
export function tickDp(step: number): number {
  for (let d = 0; d < 6; d++) {
    const scaled = step * Math.pow(10, d)
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9) return d
  }
  return 6
}

/**
 * Round ticks for a LINEAR axis spanning [lo, hi], with both ends snapped out
 * to a multiple of the step.
 *
 * Dividing the data range into four equal parts is arithmetically fine and
 * reads as an error: an envelope labelled 57 / 115 / 172 / 230 kPa is not a
 * chart anyone draws, and a reader trying to place a 150 kPa footing stress on
 * it has to do mental arithmetic against the axis instead of reading it.
 */
export function linearTicks(lo: number, hi: number, target = 4): { lo: number; hi: number; ticks: number[] } {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || !(hi > lo)) return { lo: 0, hi: 1, ticks: [] }
  const step = niceStep((hi - lo) / target)
  const from = Math.floor(lo / step + 1e-9) * step
  const to = Math.ceil(hi / step - 1e-9) * step
  const dp = tickDp(step)
  const ticks: number[] = []
  for (let k = 0; from + k * step <= to + step * 1e-6; k++) {
    ticks.push(Number((from + k * step).toFixed(dp + 2)))
  }
  return { lo: from, hi: to, ticks }
}

/**
 * An annotation block on an opaque plate.
 *
 * Grid lines and boundary markers run behind these, and a dashed boundary
 * struck through "sand 86%" is exactly the detail that makes a printed sheet
 * look careless. The width is estimated from the character count, which is
 * approximate but only ever slightly generous.
 *
 * The plate is opaque, so where it goes matters: each caller puts it in the
 * corner its own data cannot reach. A grading curve and an e–log σ′ curve both
 * descend left to right (bottom-left is free); a failure envelope ascends
 * (top-left is free). Those are properties of the plots, not of the fixtures.
 */
export function plate(
  x: number, y: number, size: number, lines: { text: string; color?: string }[],
): PlanPrimitive[] {
  const gap = size * 1.5
  const w = Math.max(...lines.map((l) => l.text.length)) * size * 0.52 + 1.4
  const h = (lines.length - 1) * gap + size * 1.9
  const out: PlanPrimitive[] = [{ kind: 'rect', x: x - 0.7, y: y - size * 0.95, w, h, fill: '#ffffff' }]
  lines.forEach((l, i) => out.push({
    kind: 'text', x, y: y + i * gap, text: l.text, size, color: l.color ?? INK,
  }))
  return out
}

/** Axis frame plus labels. */
export function frame(
  box: ChartBox, xLabel: string, yLabel: string, title: string,
): PlanPrimitive[] {
  const { left, top, w, h } = box
  return [
    { kind: 'text', x: left, y: top - 2.5, text: title, size: 3.2, weight: 700, color: ACCENT },
    { kind: 'line', x1: left, y1: top, x2: left, y2: top + h, stroke: AXIS, width: 0.4 },
    { kind: 'line', x1: left, y1: top + h, x2: left + w, y2: top + h, stroke: AXIS, width: 0.4 },
    { kind: 'text', x: left + w / 2, y: top + h + 9, text: xLabel, size: 2.6, anchor: 'middle', color: AXIS },
    {
      kind: 'text', x: left - 13, y: top + h / 2, text: yLabel, size: 2.6,
      anchor: 'middle', rotate: -90, color: AXIS,
    },
  ]
}
