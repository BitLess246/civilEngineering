// ─────────────────────────────────────────────────────────────────────────
// GEOTECHNICAL INVESTIGATION REPORT — PDF.
//
// Renders the 22-section document model (`engine/soils/report.ts`) onto the
// shared `pdfKit` chrome, so it looks like the calculation sheets and the Model
// Space report rather than like a third thing.
//
// TWO DECISIONS WORTH KNOWING ABOUT.
//
// 1. Every section is printed, including the ones with no data. A report that
//    silently skips what it could not assess reads as complete, and the reader
//    cannot tell "no liquefaction risk" from "never checked". Sections that
//    could not be supported print their heading and the stated gap, in the
//    document's own numbering.
//
// 2. The gaps are collected onto a DATA COMPLETENESS page near the front,
//    before the reader reaches any conclusion. Burying them at the back would
//    be technically honest and practically useless.
//
// Drawings are painted as VECTOR geometry through `drawingPdf`, not rasterised,
// so a printed borehole log is as sharp as the type beside it.
//
// Loaded lazily (with its embedded font subsets) via dynamic import.
// ─────────────────────────────────────────────────────────────────────────

import type { SoilsReport, ReportSection } from '../engine/soils/report'
import { createSheet, autoTable, MUTED, INK, BRAND, FAIL_FG, OK_FG, CONTENT_W, M, PAGE_W } from './pdfKit'
import { docLabel as brandDocLabel } from './brand'
import { paintDrawing, paintedSize } from './drawingPdf'

const STATUS_LABEL = {
  complete: 'COMPLETE',
  partial: 'PARTIAL',
  'not-assessed': 'NOT ASSESSED',
} as const

/** Build the report document. No I/O, so it can be exercised in Node. */
export function buildSoilsReportPdf(r: SoilsReport): ReturnType<typeof createSheet>['doc'] {
  return renderSoilsReport(createSheet(), r)
}

/**
 * Render onto a sheet the caller owns.
 *
 * Split out so a test can supply a sheet whose `doc.text` it has wrapped: the
 * finished PDF embeds TTF subsets, so its content stream holds glyph codes
 * rather than readable strings, and asserting on what reached the page needs
 * either a full PDF parser or this seam.
 */
export function renderSoilsReport(
  s: ReturnType<typeof createSheet>, r: SoilsReport,
): ReturnType<typeof createSheet>['doc'] {
  const { doc } = s
  const today = new Date().toISOString().slice(0, 10)

  s.brandHeader({
    docLabel: brandDocLabel('Geotechnical Investigation Report'),
    title: r.title,
    sheet: r.investigationNo || 'GI-01',
    today: r.reportDate,
    // A report is not a pass/fail check; the "verdict" is how much of it the
    // data could actually support.
    ok: r.blockingIssues.length === 0,
    // Not a design verdict: this document reports ground, it does not check a
    // structure. The chip states data integrity instead.
    verdictLabel: r.blockingIssues.length === 0 ? 'DATA CONSISTENT' : 'DATA ERRORS',
    governing: `${(r.completeness * 100).toFixed(0)}% of sections supported by the data · ${r.gaps.length} stated gap${r.gaps.length === 1 ? '' : 's'}`,
    badges: ['ASTM D2487', 'ASTM D1586', 'NCEER 2001', 'NSCP 2015'],
  })

  s.letterheadGrid([
    ['Project', r.projectName || '—', false],
    ['Location', r.location || '—', false],
    ['Investigation', r.investigationNo || '—', false],
    ['Report date', r.reportDate, false],
    ['Prepared by', r.preparedBy || '—', false],
    ['Generated', today, false],
  ])

  // ── Blocking integrity errors, if any, before anything else ──
  if (r.blockingIssues.length) {
    s.rule(0, 'DATA INTEGRITY — RESOLVE BEFORE ISSUE')
    s.setF('sans', 'normal', 8.6, FAIL_FG)
    for (const issue of r.blockingIssues) {
      s.ensure(8)
      const lines = doc.splitTextToSize(`•  ${issue}`, CONTENT_W) as string[]
      doc.text(lines, M, s.y)
      s.y += lines.length * 4.2 + 1
    }
    s.y += 3
  }

  // ── Completeness, up front ──
  s.rule(0, 'WHAT THIS REPORT DOES AND DOES NOT ESTABLISH')
  s.setF('sans', 'normal', 8.6, MUTED)
  const intro = doc.splitTextToSize(
    'Every section below is present whether or not the investigation could support it. A section marked NOT ASSESSED states what would be required; it is not a finding that there is nothing to report. The gaps are listed here, before any conclusion, because a reader who reaches a recommendation without seeing them has been misled by omission.',
    CONTENT_W,
  ) as string[]
  doc.text(intro, M, s.y)
  s.y += intro.length * 4.2 + 3

  if (r.gaps.length) {
    autoTable(doc, {
      head: [['§', 'Section', 'What is missing']],
      body: r.gaps.map((g) => [String(g.section), g.title, g.gap]),
      startY: s.y,
      ...s.tableTheme([0]),
      columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 42 } },
    })
    s.y = (s.lastY() ?? s.y) + 6
  } else {
    s.setF('sans', 'bold', 9, OK_FG)
    doc.text('Every section is supported by the investigation data.', M, s.y)
    s.y += 8
  }

  // ── The 22 sections ──
  for (const sec of r.sections) {
    emitSection(s, sec)
  }

  s.signatures(r.preparedBy || '')
  s.disclaimer(
    'This report describes ground conditions at the exploration locations only. Conditions elsewhere on the site are inferred. Results are computed from the recorded investigation data and must be reviewed by a licensed geotechnical engineer before construction use.',
  )
  s.pageFooters(
    'GEOTECHNICAL INVESTIGATION REPORT',
    r.investigationNo || 'GI-01',
    today,
    r.projectName || '',
  )
  return doc
}

