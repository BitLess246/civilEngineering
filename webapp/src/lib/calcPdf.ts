// ─────────────────────────────────────────────────────────────────────────
// CALCULATOR-PAGE PDF — the same calc sheet the Model Space report produces,
// for a single designed element.
//
// Replaces the old browser Print → Save as PDF path. That path produced whatever
// the browser felt like: page breaks through tables, headers and footers only if
// the user had them switched on, background colours only if "print backgrounds"
// was ticked, and a different result in every browser. This produces one file,
// the same everywhere, with real page numbering.
//
// The chrome — brand strip, verdict chip, letterhead grid, section rules,
// equation boxes, signature blocks — all comes from `pdfKit`, which the Model
// Space report uses too. That shared module is the whole reason the two reports
// look alike, and the reason they will still look alike after the next edit.
//
// Sections are numbered as they are EMITTED, so a page with no drawing does not
// print "4 · DRAWING" over nothing, and a page with no worked solution does not
// leave a gap in the numbering.
//
// Loaded lazily (with its embedded font subsets) via dynamic import.
// ─────────────────────────────────────────────────────────────────────────
import type { LetterheadState, VerdictStat } from '../components/calc'
import type { SolutionStep } from './solution'
import { createSheet, autoTable, MUTED } from './pdfKit'
import { COMPUTED_BY, docLabel as brandDocLabel } from './brand'

export interface CalcCheckRow { name: string; ratio: number; ok: boolean }

export interface CalcPdfInput {
  /** Element name — 'Rectangular RC Beam'. Heads the sheet and the file name. */
  docTitle: string
  /** Fallback sheet number when the letterhead has none — 'S-01'. */
  docCode: string
  badges: string[]
  ok: boolean
  /** One line under the verdict chip — what governs, and at what utilisation. */
  governing: string
  lh: LetterheadState
  stats?: readonly VerdictStat[]
  checks?: readonly CalcCheckRow[]
  /** Input echo, as label/value pairs. Laid out in two columns. */
  data?: readonly [string, string][]
  steps?: readonly SolutionStep[]
  /** PNG data URL of the page's schematic — see `svgToPng`. */
  drawing?: string | null
  drawingTitle?: string
  fileName?: string
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'report'

export async function generateCalcPdf(input: CalcPdfInput): Promise<void> {
  const {
    docTitle, docCode, badges, ok, governing, lh,
    stats = [], checks = [], data = [], steps = [], drawing, drawingTitle, fileName,
  } = input

  const s = createSheet()
  const { doc } = s
  const today = new Date().toISOString().slice(0, 10)
  const sheet = lh.sheet || docCode
  const docLabel = brandDocLabel(`${docTitle} — Calculation Report`)

  s.brandHeader({ docLabel, title: `${docTitle} — Design Calculation`, sheet, today, ok, governing, badges })
  s.letterheadGrid([
    ['PROJECT', lh.project || '—', false], ['SHEET', sheet, true],
    ['PREPARED BY', lh.preparedBy || '—', false], ['DATE', today, true],
    ['ELEMENT', docTitle, false], ['CODES', badges.join(' · '), true],
  ])

  // Sections are numbered as they are EMITTED, so a page with no drawing does
  // not print "4 · DRAWING" over nothing and the numbering has no gaps.
  let n = 0
  const section = (title: string) => { n += 1; s.rule(n, title); return n }

  if (stats.length > 0 || checks.length > 0) {
    section('Design Summary')
    if (stats.length > 0) s.statCards(stats)
    if (checks.length > 0) {
      s.ensure(20)
      autoTable(doc, {
        ...s.tableTheme([1]),
        startY: s.y,
        head: [['Check', 'Ratio', 'Status']],
        body: checks.map((c) => [c.name, c.ratio.toFixed(2), c.ok ? 'PASS' : 'FAIL']),
        columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right', font: 'mono', cellWidth: 18 }, 2: { halign: 'right', cellWidth: 18 } },
      })
      s.y = (s.lastY() ?? s.y) + 4
    }
  }

  if (data.length > 0) {
    section('Design Data')
    // paired into two label/value columns so a short input list does not run
    // down a third of a page
    const half = Math.ceil(data.length / 2)
    const rows: string[][] = []
    for (let i = 0; i < half; i++) {
      const a = data[i], b = data[half + i]
      rows.push([a[0], a[1], b?.[0] ?? '', b?.[1] ?? ''])
    }
    const theme = s.tableTheme()
    autoTable(doc, {
      ...theme,
      startY: s.y,
      body: rows,
      styles: { ...(theme.styles as object), fontSize: 6.6, cellPadding: { top: 1, bottom: 1, left: 0, right: 2 } },
      columnStyles: {
        0: { textColor: MUTED, cellWidth: 26 }, 1: { font: 'mono', cellWidth: 65 },
        2: { textColor: MUTED, cellWidth: 26 }, 3: { font: 'mono' },
      },
    })
    s.y = (s.lastY() ?? s.y) + 4
  }

  if (steps.length > 0) {
    const idx = section('Worked Solution')
    s.solutionSteps(steps, `${idx}.`)
  }

  if (drawing) {
    section('Drawing')
    await s.figure(drawing, `FIG 1 · ${(drawingTitle ?? docTitle).toUpperCase()}`, 150)
  }

  s.signatures(lh.preparedBy)
  s.disclaimer(
    COMPUTED_BY + ' '
    + 'Load factors per NSCP 2015 §203.3; strength reduction factors per ACI 318-14 Table 21.2.1. '
    + `Project: ${lh.project || '—'}.`,
  )
  s.pageFooters(docLabel, sheet, today, lh.project)

  doc.save(fileName ?? `${slug(docTitle)}-${today}.pdf`)
}
