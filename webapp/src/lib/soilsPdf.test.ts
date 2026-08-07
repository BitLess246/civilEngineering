import { describe, it, expect, afterEach } from 'vitest'
import { buildSoilsReportPdf, renderSoilsReport } from './soilsPdf'
import { createSheet } from './pdfKit'
import { buildSoilsReport } from '../engine/soils/report'
import { sampleInvestigation } from '../engine/soils/sample'
import { emptyInvestigation } from '../engine/soils/model'

const SEISMIC = { amax: 0.4, magnitude: 7.5 }

// The document embeds TTF subsets, so the page content stream holds glyph
// codes rather than readable strings — extracting text from the finished file
// would need a full PDF parser. Recording what the renderer ASKS jsPDF to draw
// verifies the same thing (that the string reached the page) without adding a
// dependency, and it captures autoTable's cell text too, since that also goes
// through doc.text.
let drawn: string[] = []

function build(r: Parameters<typeof buildSoilsReportPdf>[0]) {
  drawn = []
  const sheet = createSheet()
  const original = sheet.doc.text.bind(sheet.doc)
  sheet.doc.text = ((txt: string | string[], ...rest: unknown[]) => {
    for (const t of Array.isArray(txt) ? txt : [txt]) drawn.push(String(t))
    return (original as (...a: unknown[]) => unknown)(txt, ...rest)
  }) as typeof sheet.doc.text
  return renderSoilsReport(sheet, r)
}

const all = () => drawn.join('\n')
const has = (s: string) => all().includes(s)

afterEach(() => { drawn = [] })

describe('the report renders', () => {
  const full = buildSoilsReport(sampleInvestigation(), { seismic: SEISMIC, preparedBy: 'A. Engineer' })

  it('produces a multi-page document', () => {
    const doc = build(full)
    expect(doc.getNumberOfPages()).toBeGreaterThan(2)
  })

  it('survives an EMPTY investigation, which is when a generator usually breaks', () => {
    const bare = buildSoilsReport(emptyInvestigation('Nothing logged'))
    const doc = build(bare)
    expect(doc.getNumberOfPages()).toBeGreaterThan(0)
  })

  it('emits every one of the 22 section headings', () => {
    // A section dropped at render time defeats the whole point of the model
    // keeping it, so this asserts against the RENDERED document, not the model.
    build(full)
    for (const sec of full.sections) {
      const head = sec.title.toUpperCase()
      expect(has(head.slice(0, 18)), `missing section ${sec.no}: ${head}`).toBe(true)
    }
  })

  it('renders the not-assessed sections of an empty investigation too', () => {
    const bare = buildSoilsReport(emptyInvestigation('Nothing logged'))
    build(bare)
    expect(has('NOT ASSESSED')).toBe(true)
    for (const sec of bare.sections) {
      expect(has(sec.title.toUpperCase().slice(0, 18)), `missing ${sec.no}`).toBe(true)
    }
  })

  it('puts the completeness page BEFORE the sections', () => {
    // Gaps buried behind the conclusions would be technically honest and
    // practically useless.
    build(full)
    const text = all()
    const gapsAt = text.indexOf('WHAT THIS REPORT DOES AND DOES NOT ESTABLISH')
    const firstSectionAt = text.indexOf('INTRODUCTION AND SCOPE')
    expect(gapsAt).toBeGreaterThan(-1)
    expect(gapsAt).toBeLessThan(firstSectionAt)
  })

  it('states the completeness fraction on the header', () => {
    build(full)
    expect(has('% of sections supported by the data')).toBe(true)
  })

  it('carries the project identity and the preparer', () => {
    build(full)
    expect(has(full.investigationNo)).toBe(true)
    expect(has('A. Engineer')).toBe(true)
  })
})

describe('integrity errors are printed first, not filed as a gap', () => {
  it('prints a blocking-error block when the log is impossible', () => {
    const inv = sampleInvestigation()
    inv.boreholes[0].layers[0].depthBottom = 99      // overlapping strata
    const r = buildSoilsReport(inv)
    expect(r.blockingIssues.length).toBeGreaterThan(0)
    build(r)
    expect(has('RESOLVE BEFORE ISSUE')).toBe(true)
  })

  it('omits that block entirely when the data validates', () => {
    build(buildSoilsReport(sampleInvestigation()))
    expect(has('RESOLVE BEFORE ISSUE')).toBe(false)
  })
})

