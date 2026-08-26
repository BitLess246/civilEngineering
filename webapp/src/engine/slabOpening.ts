// ─────────────────────────────────────────────────────────────────────────
// SLAB OPENING — trimmer bars for an opening cast through a suspended slab,
// and the detail sheet that draws them.
//
// An opening does not remove reinforcement from the panel; it moves it. The
// bars the hole interrupts were carrying the panel's moment across that line,
// and the load they carried has to go somewhere — it goes around the hole, in
// the strips either side of it. NSCP 2015 §408.5.4.2 (ACI 318-14 §8.5.4.2)
// states the requirement:
//
//   §408.5.4.2(a)  in the area common to two MIDDLE strips, an opening of any
//                  size is permitted provided the total reinforcement in the
//                  panel is at least that required without the opening
//   §408.5.4.2(b)  in the area common to two COLUMN strips, not more than ⅛ of
//                  the column-strip width may be interrupted, and reinforcement
//                  EQUAL TO THAT INTERRUPTED shall be added on the sides of the
//                  opening
//   §408.5.4.2(c)  in the area common to one column and one middle strip, not
//                  more than ¼ of the reinforcement in either strip may be
//                  interrupted, with the same replacement rule
//   §408.5.4.2(d)  the punching-shear provisions of §422.6.4.3 still apply
//
// So the whole detail is three rules:
//
//   1. COUNT the bars each way the opening interrupts, and replace them with
//      bars EQUAL IN NUMBER AND SIZE, half each side, top and bottom.
//   2. DEVELOP them — each replacement bar runs the width of the opening plus
//      ℓd beyond each face (§425.4.2), because it has to reach full fy at the
//      section where the bar it replaces was needed.
//   3. TRIM the corners — a rectangular hole is a re-entrant corner and cracks
//      radiate from it on the 45° diagonal at service load, before any of the
//      above is even mobilised. Diagonal bars across each corner are the crack
//      control (§424.3; ACI R8.5.4), and they are the part most often left off.
//
// Plus the clearance §422.6.4.3 imposes: an opening within 4h of the critical
// section around a column removes part of the shear perimeter, so the detail
// carries a minimum clear distance from the support.
//
// Units: panel geometry and opening m; bar sizes, spacings and thickness mm;
// stresses MPa.
// ─────────────────────────────────────────────────────────────────────────
import type { SlabOpening } from './model'
import { calcDevLength } from './devLength'
import type { PlanPrimitive, Drawing } from './planRenderer'
import { GLYPH_W, wrapNote, measureBounds, notesBlock, titleBlock, leader } from './detailSheet'
import { seeGeneralNotes } from './generalNotes'
import { SHEET_INK, SHEET_NOTE, SHEET_GRID, SHEET_ZONE, SHEET_WARN, STEEL } from './sheetInk'

// ── code constants ─────────────────────────────────────────────────────────

/** §422.6.4.3 — an opening closer than this (× h) to the critical section makes
 *  part of the shear perimeter ineffective. */
export const OPENING_SHEAR_REACH = 4
/** §408.5.4.2(b) — column strip ∩ column strip: at most ⅛ of the strip width. */
export const LIMIT_COLUMN_COLUMN = 1 / 8
/** §408.5.4.2(c) — column strip ∩ middle strip: at most ¼ of either strip. */
export const LIMIT_COLUMN_MIDDLE = 1 / 4
/** Shortest diagonal corner bar worth detailing, mm — the length below which
 *  the bar cannot straddle the corner crack far enough to close it. Practice
 *  note on every standard opening detail; ℓd governs above it. */
export const DIAGONAL_MIN_LENGTH = 1000

// ── geometry ───────────────────────────────────────────────────────────────

export interface OpeningBox { x0: number; y0: number; x1: number; y1: number }

/** Axis-aligned extent of an opening in the plate's local frame, m. Circles are
 *  detailed off their bounding square — the trimmer bars are straight. */
export function openingBox(o: SlabOpening): OpeningBox {
  return o.kind === 'circle'
    ? { x0: o.x - (o.r ?? 0), y0: o.y - (o.r ?? 0), x1: o.x + (o.r ?? 0), y1: o.y + (o.r ?? 0) }
    : { x0: o.x, y0: o.y, x1: o.x + (o.w ?? 0), y1: o.y + (o.h ?? 0) }
}

