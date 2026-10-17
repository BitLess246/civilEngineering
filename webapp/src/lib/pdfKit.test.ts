import { describe, it, expect } from 'vitest'
import { fitFigure, fitTitleSize, truncateToWidth, createSheet, CONTENT_W, TITLE_RESERVED_W, M, PAGE_H, FOOT_Y, titleLayout, capsLabel, keepTogether, SIGNATURE_BLOCK_H } from './pdfKit'
import { DEFAULT_PDF_STYLE, type PdfStyle } from './pdfStyle'

describe('fitFigure', () => {
  it('fills the column width when the image is short enough', () => {
    const f = fitFigure(1600, 900, 120)
    expect(f.drawW).toBeCloseTo(CONTENT_W, 6)
    expect(f.drawH).toBeCloseTo(CONTENT_W * 900 / 1600, 6)
    expect(f.x).toBeCloseTo(M, 6)
  })

  it('PRESERVES ASPECT when the height cap bites', () => {
    // The regression: capping the height while leaving the width at the full
    // column squashed a 300×500 beam section into something nearly square.
    const w = 1446, h = 1410, maxH = 150
    const f = fitFigure(w, h, maxH)
    expect(f.drawH).toBeCloseTo(maxH, 6)
    expect(f.drawH / f.drawW).toBeCloseTo(h / w, 6)
    expect(f.drawW).toBeLessThan(CONTENT_W)
  })

  it('centres the image in the column once it is narrower than the column', () => {
    const f = fitFigure(500, 2000, 100)
    expect(f.x - M).toBeCloseTo((CONTENT_W - f.drawW) / 2, 6)
    expect(f.x).toBeGreaterThan(M)
  })

  it('never exceeds either bound, over a sweep of shapes', () => {
    for (const w of [100, 640, 1446, 4000]) {
      for (const h of [80, 900, 1410, 5000]) {
        const f = fitFigure(w, h, 120)
        expect(f.drawW, `${w}x${h}`).toBeLessThanOrEqual(CONTENT_W + 1e-9)
        expect(f.drawH, `${w}x${h}`).toBeLessThanOrEqual(120 + 1e-9)
        expect(f.drawH / f.drawW, `${w}x${h}`).toBeCloseTo(h / w, 6)
      }
    }
  })

  it('degrades safely on a zero-sized image instead of dividing by zero', () => {
    const f = fitFigure(0, 0, 120)
    expect(Number.isFinite(f.drawW)).toBe(true)
    expect(Number.isFinite(f.drawH)).toBe(true)
  })
})

describe('sheet cursor', () => {
  it('breaks to a new page only when the requested space does not fit', () => {
    const s = createSheet()
    const pages = () => s.doc.getNumberOfPages()
    s.y = FOOT_Y - 20
    s.ensure(10)
    expect(pages(), 'should not break — 10mm fits in 20mm').toBe(1)
    s.ensure(30)
    expect(pages(), 'should break — 30mm does not fit in 20mm').toBe(2)
    expect(s.y).toBe(M + 6)
  })

  it('keeps the footer band clear', () => {
    expect(FOOT_Y).toBeLessThan(PAGE_H)
    expect(PAGE_H - FOOT_Y).toBeGreaterThanOrEqual(10)
  })
})

describe('title fitting', () => {
  const AVAIL = CONTENT_W - TITLE_RESERVED_W
  // A real measurer: the same font and metrics the header uses.
  const measurer = (title: string) => {
    const s = createSheet()
    return (pt: number) => { s.setF('sans', 'bold', pt, [0, 0, 0]); return s.doc.getTextWidth(title) }
  }

  const SHORT = 'Structure — Design Calculation'
  const LONG = 'Flexible Combined Footing on Elastic Subgrade — Design Calculation'

  it('leaves a short title at full size', () => {
    expect(fitTitleSize(measurer(SHORT), AVAIL)).toBe(15.5)
  })

  it('shrinks a long title until it clears the verdict chip', () => {
    const m = measurer(LONG)
    // the case is real: at full size this title WOULD run under the chip
    expect(m(15.5)).toBeGreaterThan(AVAIL)
    const size = fitTitleSize(m, AVAIL)
    expect(size).toBeLessThan(15.5)
    expect(size).toBe(9.5)   // this one bottoms out; the ellipsis test covers the rest
  })

  it('stops at the floor rather than shrinking a pathological title to nothing', () => {
    const m = measurer('X'.repeat(400))
    expect(fitTitleSize(m, AVAIL)).toBe(9.5)
  })

  it('ellipsises what still will not fit at the floor, rather than cutting mid-word', () => {
    // Shrinking alone is not enough — this title is still ~130mm at 9.5pt
    // against 126mm available, and would otherwise be sliced at whatever
    // character ran out of room.
    const s = createSheet()
    s.setF('sans', 'bold', 9.5, [0, 0, 0])
    const measure = (t: string) => s.doc.getTextWidth(t)
    const out = truncateToWidth(measure, LONG, AVAIL)
    expect(measure(out)).toBeLessThanOrEqual(AVAIL)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThan(LONG.length)
  })

  it('leaves text that already fits completely untouched', () => {
    const s = createSheet()
    s.setF('sans', 'bold', 15.5, [0, 0, 0])
    const measure = (t: string) => s.doc.getTextWidth(t)
    expect(truncateToWidth(measure, SHORT, AVAIL)).toBe(SHORT)
  })
})

