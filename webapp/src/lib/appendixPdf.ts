// ─────────────────────────────────────────────────────────────────────────
// The ANALYSIS APPENDIX as pages — and the report and appendix bound as one.
//
// Painted from `analysisAppendix`'s tables on the same `pdfKit` chrome as the
// design report, so the two read as sheets of one set. A section the engine
// never produced is printed as one line saying so, not left out silently and
// not filled in.
//
// `paintAnalysisAppendix` paints INTO a sheet the caller owns, which is what
// lets the combined document run the design report first and the appendix
// after it, with one set of page footers over both.
// ─────────────────────────────────────────────────────────────────────────
import type { LetterheadState } from '../components/calc'
import { docLabel as brandDocLabel } from './brand'
import { paintDrawing, paintedSize } from './drawingPdf'
import { createSheet, autoTable, type Sheet, INK, MUTED, FAINT, M, CONTENT_W, PAGE_W } from './pdfKit'
import type { AnalysisAppendix, AppendixKey, AppendixSection, StatusRow } from './analysisAppendix'
import { buildModelPdfInto, type ModelPdfInput } from './modelPdf'

export interface AppendixPdfInput {
  lh: LetterheadState
  appendix: AnalysisAppendix
  badges: string[]
  /** Which sections to print. Omitted → every section. */
  include?: AppendixKey[]
  fileName?: string
}

/** The status table — verdicts as the engine reported them. */
export function paintStatusTable(sh: Sheet, status: StatusRow[], heading?: string): void {
  const { doc } = sh
  if (heading) {
    sh.ensure(24)
    sh.setF('sans', 'bold', 8, INK)
    doc.text(heading, M, sh.y)
    sh.y += 2.5
  }
  sh.ensure(20)
  autoTable(doc, {
    ...sh.tableTheme(),
    startY: sh.y,
    head: [['Check', 'Status', 'Detail']],
    body: status.map((r) => [r.check, r.verdict, r.detail]),
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 48 }, 1: { font: 'mono', fontStyle: 'bold', cellWidth: 22 } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (d: any) => {
      if (d.section !== 'body' || d.column.index !== 1) return
      const v = String(d.cell.raw)
      d.cell.styles.textColor = v === 'PASS' || v === 'COMPLETE' ? [20, 96, 58] : v === 'FAIL' ? [194, 64, 42] : v === 'ADVISORY' ? [180, 120, 20] : [163, 157, 141]
    },
  })
  sh.y = (sh.lastY() ?? sh.y) + 5
}

function paintSection(sh: Sheet, s: AppendixSection): void {
  const { doc } = sh
  sh.rule(0, `Appendix ${s.letter} — ${s.title}`)
  if (!s.available) {
    sh.setF('sans', 'normal', 7, MUTED)
    doc.text(`Not available: ${s.unavailable ?? 'the engine produced no result for this section.'}`, M, sh.y)
    sh.y += 6
    return
  }
  if (s.stats?.length) sh.statCards(s.stats)
  for (const n of s.notes ?? []) {
    sh.ensure(10)
    sh.setF('sans', 'normal', 6.6, MUTED)
    for (const w of doc.splitTextToSize(n, CONTENT_W)) { sh.ensure(3.4); doc.text(w, M, sh.y); sh.y += 3.2 }
    sh.y += 2
  }
  for (const f of s.figures ?? []) {
    const box = { x: M, y: 0, w: CONTENT_W, maxH: 95 }
    const z = paintedSize(f.drawing, box)
    sh.ensure(z.height + 10)
    paintDrawing(doc, f.drawing, { ...box, y: sh.y, x: M + (CONTENT_W - z.width) / 2 })
    sh.y += z.height + 2
    sh.setF('sans', 'normal', 6, MUTED)
    doc.text(doc.splitTextToSize(f.caption, CONTENT_W), M, sh.y)
    sh.y += 5
  }
  for (const t of s.tables) {
    sh.ensure(24)
    sh.setF('sans', 'bold', 8, INK)
    doc.text(t.title, M, sh.y)
    sh.y += 2.5
    autoTable(doc, {
      ...sh.tableTheme(t.right ?? []),
      startY: sh.y,
      head: [t.head],
      body: t.rows,
      rowPageBreak: 'avoid',
    })
    sh.y = (sh.lastY() ?? sh.y) + 2.5
    if (t.note) {
      sh.setF('sans', 'normal', 6.2, FAINT)
      for (const w of doc.splitTextToSize(t.note, CONTENT_W)) { sh.ensure(3.2); doc.text(w, M, sh.y); sh.y += 3 }
    }
    sh.y += 3.5
  }
}