// ── the counting rule ──────────────────────────────────────────────────────

/**
 * How many bars an opening `cut` metres wide interrupts, at `spacing` mm c/c.
 *
 * The bar grid's PHASE relative to the opening is not known when the detail is
 * drawn — the mat is set out from the panel edge, the hole from the architect's
 * plan — so this returns the largest number that can fall inside the cut:
 * ⌊cut/s⌋ + 1. A 1.0 m opening in a 200 mm mat interrupts 5 bars if the hole
 * lands between bar lines and 6 if it lands on one, and only the 6 is safe to
 * detail. Using cut/s rounded (the obvious way) prints 5 and leaves the panel
 * one bar short of the code's "equal to that interrupted" on half of all
 * set-outs.
 */
export function interruptedBars(cut: number, spacing: number): number {
  if (!(cut > 0) || !(spacing > 0)) return 0
  return Math.floor((cut * 1000) / spacing + 1e-9) + 1
}

/**
 * Replacement bars on ONE side of the opening — half the interrupted count,
 * rounded up (§408.5.4.2(b)/(c) "added on the sides of the opening").
 *
 * Rounding up means an odd count provides one bar MORE than was interrupted,
 * not one less; splitting 5 as 2 + 2 would replace four bars out of five.
 */
export function replacementEachSide(interrupted: number): number {
  return Math.ceil(Math.max(0, interrupted) / 2)
}

/** Length of a diagonal corner bar, mm — ℓd each side of the corner, never
 *  less than `DIAGONAL_MIN_LENGTH`. */
export function diagonalLength(ld: number): number {
  return Math.max(2 * ld, DIAGONAL_MIN_LENGTH)
}

// ── §408.5.4.2 strip limits ────────────────────────────────────────────────

export type StripZone = 'middle-middle' | 'column-middle' | 'column-column'

export interface StripCheck {
  zone: StripZone
  /** Column-strip width, m — 0.25·min(ℓ1, ℓ2) each side of the column line. */
  csWidth: number
  /** Fraction of the governing strip width the opening interrupts, each way. */
  fracX: number
  fracY: number
  /** The §408.5.4.2 limit that applies in this zone (1 = any size). */
  limit: number
  ok: boolean
}

/**
 * Which strips the opening lands in, and whether it is small enough for the
 * §408.5.4.2 alternative to a full analysis.
 *
 * The panel edges ARE the column lines, so a column strip runs
 * 0.25·min(ℓ1, ℓ2) in from each edge and the middle strip is what is left. An
 * opening overlapping a column strip in a direction is "in" it for that
 * direction; landing in one both ways is the (b) case, one way the (c) case,
 * neither the (a) case where any size is permitted.
 */
export function openingStripCheck(b: OpeningBox, lx: number, ly: number): StripCheck {
  const csHalf = Math.min(lx, ly) / 4                 // in from each column line
  const csWidth = Math.min(lx, ly) / 2                // full strip, both sides of the line
  const inColumnStrip = (a0: number, a1: number, L: number) => a0 < csHalf - 1e-9 || a1 > L - csHalf + 1e-9
  const cx = inColumnStrip(b.x0, b.x1, lx), cy = inColumnStrip(b.y0, b.y1, ly)
  const zone: StripZone = cx && cy ? 'column-column' : cx || cy ? 'column-middle' : 'middle-middle'
  const limit = zone === 'column-column' ? LIMIT_COLUMN_COLUMN : zone === 'column-middle' ? LIMIT_COLUMN_MIDDLE : 1
  const fracX = csWidth > 0 ? (b.x1 - b.x0) / csWidth : 0
  const fracY = csWidth > 0 ? (b.y1 - b.y0) / csWidth : 0
  return { zone, csWidth, fracX, fracY, limit, ok: Math.max(fracX, fracY) <= limit + 1e-9 }
}

// ── the trimmer design ─────────────────────────────────────────────────────

