import { describe, it, expect } from 'vitest'
import {
  placeStair, stairFrameLoads, bearingStations, planDir, allStairFrameLoads,
  flightSolid, RISER_RANGE, GOING_RANGE, PACE_RANGE, type Vec3,
} from './stairPlacement'
import { stairLoads } from './stair'
import { validateMesh } from './meshValidation'
import type { StructuralModel, Stair } from './model'

const sec = (id: string, h: number) => ({
  id, name: id, b: 300, h, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40,
})

/**
 * Two parallel beams, 3 m apart in plan and 1.5 m apart in level:
 *
 *   LOW  along +Z at x = 0, level 3.00, 500 deep → bears at 3.25
 *   HIGH along +Z at x = 3, level 4.50, 500 deep → bears at 4.75
 *
 * So rise = 1.500 and run = 3.000, and 10 risers make R = 150, G = 300 — a
 * stair whose numbers can be checked in the head.
 */
function frame(over: Partial<Stair> = {}): { model: StructuralModel; stair: Stair } {
  const stair: Stair = {
    id: 'ST1', low: 'bLow', high: 'bHigh', width: 1.2, waist: 150,
    risers: 10, finishes: 1.5, live: 4.8, support: 'simple', ...over,
  }
  const model: StructuralModel = {
    version: 1, name: 'stair test',
    nodes: [
      { id: 'l0', x: 0, y: 3, z: 0 }, { id: 'l1', x: 0, y: 3, z: 4 },
      { id: 'h0', x: 3, y: 4.5, z: 0 }, { id: 'h1', x: 3, y: 4.5, z: 4 },
    ],
    sections: [sec('s500', 500)],
    members: [
      { id: 'bLow', i: 'l0', j: 'l1', section: 's500', role: 'beam' },
      { id: 'bHigh', i: 'h0', j: 'h1', section: 's500', role: 'beam' },
    ],
    plates: [],
    // Every node pinned: `validateMesh` stops at the first unrestrained model
    // and would never reach the stair rules.
    supports: ['l0', 'l1', 'h0', 'h1'].map((node) => ({ node, fixity: 'fixed' as const })),
    loads: [], storeys: [],
    stairs: [stair],
  }
  return { model, stair }
}

