import { describe, expect, it } from 'vitest'
import {
  buildBeam, solveUnitAt, effectPoints, ilValueAt, ilTotalArea,
  signRegions, placeLoads, reactionsUnder, stationLetters,
  validateBeamInput, type BeamInput,
} from './influenceBeam'

const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol)

// The board-exam sample: beam ABCD, 12 m, supports at B (x = 3, pin) and
// D (x = 12, roller); AB = 3, BC = 3, CD = 6. Loads: live 50 kN/m + 90 kN,
// dead 25 kN/m. Every expected value below is a hand statics derivation.
const SAMPLE: BeamInput = { length: 12, supports: [{ x: 3, kind: 'pin' }, { x: 12, kind: 'roller' }], hinges: [] }

describe('sample problem — reactions under the unit load', () => {
  const m = buildBeam(SAMPLE)

  it('load on the overhang lifts the far support', () => {
    const s = solveUnitAt(m, 0)
    near(s.reactions[0], 4 / 3)
    near(s.reactions[1], -1 / 3)
  })
  it('load at C shares 2/3 – 1/3', () => {
    const s = solveUnitAt(m, 6)
    near(s.reactions[0], 2 / 3)
    near(s.reactions[1], 1 / 3)
  })
  it('load on a support goes straight into it', () => {
    near(solveUnitAt(m, 3).reactions[0], 1)
    near(solveUnitAt(m, 12).reactions[1], 1)
  })
  it('station letters land as A B C D', () => {
    const l = stationLetters(m, 6).map((p) => p.letter)
    expect(l).toEqual(['A', 'B', 'C', 'D'])
  })
})

describe('sample problem — influence line of moment at C (x = 6)', () => {
  const m = buildBeam(SAMPLE)
  const pts = effectPoints(m, { kind: 'moment', x: 6 })

  it('ordinates −2 at A, +2 at C, 0 at D (hand: M_C = R_B·3 − (6−ξ))', () => {
    near(ilValueAt(pts, 0), -2)
    near(ilValueAt(pts, 3), 0)
    near(ilValueAt(pts, 6), 2)
    near(ilValueAt(pts, 12), 0)
  })
  it('negative region is the 3 m overhang, area −3', () => {
    const r = signRegions(pts, -1)
    expect(r).toHaveLength(1)
    near(r[0].a, 0); near(r[0].b, 3); near(r[0].length, 3); near(r[0].area, -3)
  })
  it('positive region is the 9 m span B→D, area +9', () => {
    const r = signRegions(pts, 1)
    expect(r).toHaveLength(1)
    near(r[0].a, 3); near(r[0].b, 12); near(r[0].length, 9); near(r[0].area, 9)
  })
  it('total signed area = +6 → dead load gives +150 kN·m at C', () => {
    near(ilTotalArea(pts), 6)
    near(25 * ilTotalArea(pts), 150)
  })
  it('(a) + (c): max negative M_C — 3 m of live UDL + the 90 kN at A', () => {
    const p = placeLoads(pts, 50, 90, -1)
    near(p.udlLength, 3)             // answer (a)
    near(p.udlEffect, -150)          // 50 × (−3)
    near(p.pointEffect!, -180)       // 90 × (−2) at x = 0
    near(p.pointX!, 0)
    near(p.liveTotal, -330)
    // dead is always on the whole beam: −330 + 150 = −180
    near(p.liveTotal + 25 * ilTotalArea(pts), -180)
  })
  it('max positive M_C (live only) = 630, +dead = 780', () => {
    const p = placeLoads(pts, 50, 90, 1)
    near(p.liveTotal, 630)
    near(p.liveTotal + 150, 780)
  })
})

