import { describe, it, expect } from 'vitest'
import dialogSrc from './ExportReportDialog.tsx?raw'
import modelSpaceSrc from '../pages/ModelSpace.tsx?raw'

// The export dialog's three output checkboxes are not three independent
// switches. "Combined PDF" is a DIFFERENT SHAPE of request — one bound file
// instead of two standalones — so while it is ticked the pair is implied
// (forced on, locked) and the exporter must write the bound file ONLY. This
// pins both halves, in the source-guard style ErrorBoundary.test.tsx
// established: the repo has no DOM harness, and these are wiring decisions
// that a broken refactor would quietly drop.

describe('the dialog binds the pair while Combined is ticked', () => {
  it('ticking Combined forces report+appendix on and stashes the free picks', () => {
    expect(dialogSrc).toContain('setFreePicks({ report: outputs.report, appendix: outputs.appendix })')
    expect(dialogSrc).toContain('setOutputs({ report: true, appendix: true, combined: true })')
  })

  it('unticking Combined restores the picks the user actually made', () => {
    expect(dialogSrc).toContain('setOutputs({ ...freePicks, combined: false })')
  })

  it('renders the pair locked (disabled) with a hint saying where the content went', () => {
    // The disabled flag is the third argument of box() — it must be the
    // combined flag itself, not a constant.
    expect(dialogSrc).toMatch(/'Structure Design Report',\n\s*outputs\.combined \? 'bound into the Combined PDF' : 'summary, schedules, worked solutions, drawings', outputs\.combined\)/)
    expect(dialogSrc).toMatch(/'Analysis Appendix',\n\s*outputs\.combined \? 'bound into the Combined PDF' : 'model, loads, results, modes, hinges, optimizer', outputs\.combined\)/)
  })
})

describe('the exporter writes one file for a combined request', () => {
  it('branches: Combined ticked → only the bound file', () => {
    expect(modelSpaceSrc).toContain('if (o.outputs.combined) {')
    expect(modelSpaceSrc).toContain('await appendixPdf.generateCombinedPdf(reportInput, appendixInputPdf, `${stem}-combined.pdf`)')
  })

  it('Combined unticked → the standalones, each only when asked', () => {
    expect(modelSpaceSrc).toMatch(/\} else \{\s*\n\s*if \(o\.outputs\.report\) await generateModelPdf\(/)
    expect(modelSpaceSrc).toMatch(/if \(o\.outputs\.appendix\) appendixPdf\.generateAnalysisAppendixPdf\(/)
  })
})
