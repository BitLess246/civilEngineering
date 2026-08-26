import { describe, it, expect } from 'vitest'
import { generateGridModel } from './modelBuilder'
import { buildPlan, planToSvg, extensionLines, type PlanPrimitive } from './planRenderer'
import { measureBounds } from './detailSheet'
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

  it('marks slab panels with a slab number (S1) + a SLAB SCHEDULE, not h=…', () => {
    expect(texts(plan.primitives)).toContain('S1')
    expect(texts(plan.primitives)).toContain('SLAB SCHEDULE')
    expect(texts(plan.primitives).some((t) => t.startsWith('h='))).toBe(false)
    expect(plan.slabSchedule[0]).toMatchObject({ mark: 'S1' })
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

describe('planRenderer — combined footings on the foundation plan', () => {
  const model = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3], section, slabThickness: 150 })
  const base = model.nodes.filter((n) => Math.abs(n.y) < 1e-6).sort((a, b) => a.x - b.x || a.z - b.z)
  // two supports on the same z, 6 m apart — the pair a combined pad carries
  const pair = base.filter((n) => Math.abs(n.z - base[0].z) < 1e-9).slice(0, 2)
  const combined = {
    kind: 'combined' as const,
    nodes: [pair[0].id, pair[1].id] as [string, string],
    Bx: 8, By1: 2.4, By2: 1.6, x1: 1, x2: 7,
    Dc: 500, barDia: 20, barSpacing: 150, bars: 10,
  }
  const rest = base.filter((n) => !pair.some((p) => p.id === n.id))
    .map((n) => ({ node: n.id, B: 1.5, Dc: 350, bars: 8, barSpacing: 180, barDia: 16 }))
  const f = buildPlan(model, { kind: 'foundation', footings: [...rest, combined], foundingElev: -1.5 })!

  const pads = () => f.primitives.filter(
    (p): p is Extract<PlanPrimitive, { kind: 'path' }> => p.kind === 'path' && p.closed === true,
  )

  it('draws the pad as a closed four-sided polygon', () => {
    const q = pads()
    expect(q).toHaveLength(1)
    expect(q[0].cmds).toHaveLength(4)
  })

  it('makes the two ends the widths the design gave, not one average', () => {
    // A trapezoidal pad is trapezoidal because the two columns carry different
    // loads. Drawing it as a rectangle on the mean width puts bearing pressure
    // in the wrong place at both ends.
    const c = pads()[0].cmds
    const end1 = Math.hypot(c[0].x - c[1].x, c[0].y - c[1].y)
    const end2 = Math.hypot(c[2].x - c[3].x, c[2].y - c[3].y)
    expect(end1).toBeCloseTo(2.4, 9)
    expect(end2).toBeCloseTo(1.6, 9)
    expect(end1).not.toBeCloseTo(end2, 3)
  })

  it('runs the pad the full Bx, with the overhang beyond the FIRST column', () => {
    // x1 is the overhang past column 1, so the pad origin sits x1 back along
    // the axis. Centring it on the two nodes instead puts both overhangs wrong
    // on any pad whose columns are not symmetric — which is every trapezoid.
    const c = pads()[0].cmds
    const mid1 = { x: (c[0].x + c[1].x) / 2, y: (c[0].y + c[1].y) / 2 }
    const mid2 = { x: (c[2].x + c[3].x) / 2, y: (c[2].y + c[3].y) / 2 }
    expect(Math.hypot(mid2.x - mid1.x, mid2.y - mid1.y)).toBeCloseTo(8, 9)
    // the first column sits 1 m in from the near end
    expect(Math.hypot(pair[0].x - mid1.x, pair[0].z - mid1.y)).toBeCloseTo(1, 9)
    // …and the second 7 m in, so 1 m short of the far end
    expect(Math.hypot(pair[1].x - mid2.x, pair[1].z - mid2.y)).toBeCloseTo(1, 9)
  })

  it('schedules it under its own CF- series, sized by both ends', () => {
    const t = texts(f.primitives)
    expect(t).toContain('CF-1')
    const row = f.footingSchedule.find((r) => r.mark === 'CF-1')!
    expect(row).toBeDefined()
    expect(row.size).toBe('8000×2400/1600')
    expect(row.thk).toBe('500')
    // …and the isolated pads keep their own series, unbroken
    expect(f.footingSchedule.filter((r) => r.mark.startsWith('WF-')).map((r) => r.mark)).toEqual(['WF-1'])
  })

  it('sizes a rectangular pad by one width', () => {
    const r = buildPlan(model, {
      kind: 'foundation',
      footings: [{ ...combined, By1: 2.0, By2: 2.0 }],
    })!
    expect(r.footingSchedule.find((x) => x.mark === 'CF-1')!.size).toBe('8000×2000')
  })

  it('does not give a combined pad\'s nodes an isolated pad as well', () => {
    // the pipeline excludes them; the plan must not reintroduce one
    const rects = f.primitives.filter((p) => p.kind === 'rect')
    for (const n of pair) {
      const onNode = rects.filter((p) =>
        p.kind === 'rect' && Math.abs(p.x + p.w / 2 - n.x) < 1e-6 && Math.abs(p.y + p.h / 2 - n.z) < 1e-6
        && p.w > 1.0)
      expect(onNode).toHaveLength(0)
    }
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

describe('dimension extension lines', () => {
  const dim = (o: Partial<Extract<PlanPrimitive, { kind: 'dim' }>> = {}) => ({
    kind: 'dim' as const, x1: 0, y1: 10, x2: 4, y2: 10, text: '4000', off: 0, size: 1, ...o,
  })

  it('draws nothing for a dimension that does not say what it measures', () => {
    expect(extensionLines(dim())).toEqual([])
  })

  it('runs one line from each END of the dimension back towards the feature', () => {
    // A horizontal dimension at y = 10 measuring something at y = 2: the lines
    // are vertical, one under each end.
    const e = extensionLines(dim({ ext: 2 }))
    expect(e).toHaveLength(2)
    expect(e.map((l) => l.x1)).toEqual([0, 4])
    for (const l of e) expect(l.x1).toBe(l.x2)          // vertical
  })

  it('leaves a gap off the feature and overshoots the dimension line', () => {
    // Drafting convention, and what makes it read as an extension line rather
    // than as more geometry: it never touches the thing it points at, and it
    // visibly crosses the dimension it belongs to.
    const [l] = extensionLines(dim({ ext: 2, size: 1 }))
    expect(l.y1).toBeCloseTo(2 + 0.45, 9)              // gap off the feature
    expect(l.y2).toBeCloseTo(10 + 0.55, 9)             // past the dimension line
  })

  it('works the other way round when the feature is BEYOND the dimension', () => {
    const [l] = extensionLines(dim({ ext: 20 }))
    expect(l.y1).toBeCloseTo(20 - 0.45, 9)
    expect(l.y2).toBeCloseTo(10 - 0.55, 9)
  })

  it('turns with a VERTICAL dimension', () => {
    const e = extensionLines(dim({ x1: 10, y1: 0, x2: 10, y2: 4, ext: 2 }))
    expect(e).toHaveLength(2)
    expect(e.map((l) => l.y1)).toEqual([0, 4])
    for (const l of e) expect(l.y1).toBe(l.y2)         // horizontal
  })

  it('draws nothing where the dimension sits hard against what it measures', () => {
    // Gap plus overshoot would be longer than the line itself — a stub that
    // reads as a tick, not an extension line.
    expect(extensionLines(dim({ ext: 9.5 }))).toEqual([])
  })

  it('is counted in the sheet bounds, so it is never clipped', () => {
    const near = measureBounds([dim({ ext: 2 })])
    const far = measureBounds([dim({ ext: -30 })])
    expect(far.minY).toBeLessThan(near.minY)
    expect(far.minY).toBeLessThanOrEqual(-30 + 0.45)
  })
})