export interface SlabOpeningInput {
  /** Panel edge lengths in the plate's local frame, m (corner 0→1, corner 0→3). */
  lx: number
  ly: number
  /** Slab thickness, mm. */
  h: number
  /** The opening, in the plate's local frame (m from corner 0). */
  opening: SlabOpening
  /** Main mat bar diameter, mm. */
  barDia: number
  /** Spacing of the bars that RUN in local x — measured along y, mm. */
  spacingX: number
  /** Spacing of the bars that RUN in local y — measured along x, mm. */
  spacingY: number
  /** Effective depth of each mat, mm. Defaults to h − cover − 1.5·db. */
  dx?: number
  dy?: number
  /** Clear cover to the mat, mm (default 20 — §420.6.1.3.1, slab not exposed). */
  cover?: number
  fc?: number
  fy?: number
  /** Diagonal corner-bar diameter, mm — defaults to the mat bar. */
  diagDia?: number
  /** Plan size of the column at the nearest panel corner, mm (default 0, i.e.
   *  the clearance is measured from the corner node itself). */
  colSize?: number
  /** Panel mark and opening label for the sheet. */
  mark?: string
}

export interface TrimmerDirection {
  /** The direction the replacement bars RUN. */
  dir: 'x' | 'y'
  /** Mat spacing for this direction, mm. */
  spacing: number
  /** Width of the opening ACROSS these bars, m — what sets the count. */
  cut: number
  /** Bars interrupted (phase-independent upper bound). */
  interrupted: number
  /** Replacement bars on each side, per face. */
  eachSide: number
  /** Total added bars this direction: 2 sides × 2 faces × eachSide. */
  total: number
  /** Development length of the replacement bar, mm — §425.4.2.3. */
  ld: number
  /** One replacement bar, mm — the opening plus ℓd beyond each face. */
  barLength: number
  /** Width of the band the added bars occupy beside the opening, m. */
  band: number
  /** The bar fits inside the panel without hooking at the support. */
  fitsSpan: boolean
}

export interface DiagonalTrimmer {
  /** Re-entrant corners trimmed (4 for a rectangle; a circle is trimmed off its
   *  bounding square, which is what the straight bars can follow). */
  corners: number
  /** Bars per corner, per face. */
  perFace: number
  dia: number
  /** Length of one diagonal bar, mm. */
  length: number
  /** Total bars: corners × faces × perFace. */
  total: number
}

export interface SlabOpeningResult {
  box: OpeningBox
  /** Bars running in local x (interrupted across the opening's y extent). */
  x: TrimmerDirection
  /** Bars running in local y. */
  y: TrimmerDirection
  diagonal: DiagonalTrimmer
  strip: StripCheck
  /** Clear distance from the opening to each panel edge, m. */
  edgeClear: { x0: number; x1: number; y0: number; y1: number }
  /** Clear distance from the opening to the nearest panel corner (column), m. */
  cornerClear: number
  /** Clear distance §422.6.4.3 wants there, m. */
  shearClear: number
  shearOK: boolean
  /** Both replacement bands fit between the opening and the supports. */
  bandFits: boolean
  ok: boolean
  /** The PROBLEMS only — every entry here is a rule the opening does not meet,
   *  so a caller can print them as warnings without having to tell them apart
   *  from commentary. Empty ⇔ `ok`. */
  notes: string[]
}

/**
 * Development length of a slab mat bar, mm (§425.4.2.3).
 *
 * A slab mat has no transverse reinforcement, so Ktr = 0 and the confinement
 * term is cover-and-spacing only: cb is the lesser of the cover to the bar
 * centre and half the clear bar spacing (§425.4.2.2), capped at 2.5.
 */
function matDevLength(db: number, spacing: number, cover: number, h: number, fc: number, fy: number): number {
  const cb = Math.min(cover + db / 2, spacing / 2)
  // ψt = 1.3 only where >300 mm of fresh concrete is cast below the bar
  // (§425.4.2.4) — a top mat in an ordinary slab has far less than that.
  const topBar = h - cover - db / 2 > 300
  return calcDevLength({
    db, fc, fy, topBar, epoxy: 'none', lambda: 1,
    cbKtr_db: Math.min(cb / db, 2.5),
  }).ld
}

