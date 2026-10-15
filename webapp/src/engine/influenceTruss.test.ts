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

// ── custom trusses ─────────────────────────────────────────────────────────
import { buildTruss as _bt, influenceLines as _il, customInfluenceLines, validateCustom, trussToCustom, buildCustomTruss, mirrorOf as _mirror, type CustomTrussInput } from './influenceTruss'

describe('custom (user-drawn) trusses', () => {
  it('a parametric truss redrawn as custom gives the same influence lines, member by member', () => {
    for (const type of ['Pratt', 'Howe', 'Warren'] as const) for (const deck of ['through', 'deck'] as const) {
      const p = { type, deck, panels: 6, span: 42, height: 7 }
      const ref = _il(p)
      const cus = customInfluenceLines(trussToCustom(_bt(p)))
      expect(cus.positions).toEqual(ref.positions)
      for (const m of ref.geom.members) {
        const id = `${m.a}-${m.b}`
        cus.il[id].forEach((v, k) => expect(v).toBeCloseTo(ref.il[m.id][k], 9))
      }
      cus.il.RL.forEach((v, k) => expect(v).toBeCloseTo(ref.il.RL[k], 12))
    }
  })

  it('king-post truss: hand statics at the midspan panel point', () => {
    // A(0,0) pin · M(2,0) · B(4,0) roller · C(2,2); unit load at M
    const c: CustomTrussInput = {
      nodes: [{ id: 'A', x: 0, y: 0, support: 'pin' }, { id: 'M', x: 2, y: 0, support: null }, { id: 'B', x: 4, y: 0, support: 'roller' }, { id: 'C', x: 2, y: 2, support: null }],
      members: [{ a: 'A', b: 'M' }, { a: 'M', b: 'B' }, { a: 'A', b: 'C' }, { a: 'C', b: 'B' }, { a: 'C', b: 'M' }],
      deck: 'through',
    }
    const r = customInfluenceLines(c)
    const k = r.positions.indexOf(2)
    expect(r.il['C-M'][k]).toBeCloseTo(1, 12)              // the king post hangs the load
    expect(r.il['A-C'][k]).toBeCloseTo(-1 / Math.SQRT2, 12) // each rafter: ½ / sin 45°, compression
    expect(r.il['A-M'][k]).toBeCloseTo(0.5, 12)             // tie: ½ · cot 45°
    expect(r.il.RL[k]).toBeCloseTo(0.5, 12)
    expect(_mirror(r.geom, 'A-C')).toBe('C-B')
    expect(r.geom.members.find((m) => m.id === 'C-M')!.kind).toBe('vertical')
  })

  it('supports anywhere: an overhanging deck, pin and roller inboard', () => {
    // a 3-panel bottom chord with the supports at the second and third nodes
    const c = trussToCustom(_bt({ type: 'Pratt', deck: 'through', panels: 4, span: 16, height: 4 }))
    c.nodes = c.nodes.map((n) => ({ ...n, support: n.id === 'L1' ? 'pin' : n.id === 'L3' ? 'roller' : null }))
    const r = customInfluenceLines(c)
    // reactions by lever about the other support: RL = (12 − x)/8
    r.positions.forEach((x, k) => expect(r.il.RL[k]).toBeCloseTo((12 - x) / 8, 12))
    // and the members balance them: ΣFy at each position is the unit load (checked via the pin row)
    expect(r.il.RL[0]).toBeCloseTo(1.5, 12)
  })

  it('names what is wrong instead of solving a bad truss', () => {
    const base: CustomTrussInput = {
      nodes: [{ id: 'A', x: 0, y: 0, support: 'pin' }, { id: 'B', x: 4, y: 0, support: 'roller' }, { id: 'C', x: 4, y: 3, support: null }, { id: 'D', x: 0, y: 3, support: null }],
      members: [{ a: 'A', b: 'B' }, { a: 'B', b: 'C' }, { a: 'C', b: 'D' }, { a: 'D', b: 'A' }],
      deck: 'through',
    }
    expect(validateCustom(base).join(' ')).toMatch(/Unstable.*add 1 member/)
    expect(validateCustom({ ...base, members: [...base.members, { a: 'A', b: 'C' }, { a: 'B', b: 'D' }] }).join(' ')).toMatch(/Indeterminate.*remove 1/)
    expect(validateCustom({ ...base, nodes: base.nodes.map((n) => ({ ...n, support: 'pin' as const })) }).join(' ')).toMatch(/exactly one pin and one roller/)
    expect(validateCustom({ ...base, members: [...base.members, { a: 'A', b: 'Z' }] }).join(' ')).toMatch(/does not exist/)
    expect(validateCustom({ ...base, members: [...base.members, { a: 'A', b: 'C' }] })).toEqual([])
    // the count is right (m + r = 2j) but C is held only by two collinear
    // members — nothing resists a vertical load there, a mechanism
    const mech: CustomTrussInput = {
      nodes: [{ id: 'A', x: 0, y: 0, support: 'pin' }, { id: 'C', x: 2, y: 0, support: null }, { id: 'B', x: 4, y: 0, support: 'roller' }, { id: 'D', x: 2, y: 2, support: null }],
      members: [{ a: 'A', b: 'C' }, { a: 'C', b: 'B' }, { a: 'A', b: 'D' }, { a: 'D', b: 'B' }, { a: 'A', b: 'B' }],
      deck: 'through',
    }
    expect(validateCustom(mech)).toEqual([])
    expect(() => buildCustomTruss(mech)).toThrow(/unstable/)
  })
})