describe('placeStair — the geometry follows the frame', () => {
  const { model, stair } = frame()
  const p = placeStair(model, stair)!

  it('takes rise and run from where the supports actually are', () => {
    // Bearing is the TOP of each member, h/2 above the node — the convention
    // the cages are placed by.
    expect(p.rise).toBeCloseTo(1.5, 12)
    expect(p.run).toBeCloseTo(3, 12)
  })

  it('derives R and G so the risers are equal and the geometry closes', () => {
    expect(p.R).toBeCloseTo(150, 12)
    expect(p.G).toBeCloseTo(300, 12)
    // …and it closes: risers × R is the rise, risers × G is the run.
    expect((stair.risers * p.R) / 1000).toBeCloseTo(p.rise, 12)
    expect((stair.risers * p.G) / 1000).toBeCloseTo(p.run, 12)
  })

  it('θ and the slope span agree with that triangle', () => {
    expect(p.thetaDeg).toBeCloseTo((Math.atan2(150, 300) * 180) / Math.PI, 9)
    expect(p.slopeSpan).toBeCloseTo(Math.hypot(3, 1.5), 12)
  })

  it('runs square to the low support, towards the high one', () => {
    // The low beam runs along +Z, so the flight runs along ±X — and towards
    // the support it lands on, not away from it.
    expect(Math.abs(p.runDir[2])).toBeLessThan(1e-12)
    expect(p.runDir[0]).toBeCloseTo(1, 12)
    expect(Math.abs(p.widthDir[0])).toBeLessThan(1e-12)
  })

  it('turns the run round when the high support is on the other side', () => {
    const { model: m2, stair: s2 } = frame()
    m2.nodes = m2.nodes.map((n) => (n.id.startsWith('h') ? { ...n, x: -3 } : n))
    const q = placeStair(m2, s2)!
    expect(q.runDir[0]).toBeCloseTo(-1, 12)
    expect(q.run).toBeCloseTo(3, 12)
  })

  it('puts the waist between the two bearing levels, the stated width across', () => {
    for (const e of [p.lowEdge, p.highEdge]) {
      const w = Math.hypot(e[1][0] - e[0][0], e[1][1] - e[0][1], e[1][2] - e[0][2])
      expect(w).toBeCloseTo(1.2, 12)
    }
    expect(p.lowEdge[0][1]).toBeCloseTo(3.25, 12)
    expect(p.highEdge[0][1]).toBeCloseTo(4.75, 12)
    // and the high edge really is `run` away from the low one, in plan
    const dx = p.highEdge[0][0] - p.lowEdge[0][0], dz = p.highEdge[0][2] - p.lowEdge[0][2]
    expect(Math.hypot(dx, dz)).toBeCloseTo(3, 12)
  })

  it('slides along the support when asked, without changing the climb', () => {
    const f = frame({ offset: 1 })
    const shifted = placeStair(f.model, f.stair)!
    expect(shifted.lowEdge[0][2] - p.lowEdge[0][2]).toBeCloseTo(1, 12)
    expect(shifted.rise).toBeCloseTo(p.rise, 12)
    expect(shifted.run).toBeCloseTo(p.run, 12)
  })

  it('reads as a comfortable stair — 150/300 is 600 on the pace rule', () => {
    expect(p.usable.pace).toBeCloseTo(600, 9)
    expect(p.usable.paceOK && p.usable.riserOK && p.usable.goingOK).toBe(true)
  })

  it('refuses to place what it cannot: no climb, wrong way round, no member', () => {
    const flat = frame()
    flat.model.nodes = flat.model.nodes.map((n) => (n.id.startsWith('h') ? { ...n, y: 3 } : n))
    expect(placeStair(flat.model, flat.stair)).toBeNull()

    const inverted = frame()
    inverted.model.nodes = inverted.model.nodes.map((n) => (n.id.startsWith('h') ? { ...n, y: 1 } : n))
    expect(placeStair(inverted.model, inverted.stair)).toBeNull()

    const gone = frame({ low: 'nope' })
    expect(placeStair(gone.model, gone.stair)).toBeNull()
  })

  it('refuses a support that is vertical in plan — a column carries no flight', () => {
    const col = frame()
    col.model.nodes = col.model.nodes.map((n) => (n.id === 'l1' ? { ...n, x: 0, y: 6, z: 0 } : n))
    expect(placeStair(col.model, col.stair)).toBeNull()
  })

  it('planDir is the plan projection, and says so when there is none', () => {
    expect(planDir([0, 0, 0], [3, 9, 4])).toEqual([0.6, 0, 0.8])
    expect(planDir([1, 0, 1], [1, 5, 1])).toBeNull()
  })
})

describe('bearingStations — a strip, not a point and not the whole member', () => {
  const a: Vec3 = [0, 3, 0], b: Vec3 = [0, 3, 4]

  it('centres the stations on the strip and spaces them evenly', () => {
    const ts = bearingStations(a, b, [0, 3, 2], 1.2)
    expect(ts).toHaveLength(4)
    expect(ts.reduce((s, t) => s + t, 0) / ts.length).toBeCloseTo(0.5, 12)
    const gaps = ts.slice(1).map((t, k) => t - ts[k])
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(1e-12)
    // the strip is 1.2 of 4 m, so it spans 0.3 of the member
    expect(ts[ts.length - 1] - ts[0]).toBeCloseTo(0.3 * 0.75, 12)
  })

  it('follows the strip when it is off-centre', () => {
    const ts = bearingStations(a, b, [0, 3, 1], 1.2)
    expect(ts.reduce((s, t) => s + t, 0) / ts.length).toBeCloseTo(0.25, 12)
  })

  it('never puts load outside the member', () => {
    // A flight hanging off the end of its support is a modelling mistake, but
    // it must not hand the solver a station its shape functions do not cover.
    for (const c of [-5, 0, 4, 9]) {
      for (const t of bearingStations(a, b, [0, 3, c], 3)) {
        expect(t).toBeGreaterThanOrEqual(0)
        expect(t).toBeLessThanOrEqual(1)
      }
    }
  })

  it('a strip wider than the member covers the member, not more', () => {
    const ts = bearingStations(a, b, [0, 3, 2], 40)
    expect(Math.min(...ts)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...ts)).toBeLessThanOrEqual(1)
  })
})

