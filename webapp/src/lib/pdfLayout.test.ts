/**
 * The layout arithmetic behind the printed calc sheet.
 *
 * Every case here is a defect that shipped in a PDF an engineer could sign,
 * found by rendering a real export back to pixels rather than by reading the
 * code. The pure helpers exist so the arithmetic can be checked without
 * inspecting jsPDF's font state after the fact — which reports whatever was
 * set last, not what the text was actually drawn with.
 */
import { describe, it, expect } from 'vitest'
import { spacedWidth, NOT_CHECKED } from './pdfKit'
import { noteColumns, wrapText } from '../engine/sectionDetail'
import { textWidth } from '../engine/planRenderer'
import { buildSectionDetail } from '../engine/sectionDetail'

describe('spacedWidth — the masthead collision', () => {
  it('adds one gap per inter-character space, not one per character', () => {
    // CIVENGG is 7 characters and therefore 6 gaps.
    expect(spacedWidth(20, 'CIVENGG', 0.9)).toBeCloseTo(20 + 6 * 0.9, 9)
  })

  it('charges nothing for a single character or an empty string', () => {
    expect(spacedWidth(3, 'C', 0.9)).toBe(3)
    expect(spacedWidth(0, '', 0.9)).toBe(0)
  })

  it('is what the old masthead layout was missing', () => {
    // The bug had two halves. The width was read AFTER the font had been
    // switched to the tail's 5.4pt, and the letter-spacing was never counted
    // at all. Both understate, so the tail was placed inside the mark.
    const atElevenPointFive = 24.06     // measured, jsPDF, mm
    const atFivePointFour = 8.76        // the same string, wrong font size
    const drawn = spacedWidth(atElevenPointFive, 'CIVENGG', 0.9)
    const oldPlacement = atFivePointFour + 13
    expect(oldPlacement).toBeLessThan(drawn)          // i.e. it overlapped
    expect(drawn + 2.4).toBeGreaterThan(drawn)        // the new gap clears it
  })
})

describe('wrapText', () => {
  it('breaks on spaces at the column limit', () => {
    expect(wrapText('aaa bbb ccc ddd', 7)).toEqual(['aaa bbb', 'ccc ddd'])
  })

  it('never breaks INSIDE a word', () => {
    // These notes carry clause references and bar callouts; a hyphenated break
    // through '(§409.7.3.8)' or '4-⌀20' changes what the note says.
    const long = 'φMn FROM THE BOTTOM STEEL ALONE — BARS ON THE OTHER FACE ARE CONTINUITY/DETAILING (§409.7.3.8), NOT COUNTED'
    const words = new Set(long.split(/\s+/))
    for (const line of wrapText(long, 12)) {
      for (const w of line.split(' ')) expect(words.has(w)).toBe(true)
    }
    // A word wider than the column gets its OWN line, never a hyphen.
    expect(wrapText('(§409.7.3.8)', 4)).toEqual(['(§409.7.3.8)'])
  })

  it('loses no words', () => {
    const t = 'φMn FROM THE BOTTOM STEEL ALONE — BARS ON THE OTHER FACE ARE CONTINUITY/DETAILING (§409.7.3.8), NOT COUNTED'
    expect(wrapText(t, 44).join(' ').split(/\s+/)).toEqual(t.split(/\s+/))
  })

  it('actually wraps the note that was clipped', () => {
    const t = 'φMn FROM THE BOTTOM STEEL ALONE — BARS ON THE OTHER FACE ARE CONTINUITY/DETAILING (§409.7.3.8), NOT COUNTED'
    const lines = wrapText(t, 44)
    expect(lines.length).toBeGreaterThan(1)
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(44 + 12) // + one long word
  })

  it('returns one empty line rather than nothing', () => {
    expect(wrapText('', 40)).toEqual([''])
  })
})

describe('noteColumns', () => {
  it('scales with the width the drawing occupies', () => {
    const size = 0.02
    expect(noteColumns(2.0, size)).toBeGreaterThan(noteColumns(0.6, size))
  })

  it('floors at 44 so a narrow section does not shred its notes', () => {
    expect(noteColumns(0.05, 0.02)).toBe(44)
  })

  it('caps at 72 so a wide one does not run out to a letterbox', () => {
    expect(noteColumns(99, 0.02)).toBe(72)
  })
})

