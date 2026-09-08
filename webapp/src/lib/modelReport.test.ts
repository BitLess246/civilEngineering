import { describe, it, expect } from 'vitest'
import { generateGridModel } from '../engine/modelBuilder'
import { designStructure, designOK } from '../engine/pipeline'
import type { RectSection } from '../engine/model'
import { buildModelReport } from './modelReport'
import { buildStructureCages } from '../engine/cageBuilder'
import { texToPlain } from './texText'
import type { IrregularityFlag } from '../engine/irregularity'

// The PDF payload assembler must mirror the pipeline results 1:1: same member
// counts, same verdict, a worked solution for EVERY designed member (the
// user-selected report depth), and only PDF-renderable content (no raw LaTeX
// commands after conversion).
const section: RectSection = { id: 'S1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }

function makeModel() {
  const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section, slabThickness: 200 })
  m.loads = m.plates.flatMap((p) => [
    { kind: 'area' as const, plate: p.id, q: 4.8, cat: 'D' as const },
    { kind: 'area' as const, plate: p.id, q: 2.4, cat: 'L' as const },
  ])
  return m
}

describe('buildModelReport', () => {
  const model = makeModel()
  const design = designStructure(model, soil)!
  const props: [string, string][] = [['Column grid', '6 m × 5 m'], ['RC material', "f'c 28 · fy 415"]]
  const rpt = buildModelReport(model, design, props, soil)

  it('verdict matches designOK and the governing line is populated', () => {
    expect(rpt.ok).toBe(designOK(design))
    expect(rpt.governing.length).toBeGreaterThan(10)
    expect(rpt.props).toEqual(props)
  })

  it('summary checks cover each populated group and agree with row verdicts', () => {
    const names = rpt.checks.map((c) => c.name)
    expect(names).toContain('RC beams & girders')
    expect(names).toContain('RC columns')
    expect(names).toContain('Isolated footings')
    expect(names).toContain('Slabs (DDM)')
    const cols = rpt.checks.find((c) => c.name === 'RC columns')!
    expect(cols.ok).toBe(design.columns.every((c) => c.ok))
    expect(cols.ratio).toBeCloseTo(Math.max(...design.columns.map((c) => c.util)), 9)
  })

  it('schedule tables mirror the design rows (one line per section/member)', () => {
    const beamTable = rpt.tables.find((t) => t.title.startsWith('RC beam'))!
    expect(beamTable.rows).toHaveLength(design.beams.reduce((s, b) => s + b.sections.length, 0))
    expect(beamTable.head).toHaveLength(beamTable.rows[0].length)
    const colTable = rpt.tables.find((t) => t.title.startsWith('RC column'))!
    expect(colTable.rows).toHaveLength(design.columns.length)
    const ftgTable = rpt.tables.find((t) => t.title.startsWith('Isolated footing'))!
    expect(ftgTable.rows).toHaveLength(design.footings.length)
    for (const t of rpt.tables) for (const r of t.rows) expect(r).toHaveLength(t.head.length)
  })

  it('emits a worked solution for EVERY beam section, column and footing', () => {
    const items = (title: string) => rpt.groups.find((g) => g.title === title)?.items ?? []
    expect(items('RC beams & girders')).toHaveLength(design.beams.reduce((s, b) => s + b.sections.length, 0))
    expect(items('RC columns')).toHaveLength(design.columns.length)
    expect(items('Isolated footings')).toHaveLength(design.footings.length)
    for (const g of rpt.groups) for (const it of g.items) expect(it.steps.length).toBeGreaterThan(0)
  })

  it('beam & column items carry a demand summary and a plan location', () => {
    const beams = rpt.groups.find((g) => g.title === 'RC beams & girders')!.items
    for (const it of beams) {
      expect(it.details).toMatch(/^Mu .* kN·m · Vu .* kN$/)
      expect(it.loc).toMatch(/·/)                       // "<floor> · <grid>"
      expect(it.figures ?? []).toEqual([])              // no cages given → no figures
    }
    const cols = rpt.groups.find((g) => g.title === 'RC columns')!.items
    for (const it of cols) {
      expect(it.details).toMatch(/^Pu .* kN · Mu .* kN·m$/)
      expect(it.loc).toMatch(/^[A-Z]\d · /)             // "<grid> · <floor(s)>"
    }
  })

  it('every formula line converts to plain text without residual LaTeX', () => {
    for (const g of rpt.groups)
      for (const item of g.items)
        for (const st of item.steps)
          for (const ln of st.lines) {
            if ('tex' in ln) {
              const plain = texToPlain(ln.tex)
              expect(plain).not.toMatch(/\\[a-zA-Z]/)
              expect(plain).not.toContain('{')
            }
          }
  })
})

