import { describe, it, expect } from 'vitest'
import {
  buildBeamCage, stirrupStations, curtailments, topCutoff, botCutoff, effectiveDepth,
  tightenOver, mergeBands, SPLICE_HOOP_SPACING, INFLECTION_FRACTION, type BeamCageInput,
} from './beamCage'
import { cutLength, runWeight, stirrupHookAllowance, CORNER_BARS_PER_FACE } from './rebarModel'

// ─────────────────────────────────────────────────────────────────────────
// A 6 m interior beam, 300×550, ⌀20 mains and ⌀12 stirrups, running east from
// the origin at soffit level 3.0 m. Six top bars over each support and six
// bottom at midspan, stirrups at 100 near the supports and 200 through.
// ─────────────────────────────────────────────────────────────────────────
const beam: BeamCageInput = {
  mark: 'B1', L: 6, colBLeft: 400, colBRight: 400,
  b: 300, h: 550, cover: 40, barDia: 20, stirrupDia: 12,
  topBars: 6, botBars: 6, sEnd: 100, sMid: 200,
  continuousLeft: true, continuousRight: true,
  axis: { x0: 0, z0: 0, x1: 6, z1: 0 }, ySoffit: 3,
}
const cage = buildBeamCage(beam)
const byRole = (r: string) => cage.runs.filter((x) => x.role === r)
const marked = (p: string) => cage.runs.filter((x) => x.mark.startsWith(`B1-${p}`))

