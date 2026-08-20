import { describe, it, expect } from 'vitest'
import { runPoints, filletCorner, REBAR_ROLE_COLOR } from './rebarWire'
import { bendRadius, hookBendDiameter, stirrupBendDiameter, type RebarRun } from './rebarModel'

const straight: RebarRun = {
  mark: 'X1', dia: 20, role: 'top', member: 'B1',
  path: [[0, 0, 0], [6, 0, 0]], bendDia: [], count: 1,
}
/** An L: 2 m along x, then 0.5 m down, bent to the standard hook diameter. */
const hooked: RebarRun = {
  mark: 'X2', dia: 20, role: 'top', member: 'B1',
  path: [[0, 0, 0], [2, 0, 0], [2, -0.5, 0]],
  bendDia: [hookBendDiameter(20)], count: 1,
}
const tie: RebarRun = {
  mark: 'T1', dia: 12, role: 'tie', member: 'C1',
  path: [[0, 0, 0], [0.2, 0, 0], [0.2, 0, 0.4], [0, 0, 0.4]],
  bendDia: Array(4).fill(stirrupBendDiameter(12)),
  closed: true, count: 1,
}

describe('runPoints', () => {
  it('leaves a straight bar as its two ends', () => {
    expect(runPoints(straight)).toEqual([[0, 0, 0], [6, 0, 0]])
  })

  it('rounds a bend to the radius the bar is actually made to', () => {
    // A mitred corner is a bar nobody can bend. The fillet leaves the straight
    // a tangent distance short of the corner and rejoins beyond it.
    const p = runPoints(hooked)
    const r = bendRadius(hookBendDiameter(20), 20) / 1000     // 70 mm
    expect(p.length).toBeGreaterThan(3)
    // nothing sits at the mitre itself
    expect(p.some((q) => Math.abs(q[0] - 2) < 1e-9 && Math.abs(q[1]) < 1e-9)).toBe(false)
    // the arc leaves the horizontal leg r short of the corner…
    const onLeg = p.filter((q) => Math.abs(q[1]) < 1e-9)
    expect(Math.max(...onLeg.map((q) => q[0]))).toBeCloseTo(2 - r, 6)
    // …and every arc point is exactly r from the bend centre
    for (const q of p.slice(1, -1)) {
      expect(Math.hypot(q[0] - (2 - r), q[1] - -r)).toBeCloseTo(r, 6)
    }
  })

  it('keeps the bar ends exactly where the run put them', () => {
    // Filleting must not move the bar. Shortening a leg to force a fillet in
    // would put steel somewhere the cage never said it was.
    const p = runPoints(hooked)
    expect(p[0]).toEqual([0, 0, 0])
    expect(p[p.length - 1]).toEqual([2, -0.5, 0])
  })

  it('closes a tie back on itself, with all four corners rounded', () => {
    const p = runPoints(tie)
    expect(Math.hypot(...p[0].map((v, k) => v - p[p.length - 1][k]))).toBeCloseTo(0, 9)
    for (const c of [[0, 0], [0.2, 0], [0.2, 0.4], [0, 0.4]]) {
      expect(p.some((q) => Math.abs(q[0] - c[0]) < 1e-9 && Math.abs(q[2] - c[1]) < 1e-9)).toBe(false)
    }
  })

  it('leaves a corner square when the legs are too short to fillet it', () => {
    // Better a sharp corner on screen than a bar drawn somewhere it is not.
    const tight: RebarRun = {
      mark: 'X3', dia: 32, role: 'top', member: 'B1',
      path: [[0, 0, 0], [0.02, 0, 0], [0.02, -0.02, 0]],
      bendDia: [hookBendDiameter(32)], count: 1,
    }
    const p = runPoints(tight)
    expect(p).toHaveLength(3)
    expect(p[1]).toEqual([0.02, 0, 0])
  })

  it('sweeps a 90° fillet through a quarter turn, no more', () => {
    const p = filletCorner([-1, 0, 0], [0, 0, 0], [0, -1, 0], 0.1, 8)
    expect(p).toHaveLength(9)
    for (const q of p) expect(Math.hypot(q[0] - -0.1, q[1] - -0.1)).toBeCloseTo(0.1, 9)
    expect(p[0][0]).toBeCloseTo(-0.1, 12)
    expect(p[0][1]).toBeCloseTo(0, 12)
    expect(p[p.length - 1][0]).toBeCloseTo(0, 9)
    expect(p[p.length - 1][1]).toBeCloseTo(-0.1, 9)
  })

  it('gives every role its own colour', () => {
    expect(new Set(Object.values(REBAR_ROLE_COLOR)).size).toBeGreaterThan(6)
    expect(REBAR_ROLE_COLOR.top).not.toBe(REBAR_ROLE_COLOR.bottom)
    expect(REBAR_ROLE_COLOR.stirrup).not.toBe(REBAR_ROLE_COLOR.vertical)
  })
})
