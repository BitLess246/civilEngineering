import { describe, it, expect } from 'vitest'
import {
  buildGeneralNotes, measureRows, generalNoteSections, constructionChecks,
  seismicHookTail, seeGeneralNotes, GENERAL_NOTES_REF, type GeneralNotesInput,
} from './generalNotes'
import { calcDevLength } from './devLength'
import { hookBendDiameter } from './rebarModel'
import { hook90 } from './rebarModel'

const job: GeneralNotesInput = {
  fc: [28, 32], fy: [415], barDias: [12, 16, 20, 25, 28, 32], tieDias: [10, 12],
  cover: { beam: 40, column: 40, slab: 20, footing: 75 }, seismic: true,
}

const textOf = (d: { primitives: { kind: string }[] }) =>
  d.primitives.filter((p): p is { kind: 'text'; text: string } => p.kind === 'text').map((p) => p.text)

describe('the schedule of measures', () => {
  const rows = measureRows(job)

  it('has one row per bar size the job uses, smallest first', () => {
    expect(rows.map((r) => r.db)).toEqual([12, 16, 20, 25, 28, 32])
  })

  it('takes the WORST materials in the job, not the best', () => {
    // A schedule worked at the strongest concrete is a schedule someone will
    // apply to the weakest, and every lap on the job comes out short.
    const worst = calcDevLength({ db: 20, fc: 28, fy: 415, topBar: false, epoxy: 'none', lambda: 1, cbKtr_db: 2.5 })
    const best = calcDevLength({ db: 20, fc: 32, fy: 415, topBar: false, epoxy: 'none', lambda: 1, cbKtr_db: 2.5 })
    expect(best.ls_B).toBeLessThan(worst.ls_B)
    expect(rows.find((r) => r.db === 20)!.lapB).toBe(Math.round(worst.ls_B))
  })

  it('quotes the SAME bend and hook the detail sheets draw', () => {
    // The sheet is only worth having if a number on it cannot disagree with
    // the drawing it is read beside — so both come from one function.
    for (const r of rows) {
      expect(r.bendDia).toBe(hookBendDiameter(r.db))
      expect(r.ext).toBe(Math.round(hook90(r.db).ext))
      expect(r.hookDepth).toBe(Math.round(hook90(r.db).depth))
      expect(r.ext).toBe(12 * r.db)                        // Table 425.3.1
    }
  })

  it('grows with bar size, every measure of it', () => {
    for (let k = 1; k < rows.length; k++) {
      expect(rows[k].ld).toBeGreaterThan(rows[k - 1].ld)
      expect(rows[k].ldh).toBeGreaterThan(rows[k - 1].ldh)
      expect(rows[k].bendDia).toBeGreaterThanOrEqual(rows[k - 1].bendDia)
    }
  })

  it('makes a Class B lap longer than the bar it splices develops alone', () => {
    for (const r of rows) expect(r.lapB).toBeGreaterThanOrEqual(r.ld)   // 1.3·ℓd
  })

  it('reports nothing rather than guessing when the job has no materials', () => {
    expect(measureRows({ ...job, fc: [], fy: [] })).toEqual([])
    expect(measureRows({ ...job, barDias: [] })).toEqual([])
  })
})

describe('§425.3.2 seismic hook tail', () => {
  it('is max(6·dt, 75) — the floor governs the small bars', () => {
    expect(seismicHookTail(10)).toBe(75)      // 60 → floored
    expect(seismicHookTail(12)).toBe(75)      // 72 → floored
    expect(seismicHookTail(16)).toBe(96)
  })
})