describe('stairFrameLoads — what the flight puts on the frame', () => {
  const { model, stair } = frame()
  const fl = stairFrameLoads(model, stair)!

  it('weighs the flight over its PLAN area, per the slope factor', () => {
    // stairLoads gives kPa of plan area: the waist is t/cosθ thick per plan
    // metre, the treads average R/2, and the finishes are what they are.
    const q = stairLoads({ t: 150, R: 150, G: 300, finishes: 1.5, live: 4.8 })
    expect(q.waist).toBeCloseTo((24 * 0.15) / Math.cos(Math.atan2(150, 300)), 9)
    expect(q.steps).toBeCloseTo(1.8, 9)
    const area = 3 * 1.2
    expect(fl.totalD).toBeCloseTo(q.dead * area, 9)
    expect(fl.totalL).toBeCloseTo(4.8 * area, 9)
  })

  it('delivers all of it, and half to each support', () => {
    const sum = (member: string, cat: 'D' | 'L') => fl.loads
      .filter((l) => l.kind === 'member-point' && l.member === member && l.cat === cat)
      .reduce((s, l) => s + (l as { P: number }).P, 0)
    expect(sum('bLow', 'D') + sum('bHigh', 'D')).toBeCloseTo(fl.totalD, 9)
    expect(sum('bLow', 'L') + sum('bHigh', 'L')).toBeCloseTo(fl.totalL, 9)
    // A uniformly loaded flight halves by symmetry, whatever its end fixity.
    expect(sum('bLow', 'D')).toBeCloseTo(sum('bHigh', 'D'), 9)
  })

  it('the resultant lands at the centroid of the bearing strip', () => {
    // What the point loads are FOR: the total and the split are exact, and the
    // line of action is right, which a single load at midspan would not be.
    const pts = fl.loads.filter((l) => l.kind === 'member-point' && l.member === 'bLow' && l.cat === 'D')
    const t = pts.reduce((s, l) => s + (l as { t: number; P: number }).t * (l as { P: number }).P, 0)
      / pts.reduce((s, l) => s + (l as { P: number }).P, 0)
    expect(t).toBeCloseTo(0.5, 9)                 // the flight is centred on a 4 m support
  })

  it('is spread across the width rather than dropped on one point', () => {
    const pts = fl.loads.filter((l) => l.kind === 'member-point' && l.member === 'bLow' && l.cat === 'D')
    expect(pts.length).toBeGreaterThan(1)
    expect(new Set(pts.map((l) => (l as { t: number }).t)).size).toBe(pts.length)
  })

  it('a flight that cannot be placed puts no load anywhere', () => {
    const bad = frame({ high: 'nope' })
    expect(stairFrameLoads(bad.model, bad.stair)).toBeNull()
    expect(allStairFrameLoads(bad.model)).toEqual([])
  })

  it('a model with no stairs is untouched', () => {
    const none = frame()
    delete none.model.stairs
    expect(allStairFrameLoads(none.model)).toEqual([])
  })
})