describe('buildBeamCage — longitudinal steel', () => {
  it('splits each face into through bars and cranked extras', () => {
    // 6 top -> ceil(6/3) = 2 through, 4 extra at EACH support
    expect(marked('T')).toHaveLength(2)
    expect(marked('XTL')).toHaveLength(4)
    expect(marked('XTR')).toHaveLength(4)
    // 6 bottom -> ceil(6/4) = 2 through, 4 extra through the middle
    expect(marked('B')).toHaveLength(2)
    expect(marked('XB')).toHaveLength(4)
  })

  it('keeps the corner bars even when the analysis asked for none', () => {
    const bare = buildBeamCage({ ...beam, topBars: 0, botBars: 0 })
    expect(bare.runs.filter((r) => r.role === 'top')).toHaveLength(CORNER_BARS_PER_FACE)
    expect(bare.runs.filter((r) => r.role === 'bottom')).toHaveLength(CORNER_BARS_PER_FACE)
  })

  it('runs a through bar to the SUPPORT CENTRELINE at a continuous support', () => {
    // A bar at a continuous support is not anchored, it carries on. Stopping at
    // the column face left the joint with no steel through it at all and made
    // two adjacent beams' bars stop short of each other by a whole column.
    const t = marked('T')[0]
    expect(t.path).toHaveLength(2)
    expect(t.bendDia).toHaveLength(0)
    expect(t.path[0][0]).toBeCloseTo(0, 9)
    expect(t.path[1][0]).toBeCloseTo(6, 9)
    expect(cutLength(t)).toBeCloseTo(6000, 6)
  })

  it('reaches the FAR face of the confined core at an end support — §418.8.4.1', () => {
    // The bar used to turn its hook down at the near face, so it had no
    // embedment in the joint whatever. The turned-down leg belongs at
    // `hookClearToFace` (cover + tie + the far-face vertical) off the far face,
    // which is where the elevation dimensions ℓdh from.
    const e = buildBeamCage({ ...beam, continuousLeft: false, continuousRight: false,
      colCover: 40, colTieDia: 10, colBarDia: 20 })
    const t = e.runs.find((r) => r.mark === 'B1-T1')!
    const clear = 40 + 10 + 20                        // hookClearToFace, mm
    const xHook = -(400 / 2 - clear - 20 / 2) / 1000  // past the centreline
    expect(xHook).toBeLessThan(0)                     // …and it IS past it
    expect(t.path[0][0]).toBeCloseTo(xHook, 9)
    expect(t.path[1][0]).toBeCloseTo(xHook, 9)        // the tail is vertical
    expect(t.path[3][0]).toBeCloseTo(6 - xHook, 9)    // mirrored at the far end
  })

  it('hooks a through bar into an END support, top down and bottom up', () => {
    const e = buildBeamCage({ ...beam, continuousLeft: false, continuousRight: false })
    const top = e.runs.find((r) => r.mark === 'B1-T1')!
    const bot = e.runs.find((r) => r.mark === 'B1-B1')!
    expect(top.path).toHaveLength(4)                  // tail, corner, corner, tail
    expect(top.bendDia).toHaveLength(2)
    // the top bar's tail goes DOWN, the bottom bar's UP — 12db either way
    expect(top.path[0][1]).toBeCloseTo(top.path[1][1] - 0.24, 9)
    expect(bot.path[0][1]).toBeCloseTo(bot.path[1][1] + 0.24, 9)
  })

  it('runs a cut TOP bar PAST the inflection point — §409.7.3.3, §409.7.3.8.4', () => {
    // ℓn = 6000 − 2(200) = 5600; d = 550 − 40 − 12 − 10 = 488.
    // The extension is max(d, 12db, ℓn/16) = max(488, 240, 350) = 488, so the
    // bar stops 1400 + 488 = 1888 past the face, i.e. 2088 from the centreline.
    // Cut at ℓn/4 — the fixed 0.25L this replaces — it ended 588 mm short, at
    // the exact point it was still required to resist flexure.
    const d = effectiveDepth(550, 40, 12, 20)
    expect(d).toBe(488)
    expect(topCutoff(5600, d, 20)).toBeCloseTo(1888, 9)
    expect(marked('XTL')[0].path[1][0]).toBeCloseTo(2.088, 9)
    expect(marked('XTR')[0].path[1][0]).toBeCloseTo(6 - 2.088, 9)
  })

  it('runs a cut BOTTOM bar past the inflection point the OTHER way', () => {
    // Back towards the support by max(d, 12db) = 488, so it starts
    // 1400 − 488 = 912 past the face — 1112 from the centreline.
    expect(botCutoff(5600, 488, 20)).toBeCloseTo(912, 9)
    const xb = marked('XB')[0]
    expect(xb.path[1][0]).toBeCloseTo(1.112, 9)
    expect(xb.path[2][0]).toBeCloseTo(6 - 1.112, 9)
    // …and the two really do overlap, so no length of span has neither bar
    expect(xb.path[1][0]).toBeLessThan(marked('XTL')[0].path[1][0])
  })

  it('never runs the two cut top bars past each other at midspan', () => {
    // A span short enough that ℓn/4 + d reaches beyond the centre would draw
    // two cut bars crossing — which is one through bar, not a pair of cut ones.
    // ℓn = 1600: the cut-off is 400 + 488 = 888 past the face, 1088 from the
    // centreline — past the 1000 midspan, so both are pulled back to it.
    const short = curtailments({ L: 2, h: 550, cover: 40, stirrupDia: 12, barDia: 20, colBLeft: 400, colBRight: 400 })
    expect(short.topL).toBeCloseTo(1, 9)
    expect(short.topR).toBeCloseTo(1, 9)
    // …and the bottom bar's extension reaches the face, so it simply starts
    // there rather than at a negative distance outboard of its own support.
    expect(short.botL).toBeCloseTo(0.2, 9)
  })

  it('keeps ℓn/4 as the detailing inflection point', () => {
    expect(INFLECTION_FRACTION).toBe(0.25)
  })

  it('cranks an extra bar towards the opposite face', () => {
    const xt = marked('XTL')[0]
    const [, stop, tip] = xt.path
    expect(tip[1]).toBeLessThan(stop[1])              // top bar cranks DOWN
    const xb = marked('XB')[0]
    expect(xb.path[0][1]).toBeGreaterThan(xb.path[1][1])   // bottom bar cranks UP
  })

  it('spreads the bars of a face across the web, corner to corner', () => {
    const zs = marked('XTL').map((r) => r.path[0][2]).sort((a, b) => a - b)
    // ±(b/2 − cover − stirrup − db/2) = ±(150 − 40 − 12 − 10) = ±88 mm
    expect(zs[0]).toBeCloseTo(-0.088, 9)
    expect(zs[zs.length - 1]).toBeCloseTo(0.088, 9)
  })
})