describe('the notes themselves', () => {
  const secs = generalNoteSections(job)
  const all = secs.flatMap((s) => s.lines).join(' ')

  it('states the job’s own materials and covers, not a generic paragraph', () => {
    expect(all).toContain('28 / 32 MPa')
    expect(all).toContain('415 MPa')
    expect(all).toContain('75')               // cover against earth
  })

  it('carries the seismic section only where §418 applies', () => {
    expect(generalNoteSections(job).flatMap((s) => s.lines).join(' ')).toContain('SPECIAL MOMENT FRAME')
    expect(generalNoteSections({ ...job, seismic: false }).flatMap((s) => s.lines).join(' '))
      .not.toContain('SPECIAL MOMENT FRAME')
  })

  it('covers every trade the set details', () => {
    const heads = secs.map((s) => s.head)
    for (const h of ['MATERIALS', 'CLEAR COVER', 'BENDS AND HOOKS', 'DEVELOPMENT AND SPLICES',
      'BEAMS', 'COLUMNS', 'BEAM–COLUMN JOINTS', 'FOOTINGS AND SLABS']) {
      expect(heads).toContain(h)
    }
  })

  it('carries the rules the detail sheets stopped repeating', () => {
    // Each of these was printed under every drawing of its kind. If one is
    // dropped here it is dropped from the set entirely, which is the failure
    // mode of moving notes rather than deleting them.
    expect(all).toContain('GREATER OF THE TWO ADJACENT SPANS')
    expect(all).toContain('FAR FACE OF THE CONFINED CORE')
    expect(all).toContain('ONE BAR DIAMETER FURTHER IN')
    expect(all).toContain('ROOF JOINT')
    expect(all).toContain('CLASS B')
    expect(all).toContain('EQUAL IN NUMBER AND SIZE')
    expect(all).toContain('§424.3')
  })
})

describe('the construction checks', () => {
  const checks = constructionChecks()

  it('is ordered by pour, so a check can be found while standing at one', () => {
    expect(checks.map((c) => c.head)).toEqual([
      'BEFORE THE FOOTING POUR', 'BEFORE THE COLUMN POUR',
      'BEFORE THE BEAM AND SLAB POUR', 'AT EVERY POUR',
    ])
  })

  it('asks for things that can be looked at, at every stage', () => {
    for (const c of checks) expect(c.lines.length).toBeGreaterThan(1)
    const all = checks.flatMap((c) => c.lines).join(' ')
    expect(all).toContain('COVER')
    expect(all).toContain('LAP LENGTH AND LAP POSITION')
    expect(all).toContain('TOP STEEL IS TOP STEEL')
  })
})

describe('the sheet', () => {
  const d = buildGeneralNotes(job, { project: 'Sample Frame' })
  const texts = textOf(d)
  const flat = texts.join(' ')

  it('is titled, referenced S-01, and points every detail sheet at itself', () => {
    expect(d.title).toBe('GENERAL STRUCTURAL NOTES')
    expect(texts).toContain(GENERAL_NOTES_REF)
    expect(seeGeneralNotes()).toContain(GENERAL_NOTES_REF)
  })

  it('prints every measure row, so the table is not just a header', () => {
    for (const r of measureRows(job)) {
      expect(texts).toContain(`⌀${r.db}`)
      expect(texts).toContain(String(r.lapB))
      expect(texts).toContain(String(r.ldh))
    }
  })

  it('says what the table assumes — a number without its case is a trap', () => {
    expect(flat).toContain("f'c 28 MPa")            // the lowest in the job
    expect(flat).toContain('BOTTOM BARS')
    expect(flat).toContain('ψt = 1.3')              // what a top bar costs
  })

  it('fits its own content, with the title block last', () => {
    const ys = d.primitives.flatMap((p) => (p.kind === 'text' ? [p.y] : []))
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(d.bounds.minY)
    expect(Math.max(...ys)).toBeLessThanOrEqual(d.bounds.maxY)
    const title = d.primitives.filter((p) => p.kind === 'text' && p.text === 'GENERAL STRUCTURAL NOTES')
      .map((p) => p as Extract<typeof p, { kind: 'text' }>)
    expect(title).toHaveLength(2)                   // the heading, and the title block
    expect(title[1].y).toBeGreaterThan(title[0].y)
  })

  it('balances the two columns instead of running one off the bottom', () => {
    // Splitting the sections by COUNT put five long paragraphs beside eight
    // short lines and left half a sheet of white paper.
    const left = d.primitives.flatMap((p) => (p.kind === 'text' && p.x === 0 ? [p.y] : []))
    const right = d.primitives.flatMap((p) => (p.kind === 'text' && p.x > 60 && p.x < 80 ? [p.y] : []))
    expect(right.length).toBeGreaterThan(0)
    // the two note columns end within a quarter of the sheet of each other
    const endL = Math.max(...left.filter((y) => y < 200))
    const endR = Math.max(...right.filter((y) => y < 200))
    expect(Math.abs(endL - endR)).toBeLessThan(d.bounds.maxY * 0.25)
  })
})

