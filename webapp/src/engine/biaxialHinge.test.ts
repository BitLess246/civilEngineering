import { describe, it, expect } from 'vitest'
import {
  biaxialProbe, biaxialCommit, biaxialPath, newBiaxialState,
  biaxialYieldFunction, biaxialUtilisation, reducedBiaxialCapacities,
  type BiaxialHingeParams,
} from './biaxialHinge'
import { bilinearPath, bilinearProbe, newBilinearState } from './hysteresis'
import { reducedPlasticMoment } from './pmInteraction'

/** A representative column hinge: k₀ ≫ Mp/θy so the unyielded hinge is stiff. */
const base = (o: Partial<BiaxialHingeParams> = {}): BiaxialHingeParams => ({
  k0y: 1e5, k0z: 1e5, Mpy: 100, Mpz: 200, ...o,
})

describe('biaxialHinge — elastic range', () => {
  it('is uncoupled and linear below the surface', () => {
    const p = base()
    const r = biaxialProbe(5e-4, 5e-4, newBiaxialState(), p)
    // Φ = (50/100)² + (50/200)² − 1 = 0.25 + 0.0625 − 1 < 0
    expect(r.yielding).toBe(false)
    expect(r.My).toBeCloseTo(50, 10)
    expect(r.Mz).toBeCloseTo(50, 10)
    expect(r.kt[0][0]).toBeCloseTo(1e5, 6)
    expect(r.kt[1][1]).toBeCloseTo(1e5, 6)
    expect(r.kt[0][1]).toBe(0)
    expect(r.kt[1][0]).toBe(0)
    expect(r.phi).toBeLessThan(0)
  })

  it('never yields when neither axis has capacity', () => {
    const r = biaxialProbe(1, 1, newBiaxialState(), base({ Mpy: Infinity, Mpz: Infinity }))
    expect(r.yielding).toBe(false)
    expect(r.My).toBeCloseTo(1e5, 6)
    expect(r.Mz).toBeCloseTo(1e5, 6)
  })
})

describe('biaxialHinge — degenerates to the 1-D bilinear hinge', () => {
  // The whole point of the parallel decomposition: switching off one axis must
  // reproduce `hysteresis.ts` to machine precision, not merely "closely".
  const path: Array<[number, number]> = []
  for (let i = 0; i <= 40; i++) path.push([0, 0.004 * Math.sin((i / 40) * 4 * Math.PI)])

  it('matches bilinearPath exactly when the other axis has no capacity', () => {
    const got = biaxialPath(path, base({ Mpy: Infinity, bz: 0.02 }))
    const want = bilinearPath(path.map(([, z]) => z), { k0: 1e5, Fy: 200, b: 0.02 })
    for (let i = 0; i < path.length; i++) expect(got.Mz[i]).toBeCloseTo(want.f[i], 9)
    expect(got.state.dissipated).toBeCloseTo(want.state.dissipated, 8)
  })

  it('matches bilinearPath exactly when the other axis is simply unloaded', () => {
    // Mpy is finite here, so the FULL biaxial surface is active — it just never
    // sees any weak-axis moment. Catches spurious coupling in the return map.
    const got = biaxialPath(path, base({ bz: 0.02 }))
    const want = bilinearPath(path.map(([, z]) => z), { k0: 1e5, Fy: 200, b: 0.02 })
    for (let i = 0; i < path.length; i++) {
      expect(got.Mz[i]).toBeCloseTo(want.f[i], 9)
      expect(got.My[i]).toBeCloseTo(0, 10)
    }
  })

  it('unloads elastically — the tangent snaps back to k₀', () => {
    const prm = base({ Mpy: Infinity })
    let st = newBiaxialState()
    const push = biaxialCommit(0, 0.004, 0, 0, st, prm)
    st = push.state
    expect(push.resp.yielding).toBe(true)
    expect(push.resp.Mz).toBeCloseTo(200, 6)     // b = 0 ⇒ plateau at Mp
    // reverse a hair: still inside the translated surface ⇒ elastic
    const back = biaxialProbe(0, 0.0039, st, prm)
    expect(back.yielding).toBe(false)
    expect(back.kt[1][1]).toBeCloseTo(1e5, 6)
    expect(back.Mz).toBeCloseTo(200 - 1e5 * 1e-4, 6)
  })
})

