import { describe, it, expect } from 'vitest'
import { buildCalcPdfScopeNotes } from './calcPdf'

describe('standalone calculator PDF scope notes', () => {
  it('does not claim universal NSCP or ACI clauses', () => {
    const notes = buildCalcPdfScopeNotes([])
    expect(notes.join(' ')).toContain('PASS applies only to the checks explicitly listed')
    expect(notes.join(' ')).toContain('engineer of record must verify')
    expect(notes.join(' ')).not.toContain('NSCP 2015 §203.3')
    expect(notes.join(' ')).not.toContain('ACI 318-14 Table 21.2.1')
  })

  it('identifies checks that were not evaluated', () => {
    const notes = buildCalcPdfScopeNotes([
      { name: 'Flexure', ratio: 0.82, ok: true },
      { name: 'Deflection', ratio: null, ok: false },
      { name: 'Punching shear', ratio: null, ok: false },
    ])
    expect(notes).toHaveLength(4)
    expect(notes[2]).toContain('Deflection, Punching shear')
    expect(notes[2]).toContain('excluded from the PASS verdict')
  })

  it('does not add a not-evaluated warning when all checks have ratios', () => {
    expect(buildCalcPdfScopeNotes([{ name: 'Flexure', ratio: 0.82, ok: true }])).toHaveLength(3)
  })
})
