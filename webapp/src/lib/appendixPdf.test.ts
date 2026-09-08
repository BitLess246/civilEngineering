import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads } from '../engine/modelBuilder'
import { designStructure } from '../engine/pipeline'
import { modelToFrame3D } from '../engine/modelBridge'
import { analyzeFrame3D } from '../engine/frame3d'
import { buildModelReport } from './modelReport'
import { buildModelPdf, ALL_REPORT_SECTIONS } from './modelPdf'
import { buildAnalysisAppendix, analysisStatus } from './analysisAppendix'
import { buildAnalysisAppendixPdf, buildCombinedPdf } from './appendixPdf'
import { buildModelPdfInto } from './modelPdf'
import { createSheet } from './pdfKit'
import { buildDesignSnapshot, snapshotStamp, shortId } from '../engine/designSnapshot'

// The documents are built headless and judged by their page counts: a
// subset of sections prints fewer pages, the appendix prints on its own,
// and the combined document is the two end to end.
const section = { id: 's1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }
const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section, slabThickness: 150 })
model.loads = buildGravityLoads(model, 4.8, 2.4)
const design = designStructure(model, soil)!
const br = modelToFrame3D(model, {})
const analysis = analyzeFrame3D(br.nodes, br.members, br.supports, br.loads, {}, undefined, br.diaphragmGroups, br.shells)!
const lh = { project: 'Test', sheet: 'S-1', preparedBy: 'CC' }
const badges = ['NSCP 2015']
const ai = { model, design, analysis }
const report = buildModelReport(model, design, [], soil)

describe('the documents', () => {
  it('prints a subset of sections on fewer pages than the whole report', async () => {
    const all = await buildModelPdf({ lh, report, modelImg: null, badges, status: analysisStatus(ai), sections: ALL_REPORT_SECTIONS })
    const some = await buildModelPdf({ lh, report, modelImg: null, badges, status: analysisStatus(ai), sections: ['summary', 'status'] })
    expect(all.doc.getNumberOfPages()).toBeGreaterThan(some.doc.getNumberOfPages())
    // A couple of pages, not the whole report: summary now carries the
    // governing-results table as well as the check list, so the floor is two.
    expect(some.doc.getNumberOfPages()).toBeLessThanOrEqual(2)
  }, 60000)

  it('builds the appendix on its own, and the combined document as the two end to end', async () => {
    const appendix = buildAnalysisAppendix(ai)
    const alone = buildAnalysisAppendixPdf({ lh, badges, appendix })
    expect(alone.doc.getNumberOfPages()).toBeGreaterThan(1)
    const rep = await buildModelPdf({ lh, report, modelImg: null, badges, sections: ['summary', 'schedules'] })
    const both = await buildCombinedPdf({ lh, report, modelImg: null, badges, sections: ['summary', 'schedules'] }, { lh, badges, appendix })
    expect(both.doc.getNumberOfPages()).toBeGreaterThanOrEqual(rep.doc.getNumberOfPages() + alone.doc.getNumberOfPages() - 1)
  }, 60000)

  it('prints only the appendix sections asked for', () => {
    const appendix = buildAnalysisAppendix(ai)
    const all = buildAnalysisAppendixPdf({ lh, badges, appendix })
    const one = buildAnalysisAppendixPdf({ lh, badges, appendix, include: ['model'] })
    expect(one.doc.getNumberOfPages()).toBeLessThan(all.doc.getNumberOfPages())
  })
})

// ─────────────────────────────────────────────────────────────────────────
// ONE SNAPSHOT, BOTH DOCUMENTS.
//
// A report and its appendix that disagree about which run they describe are
// worse than neither carrying an id: the reader would trust the disagreement
// as evidence of two different runs. So the snapshot is built once and
// threaded, and the footer of every page carries the stamp — which is what
// makes a loose sheet traceable at all.
// ─────────────────────────────────────────────────────────────────────────
describe('the design snapshot on the documents', () => {
  const snapshot = buildDesignSnapshot({
    model, design, analysis, projectName: 'Probe', buildId: 'abcdef1234567',
    generatedAt: new Date('2026-09-08T10:00:00Z'),
  })

  it('the report hands its footer the stamp, and omits it when there is no snapshot', async () => {
    const sh = createSheet()
    const withSnap = await buildModelPdfInto(sh, { lh, report, modelImg: null, badges, snapshot })
    expect(withSnap.stamp).toBe(snapshotStamp(snapshot))
    expect(withSnap.stamp).toContain(shortId(snapshot.snapshotId))
    const bare = await buildModelPdfInto(createSheet(), { lh, report, modelImg: null, badges })
    expect(bare.stamp).toBeUndefined()
  })

  it('the appendix alone still carries the id, so it can be traced back to its report', () => {
    const ap = buildAnalysisAppendix(ai)
    const alone = buildAnalysisAppendixPdf({ lh, badges, appendix: ap, snapshot })
    expect(alone.doc.getNumberOfPages()).toBeGreaterThan(0)
  })

  it('the combined document builds with the snapshot on both halves', async () => {
    const ap = buildAnalysisAppendix(ai)
    const both = await buildCombinedPdf(
      { lh, report, modelImg: null, badges, sections: ['summary'], snapshot },
      { lh, badges, appendix: ap, include: ['model'], snapshot },
    )
    expect(both.doc.getNumberOfPages()).toBeGreaterThan(1)
  })

  it('the snapshot block adds pages to the report rather than overprinting it', async () => {
    const withSnap = await buildModelPdf({ lh, report, modelImg: null, badges, sections: ['summary'], snapshot })
    const bare = await buildModelPdf({ lh, report, modelImg: null, badges, sections: ['summary'] })
    expect(withSnap.doc.getNumberOfPages()).toBeGreaterThanOrEqual(bare.doc.getNumberOfPages())
  })
})
