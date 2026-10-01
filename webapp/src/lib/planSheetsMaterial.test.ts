import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads } from '../engine/modelBuilder'
import { designStructure } from '../engine/pipeline'
import { buildSheetSet, frameMaterials, generalNotesSheet } from './planSheets'
import { buildPlan } from '../engine/planRenderer'
import { generalNoteSections, constructionChecks, measureRows, type GeneralNotesInput } from '../engine/generalNotes'
import type { RectSection, StructuralModel } from '../engine/model'

// A steel or timber frame used to get the RC set: "4-⌀20, TIES ⌀10" column
// sheets on a W310, rebar elevations, a W-shape scheduled as "310×306 mm",
// every slab "150 mm two-way" under a timber deck, and notes about hoops,
// laps and §418 for a building with none.

const base = { fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const rc: RectSection = { id: 'S', name: '400×400', b: 400, h: 400, ...base }
const steel: RectSection = { id: 'S', name: 'W310x79', b: 254, h: 306, ...base, material: 'steel', shape: 'W310x79', steelFy: 345, steelFu: 448 }
const wood: RectSection = { id: 'S', name: '300×400', b: 300, h: 400, ...base, material: 'wood', woodSpecies: 'DFL-2', woodKind: 'sawn' }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }
const DECK = { joistSpecies: 'DFL-2', joistKind: 'sawn' as const, joistB: 50, joistD: 200, joistSpacing: 400, joistSupport: 'simple' as const, deckMaterial: 'plank' as const, deckThickness: 25, deckSupport: 'continuous' as const }

function frame(sec: RectSection, decks = false): StructuralModel {
  const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3, 3], section: sec, slabThickness: 150 })
  if (decks) m.plates = m.plates.map((p) => ({ ...p, deck: { ...DECK } }))
  m.loads = buildGravityLoads(m, 1.0, 1.9)
  return m
}
const heads = (i: GeneralNotesInput) => generalNoteSections(i).map((x) => x.head)
const notesIn = (m: StructuralModel): GeneralNotesInput => ({
  fc: [28], fy: [415], barDias: [12], tieDias: [10], cover: { beam: 40, column: 40, slab: 20, footing: 75 }, seismic: true, frame: frameMaterials(m),
})

describe('the sheet set for a steel frame', () => {
  const m = frame(steel)
  const d = designStructure(m, soil)!
  const set = buildSheetSet(m, d, soil)
  const groups = new Set(set.map((s) => s.group))

  it('draws no rebar elevation or column cage sheet for a steel member', () => {
    expect(groups.has('Frame elevations')).toBe(false)
    expect(groups.has('Column details')).toBe(false)
  })

  it('draws each footing with its RC pedestal and the base plate on it, and the plan has nothing pending', () => {
    const sheets = set.filter((s) => s.group === 'Footing details')
    expect(sheets.length).toBeGreaterThan(0)
    for (const s of sheets) {
      expect(s.title).toMatch(/^WF-\d+ \/ PD-\d+ — /)
      const text = s.drawing.primitives.flatMap((p) => (p.kind === 'text' ? [p.text] : [])).join(' | ')
      expect(text).toMatch(/FOOTING & PEDESTAL DETAIL — WF-\d+ \/ PD-\d+/)
      expect(text).toMatch(/W310x79 STEEL COLUMN/)
      expect(text).toMatch(/BASE PL \d+×\d+×\d+ mm/)
      expect(text).toMatch(/4-⌀25 ANCHOR RODS/)
      expect(text).toMatch(/\d+-20mmØ VERT\. BARS/)       // the pedestal's bars, not a W-shape's
      expect(text).toMatch(/HEADED \(NUT \+ WASHER\)/)
      // the tie pitch reads, anchor-bolt sets included (§410.7.6.1.6: two in the top 125)
      expect(text).toMatch(/\d+@\d+(, \d+@\d+)* mm O\.C\./)
      expect(text).toMatch(/ANCHORS: ACI 318-14 CH\. 17 — \d+%/)   // checked now, and says what governs
      expect(text).not.toMatch(/NOT CHECKED/)
    }
    const fp = set.find((s) => s.key === 'foundation-plan')!
    expect(fp.warnings).toEqual([])
    expect(fp.subtitle).toBeUndefined()
  })

  it('schedules beams and columns by their shape, with the steel grade', () => {
    const plan = buildPlan(m, { kind: 'framing', level: 1 })!
    expect(plan.beamSchedule[0]).toEqual({ mark: 'FB1', size: 'W310x79', notes: 'Steel Fy=345 MPa' })
    const fnd = buildPlan(m, { kind: 'foundation', footings: [] })!
    expect(fnd.columnSchedule[0]).toMatchObject({ size: 'W310x79', notes: 'Steel Fy=345 MPa' })
  })

  it('writes steel notes and drops the RC member rules', () => {
    const h = heads(notesIn(m))
    expect(h).toContain('STRUCTURAL STEEL')
    for (const rcHead of ['BEAMS', 'COLUMNS — REINFORCEMENT', 'BEAM–COLUMN JOINTS', 'ANCHORAGE AT A BEAM END']) expect(h).not.toContain(rcHead)
    const all = generalNoteSections(notesIn(m)).flatMap((x) => x.lines).join(' ')
    expect(all).toMatch(/AISC 360-16/)
    expect(all).not.toMatch(/§418 APPLIES/)
    expect(all).toMatch(/Fy = 345 MPa, Fu = 448 MPa/)
    // a steel frame has no ties: no bend line with an empty list of them
    const noTies = generalNoteSections({ ...notesIn(m), tieDias: [] }).flatMap((x) => x.lines).join(' ')
    expect(noTies).not.toMatch(/§425\.3\.2: \./)
  })

  it('checks erection instead of an RC column pour', () => {
    const c = constructionChecks(frameMaterials(m)).map((x) => x.head)
    expect(c).toContain('BEFORE AND DURING STEEL ERECTION')
    expect(c).not.toContain('BEFORE THE COLUMN POUR')
    expect(c).not.toContain('BEFORE THE BEAM AND SLAB POUR')   // no RC beam cage to check…
    expect(c).toContain('BEFORE THE SLAB POUR')                // …but the slabs are still RC
  })

  it('quotes the footing bars in the schedule of measures, not the steel sections’ unused ⌀20', () => {
    const notes = generalNotesSheet(m, d)
    expect(notes.drawing).toBeTruthy()
    const dias = [...new Set(d.footings.map((f) => f.barDia))]
    const i = { ...notesIn(m), barDias: dias }
    expect(measureRows(i).map((r) => r.db)).toEqual([...dias].sort((a, b) => a - b))
    expect(dias).not.toContain(20)
  })
})

