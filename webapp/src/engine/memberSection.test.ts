import { describe, it, expect } from 'vitest'
import { memberGeometry, memberSectionDetail, sectionOutline, memberLength } from './memberSection'
import { buildSectionDetail } from './sectionDetail'
import { memberCut, cutCage } from './cageSection'
import { buildStructureCages } from './cageBuilder'
import { buildBeamCage } from './beamCage'
import { designStructure } from './pipeline'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { STEEL, STEEL_LIGHT } from './sheetInk'

// The same 2-bay, 2-storey frame the cage builder is tested on, designed and
// caged — so every section here is cut from steel that was really placed.
const section = { id: 's1', name: 'C1', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }
const model = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3, 3], section })
model.loads = buildGravityLoads(model, 4.8, 2.4)
const design = designStructure(model, soil as never)!
const { cages } = buildStructureCages(model, design)

const beamId = design.beams[0]!.id
const colId = design.columns[0]!.id

describe('memberGeometry — which members read as columns', () => {
  it('tells a column from a beam by its own axis', () => {
    expect(memberGeometry(model, colId)!.vertical).toBe(true)
    expect(memberGeometry(model, beamId)!.vertical).toBe(false)
    expect(memberGeometry(model, 'nope')).toBeNull()
  })

  it('measures the member, so a station in metres means something', () => {
    expect(memberLength(memberGeometry(model, beamId)!)).toBeCloseTo(6, 6)
  })
})

describe('sectionOutline — the two conventions that are easy to get wrong', () => {
  it('hangs a beam BELOW its node line, because that line is its top face', () => {
    // `cageBuilder` places every beam cage from ySoffit = node.y − h. A section
    // centred on the node instead would be half a depth out, and would still
    // draw a perfectly plausible rectangle — which is why this is asserted.
    const g = memberGeometry(model, beamId)!
    const o = sectionOutline(g)
    expect(o.v0).toBe(0)                                   // v is DOWN the page
    expect(o.v1).toBeCloseTo(g.section.h / 1000, 9)
    expect(o.u1 - o.u0).toBeCloseTo(g.section.b / 1000, 9)
  })

  it('centres a column, and puts h across the page and b down it', () => {
    // `columnCage` places the corner bars at h/2 along x and b/2 along z, and
    // the cut plane of a vertical member is u = x, v = z.
    const g = memberGeometry(model, colId)!
    const o = sectionOutline(g)
    expect(o.u1 - o.u0).toBeCloseTo(g.section.h / 1000, 9)
    expect(o.v1 - o.v0).toBeCloseTo(g.section.b / 1000, 9)
    expect(o.u0).toBeCloseTo(-o.u1, 9)
    expect(o.v0).toBeCloseTo(-o.v1, 9)
  })
})

describe('every bar the cut finds lands inside the concrete', () => {
  // The one check that catches an outline placed against the wrong convention:
  // get it wrong and the steel is drawn outside the member it belongs to.
  const inside = (id: string, t: number) => {
    const g = memberGeometry(model, id)!
    const o = sectionOutline(g)
    const d = memberSectionDetail(model, cages, id, t)!
    const bars = d.result.bars
    expect(bars.length).toBeGreaterThan(0)
    for (const b of bars) {
      expect(b.u).toBeGreaterThanOrEqual(o.u0 - 1e-9)
      expect(b.u).toBeLessThanOrEqual(o.u1 + 1e-9)
      expect(b.v).toBeGreaterThanOrEqual(o.v0 - 1e-9)
      expect(b.v).toBeLessThanOrEqual(o.v1 + 1e-9)
    }
    for (const tie of d.result.ties) {
      for (const [u, v] of tie.pts) {
        expect(u).toBeGreaterThanOrEqual(o.u0 - 1e-9)
        expect(u).toBeLessThanOrEqual(o.u1 + 1e-9)
        expect(v).toBeGreaterThanOrEqual(o.v0 - 1e-9)
        expect(v).toBeLessThanOrEqual(o.v1 + 1e-9)
      }
    }
  }

  it('for every beam, at the supports and at midspan', () => {
    for (const b of design.beams.slice(0, 6)) for (const t of [0.08, 0.5, 0.92]) inside(b.id, t)
  })

  it('for every column, top and bottom', () => {
    for (const c of design.columns.slice(0, 6)) for (const t of [0.15, 0.5, 0.85]) inside(c.id, t)
  })
})

