import { describe, it, expect } from 'vitest'
import { columnSplices, buildSteelFrameElevation, SPLICE_ABOVE_FLOOR_M, SPLICE_STOCK_M, type StackColumn } from './steelElevation'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { designStructure } from './pipeline'
import { steelElevationBundles } from '../lib/steelElevation'
import { connectionMarks, markAt } from '../lib/steelMarks'
import { buildSheetSet } from '../lib/planSheets'
import { shapeByName } from './aiscSections'
import type { PlanPrimitive } from './planRenderer'
import type { RectSection } from './model'

const stack = (n: number, h: number, shape: (k: number) => string = () => 'W310x79', Tu: (k: number) => number = () => 0): StackColumn[] =>
  Array.from({ length: n }, (_, k) => ({ id: `c${k}`, yBot: k * h, yTop: (k + 1) * h, shape: shape(k), Tu: Tu(k) }))
const texts = (ps: PlanPrimitive[]) => ps.flatMap((p) => (p.kind === 'text' ? [p.text] : []))

describe('columnSplices — where a steel column is spliced', () => {
  it('a single piece has nothing to splice', () => {
    expect(columnSplices(stack(1, 4))).toEqual([])
    expect(columnSplices(stack(3, 3))).toEqual([])            // 9 m, one shape: ships whole
  })

  it('a change of shape forces a splice 1.2 m above that floor', () => {
    // W310x97 for two storeys, W310x79 above: the shape changes at the +6 floor
    const s = columnSplices(stack(4, 3, (k) => (k < 2 ? 'W310x97' : 'W310x79')))
    expect(s).toEqual([{ column: 'c2', y: 6 + SPLICE_ABOVE_FLOOR_M, kind: 'bearing', reason: 'shape change' }])
  })

  it('a constant-shape run longer than stock is cut at the highest splice point that keeps the piece in stock', () => {
    // 5 × 3 m = 15 m > 12 m. Candidates 4.2, 7.2, 10.2, 13.2 — the highest ≤ 12 is 10.2,
    // leaving 4.8 m above, which ships
    const s = columnSplices(stack(5, 3))
    expect(s).toEqual([{ column: 'c3', y: 10.2, kind: 'bearing', reason: 'stock length' }])
  })

  it('every piece of a tall stack is within stock, and every splice sits 1.2 m above a floor', () => {
    const st = stack(10, 3.5)                                 // 35 m
    const s = columnSplices(st)
    const cuts = [0, ...s.map((x) => x.y), 35]
    for (let k = 1; k < cuts.length; k++) expect(cuts[k]! - cuts[k - 1]!).toBeLessThanOrEqual(SPLICE_STOCK_M + 1e-9)
    for (const x of s) expect(((x.y - SPLICE_ABOVE_FLOOR_M) / 3.5) % 1).toBeCloseTo(0, 9)
  })

  it('a splice in a column that sees net tension is not a bearing splice (AISC 360-16 §J1.4(a))', () => {
    const s = columnSplices(stack(4, 3, (k) => (k < 2 ? 'W310x97' : 'W310x79'), (k) => (k === 2 ? 15 : 0)))
    expect(s[0]!.kind).toBe('tension')
  })
})

const steel: RectSection = { id: 'S', name: 'W310x79', b: 254, h: 307, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40, material: 'steel', shape: 'W310x79', steelFy: 345, steelFu: 448 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }
function frame() {
  const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.5, 3, 3], section: steel, slabThickness: 150 })
  // heavier columns in the bottom storey, so each stack changes shape at +3.5
  for (const c of m.members.filter((x) => x.role === 'column')) {
    const lo = Math.min(...[c.i, c.j].map((id) => m.nodes.find((n) => n.id === id)!.y))
    if (lo < 1) m.sections.find((s) => s.id === c.section)!.shape = 'W310x97'
  }
  m.loads = buildGravityLoads(m, 1.0, 1.9)
  return m
}

describe('steelElevationBundles + buildSteelFrameElevation — the sheet', () => {
  const m = frame(), d = designStructure(m, soil)!
  const bundles = steelElevationBundles(m, d)
  const marks = connectionMarks(d)

  it('one elevation per grid line that carries steel, every storey on it', () => {
    expect(bundles.map((b) => b.line).sort()).toEqual(['1', '2', '3', 'A', 'B'])
    const a = bundles.find((b) => b.line === 'A')!.input
    expect(a.levels).toEqual([3.5, 6.5, 9.5])
    expect(a.beams).toHaveLength(6)
    expect(a.columns).toHaveLength(9)
  })

  it('every beam end carries the mark the beam schedule and the S-11 sheets carry', () => {
    for (const b of bundles) for (const bm of b.input.beams) {
      const mem = m.members.find((x) => x.id === bm.id)!
      const ends = [markAt(marks, bm.id, mem.i), markAt(marks, bm.id, mem.j)]
      expect([bm.markI, bm.markJ].sort()).toEqual(ends.sort())
      const t = texts(buildSteelFrameElevation(b.input).primitives)
      for (const mk of ends) if (mk !== '—') expect(t).toContain(mk)
    }
  })

  it('a column is drawn at the dimension this plane sees: d along its strong axis, bf across it', () => {
    for (const b of bundles) for (const c of b.input.columns) {
      const s = shapeByName(c.shape)!
      expect([s.d, s.bf]).toContain(c.face)
    }
    // the two directions of the same column disagree — one sees d, the other bf
    const onA = bundles.find((b) => b.line === 'A')!.input.columns[0]!
    const across = bundles.find((b) => b.line === '1')!.input.columns.find((c) => c.id === onA.id)!
    expect(onA.face).not.toBe(across.face)
  })

  it('splices every stack where its shape changes, 1.2 m above the floor; base plates at the feet', () => {
    const a = bundles.find((b) => b.line === 'A')!.input
    expect(a.splices).toHaveLength(3)                        // three column positions on A
    for (const s of a.splices) { expect(s.y).toBeCloseTo(3.5 + SPLICE_ABOVE_FLOOR_M, 9); expect(s.reason).toBe('shape change') }
    expect(a.columns.filter((c) => c.basePlate)).toHaveLength(3)
    const t = texts(buildSteelFrameElevation(a).primitives)
    expect(t).toEqual(expect.arrayContaining(['TOS +3.500', 'TOS +6.500', 'TOS +9.500', 'SPLICE — BEARING', 'BASE PLATE']))
  })

  it('lands in the sheet set under Frame elevations; an RC frame gets none', () => {
    const sheets = buildSheetSet(m, d, soil).filter((s) => s.key.startsWith('steel-elevation-'))
    expect(sheets).toHaveLength(bundles.length)
    expect(sheets.every((s) => s.group === 'Frame elevations')).toBe(true)
    const rc = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section: { ...steel, material: undefined, shape: undefined } })
    rc.loads = buildGravityLoads(rc, 1.0, 1.9)
    expect(steelElevationBundles(rc, designStructure(rc, soil)!)).toEqual([])
  })
})
