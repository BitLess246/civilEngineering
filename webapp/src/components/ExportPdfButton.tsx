import { useState } from 'react'
import type { CalcPdfInput } from '../lib/calcPdf'
import { svgToPng } from '../lib/svgToPng'

export interface ExportPdfButtonProps extends Omit<CalcPdfInput, 'drawing'> {
  /**
   * CSS selector for the schematic to embed as the drawing figure.
   *
   * A selector rather than a ref because the schematic usually lives in a
   * sibling card several levels away from this button, and threading a ref
   * through those layers buys nothing — the page has exactly one report
   * drawing, marked with `data-pdf-drawing`.
   */
  drawingSelector?: string
  label?: string
  className?: string
}

const DEFAULT_SELECTOR = '[data-pdf-drawing] svg'

/**
 * Generates the page's calculation PDF — the same calc sheet the Model Space
 * report produces, via the shared `pdfKit`.
 *
 * Replaces the old `window.print()` button. The renderer and its embedded font
 * subsets are ~400 kB, so they are dynamically imported on FIRST CLICK rather
 * than at page load: a visitor who never exports never downloads them.
 */
export function ExportPdfButton({
  drawingSelector = DEFAULT_SELECTOR, label = '⎙ Export PDF report', className, ...report
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
      const { generateCalcPdf } = await import('../lib/calcPdf')
      await generateCalcPdf({ ...report, drawing })
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
      className={className ?? 'ml-1.5 inline-flex items-center gap-2 rounded-md bg-[#0f4c92] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[#0d3f78] disabled:opacity-50'}
      title={failed ? 'The export failed — see the browser console' : 'Download this calculation as a PDF'}
    >
      {busy ? '⏳ Building PDF…' : failed ? '⚠ Export failed — retry' : label}
    </button>
  )
}
