import { describe, it, expect } from 'vitest'
import {
  spliceCentres, spliceRun, spliceCage, spliceViolations, pathLength, pointAt, slicePath,
  stepAside, stepDirection, OFFSET_SLOPE,
} from './barSplice'
import { cutLength, type RebarCage, type RebarRun, type Vec3 } from './rebarModel'

const bar = (mark: string, path: Vec3[], bendDia: number[] = []): RebarRun => ({
  mark, dia: 20, role: 'bottom', member: 'B1', path, bendDia, count: 1,
})
const straight = (L: number) => bar('B1-B1', [[0, 0, 0], [L, 0, 0]])
const OPT = { stock: 6, lap: 0.6 }

describe('where the joint goes', () => {
  it('a bar that fits a stock length is never spliced', () => {
    expect(spliceCentres(5.9, OPT)).toEqual([])
    expect(spliceRun(straight(5.5), OPT)).toHaveLength(1)
  })

  it('splices as few times as the stock length allows', () => {
    // usable run per piece = stock − lap = 5.4 m
    expect(spliceCentres(8, OPT)).toHaveLength(1)      // 2 pieces
    expect(spliceCentres(12, OPT)).toHaveLength(2)     // 3 pieces
    expect(spliceCentres(20, OPT)).toHaveLength(3)     // 4 pieces
  })

  it('no piece is ever longer than a bar you can buy — the whole point', () => {
    for (const L of [6.5, 8, 9.7, 12, 15.4, 22]) {
      for (const lap of [0.4, 0.6, 0.9]) {
        const pieces = spliceRun(straight(L), { stock: 6, lap })
        for (const p of pieces) expect(pathLength(p.path)).toBeLessThanOrEqual(6 + 1e-9)
        // and together they still cover the whole bar
        expect(Math.min(...pieces.map((p) => p.path[0][0]))).toBeCloseTo(0, 9)
        expect(Math.max(...pieces.flatMap((p) => p.path.map((q) => q[0])))).toBeCloseTo(L, 9)
      }
    }
  })

  it('consecutive pieces overlap by exactly one lap', () => {
    const pieces = spliceRun(straight(12), OPT)
    for (let k = 1; k < pieces.length; k++) {
      const endPrev = pieces[k - 1].path[pieces[k - 1].path.length - 1][0]
      const startNext = pieces[k].path[0][0]
      expect(endPrev - startNext).toBeCloseTo(OPT.lap, 9)
    }
  })

  it('takes a preferred position only while the pieces still fit', () => {
    // 8 m, one splice: the even position is 4.0 m and 0.5 is available…
    expect(spliceCentres(8, { ...OPT, prefer: [0.5] })[0]).toBeCloseTo(4, 9)
    // …but a preference near the very end would leave a 7.7 m piece, so it is
    // refused and the even split stands. Geometry first, preference second.
    expect(spliceCentres(8, { ...OPT, prefer: [0.95] })[0]).toBeCloseTo(4, 9)
  })

  it('measures the FABRICATED length, so hooks and bends count against the stock', () => {
    // A 5.8 m bar with a 300 mm hook at each end is 6.4 m of steel and does not
    // fit a 6 m bar, however short the straight part reads.
    const hooked = bar('B1-B1', [[0, 0.3, 0], [0, 0, 0], [5.8, 0, 0], [5.8, 0.3, 0]], [160, 160])
    expect(cutLength(hooked) / 1000).toBeGreaterThan(6)
    expect(spliceRun(hooked, OPT).length).toBeGreaterThan(1)
    expect(spliceRun(straight(5.8), OPT)).toHaveLength(1)
  })
})