describe('stair validation — a broken model stops, an odd stair warns', () => {
  const codesOf = (m: StructuralModel) => validateMesh(m).filter((i) => i.code.startsWith('STAIR'))

  it('a well-formed flight raises nothing', () => {
    expect(codesOf(frame().model)).toEqual([])
  })

  it('names a support that is not in the model', () => {
    const { model } = frame({ high: 'ghost' })
    const [i] = codesOf(model)
    expect(i.code).toBe('STAIR_MISSING_MEMBER')
    expect(i.severity).toBe('error')
    expect(i.message).toContain('ghost')
  })

  it('rejects a flight with fewer than two risers, or no width', () => {
    expect(codesOf(frame({ risers: 1 }).model)[0].code).toBe('STAIR_RISERS')
    expect(codesOf(frame({ width: 0 }).model)[0].code).toBe('STAIR_WIDTH')
  })

  it('says WHY an unplaceable flight cannot be placed', () => {
    const flat = frame()
    flat.model.nodes = flat.model.nodes.map((n) => (n.id.startsWith('h') ? { ...n, y: 3 } : n))
    const [i] = codesOf(flat.model)
    expect(i.code).toBe('STAIR_UNPLACEABLE')
    expect(i.message).toMatch(/same level|named as the lower/)

    const col = frame()
    col.model.nodes = col.model.nodes.map((n) => (n.id === 'l1' ? { ...n, x: 0, y: 6, z: 0 } : n))
    expect(codesOf(col.model)[0].message).toMatch(/vertical in plan/)
  })

  it('catches supports that are not parallel — the run would miss', () => {
    const skew = frame()
    skew.model.nodes = skew.model.nodes.map((n) => (n.id === 'h1' ? { ...n, x: 5 } : n))
    const i = codesOf(skew.model).find((x) => x.code === 'STAIR_SUPPORTS_SKEW')!
    expect(i.severity).toBe('error')
  })

  it('WARNS, and does not stop, on a stair that is merely uncomfortable', () => {
    // 4 risers over 1.5 m is a 375 mm riser — placeable, walkable by nobody.
    const steep = codesOf(frame({ risers: 4 }).model)
    expect(steep.every((i) => i.severity === 'warning')).toBe(true)
    expect(steep.map((i) => i.code)).toContain('STAIR_RISER_UNUSUAL')
    expect(steep.map((i) => i.code)).toContain('STAIR_PACE')
  })

  it('the usability ranges are stated as rules of thumb, not as clauses', () => {
    const i = codesOf(frame({ risers: 4 }).model).find((x) => x.code === 'STAIR_PACE')!
    expect(i.message).toContain('not a code clause')
    expect(RISER_RANGE[0]).toBeLessThan(RISER_RANGE[1])
    expect(GOING_RANGE[0]).toBeLessThan(GOING_RANGE[1])
    expect(PACE_RANGE[0]).toBeLessThan(PACE_RANGE[1])
  })
})

