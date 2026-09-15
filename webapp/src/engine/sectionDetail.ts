// ─────────────────────────────────────────────────────────────────────────
// A SECTION SHEET, CUT FROM THE CAGE
//
// The sections in the worked solutions were drawings ABOUT a design: given b,
// h, a bar count and a cover, each component laid the bars out itself and drew
// a stirrup around them from its own rules. `ColumnSchematic` had one bar
// layout, `columnSection` a second, `columnCage` a third — and only the third
// is the steel that gets built, scheduled and weighed.
//
// This module draws the third one. It takes the plane, cuts the placed cage
// (`cageSection`), and puts the concrete outline and the dimensions around
// what comes back. Nothing is laid out here; if a bar is on the sheet it is
// because the cut passed through it.
//
// Emits a `Drawing`, the same type the plan renderer paints, so the schedule
// accordion, the Plans tab and the PDF report all show one object.
//
// Tested through `memberSection.test.ts` rather than in a file of its own: a
// section sheet is only meaningful over a placed cage and a real outline, and
// that test already builds both from a designed frame. The sheet's own
// behaviour — concrete, cover line, steel, title, notes, dimensions and the
// bounds enclosing all of it — is asserted there.
//
// Units: geometry m, sections mm.
// ─────────────────────────────────────────────────────────────────────────
import { textWidth, type Drawing, type PlanPrimitive } from './planRenderer'
import { cutCages, cutPrimitives, type CageCut, type CageCutResult } from './cageSection'
import type { RebarCage } from './rebarModel'
import { SHEET_CONCRETE, SHEET_GRID, SHEET_INK, SHEET_NOTE, STEEL, STEEL_LIGHT } from './sheetInk'

/**
 * Characters a note line may use before it wraps, from the width the drawing
 * itself occupies.
 *
 * Floored at 44 so a narrow section (a 200 mm-wide column) does not shred every
 * note into two-word fragments, and capped at 72 so a wide one does not let a
 * long callout run the frame out to a letterbox.
 */
export function noteColumns(availWidth: number, size: number): number {
  const chars = Math.floor(availWidth / Math.max(1e-9, textWidth('x', size)))
  return Math.min(72, Math.max(44, chars))
}

/**
 * Greedy word wrap to `cols` characters. A word longer than `cols` gets its own
 * line rather than being broken — these notes carry clause references like
 * `(§409.7.3.8)` and bar callouts like `4-⌀2001`, and a hyphenated break
 * through one of those changes what it says.
 */
export function wrapText(text: string, cols: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!line) { line = word; continue }
    if (line.length + 1 + word.length <= cols) line += ' ' + word
    else { out.push(line); line = word }
  }
  if (line) out.push(line)
  return out.length ? out : ['']
}

/** The concrete, in the cut plane's own coordinates, m. */
export interface SectionOutline { u0: number; v0: number; u1: number; v1: number }

export interface SectionDetailInput {
  /** Sheet title — 'B1 · MIDSPAN', 'C3 — SECTION'. */
  title: string
  outline: SectionOutline
  /** Every cage the plane passes through. A beam at a column is more than one. */
  cages: RebarCage[]
  cut: CageCut
  /** Clear cover, mm — drawn as the hairline the bars are set off. */
  cover?: number
  /** Dimension the width and the depth. Default true. */
  dims?: boolean
  /** Lines printed under the drawing, in order. */
  notes?: string[]
}

export interface SectionDetailDrawing extends Drawing {
  title: string
  /** What the cut found — for a caller that wants to say how many bars, or how
   *  far the drawn stirrup set really was from the plane. */
  result: CageCutResult
}


/**
 * Build a section through one or more cages.
 *
 * The drawing is to scale in metres, like every other sheet, so a 300×550 beam
 * and a 400×600 column printed side by side are the sizes they are.
 */