/** Design the trimmer bars for one opening. */
export function designSlabOpening(i: SlabOpeningInput): SlabOpeningResult {
  const notes: string[] = []
  const lx = Math.max(i.lx, 0), ly = Math.max(i.ly, 0)
  const cover = i.cover ?? 20
  const fc = i.fc ?? 21, fy = i.fy ?? 415
  const db = Math.max(i.barDia, 1)
  const b = openingBox(i.opening)
  const ox = Math.max(0, b.x1 - b.x0), oy = Math.max(0, b.y1 - b.y0)

  const trimmer = (
    dir: 'x' | 'y', spacing: number, cut: number, along: number, span: number,
  ): TrimmerDirection => {
    const s = Math.max(spacing, 1)
    const interrupted = interruptedBars(cut, s)
    const eachSide = replacementEachSide(interrupted)
    const ld = matDevLength(db, s, cover, i.h, fc, fy)
    const barLength = along * 1000 + 2 * ld
    return {
      dir, spacing: s, cut, interrupted, eachSide, total: eachSide * 4, ld,
      barLength, band: (eachSide * s) / 1000,
      fitsSpan: span <= 0 || barLength <= span * 1000 + 1e-6,
    }
  }
  // Bars running in x are cut where they cross the opening: the opening's Y
  // extent decides HOW MANY, its X extent how LONG the replacement is.
  const x = trimmer('x', i.spacingX, oy, ox, lx)
  const y = trimmer('y', i.spacingY, ox, oy, ly)

  const diagDia = i.diagDia ?? db
  const ldDiag = matDevLength(diagDia, Math.min(i.spacingX, i.spacingY), cover, i.h, fc, fy)
  const diagonal: DiagonalTrimmer = {
    corners: 4, perFace: 1, dia: diagDia, length: diagonalLength(ldDiag), total: 8,
  }

  const strip = openingStripCheck(b, lx, ly)

  const edgeClear = { x0: b.x0, x1: Math.max(0, lx - b.x1), y0: b.y0, y1: Math.max(0, ly - b.y1) }
  // Distance from the opening to the nearest panel corner — where the column
  // is, and the only place §422.6.4.3 is about.
  const dist = (cx: number, cy: number) =>
    Math.hypot(Math.max(b.x0 - cx, cx - b.x1, 0), Math.max(b.y0 - cy, cy - b.y1, 0))
  const cornerClear = Math.min(dist(0, 0), dist(lx, 0), dist(0, ly), dist(lx, ly))
  const d = Math.max(i.dx ?? 0, i.dy ?? 0) || Math.max(i.h - cover - 1.5 * db, 10)
  // critical section at d/2 from the column face, plus the 4h reach
  const shearClear = ((i.colSize ?? 0) / 2 + d / 2 + OPENING_SHEAR_REACH * i.h) / 1000
  const shearOK = cornerClear >= shearClear - 1e-9

  const bandFits =
    x.band <= Math.min(edgeClear.y0, edgeClear.y1) + 1e-9 &&
    y.band <= Math.min(edgeClear.x0, edgeClear.x1) + 1e-9

  if (!strip.ok) {
    notes.push(
      strip.zone === 'column-column'
        ? `opening interrupts ${(Math.max(strip.fracX, strip.fracY) * 100).toFixed(0)}% of the column strip where two column strips intersect — §408.5.4.2(b) permits ⅛; design the panel by analysis (§408.5.4.1) instead`
        : `opening interrupts ${(Math.max(strip.fracX, strip.fracY) * 100).toFixed(0)}% of a strip — §408.5.4.2(c) permits ¼; design the panel by analysis (§408.5.4.1) instead`,
    )
  }
  if (!shearOK) {
    notes.push(`opening is ${cornerClear.toFixed(2)} m from the column, inside the ${shearClear.toFixed(2)} m (4h beyond the critical section) §422.6.4.3 reach — deduct the ineffective perimeter from the punching check`)
  }
  if (!bandFits) {
    notes.push('replacement bars do not fit between the opening and the support face at mat spacing — bunch them at reduced spacing (≥ the §425.2.1 clear spacing) or thicken the panel')
  }
  if (!x.fitsSpan || !y.fitsSpan) {
    notes.push(`replacement bar is longer than the panel — hook it at the support face to develop fy (§425.4.3)`)
  }
  return {
    box: b, x, y, diagonal, strip, edgeClear, cornerClear, shearClear,
    shearOK, bandFits, ok: strip.ok && shearOK && bandFits && x.fitsSpan && y.fitsSpan, notes,
  }
}

