import { describe, it, expect } from 'vitest'
import { generateGridModel } from '../engine/modelBuilder'
import { designStructure } from '../engine/pipeline'
import { buildStructureCages } from '../engine/cageBuilder'
import { buildSheetSet, planSheets, detailSheets, groupSheets, generalNotesSheet, floorName, type PlanSheet } from './planSheets'
import { planToSvg } from '../engine/planRenderer'
import { paintDrawing, paintedSize } from './drawingPdf'
import { M, CONTENT_W, PAGE_W, PAGE_H } from './pdfKit'
import type { jsPDF } from 'jspdf'
import type { RectSection, ModelLoad } from '../engine/model'

const section: RectSection = { id: 'S1', name: '400×400', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }

/** A two-bay frame with a slab opening and a shear wall, so every group of the
 *  sheet set is actually populated — a set that is empty proves nothing. */
function full() {
  const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3, 3], section, slabThickness: 150 })
  m.loads = m.plates.flatMap((p): ModelLoad[] => [
    { kind: 'area', plate: p.id, q: 4.0, cat: 'D' },
    { kind: 'area', plate: p.id, q: 2.4, cat: 'L' },
  ])
  m.plates[0].openings = [{ id: 'O1', kind: 'rect', x: 2.0, y: 1.8, w: 1.0, h: 0.8 }]
  m.walls = [{ id: 'w0', member: m.members.find((x) => x.role === 'beam')!.id, height: 3, thickness: 200, shearWall: true }]
  return { model: m, design: designStructure(m, soil)! }
}

describe('floorName', () => {
  it('names the framed levels in order and falls back past the table', () => {
    expect(floorName(1)).toBe('Ground Floor')
    expect(floorName(3)).toBe('Third Floor')
    expect(floorName(20)).toBe('20th Floor')
  })
})

