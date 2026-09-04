import { describe, it, expect } from 'vitest'
import {
  crossSectionPlane, memberCut, cutCage, cutCages, cutPrimitives, cutBounds, type CageCut,
} from './cageSection'
import { buildBeamCage, type BeamCageInput } from './beamCage'
import { buildColumnCage, perimeterBars, barInset, type ColumnCageInput } from './columnCage'
import type { RebarCage, Vec3 } from './rebarModel'

// ─────────────────────────────────────────────────────────────────────────
// The two cages the rest of the app draws, cut where a detail would cut them.
//
//   BEAM   6 m, 300×550, ⌀20 mains, ⌀12 stirrups, soffit at y = 3, running
//          east from the origin. Six bars each face.
//   COLUMN 400×600, ⌀20 verticals × 12, ⌀12 ties, 0 → 3 m at the origin.
// ─────────────────────────────────────────────────────────────────────────
const beam: BeamCageInput = {
  mark: 'B1', L: 6, colBLeft: 400, colBRight: 400,
  b: 300, h: 550, cover: 40, barDia: 20, stirrupDia: 12,
  topBars: 6, botBars: 6, sEnd: 100, sMid: 200,
  continuousLeft: true, continuousRight: true,
  axis: { x0: 0, z0: 0, x1: 6, z1: 0 }, ySoffit: 3,
}
const beamCage = buildBeamCage(beam)

const col: ColumnCageInput = {
  mark: 'C1', b: 400, h: 600, cover: 40,
  barDia: 20, bars: 12, tieDia: 12,
  sConfined: 100, sOutside: 150, lo: 600,
  centre: [0, 0], yBottom: 0, yTop: 3,
}
const colCage = buildColumnCage(col)

describe('crossSectionPlane — which way the section is read', () => {
  it('reads a vertical member as a plan, x across and z down the page', () => {
    const p = crossSectionPlane([0, 1, 0])
    expect(p.u).toEqual([1, 0, 0])
    expect(p.v).toEqual([0, 0, 1])
  })

  it('reads a beam on end, with the world\'s down as the page\'s down', () => {
    // So the top steel of a beam is at the TOP of its section drawing — the
    // one thing a section must never get the wrong way up.
    const p = crossSectionPlane([1, 0, 0])
    expect(p.v).toEqual([0, -1, 0])
    expect(Math.abs(p.u[1])).toBeLessThan(1e-9)     // across the span, level
  })
})