describe('sample problem — influence line of shear at C (x = 6)', () => {
  const m = buildBeam(SAMPLE)
  const pts = effectPoints(m, { kind: 'shear', x: 6 })

  it('ordinates +1/3 at A, jump −1/3 → +2/3 at C, 0 at D', () => {
    near(ilValueAt(pts, 0), 1 / 3)
    near(ilValueAt(pts, 3), 0)
    const at = pts.filter((p) => Math.abs(p.x - 6) < 1e-9)
    expect(at).toHaveLength(2)
    near(at[0].v, -1 / 3)
    near(at[1].v, 2 / 3)
    expect(at[1].tag).toBeTruthy()
    near(ilValueAt(pts, 12), 0)
  })
  it('positive regions [0,3] and [6,12]: 9 m total, areas 0.5 + 2', () => {
    const r = signRegions(pts, 1)
    expect(r).toHaveLength(2)
    near(r[0].length, 3); near(r[0].area, 0.5)
    near(r[1].length, 6); near(r[1].area, 2)
  })
  it('total signed area = +2 → dead load gives +50 kN at C', () => {
    near(ilTotalArea(pts), 2)
    near(25 * ilTotalArea(pts), 50)
  })
  it('(d): max positive shear at C — live 185 kN, dead+live 235 kN', () => {
    const p = placeLoads(pts, 50, 90, 1)
    near(p.udlLength, 9)
    near(p.udlEffect, 125)           // 50 × 2.5
    near(p.pointEffect!, 60)         // 90 × 2/3, just right of C
    near(p.pointX!, 6)
    near(p.liveTotal, 185)
    near(p.liveTotal + 50, 235)
  })
  it('max negative shear at C = −55 live, −5 with dead', () => {
    const p = placeLoads(pts, 50, 90, -1)
    near(p.liveTotal, -55)
    near(p.liveTotal + 50, -5)
  })
})

describe('sample problem — reactions under the governing scenarios', () => {
  const m = buildBeam(SAMPLE)
  it('dead 25 kN/m everywhere: 200 kN at B, 100 kN at D', () => {
    const r = reactionsUnder(m, { udls: [{ a: 0, b: 12, w: 25 }], point: null })
    near(r[0], 200); near(r[1], 100)
  })
  it('live on the overhang + 90 kN at A: 295 kN at B, uplift −55 at D', () => {
    const r = reactionsUnder(m, { udls: [{ a: 0, b: 3, w: 50 }], point: { x: 0, p: 90 } })
    near(r[0], 295); near(r[1], -55)
  })
})

// ── Gerber beam with a hinge ──────────────────────────────────────────────

describe('hinged (Gerber) beam — 3 supports, hinge at x = 4', () => {
  const m = buildBeam({ length: 12, supports: [{ x: 0, kind: 'pin' }, { x: 6, kind: 'roller' }, { x: 12, kind: 'roller' }], hinges: [4] })

  it('load on the suspended-side cantilever: H = −ξ/4, far support lifts', () => {
    const s = solveUnitAt(m, 2)
    near(s.reactions[0], 0.5)
    near(s.reactions[1], 2 / 3)
    near(s.reactions[2], -1 / 6)
    near(s.hingeShears[0], -0.5)
  })
  it('load between the right supports ignores the hinge (ΣM about x=6: R12 = 2/6)', () => {
    const s = solveUnitAt(m, 8)
    near(s.reactions[0], 0)
    near(s.reactions[1], 2 / 3)
    near(s.reactions[2], 1 / 3)
    near(s.hingeShears[0], 0)
  })
  it('reaction IL of the end support: 0 → −1/3 over the cantilever body, then the right-span line', () => {
    const pts = effectPoints(m, { kind: 'reaction', support: 2 })
    near(ilValueAt(pts, 0), 0)
    near(ilValueAt(pts, 4), -1 / 3)
    near(ilValueAt(pts, 8), 1 / 3)
    near(ilValueAt(pts, 12), 1)
  })
  it('shear just left/right of the cantilever section x = 2', () => {
    const pts = effectPoints(m, { kind: 'shear', x: 2 })
    near(ilValueAt(pts, 1), -0.25)
    const at = pts.filter((p) => Math.abs(p.x - 2) < 1e-9)
    near(at[0].v, -0.5)
    near(at[1].v, 0.5)
  })
  it('moment at the hinge is zero for every load position', () => {
    for (const xi of [0, 1.3, 2, 4, 5.5, 8, 12])
      near(ilValueAt(effectPoints(m, { kind: 'moment', x: 4 }), xi), 0, 1e-8)
  })
  it('moment at x = 2 under the load standing there = R0·2 = 1.0', () => {
    near(ilValueAt(effectPoints(m, { kind: 'moment', x: 2 }), 2), 1.0)
  })
  it('hinge-shear IL jumps at the hinge: −1 just left, 0 just right, −ξ/4 rising across the cantilever body', () => {
    const pts = effectPoints(m, { kind: 'hinge', hinge: 0 })
    near(ilValueAt(pts, 2), -0.5)                       // H = −ξ/4 on the cantilever body
    const at = pts.filter((p) => Math.abs(p.x - 4) < 1e-9)
    expect(at).toHaveLength(2)
    near(at[0].v, -1)                                   // load at the hinge, left body: ΣM = −4 − 4H = 0
    near(at[1].v, 0)                                    // load passes to the right body: nothing shears the hinge
    expect(at[0].tag).toBeTruthy()
    near(ilValueAt(pts, 8), 0)
  })
})

