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
import type { Drawing, PlanPrimitive } from './planRenderer'
import { cutCages, cutPrimitives, type CageCut, type CageCutResult } from './cageSection'
import type { RebarCage } from './rebarModel'
import { SHEET_GRID, SHEET_INK, SHEET_NOTE, STEEL, STEEL_LIGHT } from './sheetInk'

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

const CONCRETE = '#eef3f8'

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
  P.push({ kind: 'rect', x: u0, y: v0, w, h, fill: CONCRETE, stroke: SHEET_INK, width: 1.3 })
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
  const notes = i.notes ?? []
  const note0 = v1 + off + size * 2.2
  const noteStep = size * 1.45
  notes.forEach((t, k) => P.push({
    kind: 'text', x: u0, y: note0 + k * noteStep,
    text: t, size: size * 0.82, anchor: 'start', color: SHEET_NOTE,
  }))

  return {
    title: i.title,
    result: res,
    primitives: P,
    bounds: {
      minX: u0 - span * 0.06, maxX: u1 + off + size * 1.4,
      minY: v0 - size * 2.4,
      maxY: notes.length ? note0 + (notes.length - 1) * noteStep + size : v1 + off + size,
    },
  }
}
