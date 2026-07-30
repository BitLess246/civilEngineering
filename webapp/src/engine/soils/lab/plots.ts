// ─────────────────────────────────────────────────────────────────────────
// Laboratory-test charts — pure geometry. Layer 8.
//
// Three tests in this module produce a number that an engineer traditionally
// reads OFF A GRAPH, and until now the module printed the number and told the
// reader to "check it against the plotted curve" while providing no curve:
//
//   • the direct-shear failure envelope — is the line straight, or is one
//     specimen an outlier?
//   • the e–log σ′ consolidation curve — is the break where the fit put it?
//   • the grain-size distribution — the shape, not just D10/D30/D60.
//
// A stated caveat that cannot be acted on is worse than no caveat: it looks
// like diligence while leaving the reader exactly where they were. So these
// emit the same typed `PlanPrimitive` list the borehole log and the structural
// drawings use, and `planToSvg` paints them.
//
// LOG AXES ARE DRAWN AS LOG AXES. Both the consolidation curve and the grading
// curve span orders of magnitude, and a linear axis on either is not merely
// ugly — it hides the straight-line behaviour the whole reading depends on.
//
// UNITS: chart coordinates are millimetres of paper, as with the borehole log.
// ─────────────────────────────────────────────────────────────────────────

import type { PlanPrimitive, Drawing } from '../../planRenderer'
import type { DirectShearResult } from './directShear'
import type { ConsolidationResult } from './consolidation'
import type { GradationResult } from '../sieve'

const AXIS = '#334155'
const GRID = '#e2e8f0'
const INK = '#0f172a'
const ACCENT = '#0056b3'
const WARN = '#b45309'

export interface ChartBox {
  /** Plot area, mm of paper. */
  w: number
  h: number
  left: number
  top: number
}

const BOX: ChartBox = { w: 96, h: 62, left: 18, top: 8 }

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
 * Grid lines and the D2487 fraction boundaries run behind these, and a dashed
 * boundary struck through "sand 86%" is exactly the detail that makes a printed
 * sheet look careless. The width is estimated from the character count, which
 * is approximate but only ever slightly generous.
 *
 * The plate is opaque, so where it goes matters: each caller puts it in the
 * corner its own curve cannot reach. A grading curve and an e–log σ′ curve both
 * descend left to right (bottom-left is free); a failure envelope ascends
 * (top-left is free). Those are properties of the plots, not of the fixtures.
 */
