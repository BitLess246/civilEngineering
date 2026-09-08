// ─────────────────────────────────────────────────────────────────────────
// THE SECTION A STANDALONE CALCULATOR DRAWS — cut from a cage, like the sheets.
//
// The calculators drew their own: a rounded rectangle standing in for the
// stirrup, dots spread from a bar COUNT, a hook stub at one corner. That is a
// picture OF a cage rather than the cage, and it could show none of what a
// section is looked at for — a second layer, a cross tie, the 135° returns, the
// spacing the design adopted — nor did it have to agree with the drawing set
// about any of it. The Model Space schedule stopped doing this in #695; the
// calculators had no model to cut, so they kept their own.
//
// They do not need one. `buildSectionDetail` cuts CAGES, and a calculator has
// everything a cage is built from: it has just designed it. So the page builds
// the bars it designed, on a nominal span, and cuts them — the same geometry
// `memberSectionDetail` cuts for a modelled member, differing only in where the
// numbers came from.
//
// WHAT A CUT CANNOT SAY, this file adds as notes rather than dropping: d and d′
// are design results, not steel, and a section that cannot fit its own steel is
// a sentence, not a shape.
//
// Units: sections mm, drawing geometry m.
// ─────────────────────────────────────────────────────────────────────────
import { buildBeamCage } from '../engine/beamCage'
import { buildColumnCage } from '../engine/columnCage'
import { memberCut } from '../engine/cageSection'
import { buildSectionDetail, type SectionDetailDrawing } from '../engine/sectionDetail'

/** A nominal span for the cage, m. A calculator designs a SECTION, and the
 *  span only decides where the curtailment and the stirrup zones fall — the
 *  cut is taken where the designed steel is, so the figure is the same for any
 *  span long enough to have a midspan. */
const NOMINAL_SPAN = 6

export interface CalcBeamSectionInput {
  b: number
  h: number
  cover: number
  barDia: number
  stirrupDia: number
  /** Bars the flexural check sized, on the tension face. */
  bars: number
  /** Compression bars, where the check placed any. */
  comprBars?: number
  /** −Mu: the tension steel is at the TOP and the cut is taken at a support. */
  hogging?: boolean
  /** Adopted stirrup spacing, mm. Zero or absent → the cage's own minimum. */
  spacing?: number
  /** Effective depth, mm — dimensioned from the compression face. */
  d?: number
  title?: string
  notes?: string[]
}

/**
 * A beam section, cut from the cage the page has just designed.
 *
 * Hogging is cut at a support and sagging at midspan, because that is where
 * each face's designed steel actually is: a cage curtails, so a cut taken
 * anywhere else would show a different bar count from the one the check used.
 */
export function calcBeamSection(i: CalcBeamSectionInput): SectionDetailDrawing {
  const L = NOMINAL_SPAN
  const s = i.spacing && i.spacing > 0 ? i.spacing : Math.max(50, Math.round(i.h / 2))
  const hM = i.h / 1000
  const cage = buildBeamCage({
    mark: 'B', L, b: i.b, h: i.h, cover: i.cover, barDia: i.barDia, stirrupDia: i.stirrupDia,
    topBars: i.hogging ? i.bars : (i.comprBars ?? 0),
    botBars: i.hogging ? (i.comprBars ?? 0) : i.bars,
    sEnd: s, sMid: s,
    axis: { x0: 0, z0: 0, x1: L, z1: 0 }, ySoffit: 0,
    continuousLeft: false, continuousRight: false,
  })
  // The node line is the beam's TOP face, which is where `sectionOutline` puts
  // v = 0 — so the cutting axis runs at the soffit plus the depth.
  const t = i.hogging ? 0.06 : 0.5
  const cut = memberCut([0, hM, 0], [L, hM, 0], t)
  return buildSectionDetail({
    title: i.title ?? `SECTION — ${i.b}×${i.h}`,
    outline: { u0: -i.b / 2000, v0: 0, u1: i.b / 2000, v1: hM },
    cages: [cage], cut, cover: i.cover,
    notes: [
      ...(i.d ? [`d = ${Math.round(i.d)} TO THE ${i.hogging ? 'BOTTOM' : 'TOP'} FACE`] : []),
      ...(i.notes ?? []),
    ],
  })
}

export interface CalcColumnSectionInput {
  b: number
  h: number
  cover: number
  barDia: number
  tieDia: number
  bars: number
  /** Tie spacing adopted, mm — and the confined spacing where the design has
   *  one, since that is what the cut at mid-height would NOT show. */
  spacing: number
  confined?: number
  title?: string
  notes?: string[]
}

/**
 * A column section at mid-height — the length between the confinement zones,
 * and so the column's general section. The tie set is the one the cage places
 * there: the hoop AND the cross ties threaded through it.
 */
export function calcColumnSection(i: CalcColumnSectionInput): SectionDetailDrawing {
  const H = 3
  const cage = buildColumnCage({
    mark: 'C', b: i.b, h: i.h, cover: i.cover, barDia: i.barDia, bars: i.bars, tieDia: i.tieDia,
    sConfined: i.confined && i.confined > 0 ? i.confined : i.spacing,
    sOutside: i.spacing, lo: i.confined && i.confined > 0 ? Math.max(450, i.h) : 0,
    centre: [0, 0], yBottom: 0, yTop: H,
  })
  return buildSectionDetail({
    title: i.title ?? `SECTION — ${i.b}×${i.h}`,
    // A column is read as a plan: h across the page, b down it.
    outline: { u0: -i.h / 2000, v0: -i.b / 2000, u1: i.h / 2000, v1: i.b / 2000 },
    cages: [cage], cut: memberCut([0, 0, 0], [0, H, 0], 0.5), cover: i.cover,
    notes: i.notes,
  })
}
