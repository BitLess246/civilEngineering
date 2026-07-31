// ─────────────────────────────────────────────────────────────────────────
// Factor of safety against liquefaction, plotted down the hole. Layer 8.
//
// The FS profile is the output an engineer actually reads: a table of numbers
// says which tests fail, a profile says WHERE and HOW THICK — which is the
// question that decides between ground improvement, deeper foundations, and
// doing nothing.
//
// Two things this draws that a table cannot:
//
//  • the FS = 1 line, with everything left of it shaded, so the liquefiable
//    zone is a region rather than a set of rows;
//  • the tests that were NOT evaluated, at their depth, with the reason. A
//    profile that silently omits the clay layers looks like a hole with fewer
//    tests in it than were run.
//
// Depth runs DOWN the page, as on every log and section.
//
// UNITS: chart coordinates are millimetres of paper; depth m; FS dimensionless.
// ─────────────────────────────────────────────────────────────────────────

import type { PlanPrimitive, Drawing } from '../planRenderer'
import {
  AXIS, GRID, INK, ACCENT, WARN, DANGER, OK, BOX, frame, plate, linearTicks,
} from './chartKit'
import { SKIP_LABEL, type LiquefactionProfile } from './liquefaction'

/** FS beyond which the plot stops widening — a very safe test is just safe. */
const FS_CAP = 3

/** The design margin most practice requires, drawn as a reference. */
export const TARGET_FS = 1.3