describe('the sheet set for a timber frame on timber decks', () => {
  const m = frame(wood, true)
  it('schedules the deck by its joists, one-way, not as a 150 mm slab', () => {
    const plan = buildPlan(m, { kind: 'framing', level: 1 })!
    expect(plan.slabSchedule).toEqual([{ mark: 'S1', thk: '25', type: 'Timber deck on 50×200 joists @ 400 (DFL-2)' }])
    expect(plan.beamSchedule[0]).toEqual({ mark: 'FB1', size: '300×400', notes: 'Timber DFL-2' })
  })

  it('writes timber notes naming the grade, and no slab or RC member rules', () => {
    const fm = frameMaterials(m)
    expect(fm).toMatchObject({ rc: false, rcSlabs: false, timber: { wet: false } })
    expect(fm.timber!.grades[0]).toMatch(/Douglas Fir-Larch/)
    const h = heads(notesIn(m))
    expect(h).toContain('TIMBER')
    expect(h).toContain('FOOTINGS')
    expect(h).not.toContain('FOOTINGS AND SLABS')
    expect(h).not.toContain('BEAMS')
    const c = constructionChecks(fm).map((x) => x.head)
    expect(c).toContain('BEFORE THE TIMBER IS CLOSED IN')
    expect(c).not.toContain('BEFORE THE BEAM AND SLAB POUR')
  })

  it('stands each post on its pedestal with a post base drawn as nominal, not as designed', () => {
    const d = designStructure(m, soil)!
    const sheets = buildSheetSet(m, d, soil).filter((s) => s.group === 'Footing details')
    expect(sheets.length).toBeGreaterThan(0)
    const text = sheets[0]!.drawing.primitives.flatMap((p) => (p.kind === 'text' ? [p.text] : [])).join(' | ')
    expect(text).toMatch(/300×400 TIMBER POST/)
    expect(text).toMatch(/2-⌀16 ANCHOR RODS/)
    expect(text).toMatch(/NOT DESIGNED/)
    expect(text).not.toMatch(/GROUT/)
  })
})

describe('an all-RC frame is untouched', () => {
  it('keeps every section, and the notes with no frame given are the RC notes', () => {
    const m = frame(rc)
    const i = notesIn(m)
    expect(frameMaterials(m)).toEqual({ rc: true, rcSlabs: true })
    expect(heads(i)).toEqual(heads({ ...i, frame: undefined }))
    expect(constructionChecks(i.frame).map((x) => x.head)).toEqual(constructionChecks().map((x) => x.head))
    expect(buildPlan(m, { kind: 'framing', level: 1 })!.beamSchedule[0]).toMatchObject({ size: '400×400' })
  })
})
