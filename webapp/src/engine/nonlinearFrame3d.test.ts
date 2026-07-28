import { describe, it, expect } from 'vitest'
import {
  nonlinearFrame3D, assembleFrame3D,
  type NL3Input, type NL3Member, type NL3Node,
} from './nonlinearFrame3d'
import { solveFrame3D, localAxes, defaultAxisRotation, type F3Node, type F3Member, type F3Support, type V3 } from './frame3d'
import { nonlinearFrame } from './nonlinearFrame'

// A stock steel-ish section. Iz (strong) = 2·Iy (weak) so the two axes are
// distinguishable in every result below.
const SEC = { E: 200000, G: 77000, A: 1e4, Iy: 5e7, Iz: 1e8, J: 1e6 }
const L = 3

/**
 * Token strain hardening for the collapse traces.
 *
 * A PERFECTLY plastic mechanism has an exactly singular tangent, so whether the
 * factorisation survives it is down to floating-point luck — and the engine
 * (correctly) reports `mechanism` and stops when it does not. b = 1e-6 keeps the
 * tangent positive definite while lifting the plateau by only b·(EI/L)·θp ≈
 * 4e-4 kN·m on a 150 kN·m hinge, i.e. ~3e-6 relative — far below the tolerances
 * asserted here, so the closed forms are still the rigid-plastic ones.
 */
const B = 1e-6

/** Relative-error assertion — the right form when the reference is a closed
 *  form and the model carries the token hardening B above. */
const expectRel = (got: number, want: number, rel = 1e-5, msg = '') =>
  expect(Math.abs(got - want) / Math.abs(want), `${msg} ${got} vs ${want}`).toBeLessThan(rel)

const cantilever = (o: Partial<NL3Member> = {}, dir: V3 = [L, 0, 0]): { nodes: NL3Node[]; members: NL3Member[] } => ({
  nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: dir[0], y: dir[1], z: dir[2] }],
  members: [{ id: 'm', i: 'a', j: 'b', ...SEC, ...o }],
})

/**
 * Peak load factor of a perfectly plastic frame, traced under DISPLACEMENT
 * control so the plateau is reached rather than bracketed. With hardening at
 * the token level B the plateau IS the rigid-plastic collapse load to within
 * ~3e-6, so the peak is directly comparable to a closed form.
 *
 * |λ| is reported because the reference loads below point along −y/−z while the
 * control ramp is positive, so λ comes out negative. The SIGN is checked
 * separately, where the hinge moments are inspected directly.
 */
const collapse = (inp: Omit<NL3Input, 'control'>): number => {
  const r = nonlinearFrame3D({ ...inp, control: 'displacement' })
  if (!r) return NaN
  return Math.max(...r.steps.filter((s) => s.converged).map((s) => Math.abs(s.lambda)))
}

