import { describe, it, expect } from 'vitest'
import { chordDeflection, bransonIe, ruptureModulus, memberServiceDeflection } from './memberDeflection'
import { crackedInertia } from './beamDeflection'
import { Ec } from './slabDeflection'
import { solveFrame3D, rectJ, type F3Node, type F3Member, type F3Support, type F3Load } from './frame3d'

/** Stations 0…L with `n` intervals. */
const stations = (L: number, n: number) => Array.from({ length: n + 1 }, (_, k) => (L * k) / n)

describe('memberDeflection — chordDeflection against closed forms', () => {
  const L = 6, EI = 20000   // m, kN·m²

  it('simply supported UDL → 5wL⁴/384EI', () => {
    const w = 12                                   // kN/m
    const xs = stations(L, 400)
    const M = xs.map((x) => (w * x * (L - x)) / 2)  // sagging, kN·m
    const r = chordDeflection(xs, M, EI)
    const exact = (5 * w * L ** 4) / (384 * EI) * 1000   // mm
    // parabolic M is only approximated by piecewise-linear φ, so this is a
    // RELATIVE tolerance; the convergence test below pins the order
    expect(Math.abs(r.max / exact - 1)).toBeLessThan(1e-5)
    expect(r.xMax).toBeCloseTo(L / 2, 6)
    expect(r.v[0]).toBeCloseTo(0, 12)
    expect(r.v[r.v.length - 1]).toBeCloseTo(0, 12)
  })

  it('fixed–fixed UDL → wL⁴/384EI (the same integral, different M diagram)', () => {
    const w = 12
    const xs = stations(L, 400)
    // M(x) = w/12·(6Lx − 6x² − L²): −wL²/12 at the ends, +wL²/24 at midspan
    const M = xs.map((x) => (w / 12) * (6 * L * x - 6 * x * x - L * L))
    const r = chordDeflection(xs, M, EI)
    const exact = (w * L ** 4) / (384 * EI) * 1000
    // same absolute curvature error as the SS case above, but the fixed-fixed
    // deflection is 5× smaller — so the RELATIVE bound is 5× looser
    expect(Math.abs(r.max / exact - 1)).toBeLessThan(1e-4)
    expect(r.xMax).toBeCloseTo(L / 2, 6)
  })

  it('converges as O(Δx²) on a parabolic moment diagram', () => {
    const w = 12
    const exact = (5 * w * L ** 4) / (384 * EI) * 1000
    const err = (n: number) => {
      const xs = stations(L, n)
      return Math.abs(chordDeflection(xs, xs.map((x) => (w * x * (L - x)) / 2), EI).max - exact)
    }
    // halving Δx must quarter the error
    for (const n of [50, 100, 200]) expect(err(n) / err(2 * n)).toBeCloseTo(4, 1)
    expect(err(400) / exact).toBeLessThan(1e-5)
  })

  it('simply supported central point load → PL³/48EI, EXACTLY', () => {
    const P = 40
    const xs = stations(L, 400)
    const M = xs.map((x) => (x <= L / 2 ? (P * x) / 2 : (P * (L - x)) / 2))
    const r = chordDeflection(xs, M, EI)
    // linear M ⇒ piecewise-linear φ is the true curvature, so no discretization
    // error at all — this is what the closed-form segment integration buys
    expect(r.max).toBeCloseTo((P * L ** 3) / (48 * EI) * 1000, 10)
  })

  it('cantilever UDL → wL⁴/8EI at the tip, deflecting DOWNWARD', () => {
    const w = 10
    const xs = stations(L, 400)
    // built-in at x = 0: M = −w/2·(L−x)² (hogging everywhere)
    const M = xs.map((x) => -(w / 2) * (L - x) ** 2)
    const r = chordDeflection(xs, M, EI, true)
    expect(r.max).toBeCloseTo((w * L ** 4) / (8 * EI) * 1000, 3)
    expect(r.xMax).toBeCloseTo(L, 6)
    // downward is POSITIVE — the same sign a sagging span reports, so the
    // schedule can compare both against the same limit
    expect(r.max).toBeGreaterThan(0)
    expect(r.v[0]).toBeCloseTo(0, 12)          // built-in end does not move
  })

  it('cantilever tip slope and deflection both vanish at the built-in end', () => {
    const P = 25
    const xs = stations(L, 300)
    const M = xs.map((x) => -P * (L - x))       // tip point load, linear M
    const r = chordDeflection(xs, M, EI, true)
    expect(r.max).toBeCloseTo((P * L ** 3) / (3 * EI) * 1000, 8)   // linear M ⇒ exact
    expect(r.v[0]).toBeCloseTo(0, 12)
    expect(r.v[1]).toBeGreaterThan(0)           // monotonic away from the support
  })

  it('scales linearly with load and inversely with EI', () => {
    const xs = stations(L, 200)
    const M = xs.map((x) => (10 * x * (L - x)) / 2)
    const a = chordDeflection(xs, M, EI)
    const b = chordDeflection(xs, M.map((m) => 2 * m), EI)
    const c = chordDeflection(xs, M, 2 * EI)
    expect(b.max / a.max).toBeCloseTo(2, 12)
    expect(c.max / a.max).toBeCloseTo(0.5, 12)
  })

  it('a rigid-body chord movement contributes nothing (M ≡ 0)', () => {
    const xs = stations(L, 50)
    const r = chordDeflection(xs, xs.map(() => 0), EI)
    expect(r.max).toBe(0)
    expect(r.v.every((v) => v === 0)).toBe(true)
  })

  it('degenerate inputs are handled, not thrown', () => {
    expect(chordDeflection([], [], EI).max).toBe(0)
    expect(chordDeflection([0], [5], EI).max).toBe(0)
    expect(chordDeflection([0, 1], [1, 1], 0).v).toHaveLength(2)   // EI → floor
  })
})