export function liquefactionChart(
  p: LiquefactionProfile,
  opts: { waterTable?: number; holeDepth?: number } = {},
): Drawing {
  const box = BOX
  const out: PlanPrimitive[] = frame(box, 'factor of safety  FS', 'depth  (m)', 'Liquefaction — FS profile')
  const bounds = { minX: 0, minY: 0, maxX: box.left + box.w + 4, maxY: box.top + box.h + 13 }

  const evaluated = p.rows.filter((r) => r.result)
  const deepest = Math.max(
    opts.holeDepth ?? 0,
    ...p.rows.map((r) => r.depth),
    1,
  )
  const za = linearTicks(0, deepest * 1.05)
  const fsMax = Math.min(
    FS_CAP,
    Math.max(2, ...evaluated.map((r) => r.result!.factorOfSafety ?? 0)),
  )
  const xa = linearTicks(0, fsMax)

  const X = (v: number) => box.left + (Math.min(v, xa.hi) / xa.hi) * box.w
  const Y = (v: number) => box.top + (v / za.hi) * box.h

  // ── Grid ──
  for (const t of xa.ticks) {
    if (t <= 0) continue
    out.push({ kind: 'line', x1: X(t), y1: box.top, x2: X(t), y2: box.top + box.h, stroke: GRID, width: 0.2 })
    out.push({ kind: 'text', x: X(t), y: box.top + box.h + 4, text: String(t), size: 2.2, anchor: 'middle', color: AXIS })
  }
  for (const t of za.ticks) {
    if (t <= 0) continue
    out.push({ kind: 'line', x1: box.left, y1: Y(t), x2: box.left + box.w, y2: Y(t), stroke: GRID, width: 0.2 })
    out.push({ kind: 'text', x: box.left - 1.5, y: Y(t) + 0.8, text: String(t), size: 2.2, anchor: 'end', color: AXIS })
  }

  // ── The liquefiable half-plane, shaded ──
  // Shading the REGION rather than marking the points is the whole reason to
  // draw this: FS = 0.98 and FS = 1.02 are the same soil, and a reader should
  // see how close a passing test sits to the line.
  //
  // It stops at the BASE OF THE HOLE. Shading on past the last metre drilled
  // claims a verdict over ground nobody sampled — and it is the half of the
  // chart a reader is most likely to skim.
  const shadeTo = opts.holeDepth != null && opts.holeDepth <= za.hi
    ? Y(opts.holeDepth)
    : box.top + box.h
  out.push({
    kind: 'rect', x: box.left, y: box.top, w: X(1) - box.left, h: shadeTo - box.top,
    fill: '#fee2e2',
  })
  out.push({ kind: 'line', x1: X(1), y1: box.top, x2: X(1), y2: box.top + box.h, stroke: DANGER, width: 0.6 })
  if (TARGET_FS <= xa.hi) {
    out.push({
      kind: 'line', x1: X(TARGET_FS), y1: box.top, x2: X(TARGET_FS), y2: box.top + box.h,
      stroke: OK, width: 0.4, dash: [2, 1.5],
    })
    // An unlabelled reference line is furniture. Say what it is.
    out.push({
      kind: 'text', x: X(TARGET_FS) + 1, y: box.top + box.h - 1.5,
      text: `target ${TARGET_FS}`, size: 2.0, color: OK,
    })
  }

  // ── Water table ──
  if (opts.waterTable != null && opts.waterTable <= za.hi) {
    const y = Y(opts.waterTable)
    out.push({ kind: 'line', x1: box.left, y1: y, x2: box.left + box.w, y2: y, stroke: '#0ea5e9', width: 0.5, dash: [3, 1.5] })
    out.push({
      kind: 'text', x: box.left + box.w - 1, y: y - 1.6, text: `WT ${opts.waterTable.toFixed(1)} m`,
      size: 2.0, anchor: 'end', color: '#0369a1',
    })
  }

  // ── The FS profile ──
  const pts = evaluated
    .filter((r) => r.result!.factorOfSafety != null)
    .sort((a, b) => a.depth - b.depth)
  for (let i = 1; i < pts.length; i++) {
    out.push({
      kind: 'line',
      x1: X(pts[i - 1].result!.factorOfSafety!), y1: Y(pts[i - 1].depth),
      x2: X(pts[i].result!.factorOfSafety!), y2: Y(pts[i].depth),
      stroke: ACCENT, width: 0.6,
    })
  }
  for (const r of pts) {
    const fs = r.result!.factorOfSafety!
    out.push({
      kind: 'circle', cx: X(fs), cy: Y(r.depth), r: 1.2,
      fill: fs < 1 ? DANGER : fs < TARGET_FS ? WARN : INK,
    })
    // An FS past the axis is drawn AT the axis; the caret says the point is
    // further right, so a clipped dot is never read as a marginal one.
    if (fs > xa.hi) {
      out.push({ kind: 'text', x: X(fs) - 2.2, y: Y(r.depth), text: '›', size: 2.6, color: INK })
    }
  }

  // ── Base of the hole ──
  // A layer that was never drilled cannot be cleared, so where the data STOPS
  // belongs on the chart. Without it the axis simply runs on past the hole and
  // the empty space below reads as ground that was checked and passed.
  if (opts.holeDepth != null && opts.holeDepth <= za.hi) {
    const y = Y(opts.holeDepth)
    out.push({ kind: 'line', x1: box.left, y1: y, x2: box.left + box.w, y2: y, stroke: AXIS, width: 0.5 })
    out.push(...plate(box.left + box.w - 26, y + 2.4, 2.0, [
      { text: `base of hole ${opts.holeDepth.toFixed(1)} m`, color: AXIS },
    ]))
  }

  // ── Tests that were not evaluated ──
  // On a PLATE, not bare text: these markers land inside the red half-plane,
  // and a grey label floating on red reads as a test that failed rather than
  // one that was never run.
  for (const r of p.rows) {
    if (r.result || !r.skipped) continue
    const y = Y(r.depth)
    out.push({ kind: 'line', x1: box.left, y1: y, x2: box.left + 3, y2: y, stroke: '#94a3b8', width: 0.5 })
    out.push(...plate(box.left + 4, y, 1.9, [{
      color: '#64748b',
      text: r.skipped === 'above-water-table' ? 'not saturated — not evaluated'
        : r.skipped === 'cohesive' ? 'cohesive — not this method'
        : r.skipped === 'no-stress' ? 'no unit weight above — not evaluated'
        : 'no blow count — not evaluated',
    }]))
  }

  // Bottom-left is the free corner here: FS rises to the right and the shallow
  // (low-FS) points sit top-left, so the summary goes bottom-left.
  const worst = pts.length
    ? Math.min(...pts.map((r) => r.result!.factorOfSafety!))
    : undefined
  out.push(...plate(box.left + 2, box.top + box.h - 6.6, 2.3, [
    {
      text: pts.length
        ? `LPI = ${p.lpi.toFixed(1)} (${p.lpiCategory.replace('-', ' ')})   min FS = ${worst!.toFixed(2)}`
        : 'nothing evaluated — see the notes',
      color: pts.length && p.lpi > 5 ? DANGER : INK,
    },
    {
      text: p.liquefiableDepths.length
        ? `liquefiable ${p.liquefiableDepths.map((d) => `${d.top.toFixed(1)}–${d.bottom.toFixed(1)} m`).join(', ')}`
        : pts.length ? 'no test triggers at this a_max' : '',
      color: p.liquefiableDepths.length ? DANGER : OK,
    },
  ]))

  return { primitives: out, bounds }
}

/** Label for a skipped test, shared with the table so the two cannot drift. */
export const skipText = (k: keyof typeof SKIP_LABEL): string => SKIP_LABEL[k]