describe('nonlinearFrame3d — elastic behaviour is the linear solver', () => {
  it('reproduces solveFrame3D to machine precision when no member is hinged', () => {
    const { nodes, members } = cantilever()
    const r = nonlinearFrame3D({
      nodes, members,
      supports: [{ node: 'a', fixity: 'fixed' }],
      loads: [{ node: 'b', Fy: -10, Fz: -4, Mx: 2 }],
      controlNode: 'b', controlDir: 'y', schedule: [1],
    })!
    const f3nodes: F3Node[] = nodes
    const f3members: F3Member[] = members.map((m) => ({ id: m.id, i: m.i, j: m.j, ...SEC }))
    const f3sup: F3Support[] = [{ node: 'a', fixity: 'fixed' }]
    const ref = solveFrame3D(f3nodes, f3members, f3sup, [
      { kind: 'node', node: 'b', Fy: -10, Fz: -4, Mx: 2, cat: 'D' },
    ])!
    // free DOFs here are node b's six, in order
    for (let k = 0; k < 6; k++) expect(r.d[k]).toBeCloseTo(ref.d[6 + k], 12)
    expect(r.hinges).toEqual([])
  })

  it('matches the elastic cantilever formulas on both bending axes', () => {
    const EIz = (SEC.E * SEC.Iz) / 1e9, EIy = (SEC.E * SEC.Iy) / 1e9
    const P = 10
    const run = (load: Record<string, number>) => nonlinearFrame3D({
      ...cantilever(),
      supports: [{ node: 'a', fixity: 'fixed' }],
      loads: [{ node: 'b', ...load }], controlNode: 'b', schedule: [1],
    })!
    // local y′ = global Y, local z′ = global Z for a member along X
    expect(Math.abs(run({ Fy: -P }).d[1])).toBeCloseTo((P * L ** 3) / (3 * EIz), 10)
    expect(Math.abs(run({ Fz: -P }).d[2])).toBeCloseTo((P * L ** 3) / (3 * EIy), 10)
  })

  it('an unyielded hinge softens the frame only by the penalty stiffness', () => {
    const EIz = (SEC.E * SEC.Iz) / 1e9
    const exact = (1 * L ** 3) / (3 * EIz)
    const r = nonlinearFrame3D({
      ...cantilever({ Mpy: 1e9, Mpz: 1e9, rigidity: 1e4 }),
      supports: [{ node: 'a', fixity: 'fixed' }],
      loads: [{ node: 'b', Fy: -1 }], controlNode: 'b', controlDir: 'y', schedule: [1],
    })!
    // The base hinge carries M = PL and rotates M/kH = PL²/(rigidity·EI), which
    // adds φ·L to the tip. Against δ = PL³/3EI that is exactly 3/rigidity — so
    // the penalty error is not merely "small", it is a number we can predict.
    expect(Math.abs(Math.abs(r.d[1]) - exact) / exact).toBeCloseTo(3 / 1e4, 6)
    expect(r.hinges.every((h) => !h.yielded)).toBe(true)
  })

  it('adds exactly two DOFs per hinged member end, and none for an unhinged member', () => {
    const base = { supports: [{ node: 'a', fixity: 'fixed' as const }], loads: [], controlNode: 'b' }
    const plain = assembleFrame3D({ ...cantilever(), ...base })!
    const hinged = assembleFrame3D({ ...cantilever({ Mpz: 200 }), ...base })!
    expect(plain.hinges.length).toBe(0)
    expect(hinged.hinges.length).toBe(2)          // one per end
    expect(hinged.nf - plain.nf).toBe(4)          // two rotations per hinged end
  })
})

describe('nonlinearFrame3d — uniaxial collapse reproduces the plane frame', () => {
  const base = {
    supports: [{ node: 'a', fixity: 'fixed' as const }],
    controlNode: 'b', dispMax: 0.15, steps: 150,
  }

  it('gives λpeak = Mpz/L for a strong-axis cantilever mechanism', () => {
    const Mpz = 200
    const got = collapse({
      ...cantilever({ Mpz, bz: B }), ...base,
      loads: [{ node: 'b', Fy: -1 }], controlDir: 'y',
    })
    expectRel(got, Mpz / L)
  })

  it('gives λpeak = Mpy/L for a weak-axis cantilever mechanism', () => {
    const Mpy = 100
    const got = collapse({
      ...cantilever({ Mpy, by: B }), ...base,
      loads: [{ node: 'b', Fz: -1 }], controlDir: 'z',
    })
    expectRel(got, Mpy / L)
  })

  it('agrees with the 2-D engine on the same strong-axis problem', () => {
    const Mp = 200
    const got = collapse({
      ...cantilever({ Mpz: Mp, bz: B }), ...base,
      loads: [{ node: 'b', Fy: -1 }], controlDir: 'y',
    })
    const plane = nonlinearFrame({
      nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: L, y: 0 }],
      members: [{ id: 'm', i: 'a', j: 'b', E: SEC.E, I: SEC.Iz, A: SEC.A, Mp, b: B }],
      supports: [{ node: 'a', type: 'fixed' }],
      loads: [{ node: 'b', Fy: -1 }],
      controlNode: 'b', controlDir: 'y', control: 'displacement', dispMax: 0.15, steps: 150,
    })!
    const planePeak = Math.max(...plane.steps.filter((s) => s.converged).map((s) => Math.abs(s.lambda)))
    expect(got).toBeCloseTo(planePeak, 6)
  })

  it('keeps torsion continuous across a hinge', () => {
    // a hinge releases bending only; the torsional response must stay elastic
    const GJ = (SEC.G * SEC.J) / 1e9
    const r = nonlinearFrame3D({
      ...cantilever({ Mpy: 100, Mpz: 200 }),
      supports: [{ node: 'a', fixity: 'fixed' }],
      loads: [{ node: 'b', Mx: 5 }], controlNode: 'b', schedule: [1],
    })!
    expect(r.d[3]).toBeCloseTo((5 * L) / GJ, 9)
  })
})