describe('staggering — §25.5.2', () => {
  const face = (n: number, L: number): RebarCage => ({
    member: 'B1',
    runs: Array.from({ length: n }, (_, k) => ({
      ...bar(`B1-B${k + 1}`, [[0, 0, k * 0.05], [L, 0, k * 0.05]]),
    })),
  })

  it('neighbouring bars do not lap at the same section', () => {
    // All the laps at one level is the defect every splicing guide opens with.
    const out = spliceCage(face(4, 9), OPT)
    const joint = (mark: string) => {
      const a = out.runs.filter((r) => r.mark.startsWith(mark))
      return a[0].path[a[0].path.length - 1][0]      // end of the first piece
    }
    const ends = [1, 2, 3, 4].map((k) => joint(`B1-B${k}`))
    expect(new Set(ends.map((v) => v.toFixed(4))).size).toBe(2)   // two groups
    expect(Math.abs(ends[0] - ends[1])).toBeCloseTo(OPT.lap, 9)   // a lap apart
    expect(ends[0]).toBeCloseTo(ends[2], 9)                       // and alternating
    expect(ends[1]).toBeCloseTo(ends[3], 9)
  })

  it('no more than half the bars are lapped at any one section', () => {
    const out = spliceCage(face(6, 9), OPT)
    const laps = [1, 2, 3, 4, 5, 6].map((k) => {
      const a = out.runs.filter((r) => r.mark.startsWith(`B1-B${k}`))
      const s = a[1].path[0][0], e = a[0].path[a[0].path.length - 1][0]
      return [s, e] as const
    })
    for (const [s, e] of laps) {
      const at = laps.filter(([s2, e2]) => s2 < e - 1e-9 && e2 > s + 1e-9).length
      expect(at).toBeLessThanOrEqual(3)              // 6 bars → at most 3
    }
  })

  it('never splices a closed tie — it is cut nested, not lapped', () => {
    const tie: RebarRun = {
      mark: 'C1-T1', dia: 10, role: 'tie', member: 'C1', count: 1, closed: true,
      path: [[0, 0, 0], [4, 0, 0], [4, 0, 4], [0, 0, 4]], bendDia: [40, 40, 40, 40],
      hookAllowance: 200,
    }
    expect(spliceRun(tie, OPT)).toEqual([tie])
    expect(spliceCage({ member: 'C1', runs: [tie] }, OPT).runs).toEqual([tie])
  })
})

describe('slicing keeps the bar it cuts from', () => {
  it('walks a polyline by arc length', () => {
    const p: Vec3[] = [[0, 0, 0], [3, 0, 0], [3, 4, 0]]
    expect(pathLength(p)).toBeCloseTo(7, 9)
    expect(pointAt(p, 0)).toEqual([0, 0, 0])
    expect(pointAt(p, 3)).toEqual([3, 0, 0])
    expect(pointAt(p, 5)[1]).toBeCloseTo(2, 9)
    expect(pointAt(p, 99)).toEqual([3, 4, 0])        // clamped
  })

  it('a cut end never inherits a bend that was cut off it', () => {
    const p: Vec3[] = [[0, 0, 0], [3, 0, 0], [3, 4, 0]]
    const whole = slicePath(p, [160], 0, 7)
    expect(whole.bendDia).toEqual([160])             // the corner survives
    const firstLeg = slicePath(p, [160], 0, 2)
    expect(firstLeg.bendDia).toEqual([])             // it does not reach the corner
    expect(firstLeg.path).toHaveLength(2)
  })

  it('a spliced piece keeps the hooks it still has and claims no others', () => {
    const hooked = bar('B1-B1', [[0, 0.3, 0], [0, 0, 0], [9, 0, 0], [9, 0.3, 0]], [160, 160])
    const [first, ...rest] = spliceRun(hooked, OPT)
    expect(first.bendDia).toEqual([160])             // the start hook, alone
    const last = rest[rest.length - 1]
    // the lapping piece carries the two bends of its own step-aside FIRST, in
    // path order, and still ends on the bar's own end hook
    expect(last.bendDia).toHaveLength(3)
    expect(last.bendDia[last.bendDia.length - 1]).toBe(160)
    expect(last.hookAllowance).toBeUndefined()
  })
})