describe('stirrupStations', () => {
  it('closes the stirrups up over 2h from each support face', () => {
    const x = stirrupStations(beam)
    const gap = (lo: number, hi: number) => {
      const w = x.filter((v) => v >= lo && v <= hi)
      return w.length < 2 ? Infinity : Math.min(...w.slice(1).map((v, k) => v - w[k]))
    }
    expect(gap(0.2, 1.25)).toBeCloseTo(0.1, 6)        // 2h = 1100 from the face
    // The middle DIVIDES the gap it is given, so it comes out at or a little
    // under the designed spacing — never over it, and never a short remainder
    // hard against an end zone.
    expect(gap(2.5, 3.5)).toBeLessThanOrEqual(0.2 + 1e-9)
    expect(gap(2.5, 3.5)).toBeGreaterThan(0.2 * 0.9)
    // and no two stirrups ever end up crowded together at a zone boundary
    const gaps = x.slice(1).map((v, k) => v - x[k])
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(0.1 - 1e-9)
  })

  it('starts each end zone from its OWN support, not from one end of the beam', () => {
    const x = stirrupStations(beam)
    expect(Math.min(...x)).toBeCloseTo(0.25, 6)       // 50 mm off the left face
    expect(Math.max(...x)).toBeCloseTo(5.75, 6)       // and off the right one
  })

  it('keeps every stirrup between the two support faces', () => {
    for (const v of stirrupStations(beam)) {
      expect(v).toBeGreaterThanOrEqual(0.2 - 1e-9)
      expect(v).toBeLessThanOrEqual(5.8 + 1e-9)
    }
  })

  it('does not fall over on a beam shorter than its own end zones', () => {
    const x = stirrupStations({ ...beam, L: 0.9, colBLeft: 400, colBRight: 400 })
    expect(x.every((v) => v >= 0.2 - 1e-9 && v <= 0.7 + 1e-9)).toBe(true)
  })
})

describe('buildBeamCage — stirrups', () => {
  it('draws a closed stirrup on the cover line, with both hooks allowed for', () => {
    const s = byRole('stirrup')[0]
    expect(s.closed).toBe(true)
    expect(s.path).toHaveLength(4)
    // one bar: no 90° bend at the closure, two 135° sweeps round the corner
    // bar at R = (20 + 12)/2, and two extensions
    const closure = 16 * ((3 * Math.PI) / 2 - Math.PI / 2) + 2 * Math.max(6 * 12, 75)
    expect(s.hookAllowance).toBeCloseTo(closure, 9)
    expect(closure).toBeLessThan(stirrupHookAllowance(12))
    // 300 − 2(40) − 12 = 208 across, 550 − 2(40) − 12 = 458 deep
    const perim = 2 * (0.208 + 0.458) * 1000
    expect(cutLength(s)).toBeGreaterThan(perim)       // the hooks outweigh the bends
  })

  it('puts one stirrup at every station and no more', () => {
    expect(byRole('stirrup')).toHaveLength(stirrupStations(beam).length)
  })
})

