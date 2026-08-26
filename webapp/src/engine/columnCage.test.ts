import { describe, it, expect } from 'vitest'
import {
  buildColumnCage, perimeterBars, placedBarCount, tieLevels, barInset, OFFSET_BEND_SLOPE,
  type ColumnCageInput,
} from './columnCage'
import { cutLength, stirrupBendDiameter, stirrupHookAllowance, polylineLength } from './rebarModel'

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
    const y = tieLevels({ ...col, jointGaps: [[1.4, 1.9]] })
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

  it('develops a tie as its perimeter, less the bends, PLUS the closure', () => {
    // Three corrections, and they do not pull the same way. The bar cuts each
    // corner, so it is shorter than the rectangle by the bend deduction — but
    // a tie is ONE bar, so the corner it closes at is not a corner at all: no
    // 90° bend is made there, and instead each end sweeps 135° around the
    // corner longitudinal bar and runs its extension into the core.
    const t = cage.runs.find((r) => r.role === 'tie')!
    const perimeter = 2 * (0.508 + 0.308) * 1000     // 2(2·0.254 + 2·0.154) mm
    const bends = 4 * (48 / 2 + 12 / 2) * (2 - Math.PI / 2)
    // R is the WRAP radius the hook is drawn to, (20 + 12)/2 = 16 mm
    const closure = 16 * ((3 * Math.PI) / 2 - Math.PI / 2) + 2 * Math.max(6 * 12, 75)
    expect(closure).toBeCloseTo(200.27, 2)
    expect(t.hookAllowance).toBeCloseTo(closure, 9)
    // …and the bar leans a diameter aside over its run, so the stock it comes
    // from is the hypotenuse — 0.04 mm on a 1.6 m tie
    const flat = perimeter - bends + closure
    expect(cutLength(t)).toBeCloseTo(Math.hypot(flat, 12), 6)
    expect(cutLength(t)).toBeGreaterThan(flat)
    expect(cutLength(t)).toBeGreaterThan(perimeter)
    // the old rule of thumb bought a 90° bend nobody makes
    expect(closure).toBeLessThan(stirrupHookAllowance(12))
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

describe('a column that STOPS hooks its bars in — §425.4.2 roof joint', () => {
  it('carries the bar past the top and turns it 12·db inward', () => {
    // A bar that just ends is not anchored. With nothing above to lap onto it
    // develops itself instead: up under the beam's top steel, then across.
    const cage = buildColumnCage({ ...col, spliceLap: 0, topHookRise: 0.17 })
    const v = cage.runs.filter((r) => r.role === 'vertical')
    for (const r of v) {
      const [x, , z] = r.path[r.path.length - 2]
      const [hx, hy, hz] = r.path[r.path.length - 1]
      expect(hy).toBeCloseTo(Math.max(col.yBottom, col.yTop) + 0.17, 9)
      // …horizontal, 12·db long, and laid ACROSS the core rather than out of it
      expect(Math.hypot(hx - x, hz - z)).toBeCloseTo((12 * col.barDia) / 1000, 9)
      const xhF = (col.h / 2 - 62) / 1000, zbF = (col.b / 2 - 62) / 1000
      expect(Math.abs(hx - col.centre[0])).toBeLessThanOrEqual(xhF + 1e-9)
      expect(Math.abs(hz - col.centre[1])).toBeLessThanOrEqual(zbF + 1e-9)
      expect(r.bendDia[r.bendDia.length - 1]).toBeGreaterThan(0)
    }
  })

  it('runs the bar on into the lap instead wherever a column continues', () => {
    const cage = buildColumnCage({ ...col, spliceLap: 600, topHookRise: 0.17 })
    for (const r of cage.runs.filter((x) => x.role === 'vertical')) {
      const top = r.path[r.path.length - 1]
      expect(top[1]).toBeCloseTo(Math.max(col.yBottom, col.yTop) + 0.6, 9)
    }
  })

  it('says so when the column is too narrow for the full extension', () => {
    // 12·db has to fit between the bar and the far side of the core. A ⌀25 bar
    // in a 300 column cannot turn 300 mm in, and the detail is short.
    const cage = buildColumnCage({ ...col, b: 300, h: 300, barDia: 25, spliceLap: 0, topHookRise: 0.1 })
    expect((cage.notes ?? []).some((n) => /short of the 12db/.test(n))).toBe(true)
  })
})

describe('a CROSS TIE is billed as the single-legged bar it is', () => {
  it('buys the leg between the bars, plus a full turn round each and two tails', () => {
    // Its path is the two longitudinal bars it grips, so the polyline buys the
    // centre-to-centre leg and nothing else. The steel also turns a full 180°
    // around each bar — 2·πR, not the 6·dt the old rule of thumb guessed — and
    // runs a §425.3.2 extension off each.
    const cage = buildColumnCage({ ...col, bars: 10 })
    const x = cage.runs.find((r) => r.role === 'tie' && r.closed === false)
    expect(x).toBeDefined()
    const R = (col.barDia + col.tieDia) / 2
    expect(x!.hookAllowance).toBeCloseTo(2 * Math.PI * R + 2 * Math.max(6 * col.tieDia, 75), 9)
    // an open run has no interior vertex, so nothing is deducted and no lean
    // applies: the bar is straight between its two turns
    const leg = polylineLength(x!.path) * 1000
    expect(cutLength(x!)).toBeCloseTo(leg + x!.hookAllowance!, 9)
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

describe('a column that REDUCES cranks its bars to meet the ones above', () => {
  const lap = 600
  /** How far in a bar stands from the centreline, mm. */
  const inset = (h: number, cover = 40, tie = 12, bar = 20) => h / 2 - (cover + tie + bar / 2)

  it('cranks by the difference in bar line, not by a fixed diameter', () => {
    // 600 deep reducing to 500: the bar above stands 50 mm further in, so the
    // bar below has to move 50 — not the 20 it moves when nothing changes.
    const cage = buildColumnCage({ ...col, spliceLap: lap, above: { b: col.b, h: 500 } })
    const v = cage.runs.filter((r) => r.role === 'vertical')
    const onFace = v.filter((r) => Math.abs(Math.abs(r.path[0][0]) - inset(col.h) / 1000) < 1e-9)
    expect(onFace.length).toBeGreaterThan(0)
    for (const r of onFace) {
      const start = r.path[0][0], top = r.path[r.path.length - 1][0]
      expect(Math.abs(start) - Math.abs(top)).toBeCloseTo(inset(600) / 1000 - inset(500) / 1000, 9)
      expect(Math.abs(top)).toBeCloseTo(inset(500) / 1000, 9)     // …lands ON the upper bar
    }
  })

  it('still steps a diameter clear where the column does NOT change', () => {
    const cage = buildColumnCage({ ...col, spliceLap: lap })
    const r = cage.runs.find((x) => x.role === 'vertical'
      && Math.abs(Math.abs(x.path[0][0]) - inset(col.h) / 1000) < 1e-9)!
    const start = r.path[0][0], top = r.path[r.path.length - 1][0]
    expect(Math.abs(start) - Math.abs(top)).toBeCloseTo(col.barDia / 1000, 9)
  })

  it('holds the 1-in-6 slope however far the bar has to move (§410.7.4.1)', () => {
    const cage = buildColumnCage({ ...col, spliceLap: lap, above: { b: col.b, h: 500 } })
    for (const r of cage.runs.filter((x) => x.role === 'vertical')) {
      // the crank is the segment where x or z changes
      for (let k = 1; k < r.path.length; k++) {
        const dx = r.path[k][0] - r.path[k - 1][0], dz = r.path[k][2] - r.path[k - 1][2]
        const dy = r.path[k][1] - r.path[k - 1][1]
        const across = Math.hypot(dx, dz)
        if (across < 1e-9) continue
        expect(dy / across).toBeGreaterThanOrEqual(OFFSET_BEND_SLOPE - 1e-6)
      }
    }
  })

  it('refuses the bend §410.7.4.5 forbids, and says to dowel instead', () => {
    // 600 → 400 moves a bar 100 mm, past the 75 mm limit.
    const cage = buildColumnCage({ ...col, spliceLap: lap, above: { b: col.b, h: 400 } })
    expect((cage.notes ?? []).some((n) => /may not be bent/.test(n))).toBe(true)
    for (const r of cage.runs.filter((x) => x.role === 'vertical')) {
      // straight to the top: no crank drawn that nobody may make
      const xs = new Set(r.path.map((p) => Math.round(p[0] * 1e6)))
      expect(xs.size).toBe(1)
    }
  })
})

describe('lap splice location — §418.7.4.3', () => {
  const base = {
    mark: 'C1', b: 400, h: 400, cover: 40, barDia: 20, bars: 8, tieDia: 10,
    sConfined: 100, sOutside: 150, lo: 0.6, centre: [0, 0] as [number, number],
    yBottom: 0, yTop: 3, spliceLap: 600,
  }

  it('starts the lap inside the CENTRE HALF of the column above, not at the floor', () => {
    // Left at the floor the lap sits in the storey's bottom quarter — the
    // high-tensile-stress zone under lateral load, which is precisely where
    // §418.7.4.3 does not allow it. A 3 m storey puts the window at 0.75.
    const at = buildColumnCage({ ...base, spliceRise: 0.75 })
    const v = at.runs.find((r) => r.role === 'vertical')!
    const top = Math.max(...v.path.map((p) => p[1]))
    expect(top).toBeCloseTo(3 + 0.75 + 0.6, 9)          // rise, then the lap
    expect(top - 3).toBeGreaterThan(3 / 4)               // starts past h/4
    expect(top - 3).toBeLessThanOrEqual(3 * 0.75 + 1e-9) // and ends by 3h/4
  })

  it('ignores the rise where there is nothing to lap onto', () => {
    // A roof column has no splice, so a rise would just be bar hanging in air.
    const roof = buildColumnCage({ ...base, spliceLap: 0, spliceRise: 0.75 })
    const v = roof.runs.find((r) => r.role === 'vertical')!
    expect(Math.max(...v.path.map((p) => p[1]))).toBeCloseTo(3, 9)
  })

  it('carries the cranked bar up into the window too, crank finished by the floor', () => {
    const step = buildColumnCage({
      ...base, spliceRise: 0.75, above: { b: 300, h: 300, cover: 40, barDia: 20, tieDia: 10 },
    })
    const v = step.runs.find((r) => r.role === 'vertical')!
    expect(Math.max(...v.path.map((p) => p[1]))).toBeCloseTo(3 + 0.75 + 0.6, 9)
    // the offset is complete AT the floor — nothing bends inside the joint above
    const atFloor = v.path.find((p) => Math.abs(p[1] - 3) < 1e-9)!
    const above = v.path.filter((p) => p[1] > 3 + 1e-9)
    for (const p of above) {
      expect(p[0]).toBeCloseTo(atFloor[0], 9)
      expect(p[2]).toBeCloseTo(atFloor[2], 9)
    }
  })
})
