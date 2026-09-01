import { describe, it, expect } from 'vitest'
import { stairBars, kinkKind, meetLines, rayMeetsLine, crossPast, normalToward, type Pt } from './stairBarDetail'

const len = (pts: Pt[]) =>
  pts.slice(1).reduce((L, p, k) => L + Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1]), 0)
/** Does this bar BEND at `p` — i.e. is `p` an interior vertex of it? */
const bendsAt = (pts: Pt[], p: Pt) =>
  pts.slice(1, -1).some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6)

// A slab 0.2 deep in this plane (y DOWN), 4 long, rising 1 over the middle 2:
// a landing at each end and a flight between them.
const TOP: Pt[] = [[0, 0], [1, 0], [3, -1], [4, -1]]
const BOT: Pt[] = [[0, 0.2], [1, 0.2], [3, -0.8], [4, -0.8]]
/** The same slab with only ONE landing — a stair breaking on a beam. */
const LOW_TOP: Pt[] = [[0, 0], [1, 0], [3, -1]]
const LOW_BOT: Pt[] = [[0, 0.2], [1, 0.2], [3, -0.8]]
const HI_TOP: Pt[] = [[0, 0], [2, -1], [3, -1]]
const HI_BOT: Pt[] = [[0, 0.2], [2, -0.8], [3, -0.8]]

describe('kinkKind — read off the geometry, not passed in', () => {
  it('names the corner where the flight LEAVES a landing the bottom kink', () => {
    expect(kinkKind(BOT[0], BOT[1], BOT[2])).toBe('bottom')
    expect(kinkKind(LOW_BOT[0], LOW_BOT[1], LOW_BOT[2])).toBe('bottom')
  })

  it('…and the corner where it ARRIVES at one the top kink', () => {
    expect(kinkKind(BOT[1], BOT[2], BOT[3])).toBe('top')
    expect(kinkKind(HI_BOT[0], HI_BOT[1], HI_BOT[2])).toBe('top')
  })

  it('falls back on the flatter leg when neither is flat', () => {
    // Not a shape a stair makes, but the rule must still be total.
    expect(kinkKind([0, 0], [1, -0.05], [2, -1])).toBe('bottom')
    expect(kinkKind([0, 0], [1, -1], [2, -1.05])).toBe('top')
  })
})

describe('meetLines — where two bar lines actually corner', () => {
  it('is the intersection, not the point under the face corner', () => {
    // Two faces meeting at (1,0): a flat landing and a flight at θ, each pulled
    // `a` inside. Their bar lines corner a·(1 − cosθ)/sinθ PAST the face corner,
    // and putting the bar under the corner instead is out by that much in the
    // direction that leaves the concrete.
    const a = 0.03, th = Math.atan2(1, 2)
    const cos = Math.cos(th), sin = Math.sin(th)
    const hit = meetLines([0, a], [1, 0], [1, a / cos], [cos, -sin])!
    expect(hit.at[1]).toBeCloseTo(a, 12)
    expect(hit.at[0] - 1).toBeCloseTo((a * (1 - cos)) / sin, 12)
    expect(hit.at[0]).toBeGreaterThan(1)
  })

  it('says nothing about parallel lines, and rayMeetsLine also drops the ones behind', () => {
    expect(meetLines([0, 0], [1, 0], [0, 5], [2, 0])).toBeNull()
    expect(meetLines([0, 0], [1, 0], [-7, -5], [0, 1])!.dist).toBeCloseTo(-7, 12)
    expect(rayMeetsLine([0, 0], [1, 0], [-7, -5], [0, 1])).toBeNull()
  })
})

describe('normalToward — a hook is named by where it goes', () => {
  it('turns the same way whichever end the bar is written from', () => {
    const a: Pt = [0, 0], b: Pt = [3, -1]
    expect(normalToward(a, b, -1)[1]).toBeLessThan(0)
    expect(normalToward(b, a, -1)[1]).toBeLessThan(0)
    expect(normalToward(a, b, 1)[1]).toBeGreaterThan(0)
    // …and it is a unit normal to the bar, not just some perpendicular-ish thing
    const n = normalToward(a, b, 1)
    expect(Math.hypot(n[0], n[1])).toBeCloseTo(1, 12)
    expect(n[0] * 3 + n[1] * -1).toBeCloseTo(0, 12)
  })
})

