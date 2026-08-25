import { describe, it, expect } from 'vitest'
import {
  buildBeamCage, stirrupStations, EXTRA_TOP_FRACTION, EXTRA_BOTTOM_FRACTION,
  type BeamCageInput,
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

  it('curtails the extras where the sheet curtails them', () => {
    expect(EXTRA_TOP_FRACTION).toBe(0.25)
    expect(EXTRA_BOTTOM_FRACTION).toBe(0.15)
    const xt = marked('XTL')[0]
    expect(xt.path[1][0]).toBeCloseTo(1.5, 9)         // 0.25L
    const xb = marked('XB')[0]
    expect(xb.path[1][0]).toBeCloseTo(0.9, 9)         // 0.15L
    expect(xb.path[2][0]).toBeCloseTo(5.1, 9)
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
    expect(gap(2.5, 3.5)).toBeCloseTo(0.2, 6)
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
