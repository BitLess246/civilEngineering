// ─────────────────────────────────────────────────────────────────────────
// A PDF of plan sheets on their own — Plan Studio's export.
//
// The same chrome as every other document (`pdfKit`: letterhead, the user's
// PDF appearance, cover page, footers) and the same sheet painter as the
// structure report's Drawings section (`paintSheetSet`), so a sheet prints
// identically whichever document it is in. The header says what the set is
// and is not: drawings to the entered dimensions, not a design check.
// ─────────────────────────────────────────────────────────────────────────
import type { LetterheadState } from '../components/calc'
import { createSheet, type Sheet } from './pdfKit'
import { loadPdfStyle, type PdfStyle } from './pdfStyle'
import { paintSheetSet } from './modelPdf'
import { COMPUTED_BY, docLabel as brandDocLabel } from './brand'
import type { PlanSheet } from './planSheets'

export interface SheetsPdfInput {
  /** The document's title — 'Plan Studio — Frame elevations'. */
  title: string
  sheets: readonly PlanSheet[]
  lh?: LetterheadState
  badges?: string[]
  style?: PdfStyle
  fileName?: string
}

const NOT_A_CHECK = 'Drawn to the entered dimensions and reinforcement. Nothing on these sheets has been checked against loads; the engineer of record sizes the members and the steel.'

/**
 * Paint the set into a sheet the caller owns, through the disclaimer, without
 * footers — so a test can watch `doc.text` on the sheet it hands in (the
 * finished PDF's text is glyph codes, not strings). Returns what the footers
 * need.
 */
export function paintSheetsInto(sh: Sheet, i: SheetsPdfInput): { today: string; sheet: string; docLabel: string; project: string } {
  const today = new Date().toISOString().slice(0, 10)
  const lh = i.lh ?? { project: '', sheet: '', preparedBy: '' }
  const sheet = lh.sheet || 'S-PS'
  const badges = i.badges ?? ['NSCP 2015', 'ACI 318-14']
  const docLabel = brandDocLabel(i.title)
  if (sh.style.coverPage) {
    sh.coverPage({
      title: i.title, subtitle: lh.project || undefined,
      rows: [['Sheet', sheet], ['Sheets', String(i.sheets.length)], ['Prepared by', lh.preparedBy], ['Date', today], ['Codes', badges.join(' · ')]],
    })
  }
  sh.brandHeader({
    docLabel, title: i.title, sheet, today, ok: true, badges,
    verdictLabel: 'DRAWINGS', verdictTone: 'neutral',
    governing: `${i.sheets.length} sheet${i.sheets.length === 1 ? '' : 's'} · not a design check`,
  })
  sh.letterheadGrid([
    ['PROJECT', lh.project || '—', false], ['SHEET', sheet, true],
    ['PREPARED BY', lh.preparedBy || '—', false], ['DATE', today, true],
    ['CONTENTS', [...new Set(i.sheets.map((s) => s.group))].join(' · ') || '—', false], ['CODES', badges.join(' · '), true],
  ])
  let n = 0
  paintSheetSet(sh, i.sheets, 'Drawings', () => ++n)
  sh.signatures(lh.preparedBy)
  sh.disclaimer(`${COMPUTED_BY} ${NOT_A_CHECK}`)
  return { today, sheet, docLabel, project: lh.project }
}

/** The sheets as a document, unsaved. */
export function buildSheetsPdf(i: SheetsPdfInput): { doc: Sheet['doc']; today: string } {
  const sh = createSheet(i.style ?? loadPdfStyle())
  const { today, sheet, docLabel, project } = paintSheetsInto(sh, i)
  sh.pageFooters(docLabel, sheet, today, project)
  return { doc: sh.doc, today }
}

/** Build and download. Browser only. */
export async function generateSheetsPdf(i: SheetsPdfInput): Promise<void> {
  const { doc, today } = buildSheetsPdf(i)
  doc.save(i.fileName ?? `${i.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${today}.pdf`)
}
