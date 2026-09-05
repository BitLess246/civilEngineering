// Direct PDF export of the Model Space structure report — A4 portrait calc
// sheet built from the SHARED chrome in `pdfKit` (mono header strip, the
// wordmark, verdict chip, letterhead grid, numbered section rules, PASS/FAIL
// chips, equation boxes, signature blocks, per-page footer). The calculator
// pages' `calcPdf` is built from the same kit, which is what keeps the two
// reports looking like sheets from one set instead of two lookalikes that
// drift apart.
//
// What stays here is what only this report has: the member schedules, the
// worked solutions with the schedule's own figures beside them, and the
// drawing set. Every figure is an engine `Drawing` painted through
// `paintDrawing` — the cut through a member's placed cage and the sheet it is
// on, the same objects the Plans tab and the schedule accordion show. The
// report used to draw a cross-section of its own here from a bar count and a
// cover, and it could show neither a lap, a crank, nor the stirrup set the
// cage actually placed. Rendered with jsPDF + autotable as crisp vector text;
// formulas arrive as LaTeX from the solution builders and are converted by
// texToPlain. This module (and the embedded font subsets) is loaded lazily
// via dynamic import.
import type { LetterheadState } from '../components/calc'
import type { ModelReport } from './modelReport'
import type { PlanSheet } from './planSheets'
import type { StatusRow } from './analysisAppendix'
import { COMPUTED_BY, docLabel as brandDocLabel } from './brand'
import { paintDrawing, paintedSize } from './drawingPdf'
import {
  createSheet, autoTable, type Sheet,
  INK, MUTED, FAINT, BRAND, HAIR, M, CONTENT_W, PAGE_W,
} from './pdfKit'

/** The sections of the design report, in print order — what the export
 *  dialog offers, and what `buildModelPdf` prints when told a subset. */
export type ReportSectionKey = 'snapshot' | 'summary' | 'status' | 'project' | 'schedules' | 'solutions' | 'drawings'
export const REPORT_SECTION_TITLES: Record<ReportSectionKey, { label: string; hint?: string }> = {
  snapshot: { label: '3D model snapshot', hint: 'the analysis view as it stands' },
  summary: { label: 'Design summary', hint: 'verdict, governing checks, quantities' },
  status: { label: 'Analysis & design status', hint: 'every analysis and check, as the engine reported it' },
  project: { label: 'Project & design data' },
  schedules: { label: 'Member schedules', hint: 'beams, columns, slabs, footings, walls, connections' },
  solutions: { label: 'Worked solutions', hint: 'every member, with its cage figures' },
  drawings: { label: 'Drawings', hint: 'the plan and detail sheet set' },
}
export const ALL_REPORT_SECTIONS: ReportSectionKey[] = ['snapshot', 'summary', 'status', 'project', 'schedules', 'solutions', 'drawings']

export interface ModelPdfInput {
  lh: LetterheadState
  report: ModelReport
  modelImg: string | null      // PNG data URL of the 3D canvas
  badges: string[]
  /** The plan + detail sheet set from `planSheets.buildSheetSet` — the SAME
   *  `Drawing` objects the Plans tab shows, painted as vectors here. Omitted
   *  (or empty) simply leaves the section out. */
  sheets?: PlanSheet[]
  /** The analysis & design status rows (`analysisStatus`) — printed as a
   *  table in the summary when given. */
  status?: StatusRow[]
  /** Which sections to print. Omitted → all of them. Numbering follows the
   *  sections actually printed, so a report without schedules has no gap. */
  sections?: ReportSectionKey[]
  fileName?: string
}

/** Build and download the report. */
export async function generateModelPdf(input: ModelPdfInput): Promise<void> {
  const { doc, today } = await buildModelPdf(input)
  doc.save(input.fileName ?? `structure-report-${today}.pdf`)
}

/**
 * Build the report as a document and hand it back unsaved — for a caller
 * that wants to bind it with something else, or a test that wants to look
 * at the pages it made without a browser to download them into.
 */