// A fixed-pitch measure: 0.2 mm per character per point.
const mono = (t: string, pt: number) => t.length * pt * 0.2

describe('titleLayout — wrap before cutting', () => {
  it('one line at the largest size that fits', () => {
    expect(titleLayout(mono, 'Beam — Design Calculation', 110)).toEqual({ size: 15.5, lines: ['Beam — Design Calculation'] })
  })
  it('two whole lines rather than an ellipsis when one line would need to go below the floor', () => {
    const t = 'Slender Reinforced Concrete Column (Non-sway) — Design Calculation'
    const r = titleLayout(mono, t, 110)
    expect(r.lines.length).toBe(2)
    expect(r.lines.join(' ')).toBe(t)                       // nothing lost
    expect(r.lines.every((l) => mono(l, r.size) <= 110)).toBe(true)
  })
  it('only a title too long for two lines at the floor is cut, on its second line', () => {
    const t = 'Word '.repeat(60).trim()
    const r = titleLayout(mono, t, 110)
    expect(r.size).toBe(9.5)
    expect(r.lines[1].endsWith('…')).toBe(true)
  })
})

describe('capsLabel — uppercase unless it changes the meaning', () => {
  it('words are uppercased', () => expect(capsLabel('Utilisation')).toBe('UTILISATION'))
  it('δ stays δ — uppercased it is Δ, a displacement', () => expect(capsLabel('δ')).toBe('δ'))
  it('short symbols keep their case: Mc, fy, Pu, Ast', () => {
    for (const s of ['Mc', 'fy', 'Pu', 'Ast']) expect(capsLabel(s)).toBe(s)
  })
  it('acronyms already upper stay upper', () => expect(capsLabel('PGA')).toBe('PGA'))
})

describe('keepTogether', () => {
  it('moves a block that fits on a fresh page but not here', () => {
    expect(keepTogether(FOOT_Y - 20, SIGNATURE_BLOCK_H)).toBe(true)
    expect(keepTogether(M + 30, SIGNATURE_BLOCK_H)).toBe(false)
  })
  it('never moves a block taller than a page — it breaks wherever it is', () => {
    expect(keepTogether(FOOT_Y - 20, PAGE_H)).toBe(false)
  })
})

