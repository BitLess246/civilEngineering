import { describe, it, expect } from 'vitest'
import { buildSlabCage, bandLines, strips, extraTopSpacing,
  type SlabCageInput, type SlabCageDir } from './slabCage'
import { DEFAULT_EXT } from './slabBarDetail'
import type { RebarRun } from './rebarModel'

const dir = (over: Partial<SlabCageDir> = {}): SlabCageDir =>
  ({ ln: 5.7, csWidth: 2.5, botCs: 200, botMs: 250, topCs: 150, topMs: 250, ...over })

const panel = (over: Partial<SlabCageInput> = {}): SlabCageInput => ({
  mark: 'S1', x0: 0, x1: 6, z0: 0, z1: 5, yTop: 3,
  h: 200, cover: 20, barDia: 12,
  x: dir({ ln: 5.7 }), z: dir({ ln: 4.7 }),
  support: 0.3, detail: 'straight', ...over,
})

const len = (r: RebarRun) => r.path.slice(1).reduce((L, p, k) =>
  L + Math.hypot(p[0] - r.path[k][0], p[1] - r.path[k][1], p[2] - r.path[k][2]), 0)
const roles = (c: { runs: RebarRun[] }) => c.runs.reduce<Record<string, number>>(
  (m, r) => ({ ...m, [r.role]: (m[r.role] ?? 0) + 1 }), {})

describe('bandLines — bars across a band', () => {
  it('spreads the count the spacing buys evenly, inside the band', () => {
    const xs = bandLines(0, 5, 250)               // 5 m at 250 → 20 bars
    expect(xs).toHaveLength(20)
    expect(xs[0]).toBeCloseTo(0.125, 9)
    expect(xs[19]).toBeCloseTo(4.875, 9)
    // even pitch, and every bar inside
    expect(xs[1] - xs[0]).toBeCloseTo(0.25, 9)
    expect(Math.min(...xs)).toBeGreaterThan(0)
    expect(Math.max(...xs)).toBeLessThan(5)
  })

  it('never leaves a ragged remainder against the far edge', () => {
    // 5 m at 300 does not divide: marching from one end leaves 0.2 m of gap at
    // the far edge and a bar 0.3 from it. Spreading gives one even pitch.
    const xs = bandLines(0, 5, 300)
    const gaps = xs.slice(1).map((v, k) => v - xs[k])
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(1e-9)
    expect(5 - xs[xs.length - 1]).toBeCloseTo(xs[0], 9)      // symmetric ends
  })

  it('always gives at least one bar, and none at all across nothing', () => {
    expect(bandLines(0, 0.05, 300)).toHaveLength(1)
    expect(bandLines(2, 2, 200)).toHaveLength(0)
    expect(bandLines(0, 5, 0)).toHaveLength(0)
  })
})

describe('strips — the column strip straddles the support line', () => {
  it('gives a panel half a column strip at each edge and the middle between', () => {
    const s = strips(0, 5, 2.5)
    expect(s.map((b) => b.strip)).toEqual(['column', 'middle', 'column'])
    expect(s[0].band).toEqual([0, 1.25])
    expect(s[1].band).toEqual([1.25, 3.75])
    expect(s[2].band).toEqual([3.75, 5])
  })

  it('a panel narrower than one column strip has no middle strip at all', () => {
    const s = strips(0, 2, 6)
    expect(s.map((b) => b.strip)).toEqual(['column', 'column'])
    expect(s[0].band[1]).toBe(1)                  // the two halves meet
  })

  it('covers the panel exactly, with no gap and no overlap', () => {
    for (const cs of [1, 2.5, 4, 9]) {
      const s = strips(0, 5, cs)
      expect(s[0].band[0]).toBe(0)
      expect(s[s.length - 1].band[1]).toBe(5)
      s.slice(1).forEach((b, k) => expect(b.band[0]).toBeCloseTo(s[k].band[1], 12))
    }
  })
})

