import { describe, it, expect } from 'vitest'
import { generateGridModel } from '../engine/modelBuilder'
import { designStructure } from '../engine/pipeline'
import { buildSheetSet, planSheets, detailSheets, groupSheets, floorName, type PlanSheet } from './planSheets'
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
    for (const g of ['Plans', 'Beam details', 'Column details', 'Footing details', 'Slab opening details', 'Wall standard details', 'Beam–column joint details']) {
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

  it('carries a beam–column joint sheet, after the members that meet in it', () => {
    const joints = sheets.filter((s) => s.group === 'Beam–column joint details')
    expect(joints.length).toBeGreaterThan(0)
    for (const j of joints) expect(j.title).toContain('BEAM–COLUMN JOINT')
    // the joint sheet follows the beam and column details it depends on
    const iJoint = sheets.findIndex((s) => s.group === 'Beam–column joint details')
    expect(iJoint).toBeGreaterThan(sheets.findIndex((s) => s.group === 'Beam details'))
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

  it('honours the 90° mat-hook option', () => {
    const straight = buildSheetSet(model, design, soil, { hookedMatBars: false })
    const hooked = buildSheetSet(model, design, soil, { hookedMatBars: true })
    const foot = (set: PlanSheet[]) => set.find((s) => s.group === 'Footing details')!
    // A hook does not add PRIMITIVES — it lengthens the bar paths, which is why
    // a primitive count is the wrong thing to assert on here.
    const cmds = (set: PlanSheet[]) => foot(set).drawing.primitives
      .reduce((n, p) => n + (p.kind === 'path' ? p.cmds.length : 0), 0)
    expect(cmds(hooked)).toBeGreaterThan(cmds(straight))
    // and nothing outside the footing sheets moves
    const others = (set: PlanSheet[]) => set.filter((s) => s.group !== 'Footing details').map((s) => s.key)
    expect(others(hooked)).toEqual(others(straight))
  })

  it('drops the design-only sheets when there is no design', () => {
    const only = buildSheetSet(model, null, soil)
    expect(only.every((s) => s.group === 'Plans')).toBe(true)
    // …and the framing plans still come through, since they need only the model
    expect(only.length).toBeGreaterThan(0)
    expect(only.some((s) => s.key === 'foundation-plan')).toBe(false)
  })
})

describe('grouping', () => {
  it('preserves sheet order inside each group and group order overall', () => {
    const { model, design } = full()
    const sheets = buildSheetSet(model, design, soil)
    const groups = groupSheets(sheets)
    expect(groups.map((g) => g.group)[0]).toBe('Plans')
    expect(groups.flatMap((g) => g.sheets)).toEqual(sheets)
    for (const g of groups) expect(g.sheets.every((s) => s.group === g.group)).toBe(true)
  })

  it('splits plans from details the same way the two builders do', () => {
    const { model, design } = full()
    expect(buildSheetSet(model, design, soil)).toEqual([
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