describe('flightSolid — the flight as something you can draw', () => {
  const { model, stair } = frame()
  const p = placeStair(model, stair)!
  const solid = flightSolid(p)

  it('measures the waist NORMAL to the soffit, not vertically', () => {
    // The one thing this drawing exists to show. Measured vertically the slab
    // is t/cosθ thick and every face built off it leans.
    const slope: Vec3 = [
      p.highEdge[0][0] - p.lowEdge[0][0],
      p.highEdge[0][1] - p.lowEdge[0][1],
      p.highEdge[0][2] - p.lowEdge[0][2],
    ]
    const dot = solid.normal[0] * slope[0] + solid.normal[1] * slope[1] + solid.normal[2] * slope[2]
    expect(dot).toBeCloseTo(0, 9)                                   // ⟂ to the soffit
    const across = solid.normal[0] * p.widthDir[0] + solid.normal[2] * p.widthDir[2]
    expect(across).toBeCloseTo(0, 9)                                // …and to the width
    expect(solid.normal[1]).toBeGreaterThan(0)                      // up out of the slab
  })

  it('the prism is exactly the waist thick, everywhere', () => {
    for (let i = 0; i < 4; i++) {
      const d = Math.hypot(
        solid.top[i][0] - solid.bottom[i][0],
        solid.top[i][1] - solid.bottom[i][1],
        solid.top[i][2] - solid.bottom[i][2],
      )
      expect(d).toBeCloseTo(0.15, 12)
    }
    // …and the vertical thickness is the larger t/cosθ, which is what makes
    // the flight heavier per plan metre than a flat slab of the same t.
    const vert = solid.top[0][1] - solid.bottom[0][1]
    expect(vert).toBeCloseTo(0.15 * Math.cos((p.thetaDeg * Math.PI) / 180), 9)
  })

  it('the top face is the four bearing corners, in order round the flight', () => {
    expect(solid.top[0]).toEqual(p.lowEdge[0])
    expect(solid.top[1]).toEqual(p.lowEdge[1])
    expect(solid.top[2]).toEqual(p.highEdge[1])
    expect(solid.top[3]).toEqual(p.highEdge[0])
  })

  it('centres each tread on the flight, not on one edge of it', () => {
    // A renderer builds a box centred on its origin, so a step positioned by a
    // CORNER comes out half off the side of the waist — which is what the
    // projected view showed before this.
    const mid: Vec3 = [
      (p.lowEdge[0][0] + p.lowEdge[1][0]) / 2,
      (p.lowEdge[0][1] + p.lowEdge[1][1]) / 2,
      (p.lowEdge[0][2] + p.lowEdge[1][2]) / 2,
    ]
    const off = (q: Vec3) => (q[0] - mid[0]) * p.widthDir[0] + (q[2] - mid[2]) * p.widthDir[2]
    for (const st of solid.steps) expect(off(st.at)).toBeCloseTo(0, 9)
  })

  it('lays one tread per going, climbing one riser each', () => {
    expect(solid.steps).toHaveLength(stair.risers)
    solid.steps.forEach((st, i) => {
      expect(st.rise).toBeCloseTo(p.R / 1000, 12)
      expect(st.run).toBeCloseTo(p.G / 1000, 12)
      expect(st.at[1]).toBeCloseTo(p.lowEdge[0][1] + (i * p.R) / 1000, 9)
    })
    // the last tread arrives at the top bearing level
    const last = solid.steps[solid.steps.length - 1]
    expect(last.at[1] + last.rise).toBeCloseTo(p.highEdge[0][1], 9)
  })

  it('every tread sits ON the waist — its footprint is inside the slab, exactly', () => {
    // Definitive where an isometric is only suggestive: put each tread's four
    // base corners into the flight's own run/width coordinates and check they
    // land inside the waist's top face.
    const o = p.lowEdge[0]
    const uv = (q: Vec3) => {
      const d: Vec3 = [q[0] - o[0], q[1] - o[1], q[2] - o[2]]
      return {
        u: d[0] * p.runDir[0] + d[2] * p.runDir[2],
        v: d[0] * p.widthDir[0] + d[2] * p.widthDir[2],
      }
    }
    for (const st of solid.steps) {
      for (const du of [0, st.run]) for (const dv of [-st.width / 2, st.width / 2]) {
        const c: Vec3 = [
          st.at[0] + p.runDir[0] * du + p.widthDir[0] * dv,
          st.at[1],
          st.at[2] + p.runDir[2] * du + p.widthDir[2] * dv,
        ]
        const { u, v } = uv(c)
        expect(u).toBeGreaterThanOrEqual(-1e-9)
        expect(u).toBeLessThanOrEqual(p.run + 1e-9)
        expect(v).toBeGreaterThanOrEqual(-1e-9)
        expect(v).toBeLessThanOrEqual(p.width + 1e-9)
      }
    }
  })

  it('every tread sits between the two supports, never past them', () => {
    for (const st of solid.steps) {
      const along = (st.at[0] - p.lowEdge[0][0]) * p.runDir[0] + (st.at[2] - p.lowEdge[0][2]) * p.runDir[2]
      expect(along).toBeGreaterThanOrEqual(-1e-9)
      expect(along + st.run).toBeLessThanOrEqual(p.run + 1e-9)
    }
  })
})