describe('cutting a beam cage at midspan', () => {
  const cut = memberCut([0, 3, 0], [6, 3, 0], 0.5)
  const res = cutCage(beamCage, cut)

  it('finds a stirrup there, and draws the cage\'s own bar', () => {
    expect(res.ties.length).toBeGreaterThan(0)
    expect(res.station).not.toBeNull()
    expect(res.station!).toBeLessThan(0.2)          // within a stirrup spacing
    // Every drawn tie is ⌀12 transverse steel, not a main bar that happened to
    // lie flat: the classification is geometric, so this is a real check.
    expect(res.ties.every((t) => t.dia === beam.stirrupDia)).toBe(true)
    expect(res.ties.every((t) => t.role === 'stirrup')).toBe(true)
  })

  it('draws the stirrup as the cage bends it — hooks and all', () => {
    // `runPolylines` gives the drawn geometry: a closed tie leaves the loop at
    // corner 0 with a 135° hook at each end (§425.3.2), so the section shows
    // the two tails. A rectangle of four points would be the old drawing.
    const t = res.ties[0]!
    expect(t.pts.length).toBeGreaterThan(8)
    const us = t.pts.map((p) => p[0]), vs = t.pts.map((p) => p[1])
    // It spans the cover line of a 300×550 beam: 300 − 2(40 + 12/2) = 208 wide,
    // 550 − 2(46) = 458 deep, plus the hook tails that reach into the core.
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(0.208, 3)
    expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(0.458, 3)
  })

  it('cuts the bottom steel at midspan, at the depth the cage put it', () => {
    const bot = res.bars.filter((b) => b.role === 'bottom')
    expect(bot.length).toBeGreaterThanOrEqual(2)
    // inset = 40 + 12 + 20/2 = 62 mm off the soffit; the page's v is −y and the
    // cut's origin is at the beam's own axis (y = 3, the soffit).
    expect(Math.min(...bot.map((b) => b.v))).toBeCloseTo(-0.062, 4)
    expect(bot.every((b) => b.dia === beam.barDia)).toBe(true)
  })

  it('cuts each bar ONCE — a bar that ends on the plane is not counted twice', () => {
    // Every longitudinal run crossing midspan contributes exactly one dot, so
    // the count is the number of runs that reach it and not a multiple of it.
    const reaching = beamCage.runs.filter((r) =>
      r.role !== 'stirrup' && Math.min(...r.path.map((p) => p[0])) < 3
        && Math.max(...r.path.map((p) => p[0])) > 3).length
    expect(res.bars.length).toBe(reaching)
  })

  it('shows the support steel at a support and not at midspan', () => {
    const atFace = cutCage(beamCage, memberCut([0, 3, 0], [6, 3, 0], 0.02))
    expect(atFace.bars.filter((b) => b.role === 'top').length)
      .toBeGreaterThan(res.bars.filter((b) => b.role === 'top').length)
  })

  it('is never more than half a spacing from a stirrup, inside the stirrup zone', () => {
    // What a section drawing needs is that the set it shows is the set that is
    // really there — so anywhere BETWEEN the first and last stirrup the cut can
    // be at most half the widest spacing (sMid 200) from one.
    //
    // Outside that zone it can be further, and legitimately is: the cage stops
    // its stirrups short of the support centreline, so a cut on the grid line
    // is 250 mm from the nearest. That is the cage's arrangement, not a defect
    // of the cut, and a test that forbade it would be asserting the wrong
    // thing.
    const xs = beamCage.runs.filter((r) => r.role === 'stirrup').map((r) => r.path[0][0])
    const lo = Math.min(...xs), hi = Math.max(...xs)
    for (let k = 0; k <= 60; k++) {
      const x = (6 * k) / 60
      if (x < lo || x > hi) continue
      const st = cutCage(beamCage, memberCut([0, 3, 0], [6, 3, 0], x / 6)).station!
      expect(st).toBeLessThanOrEqual(beam.sMid / 2000 + 1e-6)
    }
  })
})

describe('cutting a column cage', () => {
  const cut = memberCut([0, 0, 0], [0, 3, 0], 0.5)
  const res = cutCage(colCage, cut)

  it('cuts every vertical bar the cage placed, once each', () => {
    const verticals = colCage.runs.filter((r) => r.role === 'vertical'
      && Math.min(...r.path.map((p) => p[1])) < 1.5 && Math.max(...r.path.map((p) => p[1])) > 1.5)
    expect(res.bars).toHaveLength(verticals.length)
    expect(res.bars.length).toBeGreaterThanOrEqual(12)
  })

  it('puts them exactly where `perimeterBars` says, not on a second layout', () => {
    // This is the whole point of the module. `columnSection` drew its own
    // nx/ny bar split, so the section could disagree with the cage; the cut
    // cannot, because it is reading the cage.
    const want = perimeterBars(col)
      .map(([dx, dz]) => `${(dx / 1000).toFixed(4)},${(dz / 1000).toFixed(4)}`).sort()
    const got = res.bars.map((b) => `${b.u.toFixed(4)},${b.v.toFixed(4)}`).sort()
    expect(got).toEqual(want)
  })

  it('the corner bars sit at the bar inset off each face', () => {
    const ins = barInset(col.cover, col.tieDia, col.barDia) / 1000
    expect(Math.max(...res.bars.map((b) => b.u))).toBeCloseTo(col.h / 2000 - ins, 6)
    expect(Math.max(...res.bars.map((b) => b.v))).toBeCloseTo(col.b / 2000 - ins, 6)
  })

  it('draws the whole tie set — the hoop AND the cross ties threaded through it', () => {
    // A set is NOT co-planar. The hoop and its cross ties rest on one another,
    // so the cage stacks them a tie diameter apart (`stackAt`) — drawn all at
    // one y they would interpenetrate at every shared corner. Taking only the
    // runs at exactly the nearest level therefore returns whichever member of
    // the set landed closest and drops the others: a column section drawn with
    // a cross tie and no hoop around it.
    expect(res.ties.length).toBeGreaterThan(1)
    expect(res.ties.every((t) => t.dia === col.tieDia)).toBe(true)
    // Every drawn bar belongs to ONE placed set — the mark carries the level
    // index, C1-T7 and C1-X7.1 being the hoop and a cross tie of set 7.
    const setOf = (mark: string) => /-[A-Z](\d+)/.exec(mark)?.[1]
    expect(new Set(res.ties.map((t) => setOf(t.mark))).size).toBe(1)
    // …and it is the complete set: the cage placed exactly these runs at it.
    const k = setOf(res.ties[0]!.mark)
    const placed = colCage.runs.filter((r) => r.role === 'tie' && setOf(r.mark) === k)
    expect(res.ties).toHaveLength(placed.length)
    // Stacked, so they span the set's own thickness and no more.
    const offs = res.ties.map((t) => t.offset)
    expect(Math.max(...offs) - Math.min(...offs))
      .toBeLessThanOrEqual((placed.length * col.tieDia) / 1000 + 1e-9)
  })

  it('shows the JOINT hoops where the ties stop — §418.8.3.1', () => {
    const withJoint = buildColumnCage({ ...col, jointGaps: [[2.4, 2.9]] })
    const inJoint = cutCage(withJoint, memberCut([0, 0, 0], [0, 3, 0], 2.65 / 3))
    expect(inJoint.ties.length).toBeGreaterThan(0)
    expect(inJoint.ties.every((t) => t.role === 'hoop')).toBe(true)
  })

  it('a `reach` band takes every set in it, not just the nearest', () => {
    const wide = cutCage(colCage, { ...cut, reach: 0.35 })
    expect(wide.ties.length).toBeGreaterThan(res.ties.length)
    expect(new Set(wide.ties.map((t) => t.offset.toFixed(6))).size).toBeGreaterThan(1)
  })
})