describe('the section sheet', () => {
  const d = memberSectionDetail(model, cages, beamId, 0.5, {
    title: 'B1 · MIDSPAN', notes: ['4-⌀20 BOT', 'STIRRUPS ⌀10 @ 200'],
  })!

  it('draws the concrete, the cover line and the steel', () => {
    expect(d.primitives[0]!.kind).toBe('rect')
    expect(d.primitives.some((p) => p.kind === 'circle' && p.fill === STEEL)).toBe(true)
    expect(d.primitives.some((p) => p.kind === 'path' && p.stroke === STEEL_LIGHT)).toBe(true)
    // the dashed cover line, at the section's own cover
    expect(d.primitives.filter((p) => p.kind === 'rect')).toHaveLength(2)
  })

  it('carries its title and its notes', () => {
    const texts = d.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text)
    expect(texts).toContain('B1 · MIDSPAN')
    expect(texts).toContain('4-⌀20 BOT')
    expect(texts).toContain('STIRRUPS ⌀10 @ 200')
  })

  it('dimensions both faces, in millimetres', () => {
    const g = memberGeometry(model, beamId)!
    const dims = d.primitives.filter((p) => p.kind === 'dim').map((p) => (p as { text: string }).text)
    expect(dims).toContain(String(Math.round(g.section.b)))
    expect(dims).toContain(String(Math.round(g.section.h)))
  })

  it('bounds everything it drew', () => {
    const xs: number[] = [], ys: number[] = []
    for (const p of d.primitives) {
      if (p.kind === 'circle') { xs.push(p.cx); ys.push(p.cy) }
      if (p.kind === 'rect') { xs.push(p.x, p.x + p.w); ys.push(p.y, p.y + p.h) }
      if (p.kind === 'path') for (const c of p.cmds) { xs.push(c.x); ys.push(c.y) }
    }
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(d.bounds.minX)
    expect(Math.max(...xs)).toBeLessThanOrEqual(d.bounds.maxX)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(d.bounds.minY)
    expect(Math.max(...ys)).toBeLessThanOrEqual(d.bounds.maxY)
  })

  it('is null for a member with no cage, rather than an empty drawing', () => {
    expect(memberSectionDetail(model, [], beamId, 0.5)).toBeNull()
    expect(memberSectionDetail(model, cages, 'nope', 0.5)).toBeNull()
  })

  it('floors the bar dots so a small bar still reads at schedule size', () => {
    const g = memberGeometry(model, beamId)!
    const o = sectionOutline(g)
    const floor = Math.min(o.u1 - o.u0, o.v1 - o.v0) / 100
    const r = d.primitives.filter((p) => p.kind === 'circle').map((p) => (p as { r: number }).r)
    expect(Math.min(...r)).toBeGreaterThanOrEqual(floor - 1e-12)
  })
})

describe('the section follows the design along the beam', () => {
  it('shows the curtailed support steel at the face and not at midspan', () => {
    // Cut from a cage built with extras over each support — the frame's own
    // beams are lightly loaded enough that the design asks for the two corner
    // bars alone, so the property has to be exercised on a beam that has them.
    const withExtras = buildBeamCage({
      mark: 'B1', L: 6, colBLeft: 400, colBRight: 400,
      b: 300, h: 550, cover: 40, barDia: 20, stirrupDia: 12,
      topBars: 8, botBars: 8, sEnd: 100, sMid: 200,
      continuousLeft: true, continuousRight: true,
      axis: { x0: 0, z0: 0, x1: 6, z1: 0 }, ySoffit: 3,
    })
    const at = (t: number) => cutCage(withExtras, memberCut([0, 3, 0], [6, 3, 0], t)).bars
    const top = (t: number) => at(t).filter((b) => b.role === 'top').length
    const bot = (t: number) => at(t).filter((b) => b.role === 'bottom').length
    expect(top(0.06)).toBeGreaterThan(top(0.5))
    expect(bot(0.5)).toBeGreaterThan(bot(0.06))
  })

  it('shows a LAP as the two bars it really is, side by side', () => {
    // A 6 m beam's through bars are longer than a 6 m stock bar, so they are
    // spliced — and a section through the splice cuts both pieces. Drawn from
    // the bar COUNT it would have shown one; drawn from the cage it shows two,
    // the lapping piece offset a diameter off the one it laps onto, which is
    // what the section is for.
    const cage = cages.find((c) => c.member === beamId)!
    const g = memberGeometry(model, beamId)!
    const counts = Array.from({ length: 41 }, (_, k) =>
      cutCage(cage, memberCut(g.i, g.j, k / 40)).bars.filter((b) => b.role === 'top').length)
    const through = new Set(cage.runs.filter((r) => r.role === 'top')
      .map((r) => r.mark.replace(/[a-z]$/, ''))).size
    expect(Math.min(...counts)).toBe(through)
    expect(Math.max(...counts)).toBeGreaterThan(through)     // the lap
  })

  it('is the cut, not a re-derivation — the same cut through the same cage', () => {
    const g = memberGeometry(model, beamId)!
    const cage = cages.find((c) => c.member === beamId)!
    const raw = cutCage(cage, memberCut(g.i, g.j, 0.5))
    const sheet = buildSectionDetail({
      title: 'x', outline: sectionOutline(g), cages: [cage], cut: memberCut(g.i, g.j, 0.5),
    })
    expect(sheet.result.bars).toEqual(raw.bars)
    expect(sheet.result.ties.length).toBe(raw.ties.length)
  })
})