describe('buildBeamCage — placement', () => {
  it('lays the cage along whatever axis it is given', () => {
    const ns = buildBeamCage({ ...beam, axis: { x0: 2, z0: 1, x1: 2, z1: 7 } })
    const t = ns.runs.find((r) => r.mark === 'B1-T1')!
    // it runs in z now, so the web offset lands on x instead
    expect(t.path[1][2] - t.path[0][2]).toBeCloseTo(6, 9)
    expect(t.path[0][0]).toBeCloseTo(t.path[1][0], 9)
    expect(Math.abs(t.path[0][0] - 2)).toBeCloseTo(0.088, 9)
  })

  it('sits the steel inside the cover, top and bottom', () => {
    const t = cage.runs.find((r) => r.mark === 'B1-T1')!
    const b = cage.runs.find((r) => r.mark === 'B1-B1')!
    // inset = 40 + 12 + 10 = 62 mm from each face
    expect(b.path[0][1]).toBeCloseTo(3 + 0.062, 9)
    expect(t.path[0][1]).toBeCloseTo(3 + 0.55 - 0.062, 9)
  })

  it('weighs a bar as its developed length times its own mass per metre', () => {
    const t = cage.runs.find((r) => r.mark === 'B1-T1')!
    expect(runWeight(t)).toBeCloseTo((cutLength(t) / 1000) * 2.466, 2)
  })
})

describe('buildBeamCage — the hook has to develop (§418.8.5.1)', () => {
  // This check used to live on the typical beam detail, so it existed only for
  // as long as that sheet did. It is the CAGE's now: retiring a drawing must
  // never retire a design check, and every view of the same bar gets it.
  const ends = { ...beam, continuousLeft: false, continuousRight: false,
    colCover: 40, colTieDia: 10, colBarDia: 20 }

  it('says so when ℓdh does not fit the column it turns into', () => {
    // ⌀20, fy 415, f'c 28 → ℓdh = 415·20/(5.4·√28) = 290. A 400 column gives
    // 400 − 40 − 10 − 20 = 330 … so it fits; a 300 column gives 230 and does not.
    const c = buildBeamCage({ ...ends, jointConcrete: { fc: 28, fy: 415, colH: 300 } })
    const note = (c.notes ?? []).find((n) => n.includes('ℓdh'))
    expect(note).toBeDefined()
    expect(note).toContain('290')                 // what the bar needs
    expect(note).toContain('230')                 // what the column has
    expect(note).toContain('§425.4.4')            // and the way out
  })

  it('stays quiet where the bar does develop', () => {
    const c = buildBeamCage({ ...ends, jointConcrete: { fc: 28, fy: 415, colH: 400 } })
    expect((c.notes ?? []).some((n) => n.includes('ℓdh'))).toBe(false)
  })

  it('asks nothing at a support the bar is not anchored in', () => {
    // A bar at a continuous support carries on; there is no hook to develop.
    const c = buildBeamCage({ ...beam, colCover: 40, colTieDia: 10, colBarDia: 20,
      jointConcrete: { fc: 28, fy: 415, colH: 300 } })
    expect((c.notes ?? []).some((n) => n.includes('ℓdh'))).toBe(false)
  })

  it('makes no claim at all when it was given no column concrete', () => {
    expect((buildBeamCage(ends).notes ?? []).some((n) => n.includes('ℓdh'))).toBe(false)
  })
})

describe('mergeBands', () => {
  it('merges overlapping and touching bands, drops empty ones', () => {
    expect(mergeBands([[2, 3], [0, 1], [0.9, 2.1], [5, 5]]))
      .toEqual([[0, 3]])
    expect(mergeBands([[0, 1], [4, 5]])).toEqual([[0, 1], [4, 5]])
  })
})

