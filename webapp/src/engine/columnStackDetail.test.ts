import { describe, it, expect } from 'vitest'
import { buildColumnStackDetail, tieSetLevels } from './columnStackDetail'
import { columnStackBundles, columnStackByMember } from '../lib/planDetails'
import { buildStructureCages } from './cageBuilder'
import { designStructure } from './pipeline'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { STEEL, STEEL_LIGHT } from './sheetInk'
import type { RebarCage, Vec3 } from './rebarModel'

// A 2-bay, 2-storey frame on footings — so every stack has a pad under it, two
// column members over it, and a real cage for all three.
const section = { id: 's1', name: 'C1', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }
const model = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3, 3], section })
model.loads = buildGravityLoads(model, 4.8, 2.4)
const design = designStructure(model, soil as never)!
const { cages } = buildStructureCages(model, design)
const bundles = columnStackBundles(model, design, cages)

describe('one bundle per COLUMN, not per column type', () => {
  it('emits a sheet for every column line in the frame', () => {
    // Six grid positions, two storeys each. The typical detail deduplicated by
    // section and tie schedule and produced ONE sheet for all of them — which
    // is the defect: none of them was a column anybody could point at.
    const bases = new Set(design.columns
      .map((c) => model.members.find((m) => m.id === c.id)!)
      .map((m) => {
        const a = model.nodes.find((n) => n.id === m.i)!, b = model.nodes.find((n) => n.id === m.j)!
        return `${Math.min(a.y, b.y) === 0 ? 'base' : 'up'}:${a.x},${a.z}`
      })
      .filter((k) => k.startsWith('base:')))
    expect(bundles).toHaveLength(bases.size)
    expect(bundles.length).toBeGreaterThan(1)
  })

  it('walks the whole stack, bottom to top, without repeating a member', () => {
    for (const b of bundles) {
      const marks = b.input.segments.map((s) => s.mark)
      expect(new Set(marks).size).toBe(marks.length)
      for (let k = 1; k < b.input.segments.length; k++) {
        // each storey sits on the one below, with no gap and no overlap
        expect(b.input.segments[k]!.yBot).toBeCloseTo(b.input.segments[k - 1]!.yTop, 9)
      }
      expect(b.input.segments.length).toBe(2)
    }
  })

  it('carries the footing under it, and only the cages of that stack', () => {
    for (const b of bundles) {
      expect(b.input.footing).toBeDefined()
      const own = new Set([...b.input.segments.map((s) => s.mark),
        ...cages.filter((c) => c.member.startsWith('F-')).map((c) => c.member)])
      for (const c of b.input.cages) expect(own.has(c.member)).toBe(true)
      // its own two columns plus its own pad
      expect(b.input.cages).toHaveLength(3)
    }
  })

  it('names the sheet by the grid the column stands on', () => {
    for (const b of bundles) {
      expect(b.mark).toBe(`C-${b.grid}`)
      expect(b.grid).toMatch(/^[A-Z]\d+$/)
    }
    expect(new Set(bundles.map((b) => b.mark)).size).toBe(bundles.length)
  })

  it('puts the face IN VIEW across the page, not the other one', () => {
    // `columnCage` lays its bars out as [along h, across b] and puts the first
    // on global X, and the sheet looks along z — so the face in view is h.
    // Drawn as b, a 300×500 column comes out 300 wide with its bars spread 410:
    // the steel outside its own concrete.
    for (const b of bundles) for (const s of b.input.segments) {
      expect(s.face).toBe(section.h)
      expect(s.depth).toBe(section.b)
    }
  })
})