describe('hinge-shear IL when the hinge sits over a support', () => {
  // supports 3 / 6 / 12 (unsorted on purpose), hinge at 6 = the middle support:
  // H(9) = 0.5 — half the load hangs through the hinge into the left body.
  const m = buildBeam({ length: 12, supports: [{ x: 3, kind: 'pin' }, { x: 12, kind: 'roller' }, { x: 6, kind: 'roller' }], hinges: [6] })
  const pts = effectPoints(m, { kind: 'hinge', hinge: 0 })

  it('zero for loads left of the hinge, then the 1−(ξ−6)/6 sag', () => {
    near(ilValueAt(pts, 0), 0)
    near(ilValueAt(pts, 3), 0)
    const at = pts.filter((p) => Math.abs(p.x - 6) < 1e-9)
    near(at[0].v, 0)
    near(at[1].v, 1)
    near(ilValueAt(pts, 9), 0.5)
    near(ilValueAt(pts, 12), 0)
  })
  it('one-sided solves agree with the jump ordinates', () => {
    near(solveUnitAt(m, 6, 'left').hingeShears[0], 0)
    near(solveUnitAt(m, 6, 'right').hingeShears[0], 1)
    near(solveUnitAt(m, 9).hingeShears[0], 0.5)
  })
})

describe('hinge coincident with a support', () => {
  // hinge over the middle support: left body carries both its supports,
  // right body is a suspended span — H must vanish under any load on the left.
  const m = buildBeam({ length: 12, supports: [{ x: 0, kind: 'pin' }, { x: 6, kind: 'roller' }, { x: 12, kind: 'roller' }], hinges: [6] })

  it('splits the load between the left body supports, hinge shear zero', () => {
    const s = solveUnitAt(m, 3)
    near(s.reactions[0], 0.5)
    near(s.reactions[1], 0.5)
    near(s.reactions[2], 0)
    near(s.hingeShears[0], 0)
  })
  it('a load on the suspended span hangs through the hinge', () => {
    const s = solveUnitAt(m, 9)
    near(s.reactions[0], 0)
    near(s.reactions[1], 0.5)   // left body catches the hinge shear: R6 = H
    near(s.reactions[2], 0.5)
    near(s.hingeShears[0], 0.5) // H = force on the right body from the left
  })
})

describe('validation catches the impossible models', () => {
  it('too few supports → mechanism count', () => {
    const p = validateBeamInput({ length: 12, supports: [{ x: 0, kind: 'pin' }], hinges: [] })
    expect(p.join(' ')).toMatch(/mechanism|supports = hinges \+ 2/)
  })
  it('three supports, no hinges → indeterminate', () => {
    const p = validateBeamInput({
      length: 12,
      supports: [{ x: 0, kind: 'pin' }, { x: 6, kind: 'roller' }, { x: 12, kind: 'roller' }],
      hinges: [],
    })
    expect(p.join(' ')).toMatch(/indeterminate/)
  })
  it('hinge outside the span is rejected', () => {
    const p = validateBeamInput({
      length: 12,
      supports: [{ x: 0, kind: 'pin' }, { x: 12, kind: 'roller' }],
      hinges: [12],
    })
    expect(p.join(' ')).toMatch(/strictly inside/)
  })
  it('a body held only by the hinge is a mechanism the solver refuses', () => {
    const m = buildBeam({
      length: 12,
      supports: [{ x: 6, kind: 'pin' }, { x: 6.5, kind: 'roller' }, { x: 12, kind: 'roller' }],
      hinges: [4],
    })
    expect(() => solveUnitAt(m, 2)).toThrow(/Unstable/)
  })
})
