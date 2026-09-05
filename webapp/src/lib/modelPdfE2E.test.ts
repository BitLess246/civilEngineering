import { describe, it, expect, beforeAll } from 'vitest'
import { jsPDF } from 'jspdf'
import { generateGridModel } from '../engine/modelBuilder'
import { designStructure, optimizeStructure } from '../engine/pipeline'
import { modelToFrame3D } from '../engine/modelBridge'
import { analyzeFrame3D } from '../engine/frame3d'
import { modalAnalysis } from '../engine/modal'
import type { RectSection } from '../engine/model'
import { buildModelReport } from './modelReport'
import { generateModelPdf } from './modelPdf'
import { buildSheetSet } from './planSheets'

// End-to-end: the full example structure — analysis, modal, design, optimize —
// assembled into the report payload and RENDERED to a real PDF in Node. The
// spec's verification gate: every section renders, pagination survives, and
// the output is a valid PDF document with all the new sections present.

const section: RectSection = { id: 'S1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }

// jsPDF's save() is a browser download; in Node we capture the bytes instead.
beforeAll(() => {
  ;(jsPDF as unknown as { API: Record<string, unknown> }).API.save = function save(this: jsPDF) {
    const buf = this.output('arraybuffer') as ArrayBuffer
    ;(jsPDF as unknown as { __last?: ArrayBuffer }).__last = buf
    return buf
  }
})

const lastPdfBytes = (): Uint8Array => {
  const buf = (jsPDF as unknown as { __last?: ArrayBuffer }).__last
  expect(buf).toBeInstanceOf(ArrayBuffer)
  return new Uint8Array(buf!)
}

/** /Type /Page objects in the document (the uncompressed object dictionaries). */
const pageCount = (bytes: Uint8Array): number => {
  const text = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
  return (text.match(/\/Type \/Page[^s]/g) ?? []).length
}

describe('structure report — full PDF render (example structure)', () => {
  it('renders analysis → design → optimization → schedules → appendices into a valid PDF', async () => {
    const model0 = generateGridModel({ baysX: [6, 6], baysZ: [5, 5], storeyH: [3, 3], section, slabThickness: 200 })
    model0.loads = model0.plates.flatMap((p) => [
      { kind: 'area' as const, plate: p.id, q: 4.8, cat: 'D' as const },
      { kind: 'area' as const, plate: p.id, q: 2.4, cat: 'L' as const },
    ])
    const br = modelToFrame3D(model0)
    const analysis = analyzeFrame3D(br.nodes, br.members, br.supports, br.loads, {}, undefined, br.diaphragmGroups, br.shells)
    const modal = modalAnalysis(model0, 12)
    const opt = optimizeStructure(model0, soil)!
    expect(opt).toBeTruthy()
    expect(analysis).toBeTruthy()
    expect(modal).toBeTruthy()

    const report = buildModelReport(opt.model, opt.design, [['Column grid', '6+6 × 5+5 m']], soil, null, null, {
      analysis, nodeOrder: br.nodes, modal, opt, tryBars: true,
    })
    // every workflow payload the fixture can produce must be present
    expect(report.exec).toBeDefined()
    expect(report.modelSummary).toBeDefined()
    expect(report.loading!.combos).toBeTruthy()
    expect(report.linear!.equilibrium!.ok).toBe(true)
    expect(report.modal).toBeDefined()
    expect(report.biaxial).toBeDefined()
    expect(report.optimization).toBeDefined()
    expect(report.trace!.length).toBeGreaterThan(0)
    expect(report.status!.length).toBeGreaterThan(10)
    expect(report.appendices!.length).toBeGreaterThanOrEqual(3)

    const sheets = buildSheetSet(opt.model, opt.design, soil)
    await generateModelPdf({
      lh: { project: 'Verification — example structure', sheet: 'S-001', preparedBy: 'Automated verification' },
      modelImg: null,
      badges: ['NSCP 2015', 'ACI 318-14'],
      report,
      sheets,
      fileName: 'structure-report-verification.pdf',
    })

    // validate the produced document: header, plausible size, paginated
    const bytes = lastPdfBytes()
    const header = Array.from(bytes.slice(0, 5), (b) => String.fromCharCode(b)).join('')
    expect(header).toBe('%PDF-')
    expect(bytes.byteLength).toBeGreaterThan(100_000)
    const pages = pageCount(bytes)
    expect(pages).toBeGreaterThanOrEqual(8)   // summary+workflow+schedules+solutions+drawings+appendices
  })

  it('renders the minimum report (no extras) with the classic 5-section shape', async () => {
    const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section, slabThickness: 200 })
    model.loads = model.plates.flatMap((p) => [
      { kind: 'area' as const, plate: p.id, q: 4.8, cat: 'D' as const },
      { kind: 'area' as const, plate: p.id, q: 2.4, cat: 'L' as const },
    ])
    const design = designStructure(model, soil)!
    const report = buildModelReport(model, design, [['Column grid', '6 × 5 m']], soil)
    expect(report.status).toBeUndefined()
    // must render without throwing — numbering falls back to 1..5
    await generateModelPdf({
      lh: { project: 'Verification — minimal', sheet: 'S-002', preparedBy: 'Automated verification' },
      modelImg: null,
      badges: ['NSCP 2015', 'ACI 318-14'],
      report,
      sheets: buildSheetSet(model, design, soil),
      fileName: 'structure-report-minimal.pdf',
    })
  })
})