describe('stairBars — one kink or two, the same rule', () => {
  const ext = 0.45

  it('two landings: four bars, one bent at each kink and a pair crossing each', () => {
    const bars = stairBars(BOT, TOP, ext, 1, 0.012)
    expect(bars.map((b) => b.id).sort()).toEqual(
      ['soffit-lap', 'soffit-through', 'top-lap', 'top-through'])
    const by = (id: string) => bars.find((b) => b.id === id)!
    // The soffit turns the BOTTOM kink — the waist is on the inside of it.
    expect(bendsAt(by('soffit-through').pts, BOT[1])).toBe(true)
    // …and nothing turns the top face there, where only the cover is.
    expect(bendsAt(by('top-lap').pts, TOP[1])).toBe(false)
    expect(bendsAt(by('top-through').pts, TOP[1])).toBe(false)
    // The mirror at the top kink.
    expect(bendsAt(by('top-through').pts, TOP[2])).toBe(true)
    expect(bendsAt(by('soffit-through').pts, BOT[2])).toBe(false)
    expect(bendsAt(by('soffit-lap').pts, BOT[2])).toBe(false)
  })

  it('ONE landing at the bottom: the soffit runs through, the top pair cross', () => {
    // The case a stair breaking on an intermediate beam makes, and the case the
    // four-point rule used to fall through to two straight bars for.
    const bars = stairBars(LOW_BOT, LOW_TOP, ext, 1, 0.012)
    expect(bars.map((b) => b.id).sort()).toEqual(['soffit-through', 'top-lap', 'top-through'])
    const by = (id: string) => bars.find((b) => b.id === id)!
    // One soffit bar, the whole slab, bent at its own kink and free at both ends.
    expect(by('soffit-through').pts).toEqual(LOW_BOT)
    expect(bendsAt(by('soffit-through').pts, LOW_BOT[1])).toBe(true)
    expect(by('soffit-through').anchor).toBeUndefined()
    expect(by('soffit-through').hookStart + by('soffit-through').hookEnd).toBe(2)
    // Two top bars, neither bending at the kink they cross.
    for (const id of ['top-lap', 'top-through']) {
      expect(bendsAt(by(id).pts, LOW_TOP[1])).toBe(false)
      expect(by(id).anchor!.corner).toEqual(LOW_TOP[1])
      expect(len([by(id).anchor!.corner, ...by(id).anchor!.run])).toBeCloseTo(ext, 9)
    }
    // The piece carrying the FLIGHT is the through bar; the landing's is the lap.
    expect(by('top-through').pts[0]).toEqual(LOW_TOP[2])
    expect(by('top-lap').pts[0]).toEqual(LOW_TOP[0])
  })

  it('ONE landing at the top: the mirror — the top bar runs through', () => {
    const bars = stairBars(HI_BOT, HI_TOP, ext, 1, 0.012)
    expect(bars.map((b) => b.id).sort()).toEqual(['soffit-lap', 'soffit-through', 'top-through'])
    const by = (id: string) => bars.find((b) => b.id === id)!
    expect(by('top-through').pts).toEqual(HI_TOP)
    expect(bendsAt(by('top-through').pts, HI_TOP[1])).toBe(true)
    for (const id of ['soffit-lap', 'soffit-through']) {
      expect(bendsAt(by(id).pts, HI_BOT[1])).toBe(false)
      expect(len([by(id).anchor!.corner, ...by(id).anchor!.run])).toBeCloseTo(ext, 9)
    }
    expect(by('soffit-through').pts[0]).toEqual(HI_BOT[0])   // the flight side
    expect(by('soffit-lap').pts[0]).toEqual(HI_BOT[2])       // the landing side
  })

  it('no kink at all is still two straight bars', () => {
    const bars = stairBars([[0, 0.2], [3, -0.8]], [[0, 0], [3, -1]], ext, 1)
    expect(bars).toHaveLength(2)
    expect(bars.every((b) => b.pts.length === 2 && !b.anchor)).toBe(true)
  })

  it('every crossed bar carries the full anchorage past its kink, whatever the count', () => {
    for (const [bot, top] of [[BOT, TOP], [LOW_BOT, LOW_TOP], [HI_BOT, HI_TOP]] as const) {
      for (const b of stairBars(bot, top, ext, 1, 0.012)) {
        if (!b.anchor) continue
        expect(len([b.anchor.corner, ...b.anchor.run])).toBeCloseTo(ext, 9)
      }
    }
  })

  it('a crossed bar turns onto the far face CLEAR of the layer already lying on it', () => {
    // Laid on the face itself it sits exactly under that layer — one bar drawn
    // where there are two. `gap` is what keeps them apart, and it must show.
    const gap = 0.02
    const b = stairBars(BOT, TOP, ext, 1, gap).find((x) => x.id === 'top-through')!
    const turned = b.anchor!.run[0]                          // where it met the far face
    expect(Math.abs(turned[1] - BOT[0][1])).toBeGreaterThan(gap * 0.9)
    const flush = stairBars(BOT, TOP, ext, 1, 0).find((x) => x.id === 'top-through')!
    expect(Math.abs(flush.anchor!.run[0][1] - BOT[0][1])).toBeLessThan(1e-9)
  })

  it('crossPast turns at the far face rather than running out of the concrete', () => {
    // The real case: a bar running along the landing's TOP line carries on past
    // the bottom kink into the flight, and the far face it meets is the
    // FLIGHT'S SOFFIT — which slopes away, so it is met after 0.4 here and the
    // remaining 0.05 of the 450 is spent along it. Run straight instead, the
    // bar leaves the concrete, which is what the first drawing did.
    const soffit = { p: [1, 0.2] as Pt, dir: [2, -1] as Pt }
    const run = crossPast([1, 0], [0, 0], soffit, 0.45, 1)
    expect(run).toHaveLength(2)
    expect(run[0]).toEqual([1.4, 0])                         // where it met the soffit
    expect(len([[1, 0], ...run])).toBeCloseTo(0.45, 9)       // …and still went 450

    // Where the far face is parallel to the arrival there is nothing to meet,
    // and the bar simply runs its full anchorage straight.
    const flat = { p: [0, 0.2] as Pt, dir: [1, 0] as Pt }
    expect(crossPast([1, 0], [0, 0], flat, 0.45, 1)).toEqual([[1.45, 0]])
  })
})
