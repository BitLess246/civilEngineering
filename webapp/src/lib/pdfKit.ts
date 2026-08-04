// ─────────────────────────────────────────────────────────────────────────
// PDF CALC-SHEET KIT — the shared chrome behind every generated report.
//
// The Model Space structure report and the calculator-page reports are meant to
// look like sheets from the same set: mono document strip, the wordmark,
// verdict chip, letterhead grid, numbered section rules, PASS/FAIL chips,
// equation boxes, signature blocks, per-page footer. This module owns all of
// that, ONCE, so "similar" survives the next edit to either report. Two copies
// of a letterhead diverge the first time someone nudges a font size.
//
// Domain content stays with its own report: `modelPdf` keeps the reinforcement
// cross-section drawing and the member schedules, `calcPdf` keeps the
// single-element layout. The kit only knows about paper.
//
// Coordinates are millimetres on A4 portrait. `sheet.y` is a running cursor
// that every method advances — the same mutable-cursor style the original
// generator used, kept deliberately so the extraction is faithful rather than
// a rewrite with new bugs.
// ─────────────────────────────────────────────────────────────────────────
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { SolutionStep } from './solution'
import { texToPlain } from './texText'
import { BRAND_NAME, BRAND_MARK, BRAND_TAIL } from './brand'
import { SANS, SANS_BOLD, MONO, MONO_BOLD } from './pdfFonts'

export type RGB = [number, number, number]

// palette (matches index.css tokens)
export const INK: RGB = [15, 27, 42]
export const MUTED: RGB = [92, 102, 117]
export const FAINT: RGB = [163, 157, 141]
export const BRAND: RGB = [15, 76, 146]
export const HAIR: RGB = [227, 225, 218]
export const HAIR_SOFT: RGB = [238, 236, 229]
export const OK_FG: RGB = [20, 96, 58]
export const OK_BG: RGB = [236, 246, 239]
export const FAIL_FG: RGB = [194, 64, 42]
export const FAIL_BG: RGB = [251, 238, 234]
export const EQ_BG: RGB = [249, 248, 244]
const OK_EDGE: RGB = [211, 232, 218]
const FAIL_EDGE: RGB = [239, 212, 204]
const SUBTLE: RGB = [122, 117, 104]

export const PAGE_W = 210, PAGE_H = 297, M = 14      // mm
export const CONTENT_W = PAGE_W - 2 * M
export const FOOT_Y = PAGE_H - 12                     // keep-clear line for the footer

export interface StatCard { label: string; value: string; unit?: string }

/** Width in mm the verdict chip reserves at the top right, plus its gutter. */
export const TITLE_RESERVED_W = 56

/**
 * Largest title size (pt) whose rendered width fits `avail`, by stepping down
 * from `max` to `min`.
 *
 * Takes a measuring function rather than the document so the choice is
 * testable on its own — the alternative is inspecting jsPDF's font state after
 * the fact, which reports whatever was set last, not what the title used.
 */
export function fitTitleSize(
  measure: (size: number) => number, avail: number, max = 15.5, min = 9.5, step = 0.5,
): number {
  let size = max
  while (size > min && measure(size) > avail) size -= step
  return size
}

/**
 * Trim `text` to fit `avail`, ending in an ellipsis when it has to cut.
 *
 * The backstop for a title so long it does not fit even at the smallest size.
 * Without it the text is cut at whatever character the width runs out on, which
 * reads as a rendering bug ("… — Design Calculatio"); an ellipsis reads as a
 * deliberate abbreviation. `measure` is the width of a candidate string.
 */
export function truncateToWidth(measure: (t: string) => number, text: string, avail: number): string {
  if (measure(text) <= avail) return text
  const ell = '…'
  let lo = 0, hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (measure(text.slice(0, mid).trimEnd() + ell) <= avail) lo = mid; else hi = mid - 1
  }
  return lo > 0 ? text.slice(0, lo).trimEnd() + ell : ell
}

/**
 * Fit an image of `w`×`h` pixels into the content column, capped at `maxH` mm.
 *
 * Pure so the aspect handling can be tested: the bug this replaced scaled only
 * the height when the cap bit, which squashed a 300×500 beam section into
 * something nearly square. Returns the drawn size and the left offset that
 * centres it in the column.
 */
