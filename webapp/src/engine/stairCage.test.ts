import { describe, it, expect } from 'vitest'
import { buildStairCage, acrossLines, continuousEnds } from './stairCage'
import { placeStair, flightSolid, type PlacedStair } from './stairPlacement'
import type { StructuralModel, Stair } from './model'
import type { RebarRun } from './rebarModel'

const sec = { id: 's500', name: 's500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }

/** The same head-checkable frame the placement tests use: rise 1.5, run 3.0. */
function placed(over: Partial<Stair> = {}): PlacedStair {
  const stair: Stair = {
    id: 'ST1', low: 'bLow', high: 'bHigh', width: 1.2, waist: 200,
    risers: 10, finishes: 1.5, live: 4.8, support: 'simple', ...over,
  }
  const model: StructuralModel = {
    version: 1, name: 't',
    nodes: [
      { id: 'l0', x: 0, y: 3, z: 0 }, { id: 'l1', x: 0, y: 3, z: 4 },
      { id: 'h0', x: 3, y: 4.5, z: 0 }, { id: 'h1', x: 3, y: 4.5, z: 4 },
    ],
    sections: [sec],
    members: [
      { id: 'bLow', i: 'l0', j: 'l1', section: 's500', role: 'beam' },
      { id: 'bHigh', i: 'h0', j: 'h1', section: 's500', role: 'beam' },
    ],
    plates: [], supports: [], loads: [], storeys: [], stairs: [stair],
  }
  return placeStair(model, stair)!
}

const cage = (over: Partial<Stair> = {}, opts: Partial<Parameters<typeof buildStairCage>[0]> = {}) =>
  buildStairCage({
    mark: 'ST1', placed: placed(over), cover: 20, mainDia: 12, distDia: 10,
    mainSpacing: 150, distSpacing: 250, support: over.support ?? 'simple', ...opts,
  })

const len = (r: RebarRun) => r.path.slice(1).reduce((L, p, k) =>
  L + Math.hypot(p[0] - r.path[k][0], p[1] - r.path[k][1], p[2] - r.path[k][2]), 0)

describe('acrossLines — bars over the flight width', () => {
  it('spreads them evenly inside the cover', () => {
    const v = acrossLines(1.2, 150, 0.02)          // 1.16 usable at 150 → 8 bars
    expect(v).toHaveLength(8)
    expect(Math.min(...v)).toBeGreaterThan(-0.58)
    expect(Math.max(...v)).toBeLessThan(0.58)
    const gaps = v.slice(1).map((x, k) => x - v[k])
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(1e-12)
  })

  it('is symmetric about the flight centreline', () => {
    const v = acrossLines(1.2, 150, 0.02)
    expect(v.reduce((s, x) => s + x, 0)).toBeCloseTo(0, 12)
  })

  it('gives at least one bar, and none across nothing', () => {
    expect(acrossLines(0.1, 300, 0.02)).toHaveLength(1)
    expect(acrossLines(0.04, 150, 0.02)).toHaveLength(0)
    expect(acrossLines(1.2, 0, 0.02)).toHaveLength(0)
  })
})

describe('continuousEnds — which end carries top steel', () => {
  it('simple has none, both-ends has both', () => {
    expect(continuousEnds('simple')).toEqual({ low: false, high: false })
    expect(continuousEnds('both-ends')).toEqual({ low: true, high: true })
  })

  it('one-end is continuous at the TOP — the flight runs on into the floor', () => {
    expect(continuousEnds('one-end')).toEqual({ low: false, high: true })
  })
})

describe('stair cage — the steel in a flight', () => {
  const c = cage()

  it('lays main bars up the slope and distribution bars across them', () => {
    const main = c.runs.filter((r) => r.mark.includes('-MB'))
    const dist = c.runs.filter((r) => r.mark.includes('-DB'))
    expect(main.length).toBe(8)                                  // 1.16 m at 150
    expect(dist.length).toBeGreaterThan(0)
    expect(c.runs.every((r) => r.member === 'ST1')).toBe(true)
    expect(new Set(c.runs.map((r) => r.mark)).size).toBe(c.runs.length)
  })

  it('the main bars run the whole flight and turn up into both beams', () => {
    const p = placed()
    for (const r of c.runs.filter((x) => x.mark.includes('-MB'))) {
      expect(r.path).toHaveLength(4)                             // hook, end, end, hook
      expect(r.bendDia).toHaveLength(2)
      // the straight middle is the slope span plus an embedment each end
      const mid = Math.hypot(
        r.path[2][0] - r.path[1][0], r.path[2][1] - r.path[1][1], r.path[2][2] - r.path[1][2])
      expect(mid).toBeCloseTo(p.slopeSpan + 2 * 0.15, 9)
    }
  })

  it('cover is measured NORMAL to the soffit, like the waist itself', () => {
    // Measured vertically it would be t/cosθ on a slope, and the bar would sit
    // proud of the face it is meant to be buried under.
    const p = placed()
    const solid = flightSolid(p)
    const r = c.runs.find((x) => x.mark.includes('-MB'))!
    // distance from the bar to the flight's TOP surface, along the normal
    const d = solid.top[0]
    const v = [r.path[1][0] - d[0], r.path[1][1] - d[1], r.path[1][2] - d[2]]
    const alongNormal = -(v[0] * solid.normal[0] + v[1] * solid.normal[1] + v[2] * solid.normal[2])
    // bottom layer: waist − cover − half a bar below the top face
    expect(alongNormal).toBeCloseTo(0.2 - 0.02 - 0.006, 6)
  })

  it('a simply supported flight gets NO top steel, and says why', () => {
    expect(c.runs.some((r) => r.role === 'top')).toBe(false)
    expect(c.notes?.some((n) => /simply supported/.test(n))).toBe(true)
  })

  it('continuity puts top steel over that end and nowhere else', () => {
    const one = cage({ support: 'one-end' })
    const tops = one.runs.filter((r) => r.mark.includes('-TH'))
    expect(tops.length).toBe(8)
    expect(one.runs.some((r) => r.mark.includes('-TL'))).toBe(false)
    const both = cage({ support: 'both-ends' })
    expect(both.runs.some((r) => r.mark.includes('-TL'))).toBe(true)
    expect(both.runs.some((r) => r.mark.includes('-TH'))).toBe(true)
  })

  it('the top steel runs a quarter of the span in from the support', () => {
    const p = placed({ support: 'both-ends' })
    const both = cage({ support: 'both-ends' })
    const r = both.runs.find((x) => x.mark.includes('-TL'))!
    expect(len(r)).toBeCloseTo(0.25 * p.slopeSpan + 0.15, 9)
    const short = cage({ support: 'both-ends' }, { topReach: 0.15 })
    expect(len(short.runs.find((x) => x.mark.includes('-TL'))!)).toBeLessThan(len(r))
  })

  it('distribution steel sits INSIDE the main bars, so the main bars keep the larger d', () => {
    const solid = flightSolid(placed())
    // Measured at the BAR, not at the hook tip: a main bar's path starts with
    // the 90° return turned up into the beam, which sits nearer the top face
    // than the bar it anchors.
    const depthAt = (q: readonly number[]) => {
      const d = solid.top[0]
      const v = [q[0] - d[0], q[1] - d[1], q[2] - d[2]]
      return -(v[0] * solid.normal[0] + v[1] * solid.normal[1] + v[2] * solid.normal[2])
    }
    const main = c.runs.find((r) => r.mark.includes('-MB'))!
    const dist = c.runs.find((r) => r.mark.includes('-DB'))!
    const depth = (r: RebarRun) => depthAt(r.mark.includes('-MB') ? r.path[1] : r.path[0])
    expect(depth(dist)).toBeLessThan(depth(main))                 // nearer the top = further from the soffit
  })

  it('ties the top mat only where there IS a top mat to tie', () => {
    expect(c.runs.some((r) => r.mark.includes('-DT'))).toBe(false)     // simple: none
    const both = cage({ support: 'both-ends' })
    const dt = both.runs.filter((r) => r.mark.includes('-DT'))
    const db = both.runs.filter((r) => r.mark.includes('-DB'))
    expect(dt.length).toBeGreaterThan(0)
    expect(dt.length).toBeLessThan(db.length)                          // only over the ends
  })

  it('every bar is inside the flight it belongs to', () => {
    const p = placed()
    const solid = flightSolid(p)
    for (const r of cage({ support: 'both-ends' }).runs) {
      for (const q of r.path) {
        // `solid.top[0]` is a CORNER of the flight, so `across` runs 0…width
        // from that edge rather than ±half about the centreline.
        const v = [q[0] - solid.top[0][0], q[1] - solid.top[0][1], q[2] - solid.top[0][2]]
        const depth = -(v[0] * solid.normal[0] + v[1] * solid.normal[1] + v[2] * solid.normal[2])
        expect(depth).toBeGreaterThan(-1e-6)                 // never above the top face
        expect(depth).toBeLessThan(p.waist / 1000 + 1e-6)    // never below the soffit
        const across = v[0] * p.widthDir[0] + v[2] * p.widthDir[2]
        expect(across).toBeGreaterThanOrEqual(-1e-6)
        expect(across).toBeLessThanOrEqual(p.width + 1e-6)
      }
    }
  })

  it('says so when the waist cannot hold the cage drawn in it', () => {
    const thin = buildStairCage({
      mark: 'ST1', placed: placed({ waist: 60 }), cover: 20,
      mainDia: 12, distDia: 10, mainSpacing: 150, distSpacing: 250, support: 'simple',
    })
    expect(thin.notes?.some((n) => /thinner than/.test(n))).toBe(true)
  })
})

// ── the cage of a flight WITH a half-landing ──────────────────────────────
//
// The same fixture pushed 4.2 m apart in plan, so a 1.2 m landing still leaves
// a 3.0 m flight. Everything here is measured in the flight's own plane —
// `u` along the run from the LOW BEARING edge, `h` above that bearing level —
// because that is the only frame in which "is this bar inside the concrete?"
// is a question with an answer.
function placedL(over: Partial<Stair> = {}): PlacedStair {
  const stair: Stair = {
    id: 'ST1', low: 'bLow', high: 'bHigh', width: 1.2, waist: 200,
    risers: 10, finishes: 1.5, live: 4.8, support: 'simple',
    landings: [{ at: 'low', depth: 1.2 }], ...over,
  }
  const model: StructuralModel = {
    version: 1, name: 't',
    nodes: [
      { id: 'l0', x: 0, y: 3, z: 0 }, { id: 'l1', x: 0, y: 3, z: 4 },
      { id: 'h0', x: 4.2, y: 4.5, z: 0 }, { id: 'h1', x: 4.2, y: 4.5, z: 4 },
    ],
    sections: [sec],
    members: [
      { id: 'bLow', i: 'l0', j: 'l1', section: 's500', role: 'beam' },
      { id: 'bHigh', i: 'h0', j: 'h1', section: 's500', role: 'beam' },
    ],
    plates: [], supports: [], loads: [], storeys: [], stairs: [stair],
  }
  return placeStair(model, stair)!
}
const cageL = (over: Partial<Stair> = {}, opts: Partial<Parameters<typeof buildStairCage>[0]> = {}) =>
  buildStairCage({
    mark: 'ST1', placed: placedL(over), cover: 20, mainDia: 12, distDia: 10,
    mainSpacing: 150, distSpacing: 250, support: over.support ?? 'simple', ...opts,
  })

/** A reader for one placed stair: model space → the flight's own (u, h). */
function planeOf(p: PlacedStair) {
  const o = [(p.bearLow[0][0] + p.bearLow[1][0]) / 2, p.bearLow[0][1], (p.bearLow[0][2] + p.bearLow[1][2]) / 2]
  const th = (p.thetaDeg * Math.PI) / 180
  const uLo = p.landings.find((l) => l.at === 'low')?.depth ?? 0
  const uHi = p.run - (p.landings.find((l) => l.at === 'high')?.depth ?? 0)
  const tOf = (l?: { thickness: number }) => (l?.thickness ?? p.waist) / 1000
  const tLo = tOf(p.landings.find((l) => l.at === 'low'))
  const tHi = tOf(p.landings.find((l) => l.at === 'high'))
  const t = p.waist / 1000
  return {
    uLo, uHi,
    u: (q: readonly [number, number, number]) =>
      (q[0] - o[0]) * p.runDir[0] + (q[2] - o[2]) * p.runDir[2],
    h: (q: readonly [number, number, number]) => q[1] - o[1],
    /** cosθ of the face at `u` — 1 on a flat landing, cosθ on the slope. A
     *  VERTICAL clearance times this is the clearance NORMAL to the face, which
     *  is what cover means. */
    cosAt: (u: number) => (u <= uLo || u >= uHi ? 1 : Math.cos(th)),
    /** [soffit, top] heights of the concrete at `u`, relative to the bearing. */
    band: (u: number): [number, number] => {
      if (u <= uLo) return [-tLo, 0]
      if (u >= uHi) return [p.rise - tHi, p.rise]
      const top = (u - uLo) * Math.tan(th)
      return [top - t / Math.cos(th), top]
    },
  }
}

describe('a flight with a half-landing — the cage through the kinks', () => {
  it('keeps every bar inside the concrete, at exactly its cover and no closer', () => {
    // The check the 2D detail needed and did not have: 450 mm straight out of a
    // landing's top face leaves the soffit long before it is developed.
    for (const lands of [
      [{ at: 'low' as const, depth: 1.2 }],
      [{ at: 'high' as const, depth: 1.2 }],
      [{ at: 'low' as const, depth: 1.2 }, { at: 'high' as const, depth: 1.0 }],
    ]) {
      const p = placedL({ landings: lands })
      const pl = planeOf(p)
      let seen = 0, tightest = Infinity
      for (const r of cageL({ landings: lands }).runs) {
        for (const q of r.path) {
          const u = pl.u(q)
          if (u < 1e-9 || u > p.run - 1e-9) continue          // the tails are in the beams
          const [lo, hi] = pl.band(u)
          const h = pl.h(q)
          expect(h).toBeGreaterThanOrEqual(lo - 1e-9)
          expect(h).toBeLessThanOrEqual(hi + 1e-9)
          // Cover is measured NORMAL to the face, so a vertical gap on the
          // slope is the cover divided by cosθ — 26 mm of cover reads as 32.5
          // vertically on this flight. Compared vertically the check would pass
          // a bar 26 mm from the face measured the wrong way.
          tightest = Math.min(tightest, (h - lo) * pl.cosAt(u), (hi - h) * pl.cosAt(u))
          seen++
        }
      }
      expect(seen).toBeGreaterThan(80)                        // not vacuously true
      // …and the tightest point is the cover itself: 20 + ⌀12/2, exactly.
      expect(tightest).toBeCloseTo(0.026, 9)
    }
  })

  it('does not double the steel — one bar of each layer crosses the flight', () => {
    // Four bars per line where there are two kinks, but they are two bars cut
    // and lapped, not four running side by side. Anything else would be steel
    // the design never asked for.
    const p = placedL({ landings: [{ at: 'low', depth: 1.2 }, { at: 'high', depth: 1.0 }] })
    const pl = planeOf(p)
    const mid = (pl.uLo + pl.uHi) / 2
    const spans = (r: RebarRun) =>
      r.path.some((q) => pl.u(q) < mid) && r.path.some((q) => pl.u(q) > mid)
    const runs = cageL({ landings: [{ at: 'low', depth: 1.2 }, { at: 'high', depth: 1.0 }] }).runs
    for (const role of ['bottom', 'top'] as const) {
      const main = runs.filter((r) => r.role === role && r.dia === 12 && spans(r))
      expect(main).toHaveLength(acrossLines(1.2, 150, 0.02).length)
    }
  })

  it('turns each layer at the kink where the concrete is INSIDE the turn, and crosses the other', () => {
    // The rule `stairBarDetail` exists for, asserted on the placed bars rather
    // than on the 2D drawing — so the two cannot drift apart.
    const p = placedL({ landings: [{ at: 'low', depth: 1.2 }, { at: 'high', depth: 1.0 }] })
    const pl = planeOf(p)
    const runs = cageL({ landings: [{ at: 'low', depth: 1.2 }, { at: 'high', depth: 1.0 }] }).runs
      .filter((r) => r.dia === 12)
    /**
     * Bars of `role` that change direction AT the kink whose face corner is at
     * `u`.
     *
     * The window is 120 mm because a bar line's corner does not sit under the
     * face's: pulled the same cover inside two faces meeting at an angle, the
     * two lines meet PAST the corner — 58 mm here. The crossing bars' turns are
     * 235 mm and 173 mm away, well outside it, which is what the empty
     * expectations below are actually proving.
     */
    const bending = (role: 'bottom' | 'top', u: number) => runs.filter((r) => r.role === role
      && r.path.slice(1, -1).some((q) => Math.abs(pl.u(q) - u) < 0.12))
    const lines = acrossLines(1.2, 150, 0.02).length
    // Bottom kink: the soffit layer turns it; nothing in the top layer does.
    expect(bending('bottom', pl.uLo)).toHaveLength(lines)
    expect(bending('top', pl.uLo)).toHaveLength(0)
    // Top kink: the mirror.
    expect(bending('top', pl.uHi)).toHaveLength(lines)
    expect(bending('bottom', pl.uHi)).toHaveLength(0)
  })

  it('anchors into the beams at the LANDING edge, not at the foot of the slope', () => {
    // A bar stopping where the slope starts stops in the middle of a slab.
    const p = placedL()
    const pl = planeOf(p)
    const runs = cageL().runs.filter((r) => r.dia === 12)
    expect(Math.min(...runs.flatMap((r) => r.path.map((q) => pl.u(q))))).toBeLessThan(-0.1)
    expect(Math.max(...runs.flatMap((r) => r.path.map((q) => pl.u(q))))).toBeGreaterThan(p.run + 0.1)
  })

  it('ties both layers over the whole developed length, landing included', () => {
    // Where a bare flight has top steel only over a continuous end, a kink puts
    // the top face in hog whatever the bearings do — so there is main steel to
    // tie everywhere, and distribution bars have to reach it.
    const p = placedL()
    const pl = planeOf(p)
    for (const role of ['bottom', 'top'] as const) {
      const us = cageL().runs.filter((r) => r.role === role && r.dia === 10).map((r) => pl.u(r.path[0]))
      expect(us.length).toBeGreaterThan(10)
      expect(Math.min(...us)).toBeLessThan(0.3)              // out over the landing
      expect(Math.max(...us)).toBeGreaterThan(p.run - 0.3)   // …and up to the far beam
    }
  })

  it('says so when a landing is thinner than the waist it continues', () => {
    const notes = cageL({ landings: [{ at: 'low', depth: 1.2, thickness: 120 }] }).notes ?? []
    expect(notes.some((n) => n.includes('120 mm') && n.includes('step'))).toBe(true)
  })

  it('a bare flight is the cage it always was — no kink, no crossing', () => {
    const bare = cage().runs
    expect(bare.every((r) => r.path.every((q) => Number.isFinite(q[1])))).toBe(true)
    // Simply supported and no landing: no top main steel at all.
    expect(bare.filter((r) => r.role === 'top' && r.dia === 12)).toHaveLength(0)
  })
})