describe('slab cage — the two mats of a panel', () => {
  const c = buildSlabCage(panel())

  it('builds a bottom mat both ways, a top mat and chairs', () => {
    const r = roles(c)
    expect(r.bottom).toBeGreaterThan(0)
    expect(r.top).toBeGreaterThan(0)
    expect(r.chair).toBeGreaterThan(0)
    expect(c.runs.every((x) => x.member === 'S1')).toBe(true)
    expect(new Set(c.runs.map((x) => x.mark)).size).toBe(c.runs.length)   // marks unique
  })

  it('the bottom mat runs the FULL panel and carries into both supports', () => {
    // §408.7.4.1.3 gives the bottom bars as continuous, embedded into the
    // support; §408.7.4.2 wants them through the column core.
    const bot = c.runs.filter((r) => r.role === 'bottom')
    const embed = DEFAULT_EXT.column.supportEmbed / 1000
    const spans = new Set(bot.map((r) => +len(r).toFixed(6)))
    expect(spans).toEqual(new Set([6 + 2 * embed, 5 + 2 * embed]))
  })

  it('the top mat exists only over the supports — never across mid-span', () => {
    // The panel centre must have NO top bar over it: that is the whole point of
    // the figure's cut-off, and a mat drawn full length would be steel nobody
    // designed and nobody buys.
    const tops = c.runs.filter((r) => r.role === 'top')
    const spansX = tops.filter((r) => Math.abs(r.path[0][2] - r.path[r.path.length - 1][2]) < 1e-9)
    const covers = (x: number) => spansX.some((r) => {
      const a = Math.min(r.path[0][0], r.path[r.path.length - 1][0])
      const b = Math.max(r.path[0][0], r.path[r.path.length - 1][0])
      return x > a + 1e-9 && x < b - 1e-9
    })
    expect(covers(0.5)).toBe(true)               // over the support
    expect(covers(3.0)).toBe(false)              // mid-span, bare
  })

  it('the top bar reaches the figure’s extension past the FACE of support', () => {
    // Fig. 408.7.4.1.3(a): 0.30 ℓn in the column strip for the bars that run
    // furthest, 0.20 for the remainder, 0.22 in the middle strip — all measured
    // from the FACE, which sits half a support in from the panel edge.
    const atLowX = c.runs.filter((r) => r.role === 'top'
      && Math.abs(r.path[0][2] - r.path[r.path.length - 1][2]) < 1e-9    // runs along X
      && Math.min(...r.path.map((p) => p[0])) < 1e-9)                    // at the x0 support
    expect(atLowX.length).toBeGreaterThan(0)
    const reach = [...new Set(atLowX.map((r) =>
      +(Math.max(...r.path.map((p) => p[0])) - 0.3 / 2).toFixed(6)))].sort((a, b) => a - b)
    const ln = 5.7
    expect(reach).toEqual([
      DEFAULT_EXT.column.topShort * ln,
      DEFAULT_EXT.middle.topLong * ln,
      DEFAULT_EXT.column.topLong * ln,
    ].map((v) => +v.toFixed(6)).sort((a, b) => a - b))
  })

  it('the SHORT span is the outer layer of both mats', () => {
    // Larger d where the moment is larger. This panel is 6 × 5, so Z is short.
    const y = (role: string, alongX: boolean) => {
      const r = c.runs.find((q) => q.role === role
        && (Math.abs(q.path[0][2] - q.path[q.path.length - 1][2]) < 1e-9) === alongX)!
      return r.path[0][1]
    }
    expect(y('bottom', false)).toBeLessThan(y('bottom', true))   // short (Z) lower
    expect(y('top', false)).toBeGreaterThan(y('top', true))      // short (Z) higher
  })

  it('the two layers are a bar apart, never through each other', () => {
    const ys = [...new Set(c.runs.filter((r) => r.role !== 'chair').map((r) => +r.path[0][1].toFixed(6)))]
    for (const a of ys) for (const b of ys) {
      if (a !== b) expect(Math.abs(a - b)).toBeGreaterThan(0.012 - 1e-9)
    }
  })

  it('every bar is inside the slab', () => {
    for (const r of c.runs) for (const p of r.path) {
      expect(p[1]).toBeLessThanOrEqual(3 + 1e-9)
      expect(p[1]).toBeGreaterThanOrEqual(3 - 0.2 - 1e-9)
    }
  })
})

