// The rule under test: no layer carries a single bar. It lived only inside
// `beamDesign`, so the T-beam engine — which stacked bars with its own greedy
// loop — could detail one bar sitting alone in the top layer with nothing to
// tie to on either side. These tests belong to the rule, not to either engine.

import { describe, it, expect } from 'vitest'
import { splitLayers, centroidRise, jointBarRoom, barLayoutWidth, type BarLayers } from './barLayers'

const total = (l: number[]) => l.reduce((s, k) => s + k, 0)

describe('splitLayers', () => {
  it('keeps everything in one layer while it fits', () => {
    expect(splitLayers(4, 4)).toEqual({ bars: 4, layers: [4] })
    expect(splitLayers(2, 5)).toEqual({ bars: 2, layers: [2] })
  })

  it('fills the bottom layer first', () => {
    // The extreme layer is the one doing the work; a half-full bottom layer
    // would raise the group centroid and cost effective depth for nothing.
    expect(splitLayers(7, 4).layers).toEqual([4, 3])
  })

  it('pairs a lone bar in the upper layer — the bug this exists to stop', () => {
    // 5 bars, 4 per layer, is [4, 1] naively. The 1 has no neighbour to sit
    // beside the stirrup leg with, so it becomes [4, 2] and the count goes up.
    expect(splitLayers(5, 4)).toEqual({ bars: 6, layers: [4, 2] })
    expect(splitLayers(3, 2)).toEqual({ bars: 4, layers: [2, 2] })
    expect(splitLayers(9, 4)).toEqual({ bars: 10, layers: [4, 4, 2] })
  })

  it('never returns a layer of one, for any count or width', () => {
    for (let per = 2; per <= 8; per++) {
      for (let n = 2; n <= 60; n++) {
        const r = splitLayers(n, per)
        expect(r.layers.every((k) => k >= 2)).toBe(true)
        expect(total(r.layers)).toBe(r.bars)
      }
    }
  })

  it('only ever ADDS steel — pairing is conservative on As', () => {
    // Never the other direction. A section detailed with fewer bars than the
    // strength calculation demanded is the one failure mode that matters here.
    for (let per = 2; per <= 8; per++) {
      for (let n = 2; n <= 60; n++) {
        expect(splitLayers(n, per).bars).toBeGreaterThanOrEqual(n)
        expect(splitLayers(n, per).bars).toBeLessThanOrEqual(n + 1)
      }
    }
  })

  it('leaves a one-bar-wide web alone', () => {
    // maxPerLayer < 2 means the web cannot hold two bars side by side at all.
    // The honest answer is that the section is too narrow, not that it wants
    // another bar — so pairing is skipped rather than looping forever.
    expect(splitLayers(3, 1)).toEqual({ bars: 3, layers: [1, 1, 1] })
  })

  it('handles a single bar and none at all', () => {
    expect(splitLayers(1, 4)).toEqual({ bars: 1, layers: [1] })
    expect(splitLayers(0, 4)).toEqual({ bars: 0, layers: [] })
  })

  it('rounds a fractional demand up', () => {
    expect(splitLayers(4.2, 4).bars).toBe(6)   // 5 → paired to 6
  })
})