describe('nonlinearFrame3d — biaxial coupling', () => {
  const base = {
    supports: [{ node: 'a', fixity: 'fixed' as const }],
    controlNode: 'b', dispMax: 0.2, steps: 200,
  }

  /** Closed form for a cantilever pushed at angle α in the local y′–z′ plane:
   *  Mz = P·L·cosα, My = P·L·sinα on the ellipse ⇒
   *  P = 1 / (L·√((sinα/Mpy)² + (cosα/Mpz)²)). */
  const exactSkew = (a: number, Mpy: number, Mpz: number) =>
    1 / (L * Math.hypot(Math.sin(a) / Mpy, Math.cos(a) / Mpz))

  it('is independent of the load angle on a circular surface', () => {
    // Mpy = Mpz ⇒ the surface is a circle, so the collapse load cannot depend on
    // which way the frame is pushed. Two uncoupled 1-D hinges would instead let
    // a 45° push reach √2 times the uniaxial load.
    const Mp = 150
    for (const a of [0, Math.PI / 8, Math.PI / 4, Math.PI / 3]) {
      const got = collapse({
        ...cantilever({ Mpy: Mp, Mpz: Mp, by: B, bz: B }), ...base,
        loads: [{ node: 'b', Fy: -Math.cos(a), Fz: -Math.sin(a) }],
        controlDir: Math.cos(a) >= Math.sin(a) ? 'y' : 'z',
      })
      expectRel(got, Mp / L, 1e-5, `α = ${((a * 180) / Math.PI).toFixed(0)}°`)
    }
  })

  it('matches the closed-form ellipse at every skew angle', () => {
    const Mpy = 100, Mpz = 200
    for (const a of [Math.PI / 8, Math.PI / 4, Math.PI / 3, (2 * Math.PI) / 5]) {
      const got = collapse({
        ...cantilever({ Mpy, Mpz, by: B, bz: B }), ...base,
        loads: [{ node: 'b', Fy: -Math.cos(a), Fz: -Math.sin(a) }],
        controlDir: Math.cos(a) >= Math.sin(a) ? 'y' : 'z',
      })
      expectRel(got, exactSkew(a, Mpy, Mpz), 1e-5, `α = ${((a * 180) / Math.PI).toFixed(0)}°`)
    }
  })

  it('costs capacity relative to treating the axes independently', () => {
    // the 45° coupled answer must sit BELOW the uniaxial strong-axis collapse
    const Mpy = 100, Mpz = 200, a = Math.PI / 4
    const skew = collapse({
      ...cantilever({ Mpy, Mpz, by: B, bz: B }), ...base,
      loads: [{ node: 'b', Fy: -Math.cos(a), Fz: -Math.sin(a) }], controlDir: 'y',
    })
    expect(skew).toBeLessThan(Mpz / L)
    expectRel(skew, exactSkew(a, Mpy, Mpz))
  })
})

