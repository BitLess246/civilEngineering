import { describe, it, expect } from 'vitest'
import { buildSoilsReport, type SoilsReport } from './report'
import { sampleInvestigation } from './sample'
import { emptyInvestigation } from './model'
import type { Investigation } from './model'

const SEISMIC = { amax: 0.4, magnitude: 7.5 }

const section = (r: SoilsReport, no: number) => r.sections.find((s) => s.no === no)!

describe('the document is always 22 sections', () => {
  const full = buildSoilsReport(sampleInvestigation(), { seismic: SEISMIC })
  const bare = buildSoilsReport(emptyInvestigation('Bare'))

  it('has all 22, numbered 1 to 22, in order', () => {
    for (const r of [full, bare]) {
      expect(r.sections).toHaveLength(22)
      expect(r.sections.map((s) => s.no)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1))
    }
  })

  it('NEVER drops a section for lack of data', () => {
    // The whole point. A generator that omits what it cannot support produces a
    // document that reads as complete, and the reader cannot tell "the clay is
    // not a liquefaction risk" from "liquefaction was never assessed".
    expect(bare.sections).toHaveLength(22)
    expect(bare.sections.every((s) => s.title.length > 3)).toBe(true)
  })

  it('gives every incomplete section a stated gap', () => {
    for (const r of [full, bare]) {
      for (const s of r.sections) {
        if (s.status !== 'complete') {
          expect(s.gap, `section ${s.no} (${s.title}) is ${s.status} with no gap stated`).toBeTruthy()
          expect(s.gap!.length).toBeGreaterThan(20)
        }
      }
    }
  })

  it('collects the gaps onto the report so the cover can carry them', () => {
    expect(bare.gaps.length).toBeGreaterThan(10)
    for (const g of bare.gaps) {
      expect(g.gap).toBe(section(bare, g.section).gap)
    }
  })

  it('reports completeness as a fraction, low for an empty investigation', () => {
    expect(bare.completeness).toBeLessThan(0.2)
    expect(full.completeness).toBeGreaterThan(bare.completeness)
    expect(full.completeness).toBeLessThanOrEqual(1)
  })
})

describe('sections that cannot be supported say WHY, not just that they cannot', () => {
  const bare = buildSoilsReport(emptyInvestigation('Bare'))

  it('names what would be needed for the seismic site class', () => {
    expect(section(bare, 11).gap).toMatch(/shear-wave velocity|top 30 m/)
  })

  it('names the missing design input for bearing and settlement', () => {
    expect(section(bare, 13).gap).toMatch(/footing geometry|founding depth/)
    expect(section(bare, 14).gap).toMatch(/loads and footing dimensions/)
  })

  it('says stratigraphy is the basis of everything downstream', () => {
    expect(section(bare, 5).gap).toMatch(/nothing downstream can be reported/)
  })

  it('says an absent laboratory programme pushes everything onto correlation', () => {
    expect(section(bare, 8).gap).toMatch(/field correlation or engineering assumption rather than measurement/)
  })
})

describe('groundwater — absence of a record is not a record of absence', () => {
  it('refuses to treat an unrecorded water table as a dry site', () => {
    const inv = sampleInvestigation()
    for (const b of inv.boreholes) b.groundwaterDepth = undefined
    const s = section(buildSoilsReport(inv), 6)
    expect(s.status).toBe('partial')
    expect(s.gap).toMatch(/Absence of a record is NOT a record of absence/)
    expect(s.gap).toMatch(/unconservative/)
  })

  it('flags a drilling-time level with no stabilised reading', () => {
    const inv = sampleInvestigation()
    for (const b of inv.boreholes) b.groundwaterDepthStabilised = undefined
    expect(section(buildSoilsReport(inv), 6).gap).toMatch(/well away from the stabilised water table/)
  })
})

describe('liquefaction section', () => {
  it('is NOT ASSESSED without a design earthquake, and says the report makes no statement', () => {
    // Silence here would read as "no liquefaction risk".
    const s = section(buildSoilsReport(sampleInvestigation()), 12)
    expect(s.status).toBe('not-assessed')
    expect(s.gap).toMatch(/makes no statement about liquefaction risk/)
    expect(s.tables).toHaveLength(0)
  })

  it('runs when a design earthquake is given', () => {
    const s = section(buildSoilsReport(sampleInvestigation(), { seismic: SEISMIC }), 12)
    expect(s.tables.length).toBeGreaterThan(0)
    expect(s.figures.length).toBeGreaterThan(0)
    expect(s.paragraphs.join(' ')).toMatch(/0\.4g/)
    expect(s.paragraphs.join(' ')).toMatch(/TRIGGERING only/)
  })

  it('does NOT read as an all-clear when nothing could be evaluated', () => {
    // The sample investigation stores no unit weights, so no effective stress
    // and no (N₁)₆₀ — every test is skipped. Saying "no test returned FS < 1"
    // there is true and materially misleading, and that is exactly the failure
    // this module exists to prevent. Found by reading real output, not by a
    // passing test.
    const s = section(buildSoilsReport(sampleInvestigation(), { seismic: SEISMIC }), 12)
    const text = s.paragraphs.join(' ')
    expect(text).toMatch(/NO TEST COULD BE EVALUATED/)
    expect(text).toMatch(/not a finding of no risk/)
    expect(text).not.toMatch(/No test in this investigation returned a factor of safety below unity/)
  })

  it('distinguishes "evaluated and safe" from "not evaluated"', () => {
    // Same hole, but with unit weights supplied so the checks actually run.
    const inv = sampleInvestigation()
    for (const b of inv.boreholes) {
      for (const l of b.layers) {
        inv.parameters.push({
          layerId: l.id, boreholeId: b.id,
          unitWeight: { value: 18, unit: 'kN/m³', provenance: { kind: 'assumed', rationale: 'test' } },
          saturatedUnitWeight: { value: 20, unit: 'kN/m³', provenance: { kind: 'assumed', rationale: 'test' } },
        })
      }
    }
    const s = section(buildSoilsReport(inv, { seismic: SEISMIC }), 12)
    const text = s.paragraphs.join(' ')
    expect(text).not.toMatch(/NO TEST COULD BE EVALUATED/)
    expect(text).toMatch(/Factors of safety below unity|Every evaluated test returned/)
  })

  it('needs SPT, and says so rather than reporting an empty assessment', () => {
    const inv = sampleInvestigation()
    for (const b of inv.boreholes) b.spt = []
    expect(section(buildSoilsReport(inv, { seismic: SEISMIC }), 12).gap).toMatch(/needs SPT blow counts/)
  })
})