// ── the detail sheet ───────────────────────────────────────────────────────

export interface SlabOpeningDetailOptions { detailNo?: string; sheetRef?: string; scale?: string }
export interface SlabOpeningDrawing extends Drawing {
  title: string
  result: SlabOpeningResult
  /** Why this arrangement, and what limits it — for the engineer, not the sheet. */
  designNotes: string[]
}

const INK = SHEET_INK, REBAR = STEEL, GRID = SHEET_GRID, NOTE = SHEET_NOTE, ACCENT = SHEET_ZONE, WARN = SHEET_WARN

/**
 * Mean glyph width as a fraction of the font size, for Arial CAPITALS — used
 * only to keep note lines inside the sheet, never for geometry.
 *
 * 0.55 is the figure usually quoted for mixed-case Arial and it is too small
 * here: drawing notes are set in capitals, where M/W/§ carry the average up.
 * At 0.55 the wrapped notes ran off the right edge of the rendered sheet.
 *
 * Continuation lines are NOT indented, for the same reason — an SVG <text>
 * collapses its leading whitespace, so the indent would only ever exist in the
 * string and in this wrap's character count.
 */

/** Wrap a note to `max` characters a line, breaking on spaces. A drawing note
 *  that runs off the sheet edge is not a note. */

/** Clip a segment to the panel rectangle (Liang–Barsky), so no bar is ever
 *  drawn outside the slab it is cast in. Returns null when it lies wholly out. */
function clipToPanel(
  x1: number, y1: number, x2: number, y2: number, lx: number, ly: number,
): [number, number, number, number] | null {
  const dx = x2 - x1, dy = y2 - y1
  let t0 = 0, t1 = 1
  for (const [p, q] of [[-dx, x1], [dx, lx - x1], [-dy, y1], [dy, ly - y1]] as const) {
    if (Math.abs(p) < 1e-12) { if (q < 0) return null; continue }
    const t = q / p
    if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t } else { if (t < t0) return null; if (t < t1) t1 = t }
  }
  return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy]
}

/**
 * Build the opening detail — a PLAN of the panel with the trimmer bars drawn.
 *
 * Local x runs right and local y runs DOWN the sheet (the plan convention the
 * framing plan already uses, where the serializer's Y increases downward), so
 * the plate's corner 0 is the top-left corner of the drawing.
 */