export function buildSectionDetail(i: SectionDetailInput): SectionDetailDrawing {
  const P: PlanPrimitive[] = []
  const { u0, v0, u1, v1 } = i.outline
  const w = u1 - u0, h = v1 - v0
  const res = cutCages(i.cages, i.cut)

  // ── concrete ──
  P.push({ kind: 'rect', x: u0, y: v0, w, h, fill: SHEET_CONCRETE, stroke: SHEET_INK, width: 1.3 })
  if (i.cover != null && i.cover > 0) {
    const c = i.cover / 1000
    if (w > 2 * c && h > 2 * c) {
      P.push({
        kind: 'rect', x: u0 + c, y: v0 + c, w: w - 2 * c, h: h - 2 * c,
        fill: 'none', stroke: SHEET_GRID, width: 0.5, dash: [0.02, 0.016],
      })
    }
  }

  // ── the steel, exactly as cut ──
  //
  // A bar dot is floored at 1/50 of the smaller side: a ⌀10 tie bar in a 600 mm
  // column is 1/60 of the section, which at the size a schedule row prints is
  // under a pixel. Drawn true to size it is honest and invisible; the floor is
  // the same convention every section drawing on paper uses.
  P.push(...cutPrimitives(res, {
    bar: STEEL,
    tie: STEEL_LIGHT,
    tieWidth: 1.5,
    minBarRadius: Math.min(w, h) / 100,
  }))

  // ── dimensions, title and notes ─────────────────────────────────────────
  //
  // Every size is a fraction of the LONGER side, so a 250×450 beam and a
  // 400×400 column set their text to the same proportion of the drawing and
  // print at the same size beside each other in a schedule. Fractions of the
  // shorter side instead would print a deep beam's dimensions half the height
  // of a square column's.
  const span = Math.max(w, h)
  const size = span * 0.05
  const off = span * 0.16
  if (i.dims !== false) {
    P.push({
      kind: 'dim', x1: u0, y1: v1 + off, x2: u1, y2: v1 + off,
      text: `${Math.round(w * 1000)}`, off: 0, size: size * 0.9, ext: v1,
    })
    P.push({
      kind: 'dim', x1: u1 + off, y1: v0, x2: u1 + off, y2: v1,
      text: `${Math.round(h * 1000)}`, off: 0, size: size * 0.9, ext: u1,
    })
  }

  P.push({ kind: 'text', x: u0, y: v0 - size * 1.5, text: i.title, size, anchor: 'start', color: SHEET_INK, weight: 700 })
  // Notes WRAP to roughly the drawing's own width. The bounds become the
  // viewBox, so an unwrapped note sets the drawing's aspect: one 100-character
  // callout made the 300x500 section it annotates a third of the frame wide,
  // because the caption had taken the rest. Wrapped, the note block stays
  // beside the section instead of displacing it.
  const noteSize = size * 0.82
  const geomMaxX = u1 + off + size * 1.4
  const noteCols = noteColumns(geomMaxX - u0, noteSize)
  const notes = (i.notes ?? []).flatMap((t) => wrapText(t, noteCols))
  const note0 = v1 + off + size * 2.2
  const noteStep = size * 1.45
  notes.forEach((t, k) => P.push({
    kind: 'text', x: u0, y: note0 + k * noteStep,
    text: t, size: noteSize, anchor: 'start', color: SHEET_NOTE,
  }))

  return {
    title: i.title,
    result: res,
    primitives: P,
    // The bounds become the viewBox, so anything they do not cover is CROPPED.
    // They were sized from the outline and the dimension line alone, and the
    // notes — which start at u0 and run right, unmeasured — were cut off mid-
    // word on the printed sheet. Title and notes now set `maxX` too.
    bounds: {
      minX: u0 - span * 0.06,
      maxX: Math.max(
        geomMaxX,
        u0 + textWidth(i.title, size),
        ...notes.map((t) => u0 + textWidth(t, noteSize)),
      ),
      minY: v0 - size * 2.4,
      maxY: notes.length ? note0 + (notes.length - 1) * noteStep + size : v1 + off + size,
    },
  }
}
