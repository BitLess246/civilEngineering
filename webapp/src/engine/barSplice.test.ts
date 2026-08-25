import { describe, it, expect } from 'vitest'
import {
  spliceCentres, spliceRun, spliceCage, pathLength, pointAt, slicePath,
  stepAside, acrossBar, OFFSET_SLOPE,
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
  it('offsets one diameter across the bar, and cranks back on line at 1 in 6', () => {
    // Two bars lapped on the same centreline occupy the same space: impossible
    // to build, and invisible to look at.
    const [a, b] = spliceRun(straight(9), OPT)
    const off = 20 / 1000
    expect(a.path[0][2]).toBeCloseTo(0, 9)                    // the first piece is on line
    expect(Math.abs(b.path[0][2])).toBeCloseTo(off, 9)        // the second steps aside
    expect(Math.abs(b.path[1][2])).toBeCloseTo(off, 9)        // …for the whole lap
    expect(b.path[1][0] - b.path[0][0]).toBeCloseTo(OPT.lap, 9)
    expect(b.path[2][2]).toBeCloseTo(0, 9)                    // and comes back on line
    expect(b.path[2][0] - b.path[1][0]).toBeCloseTo(OFFSET_SLOPE * off, 9)
  })

  it('steps sideways, never down — a lapped beam bar stays in its layer', () => {
    // Dropping it a diameter would move the bar out of the layer the design
    // gave it an effective depth for.
    const [, b] = spliceRun(straight(9), OPT)
    expect(b.path[0][1]).toBeCloseTo(0, 9)
    expect(acrossBar([0, 0, 0], [1, 0, 0])[1]).toBe(0)
    expect(acrossBar([0, 0, 0], [0, 1, 0])).toEqual([1, 0, 0])   // a vertical bar
  })

  it('leaves the piece alone when the lap will not fit its first straight leg', () => {
    // Folding a crank through a bend the bar already has would move it somewhere
    // it was never detailed to go.
    const short = stepAside([[0, 0, 0], [0.3, 0, 0], [0.3, 1, 0]], [160], 0.6, 0.02, 20)
    expect(short.path).toHaveLength(3)
    expect(short.bendDia).toEqual([160])
  })
})
