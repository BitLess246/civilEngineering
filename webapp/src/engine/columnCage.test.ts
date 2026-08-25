import { describe, it, expect } from 'vitest'
import {
  buildColumnCage, perimeterBars, placedBarCount, tieLevels, barInset, OFFSET_BEND_SLOPE,
  type ColumnCageInput,
} from './columnCage'
import { cutLength, stirrupBendDiameter, stirrupHookAllowance,} from './rebarModel'

// ─────────────────────────────────────────────────────────────────────────
// WORKED EXAMPLE — a 400×600 SMF column, ⌀20 verticals, ⌀12 ties.
//
//   bar inset  = 40 + 12 + 20/2 = 62
//   corner x   = 600/2 − 62 = 238   (along h)
//   corner z   = 400/2 − 62 = 138   (across b)
//   tie x      = 600/2 − 40 − 12/2 = 254
//   tie z      = 400/2 − 40 − 12/2 = 154
// ─────────────────────────────────────────────────────────────────────────
const col: ColumnCageInput = {
  mark: 'C1', b: 400, h: 600, cover: 40,
  barDia: 20, bars: 12, tieDia: 12,
  sConfined: 100, sOutside: 150, lo: 600,
  centre: [0, 0], yBottom: 0, yTop: 3,
}

describe('barInset', () => {
  it('is cover, then the tie, then half a bar', () => {
    expect(barInset(40, 12, 20)).toBe(62)
    expect(barInset(50, 10, 25)).toBe(72.5)
  })
})

describe('perimeterBars', () => {
  it('always puts a bar in each corner', () => {
    const p = perimeterBars({ ...col, bars: 4 })
    expect(p).toHaveLength(4)
    for (const [x, z] of p) { expect(Math.abs(x)).toBeCloseTo(238, 9); expect(Math.abs(z)).toBeCloseTo(138, 9) }
  })

  it('places every bar it is given', () => {
    for (const n of [4, 6, 8, 10, 12, 16, 20]) {
      expect(perimeterBars({ ...col, bars: n })).toHaveLength(n)
    }
  })

  it('gives the deeper face more of the extra bars', () => {
    // 600 along h against 400 across b, so the long faces take the larger
    // share — which is where §425.7.2's lateral spacing limit bites first.
    const p = perimeterBars(col)                       // 12 bars
    const midH = p.filter(([x]) => Math.abs(Math.abs(x) - 238) > 1e-9).length
    const midB = p.filter(([, z]) => Math.abs(Math.abs(z) - 138) > 1e-9).length
    expect(midH + midB).toBe(8)                        // 12 − 4 corners
    expect(midH).toBeGreaterThan(midB)
  })

  it('keeps every bar inside the tie', () => {
    for (const n of [4, 8, 12, 16]) {
      for (const [x, z] of perimeterBars({ ...col, bars: n })) {
        expect(Math.abs(x)).toBeLessThanOrEqual(600 / 2 - 62 + 1e-9)
        expect(Math.abs(z)).toBeLessThanOrEqual(400 / 2 - 62 + 1e-9)
      }
    }
  })
})

describe('tieLevels', () => {
  it('is tight within lo of each end and wider through the middle', () => {
    const y = tieLevels(col)
    const gaps = y.slice(1).map((v, k) => v - y[k])
    // first gaps are the confined 100, middle ones the 150
    expect(gaps[0]).toBeCloseTo(0.1, 9)
    expect(Math.max(...gaps)).toBeCloseTo(0.15, 9)
    // and the zone really is 600 long at each end
    const confinedNear = y.filter((v) => v <= 0.6 + 1e-9)
    expect(confinedNear.length).toBe(7)              // 0, 0.1 … 0.6
  })

  it('never spaces the confined zone looser than the rest', () => {
    // a caller that passes them the wrong way round still gets a safe cage
    const y = tieLevels({ ...col, sConfined: 200, sOutside: 100 })
    const gaps = y.slice(1).map((v, k) => v - y[k])
    expect(Math.max(...gaps)).toBeLessThanOrEqual(0.2 + 1e-9)
  })

  it('reaches the top of the column', () => {
    const y = tieLevels(col)
    expect(y[y.length - 1]).toBeCloseTo(3, 9)
  })

  it('leaves the joint band to the joint hoops', () => {
    // §418.8.3: the hoops through a beam-column joint belong to the joint, and
    // placing column ties there too draws — and pays for — the steel twice
    const y = tieLevels({ ...col, jointGap: [1.4, 1.9] })
    expect(y.some((v) => v > 1.4 && v < 1.9)).toBe(false)
    expect(y.some((v) => v < 1.4)).toBe(true)
    expect(y.some((v) => v > 1.9)).toBe(true)
  })

  it('returns nothing for a column of no height', () => {
    expect(tieLevels({ ...col, yTop: 0 })).toEqual([])
  })
})

