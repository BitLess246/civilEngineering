import { describe, it, expect } from 'vitest'
import {
  buildColumnCage, perimeterBars, placedBarCount, tieLevels, barInset, type ColumnCageInput,
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

  it('carries one run per vertical and one per tie', () => {
    const v = cage.runs.filter((r) => r.role === 'vertical')
    const t = cage.runs.filter((r) => r.role === 'tie')
    expect(v).toHaveLength(12)
    expect(t).toHaveLength(tieLevels(col).length)
    expect(cage.member).toBe('C1')
    for (const r of cage.runs) expect(r.member).toBe('C1')
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