describe('the document is self-consistent with its model', () => {
  it('prints a gap row for every gap the model reported', () => {
    const bare = buildSoilsReport(emptyInvestigation())
    build(bare)
    const text = all()
    // The gap table lists section numbers; every one should appear.
    for (const g of bare.gaps) {
      expect(text.includes(g.title.slice(0, 16)), `gap ${g.section} not printed`).toBe(true)
    }
  })

  it('says so plainly when there are no gaps at all', () => {
    const r = buildSoilsReport(sampleInvestigation())
    // Force the no-gap branch — the sample always has some.
    build({ ...r, gaps: [], completeness: 1 })
    expect(has('Every section is supported')).toBe(true)
  })
})

describe('the header does not claim a design verdict', () => {
  it('prints DATA CONSISTENT rather than "DESIGN OK"', () => {
    // A geotechnical report checks no structure. "DESIGN OK" stamped on a
    // document that is 23% supported by its own data would be actively
    // misleading, which is why pdfKit grew a verdictLabel.
    build(buildSoilsReport(sampleInvestigation(), { seismic: SEISMIC }))
    expect(has('DATA CONSISTENT')).toBe(true)
    expect(has('DESIGN OK')).toBe(false)
  })

  it('says DATA ERRORS when the log is impossible', () => {
    const inv = sampleInvestigation()
    inv.boreholes[0].layers[0].depthBottom = 99
    build(buildSoilsReport(inv))
    expect(has('DATA ERRORS')).toBe(true)
  })

  it('prints front matter UNNUMBERED, not as "section 0"', () => {
    build(buildSoilsReport(sampleInvestigation()))
    expect(has('WHAT THIS REPORT DOES AND DOES NOT ESTABLISH')).toBe(true)
    expect(has('0 · WHAT THIS REPORT')).toBe(false)
  })
})

// ── Laboratory plots reach the page ───────────────────────────────────────

describe('the laboratory plots are painted into the document', () => {
  /** One hole, one sample, three tests — with their data or without it. */
  const withLabData = (data = true) => {
    const inv = sampleInvestigation()
    const COMPACTION = {
      mouldVolume: 944, mouldMass: 4250, specificGravity: 2.68,
      points: [10, 12.5, 15, 17.5, 20].map((w) => {
        const rho = -0.006 * w * w + 0.18 * w + 0.43
        return { moisture: w, mouldSoilMass: 4250 + rho * (1 + w / 100) * 944 }
      }),
    }
    inv.boreholes = [{
      ...inv.boreholes[0],
      samples: [{
        ...inv.boreholes[0].samples[0],
        tests: [
          {
            id: 'b', type: 'sieve', standard: 'd6913', status: 'complete',
            data: !data ? undefined : {
              totalMass: 500,
              readings: [
                { size: 4.75, massRetained: 50 },
                { size: 0.425, massRetained: 200 },
                { size: 0.075, massRetained: 150 },
              ],
            },
          },
          { id: 'c', type: 'compaction', standard: 'd698', status: 'complete', data: data ? COMPACTION : undefined },
          { id: 'd', type: 'ucs', standard: 'd2166', status: 'planned' },
        ],
      }],
    }] as typeof inv.boreholes
    return inv
  }

  it('prints a caption for every laboratory figure', () => {
    build(buildSoilsReport(withLabData(), { seismic: SEISMIC }))
    // The caption is drawn text, so it is visible to the recorder even though
    // the curve itself is vector geometry.
    expect(drawn.some((t) => /Sieve analysis —/.test(t))).toBe(true)
    expect(drawn.some((t) => /Compaction \(Proctor\) —/.test(t))).toBe(true)
  })

  it('does not print a row or a caption for the test that produced nothing', () => {
    build(buildSoilsReport(withLabData(), { seismic: SEISMIC }))
    expect(drawn.some((t) => /Unconfined compression —/.test(t))).toBe(false)
    // and the omission is stated instead
    expect(drawn.some((t) => /booked tests? produced no result/.test(t))).toBe(true)
  })

  it('grows the document — vector plots take space rather than being skipped', () => {
    // The SAME investigation either way: only the presence of the data, and
    // therefore of the two plots, differs.
    const noData = build(buildSoilsReport(withLabData(false), { seismic: SEISMIC })).getNumberOfPages()
    const withPlots = build(buildSoilsReport(withLabData(true), { seismic: SEISMIC })).getNumberOfPages()
    expect(withPlots).toBeGreaterThan(noData)
  })
})
