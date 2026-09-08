import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads } from '../engine/modelBuilder'
import { designStructure } from '../engine/pipeline'
import { buildStructureCages } from '../engine/cageBuilder'
import { elevationBundleByMember, columnStackByMember, beamSectionZones } from './planDetails'
import {
  beamSectionNotes, beamSectionDrawing, columnSectionNotes, columnSectionDrawing,
  beamElevationDrawing, columnElevationDrawing, columnStoreyOf, type SectionRowDesign,
} from './scheduleFigures'

// ─────────────────────────────────────────────────────────────────────────
// The figures a schedule row expands into are decided here and painted by
// two callers. These pin what they say, so a row's callout cannot describe
// steel the cut does not show.
// ─────────────────────────────────────────────────────────────────────────
const section = { id: 's1', name: 'C1', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const model = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.2, 3.2], section })
model.loads = buildGravityLoads(model, 4.8, 2.4)
const design = designStructure(model, { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 } as never)!
const { cages } = buildStructureCages(model, design)
const rect = { b: 300, h: 500, cover: 40, barDia: 20, tieDia: 10 }
const texts = (d: { primitives: { kind: string }[] }) =>
  d.primitives.filter((p) => p.kind === 'text').map((p) => (p as unknown as { text: string }).text)

describe('beamSectionNotes', () => {
  const base = { x: 3, label: 'Midspan', hogging: false,
    design: { bars: 3, sAdopt: 220, legs: 2, layers: [3], comprBars: 0, comprLayers: [] } }
  it('names the face, the stirrup set, and a flange by its shape', () => {
    expect(beamSectionNotes(base, rect)).toEqual(['3-⌀20 BOT', 'STIRRUPS 2L-⌀10 @ 220'])
    expect(beamSectionNotes({ ...base, hogging: true, design: { ...base.design, layers: [2, 1] } }, rect)[0])
      .toBe('3-⌀20 TOP (2+1)')
    expect(beamSectionNotes({ ...base, bf: 1200, edge: true }, rect).at(-1)).toBe('L-BEAM · bf 1200')
    expect(beamSectionNotes({ ...base, bf: 1200, flangeKind: 'T', design: { ...base.design, flangeAction: 'true-T' } }, rect).at(-1))
      .toBe('T-BEAM · bf 1200 · TRUE T')
  })
  it('says minimum stirrups where the design adopted none, and counts compression bars', () => {
    const n = beamSectionNotes({ ...base, design: { ...base.design, sAdopt: 0, comprBars: 2 } }, rect)
    expect(n).toContain('2-⌀20 COMPR.')
    expect(n).toContain('STIRRUPS ⌀10 @ MIN. (§409.6.3.1)')
  })
})

describe('columnSectionNotes', () => {
  it('prints the confinement pair for a seismic column and one spacing otherwise', () => {
    expect(columnSectionNotes({ id: 'c', bars: 8, tieSpacingFinal: 200 }, rect)).toEqual(['8-⌀20 VERT.', 'TIES ⌀10 @ 200'])
    expect(columnSectionNotes({ id: 'c', bars: 8, tieSpacingFinal: 200, seismicSConf: 100, seismicSOut: 150 }, rect)[1])
      .toBe('TIES ⌀10 @ 100 IN ℓo, @ 150 ELSEWHERE')
  })
})

describe('the drawings', () => {
  const bm = design.beams[0]
  const col = design.columns[0]

  it('cuts the beam at the row\'s own station and prints the row\'s callout under it', () => {
    for (const s of bm.sections) {
      const d = beamSectionDrawing(model, cages, bm, s, rect)!
      expect(d).not.toBeNull()
      expect(d.title).toBe(`SECTION — ${s.label}`)
      for (const n of beamSectionNotes(s, rect)) expect(texts(d)).toContain(n)
      expect(d.result.bars.length).toBeGreaterThan(0)     // the plane passed through steel
    }
  })

  it('cuts the column at mid-height with its ties in the plane', () => {
    const d = columnSectionDrawing(model, cages, col, rect)!
    expect(d.title).toBe('SECTION — MID-HEIGHT')
    expect(d.result.bars.length).toBe(Math.max(4, col.bars))
    expect(d.result.ties.length).toBeGreaterThan(0)
  })

  it('washes the beam\'s elevation over the stretch the row is about, labelled with the row', () => {
    const bundle = elevationBundleByMember(model, design, cages).get(bm.id)!
    const zones = beamSectionZones(model, bundle, bm.id, bm.sections.map((s) => s.x))!
    const d = beamElevationDrawing(bundle, zones[0], `${bm.id} · ${bm.sections[0].label}`)
    expect(d.title).toMatch(/^FRAME ELEVATION/)
    expect(texts(d)).toContain(`${bm.id} · ${bm.sections[0].label}`)
    // …and without a zone, no label
    expect(texts(beamElevationDrawing(bundle))).not.toContain(`${bm.id} · ${bm.sections[0].label}`)
  })

  it('washes the column\'s stack over its own storey', () => {
    const stacks = columnStackByMember(model, design, cages)
    const bundle = stacks.get(col.id)!
    const storey = columnStoreyOf(bundle, col.id)!
    expect(storey.yTop).toBeGreaterThan(storey.yBot)
    const d = columnElevationDrawing(bundle, storey, col.id)
    expect(d.title).toMatch(/^COLUMN DETAIL/)
    expect(texts(d)).toContain(col.id)
    expect(columnStoreyOf(undefined, col.id)).toBeUndefined()
  })
})

describe('which bars the check did not use', () => {
  // A cut is drawn from the cage, so it shows every bar that is there. On a
  // singly-reinforced check the far face earned nothing — it is the §409.7.3.8
  // continuous share and the stirrup hangers — and nothing said so.
  const rect = { b: 250, h: 300, cover: 40, barDia: 20, tieDia: 10 }
  const row = (over: Partial<SectionRowDesign>, hogging = false) => beamSectionNotes(
    { x: 0, label: 'S', hogging, design: { bars: 2, sAdopt: 200, legs: 2, layers: [2], comprBars: 0, comprLayers: [], ...over } },
    rect,
  )

  it('names the face the capacity came from, and calls the other one detailing', () => {
    expect(row({ mode: 'SRRB' }).join(' ')).toContain('φMn FROM THE BOTTOM STEEL ALONE')
    expect(row({ mode: 'SRRB' }, true).join(' ')).toContain('φMn FROM THE TOP STEEL ALONE')
    expect(row({ mode: 'SRRB' }).join(' ')).toContain('NOT COUNTED')
  })

  it('says instead whether the compression steel counted, when there is some', () => {
    expect(row({ mode: 'DRRB', comprBars: 3 }).join(' ')).toContain('COUNTED (DOUBLY REINFORCED)')
    expect(row({ mode: 'DRRB', comprBars: 3, comprEffective: false }).join(' '))
      .toContain('NOT COUNTED: f\'s')
    // and a doubly-reinforced section makes no claim about the other face
    expect(row({ mode: 'DRRB', comprBars: 3 }).join(' ')).not.toContain('ALONE')
  })

  it('says nothing at all when the caller did not supply a mode', () => {
    // Silence beats a claim the caller never made — every existing caller.
    const plain = row({}).join(' ')
    expect(plain).not.toContain('NOT COUNTED')
    expect(plain).not.toContain('ALONE')
  })
})
