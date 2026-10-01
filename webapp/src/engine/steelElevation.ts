// ─────────────────────────────────────────────────────────────────────────
// STEEL FRAMING ELEVATION — one grid line, every storey.
//
// The steel analogue of `frameElevation`, with one difference in scope: a steel
// sheet has no bars to show, so it draws the WHOLE line at once, base to roof.
// What a fabricator and an erector read off it:
//   · the shapes, to scale — a column at the depth it shows in this plane
//     (d when its strong axis lies along the line, bf when it does not), a beam
//     hanging below its top-of-steel at its own d;
//   · top-of-steel elevations at every level and the grid bubbles;
//   · the connection MARK at each beam end — the same marks the beam schedule
//     prints (`lib/steelMarks`) and the S-11 connection sheets are keyed by, so
//     the elevation, the schedule and the detail name one connection one way;
//   · camber where the design calls for it, base plates at the column feet;
//   · column SPLICES, placed here (`columnSplices`) because nothing else does.
//
// SPLICE POLICY — the open decision in docs/SteelDrawingsPlan.md S3, settled:
//   · a splice wherever the column SHAPE changes, since a rolled shape cannot
//     change mid-piece; and wherever a constant-shape run would exceed the
//     stock piece length (`SPLICE_STOCK_M`), so the column ships and erects;
//   · always 1.2 m above the floor it sits over — the erection convention that
//     keeps the joint clear of the beam connections and at working height;
//   · BEARING (finished to bear, AISC 360-16 §J1.4(a)) when the column is in
//     compression under every combination; otherwise a splice DESIGNED for the
//     net tension, which the sheet flags rather than details.
// Units: geometry m, sections mm; the sheet is drawn in mm with y DOWN.
// ─────────────────────────────────────────────────────────────────────────
import type { Drawing, PlanPrimitive } from './planRenderer'
import { titleBlock, sheetBounds, leader, notesBlock, textWidth } from './detailSheet'
import { SHEET_INK, SHEET_NOTE, SHEET_GRID, STEEL_CONTEXT, SHEET_STEELWORK, SHEET_WARN } from './sheetInk'

/** Splice height above the floor below it, m. */
export const SPLICE_ABOVE_FLOOR_M = 1.2
/** Longest column piece the splice policy allows, m. */
export const SPLICE_STOCK_M = 12

/** One storey-height column member of a stack, bottom to top. */
export interface StackColumn { id: string; yBot: number; yTop: number; shape: string; Tu?: number }
export interface ColumnSplice {
  /** The member the splice sits in (the upper of the two at a shape change). */
  column: string
  /** World level of the splice, m. */
  y: number
  kind: 'bearing' | 'tension'
  reason: 'shape change' | 'stock length'
}

/** Where a column stack is spliced. `stack` runs bottom to top, contiguous. */
export function columnSplices(stack: StackColumn[], stockM = SPLICE_STOCK_M, aboveM = SPLICE_ABOVE_FLOOR_M): ColumnSplice[] {
  const s = [...stack].sort((a, b) => a.yBot - b.yBot)
  if (s.length < 2) return []
  const top = s[s.length - 1]!.yTop
  // every place a splice may go: 1.2 m above each floor the stack passes
  const cands = s.slice(1).map((c, k) => ({ y: c.yBot + aboveM, col: c, forced: c.shape !== s[k]!.shape }))
    .filter((c) => c.y < top - 1e-9)
  const out: ColumnSplice[] = []
  const kindOf = (c: StackColumn, below: StackColumn): ColumnSplice['kind'] =>
    Math.max(c.Tu ?? 0, below.Tu ?? 0) > 1e-6 ? 'tension' : 'bearing'
  const below = (c: StackColumn) => s[s.indexOf(c) - 1]!
  let start = s[0]!.yBot
  // the next point the piece MUST end at: a forced splice, or the top
  const nextHard = (from: number) => {
    const f = cands.find((c) => c.forced && c.y > from + 1e-9)
    return f ? f.y : top
  }
  while (start < top - 1e-9) {
    const hard = nextHard(start)
    if (hard - start <= stockM + 1e-9) {
      if (hard < top - 1e-9) {
        const c = cands.find((x) => Math.abs(x.y - hard) < 1e-9)!
        out.push({ column: c.col.id, y: c.y, kind: kindOf(c.col, below(c.col)), reason: 'shape change' })
      }
      start = hard
      continue
    }
    // too long to ship: cut at the highest candidate that keeps the piece in stock
    const fit = cands.filter((x) => x.y > start + 1e-9 && x.y <= start + stockM + 1e-9)
    const c = fit[fit.length - 1]
    if (!c) break                              // a single storey longer than stock — nothing to cut at
    out.push({ column: c.col.id, y: c.y, kind: kindOf(c.col, below(c.col)), reason: 'stock length' })
    start = c.y
  }
  return out
}

