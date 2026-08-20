import { describe, it, expect } from 'vitest'
import {
  hookBendDiameter, stirrupBendDiameter, bendRadius, bendDeduction,
  polylineLength, turnAngles, cutLength, runWeight, cageWeight, kgPerM,
  elevationPlane, planPlane, projectPoint, projectPath, runToPrimitive,
  type RebarRun, type Vec3,
} from './rebarModel'

const run = (o: Partial<RebarRun> & { path: Vec3[] }): RebarRun => ({
  mark: 'X1', dia: 20, role: 'bottom', member: 'B1', bendDia: [], count: 1, ...o,
})

describe('bend diameters', () => {
  it('follows Table 425.3.1 for a standard hook', () => {
    expect(hookBendDiameter(16)).toBe(96)          // 6 x 16
    expect(hookBendDiameter(25)).toBe(150)         // 6 x 25, still the smaller rule
    expect(hookBendDiameter(28)).toBe(224)         // 8 x 28
    expect(hookBendDiameter(36)).toBe(288)
    expect(hookBendDiameter(43)).toBe(430)         // 10 x 43
  })

  it('lets a stirrup turn tighter, per Table 425.3.2', () => {
    expect(stirrupBendDiameter(10)).toBe(40)       // 4 x 10
    expect(stirrupBendDiameter(16)).toBe(64)       // 4 x 16, top of the 4db band
    expect(stirrupBendDiameter(20)).toBe(120)      // 6 x 20
    expect(stirrupBendDiameter(25)).toBe(150)      // 6 x 25
    // above the table, the main-bar rule governs again — 6db would be wrong
    expect(stirrupBendDiameter(28)).toBe(hookBendDiameter(28))
  })

  it('measures the bend radius on the bar CENTRELINE', () => {
    // inside face D/2 from the centre, plus half a bar to reach the centreline
    expect(bendRadius(96, 16)).toBe(56)            // 48 + 8
  })
})

describe('bendDeduction', () => {
  it('cuts 0.4292 R off a square corner', () => {
    // R(2 tan45 - pi/2) = R(2 - 1.5708)
    const R = bendRadius(96, 16)
    expect(bendDeduction(96, 16, 90)).toBeCloseTo(R * (2 - Math.PI / 2), 9)
    expect(bendDeduction(96, 16, 90) / R).toBeCloseTo(0.42920367, 7)
  })

  it('deducts nothing from a bar that does not turn', () => {
    expect(bendDeduction(96, 16, 0)).toBe(0)
  })

  it('deducts less from a gentler bend', () => {
    const a = bendDeduction(96, 16, 45), b = bendDeduction(96, 16, 90)
    expect(a).toBeGreaterThan(0)
    expect(a).toBeLessThan(b)
  })

  it('refuses a 180° fold, which a polyline cannot describe', () => {
    // The tangent distance runs to infinity there. A real 180° hook is two
    // bends with a leg between them and must be modelled that way.
    expect(bendDeduction(96, 16, 180)).toBe(0)
    expect(Number.isFinite(bendDeduction(96, 16, 179))).toBe(true)
  })
})

describe('polylineLength and turnAngles', () => {
  it('measures an open path through its corners', () => {
    expect(polylineLength([[0, 0, 0], [3, 0, 0], [3, 4, 0]])).toBeCloseTo(7, 9)
  })

  it('closes the loop when the run is a stirrup', () => {
    const box: Vec3[] = [[0, 0, 0], [2, 0, 0], [2, 1, 0], [0, 1, 0]]
    expect(polylineLength(box, false)).toBeCloseTo(5, 9)     // 2 + 1 + 2
    expect(polylineLength(box, true)).toBeCloseTo(6, 9)      // + the closing 1
  })

  it('reports the DEVIATION from straight, not the included angle', () => {
    // an L: straight, then square. One interior vertex, 90 degrees of turn.
    expect(turnAngles([[0, 0, 0], [3, 0, 0], [3, 4, 0]])).toEqual([90])
    // a bar that does not turn reports zero, not 180
    expect(turnAngles([[0, 0, 0], [1, 0, 0], [2, 0, 0]])[0]).toBeCloseTo(0, 9)
  })

  it('gives a closed rectangle four corners, not two', () => {
    const box: Vec3[] = [[0, 0, 0], [2, 0, 0], [2, 1, 0], [0, 1, 0]]
    const t = turnAngles(box, true)
    expect(t).toHaveLength(4)
    for (const a of t) expect(a).toBeCloseTo(90, 9)
  })
})