describe('biaxialHinge — the coupled surface is the whole point', () => {
  it('yields at 0.8Mpy + 0.8Mpz, which two 1-D hinges would call elastic', () => {
    const prm = base()
    // rotations that would land each uncoupled hinge at 80% of its own capacity
    const r = biaxialProbe(0.8 * 100 / 1e5, 0.8 * 200 / 1e5, newBiaxialState(), prm)
    expect(bilinearProbe(0.8 * 200 / 1e5, newBilinearState(), { k0: 1e5, Fy: 200 }).yielding).toBe(false)
    expect(r.yielding).toBe(true)
    // and the returned point sits ON the ellipse
    expect((r.My / 100) ** 2 + (r.Mz / 200) ** 2).toBeCloseTo(1, 9)
  })

  it('projects a 45° push onto the circle when the capacities are equal', () => {
    const r = biaxialProbe(0.01, 0.01, newBiaxialState(), base({ Mpy: 100, Mpz: 100 }))
    expect(r.My).toBeCloseTo(100 / Math.SQRT2, 8)
    expect(r.Mz).toBeCloseTo(100 / Math.SQRT2, 8)
  })

  it('lands on the ellipse for unequal capacities', () => {
    const r = biaxialProbe(0.01, 0.01, newBiaxialState(), base())
    expect((r.My / 100) ** 2 + (r.Mz / 200) ** 2).toBeCloseTo(1, 9)
    expect(r.converged).toBe(true)
    // the stiffer-capacity axis carries the larger share
    expect(r.Mz).toBeGreaterThan(r.My)
  })

  it('flows normal to the surface (associativity)', () => {
    const prm = base()
    const { state } = biaxialCommit(0.01, 0.006, 0, 0, newBiaxialState(), prm)
    const r = biaxialProbe(0.01, 0.006, newBiaxialState(), prm)
    // ∇Φ in moment space for the α = 2 ellipse is (2My/Mpy², 2Mz/Mpz²)
    const ny = (2 * r.My) / 100 ** 2, nz = (2 * r.Mz) / 200 ** 2
    // cross product of the plastic-flow vector with the normal must vanish
    expect(state.thpY * nz - state.thpZ * ny).toBeCloseTo(0, 10)
    expect(state.cumPlastic).toBeGreaterThan(0)
  })
})

describe('biaxialHinge — consistent tangent', () => {
  // The algorithmic tangent is what preserves Newton's quadratic convergence in
  // the frame solve. Finite-difference the return map itself and compare.
  const fd = (prm: BiaxialHingeParams, thY: number, thZ: number) => {
    const st = newBiaxialState()
    const h = 1e-7
    const d = (fy: number, fz: number) => biaxialProbe(thY + fy * h, thZ + fz * h, st, prm)
    return [
      [(d(1, 0).My - d(-1, 0).My) / (2 * h), (d(0, 1).My - d(0, -1).My) / (2 * h)],
      [(d(1, 0).Mz - d(-1, 0).Mz) / (2 * h), (d(0, 1).Mz - d(0, -1).Mz) / (2 * h)],
    ]
  }
  const expectTangent = (prm: BiaxialHingeParams, thY: number, thZ: number) => {
    const r = biaxialProbe(thY, thZ, newBiaxialState(), prm)
    expect(r.yielding).toBe(true)
    const num = fd(prm, thY, thZ)
    const scale = Math.max(prm.k0y, prm.k0z)
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        expect(Math.abs(r.kt[i][j] - num[i][j]) / scale).toBeLessThan(1e-5)
      }
    }
    // and it is symmetric, as associative plasticity requires
    expect(Math.abs(r.kt[0][1] - r.kt[1][0]) / scale).toBeLessThan(1e-9)
  }

  it('matches finite differences on the elliptical surface', () => {
    expectTangent(base({ k0y: 8e4, k0z: 1.2e5, by: 0.03, bz: 0.05 }), 0.004, 0.006)
  })

  it('matches finite differences on the Bresler contour (α = 1.5)', () => {
    expectTangent(base({ by: 0.02, bz: 0.02, surface: { kind: 'power', alpha: 1.5 } }), 0.003, 0.005)
  })

  it('matches finite differences on the Orbison surface under axial load', () => {
    expectTangent(base({ p: 0.25, by: 0.02, bz: 0.02, surface: { kind: 'orbison' } }), 0.003, 0.004)
  })

  it('softens the unloaded axis at a uniaxial yielded state', () => {
    // associative flow on a curved surface: a perturbation about y produces
    // plastic flow immediately, so kt_yy < k₀y even with My = 0
    const prm = base()
    const r = biaxialProbe(0, 0.01, newBiaxialState(), prm)
    expect(r.My).toBeCloseTo(0, 10)
    expect(r.kt[0][0]).toBeLessThan(prm.k0y)
    expect(r.kt[0][0]).toBeGreaterThan(0)
    expectTangent(prm, 1e-9, 0.01)
  })
})

