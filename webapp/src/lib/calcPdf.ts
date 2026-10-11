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
import { createSheet, autoTable, MUTED, NOT_CHECKED } from './pdfKit'
import { COMPUTED_BY, docLabel as brandDocLabel } from './brand'

/**
 * One check row on the generated PDF.
 *
 * `ratio: null` = the check was NOT EVALUATED. The PDF is the artifact that
 * leaves the building with an engineer's name on it, so the third state has to
 * survive into it — a sheet that prints only the checks that happened, with no
 * mark where one did not, is the failure this type exists to prevent.
 */
export interface CalcCheckRow { name: string; ratio: number | null; ok: boolean; note?: string }

export interface CalcPdfResultRow {
  check: string
  basis: string
  demand: string
  limit?: string
  ratio?: number
  status: 'pass' | 'fail' | 'warn' | 'info'
}
export interface CalcPdfReference { topic: string; basis: string; source: string }
export interface CalcPdfDetail { title: string; text: string }

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
  /** Every result row shown in the calculator's Results Summary. */
  resultRows?: readonly CalcPdfResultRow[]
  /** Input echo, including hidden/non-visible values supplied by the calculator. */
  data?: readonly [string, string][]
  /** Method assumptions and scope statements used by the calculation. */
  assumptions?: readonly string[]
  /** References shown in the calculator's References tab. */
  references?: readonly CalcPdfReference[]
  /** Additional schedules/tables represented as report-ready text. */
  details?: readonly CalcPdfDetail[]
  steps?: readonly SolutionStep[]
  /** PNG data URL of the page's schematic — see `svgToPng`. */
  drawing?: string | null
  drawingTitle?: string
  /**
   * Further figures after the drawing — the design's diagrams (soil pressure,
   * shear, moment), captured from the page's own rendering. Numbered FIG 2…
   * (FIG 1 is the drawing; a page with no drawing numbers its diagrams from 1).
   */
  figures?: readonly { png: string; title: string }[]
  fileName?: string
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'report'

/**
 * Scope notes for standalone calculator PDFs. Keep these independent of any
 * one design code: the same exporter is used by structural, quantity, and
 * other engineering tools with different standards and methods.
 */
export function buildCalcPdfScopeNotes(checks: readonly CalcCheckRow[] = []): string[] {
  const notes = [
    'PASS applies only to the checks explicitly listed in this report. It is not certification of compliance with every provision that may apply to the project.',
    'The engineer of record must verify the inputs, units, load combinations, boundary conditions, material properties, detailing, assumptions, and applicable jurisdiction requirements before relying on these results.',
  ]
  const notChecked = checks.filter((c) => c.ratio === null).map((c) => c.name)
  if (notChecked.length) {
    notes.push(`Not evaluated by this calculation: ${notChecked.join(', ')}. These items are excluded from the PASS verdict and require separate review where applicable.`)
  }
  return notes
}

export async function generateCalcPdf(input: CalcPdfInput): Promise<void> {
  const {
    docTitle, docCode, badges, ok, governing, lh,
    stats = [], checks = [], resultRows = [], data = [], assumptions = [], references = [], details = [], steps = [], drawing, drawingTitle, figures = [], fileName,
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
        body: checks.map((c) => [c.name, c.ratio === null ? '\u2014' : c.ratio.toFixed(2), c.ratio === null ? NOT_CHECKED : c.ok ? 'PASS' : 'FAIL']),
        // 26 mm, not 18: 'NOT CHECKED' wrapped to two ragged lines in a column
        // sized for 'PASS', and a two-line cell among one-line ones reads as
        // damage rather than as a third state.
        columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right', font: 'mono', cellWidth: 18 }, 2: { halign: 'right', cellWidth: 26 } },
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

  // The design's own diagrams, in the order the page lays them out. They sit
  // AFTER the drawing — the geometry first, then the demands it carries — and
  // each is captioned with the title the page labels it on screen, so the PDF
  // reads the same either way.
  if (figures.length > 0) {
    section('Design Diagrams')
    for (let f = 0; f < figures.length; f++) {
      await s.figure(figures[f].png, `FIG ${drawing ? f + 2 : f + 1} · ${figures[f].title}`, 120)
    }
  }

  // ── Code scope & review notes ──
  // These notes are not optional: they travel with the exported calculation
  // even when a check was not evaluated or the tool uses a non-ACI method.
  section('Code Scope & Review Notes')
  s.setF('sans', 'normal', 6.6, MUTED)
  for (const note of buildCalcPdfScopeNotes(checks)) {
    const lines = doc.splitTextToSize(note, 182)
    s.ensure(lines.length * 3.2 + 2)
    for (const line of lines) { doc.text(line, 14, s.y); s.y += 3.2 }
    s.y += 1.1
  }
  s.y += 2

  s.signatures(lh.preparedBy)
  s.disclaimer(
    COMPUTED_BY + ' '
    + 'Calculation record generated from the displayed inputs and implemented checks. '
    + `Project: ${lh.project || '—'}.`,
  )
  s.pageFooters(docLabel, sheet, today, lh.project)

  doc.save(fileName ?? `${slug(docTitle)}-${today}.pdf`)
}