describe('cutLength', () => {
  it('is the polyline for a straight bar', () => {
    expect(cutLength(run({ path: [[0, 0, 0], [6, 0, 0]] }))).toBeCloseTo(6000, 9)
  })

  it('takes the corner off a bent bar', () => {
    // 3 m + 4 m through the corner, one 90° bend on a ⌀20 at 6db
    const D = hookBendDiameter(20)
    const r = run({ dia: 20, path: [[0, 0, 0], [3, 0, 0], [3, 4, 0]], bendDia: [D] })
    const expected = 7000 - bendRadius(D, 20) * (2 - Math.PI / 2)
    expect(cutLength(r)).toBeCloseTo(expected, 9)
    expect(cutLength(r)).toBeLessThan(7000)                 // shorter, always
  })

  it('develops a closed tie round all four of its bends', () => {
    // A ⌀10 tie on a 300x500 column, 40 cover: 220 x 420 to bar centrelines,
    // ignoring the seismic hooks, which are extra legs not corners.
    const D = stirrupBendDiameter(10)
    const b = 0.220, h = 0.420
    const r = run({
      dia: 10, role: 'tie', closed: true, bendDia: [D, D, D, D],
      path: [[0, 0, 0], [b, 0, 0], [b, h, 0], [0, h, 0]],
    })
    const perim = 2 * (b + h) * 1000
    expect(cutLength(r)).toBeCloseTo(perim - 4 * bendRadius(D, 10) * (2 - Math.PI / 2), 9)
  })

  it('reports the polyline when a bend diameter is missing, never less', () => {
    // A half-specified run must not silently come out short and under-buy steel.
    const bare = run({ path: [[0, 0, 0], [3, 0, 0], [3, 4, 0]], bendDia: [] })
    expect(cutLength(bare)).toBeCloseTo(7000, 9)
  })
})

describe('weights', () => {
  it('weighs a ⌀20 at the standard 2.466 kg/m', () => {
    expect(kgPerM(20)).toBeCloseTo(2.4661, 3)
  })

  it('multiplies by the number of identical copies', () => {
    const r = run({ dia: 20, path: [[0, 0, 0], [6, 0, 0]], count: 4 })
    expect(runWeight(r)).toBeCloseTo(6 * kgPerM(20) * 4, 9)
    expect(cageWeight({ member: 'B1', runs: [r, r] })).toBeCloseTo(2 * runWeight(r), 9)
  })
})

describe('projection', () => {
  it('puts a bar high in the member high on the sheet', () => {
    // primitive space grows DOWNWARD, so +y in the world must give −v on the page
    const plane = elevationPlane([1, 0, 0])
    expect(projectPoint([2, 0.5, 0], plane)).toEqual([2, -0.5])
    expect(projectPoint([2, 0, 0], plane)[1]).toBeGreaterThan(projectPoint([2, 1, 0], plane)[1])
  })

  it('projects along the member, whichever way it runs in the world', () => {
    // a beam spanning in z draws exactly like one spanning in x
    const plane = elevationPlane([0, 0, 1])
    expect(projectPath([[0, 0, 0], [0, 0, 6]], plane)).toEqual([[0, 0], [6, 0]])
  })

  it('drops height in a plan view', () => {
    const p = planPlane()
    expect(projectPoint([2, 9, 3], p)).toEqual([2, 3])
  })

  it('paints a closed run as a closed path', () => {
    const r = run({ closed: true, path: [[0, 0, 0], [1, 0, 0], [1, 1, 0]] })
    const prim = runToPrimitive(r, elevationPlane([1, 0, 0]), { stroke: '#000' })
    expect(prim.kind).toBe('path')
    if (prim.kind !== 'path') throw new Error('unreachable')
    expect(prim.closed).toBe(true)
    expect(prim.cmds.map((c) => c.c)).toEqual(['M', 'L', 'L'])
  })
})