export interface SteelElevationColumn {
  id: string
  /** Position along the line, m, and the extent it occupies. */
  u: number; yBot: number; yTop: number
  shape: string
  /** The dimension this plane sees, mm (d or bf). */
  face: number
  /** A base plate under this member's foot. */
  basePlate?: boolean
}
export interface SteelElevationBeam {
  id: string
  u0: number; u1: number
  /** Top of steel, m. */
  y: number
  shape: string
  d: number
  markI: string; markJ: string
  camber: number
}
export interface SteelElevationInput {
  line: string
  grids: { label: string; u: number }[]
  levels: number[]
  columns: SteelElevationColumn[]
  beams: SteelElevationBeam[]
  splices: ColumnSplice[]
}
export interface SteelElevationOptions { detailNo?: string; sheetRef?: string }
export interface SteelElevationDrawing extends Drawing { title: string }

const fmtLevel = (y: number) => `${y >= 0 ? '+' : '−'}${Math.abs(y).toFixed(3)}`

export function buildSteelFrameElevation(i: SteelElevationInput, opts: SteelElevationOptions = {}): SteelElevationDrawing {
  const P: PlanPrimitive[] = []
  const X = (u: number) => u * 1000, Y = (y: number) => -y * 1000
  const uMin = Math.min(...i.grids.map((g) => g.u)), uMax = Math.max(...i.grids.map((g) => g.u))
  const yMin = Math.min(...i.levels, ...i.columns.map((c) => c.yBot)), yMax = Math.max(...i.levels)
  const span = Math.max(X(uMax) - X(uMin), Y(yMin) - Y(yMax), 3000)
  const u = span * 0.016                                    // type unit
  const txt = (x: number, y: number, text: string, size = u, anchor: 'start' | 'middle' | 'end' = 'start', color = SHEET_NOTE, weight = 500, rotate?: number) =>
    P.push({ kind: 'text', x, y, text, size, anchor, color, weight, ...(rotate != null ? { rotate } : {}) })

  // grid lines and bubbles
  const gTop = Y(yMax) - u * 6, gBot = Y(yMin) + u * 2
  for (const g of i.grids) {
    P.push({ kind: 'line', x1: X(g.u), y1: gTop + u * 1.2, x2: X(g.u), y2: gBot, stroke: SHEET_GRID, width: 0.5, dash: [u * 1.2, u * 0.4, u * 0.2, u * 0.4] })
    P.push({ kind: 'circle', cx: X(g.u), cy: gTop, r: u * 1.2, stroke: SHEET_INK, fill: 'none', width: 0.9 })
    txt(X(g.u), gTop + u * 0.4, g.label, u * 1.1, 'middle', SHEET_INK, 700)
  }
  // levels: top of steel
  const lvlX0 = X(uMin) - u * 3, lvlX1 = X(uMax) + u * 3
  for (const y of i.levels) {
    P.push({ kind: 'line', x1: lvlX0, y1: Y(y), x2: lvlX1, y2: Y(y), stroke: SHEET_GRID, width: 0.4, dash: [u * 0.6, u * 0.4] })
    txt(lvlX1 + u * 0.6, Y(y) + u * 0.35, `TOS ${fmtLevel(y)}`, u * 0.95, 'start', SHEET_INK, 600)
  }
  // columns, at the depth this plane sees
  for (const c of i.columns) {
    P.push({ kind: 'rect', x: X(c.u) - c.face / 2, y: Y(c.yTop), w: c.face, h: Y(c.yBot) - Y(c.yTop), fill: SHEET_STEELWORK, stroke: STEEL_CONTEXT, width: 0.8 })
    // hung from the column's top, below the deepest beam it carries and the
    // end-mark row under it, so it is clear of both and of a splice (which
    // sits 1.2 m above the floor at the column's foot)
    const beamD = Math.max(0, ...i.beams.filter((bm) => Math.abs(bm.y - c.yTop) < 1e-6).map((bm) => bm.d))
    txt(X(c.u) - c.face / 2 - u * 0.5, Y(c.yTop) + beamD + u * 2.4, `${c.id}  ${c.shape}`, u * 0.85, 'end', SHEET_INK, 600, -90)
    if (c.basePlate) {
      P.push({ kind: 'rect', x: X(c.u) - c.face / 2 - u * 1.2, y: Y(c.yBot), w: c.face + u * 2.4, h: u * 0.45, fill: SHEET_INK })
      txt(X(c.u), Y(c.yBot) + u * 1.6, 'BASE PLATE', u * 0.75, 'middle')
    }
  }
  // beams: hanging below top of steel, face to face of the columns they meet
  const faceAt = (uu: number, y: number) => {
    const c = i.columns.find((k) => Math.abs(k.u - uu) < 1e-6 && k.yBot < y + 1e-6 && k.yTop > y - 1e-6)
    return c ? c.face / 2 : 0
  }
  for (const b of i.beams) {
    const x0 = X(b.u0) + faceAt(b.u0, b.y), x1 = X(b.u1) - faceAt(b.u1, b.y)
    P.push({ kind: 'rect', x: x0, y: Y(b.y), w: x1 - x0, h: b.d, fill: SHEET_STEELWORK, stroke: SHEET_INK, width: 0.9 })
    const mid = (x0 + x1) / 2
    txt(mid, Y(b.y) - u * 0.5, `${b.id}  ${b.shape}${b.camber > 0 ? `  C=${b.camber}` : ''}`, u * 0.85, 'middle', SHEET_INK, 600)
    // the connection mark at each end, just inside the end under the beam
    for (const [x, m, a] of [[x0, b.markI, 'start'], [x1, b.markJ, 'end']] as const) {
      if (m === '—') continue
      txt(x + (a === 'start' ? u * 0.4 : -u * 0.4), Y(b.y) + b.d + u * 1.1, m, u * 0.85, a, SHEET_INK, 700)
    }
  }
  // splices: a break across the column, called out
  for (const sp of i.splices) {
    const c = i.columns.find((k) => k.id === sp.column)
    if (!c) continue
    const x = X(c.u), y = Y(sp.y), w = c.face / 2 + u * 0.3
    P.push({ kind: 'line', x1: x - w, y1: y, x2: x + w, y2: y, stroke: sp.kind === 'tension' ? SHEET_WARN : SHEET_INK, width: 1.6 })
    P.push(...leader({ x: x + c.face / 2, y, tx: x + c.face / 2 + u * 4, ty: y - u * 1.2,
      text: sp.kind === 'bearing' ? 'SPLICE — BEARING' : 'SPLICE — DESIGN FOR Tu', size: u * 0.8,
      color: sp.kind === 'tension' ? SHEET_WARN : undefined }))
  }

  // notes and title
  const notesTop = gBot + u * 3
  const notes = [
    'TOS = TOP OF STEEL, m. BEAMS HANG BELOW TOS AT THEIR OWN DEPTH; COLUMNS DRAWN AT THE DIMENSION THIS PLANE SEES.',
    'MARK AT EACH BEAM END = THE CONNECTION DETAIL ON THE S-11 SHEET OF THAT MARK. C = SPECIFIED CAMBER, mm.',
    `COLUMN SPLICES ${SPLICE_ABOVE_FLOOR_M} m ABOVE FLOOR, AT EVERY CHANGE OF SHAPE AND WHERE A PIECE WOULD EXCEED ${SPLICE_STOCK_M} m. BEARING SPLICES FINISHED TO BEAR (AISC 360-16 §J1.4(a)); A SPLICE IN A COLUMN THAT SEES NET TENSION IS DESIGNED FOR IT.`,
  ]
  // wrapped to the drawing's own width, so a long note does not widen the sheet
  const sheetW = lvlX1 + u * 9 - lvlX0
  const nb = notesBlock({ x: lvlX0, w: sheetW, top: notesTop, size: u * 0.8, lines: notes, color: SHEET_NOTE })
  P.push(...nb.prims)
  const title = `STEEL FRAMING ELEVATION — GRID ${i.line}`
  // the rule spans at least the title (titleBlock: radius 2.6·tu, title at 0.95·r)
  const tu = u * 0.8, r = tu * 2.6
  const tbW = Math.max(sheetW, 2 * r + tu * 0.8 + textWidth(title, r * 0.95) + tu)
  P.push(...titleBlock({ x: lvlX0, w: tbW, top: nb.bottom + u, u: tu, title, detailNo: opts.detailNo, sheetRef: opts.sheetRef, scale: 'NTS' }).prims)
  return { primitives: P, bounds: sheetBounds(P, u), title }
}
