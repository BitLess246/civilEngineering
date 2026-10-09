import { describe, it, expect } from 'vitest'
import { resolveJointForces, EQUILIBRIUM_TOL, type JointForce } from './concurrentForces'

const F = (name: string, magnitude: number, angleDeg: number): JointForce => ({ name, magnitude, angleDeg })

describe('resolveJointForces — components', () => {
  it('splits a single force along the axes', () => {
    // 10 kN at 30°: the 5-8.66 pair every statics student writes by hand.
    const r = resolveJointForces([F('F1', 10, 30)])
    expect(r.components[0].fx).toBeCloseTo(8.660254, 6)
    expect(r.components[0].fy).toBeCloseTo(5, 6)
    expect(r.Rx).toBeCloseTo(8.660254, 6)
    expect(r.Ry).toBeCloseTo(5, 6)
  })

  it('cardinal directions land whole components on one axis', () => {
    const r = resolveJointForces([F('E', 4, 0), F('N', 3, 90), F('W', 2, 180), F('S', 1, 270)])
    expect(r.Rx).toBeCloseTo(4 - 2, 12)
    expect(r.Ry).toBeCloseTo(3 - 1, 12)
  })

  it('negative and over-360 directions are the same ray', () => {
    // −90° and 270° both point down; 450° is 90° again.
    const down = resolveJointForces([F('a', 5, -90), F('b', 5, 270)])
    expect(down.Ry).toBeCloseTo(-10, 12)
    const up = resolveJointForces([F('a', 5, 450), F('b', 5, 90)])
    expect(up.Ry).toBeCloseTo(10, 12)
  })
})

describe('resolveJointForces — resultant', () => {
  it('returns the 3-4-5 resultant the sample problem shows', () => {
    // 10 kN @ 30°, 8 kN @ 150°, 6 kN @ 270°: Rx = 1.7320508, Ry = 3 → R = 3.4641 at 60°.
    const r = resolveJointForces([F('F1', 10, 30), F('F2', 8, 150), F('F3', 6, 270)])
    expect(r.Rx).toBeCloseTo(1.7320508, 6)
    expect(r.Ry).toBeCloseTo(3, 6)
    expect(r.R).toBeCloseTo(3.4641016, 6)
    expect(r.thetaDeg).toBeCloseTo(60, 6)
    expect(r.equilibrium).toBe(false)
    expect(r.sumF).toBe(24)
  })

  it('a closed polygon of forces is in equilibrium', () => {
    // Three equal forces 120° apart close on themselves — R = 0 exactly.
    const r = resolveJointForces([F('A', 5, 0), F('B', 5, 120), F('C', 5, 240)])
    expect(r.R).toBeCloseTo(0, 9)
    expect(r.equilibrium).toBe(true)
  })

  it('reports the resultant direction in [0, 360) even for a downward R', () => {
    const r = resolveJointForces([F('P', 7, 270)])
    expect(r.thetaDeg).toBeCloseTo(270, 12)
    const q = resolveJointForces([F('P', 7, 180), F('Q', 0.001, 270)])
    expect(q.thetaDeg).toBeGreaterThan(180)
    expect(q.thetaDeg).toBeLessThan(360)
  })
})

describe('resolveJointForces — validation', () => {
  it('rejects a negative magnitude', () => {
    expect(() => resolveJointForces([F('F1', -1, 0)])).toThrow(/non-negative/)
  })

  it('rejects a non-finite magnitude or angle', () => {
    expect(() => resolveJointForces([F('F1', NaN, 30)])).toThrow(/finite/)
    expect(() => resolveJointForces([F('F1', 5, Infinity)])).toThrow(/finite/)
  })

  it('rejects a blank name — the drawing would label nothing', () => {
    expect(() => resolveJointForces([F('   ', 5, 0)])).toThrow(/name/)
  })

  it('accepts the empty joint as equilibrium', () => {
    const r = resolveJointForces([])
    expect(r.R).toBe(0)
    expect(r.equilibrium).toBe(true)
    expect(r.components).toEqual([])
  })

  it('tolerance is relative to the force scale, not an absolute', () => {
    // R = EQUILIBRIUM_TOL × ΣF sits exactly on the boundary and counts as balanced.
    const big = resolveJointForces([F('P', 1e6, 0), F('Q', 1e6, 180 + 1e-11)])
    expect(big.R).toBeLessThan(EQUILIBRIUM_TOL * big.sumF + 1e-6)
  })
})
