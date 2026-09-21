import { describe, it, expect } from 'vitest'
import {
  influenceLines, ilAt, ilArea, ilExtremes, buildTruss, mirrorOf, validateInput,
  type InfluenceInput,
} from './influenceTruss'

const prattThrough: InfluenceInput = { type: 'Pratt', deck: 'through', panels: 6, span: 6, height: 1 }
const ord = (id: string) => influenceLines(prattThrough).il[id]
const at = (id: string, k: number) => ord(id)[k]

// ─────────────────────────────────────────────────────────────────────────
// Every numeric expectation below was derived by the method of sections on
// the paper figure, independently of the solver: cut the panel, eliminate
// the two members whose lines of action meet at the moment centre, read the
// third from ΣM, ΣFx or ΣFy. L = 6 m, h = 1 m gives p = 1 m and 45°
// diagonals, so sin θ = cos θ = 1/√2 and the numbers stay exact.
// ─────────────────────────────────────────────────────────────────────────

describe('Pratt, 6 panels, through — against hand cut sections', () => {
  it('a load standing on a support stresses nothing', () => {
    const res = influenceLines(prattThrough)
    for (const m of res.geom.members) {
      expect(res.il[m.id][0], `${m.id} at L0`).toBeCloseTo(0, 9)
      expect(res.il[m.id][res.positions.length - 1], `${m.id} at L6`).toBeCloseTo(0, 9)
    }
  })

  it('reactions are the simply-supported statics at every panel point', () => {
    const row = [1, 5 / 6, 2 / 3, 1 / 2, 1 / 3, 1 / 6, 0]
    ord('RL').forEach((v, k) => expect(v, `k=${k}`).toBeCloseTo(row[k], 9))
  })

  it('unit load at L1 — bottom chord L1–L2 = +5/6 (ΣM about U1)', () => {
    expect(at('L1-L2', 1)).toBeCloseTo(5 / 6, 9)
  })

  it('unit load at L1 — bottom chord L2–L3 = +2/3, top chord U2–U3 = −1/2', () => {
    expect(at('L2-L3', 1)).toBeCloseTo(2 / 3, 9)
    expect(at('U2-U3', 1)).toBeCloseTo(-1 / 2, 9)
  })

  it('unit load at L1 — panel-1 diagonal in compression (negative shear), vertical picks up the flip', () => {
    // ΣFy on the panel-1 cut: RL − 1 − D1/√2 = 0 → D1 = −√2/6
    expect(at('D1', 1)).toBeCloseTo(-Math.SQRT2 / 6, 9)
    // joint L2: V2 + D1/√2 = 0 → V2 = +1/6
    expect(at('V2', 1)).toBeCloseTo(1 / 6, 9)
  })

  it('unit load at L2 — bottom chord L2–L3 = +4/3 (ΣM about U2), diagonal flips to compression', () => {
    expect(at('L2-L3', 2)).toBeCloseTo(4 / 3, 9)
    expect(at('U2-U3', 2)).toBeCloseTo(-1, 9)
    expect(at('D2', 2)).toBeCloseTo(-Math.SQRT2 / 3, 9)
    // joint L2 now carries the load: −1 + V2 + D1/√2 = 0 with D1 = (2/3)√2
    expect(at('V2', 2)).toBeCloseTo(1 / 3, 9)
  })

  it('unit load at midspan — bottom chord L2–L3 = +1, top chord −3/2, diagonal back in tension', () => {
    expect(at('L2-L3', 3)).toBeCloseTo(1, 9)
    expect(at('U2-U3', 3)).toBeCloseTo(-3 / 2, 9)
    expect(at('D2', 3)).toBeCloseTo(Math.SQRT2 / 2, 9)
    expect(at('V2', 3)).toBeCloseTo(-1 / 2, 9)
  })

  it('the whole influence line of bottom chord L2–L3, ordinate by ordinate', () => {
    const row = [0, 2 / 3, 4 / 3, 1, 2 / 3, 1 / 3, 0]
    ord('L2-L3').forEach((v, k) => expect(v, `k=${k}`).toBeCloseTo(row[k], 9))
  })

  it('the whole influence line of top chord U2–U3 = −min(x, L−x)/(2h)', () => {
    const row = [0, -1 / 2, -1, -3 / 2, -1, -1 / 2, 0]
    ord('U2-U3').forEach((v, k) => expect(v, `k=${k}`).toBeCloseTo(row[k], 9))
  })
})