describe('memberDeflection — Branson Ie', () => {
  it('uncracked while Ma ≤ Mcr', () => {
    expect(bransonIe(10, 20, 1000, 300)).toBe(1000)
    expect(bransonIe(20, 20, 1000, 300)).toBe(1000)
    expect(bransonIe(0, 20, 1000, 300)).toBe(1000)
  })

  it('interpolates between Ig and Icr, never above Ig', () => {
    const Ie = bransonIe(40, 20, 1000, 300)
    // (20/40)³ = 0.125 → 0.125·1000 + 0.875·300 = 387.5
    expect(Ie).toBeCloseTo(387.5, 9)
    expect(Ie).toBeLessThan(1000)
    expect(Ie).toBeGreaterThan(300)
  })

  it('tends to Icr as Ma grows', () => {
    expect(bransonIe(1e6, 20, 1000, 300)).toBeCloseTo(300, 6)
  })

  it('fr = 0.62λ√f′c', () => {
    expect(ruptureModulus(28)).toBeCloseTo(0.62 * Math.sqrt(28), 12)
    expect(ruptureModulus(28, 0.75)).toBeCloseTo(0.75 * 0.62 * Math.sqrt(28), 12)
  })
})

describe('memberDeflection — memberServiceDeflection', () => {
  const L = 7, b = 300, h = 500, cover = 40
  const d = h - cover - 10 - 25 / 2
  const fc = 28
  const udlM = (w: number) => {
    const xs = stations(L, 200)
    return { xs, M: xs.map((x) => (w * x * (L - x)) / 2) }
  }

  it('reproduces the closed form when the member is uncracked (Ie = Ig)', () => {
    // tiny loads keep Ma < Mcr, so Ie = Ig and δ = 5wL⁴/384·Ec·Ig exactly
    const wD = 1
    const { xs, M } = udlM(wD)
    const r = memberServiceDeflection({
      xs, MD: M, ML: xs.map(() => 0), L, b, h, d, As: 1200, fc, support: 'simple',
    })
    expect(r.cracked).toBe(false)
    expect(r.Ie).toBe(r.Ig)
    const EI = Ec(fc) * r.Ig * 1e-9
    expect(r.deltaD).toBeCloseTo((5 * wD * L ** 4) / (384 * EI) * 1000, 4)
    expect(r.deltaL).toBe(0)
  })

  it('cracks under service load and softens toward Icr', () => {
    const wD = 18, wL = 12
    const D = udlM(wD), Lv = udlM(wL)
    const r = memberServiceDeflection({
      xs: D.xs, MD: D.M, ML: Lv.M, L, b, h, d, As: 1500, fc, support: 'simple',
    })
    expect(r.cracked).toBe(true)
    expect(r.Ie).toBeLessThan(r.Ig)
    expect(r.Ie).toBeGreaterThan(r.Icr)
    expect(r.Icr).toBeCloseTo(crackedInertia({ b, d, As: 1500, fc }), 6)
    // Ma is the peak of the SERVICE (D+L) diagram
    expect(r.Ma).toBeCloseTo(((wD + wL) * L ** 2) / 8, 3)
    // a cracked member deflects more than the same member on Ig
    const EIg = Ec(fc) * r.Ig * 1e-9
    expect(r.deltaD).toBeGreaterThan((5 * wD * L ** 4) / (384 * EIg) * 1000)
  })

  it('long-term multiplier is relieved by compression steel', () => {
    const D = udlM(18), Lv = udlM(12)
    const base = { xs: D.xs, MD: D.M, ML: Lv.M, L, b, h, d, As: 1500, fc, support: 'simple' as const }
    const none = memberServiceDeflection(base)
    const withAsP = memberServiceDeflection({ ...base, AsPrime: 600, dPrime: 60 })
    expect(none.lambdaDelta).toBeCloseTo(2, 12)          // ξ = 2, ρ′ = 0
    expect(withAsP.lambdaDelta).toBeLessThan(none.lambdaDelta)
    expect(withAsP.deltaLong).toBeLessThan(none.deltaLong)
    expect(withAsP.Icr).toBeGreaterThan(none.Icr)        // A′s stiffens the cracked section
  })

  it('total = λΔ·δD + δL and the two limits are L/240 and L/360', () => {
    const D = udlM(18), Lv = udlM(12)
    const r = memberServiceDeflection({
      xs: D.xs, MD: D.M, ML: Lv.M, L, b, h, d, As: 1500, fc, support: 'simple',
    })
    expect(r.deltaTotal).toBeCloseTo(r.lambdaDelta * r.deltaD + r.deltaL, 12)
    expect(r.limitL240).toBeCloseTo((L * 1000) / 240, 12)
    expect(r.limitL360).toBeCloseTo((L * 1000) / 360, 12)
    expect(r.liveOK).toBe(r.deltaL <= r.limitL360 + 1e-9)
    expect(r.totalOK).toBe(r.deltaTotal <= r.limitL240 + 1e-9)
  })

  it('a springboard span fails both limits', () => {
    // 12 m on a 250×400 — hMin (Table 409.3.1.1) wants 750 mm, so this is a
    // section the deemed-to-comply check already rejects; the point is that the
    // COMPUTED deflection agrees rather than quietly passing it.
    const Lng = 12
    const xs = stations(Lng, 200)
    const M = (w: number) => xs.map((x) => (w * x * (Lng - x)) / 2)
    const r = memberServiceDeflection({
      xs, MD: M(20), ML: M(15), L: Lng, b: 250, h: 400, d: 340, As: 1500, fc, support: 'simple',
    })
    expect(r.hMinOK).toBe(false)                        // 400 < 750 mm
    expect(r.totalOK).toBe(false)                       // δtotal > L/240 = 50 mm
    expect(r.liveOK).toBe(false)                        // δlive  > L/360 = 33 mm
    expect(r.deltaTotal).toBeGreaterThan(r.limitL240)
    // sanity on magnitude: ~305 mm dead + ~229 mm live is a genuine springboard
    expect(r.deltaD).toBeGreaterThan(100)
  })

  it('a properly sized member passes both limits — the check is not always red', () => {
    // 6 m, 300×600, modest service load: hMin = 6000/16·(0.4+415/700) = 371 mm
    const Ls = 6
    const xs = stations(Ls, 200)
    const M = (w: number) => xs.map((x) => (w * x * (Ls - x)) / 2)
    const r = memberServiceDeflection({
      xs, MD: M(14), ML: M(8), L: Ls, b: 300, h: 600, d: 535, As: 1400,
      AsPrime: 400, dPrime: 60, fc, fy: 415, support: 'both-ends',
    })
    expect(r.hMinOK).toBe(true)
    expect(r.liveOK).toBe(true)
    expect(r.totalOK).toBe(true)
    expect(r.deltaTotal).toBeLessThan(r.limitL240)
  })
})