describe('centroidRise', () => {
  it('is zero for a single layer — d is unaffected', () => {
    expect(centroidRise([4], 45)).toBe(0)
  })

  it('is the Varignon average of the layer heights', () => {
    // [4, 2] at 45 mm pitch: (4·0 + 2·45) / 6 = 15 mm.
    expect(centroidRise([4, 2], 45)).toBeCloseTo(15, 9)
    // [4, 4] is symmetric about the gap: exactly half the pitch.
    expect(centroidRise([4, 4], 45)).toBeCloseTo(22.5, 9)
  })

  it('always raises the centroid as layers are added, never lowers it', () => {
    // Stacking must REDUCE effective depth. A rise that went the other way
    // would silently overstate capacity.
    expect(centroidRise([4, 4, 2], 45)).toBeGreaterThan(centroidRise([4, 4], 45))
    expect(centroidRise([4, 4], 45)).toBeGreaterThan(centroidRise([4], 45))
  })

  it('is safe on an empty group', () => {
    expect(centroidRise([], 45)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// THE WIDTH THE BARS MAY ACTUALLY USE
//
// A beam's bars have to pass INSIDE the column's own verticals, and a straight
// bar holds that offset for its whole length. The cage has always placed them
// there; the design laid them out across the nominal web, so §407.7.1 passed a
// spacing the cage could not build — a 250 beam framing a 250 column with ⌀32
// bars was reported at 86 mm clear and drawn at 22.
// ─────────────────────────────────────────────────────────────────────────
describe('jointBarRoom', () => {
  it('steps the beam bar inside the column bar by half of each diameter', () => {
    // 300 column, 40 cover, ⌀10 tie, ⌀20 verticals → its outer bar at 90 mm;
    // a ⌀20 beam bar clears it at 90 − (20+20)/2 = 70.
    expect(jointBarRoom(300, 40, 10, 20, 20)).toBeCloseTo(70, 9)
    // a smaller beam bar needs less room
    expect(jointBarRoom(300, 40, 10, 20, 12)).toBeCloseTo(74, 9)
    // and a wider column leaves more
    expect(jointBarRoom(500, 40, 10, 20, 20)).toBeCloseTo(170, 9)
  })

  it('never goes negative — a column narrower than its own cover leaves none', () => {
    expect(jointBarRoom(150, 40, 10, 25, 25)).toBe(0)
  })
})

describe('barLayoutWidth', () => {
  const web = (b: number) => b - 2 * (40 + 10)

  it('is the clear web when nothing constrains the joint', () => {
    expect(barLayoutWidth(300, 40, 10, 20)).toBeCloseTo(web(300), 9)
  })

  it('is the clear web when the joint is roomier than the beam', () => {
    // a 300 beam into a 600 column: room 170, band 2·170+20 = 360 > 200
    expect(barLayoutWidth(300, 40, 10, 20, jointBarRoom(600, 40, 10, 20, 20)))
      .toBeCloseTo(200, 9)
  })

  it('is the JOINT band when the column is no wider than the beam', () => {
    // 250 beam into a 250 column, ⌀32: room 27, band 2·27+32 = 86 — and the
    // web says 150, which is the number the check used to be made against.
    const room = jointBarRoom(250, 40, 10, 32, 32)
    expect(room).toBeCloseTo(27, 9)
    expect(barLayoutWidth(250, 40, 10, 32, room)).toBeCloseTo(86, 9)
    expect(web(250)).toBe(150)
  })

  it('measures both ends the same way, so the two are comparable', () => {
    // Unconstrained, the band IS the clear web: bars at ±(b/2 − cover − ds −
    // db/2) span 2·room + db = b − 2(cover + ds). If that identity breaks the
    // joint band and the web are being measured differently and the `min` is
    // comparing two different things.
    for (const [b, db] of [[250, 20], [300, 25], [450, 32]] as const) {
      const free = b / 2 - (40 + 10 + db / 2)
      expect(barLayoutWidth(b, 40, 10, db, free)).toBeCloseTo(b - 2 * (40 + 10), 9)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────
// THE LOOP HAS TO TERMINATE ON ANY INPUT.
//
// `left -= Math.min(left, maxPerLayer)` subtracts nothing when maxPerLayer is
// 0, and never reaches zero from an infinite count — so the while loop pushed
// until the array hit its engine limit: 12.8 s of allocation, then
// `RangeError: Invalid array length`. In a browser that is a frozen tab.
//
// Both inputs are one keystroke away. `n` is As/Ab, so a bar diameter of 0
// makes it Infinity; `maxPerLayer` is a floor() of the room across the web,
// which goes to 0 on a section too narrow for a bar.
// ─────────────────────────────────────────────────────────────────────────
describe('splitLayers terminates on any input', () => {
  const fast = (f: () => BarLayers) => {
    const t0 = Date.now()
    const r = f()
    // the old loop took ~13 s before throwing; anything sane is sub-millisecond
    expect(Date.now() - t0).toBeLessThan(500)
    return r
  }

  it('an infinite bar count (barDia = 0 ⇒ As/Ab = ∞) returns nothing, instead of allocating until it throws', () => {
    expect(fast(() => splitLayers(Infinity, 3))).toEqual({ bars: 0, layers: [] })
    expect(fast(() => splitLayers(-Infinity, 3))).toEqual({ bars: 0, layers: [] })
  })

  it('NaN is not a bar count — it used to come back as `bars: NaN` and reach the schedule', () => {
    expect(fast(() => splitLayers(NaN, 3))).toEqual({ bars: 0, layers: [] })
  })

  it('a web too narrow for a bar is detailed ONE per layer, not looped forever', () => {
    expect(fast(() => splitLayers(5, 0))).toEqual({ bars: 5, layers: [1, 1, 1, 1, 1] })
    expect(fast(() => splitLayers(3, -4))).toEqual({ bars: 3, layers: [1, 1, 1] })
    // …and with one bar per layer there is no pairing bump: a lone bar in the
    // top layer is the honest answer when the web holds only one.
    expect(fast(() => splitLayers(2, 1)).bars).toBe(2)
  })

  it('a fractional maxPerLayer floors rather than producing fractional layers', () => {
    expect(splitLayers(5, 2.9)).toEqual(splitLayers(5, 2))
  })

  it('leaves every well-formed case exactly as it was', () => {
    expect(splitLayers(7, 3)).toEqual({ bars: 8, layers: [3, 3, 2] })
    expect(splitLayers(6, 3)).toEqual({ bars: 6, layers: [3, 3] })
    expect(splitLayers(2, 5)).toEqual({ bars: 2, layers: [2] })
    expect(splitLayers(0, 3)).toEqual({ bars: 0, layers: [] })
  })
})