describe('buildModelReport — seismic irregularities', () => {
  const model = makeModel()
  const design = designStructure(model, soil)!

  it('omits the regularity check when no seismic run is supplied', () => {
    const rpt = buildModelReport(model, design, [], soil)
    expect(rpt.checks.some((c) => c.name.startsWith('Seismic regularity'))).toBe(false)
    expect(rpt.tables.some((t) => t.title.startsWith('Structural irregularities'))).toBe(false)
  })

  it('reports a passing regularity check for a regular structure (empty flags)', () => {
    const rpt = buildModelReport(model, design, [], soil, [])
    const chk = rpt.checks.find((c) => c.name.startsWith('Seismic regularity'))!
    expect(chk.ok).toBe(true)
    expect(rpt.tables.some((t) => t.title.startsWith('Structural irregularities'))).toBe(false)  // no rows ⇒ no table
  })

  it('folds flags into a not-ok check + an irregularities table without gating the overall verdict', () => {
    const flags: IrregularityFlag[] = [
      { code: 'P1b', name: 'Extreme torsional irregularity', table: 'Table 208-10', dir: 'x', elevation: 3, ratio: 1.6, limit: 1.4, verdict: 'extreme', detail: 'X: δmax/δavg = 1.6 > 1.4' },
      { code: 'V2', name: 'Weight (mass) irregularity', table: 'Table 208-9', elevation: 6, ratio: 1.7, limit: 1.5, verdict: 'irregular', detail: 'W/W(adjacent) = 1.7 > 1.5' },
    ]
    const rpt = buildModelReport(model, design, [], soil, flags)
    const chk = rpt.checks.find((c) => c.name.startsWith('Seismic regularity'))!
    expect(chk.ok).toBe(false)
    expect(chk.detail).toContain('P1b')
    expect(rpt.ok).toBe(designOK(design))            // advisory only — does not flip the verdict
    const t = rpt.tables.find((x) => x.title.startsWith('Structural irregularities'))!
    expect(t.rows).toHaveLength(2)
    for (const r of t.rows) expect(r).toHaveLength(t.head.length)
    expect(t.rows[0][0]).toBe('P1b')
  })
})

describe('buildModelReport — timber members', () => {
  const woodSection: RectSection = {
    id: 'W1', name: '100×300', b: 100, h: 300, material: 'wood', woodSpecies: 'DFL-2', woodKind: 'sawn',
    fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40,
  }
  const model = (() => {
    const m = generateGridModel({ baysX: [5], baysZ: [4], storeyH: [3], section: woodSection, slabThickness: 150 })
    m.loads = m.plates.flatMap((p) => [
      { kind: 'area' as const, plate: p.id, q: 2.0, cat: 'D' as const },
      { kind: 'area' as const, plate: p.id, q: 1.9, cat: 'L' as const },
    ])
    return m
  })()
  const design = designStructure(model, soil)!
  const rpt = buildModelReport(model, design, [], soil)

  it('the model actually produced timber members', () => {
    expect(design.woodBeams.length + design.woodColumns.length).toBeGreaterThan(0)
    expect(design.totals.woodVolume).toBeGreaterThan(0)
  })

  it('summary checks include the timber groups, matching row verdicts', () => {
    const names = rpt.checks.map((c) => c.name)
    if (design.woodBeams.length) {
      expect(names).toContain('Timber beams & girders (NDS §3)')
      expect(rpt.checks.find((c) => c.name === 'Timber beams & girders (NDS §3)')!.ok)
        .toBe(design.woodBeams.every((b) => b.ok))
    }
    if (design.woodColumns.length) expect(names).toContain('Timber columns (NDS §3.9)')
  })

  it('schedule tables and worked-solution groups cover every timber member', () => {
    if (design.woodBeams.length) {
      const t = rpt.tables.find((x) => x.title.startsWith('Timber beam'))!
      expect(t.rows).toHaveLength(design.woodBeams.length)
      for (const r of t.rows) expect(r).toHaveLength(t.head.length)
      expect(rpt.groups.find((g) => g.title === 'Timber beams & girders')!.items).toHaveLength(design.woodBeams.length)
    }
    if (design.woodColumns.length) {
      const t = rpt.tables.find((x) => x.title.startsWith('Timber column'))!
      expect(t.rows).toHaveLength(design.woodColumns.length)
      expect(rpt.groups.find((g) => g.title === 'Timber columns')!.items).toHaveLength(design.woodColumns.length)
    }
  })

  it('the timber volume appears in the report stats', () => {
    expect(rpt.stats.some((s) => s.label === 'Timber' && s.unit === 'm³')).toBe(true)
  })
})

