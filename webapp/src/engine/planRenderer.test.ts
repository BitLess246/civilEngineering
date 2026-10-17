import { describe, it, expect } from 'vitest'
import { generateGridModel } from './modelBuilder'
import { buildPlan, planToSvg, extensionLines, RAKE_DASH, tofTag, wrapText, type PlanPrimitive } from './planRenderer'
import { measureBounds } from './detailSheet'
import type { RectSection } from './model'
import { shapeByName } from './aiscSections'

const section: RectSection = { id: 'S1', name: '400×400', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const texts = (p: PlanPrimitive[]) => p.filter((x) => x.kind === 'text').map((x) => (x as { text: string }).text)

describe('planRenderer — framing plan geometry', () => {
  const model = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3], section, slabThickness: 150 })
  const plan = buildPlan(model)!

  it('sets a vertical beam mark clear of the beam edge, on the bay side', () => {
    // FB1 rotated beside a 400 mm beam sat on its outline at an offset of r·0.45
    // from the centreline; the last grid's mark now faces into the bay too.
    const marks = plan.primitives.filter((p): p is Extract<PlanPrimitive, { kind: 'text' }> => p.kind === 'text' && /^FB/.test(p.text) && p.rotate === -90)
    expect(marks.length).toBe(3)
    for (const m of marks) {
      const gx = [0, 6, 12].reduce((a, b) => (Math.abs(b - m.x) < Math.abs(a - m.x) ? b : a))
      expect(Math.abs(m.x - gx) - m.size / 2).toBeGreaterThan(section.b / 2000)
      if (gx === 12) expect(m.x).toBeLessThan(12)
      else expect(m.x).toBeGreaterThan(gx)
    }
  })

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
    expect(plan.beamSchedule[0]).toMatchObject({ mark: 'FB1', size: '400×400' })
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

  it('draws no tie beam the design did not size', () => {
    // FTB1 used to be drawn between every pair of pads, with no size and no
    // schedule row — a member nothing designs and nobody can build.
    expect(texts(f.primitives).some((s) => /FTB/.test(s))).toBe(false)
    expect(f.beamSchedule).toHaveLength(0)
  })

  it('tags each pad with its TOP — founding level plus its thickness — as the footing detail does', () => {
    // founding −1.50, Dc 350 → T.O.F. −1.15; the detail prints the same tag
    expect(texts(f.primitives)).toContain('T.O.F. EL -1.15 m')
    expect(tofTag(-1.5, 350)).toBe('T.O.F. EL -1.15 m')
    expect(texts(f.primitives).some((s) => s === 'EL -1.50 m')).toBe(false)
  })

  it('stands the grid dimensions off from the PADS, not just the grid', () => {
    // A 2.0 m pad on the top row hangs 1 m past grid line 1 with its mark above
    // it; the chain set off from the grid ran through the mark.
    const marks = f.primitives.filter((p): p is Extract<PlanPrimitive, { kind: 'text' }> => p.kind === 'text' && /^WF-/.test(p.text))
    const markTop = Math.min(...marks.map((m) => m.y - m.size / 2))
    const padLeft = Math.min(...f.primitives.filter((p): p is Extract<PlanPrimitive, { kind: 'rect' }> => p.kind === 'rect' && !!p.dash).map((p) => p.x))
    const dims = f.primitives.filter((p): p is Extract<PlanPrimitive, { kind: 'dim' }> => p.kind === 'dim')
    for (const d of dims.filter((d) => d.y1 === d.y2)) expect(d.y1).toBeLessThan(markTop)
    for (const d of dims.filter((d) => d.x1 === d.x2)) expect(d.x1).toBeLessThan(padLeft)
  })

  it('haloes the pad marks and T.O.F. tags, which sit on the grid lines', () => {
    // the labels centred on a pad — not the schedule table's own WF-n cells
    const padX = new Set(base.map((n) => n.x))
    const tags = f.primitives.filter((p): p is Extract<PlanPrimitive, { kind: 'text' }> =>
      p.kind === 'text' && padX.has(p.x) && (/^WF-/.test(p.text) || p.text.startsWith('T.O.F.')))
    expect(tags.length).toBe(base.length * 2)
    for (const t of tags) expect(t.halo).toBe(true)
  })

  it('counts each footing type on the schedule', () => {
    // six base nodes, alternating 1.5 / 2.0 m
    expect(f.footingSchedule.map((r) => r.qty)).toEqual([3, 3])
    expect(f.footingSchedule.reduce((s, r) => s + r.qty, 0)).toBe(base.length)
    expect(texts(f.primitives)).toContain('NO.')
  })

  it('prints the notes it is given, wrapped and numbered, under the schedules', () => {
    const long = 'FOOTINGS ARE SIZED FOR AN ALLOWABLE SOIL BEARING PRESSURE qa = 150 kPa. CONFIRM BY GEOTECHNICAL INVESTIGATION BEFORE EXCAVATION.'
    const g = buildPlan(model, { kind: 'foundation', footings, foundingElev: -1.5, notes: [long, 'SECOND NOTE.'] })!
    const t = texts(g.primitives)
    expect(t).toContain('NOTES')
    expect(t.some((s) => s.startsWith('1. FOOTINGS'))).toBe(true)
    expect(t).toContain('2. SECOND NOTE.')
    // wrapped: the long note is split, and the sheet is no wider than without it
    const i1 = t.findIndex((s) => s.startsWith('1. ')), i2 = t.indexOf('2. SECOND NOTE.')
    expect(i2 - i1).toBeGreaterThan(1)
    expect(t.slice(i1, i2).join(' ')).toBe(`1. ${long}`)
    expect(g.bounds.maxX - g.bounds.minX).toBeCloseTo(f.bounds.maxX - f.bounds.minX, 6)
  })

  it('draws a pedestal as a solid outline inside its pad', () => {
    const withPed = footings.map((x, i) => (i === 0 ? { ...x, pedestal: 600 } : x))
    const g = buildPlan(model, { kind: 'foundation', footings: withPed })!
    const n = base[0]
    const ped = g.primitives.filter((p) => p.kind === 'rect' && !p.dash
      && Math.abs(p.w - 0.6) < 1e-9 && Math.abs(p.x + p.w / 2 - n.x) < 1e-9 && Math.abs(p.y + p.h / 2 - n.z) < 1e-9)
    expect(ped).toHaveLength(1)
  })
})

