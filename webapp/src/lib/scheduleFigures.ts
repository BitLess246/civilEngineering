// ─────────────────────────────────────────────────────────────────────────
// THE FIGURES A SCHEDULE ROW EXPANDS INTO — built once, shown twice.
//
// A beam's row shows its grid line's frame elevation with the stretch the
// row is about washed over, and a cut through its cage at the row's own
// station; a column's row shows its stack, footing to roof, with the storey
// washed, and a cut at mid-height. The accordion drew these and the PDF
// report drew SOMETHING ELSE — a section laid out from the bar COUNT by a
// hundred lines of jsPDF, which could show neither a lap, a crank, nor the
// stirrup set the cage actually placed, and did not have to agree with the
// drawing set about any of it.
//
// So the drawings are decided HERE, as engine `Drawing`s, and both callers
// paint them: `components/modelSpace/figures` with `planToSvg`, `modelPdf`
// with `paintDrawing`. The callout under a section is composed here too,
// because a note that says "3-⌀20 TOP" beside a cut that shows four bars is
// exactly the disagreement this file exists to make impossible — and it was
// composed in a React component, where the report could not reach it.
//
// Pure and synchronous: no React, no jsPDF.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from '../engine/model'
import type { RebarCage } from '../engine/rebarModel'
import { memberSectionDetail } from '../engine/memberSection'
import type { SectionDetailDrawing } from '../engine/sectionDetail'
import { buildFrameElevation, type FrameElevationDrawing } from '../engine/frameElevation'
import { buildColumnStackDetail, type ColumnStackDetailDrawing } from '../engine/columnStackDetail'
import type { ColumnStackBundle, FrameElevationBundle } from './planDetails'

/** The design numbers a section callout prints. Structural rather than the
 *  pipeline's own types, so this file stays free of the design pipeline. */
export interface SectionRowDesign {
  bars: number; sAdopt: number; legs: number; layers: number[]
  comprBars: number; comprLayers: number[]
  flangeAction?: string
}
export interface BeamRowSection {
  x: number; label: string; hogging: boolean
  bf?: number; hf?: number; edge?: boolean; flangeKind?: string
  design: SectionRowDesign
}
export interface SectionRect { b: number; h: number; cover: number; barDia: number; tieDia: number }
export interface ColumnRow {
  id: string; bars: number; tieSpacingFinal: number
  seismicSConf?: number; seismicSOut?: number
}

/** What a beam section's callout says, line by line — the schedule's own
 *  words for the row, printed under the cut that shows them. */
export function beamSectionNotes(sec: BeamRowSection, rect: SectionRect): string[] {
  const d = sec.design
  return [
    `${d.bars}-⌀${rect.barDia}${sec.hogging ? ' TOP' : ' BOT'}${d.layers.length > 1 ? ` (${d.layers.join('+')})` : ''}`,
    ...(d.comprBars > 0 ? [`${d.comprBars}-⌀${rect.barDia} COMPR.`] : []),
    d.sAdopt > 0
      ? `STIRRUPS ${d.legs}L-⌀${rect.tieDia} @ ${Math.round(d.sAdopt)}`
      : `STIRRUPS ⌀${rect.tieDia} @ MIN. (§409.6.3.1)`,
    ...(sec.bf ? [`${sec.flangeKind ?? (sec.edge ? 'L' : 'T')}-BEAM · bf ${Math.round(sec.bf)}${d.flangeAction === 'true-T' ? ' · TRUE T' : ''}`] : []),
  ]
}

/**
 * The SECTION through a beam's cage at the station a schedule row is about.
 *
 * The station is the row's own `x`, so the drawing follows the design along
 * the span: at a support it shows the top steel the hogging check sized, at
 * midspan the bottom steel, and where a bar laps it shows both pieces. A
 * drawing made from the bar COUNT could show none of that.
 */
export function beamSectionDrawing(
  model: StructuralModel, cages: RebarCage[],
  beam: { id: string; L: number }, sec: BeamRowSection, rect: SectionRect,
): SectionDetailDrawing | null {
  return memberSectionDetail(
    model, cages, beam.id, beam.L > 0 ? sec.x / beam.L : 0.5,
    { title: `SECTION — ${sec.label}`, notes: beamSectionNotes(sec, rect) },
  )
}

/** What a column's callout says under its cut. */
export function columnSectionNotes(col: ColumnRow, rect: SectionRect): string[] {
  return [
    `${col.bars}-⌀${rect.barDia} VERT.`,
    col.seismicSConf !== undefined
      ? `TIES ⌀${rect.tieDia} @ ${Math.round(col.seismicSConf)} IN ℓo, @ ${Math.round(col.seismicSOut ?? col.tieSpacingFinal)} ELSEWHERE`
      : `TIES ⌀${rect.tieDia} @ ${Math.round(col.tieSpacingFinal)}`,
  ]
}

/**
 * The SECTION through a column's cage at mid-height — the length between the
 * confinement zones, and so the column's general section. The tie set it
 * draws is the one the cage placed there: the hoop AND the cross ties
 * threaded through it, at the spacing the design adopted.
 */
export function columnSectionDrawing(
  model: StructuralModel, cages: RebarCage[], col: ColumnRow, rect: SectionRect,
): SectionDetailDrawing | null {
  return memberSectionDetail(model, cages, col.id, 0.5, {
    title: 'SECTION — MID-HEIGHT', notes: columnSectionNotes(col, rect),
  })
}

/**
 * The beam's ELEVATION — the drawing set's own sheet for the grid line and
 * level it is on, with the stretch this row speaks for washed over. The wash
 * is what a schedule row adds over a link to the sheet: a row headed "End i"
 * is about the steel over that support, and on an elevation carrying three
 * different arrangements nothing else says which third is being discussed.
 */
export function beamElevationDrawing(
  bundle: FrameElevationBundle, zone?: [number, number], label?: string,
): FrameElevationDrawing {
  return buildFrameElevation(
    zone ? { ...bundle.input, highlight: [{ u0: zone[0], u1: zone[1], label }] } : bundle.input,
    { sheetRef: 'S-04' },
  )
}

/** The column's ELEVATION — its stack sheet, footing to roof, with the storey
 *  this row is about washed over. */
export function columnElevationDrawing(
  bundle: ColumnStackBundle, storey?: { yBot: number; yTop: number }, label?: string,
): ColumnStackDetailDrawing {
  return buildColumnStackDetail(
    storey ? { ...bundle.input, highlight: { ...storey, label } } : bundle.input,
    { sheetRef: 'S-06' },
  )
}

/** The storey of a stack one column MEMBER is — the segment with its mark. */
export function columnStoreyOf(
  bundle: ColumnStackBundle | undefined, memberId: string,
): { yBot: number; yTop: number } | undefined {
  const seg = bundle?.input.segments.find((x) => x.mark === memberId)
  return seg ? { yBot: seg.yBot, yTop: seg.yTop } : undefined
}