describe('buildColumnCage', () => {
  const cage = buildColumnCage(col)

  it('carries one run per vertical, and one PERIMETER hoop per tie level', () => {
    const v = cage.runs.filter((r) => r.role === 'vertical')
    const hoops = cage.runs.filter((r) => r.mark.startsWith('C1-T'))
    expect(v).toHaveLength(12)
    expect(hoops).toHaveLength(tieLevels(col).length)
    expect(cage.member).toBe('C1')
    for (const r of cage.runs) expect(r.member).toBe('C1')
  })

  it('adds the supplementary ties the bars ask for, at every level', () => {
    // 12 bars is two intermediates per face: a diamond would pass between them,
    // so it gets an inner rectangle and cross ties (§425.7.2.3).
    const levels = tieLevels(col).length
    const extra = cage.runs.filter((r) => r.role === 'tie' && !r.mark.startsWith('C1-T'))
    expect(extra.length).toBeGreaterThan(0)
    expect(extra.length % levels).toBe(0)
    expect(extra.some((r) => r.mark.startsWith('C1-I'))).toBe(true)
    expect(cage.notes ?? []).toEqual([])
  })

  it('a symmetric 8-bar column gets exactly one diamond per level', () => {
    const eight = buildColumnCage({ ...col, b: 400, h: 400, bars: 8 })
    const levels = tieLevels(col).length
    const dia = eight.runs.filter((r) => r.mark.includes('-D'))
    expect(dia).toHaveLength(levels)
    for (const d of dia) { expect(d.closed).toBe(true); expect(d.path).toHaveLength(4) }
  })

  it('alternates the hook corner up the column — §418.7.5.3', () => {
    // Stacked in one corner, every hook in the column lands on the same two
    // bars and the splitting they resist is unrestrained everywhere else.
    const hoops = cage.runs.filter((r) => r.mark.startsWith('C1-T'))
    const starts = hoops.map((r) => `${r.path[0][0].toFixed(4)},${r.path[0][2].toFixed(4)}`)
    expect(new Set(starts).size).toBe(4)                 // all four corners used
    expect(starts[0]).not.toBe(starts[1])                // and never twice running
    for (let k = 1; k < starts.length; k++) expect(starts[k]).not.toBe(starts[k - 1])
    // the bar itself is unchanged — same four corners, just started elsewhere
    const asSet = (r: typeof hoops[number]) =>
      new Set(r.path.map((p) => `${p[0].toFixed(4)},${p[2].toFixed(4)}`))
    for (const h of hoops) expect(asSet(h)).toEqual(asSet(hoops[0]))
  })

  it('runs every vertical the full height of the column', () => {
    for (const r of cage.runs.filter((x) => x.role === 'vertical')) {
      expect(r.path).toHaveLength(2)
      expect(r.path[0][1]).toBeCloseTo(0, 9)
      expect(r.path[1][1]).toBeCloseTo(3, 9)
      expect(r.bendDia).toEqual([])                  // a straight bar has no bend
    }
  })

  it('closes each tie on the cover line, bent to the transverse rule', () => {
    const t = cage.runs.find((r) => r.role === 'tie')!
    expect(t.closed).toBe(true)
    expect(t.path).toHaveLength(4)
    for (const [x, , z] of t.path) {
      expect(Math.abs(x)).toBeCloseTo(0.254, 9)      // 600/2 − 40 − 6
      expect(Math.abs(z)).toBeCloseTo(0.154, 9)      // 400/2 − 40 − 6
    }
    // §425.3.2 lets a ⌀12 tie turn at 4db, not the 6db of a main bar
    expect(t.bendDia).toEqual([48, 48, 48, 48])
    expect(stirrupBendDiameter(12)).toBe(48)
  })

  it('develops a tie as its perimeter, less the four bends, PLUS both hooks', () => {
    // Two corrections, and they pull opposite ways. The bar cuts each corner,
    // so it is shorter than the rectangle by the bend deduction — but a closed
    // tie also has two 135° hooks anchoring it into the core, which no vertex
    // of a closed loop can express and which more than cancel the saving.
    // Counting only the deduction buys every tie in the job short.
    const t = cage.runs.find((r) => r.role === 'tie')!
    const perimeter = 2 * (0.508 + 0.308) * 1000     // 2(2·0.254 + 2·0.154) mm
    const bends = 4 * (48 / 2 + 12 / 2) * (2 - Math.PI / 2)
    const hooks = stirrupHookAllowance(12)           // 2 × (max(6·12, 75) + 3·12)
    expect(t.hookAllowance).toBeCloseTo(hooks, 9)
    expect(cutLength(t)).toBeCloseTo(perimeter - bends + hooks, 6)
    expect(cutLength(t)).toBeGreaterThan(perimeter)
  })

  it('rounds an odd bar count UP to one it can actually place', () => {
    // Intermediate bars go on in mirrored pairs, so after the four corners the
    // remainder has to be even. An odd request cannot be placed symmetrically.
    // This is silent otherwise: the P–M check runs on 9 bars and the drawing
    // and the bill carry 10.
    for (const n of [4, 6, 8, 10, 12]) {
      expect(placedBarCount(n)).toBe(n)
      expect(perimeterBars({ ...col, bars: n }).length).toBe(n)
    }
    for (const [asked, placed] of [[5, 6], [7, 8], [9, 10], [11, 12], [13, 14]]) {
      expect(placedBarCount(asked)).toBe(placed)
      expect(perimeterBars({ ...col, bars: asked }).length).toBe(placed)
    }
  })

  it('never places fewer bars than asked for', () => {
    // The rounding must go UP — adding steel is conservative against the P–M
    // check that was run on the requested count, dropping one is not.
    for (let n = 4; n <= 24; n++) {
      expect(perimeterBars({ ...col, bars: n }).length).toBeGreaterThanOrEqual(n)
    }
  })

  it('places the cage about the centre it is given', () => {
    const off = buildColumnCage({ ...col, centre: [6, 4.5] })
    const xs = off.runs.filter((r) => r.role === 'vertical').map((r) => r.path[0][0])
    const zs = off.runs.filter((r) => r.role === 'vertical').map((r) => r.path[0][2])
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(6, 9)
    expect((Math.min(...zs) + Math.max(...zs)) / 2).toBeCloseTo(4.5, 9)
  })
})

