import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads } from '../engine/modelBuilder'
import { designStructure } from '../engine/pipeline'
import { shapeByName } from '../engine/aiscSections'
import { buildSheetSet } from './planSheets'
import { steelScheduleDrawings, timberScheduleDrawings } from './frameSchedules'
import { pedestalMarks } from './planDetails'
import type { RectSection, StructuralModel } from '../engine/model'
import type { PlanPrimitive } from '../engine/planRenderer'

const base = { fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const steel: RectSection = { id: 'S', name: 'W310x79', b: 254, h: 306, ...base, material: 'steel', shape: 'W310x79', steelFy: 345, steelFu: 448 }
const wood: RectSection = { id: 'S', name: '300×400', b: 300, h: 400, ...base, material: 'wood', woodSpecies: 'DFL-2', woodKind: 'sawn' }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }
const DECK = { joistSpecies: 'DFL-2', joistKind: 'sawn' as const, joistB: 50, joistD: 200, joistSpacing: 400, joistSupport: 'simple' as const, deckMaterial: 'plank' as const, deckThickness: 25, deckSupport: 'continuous' as const }

function frame(sec: RectSection, decks = false): StructuralModel {
  const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.5, 3], section: sec, slabThickness: 150 })
  if (decks) m.plates = m.plates.map((p) => ({ ...p, deck: { ...DECK } }))
  m.loads = buildGravityLoads(m, 1.0, 1.9)
  return m
}
const texts = (ps: PlanPrimitive[]) => ps.flatMap((p) => (p.kind === 'text' ? [p.text] : []))

describe('steel schedule sheets', () => {
  const m = frame(steel)
  const d = designStructure(m, soil)!
  const sheets = steelScheduleDrawings(d)
  const t = texts(sheets[0].drawing.primitives)

  it('schedules every steel member, base plate and connection the design produced', () => {
    expect(sheets.map((s) => s.key)).toEqual(['steel-schedules', 'steel-connection-schedule'])
    expect(t).toContain('STEEL MEMBER SCHEDULE')
    expect(t).toContain('BASE-PLATE SCHEDULE')
    const c = texts(sheets[1].drawing.primitives)
    const conns = d.joints.flatMap((j) => j.connections).length + d.beamJoints.flatMap((j) => j.connections).length
    expect(c.filter((x) => x.startsWith('Moment') || x.startsWith('Shear tab') || x.startsWith('Fin plate'))).toHaveLength(conns)
  })

  it('totals the pieces and the mass from the catalogue area, as the BOQ does', () => {
    const members = [...d.steelBeams, ...d.steelColumns]
    const kg = members.reduce((s, x) => s + (shapeByName(x.shape)!.A / 1e6) * x.L * 7850, 0)
    const i = t.indexOf('TOTAL')
    expect(t[i + 1]).toBe(String(members.length))
    expect(t[i + 3]).toBe(kg.toFixed(0))   // TOTAL, pieces, length, mass
  })

  it('plates are the designed plates, at the adopted thickness', () => {
    const b = d.basePlates[0]
    expect(t).toContain(`${b.design.N.toFixed(0)}×${b.design.B.toFixed(0)}×${b.tAdopt}`)
  })

  it('schedules the pedestals by the PD marks the footing sheets carry', () => {
    expect(t).toContain('RC PEDESTAL SCHEDULE')
    const marks = pedestalMarks(d)
    for (const mk of new Set(marks.values())) expect(t).toContain(mk)
    const p = d.pedestals![0]!.design
    expect(t).toContain(`${p.bars}-⌀${p.barDia}`)
    expect(t).toContain(`⌀${p.tieDia} @ ${p.tieSpacing}`)
    // every node listed once, under its own mark
    const listed = t.slice(t.indexOf('RC PEDESTAL SCHEDULE')).filter((x) => /^n\d/.test(x)).flatMap((x) => x.split(', '))
    expect(listed.sort()).toEqual(d.pedestals!.map((q) => q.node).sort())
  })

  it('lands in the sheet set under its own group, and an RC frame gets none', () => {
    expect(buildSheetSet(m, d, soil).filter((s) => s.group === 'Steel schedules')).toHaveLength(2)
    const rc = frame({ ...steel, material: undefined, shape: undefined })
    expect(steelScheduleDrawings(designStructure(rc, soil)!)).toEqual([])
  })
})

describe('timber schedule sheets', () => {
  const m = frame(wood, true)
  const d = designStructure(m, soil)!
  const [sheet] = timberScheduleDrawings(m, d)
  const t = texts(sheet.drawing.primitives)

  it('schedules the members by size and species, and every deck by its joists', () => {
    expect(t).toContain('TIMBER MEMBER SCHEDULE')
    expect(t).toContain('300×400')
    expect(t).toContain('TIMBER DECK SCHEDULE')
    expect(t.filter((x) => /· 50×200 @ 400$/.test(x))).toHaveLength(d.woodSlabs.length)
  })

  it('a deck that fails reads CHECK, in the failure ink', () => {
    const failing = d.woodSlabs.filter((s) => !s.ok).length
    expect(t.filter((x) => x === 'CHECK').length).toBeGreaterThanOrEqual(failing)
  })

  it('designs a post base on every pedestal and schedules it', () => {
    expect(d.postBases!.length).toBe(d.pedestals!.length)
    for (const p of d.postBases!) {
      expect(p.design.checks.map((c) => c.clause)).toEqual(expect.arrayContaining(['NDS §3.10.1', 'NDS §12.3.1', 'AISC §J4.1', 'AISC DG1', 'ACI 318-14 Ch. 17']))
      expect(p.ok).toBe(true)
    }
    expect(t).toContain('POST-BASE SCHEDULE')
  })

  it('schedules the pedestals under the posts', () => {
    expect(t).toContain('RC PEDESTAL SCHEDULE')
    expect(t).toContain(`${d.pedestals![0]!.design.side}×${d.pedestals![0]!.design.side}`)
  })

  it('lands in the sheet set under its own group', () => {
    expect(buildSheetSet(m, d, soil).some((s) => s.group === 'Timber schedules')).toBe(true)
  })
})