describe('tieSetLevels — a set, not a bar', () => {
  it('collapses a hoop and the cross ties stacked on it into one level', () => {
    const at = (y: number, dy: number): RebarCage['runs'][number] => ({
      mark: `T${y}-${dy}`, dia: 10, role: 'tie', member: 'C1', bendDia: [], count: 1,
      path: [[0, y + dy, 0], [0.3, y + dy, 0]] as Vec3[], closed: true,
    })
    const cage: RebarCage = {
      member: 'C1',
      runs: [0, 0.3, 0.6].flatMap((y) => [0, 0.01, 0.02].map((d) => at(y, d))),
    }
    const lv = tieSetLevels([cage])
    expect(lv).toHaveLength(3)
    expect(lv[1]! - lv[0]!).toBeCloseTo(0.3, 9)
  })

  it('reads the real column at its designed spacing, not at the stack step', () => {
    for (const b of bundles) for (const s of b.input.segments) {
      const lv = tieSetLevels(b.input.cages, s.yBot, s.yTop)
      const gaps = lv.slice(1).map((v, k) => v - lv[k]!)
      // Bar by bar the gaps alternate between the stack step (one diameter)
      // and the real pitch; set to set they are all real pitches.
      expect(Math.min(...gaps)).toBeGreaterThan((3 * s.tieDia) / 1000)
    }
  })
})

describe('the sheet itself', () => {
  const d = buildColumnStackDetail(bundles[0]!.input, { detailNo: '1', sheetRef: 'S-06' })
  const texts = d.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text)
  const dims = d.primitives.filter((p) => p.kind === 'dim').map((p) => (p as { text: string }).text)

  it('is titled for the column, not for a type', () => {
    expect(d.title).toBe(`COLUMN DETAIL — ${bundles[0]!.mark}`)
    expect(d.title).not.toMatch(/TYPICAL/i)
    expect(texts).toContain('S-06')
  })

  it('carries an ELEVATION LINE at every level the column reaches', () => {
    for (const lv of bundles[0]!.input.levels) {
      expect(texts.some((t) => t.includes(`EL ${lv.y.toFixed(2)}`))).toBe(true)
    }
    // …and the top of the footing, which is where the column really starts
    expect(texts.some((t) => t.startsWith('T.O.F.'))).toBe(true)
  })

  it('dimensions every storey, the pedestal and the whole stack', () => {
    for (const s of bundles[0]!.input.segments) {
      expect(dims).toContain(String(Math.round((s.yTop - s.yBot) * 1000)))
    }
    expect(dims.some((t) => /OVERALL$/.test(t))).toBe(true)
    expect(dims.some((t) => /PED\.$/.test(t))).toBe(true)
  })

  it('calls out each storey with the tie spacing MEASURED off its own bars', () => {
    for (const s of bundles[0]!.input.segments) {
      expect(texts.some((t) => t.includes(s.mark) && t.includes(`${s.bars}-⌀${s.barDia}`))).toBe(true)
      expect(texts.some((t) => t.startsWith(`TIES ⌀${s.tieDia} —`) && /\d+@\d+/.test(t))).toBe(true)
    }
  })

  it('draws steel, and draws transverse steel stepped back from it', () => {
    const ink = (c: string) => d.primitives.filter((p) => p.kind === 'path' && p.stroke === c).length
    expect(ink(STEEL)).toBeGreaterThan(4)          // verticals and dowels
    expect(ink(STEEL_LIGHT)).toBeGreaterThan(10)   // the ties up the stack
  })

  it('draws the PEDESTAL, so no bar hangs below the concrete', () => {
    // `cageBuilder` carries the cage down to the top of the pad. Drawing the
    // concrete from the base NODE instead left the dowels and the foot of the
    // column bars in mid-air.
    const f = bundles[0]!.input.footing!
    const rects = d.primitives.filter((p) => p.kind === 'rect')
    // the lowest column rect reaches the top of the pad (page y is −level)
    const colBottom = Math.max(...rects.filter((r) => r.w <= f.B - 1e-9).map((r) => r.y + r.h))
    expect(colBottom).toBeGreaterThanOrEqual(-f.yTop - 1e-6)
  })

  it('bounds everything it drew', () => {
    for (const p of d.primitives) {
      if (p.kind !== 'path') continue
      for (const c of p.cmds) {
        expect(c.x).toBeGreaterThanOrEqual(d.bounds.minX - 1e-6)
        expect(c.x).toBeLessThanOrEqual(d.bounds.maxX + 1e-6)
        expect(c.y).toBeGreaterThanOrEqual(d.bounds.minY - 1e-6)
        expect(c.y).toBeLessThanOrEqual(d.bounds.maxY + 1e-6)
      }
    }
  })

  it('says so when a storey has no cage, rather than drawing bare concrete in silence', () => {
    const bare = buildColumnStackDetail({ ...bundles[0]!.input, cages: [] })
    expect(bare.designNotes.length).toBe(bundles[0]!.input.segments.length)
    expect(bare.designNotes[0]).toMatch(/no cage/)
  })
})