describe('a tie SET is a stack, not a plane', () => {
  const cage = buildColumnCage(col)

  it('lays every tie at a level a diameter above the last', () => {
    // The hoop and its supplementary ties are separate bars resting on one
    // another. Placed at one y they occupied the same steel at every shared
    // corner — four bars in one bar's space.
    const level = tieLevels(col)[0]
    const set = cage.runs.filter((r) => r.role === 'tie' && Math.abs(r.path[0][1] - level) < 0.05)
    const ys = [...new Set(set.map((r) => Math.round(r.path[0][1] * 1e6) / 1e6))].sort((a, b) => a - b)
    expect(ys).toHaveLength(set.length)
    for (let k = 1; k < ys.length; k++) expect(ys[k] - ys[k - 1]).toBeCloseTo(col.tieDia / 1000, 9)
  })

  it('centres the stack on the level, so the SPACING is set-to-set', () => {
    // `sConfined` on a schedule is the pitch of the sets. Stacking upwards from
    // the level would have quietly shortened every gap by the stack's height.
    const levels = tieLevels(col)
    for (const level of levels) {
      const set = cage.runs.filter((r) => r.role === 'tie' && Math.abs(r.path[0][1] - level) < 0.05)
      const ys = set.map((r) => r.path[0][1])
      const mid = (Math.min(...ys) + Math.max(...ys)) / 2
      expect(mid).toBeCloseTo(level, 9)
    }
  })
})