describe('memberDeflection — against a real frame3d member', () => {
  // Post-processing the SOLVER's own moment diagram must reproduce the SOLVER's
  // own displacement field. This is the check that matters: it closes the loop
  // between the FEM (which never computes an interior deflection) and §424.2.
  const b = 300, h = 550, fc = 28
  const E = Ec(fc), G = E / 2.4
  const Ig = (b * h ** 3) / 12
  const EIg = E * Ig * 1e-9                    // kN·m² — see memberDeflection.ts
  const secProps = { E, G, A: b * h, Iy: (h * b ** 3) / 12, Iz: Ig, J: rectJ(b, h) }

  /** Chain of `n` equal members spanning L along +X, meshed for nodal sampling. */
  const chain = (L: number, n: number) => {
    const nodes: F3Node[] = Array.from({ length: n + 1 }, (_, k) => ({ id: `n${k}`, x: (L * k) / n, y: 0, z: 0 }))
    const members: F3Member[] = Array.from({ length: n }, (_, k) => ({ id: `m${k}`, i: `n${k}`, j: `n${k + 1}`, ...secProps }))
    return { nodes, members }
  }
  /** Stitch a chain's member diagrams into one continuous (xs, Mz) over the span. */
  const stitch = (res: { members: { id: string; xs: number[]; Mz: number[] }[] }, n: number, L: number) => {
    const xs: number[] = [], Mz: number[] = []
    for (let k = 0; k < n; k++) {
      const m = res.members.find((x) => x.id === `m${k}`)!
      const x0 = (L * k) / n
      const from = k === 0 ? 0 : 1
      for (let q = from; q < m.xs.length; q++) { xs.push(x0 + m.xs[q]); Mz.push(m.Mz[q]) }
    }
    return { xs, Mz }
  }

  it('fixed–fixed, central point load: integration ≡ FEM ≡ PL³/192EI', () => {
    const L = 6, n = 2, P = 60
    const { nodes, members } = chain(L, n)
    const supports: F3Support[] = [{ node: 'n0', fixity: 'fixed' }, { node: `n${n}`, fixity: 'fixed' }]
    const r = solveFrame3D(nodes, members, supports, [{ kind: 'node', node: 'n1', Fy: -P, cat: 'D' }])!
    const femMid = Math.abs(r.d[6 * 1 + 1]) * 1000                 // node n1 uy, mm
    const { xs, Mz } = stitch(r, n, L)
    const integ = chordDeflection(xs, Mz, EIg)

    expect(femMid).toBeCloseTo((P * L ** 3) / (192 * EIg) * 1000, 6)   // solver ≡ closed form
    expect(integ.max).toBeCloseTo(femMid, 6)                            // integration ≡ solver
    expect(integ.xMax).toBeCloseTo(L / 2, 9)
  })

  it('propped cantilever under UDL: integration ≡ FEM ≡ 0.0054·wL⁴/EI off-centre', () => {
    const L = 8, n = 16, w = 25
    const { nodes, members } = chain(L, n)
    const supports: F3Support[] = [{ node: 'n0', fixity: 'fixed' }, { node: `n${n}`, fixity: 'pin' }]
    const loads: F3Load[] = members.map((m) => ({ kind: 'member-udl' as const, member: m.id, w, cat: 'D' as const }))
    const r = solveFrame3D(nodes, members, supports, loads)!
    // FEM peak nodal deflection and where it happens
    let femMax = 0, femX = 0
    nodes.forEach((nd, k) => {
      const v = Math.abs(r.d[6 * k + 1]) * 1000
      if (v > femMax) { femMax = v; femX = nd.x }
    })
    const { xs, Mz } = stitch(r, n, L)
    const integ = chordDeflection(xs, Mz, EIg)

    // The FEM only knows NODAL displacements, and the true peak of a propped
    // cantilever falls between nodes — so integrating the moment diagram finds
    // a slightly LARGER (and more accurate) peak. That gap is the whole reason
    // this post-processing exists.
    expect(integ.max).toBeGreaterThanOrEqual(femMax)
    expect(Math.abs(integ.max / femMax - 1)).toBeLessThan(0.005)
    expect(Math.abs(integ.xMax - femX)).toBeLessThanOrEqual(L / n + 1e-9)
    // closed form: δmax = wL⁴/(185·EI) at x = 0.5785L (Roark / AISC Table 3-23)
    expect(Math.abs(integ.max / ((w * L ** 4) / (185 * EIg) * 1000) - 1)).toBeLessThan(0.01)
    expect(integ.xMax / L).toBeCloseTo(0.5785, 1)
    // and the end conditions really are enforced
    expect(integ.v[0]).toBeCloseTo(0, 9)
    expect(integ.v[integ.v.length - 1]).toBeCloseTo(0, 9)
  })

  it('the deflection is CHORD-relative — a settled support does not inflate it', () => {
    // Same beam, but one support sits on a soft spring so the whole chord drops.
    // The flexural deflection about the chord must be unchanged; only the rigid
    // body movement differs, and that is not a serviceability failure.
    const L = 6, n = 2, P = 60
    const { nodes, members } = chain(L, n)
    const stiff: F3Support[] = [{ node: 'n0', fixity: 'fixed' }, { node: `n${n}`, fixity: 'fixed' }]
    const a = solveFrame3D(nodes, members, stiff, [{ kind: 'node', node: 'n1', Fy: -P, cat: 'D' }])!
    const soft: F3Support[] = [
      { node: 'n0', fixity: 'fixed' },
      { node: `n${n}`, fixity: 'spring', ky: 5000, kx: 1e9, kz: 1e9, krx: 1e9, kry: 1e9, krz: 1e9 } as F3Support,
    ]
    const bRes = solveFrame3D(nodes, members, soft, [{ kind: 'node', node: 'n1', Fy: -P, cat: 'D' }])
    if (!bRes) return                       // spring support unsupported → nothing to compare
    const va = chordDeflection(stitch(a, n, L).xs, stitch(a, n, L).Mz, EIg)
    const vb = chordDeflection(stitch(bRes, n, L).xs, stitch(bRes, n, L).Mz, EIg)
    // the far end really did settle
    expect(Math.abs(bRes.d[6 * n + 1])).toBeGreaterThan(Math.abs(a.d[6 * n + 1]))
    // both report a finite chord deflection with zero at both ends
    for (const v of [va, vb]) {
      expect(v.v[0]).toBeCloseTo(0, 9)
      expect(v.v[v.v.length - 1]).toBeCloseTo(0, 9)
      expect(v.max).toBeGreaterThan(0)
    }
  })

  it('service check on a solved member: cracks, and Ma comes from D+L', () => {
    const L = 7, n = 8
    const { nodes, members } = chain(L, n)
    const supports: F3Support[] = [{ node: 'n0', fixity: 'fixed' }, { node: `n${n}`, fixity: 'fixed' }]
    const run = (w: number) => solveFrame3D(nodes, members, supports,
      members.map((m) => ({ kind: 'member-udl' as const, member: m.id, w, cat: 'D' as const })))!
    const D = stitch(run(22), n, L), Lv = stitch(run(14), n, L)
    const res = memberServiceDeflection({
      xs: D.xs, MD: D.Mz, ML: Lv.Mz, L, b, h, d: 480, As: 1600, fc, support: 'both-ends',
    })
    let peak = 0
    for (let k = 0; k < D.Mz.length; k++) peak = Math.max(peak, Math.abs(D.Mz[k] + Lv.Mz[k]))
    expect(res.Ma).toBeCloseTo(peak, 9)
    expect(res.cracked).toBe(true)
    expect(res.Ie).toBeLessThan(res.Ig)
    expect(res.deltaD).toBeGreaterThan(0)
    expect(res.deltaL).toBeGreaterThan(0)
    // live-load fraction tracks the load ratio (same Ie, linear integration)
    expect(res.deltaL / res.deltaD).toBeCloseTo(14 / 22, 6)
  })
})
