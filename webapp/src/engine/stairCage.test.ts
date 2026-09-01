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