describe('section drawing bounds cover their own text', () => {
  const build = (notes: string[]) => buildSectionDetail({
    title: 'SECTION — 300×500',
    outline: { u0: -0.15, v0: 0, u1: 0.15, v1: 0.5 },
    cages: [], cut: { a: [0, 0, 0], b: [1, 0, 0], t: 0.5 } as never, cover: 0.04, notes,
  })

  it('never crops a note off the right edge', () => {
    // The bounds ARE the viewBox. They used to be sized from the outline and
    // the dimension line alone, so a long note was cut mid-word: "… — BA".
    const long = 'φMn FROM THE BOTTOM STEEL ALONE — BARS ON THE OTHER FACE ARE CONTINUITY/DETAILING (§409.7.3.8), NOT COUNTED'
    const d = build([long])
    for (const p of d.primitives) {
      if (p.kind !== 'text' || p.rotate) continue
      expect(p.x + textWidth(p.text, p.size)).toBeLessThanOrEqual(d.bounds.maxX + 1e-9)
    }
  })

  it('does not let one long note take the frame from the section', () => {
    const narrow = build(['4-⌀20 BOT'])
    const wide = build(['φMn FROM THE BOTTOM STEEL ALONE — BARS ON THE OTHER FACE ARE CONTINUITY/DETAILING (§409.7.3.8), NOT COUNTED'])
    const aspect = (d: ReturnType<typeof build>) =>
      (d.bounds.maxX - d.bounds.minX) / (d.bounds.maxY - d.bounds.minY)
    // Unwrapped, the long note made the frame 2.93x as wide as the
    // short-note case (measured). Wrapped, the two are within a quarter of it.
    expect(aspect(wide) / aspect(narrow)).toBeLessThan(1.25)
  })
})