describe('buildModelReport — timber deck (wood slab on a plate)', () => {
  const model = (() => {
    const m = makeModel()   // concrete frame + area D/L loads on the plate
    m.plates[0].deck = {
      joistSpecies: 'DFL-2', joistKind: 'sawn', joistB: 50, joistD: 200, joistSpacing: 400,
      joistSupport: 'simple', deckMaterial: 'plank', deckThickness: 25, deckSupport: 'continuous',
    }
    return m
  })()
  const design = designStructure(model, soil)!
  const rpt = buildModelReport(model, design, [], soil)

  it('the deck plate is designed as a wood slab, not an RC DDM slab', () => {
    expect(design.woodSlabs.length).toBe(1)
    expect(design.slabs.some((s) => s.plate === model.plates[0].id)).toBe(false)
    expect(design.totals.woodVolume).toBeGreaterThan(0)
  })

  it('the wood slab appears in checks, schedule table and worked-solution groups', () => {
    expect(rpt.checks.map((c) => c.name)).toContain('Timber deck slabs (NDS §3)')
    const t = rpt.tables.find((x) => x.title.startsWith('Timber deck slab'))!
    expect(t.rows).toHaveLength(1)
    for (const r of t.rows) expect(r).toHaveLength(t.head.length)
    const grp = rpt.groups.find((g) => g.title === 'Timber deck slabs')!
    expect(grp.items).toHaveLength(1)
    expect(grp.items[0].steps.length).toBeGreaterThan(0)
  })
})