describe('the lapping piece steps aside', () => {
  it('offsets one diameter off the line, and cranks back at 1 in 6', () => {
    // Two bars lapped on the same centreline occupy the same space: impossible
    // to build, and invisible to look at.
    const [a, b] = spliceRun(straight(9), OPT)          // role 'bottom'
    const off = 20 / 1000
    expect(a.path[0][1]).toBeCloseTo(0, 9)                    // the first piece is on line
    expect(Math.abs(b.path[0][1])).toBeCloseTo(off, 9)        // the second steps aside
    expect(Math.abs(b.path[1][1])).toBeCloseTo(off, 9)        // …for the whole lap
    expect(b.path[1][0] - b.path[0][0]).toBeCloseTo(OPT.lap, 9)
    expect(b.path[2][1]).toBeCloseTo(0, 9)                    // and comes back on line
    expect(b.path[2][0] - b.path[1][0]).toBeCloseTo(OFFSET_SLOPE * off, 9)
  })

  it('a top bar cranks DOWN and a bottom bar UP — away from the stirrup, not into it', () => {
    // The face the bar is on is where the stirrup leg is. Stepped sideways the
    // lapping piece stays on the cover line and walks straight into it; stepped
    // inward it tucks behind its partner and the stirrup passes outside both.
    expect(stepDirection('top', [0, 0, 0], [1, 0, 0])).toEqual([0, -1, 0])
    expect(stepDirection('bottom', [0, 0, 0], [1, 0, 0])).toEqual([0, 1, 0])
    const [, top] = spliceRun({ ...straight(9), role: 'top' }, OPT)
    const [, bot] = spliceRun(straight(9), OPT)
    expect(top.path[0][1]).toBeLessThan(0)
    expect(bot.path[0][1]).toBeGreaterThan(0)
    // …and neither of them moves sideways, out of its own vertical plane
    expect(top.path[0][2]).toBeCloseTo(0, 9)
    expect(bot.path[0][2]).toBeCloseTo(0, 9)
  })

  it('a bar with no tension face steps horizontally instead', () => {
    // A column vertical or a footing mat bar has no face to move away from.
    expect(stepDirection('vertical', [0, 0, 0], [0, 1, 0])).toEqual([1, 0, 0])
    expect(stepDirection('mat', [0, 0, 0], [1, 0, 0])[1]).toBe(0)
  })

  it('leaves the piece alone when the lap will not fit its first straight leg', () => {
    // Folding a crank through a bend the bar already has would move it somewhere
    // it was never detailed to go.
    const short = stepAside([[0, 0, 0], [0.3, 0, 0], [0.3, 1, 0]], [160], 0.6, 0.02, 20)
    expect(short.path).toHaveLength(3)
    expect(short.bendDia).toEqual([160])
  })
})