describe('planRenderer — the overall dimension tier', () => {
  type Dim = Extract<PlanPrimitive, { kind: 'dim' }>
  const dims = (ps: PlanPrimitive[]) => ps.filter((p): p is Dim => p.kind === 'dim')
  const circles = (ps: PlanPrimitive[]) => ps.filter((p): p is Extract<PlanPrimitive, { kind: 'circle' }> => p.kind === 'circle')

  it('adds first-to-last-line totals outside the bay chain, only in a direction with more than one bay', () => {
    // 6 + 6 m across, one 5 m bay down: a 12000 total on top, none on the left
    const d = buildPlan(generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3], section, slabThickness: 150 }))!
    const top = dims(d.primitives).filter((p) => p.y1 === p.y2)
    const left = dims(d.primitives).filter((p) => p.x1 === p.x2)
    expect(top.map((p) => p.text)).toEqual(['6000 mm', '6000 mm', '12000 mm'])
    expect(left.map((p) => p.text)).toEqual(['5000 mm'])
    const [chain, total] = [top[0], top[2]]
    expect(total.y1).toBeLessThan(chain.y1)                 // further out
    // and the bubble ring clears the total's text (≈ 1.2 text heights above its line)
    const bubbleBottom = Math.max(...circles(d.primitives).filter((c) => c.cy < 0).map((c) => c.cy + c.r))
    expect(bubbleBottom).toBeLessThan(total.y1 - 1.2 * total.size)
  })

  it('leaves a single-bay plan as it was: no tier, and the bubbles where they were', () => {
    const d = buildPlan(generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section, slabThickness: 150 }))!
    expect(dims(d.primitives).map((p) => p.text)).toEqual(['6000 mm', '5000 mm'])
  })
})