describe('buildModelReport — flanged beam rows name the shape they are', () => {
  const model = generateGridModel({ baysX: [6, 6], baysZ: [5, 5], storeyH: [3], section, slabThickness: 200 })
  model.loads = model.plates.flatMap((p) => [
    { kind: 'area' as const, plate: p.id, q: 4.8, cat: 'D' as const },
    { kind: 'area' as const, plate: p.id, q: 2.4, cat: 'L' as const },
  ])
  const design = designStructure(model, soil, {}, { tBeamAction: true })!
  const rpt = buildModelReport(model, design, [], soil)

  it('the schedule marks an interior row T and a spandrel L (Table 406.3.2.1)', () => {
    const beams = rpt.tables.find((t) => /beam/i.test(t.title))!
    const flanged = beams.rows.filter((r) => r.some((c) => /bf=/.test(String(c))))
    expect(flanged.length).toBeGreaterThan(0)
    const cells = flanged.map((r) => r.find((c) => /bf=/.test(String(c)))!)
    expect(cells.some((c) => /(^|\s)T(\(true\))? bf=/.test(String(c)))).toBe(true)
    expect(cells.some((c) => /(^|\s)L(\(true\))? bf=/.test(String(c)))).toBe(true)
  })

  it('the section figure names the shape — an L is not captioned as a symmetric T', () => {
    // The cut is the cage's; what the design decided about the flange is the
    // callout under it, and it has to say L for a spandrel and T for an
    // interior beam — the same words the schedule row prints.
    const { cages } = buildStructureCages(model, design)
    const withFigs = buildModelReport(model, design, [], soil, undefined, undefined, cages)
    const notes = withFigs.groups.flatMap((g) => g.items)
      .flatMap((i) => (i.figures ?? []).filter((f) => f.kind === 'section'))
      .flatMap((f) => f.drawing.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text))
      .filter((t) => /-BEAM · bf/.test(t))
    expect(notes.length).toBeGreaterThan(0)
    expect(notes.some((t) => /^L-BEAM/.test(t))).toBe(true)
    expect(notes.some((t) => /^T-BEAM/.test(t))).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// THE FIGURES ARE THE SCHEDULE'S — the same drawings the accordion shows
// ─────────────────────────────────────────────────────────────────────────
describe('buildModelReport — worked-solution figures from the cages', () => {
  const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.2, 3.2], section, slabThickness: 150 })
  m.loads = m.plates.flatMap((p) => [
    { kind: 'area' as const, plate: p.id, q: 4.8, cat: 'D' as const },
    { kind: 'area' as const, plate: p.id, q: 2.4, cat: 'L' as const },
  ])
  const design = designStructure(m, soil)!
  const { cages } = buildStructureCages(m, design)
  const rpt = buildModelReport(m, design, [], soil, undefined, undefined, cages)
  const items = (title: string) => rpt.groups.find((g) => g.title === title)?.items ?? []
  const texts = (d: { primitives: { kind: string }[] }) =>
    d.primitives.filter((p) => p.kind === 'text').map((p) => (p as unknown as { text: string }).text)

  it('every beam section carries a cut at its station, and NOT the whole grid line', () => {
    // The frame elevation is a SHEET, and printing it again beside each of a
    // beam's three station rows — and again for every beam on the same line —
    // put the same drawing in the report a dozen times over, differing only in
    // which stretch is washed. It stays in the Plans tab, where it is one sheet
    // per grid line at a size it can be read at.
    for (const it of items('RC beams & girders')) {
      const figs = it.figures ?? []
      expect(figs.map((f) => f.kind)).toEqual(['section'])
      const cut = figs[0]!
      expect(texts(cut.drawing).some((t) => t.startsWith('FRAME ELEVATION'))).toBe(false)
      expect(texts(cut.drawing).some((t) => /^\d+-⌀\d+ (TOP|BOT)/.test(t))).toBe(true)
      expect(texts(cut.drawing).some((t) => /^STIRRUPS/.test(t))).toBe(true)
    }
  })

  it('a section at a beam\'s own END still shows its steel', () => {
    // `End i` and `End j` are cut on the member's node, which is where one
    // span's bars stop and the next span's start — the plane is the bar's
    // boundary, not its interior. The report printed a stirrup and no steel at
    // all under half the end rows.
    const ends = items('RC beams & girders').filter((i) => / · End [ij]$/.test(i.title))
    expect(ends.length).toBeGreaterThan(0)
    for (const it of ends) {
      const d = it.figures![0]!.drawing as { primitives: { kind: string }[] }
      expect(d.primitives.filter((p) => p.kind === 'circle').length).toBeGreaterThanOrEqual(4)
    }
  })

  it('every column carries its stack sheet with its storey washed, and the mid-height cut', () => {
    for (const it of items('RC columns')) {
      const kinds = (it.figures ?? []).map((f) => f.kind)
      expect(kinds).toEqual(['elevation', 'section'])
      const [elev, cut] = it.figures!
      expect(texts(elev.drawing).some((t) => t.startsWith('COLUMN DETAIL'))).toBe(true)
      expect(texts(elev.drawing)).toContain(it.title)
      expect(texts(cut.drawing).some((t) => /VERT\.$/.test(t))).toBe(true)
      expect(texts(cut.drawing).some((t) => /^TIES/.test(t))).toBe(true)
    }
  })

  it('the cut at a support shows the TOP steel the hogging check sized — the drawing follows the station', () => {
    const bm = design.beams[0]
    const its = items('RC beams & girders').filter((i) => i.title.startsWith(`${bm.id} ·`))
    const hog = its.find((i) => bm.sections.find((s) => `${bm.id} · ${s.label}` === i.title)?.hogging)
    const sag = its.find((i) => !bm.sections.find((s) => `${bm.id} · ${s.label}` === i.title)?.hogging)
    expect(hog && sag).toBeTruthy()
    expect(texts(hog!.figures![0].drawing).some((t) => / TOP/.test(t))).toBe(true)
    expect(texts(sag!.figures![0].drawing).some((t) => / BOT/.test(t))).toBe(true)
  })

  it('the schedule and the section callout name the SAME two stirrup regions', () => {
    // One page said @70 and the next said @140 about the same beam. Both are
    // real — the hinge zone and the rest of the span — and neither page said so.
    const rows = rpt.tables.find((t) => t.title.startsWith('RC beam'))!.rows
    const cells = rows.map((r) => r.join(' | ')).join('\n')
    const twoRegion = cells.match(/@\d+ in 2h, @\d+ elsewhere/g) ?? []
    const seen = new Set<string>()
    for (const it of items('RC beams & girders')) {
      const cut = it.figures?.[0]
      if (!cut) continue
      const note = texts(cut.drawing).find((t) => t.startsWith('STIRRUPS'))
      if (note) seen.add(note)
    }
    // where the schedule reports two regions, so does the callout
    if (twoRegion.length) {
      expect([...seen].some((n) => /WITHIN 2h OF EACH SUPPORT/.test(n))).toBe(true)
    }
    // and neither ever reports a bare hinge pitch with no span pitch beside it
    for (const n of seen) {
      if (/WITHIN 2h/.test(n)) expect(n).toMatch(/ELSEWHERE/)
    }
  })

  it('puts the whole design on one page, keyed by the member that governs it', () => {
    // The report named the governing member of every element type a sentence
    // at a time, inside the check list, mixed with counts. Built from the same
    // checks, so the summary cannot disagree with the list it summarises.
    const g = rpt.governingTable!
    expect(g).toBeDefined()
    expect(g.head).toEqual(['Element', 'Governing member', 'Location', 'Basis', 'D/C', 'Status'])
    const withRatio = rpt.checks.filter((c) => c.ratio != null || c.member)
    expect(g.rows).toHaveLength(withRatio.length)
    for (const c of withRatio) {
      const row = g.rows.find((r) => r[0] === c.name)!
      expect(row[4]).toBe(c.ratio != null ? c.ratio.toFixed(2) : '—')
      expect(row[5]).toBe(c.ok ? 'PASS' : 'FAIL')
    }
    // the governing member is named, and it is a member of the model
    const cols = g.rows.find((r) => r[0] === 'RC columns')!
    expect(m.members.some((x) => x.id === cols[1])).toBe(true)
    expect(cols[2]).not.toBe('—')                     // …and where it stands
  })

  it('footings, which have no cage figure yet, carry none rather than a stale one', () => {
    for (const it of items('Isolated footings')) expect(it.figures ?? []).toEqual([])
  })
})