describe('what the per-member elevations added to the rules', () => {
  const all = generalNoteSections(job).flatMap((x) => x.lines).join(' ')
  const checks = constructionChecks().flatMap((x) => x.lines).join(' ')

  it('states the level convention, which is a setting-out instruction', () => {
    // The node is the TOP of the beam, so a soffit is its own depth below the
    // stated level. Formwork set from the soffit is a whole beam depth out, and
    // nothing else on the sheet says so.
    expect(all).toMatch(/A FLOOR LEVEL IS THE TOP OF THE BEAMS AT IT/)
    expect(all).toMatch(/SET THE FORMWORK OFF THE LEVEL, NOT OFF THE SOFFIT/)
    expect(checks).toMatch(/SOFFIT LEVEL SET FROM THE FLOOR LEVEL LESS THE BEAM DEPTH/)
  })

  it('sends the reader to the frame elevations, and says there is no typical beam', () => {
    expect(all).toMatch(/FRAME ELEVATION: ONE SHEET PER GRID LINE PER FLOOR/)
    expect(all).toMatch(/THERE IS NO "TYPICAL BEAM" SHEET/)
  })

  it('says how to read a stirrup schedule — spaces, in order, from the left face', () => {
    expect(all).toMatch(/MEANS SPACES, NOT BARS, LAID OUT FROM THE LEFT SUPPORT FACE/)
    expect(all).toMatch(/EXACT NUMBER OF STIRRUPS IN THAT BEAM/)
    expect(checks).toMatch(/HOOP COUNT AGAINST THE TOTAL ON THE ELEVATION/)
  })

  it('names both splice zones, and which face each belongs to', () => {
    expect(all).toMatch(/TOP STEEL IS LAPPED IN THE MIDDLE HALF OF THE SPAN/)
    expect(all).toMatch(/BEAM BOTTOM STEEL IN AN END QUARTER/)
    expect(all).toMatch(/COLUMN VERTICALS ARE LAPPED WITHIN THE CENTRE HALF OF THE STOREY/)
    expect(checks).toMatch(/NEVER THE OTHER WAY ROUND/)
  })

  it('makes the closed-up hoops at a lap a hold point, not a saving', () => {
    expect(all).toMatch(/CLOSED UP TO 100 C\/C THROUGH THE LENGTH OF EVERY LAP SPLICE/)
    expect(all).toMatch(/NOT EXTRA STEEL TO BE SAVED/)
    expect(checks).toMatch(/CLOSED-UP 100 C\/C BAND PRESENT AT EVERY LAP/)
  })

  it('forbids trimming a column projection to suit the formwork', () => {
    expect(all).toMatch(/MAY NOT BE CUT BACK TO SUIT FORMWORK/)
    expect(checks).toMatch(/PROJECTION ABOVE THE FLOOR MEASURED AND RECORDED/)
  })

  it('tells the bender to cut to the figure, not to the nearest half metre', () => {
    expect(all).toMatch(/CUT TO THE FIGURE SHOWN/)
  })

  it('actually prints the new rules on the sheet, not just in the data', () => {
    // The notes are numbered and wrapped into two balanced columns, so a line
    // added to `generalNoteSections` without checking is a line that can be
    // silently dropped or pushed off the sheet.
    const flat = textOf(buildGeneralNotes(job)).join(' ').replace(/\s+/g, ' ')
    for (const phrase of [
      'A FLOOR LEVEL IS THE TOP OF THE BEAMS AT IT',
      'THERE IS NO "TYPICAL BEAM" SHEET',
      'MEANS SPACES, NOT BARS',
      'MAY NOT BE CUT BACK TO SUIT FORMWORK',
      'CUT TO THE FIGURE SHOWN',
    ]) {
      expect(flat, phrase).toContain(phrase.split(' ').slice(0, 4).join(' '))
    }
  })
})