function emitSection(s: ReturnType<typeof createSheet>, sec: ReportSection): void {
  const { doc } = s
  s.rule(sec.no, sec.title.toUpperCase())

  // Status chip — the reader should see what a section rests on before reading
  // it, not after.
  if (sec.status !== 'complete') {
    const color = sec.status === 'not-assessed' ? FAIL_FG : [146, 94, 16] as [number, number, number]
    s.setF('mono', 'bold', 7.4, color)
    doc.text(STATUS_LABEL[sec.status], M, s.y)
    s.y += 4.4
    if (sec.gap) {
      s.setF('sans', 'normal', 8.4, color)
      const lines = doc.splitTextToSize(sec.gap, CONTENT_W) as string[]
      s.ensure(lines.length * 4.2 + 4)
      doc.text(lines, M, s.y)
      s.y += lines.length * 4.2 + 3
    }
  }

  for (const p of sec.paragraphs) {
    s.setF('sans', 'normal', 8.8, INK)
    const lines = doc.splitTextToSize(p, CONTENT_W) as string[]
    s.ensure(lines.length * 4.4 + 4)
    doc.text(lines, M, s.y)
    s.y += lines.length * 4.4 + 3
  }

  for (const t of sec.tables) {
    if (t.title) {
      s.ensure(12)
      s.setF('sans', 'bold', 8.6, BRAND)
      doc.text(t.title, M, s.y)
      s.y += 4.6
    }
    autoTable(doc, {
      head: [t.head],
      body: t.rows,
      startY: s.y,
      ...s.tableTheme(t.right),
    })
    s.y = (s.lastY() ?? s.y) + 5
  }

  for (const f of sec.figures) {
    const box = { x: M, y: s.y + 4, w: Math.min(CONTENT_W, 150), maxH: 165 }
    const size = paintedSize(f.drawing, box)
    // Keep the caption with its figure rather than orphaning it at a page end.
    s.ensure(size.height + 12)
    const placed = { ...box, y: s.y + 4 }
    // Centre it on the page.
    placed.x = (PAGE_W - size.width) / 2
    paintDrawing(doc, f.drawing, placed)
    s.y = placed.y + size.height + 4
    s.setF('sans', 'normal', 7.6, MUTED)
    doc.text(f.caption, PAGE_W / 2, s.y, { align: 'center' })
    s.y += 6
  }

  for (const n of sec.notes) {
    s.setF('sans', 'normal', 7.8, MUTED)
    const lines = doc.splitTextToSize(`— ${n}`, CONTENT_W) as string[]
    s.ensure(lines.length * 3.8 + 3)
    doc.text(lines, M, s.y)
    s.y += lines.length * 3.8 + 2
  }
}

/** Build and download. Browser only. */
export function downloadSoilsReport(r: SoilsReport): void {
  const doc = buildSoilsReportPdf(r)
  const name = `${(r.investigationNo || 'geotechnical-report').replace(/[^\w.-]+/g, '-')}.pdf`
  doc.save(name)
}