describe('styled sheets (pdfStyle)', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  /** Every string drawn, with the page it landed on. */
  function capture(s: ReturnType<typeof createSheet>) {
    const drawn: { page: number; text: string; x: number; y: number }[] = []
    const orig = s.doc.text.bind(s.doc)
    s.doc.text = ((t: string | string[], x: number, y: number, o?: unknown) => {
      for (const line of [t].flat()) drawn.push({ page: s.doc.getCurrentPageInfo().pageNumber, text: line, x, y })
      return orig(t, x, y, o as never)
    }) as typeof s.doc.text
    return drawn
  }
  const style = (o: Partial<PdfStyle>): PdfStyle => ({ ...DEFAULT_PDF_STYLE, ...o })

  it('Letter paper: the page is 215.9 × 279.4 mm and the column widens, margins kept', () => {
    const s = createSheet(style({ paper: 'letter' }))
    expect(s.doc.internal.pageSize.getWidth()).toBeCloseTo(215.9, 1)
    expect(s.doc.internal.pageSize.getHeight()).toBeCloseTo(279.4, 1)
    expect(s.contentW).toBeCloseTo(215.9 - 2 * M, 6)
    expect(s.footY).toBeCloseTo(279.4 - 12, 6)
    const a4 = createSheet()
    expect(a4.contentW).toBe(CONTENT_W)
    expect(a4.footY).toBe(FOOT_Y)
  })

  it('a Letter sheet breaks pages at ITS foot, not A4\'s', () => {
    const s = createSheet(style({ paper: 'letter' }))
    s.y = s.footY - 5
    s.ensure(10)
    expect(s.doc.getNumberOfPages()).toBe(2)
  })

  it('the cover is unnumbered: footers count content pages from 1, and the cover gets none', () => {
    const s = createSheet(style({ coverPage: true, checkedBy: 'R. Cruz', revision: 'B' }))
    const drawn = capture(s)
    s.coverPage({ title: 'Beam B-1 — Design Calculation', rows: [['Sheet', 'S-01'], ['Prepared by', '']] })
    s.doc.addPage()
    s.pageFooters('DOC', 'S-01', '2026-10-17', 'Proj')
    const onCover = drawn.filter((d) => d.page === 1).map((d) => d.text)
    expect(onCover).toContain('Beam B-1 — Design Calculation')
    expect(onCover).toContain('R. Cruz')                 // checker appended from the style
    expect(onCover).toContain('B')                       // and the revision
    expect(onCover).not.toContain('PREPARED BY')         // an empty row is left out
    expect(onCover.some((t) => t.startsWith('page '))).toBe(false)
    const footers = drawn.filter((d) => d.text.startsWith('page ')).map((d) => [d.page, d.text])
    expect(footers).toEqual([[2, 'page 1 / 2'], [3, 'page 2 / 2']])
  })

  it('revision, footer note and watermark reach every page', () => {
    const s = createSheet(style({ revision: 'A', footerNote: 'Confidential — Job 2026-114', watermark: 'DRAFT' }))
    const drawn = capture(s)
    s.doc.addPage()
    s.pageFooters('DOC', 'S-01', '2026-10-17', 'Proj')
    for (const p of [1, 2]) {
      const t = drawn.filter((d) => d.page === p).map((d) => d.text)
      expect(t, `page ${p}`).toContain('S-01 · REV A · Proj')
      expect(t, `page ${p}`).toContain('Confidential — Job 2026-114')
      expect(t, `page ${p}`).toContain('DRAFT')
    }
  })

  it('the default style paints no watermark, note or revision', () => {
    const s = createSheet()
    const drawn = capture(s)
    s.pageFooters('DOC', 'S-01', '2026-10-17', 'Proj')
    const t = drawn.map((d) => d.text)
    expect(t).toContain('S-01 · Proj')
    expect(t.some((x) => /REV|DRAFT/.test(x))).toBe(false)
  })

  it('the letterhead grid gains CHECKED BY and REVISION from the style', () => {
    const s = createSheet(style({ checkedBy: 'R. Cruz', revision: '2' }))
    const drawn = capture(s)
    s.letterheadGrid([['PROJECT', 'P', false], ['SHEET', 'S-01', true]])
    const t = drawn.map((d) => d.text)
    expect(t).toEqual(expect.arrayContaining(['CHECKED BY', 'R. Cruz', 'REVISION', '2']))
  })

  it('signatures off prints no approval block; on, the checker is named under Reviewed by', () => {
    const off = createSheet(style({ signatures: false }))
    const y0 = off.y
    off.signatures('A. Reyes')
    expect(off.y).toBe(y0)
    const on = createSheet(style({ checkedBy: 'R. Cruz' }))
    const drawn = capture(on)
    on.signatures('A. Reyes')
    expect(drawn.map((d) => d.text)).toEqual(expect.arrayContaining(['A. Reyes', 'R. Cruz']))
  })

  it('the firm replaces the wordmark in the masthead, beside its logo', () => {
    const s = createSheet(style({ firmName: 'Acme Structural', firmTagline: 'PRC Lic. 0123456', logo: PNG }))
    const drawn = capture(s)
    let images = 0
    const add = s.doc.addImage.bind(s.doc)
    s.doc.addImage = ((...a: Parameters<typeof s.doc.addImage>) => { images++; return add(...a) }) as typeof s.doc.addImage
    s.brandHeader({ docLabel: 'DOC', title: 'Beam', sheet: 'S-01', today: '2026-10-17', ok: true, governing: 'flexure', badges: [] })
    const firm = drawn.find((d) => d.text === 'Acme Structural')
    expect(firm).toBeDefined()
    expect(firm!.x).toBeGreaterThan(M)                   // pushed right of the logo
    expect(drawn.map((d) => d.text)).toContain('PRC Lic. 0123456')
    expect(images).toBe(1)
  })

  it('an unreadable logo is left out, not fatal', () => {
    const s = createSheet(style({ logo: 'data:image/png;base64,AAAA' }))
    expect(() => s.brandHeader({ docLabel: 'DOC', title: 'Beam', sheet: 'S-01', today: '2026-10-17', ok: true, governing: '', badges: [] })).not.toThrow()
  })
})