describe('traceability — the twelve governing members', () => {
  const model = makeModel()
  const design = designStructure(model, soil)!
  const rpt = buildModelReport(model, design, [['Column grid', '6 m × 5 m']], soil)

  it('walks each governing member from its governing case to the bars the schedule carries', () => {
    expect(rpt.trace).toBeTruthy()
    const t = rpt.trace!
    expect(t.head).toEqual(['Member', 'Location', 'Governing case', 'Demand (analysis)', 'Required (design)', 'Provided (schedule)', 'Util', 'Check'])
    expect(t.rows.length).toBeGreaterThan(0)
    expect(t.rows.length).toBeLessThanOrEqual(12)
    expect(t.rows.some((r) => r[0].startsWith('Beam '))).toBe(true)
    expect(t.rows.some((r) => r[0].startsWith('Column '))).toBe(true)
    for (const row of t.rows) {
      expect(row[3]).toMatch(/Mu |Pu /)          // demand, as the analysis found it
      expect(row[4]).toMatch(/As |φPn /)         // required steel, as the design computed it
      expect(row[5]).toMatch(/⌀/)                // provided bars, as the schedule carries them
      expect(row[6]).toMatch(/^\d[\d.]*$|^—$/)   // utilisation: a bare number, or — when the design has no ratio
      expect(['PASS', 'FAIL']).toContain(row[7]) // verdict from the design's own check
    }
  })

  it('the columns it lists are the design\'s most-stressed ones', () => {
    const worst = [...design.columns].sort((a, z) => z.util - a.util)[0]
    expect(rpt.trace!.rows.map((r) => r[0])).toContain(`Column ${worst.id}`)
  })
})