describe('the sheet set', () => {
  const { model, design } = full()
  const sheets = buildSheetSet(model, design, soil)

  it('covers every group once the model has one of each thing', () => {
    const groups = new Set(sheets.map((s) => s.group))
    for (const g of ['Plans', 'Frame elevations', 'Column details', 'Footing details', 'Slab opening details', 'Wall standard details', 'Beam–column joint details']) {
      expect(groups.has(g as PlanSheet['group']), `missing ${g}`).toBe(true)
    }
  })

  it('gives every sheet a unique key, a title and a finite drawing', () => {
    expect(sheets.length).toBeGreaterThan(6)
    const keys = sheets.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const s of sheets) {
      expect(s.key).toMatch(/^[a-z0-9-]+$/)      // it is also the download filename
      expect(s.title.length).toBeGreaterThan(0)
      expect(s.drawing.primitives.length).toBeGreaterThan(0)
      for (const v of Object.values(s.drawing.bounds)) expect(Number.isFinite(v)).toBe(true)
      expect(s.drawing.bounds.maxX).toBeGreaterThan(s.drawing.bounds.minX)
      expect(s.drawing.bounds.maxY).toBeGreaterThan(s.drawing.bounds.minY)
    }
  })

  it('carries one framing plan per framed level, plus the foundation', () => {
    const plans = sheets.filter((s) => s.group === 'Plans')
    // two storeys → two framing plans, and one foundation plan
    expect(plans.filter((s) => s.key.startsWith('framing-'))).toHaveLength(2)
    expect(plans.filter((s) => s.key === 'foundation-plan')).toHaveLength(1)
  })

  it('carries one beam–column joint sheet per joint, after the members that meet in it', () => {
    const joints = sheets.filter((s) => s.group === 'Beam–column joint details')
    // one per framed node, each named for the joint it draws rather than for a
    // "typical" type several joints were folded into
    expect(joints).toHaveLength(model.nodes.filter((n) => n.y > 0).length)
    for (const j of joints) expect(j.title).toMatch(/^BEAM–COLUMN JOINT — J-[A-Z]\d+@[\d.]+ · [A-Z]+ FLOOR$/)
    expect(new Set(joints.map((s) => s.key)).size).toBe(joints.length)
    // the joint sheet follows the beam and column details it depends on
    const iJoint = sheets.findIndex((s) => s.group === 'Beam–column joint details')
    expect(iJoint).toBeGreaterThan(sheets.findIndex((s) => s.group === 'Frame elevations'))
    expect(iJoint).toBeGreaterThan(sheets.findIndex((s) => s.group === 'Column details'))
  })

  it('carries three sheets per wall type — corner, intersection, joint', () => {
    const walls = sheets.filter((s) => s.group === 'Wall standard details')
    expect(walls).toHaveLength(3)
    expect(walls.map((s) => s.title.replace(/ — .*/, ''))).toEqual([
      'TYPICAL WALL CORNER', 'TYPICAL WALL INTERSECTION', 'TYPICAL WALL CONSTRUCTION JOINT',
    ])
  })

  it('passes each sheet\'s own warnings, and only its own', () => {
    // The wall sheets share one `designWallDetail` result, so a warning that
    // belongs to the construction joint must not appear on the corner sheet.
    const corner = sheets.find((s) => s.title.startsWith('TYPICAL WALL CORNER'))!
    expect(corner.warnings.join(' ')).not.toContain('ℓdh')
    for (const s of sheets) expect(Array.isArray(s.warnings)).toBe(true)
  })

  it('serialises every sheet to a non-trivial SVG', () => {
    // What the tab does with the set; a drawing that cannot be painted is not a
    // sheet, whatever its primitive count says.
    for (const s of sheets) {
      const svg = planToSvg(s.drawing, 900)
      expect(svg.startsWith('<svg')).toBe(true)
      expect(svg).toContain('</svg>')
      expect(svg.length).toBeGreaterThan(400)
    }
  })

  it('asks the CAGE for the 90° mat hook, and the cage answers by pad depth', () => {
    // The option used to be a drawing switch: the sheet drew a hook of
    // min(120, 0.07·B) — a length off the pad's WIDTH, which has nothing to do
    // with whether a bar can be turned up — and the cage never had that steel,
    // so the 3D view and the take-off knew nothing about it.
    //
    // It now reaches `buildFootingCage`, and this frame's 150 mm pads CANNOT
    // take a hook: 75 mm cover puts the bar near mid-depth, leaving 35 mm
    // against the 150 mm a ⌀10 hook needs (§425.3.1). So the honest answer for
    // this model is that nothing changes, and the cage says why.
    const straight = buildSheetSet(model, design, soil, { hookedMatBars: false })
    const hooked = buildSheetSet(model, design, soil, { hookedMatBars: true })
    const others = (set: PlanSheet[]) => set.filter((s) => s.group !== 'Footing details').map((s) => s.key)
    expect(others(hooked)).toEqual(others(straight))

    const { cages } = buildStructureCages(model, design, { hookedMatBars: true })
    const f = cages.find((c) => c.member.startsWith('F-'))!
    expect(f.notes?.some((n) => /left straight/.test(n))).toBe(true)
    expect(f.runs.filter((r) => r.role === 'mat').every((r) => r.path.length === 2)).toBe(true)
  })

  it('hooks the mat where the pad IS deep enough', () => {
    // Same footing, made deep enough for the turn-up — the bars gain the two
    // vertices a hook is, and the cage stops reporting a shortfall.
    const deep = {
      ...design,
      footings: design.footings.map((f) => ({ ...f, design: { ...f.design, Dc: 600 } })),
    }
    const { cages } = buildStructureCages(model, deep, { hookedMatBars: true })
    const f = cages.find((c) => c.member.startsWith('F-'))!
    expect(f.notes?.some((n) => /left straight/.test(n))).toBeFalsy()
    expect(f.runs.filter((r) => r.role === 'mat').every((r) => r.path.length === 4)).toBe(true)
    // and the sheet draws the longer bar, because it draws what the cage has
    const cmds = (h: boolean) => buildSheetSet(model, deep, soil, { hookedMatBars: h })
      .find((s) => s.group === 'Footing details')!.drawing.primitives
      .reduce((n, p) => n + (p.kind === 'path' ? p.cmds.length : 0), 0)
    expect(cmds(true)).toBeGreaterThan(cmds(false))
  })

  it('drops the design-only sheets when there is no design', () => {
    const only = buildSheetSet(model, null, soil)
    // The general notes need only the model — its covers, bar sizes and
    // materials — so they are on the set before anything is designed.
    expect(only.every((s) => s.group === 'Plans' || s.group === 'General notes')).toBe(true)
    expect(only[0].group).toBe('General notes')
    expect(only.length).toBeGreaterThan(0)
    expect(only.some((s) => s.key === 'foundation-plan')).toBe(false)
  })
})

