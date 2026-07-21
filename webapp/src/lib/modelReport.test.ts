import { describe, it, expect } from 'vitest'
import { generateGridModel } from '../engine/modelBuilder'
import { designStructure, designOK } from '../engine/pipeline'
import type { RectSection } from '../engine/model'
import { buildModelReport } from './modelReport'
import { texToPlain } from './texText'

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
      expect(it.section?.kind).toBe('beam')
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