describe('wrapText', () => {
  it('breaks on words within the width and keeps every word', () => {
    const t = 'ONE TWO THREE FOUR FIVE SIX'
    const lines = wrapText(t, 9)
    expect(lines.every((l) => l.length <= 9)).toBe(true)
    expect(lines.join(' ')).toBe(t)
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

describe('planRenderer — steel columns are drawn as their true section, not a b×h box', () => {
  const W = shapeByName('W310x79')!
  const steelModel = (shape: string, rot?: number) => {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section, slabThickness: 150 })
    m.sections = m.sections.map((s) => ({ ...s, material: 'steel' as const, shape }))
    if (rot !== undefined) m.members = m.members.map((x) => x.role === 'column' ? { ...x, axisRotation: rot } : x)
    return m
  }
  const colPaths = (m: ReturnType<typeof steelModel>) =>
    buildPlan(m)!.primitives.filter((p): p is Extract<PlanPrimitive, { kind: 'path' }> => p.kind === 'path' && p.fill === '#1e293b')
  const bbox = (p: Extract<PlanPrimitive, { kind: 'path' }>) => {
    const xs = p.cmds.map((c) => c.x), ys = p.cmds.map((c) => c.y)
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
  }

  it('a W column: an I outline (12 vertices), depth d on global X, flanges bf on Z (default 90° rotation)', () => {
    const paths = colPaths(steelModel('W310x79'))
    expect(paths).toHaveLength(4)                                   // 2×2 columns, no solid box
    expect(buildPlan(steelModel('W310x79'))!.primitives.some((p) => p.kind === 'rect' && p.fill === '#1e293b')).toBe(false)
    for (const p of paths) {
      expect(p.cmds).toHaveLength(12)
      const { w, h } = bbox(p)
      expect(w).toBeCloseTo(W.d! / 1000, 6)                         // depth d along X
      expect(h).toBeCloseTo(W.bf! / 1000, 6)                        // flange bf along Z
    }
  })

  it('an explicit 0° rotation turns the strong axis onto Z', () => {
    const { w, h } = bbox(colPaths(steelModel('W310x79', 0))[0])
    expect(w).toBeCloseTo(W.bf! / 1000, 6)
    expect(h).toBeCloseTo(W.d! / 1000, 6)
  })

  it('a rectangular HSS draws its wall: the outer outline plus a white hole', () => {
    const prims = buildPlan(steelModel('HSS203x102x6.4'))!.primitives
    const holes = prims.filter((p) => p.kind === 'path' && p.fill === '#ffffff')
    expect(colPaths(steelModel('HSS203x102x6.4'))).toHaveLength(4)
    expect(holes).toHaveLength(4)
    const outer = bbox(colPaths(steelModel('HSS203x102x6.4'))[0])
    expect(Math.max(outer.w, outer.h)).toBeCloseTo(0.2032, 4)
    expect(Math.min(outer.w, outer.h)).toBeCloseTo(0.1016, 4)
  })

  it('a pipe is round, centred on the grid node', () => {
    const m = steelModel('PIPE 6 STD')
    const p = colPaths(m)[0]
    const { w, h } = bbox(p)
    expect(w).toBeCloseTo(h, 3)
    expect(w).toBeCloseTo(0.1683, 3)
    const cx = p.cmds.reduce((s, c) => s + c.x, 0) / p.cmds.length
    expect(m.nodes.some((n) => Math.abs(n.x - cx) < 1e-6)).toBe(true)
  })

  it('a concrete column is still the b×h rectangle', () => {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section, slabThickness: 150 })
    expect(buildPlan(m)!.primitives.filter((p) => p.kind === 'rect' && p.fill === '#1e293b')).toHaveLength(4)
  })
})

describe('rectangular RC columns in plan — the analysed orientation', () => {
  const deep: RectSection = { ...section, b: 300, h: 600 }
  const one = () => generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section: deep, slabThickness: 150 })
  const cols = (m: ReturnType<typeof one>) =>
    buildPlan(m)!.primitives.filter((p) => (p.kind === 'rect' || p.kind === 'path') && (p as { fill?: string }).fill === '#1e293b')

  it('h lies along X, as the solver (default 90°), the 3D view and the cage have it — it was drawn along Z', () => {
    for (const r of cols(one()) as Extract<PlanPrimitive, { kind: 'rect' }>[]) {
      expect(r.w).toBeCloseTo(0.6, 9)
      expect(r.h).toBeCloseTo(0.3, 9)
    }
  })
  it('an explicit axisRotation 0 turns the section: h along Z', () => {
    const m = one()
    m.members = m.members.map((q) => (q.role === 'column' ? { ...q, axisRotation: 0 } : q))
    for (const r of cols(m) as Extract<PlanPrimitive, { kind: 'rect' }>[]) expect(r.w).toBeCloseTo(0.3, 9)
  })
  it('a skewed axisRotation draws the rotated outline', () => {
    const m = one()
    m.members = m.members.map((q) => (q.role === 'column' ? { ...q, axisRotation: 60 } : q))
    const p = cols(m)
    expect(p.every((x) => x.kind === 'path')).toBe(true)
  })
  it('a raking column carries a dashed centreline to where its other end lands', () => {
    const m = one()
    m.nodes = m.nodes.map((n) => (n.id === 'n1.1.1' ? { ...n, z: n.z + 1 } : n))
    const rake = buildPlan(m)!.primitives.filter((p) => p.kind === 'line' && (p as { dash?: number[] }).dash === RAKE_DASH)
    expect(rake).toHaveLength(1)
  })
})
