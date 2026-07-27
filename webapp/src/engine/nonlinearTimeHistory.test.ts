import { describe, it, expect } from 'vitest'
import {
  nonlinearTimeHistory, assembleK0, groundMotionForcing, type HystSpring,
} from './nonlinearTimeHistory'
import { newmarkDirect, rayleighCoeffs } from './directTimeHistory'

// ── assembly ────────────────────────────────────────────────────────────
describe('nonlinearTimeHistory — K₀ assembly', () => {
  it('builds the classic shear-building stiffness from grounded + chained springs', () => {
    const springs: HystSpring[] = [
      { i: 0, params: { k0: 1, Fy: Infinity } },              // ground → DOF0
      { i: 1, j: 0, params: { k0: 1, Fy: Infinity } },        // DOF0 → DOF1
    ]
    expect(assembleK0(2, springs)).toEqual([[2, -1], [-1, 1]])
  })
})

// ── the decisive check: elastic nonlinear path ≡ linear direct integration ─
describe('nonlinearTimeHistory — reduces to newmarkDirect when nothing yields', () => {
  const mass = [1, 1]
  const springs: HystSpring[] = [
    { i: 0, params: { k0: 1, Fy: Infinity } },
    { i: 1, j: 0, params: { k0: 1, Fy: Infinity } },
  ]
  const K = assembleK0(2, springs)                    // [[2,-1],[-1,1]]
  const dt = 0.01, n = 900
  const ag = Array.from({ length: n }, (_, i) => Math.sin(1.3 * i * dt) * Math.exp(-0.25 * i * dt))
  // Rayleigh anchored to the two exact modes ω² = (3∓√5)/2
  const w1 = Math.sqrt((3 - Math.sqrt(5)) / 2), w2 = Math.sqrt((3 + Math.sqrt(5)) / 2)
  const ray = rayleighCoeffs(w1, 0.05, w2, 0.05)

  it('matches the linear solver step for step', () => {
    const P = ag.map((g) => [-g, -g])
    const nl = nonlinearTimeHistory({ mass, springs, rayleigh: ray, P, dt })!
    const M = [[1, 0], [0, 1]]
    const C = [[ray.alpha + ray.beta * K[0][0], ray.beta * K[0][1]],
      [ray.beta * K[1][0], ray.alpha + ray.beta * K[1][1]]]
    const lin = newmarkDirect(M, C, K, P, dt)!

    expect(nl.yielded).toBe(false)
    expect(nl.converged).toBe(true)
    expect(nl.totalDissipated).toBe(0)
    let peak = 0
    for (const r of lin.u) peak = Math.max(peak, Math.abs(r[0]), Math.abs(r[1]))
    expect(peak).toBeGreaterThan(0.05)               // the record really excites it
    for (let i = 0; i < n; i += 13) {
      expect(nl.u[i][0]).toBeCloseTo(lin.u[i][0], 9)
      expect(nl.u[i][1]).toBeCloseTo(lin.u[i][1], 9)
    }
  })

  it('a linear system converges in a single Newton iteration', () => {
    const P = ag.map((g) => [-g, -g])
    const nl = nonlinearTimeHistory({ mass, springs, rayleigh: ray, P, dt })!
    expect(nl.maxIterations).toBeLessThanOrEqual(2)   // solve + tolerance check
  })
})

// ── yielding behaviour ──────────────────────────────────────────────────
describe('nonlinearTimeHistory — inelastic response', () => {
  const dt = 0.005, n = 1600
  const mass = [1]
  const k0 = 100                                     // ω = 10 rad/s
  const ray = rayleighCoeffs(10, 0.05, 30, 0.05)
  // resonant-ish sine pulse, strong enough to yield the weak system
  const ag = Array.from({ length: n }, (_, i) => 6.0 * Math.sin(10 * i * dt) * Math.exp(-0.4 * i * dt))
  const run = (Fy: number, b = 0) => nonlinearTimeHistory({
    mass,
    springs: [{ i: 0, params: { k0, Fy, b } }],
    rayleigh: ray,
    P: groundMotionForcing(mass, [1], ag),
    nSteps: n, dt,
  })!

  it('stays elastic and dissipates nothing with a high yield force', () => {
    const r = run(Infinity)
    expect(r.yielded).toBe(false)
    expect(r.totalDissipated).toBe(0)
    expect(r.converged).toBe(true)
  })

  it('yields, dissipates energy and caps the base force at Fy', () => {
    const r = run(2.0)
    expect(r.yielded).toBe(true)
    expect(r.converged).toBe(true)
    expect(r.totalDissipated).toBeGreaterThan(0)
    // the grounded spring cannot carry more than Fy (b = 0)
    expect(r.peakBaseForce).toBeLessThanOrEqual(2.0 + 1e-9)
    expect(r.ductility[0]).toBeGreaterThan(1)        // pushed past u_y
  })

  it('ductility demand falls monotonically as the yield strength rises', () => {
    // the robust ordering. (Dissipated ENERGY is NOT monotonic in Fy here:
    // E ≈ Fy × plastic displacement, and over this range Fy grows faster than
    // the plastic displacement shrinks — so a stronger system dissipates more.)
    const d = [1.5, 2.0, 3.0, 4.0, 6.0].map((Fy) => run(Fy).ductility[0])
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeLessThan(d[i - 1])
    expect(d[0]).toBeGreaterThan(5)      // the weak system is well into the inelastic range
    for (const Fy of [1.5, 4.0]) expect(run(Fy).totalDissipated).toBeGreaterThan(0)
  })

  it('yielding limits the force below the elastic demand', () => {
    const elastic = run(Infinity), inelastic = run(2.0)
    expect(inelastic.peakBaseForce).toBeLessThan(elastic.peakBaseForce)
  })

  it('post-yield hardening carries more force than a perfectly-plastic system', () => {
    const epp = run(2.0, 0), hard = run(2.0, 0.1)
    expect(hard.peakBaseForce).toBeGreaterThan(epp.peakBaseForce)
  })

  it('reports convergence diagnostics and rejects a degenerate system', () => {
    const r = run(2.0)
    expect(r.maxIterations).toBeGreaterThan(0)
    expect(r.worstResidual).toBeLessThanOrEqual(1e-10)
    expect(nonlinearTimeHistory({ mass: [], springs: [], rayleigh: ray, P: [], dt })).toBeNull()
  })
})