describe('tightenOver — hoops through a lap splice', () => {
  const grid = (n: number, s: number) => Array.from({ length: n }, (_, k) => k * s)

  it('re-lays the bracketed stretch at the pitch asked for, not a third of it', () => {
    // Subdividing a 0.22 gap to reach 0.1 gives 0.073 — 37% more stirrups than
    // the rule asks for. Laying between the two stations that BRACKET the band
    // lands as near 0.1 as those ends allow.
    const out = tightenOver(grid(11, 0.22), [[1.0, 1.3]], 0.1)
    const gaps = out.slice(1).map((v, k) => v - out[k])
    const inside = gaps.filter((_, k) => out[k] >= 0.88 - 1e-9 && out[k + 1] <= 1.32 + 1e-9)
    expect(Math.max(...inside)).toBeLessThanOrEqual(0.1 + 1e-9)
    expect(Math.max(...inside)).toBeGreaterThan(0.085)
  })

  it('leaves everything outside the band exactly where it was', () => {
    const base = grid(11, 0.22)
    const out = tightenOver(base, [[1.0, 1.3]], 0.1)
    for (const v of base.filter((x) => x <= 0.88 + 1e-9 || x >= 1.32 - 1e-9)) {
      expect(out.some((o) => Math.abs(o - v) < 1e-9)).toBe(true)
    }
  })

  it('never makes a gap coarser than it found it', () => {
    const base = grid(11, 0.22)
    const out = tightenOver(base, [[1.0, 1.3]], 0.1)
    const gaps = out.slice(1).map((v, k) => v - out[k])
    expect(Math.max(...gaps)).toBeLessThanOrEqual(0.22 + 1e-9)
  })

  it('does nothing without a band, or with a band off the end of the run', () => {
    const base = grid(11, 0.22)
    expect(tightenOver(base, [], 0.1)).toEqual(base)
    expect(tightenOver(base, [[-1, -0.5]], 0.1)).toEqual(base)
    expect(tightenOver(base, [[9, 10]], 0.1)).toEqual(base)
  })
})

describe('buildBeamCage — the hoops know where the laps are', () => {
  // The stirrup layout used to run before anything knew a lap existed, so a
  // splice sat in whatever spacing the shear design happened to give it.
  const stock = 6, lap = 0.54
  const withSplice = buildBeamCage({ ...beam, splice: { stock, lap, prefer: [0.5] } })
  const withOut = buildBeamCage(beam)
  const along = (c: ReturnType<typeof buildBeamCage>) =>
    c.runs.filter((r) => r.role === 'stirrup')
      .map((r) => r.path.reduce((a, p) => a + p[0], 0) / r.path.length)
      .sort((a, b) => a - b)

  it('closes the hoops up to 100 through the lap and nowhere else', () => {
    expect(SPLICE_HOOP_SPACING).toBe(100)
    const st = along(withSplice)
    expect(st.length).toBeGreaterThan(along(withOut).length)
    const near = st.filter((v) => v > 2.6 && v < 3.4)
    const gaps = near.slice(1).map((v, k) => v - near[k])
    expect(Math.max(...gaps)).toBeLessThanOrEqual(0.1 + 1e-9)
    // …and the middle of the OTHER half is still at the designed spacing
    const away = st.filter((v) => v > 1.4 && v < 2.0)
    const g2 = away.slice(1).map((v, k) => v - away[k])
    expect(Math.max(...g2)).toBeGreaterThan(0.15)
  })

  it('leaves the layout alone when the bars fit a stock length', () => {
    // Nothing is lapped, so nothing is closed up — the schedule must not claim
    // a splice zone the bar does not have.
    const long = buildBeamCage({ ...beam, splice: { stock: 20, lap } })
    expect(along(long)).toEqual(along(withOut))
  })

  it('makes no claim at all when it was told nothing about splicing', () => {
    expect(along(withOut)).toEqual(stirrupStations(beam))
  })
})