describe('the cut as something a sheet can paint', () => {
  const res = cutCage(colCage, memberCut([0, 0, 0], [0, 3, 0], 0.5))

  it('paints ties under bars, so a bar reads as restrained by its tie', () => {
    const P = cutPrimitives(res)
    const firstBar = P.findIndex((p) => p.kind === 'circle')
    const lastTie = P.map((p) => p.kind).lastIndexOf('path')
    expect(lastTie).toBeLessThan(firstBar)
  })

  it('draws a bar at its own diameter, and never smaller than asked', () => {
    const P = cutPrimitives(res, { minBarRadius: 0.02 })
    const r = P.filter((p) => p.kind === 'circle').map((p) => (p as { r: number }).r)
    expect(Math.min(...r)).toBeCloseTo(0.02, 9)
    expect(cutPrimitives(res).filter((p) => p.kind === 'circle')
      .every((p) => Math.abs((p as { r: number }).r - 0.01) < 1e-9)).toBe(true)
  })

  it('bounds the section it drew', () => {
    const bb = cutBounds(res)!
    expect(bb.maxU - bb.minU).toBeGreaterThan(0.3)     // the 600 face, less cover
    expect(bb.maxU - bb.minU).toBeLessThan(0.6)
    expect(cutBounds({ bars: [], ties: [], station: null })).toBeNull()
  })
})

describe('cutting more than one cage at once', () => {
  it('is the union, with the nearest station of the two', () => {
    const cut: CageCut = memberCut([0, 3, 0], [6, 3, 0], 0.5)
    const both = cutCages([beamCage, colCage], cut)
    const a = cutCage(beamCage, cut), b = cutCage(colCage, cut)
    expect(both.bars).toHaveLength(a.bars.length + b.bars.length)
    expect(both.station).toBeCloseTo(Math.min(a.station!, b.station!), 9)
  })

  it('reports no station for a cage with no transverse steel', () => {
    const bare: RebarCage = {
      member: 'X',
      runs: [{ mark: 'X1', dia: 20, role: 'bottom', member: 'X', bendDia: [], count: 1,
        path: [[0, 0, 0], [6, 0, 0]] as Vec3[] }],
    }
    const r = cutCage(bare, memberCut([0, 0, 0], [6, 0, 0], 0.5))
    expect(r.station).toBeNull()
    expect(r.bars).toHaveLength(1)
    expect(r.ties).toHaveLength(0)
  })
})
