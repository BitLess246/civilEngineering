// ─────────────────────────────────────────────────────────────────────────
// A SCHEDULE SHEET — titled tables, stacked, with the set's title block.
//
// The steel and timber frames are built from schedules rather than from bar
// details: shapes and lengths, base plates, connections, timber sizes and
// decks. This draws any number of such tables on one sheet in the same type,
// rules and title block as the general notes, so they print and export (SVG,
// DXF, PDF) exactly like every other sheet in the set.
//
// Geometry is in type units (u); `fitPaper` pads the bounds to the paper.
// ─────────────────────────────────────────────────────────────────────────
import type { Drawing, PlanPrimitive } from './planRenderer'
import { titleBlock, sheetBounds } from './detailSheet'
import { fitPaper, PAPER, type PaperSize } from './generalNotes'

const INK = '#0f172a'
const NOTE = '#475569'
const HEAD = '#1e3a8a'
const RULE = '#94a3b8'
const FILL = '#eef2f7'
const FAIL = '#b91c1c'

export interface ScheduleColumn {
  head: string
  /** Width in type units. */
  w: number
  align?: 'start' | 'middle' | 'end'
}

export interface ScheduleTable {
  heading: string
  columns: ScheduleColumn[]
  rows: string[][]
  /** Rows to draw in the failure ink (a check that did not pass). */
  failRows?: number[]
  /** A line under the table: what it assumes, where its numbers come from. */
  note?: string
}

export interface ScheduleSheetOptions {
  title: string
  detailNo?: string
  sheetRef?: string
  paper?: PaperSize
}

/** One sheet of schedule tables. Rows are never wrapped — a schedule row is a
 *  line a reader runs a finger along. */
export function buildScheduleSheet(tables: ScheduleTable[], opts: ScheduleSheetOptions): Drawing & { title: string } {
  const u = 1
  const size = u * 1.45, headSize = u * 1.9
  const rowH = u * 2.6
  const P: PlanPrimitive[] = []
  const W = Math.max(60, ...tables.map((t) => t.columns.reduce((s, c) => s + c.w, 0)))
  let y = 0
  for (const t of tables) {
    P.push({ kind: 'text', x: 0, y, text: t.heading, size: headSize, anchor: 'start', color: HEAD, weight: 700 })
    y += u * 1.6
    const xs: number[] = [0]
    for (const c of t.columns) xs.push(xs[xs.length - 1] + c.w)
    const tw = xs[xs.length - 1]
    const fail = new Set(t.failRows ?? [])
    const all = [t.columns.map((c) => c.head), ...t.rows]
    all.forEach((row, ri) => {
      const ry = y + ri * rowH
      if (ri === 0) P.push({ kind: 'rect', x: 0, y: ry, w: tw, h: rowH, fill: FILL, stroke: 'none' })
      row.forEach((cell, ci) => {
        if (!cell) return                      // an empty cell draws nothing
        const c = t.columns[ci]
        const align = c?.align ?? 'start'
        const x = align === 'middle' ? (xs[ci] + xs[ci + 1]) / 2 : align === 'end' ? xs[ci + 1] - u * 0.6 : xs[ci] + u * 0.6
        P.push({
          kind: 'text', x, y: ry + rowH * 0.62, text: cell, size: ri === 0 ? size * 0.9 : size, anchor: align,
          color: ri === 0 ? INK : fail.has(ri - 1) ? FAIL : INK, weight: ri === 0 ? 700 : 500,
        })
      })
    })
    const bottom = y + all.length * rowH
    P.push({ kind: 'rect', x: 0, y, w: tw, h: bottom - y, stroke: RULE, fill: 'none', width: 0.8 })
    for (let ri = 1; ri < all.length; ri++)
      P.push({ kind: 'line', x1: 0, y1: y + ri * rowH, x2: tw, y2: y + ri * rowH, stroke: RULE, width: ri === 1 ? 0.8 : 0.4 })
    for (let k = 1; k < t.columns.length; k++)
      P.push({ kind: 'line', x1: xs[k], y1: y, x2: xs[k], y2: bottom, stroke: RULE, width: 0.5 })
    y = bottom + u * 1.8
    if (t.note) { P.push({ kind: 'text', x: 0, y, text: t.note, size: size * 0.9, anchor: 'start', color: NOTE, weight: 500 }); y += u * 1.6 }
    y += u * 2.4
  }
  const tb = titleBlock({ x: 0, w: W, top: y, u, title: opts.title, detailNo: opts.detailNo ?? '1', sheetRef: opts.sheetRef ?? 'S-07', scale: 'NTS' })
  P.push(...tb.prims)
  const b = sheetBounds(P, u * 3, { minX: 0, minY: -u * 2, maxX: W, maxY: tb.bottom })
  return { primitives: P, title: opts.title, bounds: fitPaper(b, PAPER[opts.paper ?? 'A3']) }
}