describe('biaxialHinge — Orbison surface (McGuire/Ziemian Eq. 10.18)', () => {
  const orb = (o: Partial<BiaxialHingeParams> = {}) =>
    base({ surface: { kind: 'orbison' }, ...o })

  it('reaches the full plastic moment on each axis at zero axial load', () => {
    expect(biaxialProbe(0, 0.01, newBiaxialState(), orb()).Mz).toBeCloseTo(200, 7)
    expect(biaxialProbe(0.01, 0, newBiaxialState(), orb()).My).toBeCloseTo(100, 7)
  })

  it('matches the closed-form contour at p = 0.3', () => {
    // Solving Eq. 10.18 by hand on each axis, written out rather than pasted as
    // a rounded decimal so the check is independent of my arithmetic.
    const p = 0.3, p2 = p * p, p6 = p2 * p2 * p2
    // strong axis, m_y = 0:  1.15p² + m_z²(1 + 3.67p²) = 1
    const mz = Math.sqrt((1 - 1.15 * p2) / (1 + 3.67 * p2))
    expect(mz).toBeCloseTo(0.8209191, 7)
    expect(biaxialProbe(0, 0.01, newBiaxialState(), orb({ p })).Mz).toBeCloseTo(mz * 200, 7)
    // weak axis, m_z = 0:  m_y⁴ + 3p⁶m_y² − (1 − 1.15p²) = 0, quadratic in m_y²
    const my = Math.sqrt((-3 * p6 + Math.sqrt(9 * p6 * p6 + 4 * (1 - 1.15 * p2))) / 2)
    expect(my).toBeCloseTo(0.9724937, 7)
    expect(biaxialProbe(0.01, 0, newBiaxialState(), orb({ p })).My).toBeCloseTo(my * 100, 7)
  })

  it('squashes at p = 1/√1.15 = 0.933 — Orbison’s fit, slightly conservative', () => {
    expect(biaxialYieldFunction(0, 0, 100, 200, 1 / Math.sqrt(1.15), { kind: 'orbison' }))
      .toBeCloseTo(0, 12)
    // so at p = 0.95 the section is already outside the surface with no moment
    expect(biaxialYieldFunction(0, 0, 100, 200, 0.95, { kind: 'orbison' })).toBeGreaterThan(0)
  })

  it('shrinks the moment capacity monotonically with axial load', () => {
    const at = (p: number) => biaxialProbe(0, 0.01, newBiaxialState(), orb({ p })).Mz
    const caps = [0, 0.2, 0.4, 0.6, 0.8].map(at)
    for (let i = 1; i < caps.length; i++) expect(caps[i]).toBeLessThan(caps[i - 1])
    expect(caps[0]).toBeCloseTo(200, 7)
  })

  it('is sign-agnostic in axial force (even powers only)', () => {
    expect(biaxialProbe(0, 0.01, newBiaxialState(), orb({ p: 0.4 })).Mz)
      .toBeCloseTo(biaxialProbe(0, 0.01, newBiaxialState(), orb({ p: -0.4 })).Mz, 10)
  })
})

describe('biaxialHinge — power (Bresler) surface', () => {
  it('reproduces the Bresler contour at α = 1.5', () => {
    // pick a point on |m_y|^1.5 + |m_z|^1.5 = 1 and confirm Φ vanishes there
    const mz = Math.pow(1 - Math.pow(0.5, 1.5), 1 / 1.5)
    expect(biaxialYieldFunction(0.5 * 100, mz * 200, 100, 200, 0, { kind: 'power', alpha: 1.5 }))
      .toBeCloseTo(0, 8)
  })

  it('is more permissive as α grows — α = 1 is the conservative linear chord', () => {
    const at = (alpha: number) =>
      biaxialYieldFunction(0.5 * 100, 0.5 * 200, 100, 200, 0, { kind: 'power', alpha })
    expect(at(1)).toBeCloseTo(0, 6)       // 0.5 + 0.5 = 1, exactly on the chord
    expect(at(1.5)).toBeLessThan(0)
    expect(at(2)).toBeLessThan(at(1.5))
  })

  it('keeps the |m|^α regularisation far below any working tolerance', () => {
    // exact contour value at the uniaxial point is 0; ε = 1e-6 shifts it by ε^α
    for (const alpha of [1, 1.5, 2, 3]) {
      const phi = biaxialYieldFunction(0, 200, 100, 200, 0, { kind: 'power', alpha })
      expect(Math.abs(phi)).toBeLessThan(1e-5)
    }
  })

  it('handles a hinge whose capacity has been reduced to zero by axial load', () => {
    // reducedPlasticMoment returns 0 at P = Pcap; the hinge must degrade to a
    // release rather than produce NaN
    const { Mpy, Mpz } = reducedBiaxialCapacities(100, 200, 500, 500)
    expect(Mpy).toBe(0)
    expect(Mpz).toBe(0)
    const r = biaxialProbe(0.01, 0.01, newBiaxialState(), base({ Mpy, Mpz, by: 0.02, bz: 0.02 }))
    expect(Number.isFinite(r.My)).toBe(true)
    expect(Number.isFinite(r.Mz)).toBe(true)
    // only the hardening branch survives: M ≈ b·k₀·θ
    expect(r.My).toBeCloseTo(0.02 * 1e5 * 0.01, 6)
    expect(r.Mz).toBeCloseTo(0.02 * 1e5 * 0.01, 6)
  })
})

