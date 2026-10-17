import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads } from '../engine/modelBuilder'
import { designStructure } from '../engine/pipeline'
import { buildModelReport } from './modelReport'
import { buildModelPdfInto } from './modelPdf'
import { buildSheetSet } from './planSheets'
import { createSheet } from './pdfKit'

// The Drawings section's group headings — PLANS, FRAME ELEVATIONS, … BAR
// BENDING SCHEDULES — each printed alone at the foot of a page, with the first
// sheet of its group starting the next. A heading is kept with its first sheet.
describe('model report — drawings section', () => {
  it('never leaves a group heading at the foot of a page without its first sheet', async () => {
    const section = { id: 's1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
    const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }
    const model = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.5, 3], section, slabThickness: 150 })
    model.loads = buildGravityLoads(model, 4.8, 2.4)
    const design = designStructure(model, soil)!
    const sheets = buildSheetSet(model, design, soil)
    const groups = new Set(sheets.map((s) => s.group.toUpperCase()))
    expect(groups.size).toBeGreaterThan(4)

    const sh = createSheet()
    const drawn: { page: number; text: string }[] = []
    const orig = sh.doc.text.bind(sh.doc)
    sh.doc.text = ((t: string | string[], x: number, y: number, o?: unknown) => {
      for (const line of [t].flat()) drawn.push({ page: sh.doc.getCurrentPageInfo().pageNumber, text: line })
      return orig(t, x, y, o as never)
    }) as typeof sh.doc.text
    const lh = { project: 'P', sheet: 'S-1', preparedBy: 'E' }
    await buildModelPdfInto(sh, { lh, report: buildModelReport(model, design, [], soil), modelImg: null, badges: [], sheets, sections: ['drawings'] })

    let checked = 0
    drawn.forEach((d, i) => {
      if (!groups.has(d.text)) return
      const caption = drawn.slice(i + 1).find((x) => /^\d+\.\d+ {2}/.test(x.text))!
      expect(caption.page, `${d.text} → ${caption.text}`).toBe(d.page)
      checked++
    })
    expect(checked).toBe(groups.size)
  }, 60000)
})