function plate(
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

/** Axis frame plus labels. Shared by all three charts. */
function frame(
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

// ── Direct shear ──────────────────────────────────────────────────────────

/**
 * Failure envelope with the specimens plotted on it. The point of drawing this
 * is to make an outlier visible — an R² of 0.93 says something is off but not
 * WHICH point, and a straight line through three dots answers that instantly.
 */
export function shearEnvelopeChart(r: DirectShearResult, points: { normalStress: number; peakShear: number }[]): Drawing {
  const box = BOX
  const p: PlanPrimitive[] = frame(box, "σ'n  (kPa)", 'τ  (kPa)', 'Failure envelope')

  const tan = Math.tan((r.peak.frictionAngle * Math.PI) / 180)
  const tau = (s: number) => r.peak.cohesion + s * tan

  // Both axes start at the ORIGIN: c′ is the intercept at σ′n = 0, so an axis
  // that begins part-way up hides the quantity the chart exists to show.
  //
  // The vertical range covers the ENVELOPE at the right-hand edge, not just the
  // specimens — the extrapolated segment is drawn all the way across, and an
  // axis sized to the data alone sends it off the top of the frame.
  const xa = linearTicks(0, Math.max(...points.map((q) => q.normalStress), r.stressRange.max) * 1.1)
  const xMax = xa.hi
  const ya = linearTicks(0, Math.max(...points.map((q) => q.peakShear), r.peak.cohesion, tau(xMax)))
  const yMax = ya.hi
  const X = (v: number) => box.left + (v / xMax) * box.w
  const Y = (v: number) => box.top + box.h - (v / yMax) * box.h

  for (const t of xa.ticks) {
    if (t <= 0) continue
    p.push({ kind: 'line', x1: X(t), y1: box.top, x2: X(t), y2: box.top + box.h, stroke: GRID, width: 0.2 })
    p.push({ kind: 'text', x: X(t), y: box.top + box.h + 4, text: String(t), size: 2.2, anchor: 'middle', color: AXIS })
  }
  for (const t of ya.ticks) {
    if (t <= 0) continue
    p.push({ kind: 'line', x1: box.left, y1: Y(t), x2: box.left + box.w, y2: Y(t), stroke: GRID, width: 0.2 })
    p.push({ kind: 'text', x: box.left - 1.5, y: Y(t) + 0.8, text: String(t), size: 2.2, anchor: 'end', color: AXIS })
  }

  // The fitted line across the whole axis, dashed outside the tested range so
  // extrapolation is visible rather than implied.
  p.push({
    kind: 'line',
    x1: X(r.stressRange.min), y1: Y(tau(r.stressRange.min)),
    x2: X(r.stressRange.max), y2: Y(tau(r.stressRange.max)),
    stroke: ACCENT, width: 0.6,
  })
  p.push({
    kind: 'line',
    x1: X(r.stressRange.max), y1: Y(tau(r.stressRange.max)),
    x2: X(xMax), y2: Y(tau(xMax)),
    stroke: ACCENT, width: 0.4, dash: [2, 1.5],
  })
  if (r.stressRange.min > 0) {
    p.push({
      kind: 'line', x1: X(0), y1: Y(tau(0)), x2: X(r.stressRange.min), y2: Y(tau(r.stressRange.min)),
      stroke: ACCENT, width: 0.4, dash: [2, 1.5],
    })
  }

  for (const q of points) {
    p.push({ kind: 'circle', cx: X(q.normalStress), cy: Y(q.peakShear), r: 1.1, fill: INK })
  }

  p.push(...plate(box.left + 2, box.top + 4, 2.4, [
    { text: `c' = ${r.peak.cohesion.toFixed(1)} kPa   φ' = ${r.peak.frictionAngle.toFixed(1)}°   R² = ${r.peak.r2.toFixed(3)}` },
    ...(r.peak.r2 < 0.95
      ? [{ text: 'poor fit — check for an outlier or a curved envelope', color: WARN }]
      : []),
  ]))

  return {
    primitives: p,
    bounds: { minX: 0, minY: 0, maxX: box.left + box.w + 4, maxY: box.top + box.h + 13 },
  }
}

// ── Consolidation ─────────────────────────────────────────────────────────

/**
 * e–log σ′ with the fitted break marked. The note on the result says "check it
 * against the plotted curve"; this is that curve.
 */
export function consolidationChart(r: ConsolidationResult): Drawing {
  const box = BOX
  const p: PlanPrimitive[] = frame(box, "σ'  (kPa, log)", 'void ratio  e', 'e – log σ′')

  const rows = r.rows.filter((x) => x.stress > 0)
  if (!rows.length) return { primitives: p, bounds: { minX: 0, minY: 0, maxX: box.left + box.w + 4, maxY: box.top + box.h + 13 } }

  const sLo = rows[0].stress / 1.6
  const sHi = rows[rows.length - 1].stress * 1.6
  const eLo = Math.min(...rows.map((x) => x.voidRatio))
  const eHi = Math.max(...rows.map((x) => x.voidRatio))
  const ePad = Math.max((eHi - eLo) * 0.08, 0.005)
  const ea = linearTicks(eLo - ePad, eHi + ePad)
  const eDp = tickDp((ea.hi - ea.lo) / Math.max(ea.ticks.length - 1, 1))

  const X = (v: number) =>
    box.left + ((Math.log10(v) - Math.log10(sLo)) / (Math.log10(sHi) - Math.log10(sLo))) * box.w
  // Void ratio falls down the page, the drafting convention for this plot.
  const Y = (v: number) => box.top + ((ea.hi - v) / (ea.hi - ea.lo)) * box.h

  for (const t of decadeTicks(sLo, sHi)) {
    p.push({ kind: 'line', x1: X(t), y1: box.top, x2: X(t), y2: box.top + box.h, stroke: GRID, width: 0.2 })
    p.push({ kind: 'text', x: X(t), y: box.top + box.h + 4, text: String(t), size: 2.1, anchor: 'middle', color: AXIS })
  }
  for (const e of ea.ticks) {
    p.push({ kind: 'line', x1: box.left, y1: Y(e), x2: box.left + box.w, y2: Y(e), stroke: GRID, width: 0.2 })
    p.push({ kind: 'text', x: box.left - 1.5, y: Y(e) + 0.8, text: e.toFixed(eDp), size: 2.1, anchor: 'end', color: AXIS })
  }

  for (let i = 1; i < rows.length; i++) {
    p.push({
      kind: 'line',
      x1: X(rows[i - 1].stress), y1: Y(rows[i - 1].voidRatio),
      x2: X(rows[i].stress), y2: Y(rows[i].voidRatio),
      stroke: ACCENT, width: 0.6,
    })
  }
  for (const row of rows) {
    p.push({ kind: 'circle', cx: X(row.stress), cy: Y(row.voidRatio), r: 1.0, fill: INK })
  }

  if (r.preconsolidationPressure != null) {
    const x = X(r.preconsolidationPressure)
    p.push({ kind: 'line', x1: x, y1: box.top, x2: x, y2: box.top + box.h, stroke: WARN, width: 0.5, dash: [2.5, 1.5] })
    const label = `σ'p ≈ ${r.preconsolidationPressure.toFixed(0)} kPa`
    // Flip the label to the left of the marker when it would run off the frame.
    const w = label.length * 2.3 * 0.52 + 1.4
    const at = x + 1.5 + w > box.left + box.w ? x - 1.5 - w : x + 1.5
    p.push(...plate(at, box.top + 4, 2.3, [{ text: label, color: WARN }]))
  }

  p.push(...plate(box.left + 2, box.top + box.h - 3.2, 2.4, [{
    text: `Cc = ${r.cc.toFixed(3)}${r.cr != null ? `   Cr = ${r.cr.toFixed(3)}` : ''}`,
  }]))

  return {
    primitives: p,
    bounds: { minX: 0, minY: 0, maxX: box.left + box.w + 4, maxY: box.top + box.h + 13 },
  }
}

// ── Grain-size distribution ───────────────────────────────────────────────

/**
 * Percent passing against log particle size, drawn coarse-to-fine LEFT TO
 * RIGHT — the convention on every published grading chart, and the reason the
 * size axis runs backwards.
 */
export function gradingChart(g: GradationResult): Drawing {
  const box = BOX
  const p: PlanPrimitive[] = frame(box, 'particle size  (mm, log)', '% passing', 'Grain-size distribution')

  const rows = [...g.rows].filter((r) => r.size > 0).sort((a, b) => b.size - a.size)
  if (!rows.length) return { primitives: p, bounds: { minX: 0, minY: 0, maxX: box.left + box.w + 4, maxY: box.top + box.h + 13 } }

  const dHi = rows[0].size * 1.5
  const dLo = rows[rows.length - 1].size / 1.5
  // Coarse on the left: size decreases as x increases.
  const X = (v: number) =>
    box.left + ((Math.log10(dHi) - Math.log10(v)) / (Math.log10(dHi) - Math.log10(dLo))) * box.w
  const Y = (v: number) => box.top + box.h - (v / 100) * box.h

  for (const t of decadeTicks(dLo, dHi)) {
    p.push({ kind: 'line', x1: X(t), y1: box.top, x2: X(t), y2: box.top + box.h, stroke: GRID, width: 0.2 })
    p.push({ kind: 'text', x: X(t), y: box.top + box.h + 4, text: t < 1 ? t.toFixed(t < 0.1 ? 3 : 2) : String(t), size: 2.0, anchor: 'middle', color: AXIS })
  }
  for (const pc of [0, 25, 50, 75, 100]) {
    p.push({ kind: 'line', x1: box.left, y1: Y(pc), x2: box.left + box.w, y2: Y(pc), stroke: GRID, width: 0.2 })
    p.push({ kind: 'text', x: box.left - 1.5, y: Y(pc) + 0.8, text: String(pc), size: 2.1, anchor: 'end', color: AXIS })
  }

  // The D2487 fraction boundaries, which is where a reader's eye goes first.
  for (const [size, label] of [[4.75, 'gravel | sand'], [0.075, 'sand | fines']] as [number, string][]) {
    if (size <= dHi && size >= dLo) {
      p.push({ kind: 'line', x1: X(size), y1: box.top, x2: X(size), y2: box.top + box.h, stroke: WARN, width: 0.4, dash: [2, 1.5] })
      p.push({ kind: 'text', x: X(size), y: box.top - 0.5, text: label, size: 1.9, anchor: 'middle', color: WARN })
    }
  }

  for (let i = 1; i < rows.length; i++) {
    p.push({
      kind: 'line',
      x1: X(rows[i - 1].size), y1: Y(rows[i - 1].percentPassing),
      x2: X(rows[i].size), y2: Y(rows[i].percentPassing),
      stroke: ACCENT, width: 0.6,
    })
  }
  for (const r of rows) {
    p.push({ kind: 'circle', cx: X(r.size), cy: Y(r.percentPassing), r: 0.9, fill: INK })
  }

  // The statistics go BOTTOM-left. A grading curve descends left to right, so
  // the top-left corner is exactly where the curve and the gravel/sand boundary
  // label already are — putting text there overlapped both.
  const shape = g.cu != null && g.cc != null
    ? `Cu = ${g.cu.toFixed(1)}   Cc = ${g.cc.toFixed(2)}`
    : 'Cu, Cc unavailable — the curve does not reach 10% passing'
  p.push(...plate(box.left + 2, box.top + box.h - 6.6, 2.3, [
    { text: shape, color: g.cu != null ? INK : WARN },
    { text: `gravel ${g.gravel.toFixed(0)}%   sand ${g.sand.toFixed(0)}%   fines ${g.fines.toFixed(0)}%` },
  ]))

  return {
    primitives: p,
    bounds: { minX: 0, minY: 0, maxX: box.left + box.w + 4, maxY: box.top + box.h + 13 },
  }
}