describe('lap splice into the storey above — §25.5.5 / §10.7.4.1', () => {
  const base = {
    mark: 'C1', b: 400, h: 400, cover: 40, barDia: 20, bars: 8, tieDia: 10,
    sConfined: 100, sOutside: 200, lo: 600,
    centre: [0, 0] as [number, number], yBottom: 0, yTop: 3,
  }
  const verts = (c: ReturnType<typeof buildColumnCage>) => c.runs.filter((r) => r.role === 'vertical')

  it('stops at the top of the column when nothing laps onto it', () => {
    for (const v of verts(buildColumnCage(base))) {
      expect(Math.max(...v.path.map((p) => p[1]))).toBeCloseTo(3, 9)
      expect(v.path.length).toBe(2)                     // straight, no crank
    }
  })

  it('projects exactly the lap it is given, above the top of the column', () => {
    for (const v of verts(buildColumnCage({ ...base, spliceLap: 620 }))) {
      expect(Math.max(...v.path.map((p) => p[1]))).toBeCloseTo(3.62, 9)
      expect(Math.min(...v.path.map((p) => p[1]))).toBeCloseTo(0, 9)
    }
  })

  it('cranks the projecting part one bar diameter INBOARD, at 1 in 6', () => {
    // ACI 318-14 §10.7.4.1: the inclined part of an offset bend is no steeper
    // than 1 in 6. Without the offset the lapping bar above has nowhere to sit.
    const cage = buildColumnCage({ ...base, spliceLap: 620 })
    for (const v of verts(cage)) {
      expect(v.path.length).toBe(4)
      const [start, kinkLo, kinkHi, top] = v.path
      // the crank happens inside the column, finishing at its top
      expect(kinkHi[1]).toBeCloseTo(3, 9)
      expect(kinkLo[1]).toBeLessThan(3)
      // A corner bar moves in on BOTH axes, so its resultant offset is db√2 —
      // and 1 in 6 is a limit on the bar, not on each axis separately. Six
      // diameters of run per axis would be a 1-in-4.2 slope and illegal.
      const across = Math.hypot(kinkHi[0] - kinkLo[0], kinkHi[2] - kinkLo[2])
      const along = kinkHi[1] - kinkLo[1]
      // one diameter per face the bar sits against: db on a face, db√2 on a corner
      const one = 20 / 1000
      expect([one, one * Math.SQRT2].some((e) => Math.abs(across - e) < 1e-9)).toBe(true)
      expect(along / across).toBeCloseTo(OFFSET_BEND_SLOPE, 6)
      expect(top[0]).toBeCloseTo(kinkHi[0], 9)
      expect(top[2]).toBeCloseTo(kinkHi[2], 9)
      // …and it moves TOWARD the column centre, never out through the cover
      expect(Math.hypot(kinkHi[0], kinkHi[2])).toBeLessThan(Math.hypot(start[0], start[2]))
      expect(v.bendDia.length).toBe(2)
    }
  })

  it('a mid-face bar cranks off its own face only, not diagonally', () => {
    // 12 bars on a square column puts one bar in the middle of each face. It
    // sits against one face, so it moves in on one axis; a corner bar sits
    // against two and moves in on both.
    const cage = buildColumnCage({ ...base, bars: 12, spliceLap: 620 })
    const moved = verts(cage).map((v) => {
      const lo = v.path[1], hi = v.path[2]
      return [Math.abs(hi[0] - lo[0]) > 1e-9, Math.abs(hi[2] - lo[2]) > 1e-9]
    })
    expect(moved.filter(([a, b]) => a && b).length).toBe(4)          // the corners
    expect(moved.filter(([a, b]) => a !== b).length).toBe(8)         // the mid-face bars
    expect(moved.every(([a, b]) => a || b)).toBe(true)               // none stays put
  })

  it('a column too short for the crank still gets its lap, straight', () => {
    // Guard rather than geometry: a stub shorter than the offset bend cannot
    // hold one, and a bar bent over its whole length would be worse than none.
    const cage = buildColumnCage({ ...base, yTop: 0.1, spliceLap: 620 })
    for (const v of verts(cage)) {
      expect(v.path.length).toBe(2)
      expect(Math.max(...v.path.map((p) => p[1]))).toBeCloseTo(0.72, 9)
    }
  })
})
