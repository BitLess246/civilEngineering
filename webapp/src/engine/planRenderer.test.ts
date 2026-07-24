import { describe, it, expect } from 'vitest'
import { generateGridModel } from './modelBuilder'
import { buildPlan, planToSvg, type PlanPrimitive } from './planRenderer'
import type { RectSection } from './model'

const section: RectSection = { id: 'S1', name: '400×400', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const texts = (p: PlanPrimitive[]) => p.filter((x) => x.kind === 'text').map((x) => (x as { text: string }).text)

describe('planRenderer — framing plan geometry', () => {
  const model = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3], section, slabThickness: 150 })
  const plan = buildPlan(model)!

  it('derives grid bubbles A/B/C across x and 1/2 down z', () => {
    const t = texts(plan.primitives)
    expect(t).toContain('A'); expect(t).toContain('B'); expect(t).toContain('C')
    expect(t).toContain('1'); expect(t).toContain('2')
  })

  it('draws a column section square at each grid node', () => {
    const cols = plan.primitives.filter((p) => p.kind === 'rect' && (p as { fill?: string }).fill === '#1e293b')
    expect(cols.length).toBe(6)   // 3×2 columns
  })

  it('labels beams with marks (FB1…) and builds a matching beam schedule', () => {
    expect(texts(plan.primitives)).toContain('FB1')
    expect(plan.beamSchedule.length).toBeGreaterThan(0)
    expect(plan.beamSchedule[0]).toEqual({ mark: 'FB1', size: '400×400' })
    expect(texts(plan.primitives)).toContain('BEAM SCHEDULE')
  })

  it('labels slab panels with a thickness carrying units (h=150 mm)', () => {
    expect(texts(plan.primitives)).toContain('h=150 mm')
  })

  it('emits a title block with the sheet title, detail tag and scale', () => {
    const t = texts(plan.primitives)
    expect(t).toContain('FRAMING PLAN')
    expect(t).toContain('SCALE'); expect(t).toContain('NTS')
    expect(t).toContain('S-1')   // default sheet ref
  })

  it('places chained grid dimensions BELOW the bubbles (not above them)', () => {
    const dims = plan.primitives.filter((p) => p.kind === 'dim') as { text: string; y1: number }[]
    const bubbles = plan.primitives.filter((p) => p.kind === 'circle') as { cy: number }[]
    expect(dims.some((d) => d.text === '6000 mm')).toBe(true)
    // the top dim chain must sit below (greater Y = drafting-down) the topmost bubble row
    const topBubbleY = Math.min(...bubbles.map((b) => b.cy))
    expect(Math.min(...dims.map((d) => d.y1))).toBeGreaterThan(topBubbleY)
  })

  it('bounds enclose every primitive and serialise to valid SVG', () => {
    expect(plan.bounds.maxX).toBeGreaterThan(plan.bounds.minX)
    const svg = planToSvg(plan, 1000)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
    expect(plan.title).toBe('FRAMING PLAN')
  })

  it('foundation plan draws columns dashed (footing outline stage)', () => {
    const f = buildPlan(model, { kind: 'foundation' })!
    expect(f.title).toBe('FOUNDATION PLAN')
    expect(f.primitives.some((p) => p.kind === 'rect' && (p as { dash?: number[] }).dash)).toBe(true)
  })

  it('draws a per-floor framing plan for each level with a title override', () => {
    const twoStorey = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3, 3], section, slabThickness: 150 })
    const l1 = buildPlan(twoStorey, { kind: 'framing', level: 1, title: 'GROUND FLOOR FRAMING PLAN' })!
    const l2 = buildPlan(twoStorey, { kind: 'framing', level: 2, title: 'SECOND FLOOR FRAMING PLAN' })!
    expect(l1.title).toBe('GROUND FLOOR FRAMING PLAN')
    expect(l2.title).toBe('SECOND FLOOR FRAMING PLAN')
    expect(l1.beamSchedule.length).toBeGreaterThan(0)
    expect(l2.beamSchedule.length).toBeGreaterThan(0)
  })

  it('framing plan draws solid black columns + beams (both), with a beam schedule', () => {
    const f = buildPlan(model, { kind: 'framing' })!
    expect(f.title).toBe('FRAMING PLAN')
    // solid black column squares AND beam centrelines both present
    expect(f.primitives.filter((p) => p.kind === 'rect' && (p as { fill?: string }).fill === '#1e293b').length).toBe(6)
    expect(f.primitives.some((p) => p.kind === 'line' && (p as { stroke?: string }).stroke === '#0f4c92')).toBe(true)
    expect(texts(f.primitives)).toContain('BEAM SCHEDULE')
  })
})

describe('planRenderer — foundation plan with designed footings', () => {
  const model = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3], section, slabThickness: 150 })
  const base = model.nodes.filter((n) => Math.abs(n.y) < 1e-6)
  // two distinct footing sizes → two WF marks
  const footings = base.map((n, i) => ({ node: n.id, B: i % 2 === 0 ? 1.5 : 2.0, Dc: 350, bars: 8, barSpacing: 180, barDia: 16 }))
  const f = buildPlan(model, { kind: 'foundation', footings, foundingElev: -1.5 })!

  it('draws dashed footing pads marked WF-n, grouped by size, with a schedule', () => {
    const t = texts(f.primitives)
    expect(t).toContain('WF-1'); expect(t).toContain('WF-2')
    expect(f.footingSchedule.map((r) => r.mark)).toEqual(['WF-1', 'WF-2'])
    expect(f.footingSchedule[0]).toMatchObject({ mark: 'WF-1', size: '1500×1500', thk: '350' })
    expect(f.footingSchedule[0].reinf).toContain('180')
  })

  it('emits FOOTING SCHEDULE and COLUMN SCHEDULE tables', () => {
    const t = texts(f.primitives)
    expect(t).toContain('FOOTING SCHEDULE'); expect(t).toContain('COLUMN SCHEDULE')
    expect(f.columnSchedule.length).toBeGreaterThan(0)
    expect(f.columnSchedule[0].mark).toBe('C1')
  })

  it('draws tie beams (FTB1) between adjacent footings', () => {
    expect(texts(f.primitives)).toContain('FTB1')
  })

  it('tags each footing with its ELEV when foundingElev is given', () => {
    expect(texts(f.primitives).some((s) => s === 'EL -1.50 m')).toBe(true)
  })
})