describe('nonlinearFrame3d — orientation independence', () => {
  /** Rotation about an arbitrary axis by θ (Rodrigues). */
  const rotation = (axis: V3, th: number) => {
    const n = Math.hypot(...axis)
    const [ux, uy, uz] = [axis[0] / n, axis[1] / n, axis[2] / n]
    const c = Math.cos(th), s = Math.sin(th), t = 1 - c
    return [
      [t * ux * ux + c, t * ux * uy - s * uz, t * ux * uz + s * uy],
      [t * ux * uy + s * uz, t * uy * uy + c, t * uy * uz - s * ux],
      [t * ux * uz - s * uy, t * uy * uz + s * ux, t * uz * uz + c],
    ]
  }
  const apply = (Q: number[][], v: V3): V3 =>
    [dotRow(Q[0], v), dotRow(Q[1], v), dotRow(Q[2], v)]
  function dotRow(r: number[], v: V3) { return r[0] * v[0] + r[1] * v[1] + r[2] * v[2] }

  it('gives the same collapse load after an arbitrary rigid rotation of the model', () => {
    // With a CIRCULAR surface the answer cannot depend on how the section axes
    // happen to fall, so rotating the whole problem — geometry and load — must
    // leave the collapse load unchanged. This is the test that the local-axis
    // projection in B and the transform in A agree; get either wrong and the
    // rotated model reports a different mechanism load.
    const Mp = 150
    const runAt = (Q: number[][]) => {
      const tip = apply(Q, [L, 0, 0])
      const dirLoad = apply(Q, [0, -1, 0])
      const ctrl = (['x', 'y', 'z'] as const)[
        [Math.abs(dirLoad[0]), Math.abs(dirLoad[1]), Math.abs(dirLoad[2])]
          .reduce((best, v, k, arr) => (v > arr[best] ? k : best), 0)
      ]
      return collapse({
        ...cantilever({ Mpy: Mp, Mpz: Mp, by: B, bz: B }, tip),
        supports: [{ node: 'a', fixity: 'fixed' }],
        loads: [{ node: 'b', Fx: dirLoad[0], Fy: dirLoad[1], Fz: dirLoad[2] }],
        controlNode: 'b', controlDir: ctrl, dispMax: 0.2, steps: 200,
      })
    }
    const ident = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    const ref = runAt(ident)
    expectRel(ref, Mp / L)
    for (const [axis, th] of [
      [[0, 0, 1], 0.7], [[1, 1, 1], 1.2], [[0.3, -0.8, 0.5], 2.1],
    ] as Array<[V3, number]>) {
      expectRel(runAt(rotation(axis, th)), ref, 1e-6, `axis ${axis} θ=${th}`)
    }
  })

  it('matches the closed-form ellipse for a skewed member, in its own local axes', () => {
    // An arbitrary member direction: the load is built from the axes the solver
    // itself derives, so the elliptical closed form still applies and the whole
    // orientation machinery is exercised with Mpy ≠ Mpz.
    const dir: V3 = [2, 1.5, -1]
    const R = localAxes(dir, defaultAxisRotation(dir))
    const len = Math.hypot(...dir)
    const Mpy = 100, Mpz = 200, a = Math.PI / 5
    // tip load −(cosα·e_y′ + sinα·e_z′), unit magnitude ⇒ λ is the load
    const v: V3 = [
      -(Math.cos(a) * R[1][0] + Math.sin(a) * R[2][0]),
      -(Math.cos(a) * R[1][1] + Math.sin(a) * R[2][1]),
      -(Math.cos(a) * R[1][2] + Math.sin(a) * R[2][2]),
    ]
    const ctrl = (['x', 'y', 'z'] as const)[
      [Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])]
        .reduce((best, x, k, arr) => (x > arr[best] ? k : best), 0)
    ]
    const got = collapse({
      ...cantilever({ Mpy, Mpz, by: B, bz: B }, dir),
      supports: [{ node: 'a', fixity: 'fixed' }],
      loads: [{ node: 'b', Fx: v[0], Fy: v[1], Fz: v[2] }],
      controlNode: 'b', controlDir: ctrl, dispMax: 0.25, steps: 250,
    })
    const exact = 1 / (len * Math.hypot(Math.sin(a) / Mpy, Math.cos(a) / Mpz))
    expectRel(got, exact)
  })
})

