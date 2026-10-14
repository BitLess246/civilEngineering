import { useState } from 'react'
import type { CalcPdfInput, CalcPdfDetail } from '../lib/calcPdf'
import { svgToPng } from '../lib/svgToPng'
import { extractBlocks, tableOf, domStyleOf, inlineText } from '../lib/pdfCapture'

export interface ExportPdfButtonProps extends Omit<CalcPdfInput, 'drawing' | 'figures'> {
  /**
   * CSS selector for the schematic to embed as the drawing figure.
   *
   * A selector rather than a ref because the schematic usually lives in a
   * sibling card several levels away from this button, and threading a ref
   * through those layers buys nothing — the page has exactly one report
   * drawing, marked with `data-pdf-drawing`.
   */
  drawingSelector?: string
  /**
   * CSS selector for the further figures — the design's diagrams. Every match
   * is captured in DOM order; its `data-figure-title` attribute captions the
   * PDF figure. Like the drawing, a figure that will not convert is skipped
   * rather than failing the export.
   */
  figuresSelector?: string
  label?: string
  className?: string
}

const DEFAULT_SELECTOR = '[data-pdf-drawing] svg'
const DEFAULT_FIGURES_SELECTOR = '[data-pdf-figure]'

/**
 * Generates the page's calculation PDF — the same calc sheet the Model Space
 * report produces, via the shared `pdfKit`.
 *
 * Replaces the old `window.print()` button. The renderer and its embedded font
 * subsets are ~400 kB, so they are dynamically imported on FIRST CLICK rather
 * than at page load: a visitor who never exports never downloads them.
 */
export function ExportPdfButton({
  drawingSelector = DEFAULT_SELECTOR, figuresSelector = DEFAULT_FIGURES_SELECTOR,
  label = '⎙ Export PDF report', className, ...report
}: ExportPdfButtonProps) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const run = async () => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    try {
      const reportRoot = document.querySelector('[data-pdf-calc-root]') ?? document.querySelector('main') ?? document.body
      const svg = reportRoot.querySelector(drawingSelector) ?? document.querySelector(drawingSelector)
      const drawing = svg instanceof SVGSVGElement ? await svgToPng(svg) : null
      const figures: { png: string; title: string }[] = []
      const capturedSvgs = new Set<SVGSVGElement>()
      if (svg instanceof SVGSVGElement) capturedSvgs.add(svg)
      for (const el of document.querySelectorAll(figuresSelector)) {
        const fsvg = el.querySelector('svg')
        if (!(fsvg instanceof SVGSVGElement)) continue
        capturedSvgs.add(fsvg)
        const png = await svgToPng(fsvg)
        if (png) figures.push({ png, title: el.getAttribute('data-figure-title') ?? 'Diagram' })
      }
      // Legacy standalone pages do not always tag their drawings. Capture
      // substantial SVG diagrams/charts as figures rather than silently
      // dropping them; tiny interface icons are deliberately excluded.
      for (const candidate of reportRoot.querySelectorAll('svg')) {
        if (!(candidate instanceof SVGSVGElement) || capturedSvgs.has(candidate)) continue
        const rect = candidate.getBoundingClientRect()
        if (rect.width < 140 || rect.height < 90) continue
        const png = await svgToPng(candidate)
        if (png) figures.push({ png, title: candidate.getAttribute('aria-label') || candidate.closest('[data-figure-title]')?.getAttribute('data-figure-title') || 'Diagram / chart' })
        capturedSvgs.add(candidate)
      }

      // Capture the live input state at export time, not merely the page's
      // short summary. This includes values that affect the calculation but
      // are not repeated in the result headline.
      const capturedData: [string, string][] = []
      for (const el of reportRoot.querySelectorAll('input, select, textarea')) {
        if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue
        if (el instanceof HTMLInputElement && (el.type === 'hidden' || el.type === 'button' || el.type === 'submit')) continue
        if (el.closest('[data-ai-ignore]')) continue
        // the label's own words only — innerText of a label wrapping a <select>
        // also read out every option ("Category D — dead L — live Lr — …")
        const lab = el.labels?.[0]
        const label = (lab ? inlineText(lab, domStyleOf) : '')
          || el.getAttribute('aria-label') || el.name || el.id
        if (!label) continue
        let value = ''
        if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) value = el.checked ? 'Yes' : 'No'
        else value = el.value
        if (value !== '') capturedData.push([label, value])
      }

      // The page's own schedules and detail blocks, kept as tables and lines
      // (lib/pdfCapture) — not flattened to "a | b | c" or run-on text.
      // Detail blocks go first: a table inside one belongs to it, and
      // anything marked data-pdf-skip is already in the typed report payload.
      const capturedDetails: CalcPdfDetail[] = []
      const consumed = new Set<Element>()
      for (const el of reportRoot.querySelectorAll('[data-pdf-detail]')) {
        if (el.closest('[data-pdf-skip]')) continue
        const blocks = extractBlocks(el, domStyleOf, consumed)
        if (blocks.length) capturedDetails.push({ title: el.getAttribute('data-pdf-detail') || 'Additional calculator data', blocks })
      }
      const seenTables = new Set<string>()
      for (const table of reportRoot.querySelectorAll('table')) {
        if (consumed.has(table) || table.closest('[data-pdf-skip], [data-pdf-detail]')) continue
        const title = table.getAttribute('aria-label') || table.caption?.textContent?.trim()
          || table.closest('section')?.querySelector('h2, h3, h4')?.textContent?.trim() || 'Schedule'
        const t = tableOf(table, domStyleOf, title)
        const key = t ? JSON.stringify([t.head, t.rows]) : ''
        if (!t || seenTables.has(key)) continue
        seenTables.add(key)
        capturedDetails.push({ title, blocks: [{ kind: 'table', table: { ...t, title: undefined } }] })
      }
      const capturedAssumptions = Array.from(reportRoot.querySelectorAll('[data-pdf-assumption]'))
        .map((el) => el.textContent?.trim()).filter((v): v is string => Boolean(v))

      // For older non-workspace pages, preserve the complete rendered textual
      // content as a searchable appendix until that page supplies typed report
      // data. The warning in ReportControls makes clear this is a fallback,
      // not a substitute for exposing internal assumptions from calculation code.
      if (!document.querySelector('[data-pdf-calc-root]')) {
        const blocks = extractBlocks(reportRoot, domStyleOf)
        if (blocks.length) capturedDetails.push({ title: 'Rendered calculator content', blocks })
      }

      const { generateCalcPdf } = await import('../lib/calcPdf')
      await generateCalcPdf({
        ...report,
        data: [...(report.data ?? []), ...capturedData],
        details: [...(report.details ?? []), ...capturedDetails],
        assumptions: [...(report.assumptions ?? []), ...capturedAssumptions],
        drawing, figures,
      })
    } catch (e) {
      // Surfaced on the button rather than swallowed — a silent no-op on an
      // export button reads as a broken page.
      console.error('PDF export failed', e)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button" onClick={() => void run()} disabled={busy}
      className={className ?? 'ml-1.5 inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50'}
      title={failed ? 'The export failed — see the browser console' : 'Download this calculation as a PDF'}
    >
      {busy ? '⏳ Building PDF…' : failed ? '⚠ Export failed — retry' : label}
    </button>
  )
}