/** Paint the appendix into `sh`, starting at its current cursor: its own
 *  brand header, the status table, then every included section. */
export function paintAnalysisAppendix(sh: Sheet, i: AppendixPdfInput, today: string, sheet: string): void {
  const wanted = new Set<AppendixKey>(i.include ?? i.appendix.sections.map((s) => s.key))
  const status = i.appendix.status
  const failing = status.filter((r) => r.verdict === 'FAIL')
  sh.brandHeader({
    docLabel: brandDocLabel('Structure — Analysis Appendix'),
    title: 'Structure — Analysis Appendix', sheet, today,
    ok: failing.length === 0,
    governing: failing.length
      ? `${failing.map((r) => r.check).join(', ')} — see the status table`
      : `${status.filter((r) => r.verdict !== 'NOT RUN').length} of ${status.length} checks run · none failing`,
    badges: i.badges,
    verdictLabel: failing.length ? 'CHECKS FAILING' : 'RESULTS ATTACHED',
  })
  sh.letterheadGrid([
    ['PROJECT', i.lh.project || '—', false], ['SHEET', sheet, true],
    ['PREPARED BY', i.lh.preparedBy || '—', false], ['DATE', today, true],
    ['ELEMENT', 'Structure — 3D Model Space', false], ['CONTENTS', i.appendix.sections.filter((s) => wanted.has(s.key)).map((s) => s.letter).join(' · '), true],
  ])
  sh.rule(0, 'Analysis & design status')
  sh.setF('sans', 'normal', 6.6, MUTED)
  for (const w of sh.doc.splitTextToSize('Every status below is the engine\'s own result. A check that was not run says so; nothing is marked PASS because its section exists.', CONTENT_W)) { sh.doc.text(w, M, sh.y); sh.y += 3.2 }
  sh.y += 2
  paintStatusTable(sh, status)
  for (const s of i.appendix.sections) if (wanted.has(s.key)) paintSection(sh, s)
}

/** The appendix as its own document, unsaved. */
export function buildAnalysisAppendixPdf(i: AppendixPdfInput): { doc: Sheet['doc']; today: string } {
  const sh = createSheet()
  const today = new Date().toISOString().slice(0, 10)
  const sheet = i.lh.sheet || 'S-3D'
  paintAnalysisAppendix(sh, i, today, sheet)
  sh.pageFooters(brandDocLabel('Structure — Analysis Appendix'), sheet, today, i.lh.project)
  return { doc: sh.doc, today }
}

export function generateAnalysisAppendixPdf(i: AppendixPdfInput): void {
  const { doc, today } = buildAnalysisAppendixPdf(i)
  doc.save(i.fileName ?? `structure-analysis-appendix-${today}.pdf`)
}

/**
 * The design report with the appendix bound after it — one document, one
 * run of page numbers. The report's own signatures and disclaimer close the
 * report; the appendix starts on a fresh page with its own header.
 */
export async function buildCombinedPdf(report: ModelPdfInput, appendix: AppendixPdfInput): Promise<{ doc: Sheet['doc']; today: string }> {
  const sh = createSheet()
  const { today, sheet, docLabel } = await buildModelPdfInto(sh, report)
  sh.doc.addPage()
  sh.y = M
  // The appendix's first page carries the appendix's own header; the running
  // strip every other continuation page gets would print on top of it.
  const appendixStart = sh.doc.getNumberOfPages()
  paintAnalysisAppendix(sh, appendix, today, sheet)
  sh.pageFooters(docLabel, sheet, today, report.lh.project, new Set([appendixStart]))
  return { doc: sh.doc, today }
}

export async function generateCombinedPdf(report: ModelPdfInput, appendix: AppendixPdfInput, fileName?: string): Promise<void> {
  const { doc, today } = await buildCombinedPdf(report, appendix)
  doc.save(fileName ?? `structure-report-with-appendix-${today}.pdf`)
}

/** Page width, exported for callers that centre something of their own. */
export const APPENDIX_PAGE_W = PAGE_W