export function buildSlabOpeningDetail(i: SlabOpeningInput, opts: SlabOpeningDetailOptions = {}): SlabOpeningDrawing {
  const r = designSlabOpening(i)
  const P: PlanPrimitive[] = []
  const lx = Math.max(i.lx, 0.5), ly = Math.max(i.ly, 0.5)
  const b = r.box
  const mark = i.mark ?? 'S1'
  // one text scale for the whole sheet, tied to the panel so a 3 m and an 8 m
  // panel read the same
  const u = Math.max(lx, ly) / 40
  const bandW = Math.min(lx, ly) * 0.045          // drawn width of the support band

  // ── panel, with its supporting beams shown as an edge band ──
  P.push({ kind: 'rect', x: 0, y: 0, w: lx, h: ly, stroke: INK, width: 1.4, fill: '#f8fafc' })
  P.push({ kind: 'rect', x: bandW, y: bandW, w: lx - 2 * bandW, h: ly - 2 * bandW, stroke: GRID, width: 0.8, fill: '#ffffff' })

  // ── column strips, so the §408.5.4.2 zone the opening lands in is visible ──
  const csHalf = Math.min(lx, ly) / 4
  for (const [x0, w] of [[0, csHalf], [lx - csHalf, csHalf]] as const)
    P.push({ kind: 'rect', x: x0, y: 0, w, h: ly, stroke: ACCENT, width: 0.5, fill: 'rgba(15,118,110,0.045)', dash: [u * 2.5, u * 2] })
  for (const [y0, h] of [[0, csHalf], [ly - csHalf, csHalf]] as const)
    P.push({ kind: 'rect', x: 0, y: y0, w: lx, h, stroke: ACCENT, width: 0.5, fill: 'rgba(15,118,110,0.045)', dash: [u * 2.5, u * 2] })

  // ── the opening itself ──
  if (i.opening.kind === 'circle') {
    P.push({ kind: 'circle', cx: i.opening.x, cy: i.opening.y, r: Math.max(i.opening.r ?? 0, 0.01), stroke: INK, width: 1.4, fill: '#e2e8f0' })
  } else {
    P.push({ kind: 'rect', x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0, stroke: INK, width: 1.4, fill: '#e2e8f0' })
  }
  // void mark — the same corner-to-corner X the framing plan uses for no slab
  P.push({ kind: 'line', x1: b.x0, y1: b.y0, x2: b.x1, y2: b.y1, stroke: INK, width: 0.7 })
  P.push({ kind: 'line', x1: b.x0, y1: b.y1, x2: b.x1, y2: b.y0, stroke: INK, width: 0.7 })

  // ── replacement bars, half each side ──
  //
  // Drawn at the mat spacing, but never outside the panel: where the band does
  // not fit (the `bandFits` warning) the bars are drawn BUNCHED into the slab
  // that is actually there, which is what the note tells the detailer to do.
  // Dropping the ones that do not fit would draw fewer bars than the design
  // provides, and a sheet that draws less than it designed is the defect.
  const pitch = (clear: number, n: number, s: number) =>
    n > 0 ? Math.min(s / 1000, Math.max(clear - bandW * 0.5, 0.02) / n) : 0
  const ldX = r.x.ld / 1000, ldY = r.y.ld / 1000
  const pxTop = pitch(r.edgeClear.y0, r.x.eachSide, r.x.spacing)
  const pxBot = pitch(r.edgeClear.y1, r.x.eachSide, r.x.spacing)
  const pyLeft = pitch(r.edgeClear.x0, r.y.eachSide, r.y.spacing)
  const pyRight = pitch(r.edgeClear.x1, r.y.eachSide, r.y.spacing)
  for (let k = 1; k <= r.x.eachSide; k++) {
    for (const yy of [b.y0 - k * pxTop, b.y1 + k * pxBot]) {
      P.push({ kind: 'line', x1: Math.max(b.x0 - ldX, 0.01), y1: yy, x2: Math.min(b.x1 + ldX, lx - 0.01), y2: yy, stroke: REBAR, width: 1.2 })
    }
  }
  for (let k = 1; k <= r.y.eachSide; k++) {
    for (const xx of [b.x0 - k * pyLeft, b.x1 + k * pyRight]) {
      P.push({ kind: 'line', x1: xx, y1: Math.max(b.y0 - ldY, 0.01), x2: xx, y2: Math.min(b.y1 + ldY, ly - 0.01), stroke: REBAR, width: 1.2 })
    }
  }

  // ── diagonal corner bars ──
  // Each bar is centred just outside a corner and runs PERPENDICULAR to the
  // 45° crack radiating from it — that is what makes it a trimmer rather than
  // a bar lying along the crack it is meant to close.
  const dL = r.diagonal.length / 1000
  const corners: [number, number, number, number][] = [
    [b.x0, b.y0, -1, -1], [b.x1, b.y0, 1, -1], [b.x1, b.y1, 1, 1], [b.x0, b.y1, -1, 1],
  ]
  const diagMids: [number, number][] = []
  for (const [cx, cy, sx, sy] of corners) {
    const o = 0.05                                   // stand the bar off the corner
    const px = cx + (sx * o) / Math.SQRT2, py = cy + (sy * o) / Math.SQRT2
    // crack direction (sx, sy)/√2 → bar direction is its perpendicular
    const ux = -sy / Math.SQRT2, uy = sx / Math.SQRT2
    const seg = clipToPanel(px - (ux * dL) / 2, py - (uy * dL) / 2, px + (ux * dL) / 2, py + (uy * dL) / 2, lx, ly)
    if (!seg) continue
    P.push({ kind: 'line', x1: seg[0], y1: seg[1], x2: seg[2], y2: seg[3], stroke: REBAR, width: 1.4 })
    diagMids.push([(seg[0] + seg[2]) / 2, (seg[1] + seg[3]) / 2])
  }

  // ── dimensions: a full chain each way, so the opening is set out ──
  const dimY = ly + u * 3.2, dimX = lx + u * 3.2
  // `ext` reaches back to the far edge of the panel, so each link of the chain
  // is tied to the opening face or panel edge it is set out from.
  const chain = (a: number, c: number, horiz: boolean) => P.push(horiz
    ? { kind: 'dim', x1: a, y1: dimY, x2: c, y2: dimY, text: `${Math.round((c - a) * 1000)}`, off: 0, size: u * 1.5, ext: ly }
    : { kind: 'dim', x1: dimX, y1: a, x2: dimX, y2: c, text: `${Math.round((c - a) * 1000)}`, off: 0, size: u * 1.5, ext: lx })
  chain(0, b.x0, true); chain(b.x0, b.x1, true); chain(b.x1, lx, true)
  chain(0, b.y0, false); chain(b.y0, b.y1, false); chain(b.y1, ly, false)

  // ── callouts ──
  //
  // Short on the drawing, full in the notes. The long form printed here first,
  // and the x callout ran straight through the rotated y one — the drawing has
  // room for a bar mark and a leader, not for a sentence.
  const bar = (n: number, dia: number, len: number) => `${n}-⌀${Math.round(dia)} × ${Math.round(len)}`
  const midX = (b.x0 + b.x1) / 2, midY = (b.y0 + b.y1) / 2

  // Each callout is clamped into the strip of sheet that belongs to it: an
  // opening near an edge otherwise pushes its callout out of the drawing and
  // into the title block or the dimension chain, which is where the x callout
  // landed on top of the panel-size line the first time this was rendered.
  const cxY = Math.max(b.y0 - r.x.eachSide * pxTop - u * 1.5, -u * 0.6)
  P.push(...leader({
    x: midX, y: b.y0 - r.x.eachSide * pxTop,
    tx: midX + u * 3.0, ty: cxY,
    text: bar(r.x.eachSide, i.barDia, r.x.barLength), size: u * 1.3, color: REBAR,
  }))

  const cyX = Math.min(b.x1 + r.y.eachSide * pyRight + u * 1.5, lx + u * 1.0)
  // The y bars' callout runs UPWARD out of the sheet rather than rotating the
  // label: a rotated leader cannot carry a horizontal landing.
  P.push(...leader({
    x: b.x1 + r.y.eachSide * pyRight, y: midY,
    tx: cyX + u * 1.2, ty: midY - u * 2.4,
    text: bar(r.y.eachSide, i.barDia, r.y.barLength), size: u * 1.3, color: REBAR, side: 'left',
  }))

  // The label lives INSIDE the hole, so it is sized to the hole — at a fixed
  // size a 600 mm opening in a 9 m panel wore its label out past the trimmer
  // bars and into the y callout.
  const labelSize = Math.min(u * 1.3, (0.9 * (b.x1 - b.x0)) / ('OPENING'.length * GLYPH_W))
  if (labelSize > u * 0.5) P.push({ kind: 'text', x: midX, y: midY, text: 'OPENING', size: labelSize, anchor: 'middle', color: INK, weight: 700 })

  const cdY = Math.min(b.y1 + r.x.eachSide * pxBot + u * 2.2, ly + u * 1.2)
  // …to the NEAREST corner bar. Leading to the first one drew the leader
  // straight across the opening.
  const near = diagMids.reduce<[number, number] | null>((best, m) =>
    !best || Math.hypot(m[0] - midX, m[1] - cdY) < Math.hypot(best[0] - midX, best[1] - cdY) ? m : best, null)
  if (near) P.push(...leader({
    x: near[0], y: near[1],
    tx: midX + u * 3.0, ty: cdY,
    text: `⌀${Math.round(r.diagonal.dia)} × ${Math.round(r.diagonal.length)} DIAG.`,
    size: u * 1.3, color: REBAR,
  }))

  // ── notes: what to place around this opening ───────────────────────────
  const notes: string[] = [
    `INTERRUPTED: ${r.x.interrupted}-⌀${Math.round(i.barDia)} IN X (MAT @ ${Math.round(r.x.spacing)}), ${r.y.interrupted}-⌀${Math.round(i.barDia)} IN Y (MAT @ ${Math.round(r.y.spacing)})`,
    `PROVIDE: ${bar(r.x.eachSide, i.barDia, r.x.barLength)} IN X AND ${bar(r.y.eachSide, i.barDia, r.y.barLength)} IN Y — EACH SIDE, EACH FACE`,
    `TRIMMER BARS EXTEND ℓd = ${Math.round(r.x.ld)} (X) / ${Math.round(r.y.ld)} (Y) BEYOND EACH FACE OF THE OPENING`,
    `${r.diagonal.perFace}-⌀${Math.round(r.diagonal.dia)} × ${Math.round(r.diagonal.length)} DIAGONAL AT EVERY RE-ENTRANT CORNER, EACH FACE`,
    `KEEP OPENING ${Math.round(r.shearClear * 1000)} MIN. CLEAR OF THE COLUMN`,
    seeGeneralNotes(),
  ]

  /** Why this arrangement, and what it is limited by — for the engineer. */
  const designNotes: string[] = [
    r.strip.zone === 'middle-middle'
      ? `${i.mark}: middle ∩ middle strip — §408.5.4.2(a) permits any size provided the total panel reinforcement is maintained, which the added bars do`
      : `${i.mark}: ${r.strip.zone.replace('-', ' ∩ ')} strip — limit ${(r.strip.limit * 100).toFixed(1)}% of the strip, interrupted ${(Math.max(r.strip.fracX, r.strip.fracY) * 100).toFixed(0)}%`,
    `${i.mark}: the opening is ${Math.round(r.shearClear * 1000)} from the column face — 4h beyond the critical section (§422.6.4.3)`,
    ...r.notes.map((t) => `${i.mark}: ${t}`),
  ]

  const noteSize = u * 1.15
  // The notes are anchored at x = 0, so the width they may use is what lies to
  // the RIGHT of the panel origin — not the full sheet, which also spans the
  // left margin the title bubble sits in.
  const sheetW = lx + u * 8.5
  const noteTop = ly + u * 6.4
  const plain = notes
  const warn: string[] = []
  const nb = notesBlock({ x: 0, w: sheetW, top: noteTop, size: noteSize, lines: plain, color: NOTE, step: u * 1.8 })
  P.push(...nb.prims)
  const wb = warn.length
    ? notesBlock({ x: 0, w: sheetW, top: nb.bottom + u * 1.8, size: noteSize, lines: warn, color: WARN, step: u * 1.8 })
    : { prims: [], bottom: nb.bottom }
  P.push(...wb.prims)

  // ── title block, at the BOTTOM like every other detail sheet ──
  const title = `SLAB OPENING DETAIL — ${mark}`
  const tb = titleBlock({
    x: 0, w: sheetW, top: wb.bottom + u * 2.6, u: u * 0.85,
    title, detailNo: opts.detailNo, sheetRef: opts.sheetRef ?? 'S-08', scale: opts.scale,
  })
  P.push(...tb.prims)
  P.push({ kind: 'text', x: lx, y: -u * 2.3, text: `PANEL ${lx.toFixed(2)} × ${ly.toFixed(2)} m · SLAB ${Math.round(i.h)} THK`, size: u * 1.2, anchor: 'end', color: ACCENT })

  const sb = measureBounds(P, { minX: -u * 5.4, maxX: sheetW, minY: -u * 4.0, maxY: tb.bottom })
  return {
    primitives: P,
    title,
    result: r,
    designNotes,
    bounds: { minX: sb.minX - u, minY: sb.minY - u, maxX: sb.maxX + u, maxY: sb.maxY + u },
  }
}

// Re-exported so the existing callers and tests keep their import site; the
// implementation now lives in `detailSheet` as a single copy.
export { GLYPH_W, wrapNote }