export function fitFigure(w: number, h: number, maxH: number): { drawW: number; drawH: number; x: number } {
  if (!(w > 0) || !(h > 0)) return { drawW: CONTENT_W, drawH: Math.min(CONTENT_W, maxH), x: M }
  const aspect = h / w
  let drawW = CONTENT_W, drawH = drawW * aspect
  if (drawH > maxH) { drawH = maxH; drawW = drawH / aspect }
  return { drawW, drawH, x: M + (CONTENT_W - drawW) / 2 }
}

/** Natural pixel size of a data-URL image (for aspect-correct placement). */
export function imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = reject
    img.src = dataUrl
  })
}

export interface Sheet {
  doc: jsPDF
  /** Running vertical cursor in mm. Methods read and advance it. */
  y: number
  setF(family: 'sans' | 'mono', style: 'normal' | 'bold', size: number, color: RGB): void
  /** Start a new page when fewer than `need` mm remain. */
  ensure(need: number): void
  /** Numbered section rule — `1 · DESIGN SUMMARY` over a heavy line.
   *  Pass n = 0 for unnumbered front matter, which prints the title alone. */
  rule(n: number, title: string): void
  /** PASS/FAIL pill at (x, cy). Returns its width. */
  chip(x: number, cy: number, pass: boolean): number
  tableTheme(right?: number[]): Record<string, unknown>
  /** Y after the last autotable, or undefined if none has run. */
  lastY(): number | undefined
  brandHeader(o: BrandHeader): void
  letterheadGrid(cells: [string, string, boolean][]): void
  statCards(stats: readonly StatCard[]): void
  /** Framed image with a small caption. Silently skipped if it will not load. */
  figure(dataUrl: string, caption: string, maxH?: number): Promise<void>
  /** Numbered worked-solution steps with equation boxes and a margin column. */
  solutionSteps(steps: readonly SolutionStep[], indexPrefix?: string): void
  signatures(preparedBy: string): void
  disclaimer(text: string): void
  /** Footer (and continuation-page header strip) on every page. Call last. */
  pageFooters(docLabel: string, sheet: string, today: string, project: string): void
}

export interface BrandHeader {
  /** Mono strip text — build it with `docLabel()` from `brand.ts`. */
  docLabel: string
  /** Large heading, e.g. 'Structure — Design Calculation'. */
  title: string
  sheet: string
  today: string
  ok: boolean
  governing: string
  badges: readonly string[]
  /**
   * Overrides the verdict-chip text. A design sheet passes or fails; an
   * investigation REPORT does neither, and printing "DESIGN OK" on one that is
   * 23% supported by its data would be actively misleading.
   */
  verdictLabel?: string
}

