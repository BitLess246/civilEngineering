// ─────────────────────────────────────────────────────────────────────────
// Detail-sheet furniture — the parts every standalone detail draws the same
// way: the notes block, the title block, and the bounds scan that keeps the
// sheet from clipping itself.
//
// These were hand-rolled once per detail engine. `wrapNote` and `GLYPH_W` were
// four byte-identical copies; the bounds scan was four more; the title block
// was seven, each with its own sizing arithmetic (u*1.1, u*1.3, rad*0.58,
// tbR*0.4). That is why the sheets did not match each other — the wall details
// put their title block at the TOP while every other sheet put it at the
// bottom, and note text came out a different size on every sheet.
//
// COORDINATES. Everything here works in FINAL primitive space, the space
// `planToSvg` paints: y increases DOWNWARD, drafting convention. Detail engines
// that model in "up is positive" flip through their own Y() helper first and
// pass the result in.
// ─────────────────────────────────────────────────────────────────────────
import type { PlanPrimitive } from './planRenderer'

const INK = '#1e293b'
const GRID = '#cbd5e1'
const NOTE = '#475569'

/** Mean glyph advance as a fraction of font size, for the uppercase-heavy text
 *  these sheets use. Capitals are wider than a mixed-case average, so a value
 *  tuned on lowercase (~0.55) under-measures and lets notes run off the sheet. */
export const GLYPH_W = 0.63

/** Painted width of a string at `size`, in the same units as `size`. */
export function textWidth(text: string, size: number): number {
  return text.length * GLYPH_W * size
}

/** How many characters fit in `w` at `size` — the column count `wrapNote` wants. */
export function wrapCols(w: number, size: number): number {
  return Math.max(24, Math.floor(w / (GLYPH_W * size)))
}

/** Greedy word wrap. Returns the text unsplit when the column count is too
 *  small to be meaningful, so a caller that mis-measures gets one long line
 *  rather than one word per line. */
export function wrapNote(text: string, max: number): string[] {
  if (max < 8) return [text]
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > max) { out.push(line); line = word } else line += (line ? ' ' : '') + word
  }
  if (line) out.push(line)
  return out
}

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

/**
 * Extent of a primitive list, text included.
 *
 * Text is the reason this exists: a label is anchored at a point but paints a
 * box either side of it, and a bounds that ignores that clips the leader hanging
 * off the top-left of a sheet. `seed` starts the scan from a known rectangle
 * (the drawing area) so an empty list still returns something sane.
 */
export function measureBounds(prims: PlanPrimitive[], seed?: Bounds): Bounds {
  const b: Bounds = seed
    ? { ...seed }
    : { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const p of prims) {
    let xs: number[] = [], ys: number[] = []
    if (p.kind === 'line' || p.kind === 'dim') { xs = [p.x1, p.x2]; ys = [p.y1, p.y2] }
    else if (p.kind === 'rect') { xs = [p.x, p.x + p.w]; ys = [p.y, p.y + p.h] }
    else if (p.kind === 'circle') { xs = [p.cx - p.r, p.cx + p.r]; ys = [p.cy - p.r, p.cy + p.r] }
    else if (p.kind === 'path') { xs = p.cmds.map((c) => c.x); ys = p.cmds.map((c) => c.y) }
    else if (p.kind === 'text') {
      const tw = textWidth(p.text, p.size), th = p.size
      const lead = p.anchor === 'middle' ? -tw / 2 : p.anchor === 'end' ? -tw : 0
      xs = [p.x + lead, p.x + lead + tw]; ys = [p.y - th / 2, p.y + th / 2]
    }
    for (const x of xs) { if (Number.isFinite(x)) { b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x) } }
    for (const y of ys) { if (Number.isFinite(y)) { b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y) } }
  }
  if (!Number.isFinite(b.minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 }
  return b
}

/** `measureBounds` plus a uniform margin, which is what a sheet actually wants. */
export function sheetBounds(prims: PlanPrimitive[], pad: number, seed?: Bounds): Bounds {
  const b = measureBounds(prims, seed)
  return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad }
}

export interface NotesOpts {
  /** Left edge and the width the text must wrap inside. */
  x: number; w: number
  /** Baseline of the first line (y down). */
  top: number
  size: number
  lines: string[]
  color?: string
  /** Baseline-to-baseline step. Defaults to 1.55×size — tight enough to read as
   *  one block, loose enough that a clause number on its own line still scans. */
  step?: number
}

/** The sheet's note block: every line wrapped to the block width, one style. */
export function notesBlock(o: NotesOpts): { prims: PlanPrimitive[]; bottom: number } {
  const step = o.step ?? o.size * 1.55
  const cols = wrapCols(o.w, o.size)
  const wrapped = o.lines.flatMap((t) => wrapNote(t, cols))
  const prims = wrapped.map((t, k): PlanPrimitive => ({
    kind: 'text', x: o.x, y: o.top + k * step, text: t, size: o.size,
    anchor: 'start', color: o.color ?? NOTE,
  }))
  return { prims, bottom: o.top + Math.max(0, wrapped.length - 1) * step }
}

export interface TitleOpts {
  /** Left edge and full width of the block — the title rules span it. */
  x: number; w: number
  /** Top rule (y down). */
  top: number
  /** Type unit; the block scales off it exactly as the beam sheet's did. */
  u: number
  title: string
  detailNo?: string
  sheetRef?: string
  scale?: string
}

/**
 * The title block: detail bubble, title, and the scale line — always at the
 * BOTTOM of the sheet, below the drawing and its notes.
 *
 * The bubble is the AIA convention: detail number over sheet reference, split
 * by a diameter. Rules top and bottom bracket the block so it reads as one
 * object rather than as more notes.
 */
export function titleBlock(o: TitleOpts): { prims: PlanPrimitive[]; bottom: number } {
  const { x, w, top, u } = o
  const r = u * 2.6
  const bx = x + r
  const cy = top + r + u * 0.8
  const right = x + w
  const tx = bx + r + u * 1.6
  const P: PlanPrimitive[] = [
    { kind: 'line', x1: x, y1: top, x2: right, y2: top, stroke: INK, width: 1.0 },
    { kind: 'circle', cx: bx, cy, r, stroke: INK, fill: '#fff', width: 0.9 },
    { kind: 'line', x1: bx - r, y1: cy, x2: bx + r, y2: cy, stroke: INK, width: 0.9 },
    { kind: 'text', x: bx, y: cy - r * 0.48, text: o.detailNo ?? '1', size: u * 2.0, anchor: 'middle', color: INK, weight: 700 },
    { kind: 'text', x: bx, y: cy + r * 0.52, text: o.sheetRef ?? 'S-1', size: u * 1.3, anchor: 'middle', color: INK, weight: 600 },
    { kind: 'text', x: tx, y: cy - r * 0.30, text: o.title, size: u * 2.4, anchor: 'start', color: INK, weight: 700 },
    { kind: 'line', x1: tx, y1: cy + r * 0.10, x2: right, y2: cy + r * 0.10, stroke: GRID, width: 0.6 },
    { kind: 'text', x: tx, y: cy + r * 0.62, text: 'SCALE', size: u * 1.3, anchor: 'start', color: NOTE, weight: 600 },
    { kind: 'text', x: right, y: cy + r * 0.62, text: o.scale ?? 'NTS', size: u * 1.3, anchor: 'end', color: NOTE, weight: 600 },
  ]
  const bottom = cy + r + u * 0.8
  P.push({ kind: 'line', x1: x, y1: bottom, x2: right, y2: bottom, stroke: INK, width: 1.0 })
  return { prims: P, bottom }
}