describe('the storey a schedule row is about', () => {
  // A column sheet runs footing to roof and carries a different arrangement at
  // every level, so on its own it says nothing about which storey the row that
  // opened it is discussing. The wash is what a schedule row adds over a link
  // to the drawing.
  const bundle = bundles[0]!
  const storey = bundle.input.segments[1]!

  it('washes only that storey, across the full width of the stack', () => {
    const plain = buildColumnStackDetail(bundle.input)
    const lit = buildColumnStackDetail({
      ...bundle.input,
      highlight: { yBot: storey.yBot, yTop: storey.yTop, label: storey.mark },
    })
    const extra = lit.primitives.filter((p) => p.kind === 'rect').length
      - plain.primitives.filter((p) => p.kind === 'rect').length
    expect(extra).toBe(1)
    const band = lit.primitives.find((p) => p.kind === 'rect'
      && typeof p.fill === 'string' && p.fill.startsWith('rgba(29,78,216'))!
    // page y is −level, so the band's top edge is the storey's TOP
    expect(band.y).toBeCloseTo(-storey.yTop, 9)
    expect(band.h).toBeCloseTo(storey.yTop - storey.yBot, 9)
    expect(band.w).toBeGreaterThan(storey.face / 1000)
  })

  it('labels it, so the reader knows which member is being discussed', () => {
    const lit = buildColumnStackDetail({
      ...bundle.input,
      highlight: { yBot: storey.yBot, yTop: storey.yTop, label: storey.mark },
    })
    const texts = lit.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text)
    expect(texts).toContain(storey.mark)
  })

  it('draws nothing extra on the drawing-set sheets, which are about the whole column', () => {
    const plain = buildColumnStackDetail(bundle.input)
    expect(plain.primitives.some((p) => p.kind === 'rect'
      && typeof p.fill === 'string' && p.fill.startsWith('rgba(29,78,216'))).toBe(false)
  })

  it('ignores a degenerate band rather than drawing a zero-height rectangle', () => {
    const flat = buildColumnStackDetail({
      ...bundle.input, highlight: { yBot: 3, yTop: 3, label: 'x' },
    })
    expect(flat.primitives.filter((p) => p.kind === 'rect').length)
      .toBe(buildColumnStackDetail(bundle.input).primitives.filter((p) => p.kind === 'rect').length)
  })
})

describe('finding the sheet a column row belongs to', () => {
  it('indexes every member of every stack, unambiguously', () => {
    // Unlike a beam elevation — where a column appears on the sheets either
    // side of it — a column member belongs to exactly one stack: the one
    // standing over its own base node.
    const index = columnStackByMember(model, design, cages)
    for (const c of design.columns) {
      const b = index.get(c.id)
      expect(b, c.id).toBeDefined()
      expect(b!.input.segments.some((s) => s.mark === c.id)).toBe(true)
    }
    // …and every indexed member resolves to a storey with real extent
    for (const [id, b] of index) {
      const seg = b.input.segments.find((s) => s.mark === id)!
      expect(seg.yTop).toBeGreaterThan(seg.yBot)
    }
  })
})