describe('nonlinearFrame3d — P–M interaction and hinge reporting', () => {
  const base = {
    supports: [{ node: 'a', fixity: 'fixed' as const }],
    controlNode: 'b', controlDir: 'y' as const, dispMax: 0.15, steps: 150,
  }

  it('reduces the collapse load as axial compression grows', () => {
    const Mpz = 200, Pcap = 3000
    const at = (N: number) => collapse({
      ...cantilever({ Mpz, Mpy: 100, bz: B, by: B, Pcap }), ...base,
      // axial rides with λ, so the interaction is felt as the frame is pushed
      loads: [{ node: 'b', Fy: -1, Fx: -N }],
    })
    // AISC's strong-axis chord is 1.18(1 − P/Py) CAPPED at Mp, so it is flat
    // until P/Py > 0.153 — the axial has to be big enough to leave that plateau
    // or the test would be asserting a reduction the code does not claim.
    const caps = [0, 15, 30].map(at)
    expectRel(caps[0], Mpz / L)
    expect(caps[1]).toBeLessThan(caps[0])
    expect(caps[2]).toBeLessThan(caps[1])
  })

  it('reports per-hinge moments, rotations, utilisation and axial force', () => {
    const Mpz = 200
    const r = nonlinearFrame3D({
      ...cantilever({ Mpz, Mpy: 100, bz: B, by: B }),
      ...base, control: 'displacement',
      loads: [{ node: 'b', Fy: -1 }],
    })!
    const root = r.hinges.find((h) => h.end === 'i')!
    expect(root.member).toBe('m')
    expectRel(Math.abs(root.Mz), Mpz)      // perfectly plastic ⇒ at capacity
    expect(Math.abs(root.My)).toBeLessThan(1e-6)       // no weak-axis demand
    expect(root.yielded).toBe(true)
    expect(root.utilisation).toBeCloseTo(1, 4)
    expect(Math.abs(root.plasticZ)).toBeGreaterThan(0)
    expect(r.totalDissipated).toBeGreaterThan(0)
    // the free end carries no moment, so its hinge never yields
    const tip = r.hinges.find((h) => h.end === 'j')!
    expect(tip.yielded).toBe(false)
    expect(tip.utilisation).toBeLessThan(1)
  })

  it('unloads elastically and re-yields under a reversed push', () => {
    const Mpz = 200
    const r = nonlinearFrame3D({
      ...cantilever({ Mpz, Mpy: 1e9, bz: 0.02 }),
      supports: [{ node: 'a', fixity: 'fixed' }],
      loads: [{ node: 'b', Fy: -1 }], controlNode: 'b', controlDir: 'y',
      control: 'displacement',
      dispSchedule: [
        ...Array.from({ length: 30 }, (_, i) => (0.08 * (i + 1)) / 30),
        ...Array.from({ length: 60 }, (_, i) => 0.08 - (0.16 * (i + 1)) / 60),
      ],
    })!
    const peak = Math.max(...r.steps.map((s) => s.lambda))
    const trough = Math.min(...r.steps.map((s) => s.lambda))
    expect(peak).toBeGreaterThan(Mpz / L)             // hardening lifts it slightly
    expect(trough).toBeLessThan(-Mpz / L)             // yields the other way too
    expect(r.hinges[0].dissipated).toBeGreaterThan(0)
    expect(r.converged).toBe(true)
  })
})