describe('Pratt with deck (top-chord) loading', () => {
  const deck: InfluenceInput = { type: 'Pratt', deck: 'deck', panels: 6, span: 6, height: 1 }
  const res = influenceLines(deck)
  const x = (v: number) => res.positions.indexOf(v)

  it('a load at an abutment goes straight into the bearing', () => {
    for (const m of res.geom.members) {
      expect(res.il[m.id][0], `${m.id} at Abut. L`).toBeCloseTo(0, 9)
      expect(res.il[m.id][res.positions.length - 1], `${m.id} at Abut. R`).toBeCloseTo(0, 9)
    }
  })

  it('chord ordinates depend on x only — identical to the through truss at the same x', () => {
    for (const id of ['L2-L3', 'U2-U3', 'L0-L1', 'U1-U2']) {
      for (const xi of [1, 2, 3, 4, 5]) {
        expect(res.il[id][x(xi)], `${id} @x=${xi}`).toBeCloseTo(at(id, xi), 9)
      }
    }
  })

  it('the vertical takes the deck load from above — V2 = −2/3 at U2 (through gives +1/3)', () => {
    expect(res.il.V2[x(2)]).toBeCloseTo(-2 / 3, 9)
  })

  it('panel-2 diagonal under a deck load at U2: same shear, still compression −√2/3', () => {
    expect(res.il.D2[x(2)]).toBeCloseTo(-Math.SQRT2 / 3, 9)
  })

  it('bottom chord L2–L3 = +4/3 when the unit load stands at U2', () => {
    expect(res.il['L2-L3'][x(2)]).toBeCloseTo(4 / 3, 9)
  })
})

describe('Howe, 6 panels, through — diagonals slope the other way', () => {
  const res = influenceLines({ type: 'Howe', deck: 'through', panels: 6, span: 6, height: 1 })

  it('unit load at L2: bottom chord L2–L3 = +1 (ΣM about U3), top chord −4/3 (ΣM about L2), D2 tension √2/3, centre vertical zero', () => {
    expect(res.il['L2-L3'][2]).toBeCloseTo(1, 9)
    expect(res.il['U2-U3'][2]).toBeCloseTo(-4 / 3, 9)
    expect(res.il.D2[2]).toBeCloseTo(Math.SQRT2 / 3, 9)
    expect(res.il.V3[2]).toBeCloseTo(0, 9)
  })

  it('unit load at L1: the cut end of D1 (U2–L1) is at L1 on the left body, so the negative panel shear leaves it in tension +√2/6', () => {
    expect(res.il.D1[1]).toBeCloseTo(Math.SQRT2 / 6, 9)
  })
})

describe('Warren with verticals, 4 panels, through', () => {
  const res = influenceLines({ type: 'Warren', deck: 'through', panels: 4, span: 4, height: 1 })

  it('unit load at L1: bottom chord L1–L2 = +3/4, top chord U1–U3 = −1/2, panel diagonal in compression', () => {
    expect(res.il['L1-L2'][1]).toBeCloseTo(3 / 4, 9)
    expect(res.il['U1-U3'][1]).toBeCloseTo(-1 / 2, 9)
    expect(res.il.D1[1]).toBeCloseTo(-Math.SQRT2 / 4, 9)
  })

  it('the end diagonal carries the reaction down: D0 = −RL·√2 = −3√2/4, and the load path leaves V1 = +1', () => {
    expect(res.il.D0[1]).toBeCloseTo(-3 * Math.SQRT2 / 4, 9)
    expect(res.il.V1[1]).toBeCloseTo(1, 9)
  })

  it('unit load at midspan: panel shear RL = 1/2 puts both centre diagonals in tension √2/2', () => {
    expect(res.il.D1[2]).toBeCloseTo(Math.SQRT2 / 2, 9)
    expect(res.il.D2[2]).toBeCloseTo(Math.SQRT2 / 2, 9)
    expect(res.il.V1[2]).toBeCloseTo(0, 9)
  })
})