describe('biaxialHinge — capacities, utilisation and dissipation', () => {
  it('reduces both axes through the codified uniaxial P–M chords', () => {
    const got = reducedBiaxialCapacities(100, 200, 300, 1000)
    expect(got.Mpy).toBeCloseTo(reducedPlasticMoment(100, 300, 1000, 'steel-weak'), 12)
    expect(got.Mpz).toBeCloseTo(reducedPlasticMoment(200, 300, 1000, 'steel-strong'), 12)
  })

  it('reports utilisation as demand/capacity, like every other check in the repo', () => {
    // circle of radius 100: (60, 80) is exactly on it
    expect(biaxialUtilisation(60, 80, 100, 100)).toBeCloseTo(1, 6)
    expect(biaxialUtilisation(30, 40, 100, 100)).toBeCloseTo(0.5, 6)
    expect(biaxialUtilisation(120, 160, 100, 100)).toBeCloseTo(2, 6)
    // a hinge with no capacity never yields; axial-only failure never recovers
    expect(biaxialUtilisation(60, 80, Infinity, Infinity)).toBe(0)
    expect(biaxialUtilisation(10, 10, 100, 200, 0.95, { kind: 'orbison' })).toBe(Infinity)
  })

  it('agrees with the yield function on which side of the surface a point is', () => {
    const surface = { kind: 'power', alpha: 1.5 } as const
    for (const [My, Mz] of [[10, 20], [60, 120], [80, 190], [140, 30]]) {
      const u = biaxialUtilisation(My, Mz, 100, 200, 0, surface)
      const phi = biaxialYieldFunction(My, Mz, 100, 200, 0, surface)
      expect(Math.sign(u - 1), `(${My}, ${Mz})`).toBe(Math.sign(phi))
    }
  })

  it('dissipates only through plastic flow, and never negatively', () => {
    const prm = base({ by: 0.02, bz: 0.02 })
    // a skew cycle that yields, unloads and re-yields the other way
    const path: Array<[number, number]> = []
    for (let i = 0; i <= 80; i++) {
      const t = (i / 80) * 4 * Math.PI
      path.push([0.003 * Math.sin(t), 0.005 * Math.sin(t)])
    }
    const { state } = biaxialPath(path, prm)
    expect(state.dissipated).toBeGreaterThan(0)
    expect(state.cumPlastic).toBeGreaterThan(0)

    // an elastic-only path dissipates nothing
    const small = path.map(([y, z]) => [y * 1e-3, z * 1e-3] as [number, number])
    expect(biaxialPath(small, prm).state.dissipated).toBeCloseTo(0, 12)
  })

  it('matches the 1-D dissipated energy on a uniaxial cycle', () => {
    const path: Array<[number, number]> = []
    for (let i = 0; i <= 60; i++) path.push([0, 0.004 * Math.sin((i / 60) * 4 * Math.PI)])
    const got = biaxialPath(path, base({ Mpy: Infinity }))
    const want = bilinearPath(path.map(([, z]) => z), { k0: 1e5, Fy: 200 })
    expect(got.state.dissipated).toBeCloseTo(want.state.dissipated, 8)
  })

  it('converges the return map everywhere on a dense skew sweep', () => {
    for (const surface of [
      { kind: 'power', alpha: 2 } as const,
      { kind: 'power', alpha: 1.5 } as const,
      { kind: 'orbison' } as const,
    ]) {
      for (let a = 0; a < 32; a++) {
        const t = (a / 32) * 2 * Math.PI
        const prm = base({ p: 0.2, by: 0.02, bz: 0.02, surface })
        const r = biaxialProbe(0.01 * Math.cos(t), 0.01 * Math.sin(t), newBiaxialState(), prm)
        expect(r.converged, `${surface.kind} at ${a}`).toBe(true)
        expect(Math.abs(r.phi), `${surface.kind} at ${a}`).toBeLessThan(1e-9)
      }
    }
  })
})