describe('buildBeamCage — how much steel is CONTINUOUS (§418.6.3.2 / §418.4.2.2)', () => {
  /** Bars of `role` that reach a station `at` m from the left support centreline. */
  const reaching = (i: BeamCageInput, role: 'top' | 'bottom', at: number) =>
    buildBeamCage(i).runs.filter((r) => r.role === role
      && Math.min(...r.path.map((p) => p[0])) <= at + 1e-6
      && Math.max(...r.path.map((p) => p[0])) >= at - 1e-6).length

  // Just inside the left joint face: the station the "at face of joint"
  // sentence measures at.
  const face = (beam.colBLeft ?? 0) / 2000 + 0.05

  it('a gravity beam keeps the §409.7.3.8 shares — a quarter of the bottom', () => {
    // 6 bottom bars, KEEP_BOTTOM = ¼ → ceil(1.5) = 2, floored at the corners.
    expect(reaching(beam, 'bottom', face)).toBe(CORNER_BARS_PER_FACE)
    expect(reaching(beam, 'top', face)).toBe(6)          // top steel is IN tension here
  })

  it('an SMF runs half the top count through the bottom face', () => {
    // atFace = ½ of 6 top bars → 3 bottom bars must reach the joint face.
    expect(reaching({ ...beam, system: 'smf' }, 'bottom', face)).toBe(3)
  })

  it('an IMF runs a third — ⅓ of 6 is 2, which the corners already give', () => {
    expect(reaching({ ...beam, system: 'imf' }, 'bottom', face)).toBe(2)
    // …and with 9 top bars, ⅓ is 3, which they do not.
    expect(reaching({ ...beam, system: 'imf', topBars: 9, botBars: 9 }, 'bottom', face)).toBe(3)
  })

  it('the "any section" sentence holds the TOP steel through midspan too', () => {
    // along = ¼ of max(9, 9) → 3 top bars past the inflection point, where the
    // gravity share (⅓ of 9 = 3) happens to agree; at 8 bars it does not.
    const mid = beam.L / 2
    expect(reaching({ ...beam, topBars: 4, botBars: 12, system: 'smf' }, 'top', mid)).toBe(3)
    expect(reaching({ ...beam, topBars: 4, botBars: 12, system: 'gravity' }, 'top', mid))
      .toBe(CORNER_BARS_PER_FACE)                                                // ⌈4/3⌉ → 2
  })

  it('never asks a face for more bars than it has', () => {
    // 2 bottom bars against 12 top ones: the clause wants 6, the face has 2.
    // The cage cannot invent steel — `BeamDesignInput.AsFloor` is what supplies
    // it upstream — so it runs everything it has and stops there.
    const c = { ...beam, topBars: 12, botBars: 2, system: 'smf' as const }
    expect(reaching(c, 'bottom', face)).toBe(2)
  })
})

describe('hoops through an SMF lap — §418.6.3.3, the smaller of d/4 and 100', () => {
  // 300 deep: d = 300 − 40 − 10 − 10 = 240, d/4 = 60. At a flat 100 the hoops
  // through the lap were nearly twice the pitch the clause allows.
  const shallow: BeamCageInput = {
    mark: 'B', L: 7, b: 250, h: 300, cover: 40, barDia: 20, stirrupDia: 10,
    topBars: 3, botBars: 3, sEnd: 100, sMid: 150, colBLeft: 300, colBRight: 300,
    axis: { x0: 0, z0: 0, x1: 7, z1: 0 }, ySoffit: 0,
    splice: { stock: 6, lap: 0.9, prefer: [0.5] },
  }
  const along = (c: ReturnType<typeof buildBeamCage>) =>
    c.runs.filter((r) => r.role === 'stirrup').map((r) => r.path[0][0]).sort((a, b) => a - b)
  const minGap = (xs: number[]) => Math.min(...xs.slice(1).map((v, k) => v - xs[k]))

  it('closes up to d/4 in an SMF, and to 100 otherwise', () => {
    const smf = along(buildBeamCage({ ...shallow, system: 'smf' }))
    const grav = along(buildBeamCage({ ...shallow, system: 'gravity' }))
    expect(minGap(smf)).toBeLessThanOrEqual(0.06 + 1e-6)
    expect(minGap(grav)).toBeGreaterThan(0.06 + 1e-6)
    expect(minGap(grav)).toBeLessThanOrEqual(0.1 + 1e-6)
  })
})