describe('slab cage — what happens at each edge', () => {
  it('a continuous edge stops the top bar at the support CENTRELINE', () => {
    // The panel on the other side draws the other half of the same bar. Run
    // past it and every interior support carries two top mats.
    const c = buildSlabCage(panel({ edges: { xLo: true, xHi: true, zLo: true, zHi: true } }))
    const tops = c.runs.filter((r) => r.role === 'top')
    expect(tops.every((r) => r.path.length === 2)).toBe(true)          // no hooks
    expect(Math.min(...tops.flatMap((r) => r.path.map((p) => p[0])))).toBeCloseTo(0, 9)
    expect(Math.min(...tops.flatMap((r) => r.path.map((p) => p[2])))).toBeCloseTo(0, 9)
  })

  it('a free edge turns the top bar DOWN into the support', () => {
    const c = buildSlabCage(panel({ edges: { xLo: false, xHi: true, zLo: true, zHi: true } }))
    const hooked = c.runs.filter((r) => r.role === 'top' && r.path.length === 3)
    expect(hooked.length).toBeGreaterThan(0)
    for (const r of hooked) {
      expect(r.path[0][1]).toBeLessThan(r.path[1][1])                   // the hook goes down
      expect(r.bendDia).toHaveLength(1)
    }
  })

  it('the hook stops above the bottom mat, and says so when ℓext will not fit', () => {
    // 12db = 144, floored at 150 by §425.3.1; a 200 slab leaves 200 − 2(20) −
    // 2(12) = 136 between the mats. Drawn at full ℓext the hook came out
    // through the soffit.
    const c = buildSlabCage(panel({ edges: { xLo: false } }))
    const hooked = c.runs.filter((r) => r.role === 'top' && r.path.length === 3)
    const lowest = Math.min(...hooked.map((r) => r.path[0][1]))
    expect(lowest).toBeGreaterThan(3 - 0.2 + 0.02)                      // clear of the soffit cover
    expect(c.notes?.some((n) => /ℓext/.test(n))).toBe(true)
  })

  it('a slab deep enough for the full hook raises no note', () => {
    const c = buildSlabCage(panel({ h: 350, edges: { xLo: false } }))
    expect(c.notes?.some((n) => /ℓext/.test(n)) ?? false).toBe(false)
  })
})

describe('slab cage — chairs', () => {
  it('stands between the two mats, and is not drawn where it cannot stand', () => {
    const c = buildSlabCage(panel())
    const ch = c.runs.filter((r) => r.role === 'chair')
    expect(ch.length).toBeGreaterThan(0)
    for (const r of ch) {
      const ys = r.path.map((p) => p[1])
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.05)   // a real rise
      expect(Math.min(...ys)).toBeGreaterThan(3 - 0.2)                  // above the soffit
      expect(Math.max(...ys)).toBeLessThan(3)                           // below the top face
    }
    const thin = buildSlabCage(panel({ h: 60 }))
    expect(thin.runs.some((r) => r.role === 'chair')).toBe(false)
    expect(thin.notes?.some((n) => /chair/.test(n))).toBe(true)
  })

  it('draws none when asked for none', () => {
    const c = buildSlabCage(panel({ chairSpacing: 0 }))
    expect(c.runs.some((r) => r.role === 'chair')).toBe(false)
  })
})

describe('slab cage — spacing comes from the design, per strip', () => {
  it('the column strip is more closely spaced than the middle, as the DDM sized it', () => {
    const c = buildSlabCage(panel({
      x: dir({ botCs: 100, botMs: 400 }), z: dir({ botCs: 100, botMs: 400 }),
    }))
    // Bars running along X are spaced out along Z: count them in the edge
    // column band and in the middle band.
    const alongX = c.runs.filter((r) => r.role === 'bottom'
      && Math.abs(r.path[0][2] - r.path[1][2]) < 1e-9)
    const inBand = (lo: number, hi: number) =>
      alongX.filter((r) => r.path[0][2] > lo && r.path[0][2] < hi).length
    const cs = inBand(0, 1.25), ms = inBand(1.25, 3.75)
    expect(cs / 1.25).toBeGreaterThan(ms / 2.5)          // denser per metre
  })

  it('a degenerate panel builds nothing rather than guessing', () => {
    const c = buildSlabCage(panel({ x1: 0 }))
    expect(c.runs).toHaveLength(0)
    expect(c.notes).toEqual(['degenerate panel'])
  })
})

