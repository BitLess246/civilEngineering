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
  // A clause reference alone on the last line is an orphan — '(§409.7.6.2.3)'
  // under a sentence reads as a new note rather than the end of the old one.
  // Pull a word down with it so the reference always has something to sit with.
  const last = out[out.length - 1]
  if (out.length > 1 && /^\(?§/.test(last)) {
    const prev = out[out.length - 2].split(' ')
    if (prev.length > 1) {
      out[out.length - 1] = `${prev.pop()} ${last}`
      out[out.length - 2] = prev.join(' ')
    }
  }
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
    if (p.kind === 'line') { xs = [p.x1, p.x2]; ys = [p.y1, p.y2] }
    else if (p.kind === 'dim') {
      // A dimension is its line PLUS the text riding above it and the 45° ticks
      // at its ends. Measuring only the endpoints let the label hang off the
      // top of the sheet, which is what clipped the ℓdh dimension on the beam
      // detail. A vertical dim rotates its text, so the box turns with it.
      const tick = p.size * 0.45
      const mx = (p.x1 + p.x2) / 2, my = (p.y1 + p.y2) / 2
      const tw = textWidth(p.text, p.size)
      const vertical = Math.abs(p.y2 - p.y1) > Math.abs(p.x2 - p.x1)
      const hw = (vertical ? p.size : tw) / 2, hh = (vertical ? tw : p.size) / 2
      xs = [p.x1 - tick, p.x2 + tick, mx - hw, mx + hw]
      ys = [p.y1 - tick, p.y2 + tick, my - p.size * 0.35 - hh, my - p.size * 0.35 + hh]
    }
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

// ── Leaders ───────────────────────────────────────────────────────────────

export interface LeaderOpts {
  /** The point being pointed AT — the arrowhead sits here. */
  x: number
  y: number
  /** Where the landing ends and the label begins. The text sits just above
   *  this level, the way a drafted leader puts it. */
  tx: number
  ty: number
  text: string
  size: number
  /** Label colour. The leader's own geometry — arrowhead, leg and landing —
   *  always draws in the annotation ink, whatever the label is: a leader in a
   *  bar's colour reads as a bar, and every filter that counts bars by ink
   *  picks it up as one. */
  color?: string
  weight?: number
  /** Which side the landing comes in on. Defaults to the side the target is,
   *  so the leader never has to cross its own label to reach the thing it
   *  names. */
  side?: 'left' | 'right'
  /** Horizontal landing length. Default 2.2 × size. */
  landing?: number
  /** Arrowhead length. Default 0.95 × size. */
  arrow?: number
  /** Second landing/text line, printed under the first. */
  text2?: string
}

/**
 * The house leader: filled arrowhead, one inclined leg, a horizontal landing,
 * and the label sitting on the landing.
 *
 * Every sheet used to draw its own — a bare hairline from somewhere near the
 * text to somewhere near the target, with no arrowhead and no landing, so at
 * a glance you could not tell a leader from a dimension extension or from a
 * bar. This is the one shape they all use now.
 */
export function leader(o: LeaderOpts): PlanPrimitive[] {
  const ink = NOTE                        // the leader itself, always
  const color = o.color ?? NOTE           // the label
  const side = o.side ?? (o.x <= o.tx ? 'left' : 'right')
  const s = side === 'left' ? -1 : 1
  const gap = o.size * 0.45
  const land = o.landing ?? o.size * 2.2
  const kneeX = o.tx + s * (gap + land)

  // The leg stops at the back of the arrowhead so the two do not overprint.
  const dx = o.x - kneeX, dy = o.y - o.ty
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len, uy = dy / len
  const a = Math.min(o.arrow ?? o.size * 0.95, len * 0.6)
  const bx = o.x - ux * a, by = o.y - uy * a
  const hw = a * 0.26

  return [
    {
      kind: 'path', closed: true, fill: ink, stroke: ink, width: 0.3, join: 'miter',
      cmds: [
        { c: 'M', x: o.x, y: o.y },
        { c: 'L', x: bx - uy * hw, y: by + ux * hw },
        { c: 'L', x: bx + uy * hw, y: by - ux * hw },
      ],
    },
    { kind: 'line', x1: kneeX, y1: o.ty, x2: bx, y2: by, stroke: ink, width: 0.7 },
    { kind: 'line', x1: kneeX, y1: o.ty, x2: o.tx + s * gap, y2: o.ty, stroke: ink, width: 0.7 },
    {
      kind: 'text', x: o.tx, y: o.ty - o.size * 0.5, text: o.text, size: o.size,
      anchor: side === 'left' ? 'start' : 'end', color, weight: o.weight ?? 600,
    },
    ...(o.text2 ? [{
      kind: 'text' as const, x: o.tx, y: o.ty + o.size * 0.75, text: o.text2, size: o.size,
      anchor: (side === 'left' ? 'start' : 'end') as 'start' | 'end', color, weight: o.weight ?? 600,
    }] : []),
  ]
}
