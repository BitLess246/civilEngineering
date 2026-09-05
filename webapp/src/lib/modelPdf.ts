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
import { COMPUTED_BY, docLabel as brandDocLabel } from './brand'
import { paintDrawing, paintedSize } from './drawingPdf'
import {
  createSheet, autoTable, type Sheet,
  INK, MUTED, FAINT, BRAND, HAIR, M, CONTENT_W, PAGE_W,
} from './pdfKit'

export interface ModelPdfInput {
  lh: LetterheadState
  report: ModelReport
  modelImg: string | null      // PNG data URL of the 3D canvas
  badges: string[]
  /** The plan + detail sheet set from `planSheets.buildSheetSet` — the SAME
   *  `Drawing` objects the Plans tab shows, painted as vectors here. Omitted
   *  (or empty) simply leaves the section out. */
  sheets?: PlanSheet[]
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
export async function buildModelPdf({ lh, report, modelImg, badges, sheets }: ModelPdfInput): Promise<{ doc: Sheet['doc']; today: string }> {
  const sh = createSheet()
  const { doc } = sh
  const setF = sh.setF
  const ensure = sh.ensure
  const rule = sh.rule
  const tableTheme = sh.tableTheme
  const lastY = sh.lastY

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
  if (modelImg) await sh.figure(modelImg, 'FIG 1 · 3D STRUCTURAL MODEL — ANALYSIS SNAPSHOT')

  // ── 1 · Design summary ──
  rule(1, 'Design Summary')
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

  // ── 2 · Project & design data ──
  rule(2, 'Project & Design Data')
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

  // ── 3 · Member schedules ──
  rule(3, 'Member Schedules')
  report.tables.forEach((t, i) => {
    ensure(24)
    setF('sans', 'bold', 8, INK)
    doc.text(`3.${i + 1}  ${t.title}`, M, sh.y)
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

  // ── 4 · Worked solutions (every member) ──
  rule(4, 'Worked Solutions')
  report.groups.forEach((g, gi) => {
    // Enough for the heading AND the first item's header block, so a group
    // title is never left alone at the foot of a page.
    ensure(60)
    sh.y += 1.5
    setF('sans', 'bold', 8.6, BRAND)
    doc.text(`4.${gi + 1}  ${g.title}`, M, sh.y)
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

  // ── 5 · Drawings (the same sheets the Plans tab shows) ──
  //
  // Painted as VECTORS through the shared `paintDrawing`, not rasterised: a
  // 261 mm dimension has to stay readable when the sheet is printed, and a
  // screenshot of the tab would not be.
  if (sheets?.length) {
    rule(5, 'Drawings')
    let n = 0
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
      n += 1
      const box = { x: M, y: sh.y, w: CONTENT_W, maxH: 150 }
      const size = paintedSize(s.drawing, box)
      // Keep a sheet with its caption rather than orphaning the caption on the
      // next page — the same rule the soils report figures use.
      ensure(size.height + 14)
      const placed = { ...box, y: sh.y + 3, x: (PAGE_W - size.width) / 2 }
      paintDrawing(doc, s.drawing, placed)
      sh.y = placed.y + size.height + 3.5

      setF('sans', 'bold', 7, INK)
      doc.text(`5.${n}  ${s.title}${s.subtitle ? ` · ${s.subtitle}` : ''}`, M, sh.y)
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
  sh.pageFooters(docLabel, sheet, today, lh.project)

  return { doc, today }
}