describe('splice zones per face — the two are opposite', () => {
  const run = (role: RebarRun['role']): RebarRun => ({
    mark: `X-${role}`, dia: 20, role, member: 'B1', count: 1, bendDia: [],
    path: [[0, 0, 0], [13, 0, 0]],
  })

  it('laps top steel in the middle half and bottom steel in an end quarter', () => {
    // A top bar is in tension over the supports and a bottom bar at midspan, so
    // the zone each may be spliced in is the OTHER one's forbidden region. One
    // shared preference list offered both bars both zones.
    const o = {
      stock: 12, lap: 0.9,
      preferByRole: { top: [0.5], bottom: [0.125, 0.875] },
    }
    const cage: RebarCage = { member: 'B1', runs: [run('top'), run('bottom')] }
    const out = spliceCage(cage, o)
    const joins = (role: RebarRun['role']) => {
      const ps = out.runs.filter((r) => r.role === role)
      expect(ps.length).toBeGreaterThan(1)
      return ps.map((r) => r.path[r.path.length - 1][0])
    }
    // the top bar's joint lands in the middle half, [3.25, 9.75]
    const t = joins('top')[0]
    expect(t).toBeGreaterThan(13 * 0.25)
    expect(t).toBeLessThan(13 * 0.75)
    // the bottom bar's in an end quarter — outside that band
    const bt = joins('bottom')[0]
    expect(bt < 13 * 0.25 || bt > 13 * 0.75).toBe(true)
  })

  it('falls back to the shared list for a role it names no zone for', () => {
    const c = spliceCentres(18, { stock: 12, lap: 0.9, prefer: [0.5] })
    expect(c).toHaveLength(1)
    expect(c[0]).toBeCloseTo(9, 9)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// THE GUARD — a preference is declined; a critical section is not
//
// `prefer` is dropped the moment the pieces it produces stop fitting a stock
// bar, and the fallback is the even division: for a two-piece bar that is
// EXACTLY midspan, the one place a bottom bar must not lap. So the critical
// sections are named separately, and a lap in one is moved out, or the bar is
// cut into one more piece, or — when nothing fits — the lap is placed and
// REPORTED. Never accepted in silence.
// ─────────────────────────────────────────────────────────────────────────
describe('critical sections — the guard the preference is not', () => {
  it('a bottom bar whose even division lands at midspan is walked out of the middle half', () => {
    // 20 m in 12 m stock: two pieces lap at 10 m, in the middle half [5, 15].
    // Neither edge fits a two-piece cut (4.5 + 15.5), so it goes to THREE
    // pieces, both laps in the end quarters.
    const c = spliceCentres(20, { stock: 12, lap: 1, prefer: [0.125, 0.875], avoid: [[0.25, 0.75]] })
    expect(c.length).toBeGreaterThanOrEqual(2)
    for (const s of c) expect(s + 0.5 <= 5 + 1e-9 || s - 0.5 >= 15 - 1e-9, `lap at ${s} is in the middle half`).toBe(true)
    expect(spliceViolations(20, c, { stock: 12, lap: 1, avoid: [[0.25, 0.75]] })).toEqual([])
  })

  it('a top bar is kept out of the end quarters', () => {
    // 14 m in 12 m stock: two pieces; the preference [0.5] puts the lap at 7,
    // which is clear. Force the even division somewhere bad with a stagger of
    // +3.5 → 10.5, inside [10.5, 14]'s reach — the guard brings it back.
    const o = { stock: 12, lap: 1, prefer: [0.5], avoid: [[0, 0.25], [0.75, 1]] as [number, number][], stagger: 3.5 }
    const c = spliceCentres(14, o)
    expect(c).toHaveLength(1)
    expect(c[0] - 0.5).toBeGreaterThanOrEqual(3.5 - 1e-9)
    expect(c[0] + 0.5).toBeLessThanOrEqual(10.5 + 1e-9)
  })

  it('judges the WHOLE lap, not its centre', () => {
    // centre at 4.9 with a 1 m lap reaches to 5.4 — into a zone starting at 5
    expect(spliceViolations(20, [4.9], { stock: 12, lap: 1, avoid: [[0.25, 0.75]] })).toEqual([4.9])
    expect(spliceViolations(20, [4.5], { stock: 12, lap: 1, avoid: [[0.25, 0.75]] })).toEqual([])
  })

  it('places the lap anyway when no stock cut can avoid the zone — and says so', () => {
    // 13 m bar, 12 m stock, and 90% of the bar forbidden: there is no answer.
    // The bar is still two pieces (it cannot be one), and the offence is
    // reported rather than the bar left impossibly long.
    const o = { stock: 12, lap: 1, avoid: [[0.05, 0.95]] as [number, number][] }
    const c = spliceCentres(13, o)
    expect(c).toHaveLength(1)
    expect(spliceViolations(13, c, o)).toHaveLength(1)
    const cage: RebarCage = { member: 'B1', runs: [straight(13)] }
    const out = spliceCage(cage, o)
    expect(out.runs.length).toBe(2)
    expect(out.notes?.some((n) => /critical section/.test(n))).toBe(true)
  })

  it('carries no note when every lap is clear', () => {
    // 12.5 m stock, not 12: the middle piece has to span the whole forbidden
    // half plus a half-lap each end, 11 m, and `runSpliceCentres` keeps one
    // diameter of stock back for the step-aside — at exactly 12 m nothing fits,
    // and a note is the RIGHT answer there, not a test failure.
    const cage: RebarCage = { member: 'B1', runs: [straight(20)] }
    const out = spliceCage(cage, { stock: 12.5, lap: 1, prefer: [0.125, 0.875], avoid: [[0.25, 0.75]] })
    expect(out.notes ?? []).toEqual([])
  })

  it('resolves the zones per role, as it does the preferences', () => {
    const run = (role: RebarRun['role']): RebarRun => ({
      mark: `X-${role}`, dia: 20, role, member: 'B1', count: 1, bendDia: [],
      path: [[0, 0, 0], [20, 0, 0]],
    })
    const o = {
      stock: 12.5, lap: 1,
      preferByRole: { top: [0.5], bottom: [0.125, 0.875] },
      avoidByRole: { top: [[0, 0.25], [0.75, 1]] as [number, number][], bottom: [[0.25, 0.75]] as [number, number][] },
    }
    const out = spliceCage({ member: 'B1', runs: [run('top'), run('bottom')] }, o)
    const lapsOf = (role: RebarRun['role']) => {
      // a lap is where consecutive pieces overlap; its centre is the midpoint
      const ps = out.runs.filter((r) => r.role === role)
      const centres: number[] = []
      for (let k = 1; k < ps.length; k++) {
        const endPrev = Math.max(...ps[k - 1].path.map((p) => p[0]))
        const startNext = Math.min(...ps[k].path.map((p) => p[0]))
        centres.push((endPrev + startNext) / 2)
      }
      return centres
    }
    for (const c of lapsOf('top')) { expect(c - 0.5).toBeGreaterThan(5 - 1e-6); expect(c + 0.5).toBeLessThan(15 + 1e-6) }
    for (const c of lapsOf('bottom')) expect(c + 0.5 <= 5 + 1e-6 || c - 0.5 >= 15 - 1e-6).toBe(true)
    expect(out.notes ?? []).toEqual([])
  })
})