export async function buildModelPdf(input: ModelPdfInput): Promise<{ doc: Sheet['doc']; today: string }> {
  const sh = createSheet()
  const { today, sheet, docLabel } = await buildModelPdfInto(sh, input)
  sh.pageFooters(docLabel, sheet, today, input.lh.project)
  return { doc: sh.doc, today }
}

/**
 * Paint the report into a sheet the caller owns, through its signatures and
 * disclaimer but WITHOUT the page footers — the caller adds those once it
 * has finished with the document, which for a combined PDF is after the
 * appendix. Returns what the footers need.
 */
export async function buildModelPdfInto(
  sh: Sheet, { lh, report, modelImg, badges, sheets, status, sections }: ModelPdfInput,
): Promise<{ today: string; sheet: string; docLabel: string }> {
  const { doc } = sh
  const setF = sh.setF
  const ensure = sh.ensure
  const tableTheme = sh.tableTheme
  const lastY = sh.lastY
  const want = new Set<ReportSectionKey>(sections ?? ALL_REPORT_SECTIONS)
  // Numbered in print order over the sections actually printed.
  let n = 0
  const rule = (title: string) => sh.rule(++n, title)

  const today = new Date().toISOString().slice(0, 10)
  const sheet = lh.sheet || 'S-3D'
  const docLabel = brandDocLabel('Structure — Calculation Report')

  sh.brandHeader({
    docLabel, title: 'Structure — Design Calculation', sheet, today,
    ok: report.ok, governing: report.governing, badges,
  })
  sh.letterheadGrid([
    ['PROJECT', lh.project || '—', false], ['SHEET', sheet, true],
    ['PREPARED BY', lh.preparedBy || '—', false], ['DATE', today, true],
    ['ELEMENT', 'Structure — 3D Model Space', false], ['CODES', badges.join(' · '), true],
  ])

  // ── 3D model snapshot ──
  if (modelImg && want.has('snapshot')) await sh.figure(modelImg, 'FIG 1 · 3D STRUCTURAL MODEL — ANALYSIS SNAPSHOT')

  // ── Design summary ──
  if (want.has('summary')) {
    rule('Design Summary')
    sh.statCards(report.stats)
    ensure(20)
    autoTable(doc, {
      ...tableTheme([2]),
      startY: sh.y,
      head: [['Check', 'Scope / governing', 'Ratio', 'Status']],
      body: report.checks.map((c) => [c.name, c.detail, c.ratio === null ? '—' : c.ratio.toFixed(2), c.ok ? 'PASS' : 'FAIL']),
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 44 }, 2: { halign: 'right', font: 'mono', cellWidth: 14 }, 3: { halign: 'right', cellWidth: 16 } },
    })
    sh.y = (lastY() ?? sh.y) + 4
  }

  // ── Analysis & design status ──
  if (status && want.has('status')) {
    rule('Analysis & Design Status')
    setF('sans', 'normal', 6.6, MUTED)
    for (const w of doc.splitTextToSize('What was run, and what it found. A check that was not run says so; nothing is marked PASS because its section exists. The full results are in the Analysis Appendix.', CONTENT_W)) { doc.text(w, M, sh.y); sh.y += 3.2 }
    sh.y += 2
    ensure(20)
    autoTable(doc, {
      ...tableTheme(),
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
    sh.y = (lastY() ?? sh.y) + 4
  }

  // ── Project & design data ──
  if (want.has('project')) {
  rule('Project & Design Data')
  {
    const half = Math.ceil(report.props.length / 2)
    const rows: string[][] = []
    for (let i = 0; i < half; i++) {
      const a = report.props[i], b = report.props[half + i]
      rows.push([a[0], a[1], b?.[0] ?? '', b?.[1] ?? ''])
    }
    autoTable(doc, {
      ...tableTheme(),
      startY: sh.y,
      body: rows,
      styles: { ...(tableTheme().styles as object), fontSize: 6.6, cellPadding: { top: 1, bottom: 1, left: 0, right: 2 } },
      columnStyles: {
        0: { textColor: MUTED, cellWidth: 26 }, 1: { font: 'mono', cellWidth: 65 },
        2: { textColor: MUTED, cellWidth: 26 }, 3: { font: 'mono' },
      },
    })
    sh.y = (lastY() ?? sh.y) + 4
  }
  }

  // ── Member schedules ──
  if (want.has('schedules')) {
  ensure(44)                 // the heading with its first table, never alone
  rule('Member Schedules')
  report.tables.forEach((t, i) => {
    ensure(24)
    setF('sans', 'bold', 8, INK)
    doc.text(`${n}.${i + 1}  ${t.title}`, M, sh.y)
    sh.y += 2.5
    autoTable(doc, {
      ...tableTheme(t.right ?? []),
      startY: sh.y,
      head: [t.head],
      body: t.rows,
      rowPageBreak: 'avoid',
    })
    sh.y = (lastY() ?? sh.y) + 5.5
  })
  }

  // ── Worked solutions (every member) ──
  if (want.has('solutions')) {
  rule('Worked Solutions')
  report.groups.forEach((g, gi) => {
    // Enough for the heading AND the first item's header block, so a group
    // title is never left alone at the foot of a page.
    ensure(60)
    sh.y += 1.5
    setF('sans', 'bold', 8.6, BRAND)
    doc.text(`${n}.${gi + 1}  ${g.title}`, M, sh.y)
    sh.y += 1.6
    doc.setDrawColor(...HAIR); doc.setLineWidth(0.3)
    doc.line(M, sh.y, M + CONTENT_W, sh.y)
    sh.y += 4.5
    g.items.forEach((item) => {
      // THE SCHEDULE'S OWN FIGURES, painted as vectors. The cut through the
      // placed cage sits beside the name, where the hand-drawn section used
      // to; the sheet the member is on (elevation or column stack, with this
      // solution's stretch washed) goes full width under the header.
      const cuts = (item.figures ?? []).filter((f) => f.kind === 'section')
      const sheets = (item.figures ?? []).filter((f) => f.kind === 'elevation')
      const boxW = 58, boxPad = 2
      const cutBox = { x: 0, y: 0, w: boxW - 2 * boxPad, maxH: 44 }
      const cutSizes = cuts.map((f) => paintedSize(f.drawing, cutBox))
      const boxH = cuts.length ? cutSizes.reduce((s, z) => s + z.height, 0) + boxPad * (cuts.length + 1) : 0
      // A frame elevation is wide and takes the content width; a column stack
      // is tall and narrow, and fitted to 75 mm it came out 30 mm wide with
      // its callouts unreadable — it gets the height it needs instead.
      const sheetBoxes = sheets.map((f) => {
        const b = f.drawing.bounds
        const tall = (b.maxY - b.minY) > 1.2 * (b.maxX - b.minX)
        return { x: M, y: 0, w: CONTENT_W, maxH: tall ? 120 : 75 }
      })
      const sheetSizes = sheets.map((f, k) => paintedSize(f.drawing, sheetBoxes[k]))
      // The header and the sheet under it move to the next page TOGETHER: a
      // header left at the foot of one page with its elevation at the head
      // of the next reads as two items, and leaves a page-third blank.
      const need = (cuts.length ? boxH + 5 : 20) + sheetSizes.reduce((s, z) => s + z.height + 9, 0)
      ensure(Math.min(need, 200))
      const headTop = sh.y
      const leftW = cuts.length ? CONTENT_W - boxW - 6 : CONTENT_W
      if (cuts.length) {
        const fx = M + CONTENT_W - boxW
        setF('sans', 'bold', 5, FAINT)
        doc.text('SECTION', fx + 1, headTop + 1.5)
        doc.setDrawColor(...HAIR); doc.setLineWidth(0.2)
        doc.roundedRect(fx, headTop + 2.5, boxW, boxH, 1, 1, 'S')
        let fy = headTop + 2.5 + boxPad
        cuts.forEach((f, k) => {
          const z = cutSizes[k]
          paintDrawing(doc, f.drawing, { ...cutBox, x: fx + (boxW - z.width) / 2, y: fy })
          fy += z.height + boxPad
        })
      }
      // left stack — name, sub, demand summary, plan location. Vertically
      // centred against the figure so the block reads as one card rather than
      // leaving a tall blank band beside a short caption.
      const subN = item.sub ? doc.splitTextToSize(item.sub, leftW).length : 0
      const locN = item.loc ? doc.splitTextToSize(item.loc, leftW).length : 0
      const stackH = 4.4 + subN * 3 + (item.details ? 3.3 : 0) + locN * 3.3
      if (cuts.length) sh.y = headTop + 2.5 + Math.max(0, (boxH - stackH) / 2)
      setF('sans', 'bold', 7.8, INK)
      doc.text(item.title, M, sh.y + 1)
      sh.y += 4.4
      if (item.sub) {
        setF('mono', 'normal', 5.8, FAINT)
        for (const w of doc.splitTextToSize(item.sub, leftW)) { doc.text(w, M, sh.y); sh.y += 3 }
      }
      if (item.details) {
        setF('sans', 'normal', 6.4, MUTED)
        doc.text(item.details, M, sh.y + 0.4); sh.y += 3.3
      }
      if (item.loc) {
        setF('sans', 'normal', 6.4, BRAND)
        for (const w of doc.splitTextToSize(item.loc, leftW)) { doc.text(w, M, sh.y + 0.4); sh.y += 3.3 }
      }
      // clear the figure box before anything else begins
      if (cuts.length) sh.y = Math.max(sh.y, headTop + 2.5 + boxH)
      sh.y += 2.5
      // the sheet, kept with its caption — the same rule the drawings section uses
      sheets.forEach((f, k) => {
        const z = sheetSizes[k]
        ensure(z.height + 9)
        paintDrawing(doc, f.drawing, { ...sheetBoxes[k], y: sh.y, x: M + (CONTENT_W - z.width) / 2 })
        sh.y += z.height + 2
        setF('sans', 'normal', 6, MUTED)
        doc.text(f.caption, M, sh.y)
        sh.y += 4
      })
      sh.solutionSteps(item.steps)
      sh.y += 2
    })
  })
  }

  // ── Drawings (the same sheets the Plans tab shows) ──
  //
  // Painted as VECTORS through the shared `paintDrawing`, not rasterised: a
  // 261 mm dimension has to stay readable when the sheet is printed, and a
  // screenshot of the tab would not be.
  if (sheets?.length && want.has('drawings')) {
    rule('Drawings')
    let k = 0
    let lastGroup = ''
    for (const s of sheets) {
      if (s.group !== lastGroup) {
        lastGroup = s.group
        ensure(14)
        sh.y += 2
        setF('sans', 'bold', 8, INK)
        doc.text(s.group.toUpperCase(), M, sh.y, { charSpace: 0.2 })
        sh.y += 3
      }
      k += 1
      const box = { x: M, y: sh.y, w: CONTENT_W, maxH: 150 }
      const size = paintedSize(s.drawing, box)
      // Keep a sheet with its caption rather than orphaning the caption on the
      // next page — the same rule the soils report figures use.
      ensure(size.height + 14)
      const placed = { ...box, y: sh.y + 3, x: (PAGE_W - size.width) / 2 }
      paintDrawing(doc, s.drawing, placed)
      sh.y = placed.y + size.height + 3.5

      setF('sans', 'bold', 7, INK)
      doc.text(`${n}.${k}  ${s.title}${s.subtitle ? ` · ${s.subtitle}` : ''}`, M, sh.y)
      sh.y += 3.4
      for (const w of s.warnings) {
        setF('sans', 'normal', 6.4, MUTED)
        for (const line of doc.splitTextToSize(`\u26a0 ${w}`, CONTENT_W)) { doc.text(line, M, sh.y); sh.y += 3 }
      }
      sh.y += 3
    }
  }

  sh.signatures(lh.preparedBy)
  sh.disclaimer(
    COMPUTED_BY + ' '
    + 'Load factors per NSCP 2015 §203.3; strength reduction factors per ACI 318-14 Table 21.2.1; '
    + `steel design per AISC 360-16 LRFD. Project: ${lh.project || '—'}.`,
  )

  return { today, sheet, docLabel }
}