describe('invariants, across every family, deck level and panel count', () => {
  const shapes: InfluenceInput[] = []
  for (const type of ['Pratt', 'Howe', 'Warren'] as const)
    for (const deck of ['through', 'deck'] as const)
      for (const panels of [4, 6, 8])
        shapes.push({ type, deck, panels, span: panels * 2, height: 2 })

  it('every shape builds determinate (the builder asserts m + r = 2j)', () => {
    for (const s of shapes) expect(buildTruss(s).determinate).toBe(true)
  })

  it('reactions sum to the unit load at every position', () => {
    for (const s of shapes) {
      const res = influenceLines(s)
      for (let k = 0; k < res.positions.length; k++) {
        expect(res.il.RL[k] + res.il.RR[k], `${s.type}/${s.deck}/${s.panels} @k=${k}`).toBeCloseTo(1, 9)
      }
    }
  })

  it('influence lines are symmetric about midspan, member-for-mirror-member', () => {
    for (const s of shapes) {
      const res = influenceLines(s)
      for (const m of res.geom.members) {
        const mid = mirrorOf(res.geom, m.id)
        const row = res.il[m.id]
        if (mid) {
          const mirrorRow = res.il[mid]
          row.forEach((v, k) => expect(v, `${s.type}/${s.deck}/${s.panels} ${m.id} k=${k}`)
            .toBeCloseTo(mirrorRow[row.length - 1 - k], 9))
        } else {
          // self-mirrored member (centre vertical) mirrors onto itself
          row.forEach((v, k) => expect(v, `${s.type}/${s.deck}/${s.panels} ${m.id} (self) k=${k}`)
            .toBeCloseTo(row[row.length - 1 - k], 9))
        }
      }
    }
  })
})

describe('reading the lines — interpolation and area', () => {
  const res = influenceLines(prattThrough)

  it('mid-panel ordinates are the linear average (floor-beam sharing)', () => {
    expect(ilAt(res, 'L2-L3', 1.5)).toBeCloseTo((2 / 3 + 4 / 3) / 2, 12)
    expect(ilAt(res, 'L2-L3', 0)).toBeCloseTo(0, 12)
    expect(ilAt(res, 'L2-L3', 7)).toBeCloseTo(0, 12)
  })

  it('the area under the reaction line is L/2', () => {
    expect(ilArea(res, 'RL', 0, 6)).toBeCloseTo(3, 9)
  })

  it('full-span uniform load: ∫ of the L2–L3 line = 4 kN per kN/m', () => {
    expect(ilArea(res, 'L2-L3', 0, 6)).toBeCloseTo(4, 9)
  })

  it('partial-span areas integrate trapezoid by trapezoid across the panels', () => {
    expect(ilArea(res, 'L2-L3', 1, 3)).toBeCloseTo(13 / 6, 9)
    expect(ilArea(res, 'L2-L3', 2.5, 3.5)).toBeCloseTo((4 / 3 + 1) / 2 / 2 + (1 + 2 / 3) / 2 / 2, 9)
    expect(ilArea(res, 'L2-L3', 3, 1)).toBeCloseTo(ilArea(res, 'L2-L3', 1, 3), 12) // order-insensitive
    expect(ilArea(res, 'L2-L3', -5, 0)).toBeCloseTo(0, 12)
  })

  it('extremes sit at panel points — the only candidates on a polygonal line', () => {
    const ex = ilExtremes(res, 'L2-L3')
    expect(ex.max).toBeCloseTo(4 / 3, 9)
    expect(ex.maxX).toBeCloseTo(2, 9)
    expect(ex.min).toBeCloseTo(0, 9)
  })
})

describe('input validation', () => {
  it('rejects odd, small and large panel counts', () => {
    expect(validateInput({ type: 'Pratt', deck: 'through', panels: 5, span: 10, height: 2 })).toHaveLength(1)
    expect(validateInput({ type: 'Pratt', deck: 'through', panels: 2, span: 10, height: 2 })).toHaveLength(1)
    expect(validateInput({ type: 'Pratt', deck: 'through', panels: 14, span: 10, height: 2 })).toHaveLength(1)
  })

  it('rejects non-physical dimensions and lets good input through', () => {
    expect(validateInput({ type: 'Warren', deck: 'deck', panels: 6, span: 0, height: 2 })).toHaveLength(1)
    expect(validateInput({ type: 'Warren', deck: 'deck', panels: 6, span: 10, height: 12 })).toHaveLength(1)
    expect(validateInput({ type: 'Warren', deck: 'deck', panels: 6, span: 10, height: 2 })).toEqual([])
  })

  it('buildTruss throws the first problem back', () => {
    expect(() => buildTruss({ type: 'Pratt', deck: 'through', panels: 7, span: 7, height: 1 })).toThrow(/even/)
  })
})
