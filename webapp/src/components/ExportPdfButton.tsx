import { useState } from 'react'
import type { CalcPdfInput } from '../lib/calcPdf'
import { svgToPng } from '../lib/svgToPng'

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
      const svg = document.querySelector(drawingSelector)
      const drawing = svg instanceof SVGSVGElement ? await svgToPng(svg) : null
      const figures: { png: string; title: string }[] = []
      for (const el of document.querySelectorAll(figuresSelector)) {
        const fsvg = el.querySelector('svg')
        if (!(fsvg instanceof SVGSVGElement)) continue
        const png = await svgToPng(fsvg)
        if (png) figures.push({ png, title: el.getAttribute('data-figure-title') ?? 'Diagram' })
      }
      const { generateCalcPdf } = await import('../lib/calcPdf')
      await generateCalcPdf({ ...report, drawing, figures })
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