describe('bent bars — the arrangement the reference detail shows', () => {
  const bentPanel = (over: Partial<SlabCageInput> = {}) => panel({ detail: 'bent', ...over })
  const c = buildSlabCage(bentPanel())
  const mainX = c.runs.filter((r) => r.mark.includes('-MX'))

  it('every main bar is ONE bar: top over a support, bottom through midspan', () => {
    expect(mainX.length).toBeGreaterThan(0)
    for (const r of mainX) {
      const ys = r.path.map((p) => p[1])
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.05)   // it changes level
      expect(r.bendDia.length).toBe(r.path.length - 2)                  // a bend at every corner
    }
  })

  it('alternate bars crank at opposite ends, so each support gets half of them', () => {
    // The whole point of the arrangement: midspan keeps every bar in the
    // bottom, and each support receives every other one as top steel.
    const cranksAtLow = (r: typeof mainX[number]) => r.path[0][0] < 3
    const lo = mainX.filter(cranksAtLow).length
    const hi = mainX.length - lo
    expect(Math.abs(lo - hi)).toBeLessThanOrEqual(1)
  })

  it('the top leg reaches the same extension a straight top bar would', () => {
    // So the two details put steel over the same length of support and can be
    // compared; the figure's 0.30 ln from the FACE.
    const r = mainX.find((x) => x.path[0][0] < 3)!
    const crankTop = r.path.find((p, k) => k > 0 && p[1] === r.path[0][1])!
    expect(crankTop[0]).toBeCloseTo(0.3 / 2 + DEFAULT_EXT.column.topLong * 5.7, 6)
  })

  it('the crank climbs between the two layers at the stated angle', () => {
    const r = mainX.find((x) => x.path[0][0] < 3)!
    const [a, b] = [r.path[r.path.length - 3], r.path[r.path.length - 2]]
    const climb = a[1] - b[1], run = Math.abs(b[0] - a[0])
    expect(climb).toBeGreaterThan(0)
    expect(run).toBeCloseTo(climb, 9)                                   // 45° by default
    const steep = buildSlabCage(bentPanel({ crankDeg: 60 }))
    const q = steep.runs.filter((x) => x.mark.includes('-MX'))[0]
    const [a2, b2] = [q.path[q.path.length - 3], q.path[q.path.length - 2]]
    expect(Math.abs(b2[0] - a2[0])).toBeLessThan(run)                   // steeper → shorter run
  })

  it('the far end stays in the bottom and carries into the far support', () => {
    // The signed form of this had a double negative and pulled the bar 150 mm
    // SHORT of the support instead of 150 mm into it.
    const r = mainX.find((x) => x.path[0][0] < 3)!
    const last = r.path[r.path.length - 1]
    expect(last[0]).toBeCloseTo(6 + DEFAULT_EXT.column.supportEmbed / 1000, 9)
    expect(last[1]).toBeCloseTo(r.path[r.path.length - 2][1], 12)       // still on the bottom
  })

  it('midspan keeps every bar, at the spacing the design asked for', () => {
    // Counted where it matters: a cut at midspan must find the full bottom mat.
    const atMid = mainX.filter((r) => {
      const xs = r.path.map((p) => p[0])
      return Math.min(...xs) < 3 && Math.max(...xs) > 3
    })
    expect(atMid.length).toBe(mainX.length)
  })
})

describe('extraTopSpacing — the top steel the cranks do not cover', () => {
  it('makes up the shortfall by area, not by bar count', () => {
    // Cranked bars deliver top steel at twice the bottom spacing; areas add,
    // so 1/s_extra = 1/s_top − 1/(2 s_bot).
    expect(extraTopSpacing(200, 150)).toBeCloseTo(240, 9)
    const combined = 1 / (2 * 200) + 1 / 240
    expect(1 / combined).toBeCloseTo(150, 9)
  })

  it('asks for none when the cranked half already carries it', () => {
    // An ordinary outcome on a lightly loaded panel, and not an omission.
    expect(extraTopSpacing(200, 500)).toBeNull()
    expect(extraTopSpacing(200, 400)).toBeNull()
  })

  it('says nothing about a degenerate spacing', () => {
    expect(extraTopSpacing(0, 150)).toBeNull()
    expect(extraTopSpacing(200, 0)).toBeNull()
  })

  it('the cage draws exactly that, and drops the straight bars when none is needed', () => {
    const needed = buildSlabCage(panel({ detail: 'bent' }))
    expect(needed.runs.some((r) => r.role === 'top')).toBe(true)
    const covered = buildSlabCage(panel({
      detail: 'bent',
      x: { ln: 5.7, csWidth: 2.5, botCs: 150, botMs: 150, topCs: 400, topMs: 400 },
      z: { ln: 4.7, csWidth: 2.5, botCs: 150, botMs: 150, topCs: 400, topMs: 400 },
    }))
    expect(covered.runs.some((r) => r.role === 'top')).toBe(false)
    expect(covered.runs.some((r) => r.mark.includes('-M'))).toBe(true)
  })
})

describe('the two details are both built, and they differ', () => {
  it('bent is the default, and straight is still available', () => {
    const bent = buildSlabCage(panel({ detail: undefined }))
    const straight = buildSlabCage(panel({ detail: 'straight' }))
    expect(bent.runs.some((r) => r.mark.includes('-M'))).toBe(true)
    expect(straight.runs.some((r) => r.mark.includes('-M'))).toBe(false)
    // A straight bottom bar is two points; a cranked one is at least four.
    const straightBot = straight.runs.filter((r) => r.role === 'bottom')
    expect(straightBot.every((r) => r.path.length === 2)).toBe(true)
  })

  it('both put a bar in the bottom at midspan at the same spacing', () => {
    // The details differ in how the top steel gets there, not in the mat the
    // span is designed on.
    const count = (d: 'bent' | 'straight') => buildSlabCage(panel({ detail: d })).runs
      .filter((r) => r.role === 'bottom' && r.mark.includes(d === 'bent' ? '-M' : '-B')).length
    expect(count('bent')).toBe(count('straight'))
  })
})
