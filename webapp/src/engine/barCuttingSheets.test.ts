import { describe, it, expect } from 'vitest'
import { generateGridModel } from './modelBuilder'
import { designStructure } from './pipeline'
import { buildStructureCages } from './cageBuilder'
import { frameElevationBundles } from '../lib/planDetails'
import { buildExplodedBeamLine, buildBbsSheet, packRows, shapeSketch, barLabel, cagesByKind } from './barCuttingSheets'
import { bendingSchedule, scheduleTypes, scheduleWeight } from './barBendingSchedule'
import { cutLength, runWeight } from './rebarModel'
import { buildSheetSet } from '../lib/planSheets'
import type { RectSection, ModelLoad } from './model'

const section: RectSection = { id: 'S1', name: '400×400', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }
function frame() {
  const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3, 3], section, slabThickness: 150 })
  m.loads = m.plates.flatMap((p): ModelLoad[] => [
    { kind: 'area', plate: p.id, q: 4.0, cat: 'D' },
    { kind: 'area', plate: p.id, q: 2.4, cat: 'L' },
  ])
  return { model: m, design: designStructure(m, soil)! }
}

describe('packRows — interval packing of the exploded bars', () => {
  it('puts non-overlapping bars on one row and overlapping ones on the next', () => {
    expect(packRows([[0, 4], [5, 9], [3, 6]], 0.5)).toEqual([0, 0, 1])
    // a lap: two bars sharing 0.6 m can never share a row
    expect(packRows([[0, 6], [5.4, 12]], 0)).toEqual([0, 1])
    expect(packRows([], 1)).toEqual([])
  })
})

describe('the exploded beam line', () => {
  const { model, design } = frame()
  const { cages } = buildStructureCages(model, design)
  const bundles = frameElevationBundles(model, design, cages)
  const b = bundles[0]
  const d = buildExplodedBeamLine(b.input, { detailNo: '1', sheetRef: 'S-12' })
  const subjectRuns = cages.filter((c) => b.input.subject.has(c.member)).flatMap((c) => c.runs)
    .filter((r) => ['top', 'bottom', 'side'].includes(r.role))

  it('draws every longitudinal bar of the line once, labelled with its cut length', () => {
    const texts = d.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text)
    for (const r of subjectRuns) expect(texts).toContain(barLabel(r, cutLength(r)))
    const bars = d.primitives.filter((p) => p.kind === 'path' && p.width === 1.8)
    expect(bars).toHaveLength(subjectRuns.length)
  })

  it('keeps each bar at its true length — the drawn bar spans what the cage bar spans', () => {
    const bars = d.primitives.filter((p) => p.kind === 'path' && p.width === 1.8) as Extract<typeof d.primitives[number], { kind: 'path' }>[]
    const drawnSpans = bars.map((p) => {
      const xs = p.cmds.map((c) => ('x' in c ? c.x : 0))
      return Math.max(...xs) - Math.min(...xs)
    }).sort((x, y) => x - y)
    const cageSpans = subjectRuns.map((r) => {
      const us = r.path.map((q) => q[0] * b.input.plane.u[0] + q[2] * b.input.plane.u[2])
      return Math.max(...us) - Math.min(...us)
    }).sort((x, y) => x - y)
    drawnSpans.forEach((s, k) => expect(s).toBeCloseTo(cageSpans[k], 9))
  })

  it('pulls top steel above the beam and bottom steel below it', () => {
    const beams = b.input.members.filter((m) => m.role === 'beam')
    const top = -Math.max(...beams.map((m) => m.yTop)), bot = -Math.min(...beams.map((m) => m.yBot))
    const bars = d.primitives.filter((p) => p.kind === 'path' && p.width === 1.8) as Extract<typeof d.primitives[number], { kind: 'path' }>[]
    for (const p of bars) {
      const ys = p.cmds.map((c) => ('y' in c ? c.y : 0))
      const above = Math.max(...ys) < top, below = Math.min(...ys) > bot
      expect(above || below).toBe(true)
    }
    expect(d.title).toMatch(/^BAR CUTTING LIST — GRID/)
  })
})

describe('the bar bending schedule sheet', () => {
  const { model, design } = frame()
  const { cages } = buildStructureCages(model, design)

  it('one row per type, and its TOTAL is the cages’ weight', () => {
    const beams = cagesByKind(cages).get('beam')!
    const types = scheduleTypes(bendingSchedule(beams))
    const d = buildBbsSheet(types, 'Beams')
    const texts = d.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text)
    const kg = beams.flatMap((c) => c.runs).reduce((s, r) => s + runWeight(r), 0)
    expect(scheduleWeight(types)).toBeCloseTo(kg, 6)
    expect(texts).toContain(kg.toFixed(2))
    for (const t of types) expect(texts).toContain(`${t.type} (⌀${t.dia})`)
    expect(d.title).toBe('BAR BENDING SCHEDULE — BEAMS')
  })

  it('sketches a shape inside its cell, every leg labelled', () => {
    const t = scheduleTypes(bendingSchedule(cages)).find((x) => x.shape.code === 'C' || x.shape.code === 'B')!
    const P = shapeSketch(t, 100, 50, 300, 70, 11)
    const path = P.find((p) => p.kind === 'path') as Extract<typeof P[number], { kind: 'path' }>
    for (const c of path.cmds) {
      if (!('x' in c)) continue
      expect(c.x).toBeGreaterThanOrEqual(100); expect(c.x).toBeLessThanOrEqual(400)
      expect(c.y).toBeGreaterThanOrEqual(50); expect(c.y).toBeLessThanOrEqual(120)
    }
    expect(P.filter((p) => p.kind === 'text')).toHaveLength(t.shape.legs.length)
  })
})

describe('in the sheet set', () => {
  it('adds the cutting lists and schedules after the details', () => {
    const { model, design } = frame()
    const sheets = buildSheetSet(model, design, soil)
    const groups = [...new Set(sheets.map((s) => s.group))]
    expect(groups.slice(-2)).toEqual(['Bar cutting lists', 'Bar bending schedules'])
    expect(sheets.filter((s) => s.group === 'Bar bending schedules').map((s) => s.title)).toContain('Beams')
  })
})
