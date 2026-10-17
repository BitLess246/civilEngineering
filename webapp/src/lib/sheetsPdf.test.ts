import { describe, it, expect } from 'vitest'
import { buildSheetsPdf, paintSheetsInto } from './sheetsPdf'
import { createSheet } from './pdfKit'
import { DEFAULT_STUDIO, buildStudio, sheetsOf } from './planStudio'
import { DEFAULT_PDF_STYLE } from './pdfStyle'

// Plan Studio's PDF: the chosen sheets on the report's own chrome, with the
// structure report's sheet painter, and a header that does not pretend the
// drawings were checked.
describe('a PDF of plan sheets', () => {
  const sheets = sheetsOf(buildStudio(DEFAULT_STUDIO).sheets, 'footings')

  it('heads the set as drawings, captions every sheet, and says it is not a design check', () => {
    const sh = createSheet(DEFAULT_PDF_STYLE)
    const seen: string[] = []
    const orig = sh.doc.text.bind(sh.doc)
    sh.doc.text = ((t: string | string[], x: number, y: number, o?: unknown) => {
      seen.push(...[t].flat())
      return orig(t, x, y, o as never)
    }) as typeof sh.doc.text
    paintSheetsInto(sh, { title: 'Plan Studio — Footing details', sheets })
    expect(seen).toContain('DRAWINGS')
    sheets.forEach((s, k) => expect(seen.some((t) => t.startsWith(`1.${k + 1}  ${s.title}`)), s.title).toBe(true))
    expect(seen.join(' ')).toMatch(/Nothing on these sheets has been checked against loads/)
  })

  it('a cover page, when the style asks for one, is one page more and comes first', () => {
    const plain = buildSheetsPdf({ title: 'Plan Studio', sheets, style: DEFAULT_PDF_STYLE }).doc
    const covered = buildSheetsPdf({ title: 'Plan Studio', sheets, style: { ...DEFAULT_PDF_STYLE, coverPage: true } }).doc
    expect(covered.getNumberOfPages()).toBe(plain.getNumberOfPages() + 1)
  })
})