describe('parameters section carries provenance into the document', () => {
  const s = section(buildSoilsReport(sampleInvestigation(), { seismic: SEISMIC }), 10)

  it('prints a basis column for every parameter', () => {
    expect(s.tables[0].head).toContain('Basis')
    expect(s.tables[0].head).toContain('Source')
    for (const row of s.tables[0].rows) {
      expect(row[3].length).toBeGreaterThan(2)
      expect(row[4].length).toBeGreaterThan(2)
    }
  })

  it('counts how many parameters rest on measurement versus correlation', () => {
    expect(s.paragraphs.join(' ')).toMatch(/rest on measurement or derivation/)
  })

  it('says measurements are never averaged with correlations', () => {
    expect(s.paragraphs.join(' ')).toMatch(/never averaged with correlations/)
  })
})

describe('the report refuses to hide an integrity error', () => {
  it('surfaces blocking errors separately from gaps', () => {
    const inv = sampleInvestigation()
    // Overlapping layers — an impossible log, not merely an unusual one.
    inv.boreholes[0].layers[0].depthBottom = 99
    const r = buildSoilsReport(inv)
    expect(r.blockingIssues.length).toBeGreaterThan(0)
  })

  it('has none for the sample investigation, which validates clean', () => {
    expect(buildSoilsReport(sampleInvestigation()).blockingIssues).toEqual([])
  })
})

describe('limitations are always present and always say the same things', () => {
  const s = section(buildSoilsReport(sampleInvestigation()), 22)

  it('is complete even for a bare investigation — it is about the method, not the data', () => {
    expect(section(buildSoilsReport(emptyInvestigation()), 22).status).toBe('complete')
  })

  it('states that conditions between explorations are inferred', () => {
    expect(s.paragraphs.join(' ')).toMatch(/INFERRED/)
  })

  it('states the report is for the named project only', () => {
    expect(s.paragraphs.join(' ')).toMatch(/should not be relied upon for any other purpose/)
  })
})

describe('metadata and headers', () => {
  it('carries the investigation identity onto the report', () => {
    const inv = sampleInvestigation()
    const r = buildSoilsReport(inv, { preparedBy: 'A. Engineer', reportDate: '2026-07-31' })
    expect(r.investigationNo).toBe(inv.meta.investigationNo)
    expect(r.projectName).toBe(inv.meta.site.projectName)
    expect(r.preparedBy).toBe('A. Engineer')
    expect(r.reportDate).toBe('2026-07-31')
  })

  it('flags a missing project reference rather than printing a blank', () => {
    const inv: Investigation = emptyInvestigation()
    inv.meta.investigationNo = ''
    const s = section(buildSoilsReport(inv), 1)
    expect(s.status).toBe('partial')
    expect(s.gap).toMatch(/investigation reference/)
    expect(s.paragraphs.join(' ')).toMatch(/\(unassigned\)/)
  })
})

describe('the section is presented as an interpretation', () => {
  it('follows the logs rather than leading, and says what is measured', () => {
    // A reader should meet the measured holes before the drawing that guesses
    // between them.
    const s = section(buildSoilsReport(sampleInvestigation()), 5)
    expect(s.figures.at(-1)!.caption).toMatch(/Correlated section/)
    expect(s.paragraphs.join(' ')).toMatch(/is an INTERPRETATION/)
    expect(s.paragraphs.join(' ')).toMatch(/dashed to say so/)
  })

  it('omits it entirely when there is only one hole', () => {
    const inv = sampleInvestigation()
    inv.boreholes = inv.boreholes.slice(0, 1)
    const s = section(buildSoilsReport(inv), 5)
    expect(s.figures.every((f) => !/Correlated section/.test(f.caption))).toBe(true)
    expect(s.paragraphs.join(' ')).not.toMatch(/is an INTERPRETATION/)
  })
})

describe('figures come from the shared drawing engines', () => {
  it('includes a borehole log per logged hole and an FS profile per hole with SPT', () => {
    const r = buildSoilsReport(sampleInvestigation(), { seismic: SEISMIC })
    const logs = section(r, 5).figures
    const fs = section(r, 12).figures
    // Two borehole logs plus the correlated section between them.
    expect(logs.length).toBe(3)
    expect(logs.at(-1)!.caption).toMatch(/dashed where it is inferred/)
    expect(fs.length).toBeGreaterThan(0)
    for (const f of [...logs, ...fs]) {
      expect(f.drawing.primitives.length).toBeGreaterThan(0)
      expect(f.caption.length).toBeGreaterThan(3)
    }
  })
})