describe('grouping', () => {
  it('preserves sheet order inside each group and group order overall', () => {
    const { model, design } = full()
    const sheets = buildSheetSet(model, design, soil)
    const groups = groupSheets(sheets)
    // The rules come first, then the plans, then the details.
    expect(groups.map((g) => g.group).slice(0, 2)).toEqual(['General notes', 'Plans'])
    expect(groups.flatMap((g) => g.sheets)).toEqual(sheets)
    for (const g of groups) expect(g.sheets.every((s) => s.group === g.group)).toBe(true)
  })

  it('splits plans from details the same way the two builders do', () => {
    const { model, design } = full()
    expect(buildSheetSet(model, design, soil)).toEqual([
      generalNotesSheet(model),
      ...planSheets(model, design, soil),
      ...detailSheets(model, design, soil),
    ])
  })
})

/** A jsPDF stand-in that records the calls the painter makes. */
function fakeDoc() {
  const calls: { fn: string; args: unknown[] }[] = []
  const rec = (fn: string) => (...args: unknown[]) => { calls.push({ fn, args }); return doc }
  const doc = {
    calls,
    line: rec('line'), rect: rec('rect'), circle: rec('circle'), text: rec('text'), lines: rec('lines'),
    setDrawColor: rec('setDrawColor'), setFillColor: rec('setFillColor'), setTextColor: rec('setTextColor'),
    setLineWidth: rec('setLineWidth'), setLineDashPattern: rec('setLineDashPattern'),
    setFont: rec('setFont'), setFontSize: rec('setFontSize'),
  }
  return doc as unknown as jsPDF & { calls: typeof calls }
}

describe('the sheet set reaches the PDF report', () => {
  const { model, design } = full()
  const sheets = buildSheetSet(model, design, soil)

  it('paints every sheet, as vectors, inside the A4 content column', () => {
    // The report takes the SAME `Drawing` objects the tab renders, so this is
    // the check that the set is printable — not a screenshot of the tab, which
    // would lose a 261 mm dimension the moment it was scaled to fit.
    for (const s of sheets) {
      const doc = fakeDoc()
      const box = { x: M, y: 20, w: CONTENT_W, maxH: 150 }
      const size = paintedSize(s.drawing, box)
      expect(size.width).toBeGreaterThan(0)
      expect(size.width).toBeLessThanOrEqual(CONTENT_W + 1e-9)
      expect(size.height).toBeLessThanOrEqual(150 + 1e-9)

      paintDrawing(doc, s.drawing, { ...box, x: (PAGE_W - size.width) / 2 })
      const drawn = doc.calls.filter((c) => ['line', 'rect', 'circle', 'text', 'lines'].includes(c.fn))
      expect(drawn.length, `${s.key} painted nothing`).toBeGreaterThan(0)

      // and no coordinate lands off the page, or as NaN
      for (const c of drawn) {
        for (const a of c.args) {
          if (typeof a !== 'number') continue
          expect(Number.isFinite(a), `${s.key}: ${c.fn} got ${a}`).toBe(true)
          expect(a).toBeGreaterThanOrEqual(-1)
          expect(a).toBeLessThanOrEqual(Math.max(PAGE_W, PAGE_H) + 1)
        }
      }
    }
  })
})