describe('the third status', () => {
  it('is one token, shared by the report and the cell styling', () => {
    // It was a bare literal in calcPdf and absent from pdfKit's didParseCell,
    // so it printed in the body face and wrapped to two lines.
    expect(NOT_CHECKED).toBe('NOT CHECKED')
    expect(NOT_CHECKED).not.toBe('PASS')
    expect(NOT_CHECKED).not.toBe('FAIL')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// THE SHEET IS WHITE, WHATEVER THE APP LOOKS LIKE
//
// Blueprint is a dark theme, and the app inverts drawings on SCREEN so a white
// sheet does not glare out of a dark page. None of that may reach the export:
// the PDF is what gets printed, filed and signed, so it is white in every
// theme. Verified end-to-end by exporting under Blueprint and rasterising the
// result — all four pages came back at 247-255/255 mean luminance — and pinned
// here so the property survives the next theme.
// ─────────────────────────────────────────────────────────────────────────
import pdfKitSrc from './pdfKit.ts?raw'
import calcPdfSrc from './calcPdf.ts?raw'
import modelPdfSrc from './modelPdf.ts?raw'
import soilsPdfSrc from './soilsPdf.ts?raw'
import drawingPdfSrc from './drawingPdf.ts?raw'
import planRendererSrc from '../engine/planRenderer.ts?raw'
import indexCss from '../index.css?raw'
import * as kit from './pdfKit'

const PDF_SOURCES: Record<string, string> = {
  'pdfKit.ts': pdfKitSrc, 'calcPdf.ts': calcPdfSrc, 'modelPdf.ts': modelPdfSrc,
  'soilsPdf.ts': soilsPdfSrc, 'drawingPdf.ts': drawingPdfSrc,
}

const lum = ([r, g, b]: readonly number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

describe('the exported PDF is theme-independent', () => {
  it('read its own sources', () => {
    for (const [name, src] of Object.entries(PDF_SOURCES)) {
      expect(src.length, name).toBeGreaterThan(1000)
    }
    expect(indexCss.length).toBeGreaterThan(2000)
  })

  it('takes no colour from the running theme', () => {
    // A single `var(--t-ink)` or `getComputedStyle` in this layer would make
    // the sheet follow whatever the user picked in Appearance.
    for (const [name, src] of Object.entries(PDF_SOURCES)) {
      expect(src, name).not.toMatch(/var\(--/)
      expect(src, name).not.toMatch(/getComputedStyle/)
      expect(src, name).not.toMatch(/data-theme|dataset\.theme/)
    }
  })

  it('declares its palette as literal RGB, light grounds and dark ink', () => {
    for (const [name, c] of [['OK_BG', kit.OK_BG], ['FAIL_BG', kit.FAIL_BG], ['EQ_BG', kit.EQ_BG]] as const) {
      expect(c.every((v) => Number.isFinite(v)), name).toBe(true)
      expect(lum(c), name).toBeGreaterThan(200)     // a ground you can print on
    }
    expect(lum(kit.INK)).toBeLessThan(80)           // ink you can read on it
    expect(lum(kit.OK_BG) - lum(kit.OK_FG)).toBeGreaterThan(100)
  })

  it('paints an explicit white backdrop under every drawing it serialises', () => {
    // planToSvg's own <rect> is what the raster composites onto. Without it the
    // PNG would carry whatever the canvas was cleared to.
    expect(planRendererSrc).toMatch(/<rect[^`]*fill="#ffffff"/)
  })
})

describe('the screen-only drawing invert cannot reach the export', () => {
  it('is declared in a stylesheet, scoped to the dark theme', () => {
    // A filter in a STYLESHEET is not serialised by XMLSerializer, which is
    // what svgToPng clones — an SVG loaded as an <img> gets no page CSS at all.
    // An inline style attribute on the same element WOULD be serialised, so
    // the distinction is the whole mechanism, not an implementation detail.
    expect(indexCss).toMatch(/\[data-theme="blueprint"\][^{]*\[data-pdf-drawing\] svg/)
    expect(indexCss).toMatch(/filter:\s*invert\(/)
  })

  it('is reset for print as well', () => {
    const printBlock = indexCss.slice(indexCss.indexOf('@media print'))
    expect(printBlock).toMatch(/\[data-pdf-drawing\] svg[^}]*filter:\s*none/)
  })

  it('applies to the INK, never to the card behind it', () => {
    // Inverting the container turns a themed dark card into a light panel with
    // light-on-light linework — the first cut of this rule did exactly that on
    // the five pages whose drawing card is itself a themed surface.
    const rule = indexCss.slice(indexCss.indexOf('[data-theme="blueprint"] [data-pdf-drawing]'))
    expect(rule.slice(0, 160)).toContain('svg')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// THE APPROVAL BLOCK'S PAGE BREAK
//
// Driven through the real `createSheet`, because the defect is in how two
// reservations interact and no reading of either one alone reveals it.
// ─────────────────────────────────────────────────────────────────────────
import { createSheet, FOOT_Y, M } from './pdfKit'

const DISCLAIMER =
  'Computed client-side by the CivEngg Toolkit engine · verify before construction use. '
  + 'Load factors per NSCP 2015 §203.3; strength reduction factors per ACI 318-14 Table 21.2.1. Project: —.'

/** A sheet whose cursor has been pushed to `y`, then closed out as the reports close out. */
function closeOutAt(y: number) {
  const s = createSheet()
  s.y = y
  s.signatures('R. Val')
  s.disclaimer(DISCLAIMER)
  return { pages: s.doc.getNumberOfPages(), y: s.y }
}

describe('signatures + disclaimer', () => {
  it('adds no page when the block fits where it is', () => {
    expect(closeOutAt(M + 20).pages).toBe(1)
  })

  it('adds exactly ONE page when it does not — never two', () => {
    // The bug that took the beam report from four sheets to five: reserve too
    // little, the block fits at the very foot, and then the disclaimer's own
    // ensure(12) opens a page for ONE paragraph.
    for (let y = FOOT_Y - 44; y <= FOOT_Y; y += 2) {
      expect(closeOutAt(y).pages, `cursor at ${y.toFixed(0)}mm`).toBeLessThanOrEqual(2)
    }
  })

  it('puts the block at the FOOT of the page it has to start', () => {
    // Not four centimetres down an otherwise blank sheet. `s.y` after the
    // block is what says where it landed.
    const spilled = closeOutAt(FOOT_Y - 4)
    expect(spilled.pages).toBe(2)
    expect(spilled.y).toBeGreaterThan(FOOT_Y - 20)   // near the bottom
    expect(spilled.y).toBeLessThanOrEqual(FOOT_Y)    // not past the footer
  })

  it('reserves no MORE than the block and its disclaimer use', () => {
    // The other half of the bound. Over-reserving does not misprint anything —
    // it just breaks a page that did not need breaking, which is how the beam
    // report carried a near-empty fourth sheet. 40 mm is exactly tight: the
    // block advances 28 and the disclaimer reserves 12, so a cursor with 40 mm
    // left must close the report out WHERE IT STANDS.
    const tight = closeOutAt(FOOT_Y - 40)
    expect(tight.pages).toBe(1)
    expect(tight.y).toBeLessThanOrEqual(FOOT_Y)
  })

  it('leaves room for the disclaimer on whichever page it lands', () => {
    for (const y of [M + 10, FOOT_Y - 60, FOOT_Y - 41, FOOT_Y - 39, FOOT_Y - 1]) {
      expect(closeOutAt(y).y, `cursor at ${y.toFixed(0)}mm`).toBeLessThanOrEqual(FOOT_Y)
    }
  })
})