/** A fresh A4 sheet with the embedded font subsets registered. */
export function createSheet(): Sheet {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.addFileToVFS('DVS.ttf', SANS);       doc.addFont('DVS.ttf', 'sans', 'normal')
  doc.addFileToVFS('DVSB.ttf', SANS_BOLD); doc.addFont('DVSB.ttf', 'sans', 'bold')
  doc.addFileToVFS('DVM.ttf', MONO);       doc.addFont('DVM.ttf', 'mono', 'normal')
  doc.addFileToVFS('DVMB.ttf', MONO_BOLD); doc.addFont('DVMB.ttf', 'mono', 'bold')

  const s: Sheet = {
    doc,
    y: M,

    setF(family, style, size, color) {
      doc.setFont(family, style); doc.setFontSize(size); doc.setTextColor(...color)
    },

    ensure(need) {
      if (s.y + need > FOOT_Y) { doc.addPage(); s.y = M + 6 }
    },

    rule(n, title) {
      s.ensure(16)
      s.y += 6
      s.setF('sans', 'bold', 9.5, INK)
      // n = 0 is front matter, not "section zero".
      doc.text(n > 0 ? `${n} · ${title.toUpperCase()}` : title.toUpperCase(), M, s.y, { charSpace: 0.25 })
      s.y += 1.6
      doc.setDrawColor(...INK); doc.setLineWidth(0.5)
      doc.line(M, s.y, M + CONTENT_W, s.y)
      s.y += 4
    },

    chip(x, cy, pass) {
      const label = pass ? 'PASS' : 'FAIL'
      s.setF('mono', 'bold', 6, pass ? OK_FG : FAIL_FG)
      const w = doc.getTextWidth(label) + 3
      doc.setFillColor(...(pass ? OK_BG : FAIL_BG))
      doc.roundedRect(x, cy - 2.8, w, 4, 0.8, 0.8, 'F')
      doc.text(label, x + 1.5, cy)
      return w
    },

    tableTheme(right = []) {
      return {
        margin: { left: M, right: M, bottom: PAGE_H - FOOT_Y + 2 },
        styles: {
          font: 'sans', fontSize: 7.2, textColor: INK, cellPadding: { top: 1.2, bottom: 1.2, left: 1.4, right: 1.4 },
          lineColor: HAIR_SOFT, lineWidth: { bottom: 0.15 },
        },
        headStyles: { font: 'sans', fontStyle: 'bold' as const, fontSize: 6.4, textColor: MUTED, lineColor: INK, lineWidth: { bottom: 0.4 } },
        alternateRowStyles: {},
        columnStyles: Object.fromEntries(right.map((i) => [i, { halign: 'right' as const, font: 'mono' as const }])),
        theme: 'plain' as const,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        didParseCell: (d: any) => {
          // right-aligned numeric columns must right-align their HEADERS too —
          // headStyles outrank columnStyles in autotable, so set it per cell
          if (d.section === 'head' && right.includes(d.column.index)) d.cell.styles.halign = 'right'
          if (d.section === 'body' && (d.cell.raw === 'PASS' || d.cell.raw === 'FAIL')) {
            d.cell.styles.font = 'mono'; d.cell.styles.fontStyle = 'bold'; d.cell.styles.fontSize = 6.2
            d.cell.styles.textColor = d.cell.raw === 'PASS' ? OK_FG : FAIL_FG
          }
        },
      }
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lastY: () => (doc as any).lastAutoTable?.finalY as number | undefined,

    brandHeader({ docLabel, title, sheet, today, ok, governing, badges, verdictLabel }) {
      s.setF('mono', 'normal', 6.4, FAINT)
      doc.text(docLabel, M, s.y)
      doc.text(`${sheet} · ${today}`, M + CONTENT_W, s.y, { align: 'right' })
      s.y += 1.8
      doc.setDrawColor(...HAIR_SOFT); doc.setLineWidth(0.2)
      doc.line(M, s.y, M + CONTENT_W, s.y)
      s.y += 7
      s.setF('sans', 'bold', 11.5, INK)
      doc.text(BRAND_MARK, M, s.y, { charSpace: 0.9 })
      s.setF('sans', 'bold', 5.4, SUBTLE)
      doc.text(BRAND_TAIL, M + doc.getTextWidth(BRAND_MARK) + 13, s.y, { charSpace: 0.7 })
      s.y += 8
      // The verdict chip occupies the top-right 52 mm, so the title has to fit
      // in what is left or it runs underneath it. Model Space's title is short
      // enough to have hidden this; 'Combined Footing — Design Calculation' is
      // not. Shrink to fit rather than clip, with a floor so a very long
      // element name goes small but stays legible.
      {
        const avail = CONTENT_W - TITLE_RESERVED_W
        const size = fitTitleSize((pt) => {
          s.setF('sans', 'bold', pt, INK)
          return doc.getTextWidth(title)
        }, avail)
        s.setF('sans', 'bold', size, INK)
        doc.text(truncateToWidth((t) => doc.getTextWidth(t), title, avail), M, s.y)
      }
      // verdict chip (top right)
      {
        const w = 52, x = M + CONTENT_W - w, cy = s.y - 9
        doc.setFillColor(...(ok ? OK_BG : FAIL_BG))
        doc.setDrawColor(...(ok ? OK_EDGE : FAIL_EDGE))
        doc.setLineWidth(0.25)
        doc.roundedRect(x, cy, w, 13, 1.6, 1.6, 'FD')
        s.setF('sans', 'bold', 8.4, ok ? OK_FG : FAIL_FG)
        doc.text(verdictLabel ?? (ok ? 'DESIGN OK' : 'CHECK FAILED'), x + 3.5, cy + 5.4, { charSpace: 0.2 })
        s.setF('sans', 'normal', 5.6, ok ? [77, 122, 95] : [169, 91, 71])
        doc.text(doc.splitTextToSize(governing, w - 7).slice(0, 2), x + 3.5, cy + 8.8)
      }
      s.y += 4.5
      let bx = M
      for (const b of badges) {
        s.setF('mono', 'normal', 6.2, BRAND)
        const w = doc.getTextWidth(b) + 3.2
        doc.setFillColor(234, 241, 249); doc.setDrawColor(205, 220, 240); doc.setLineWidth(0.2)
        doc.roundedRect(bx, s.y - 2.9, w, 4.2, 0.7, 0.7, 'FD')
        doc.text(b, bx + 1.6, s.y)
        bx += w + 2
      }
      s.y += 6
    },

    letterheadGrid(cells) {
      const cw = CONTENT_W / 3, ch = 9.5
      const rows = Math.ceil(cells.length / 3)
      doc.setDrawColor(...HAIR); doc.setLineWidth(0.25)
      doc.roundedRect(M, s.y, CONTENT_W, ch * rows, 1.6, 1.6, 'S')
      cells.forEach(([k, v, mono], i) => {
        const cx = M + (i % 3) * cw, cy = s.y + Math.floor(i / 3) * ch
        if (i % 3 > 0) { doc.setDrawColor(...HAIR_SOFT); doc.line(cx, cy, cx, cy + ch) }
        if (i >= 3) { doc.setDrawColor(...HAIR_SOFT); doc.line(cx, cy, cx + cw, cy) }
        s.setF('sans', 'bold', 5, FAINT)
        doc.text(k, cx + 2.5, cy + 3.4, { charSpace: 0.4 })
        s.setF(mono ? 'mono' : 'sans', mono ? 'normal' : 'bold', 6.8, INK)
        doc.text(doc.splitTextToSize(v, cw - 5)[0] ?? '', cx + 2.5, cy + 7.2)
      })
      s.y += ch * rows + 2
    },

    statCards(stats) {
      const cw = (CONTENT_W - 5) / 3, ch = 10.5
      stats.forEach((st, i) => {
        if (i % 3 === 0) s.ensure(ch + 2.5)
        const cx = M + (i % 3) * (cw + 2.5)
        doc.setDrawColor(...HAIR); doc.setLineWidth(0.25)
        doc.roundedRect(cx, s.y, cw, ch, 1.4, 1.4, 'S')
        s.setF('sans', 'bold', 5, FAINT)
        doc.text(st.label.toUpperCase(), cx + 2.5, s.y + 3.6, { charSpace: 0.35 })
        s.setF('mono', 'bold', 8.4, INK)
        const shown = doc.splitTextToSize(st.value, cw - (st.unit ? 12 : 5))[0] ?? ''
        doc.text(shown, cx + 2.5, s.y + 8.2)
        if (st.unit) {
          s.setF('mono', 'normal', 6, FAINT)
          doc.text(st.unit, cx + 3.5 + doc.getTextWidth(shown) * 8.4 / 6, s.y + 8.2)
        }
        if (i % 3 === 2 || i === stats.length - 1) s.y += ch + 2.5
      })
    },

    async figure(dataUrl, caption, maxH = 120) {
      try {
        const { w, h } = await imageSize(dataUrl)
        const { drawW, drawH, x: imgX } = fitFigure(w, h, maxH)
        s.ensure(drawH + 10)
        s.y += 2
        doc.setDrawColor(...HAIR); doc.setLineWidth(0.25)
        doc.roundedRect(M, s.y, CONTENT_W, drawH + 6.5, 1.6, 1.6, 'S')
        // The compression argument is NOT optional in practice: jsPDF defaults
        // to 'NONE', which embeds the raster as raw DeviceRGB. A 1446×1410
        // figure is then 1446·1410·3 = 6,116,580 bytes of literal pixel data,
        // and a one-beam calc sheet came out at 6.3 MB. 'SLOW' is Flate at best
        // effort — worth it for line art, which deflates enormously.
        doc.addImage(dataUrl, 'PNG', imgX + 1, s.y + 1, drawW - 2, drawH - 2, undefined, 'SLOW')
        s.setF('mono', 'normal', 5.8, FAINT)
        doc.text(caption, M + 2.5, s.y + drawH + 3)
        s.y += drawH + 9
      } catch { /* image unavailable — skip the figure rather than fail the export */ }
    },

    solutionSteps(steps, indexPrefix) {
      const RIGHT_W = 30, LEFT_W = CONTENT_W - RIGHT_W - 4
      steps.forEach((st, si) => {
        s.ensure(12)
        const stepTop = s.y
        // Margin column FIRST, beside the step's opening line.
        //
        // It used to be drawn after the body at `min(stepTop, y)`, which put it
        // at the top of the CONTINUATION page whenever a step broke across a
        // page — a PASS chip and a clause floating alone above the next step,
        // colliding with its margin. Drawing it up front keeps it attached to
        // the step it describes, which is the only place it means anything.
        {
          const rx = M + LEFT_W + 4
          let ry = stepTop
          if (st.pass !== undefined) { s.chip(rx, ry + 0.2, st.pass); ry += 4.6 }
          const margin = st.clause ?? st.note
          if (margin) {
            s.setF('sans', 'normal', 5.6, FAINT)
            doc.text(doc.splitTextToSize(margin, RIGHT_W - 2), rx, ry)
          }
        }
        s.setF('mono', 'bold', 6, FAINT)
        doc.text(indexPrefix ? `${indexPrefix}${si + 1}` : `${si + 1}`.padStart(2, '0'), M, s.y + 0.2)
        s.setF('sans', 'bold', 7, INK)
        doc.text(doc.splitTextToSize(st.title, LEFT_W - 8), M + 6, s.y)
        s.y += 3.6
        for (const ln of st.lines) {
          if ('text' in ln) {
            s.setF('sans', 'normal', 6.6, MUTED)
            for (const w of doc.splitTextToSize(ln.text, LEFT_W - 6)) { s.ensure(3.2); doc.text(w, M + 6, s.y); s.y += 3.1 }
            s.y += 0.4
          } else {
            s.setF('mono', 'normal', 6.4, INK)
            const wrapped = doc.splitTextToSize(texToPlain(ln.tex), LEFT_W - 10)
            const boxH = wrapped.length * 3.2 + 2.4
            s.ensure(boxH + 1.5)
            doc.setFillColor(...EQ_BG); doc.setDrawColor(...HAIR_SOFT); doc.setLineWidth(0.15)
            doc.roundedRect(M + 6, s.y - 0.6, LEFT_W - 6, boxH, 0.9, 0.9, 'FD')
            let ly = s.y + 2.6
            for (const w of wrapped) { doc.text(w, M + 8, ly); ly += 3.2 }
            s.y += boxH + 1.3
          }
        }
        s.y += 1
        doc.setDrawColor(...HAIR_SOFT); doc.setLineWidth(0.15)
        doc.line(M, s.y, M + CONTENT_W, s.y)
        s.y += 3
      })
    },

    signatures(preparedBy) {
      s.ensure(34)
      s.y += 6
      const half = (CONTENT_W - 10) / 2
      doc.setDrawColor(...INK); doc.setLineWidth(0.3)
      doc.line(M, s.y + 10, M + half, s.y + 10)
      doc.line(M + half + 10, s.y + 10, M + CONTENT_W, s.y + 10)
      s.setF('sans', 'bold', 7, INK)
      doc.text(preparedBy || ' ', M, s.y + 13.6)
      s.setF('sans', 'normal', 6, SUBTLE)
      doc.text('Prepared by', M, s.y + 17)
      doc.text('Reviewed by · Date', M + half + 10, s.y + 17)
      s.y += 22
    },

    disclaimer(text) {
      s.ensure(12)
      s.setF('sans', 'normal', 5.8, FAINT)
      doc.text(doc.splitTextToSize(text, CONTENT_W), M, s.y)
    },

    pageFooters(docLabel, sheet, today, project) {
      const pages = doc.getNumberOfPages()
      for (let p = 1; p <= pages; p++) {
        doc.setPage(p)
        if (p > 1) {
          s.setF('mono', 'normal', 5.6, FAINT)
          doc.text(docLabel, M, M - 5)
          doc.text(`${sheet} · ${today}`, M + CONTENT_W, M - 5, { align: 'right' })
          doc.setDrawColor(...HAIR_SOFT); doc.setLineWidth(0.15)
          doc.line(M, M - 3.5, M + CONTENT_W, M - 3.5)
        }
        doc.setDrawColor(...HAIR_SOFT); doc.setLineWidth(0.15)
        doc.line(M, FOOT_Y + 3, M + CONTENT_W, FOOT_Y + 3)
        s.setF('mono', 'normal', 5.6, FAINT)
        doc.text(`${sheet} · ${project || BRAND_NAME}`, M, FOOT_Y + 6.5)
        doc.text(`page ${p} / ${pages}`, M + CONTENT_W, FOOT_Y + 6.5, { align: 'right' })
      }
    },
  }
  return s
}

/** Re-export so report modules need only import from the kit. */
export { autoTable }
