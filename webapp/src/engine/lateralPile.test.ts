import { describe, it, expect } from 'vitest'
import {
  bromsClay, bromsSand, matlockClayPy, apiSandPy, apiSandCoeffs, pyAnalysis,
  type SoilModel,
} from './lateralPile'

describe('bromsClay', () => {
  const base = { L: 10, d: 0.6, cu: 40, My: 1e9 }   // huge My ⇒ soil governs

  it('reduces to the classic 0.414·q·L for a surface load and no gap zone', () => {
    // With e = 0 and the top-1.5d gap removed (d → 0 in `a` only), the free-head
    // short-pile equilibrium has the closed-form answer H = (√2 − 1)·q·L.
    // Reproducing it is the check on the derivation in the docstring.
    const d = 1e-9   // collapses a = 1.5d without changing q, which we set below
    const cu = 40, L = 10
    const q = 9 * cu * d
    const r = bromsClay({ L, d, cu, My: 1e12, e: 0 })
    expect(r.shortPile / (q * L)).toBeCloseTo(Math.SQRT2 - 1, 6)
  })

  it('is soil-governed with a strong pile and hinge-governed with a weak one', () => {
    const strong = bromsClay(base)
    expect(strong.mode).toBe('short')
    const weak = bromsClay({ ...base, My: 50 })
    expect(weak.mode).toBe('long')
    expect(weak.Hu).toBeLessThan(strong.Hu)
    // the governing capacity is always the lower branch
    for (const r of [strong, weak]) expect(r.Hu).toBe(Math.min(r.shortPile, r.longPile))
  })

  it('falls as the load is applied higher above ground', () => {
    let prev = Infinity
    for (const e of [0, 1, 2, 4]) {
      const H = bromsClay({ ...base, e }).Hu
      expect(H).toBeLessThan(prev)
      prev = H
    }
  })

  it('gains capacity with length, strength and diameter', () => {
    expect(bromsClay({ ...base, L: 14 }).Hu).toBeGreaterThan(bromsClay(base).Hu)
    expect(bromsClay({ ...base, cu: 80 }).Hu).toBeGreaterThan(bromsClay(base).Hu)
    expect(bromsClay({ ...base, d: 0.9 }).Hu).toBeGreaterThan(bromsClay(base).Hu)
  })

  it('a fixed head is stronger than a free head', () => {
    const free = bromsClay({ ...base, head: 'free' })
    const fixed = bromsClay({ ...base, head: 'fixed' })
    expect(fixed.Hu).toBeGreaterThan(free.Hu)
    // fixed short-pile capacity is simply the full effective length in bearing
    expect(fixed.shortPile).toBeCloseTo(9 * 40 * 0.6 * (10 - 1.5 * 0.6), 9)
  })

  it('puts the hinge below the 1.5d gap zone', () => {
    const r = bromsClay({ ...base, My: 200 })
    expect(r.zMax).toBeGreaterThan(1.5 * base.d)
    expect(r.Mmax).toBeGreaterThan(0)
  })
})

describe('bromsSand', () => {
  const base = { L: 10, d: 0.6, gamma: 10, phiDeg: 32, My: 1e9 }

  it('matches the published short free-head closed form', () => {
    const Kp = Math.tan((45 + 32 / 2) * Math.PI / 180) ** 2
    for (const e of [0, 1.5]) {
      const want = (0.5 * Kp * 10 * 0.6 * 10 ** 3) / (e + 10)
      expect(bromsSand({ ...base, e }).shortPile).toBeCloseTo(want, 6)
    }
  })

  it('gives the full passive resultant to a fixed head', () => {
    const Kp = Math.tan((45 + 32 / 2) * Math.PI / 180) ** 2
    expect(bromsSand({ ...base, head: 'fixed' }).shortPile)
      .toBeCloseTo(1.5 * Kp * 10 * 0.6 * 10 ** 2, 6)
  })

  it('solves the long-pile hinge condition consistently', () => {
    const My = 400
    const r = bromsSand({ ...base, My, e: 1 })
    expect(r.mode).toBe('long')
    // back-substitute into H·e + (2/3)·H·f = My with H = c·f²
    const Kp = Math.tan((45 + 32 / 2) * Math.PI / 180) ** 2
    const c = 1.5 * Kp * 10 * 0.6
    const f = Math.sqrt(r.Hu / c)
    expect(r.Hu * 1 + (2 / 3) * r.Hu * f).toBeCloseTo(My, 4)
    expect(r.zMax).toBeCloseTo(f, 6)
  })

  it('grows steeply with length while the soil governs', () => {
    // short-pile capacity is 0.5·Kp·γ·d·L³/(e+L), so with the load AT ground
    // level it is exactly ∝ L² — doubling the length quadruples it — and with
    // the load raised it grows faster still, approaching L³ as e dominates.
    const at = (L: number, e = 0) => bromsSand({ ...base, L, e }).shortPile
    expect(at(10) / at(5)).toBeCloseTo(4, 9)
    expect(at(10, 5) / at(5, 5)).toBeGreaterThan(4)
  })

  it('gains capacity with the friction angle', () => {
    let prev = 0
    for (const phiDeg of [28, 32, 36, 40]) {
      const H = bromsSand({ ...base, phiDeg }).Hu
      expect(H).toBeGreaterThan(prev)
      prev = H
    }
  })
})

describe('p-y curves', () => {
  it('Matlock reaches pu at y = 8·y50 and caps there', () => {
    const p = { cu: 30, gamma: 8, D: 0.6, e50: 0.01 }
    const y50 = 2.5 * 0.01 * 0.6
    const deep = 20   // z ≫ D ⇒ the N = 9 cap applies
    const pu = 9 * 30 * 0.6
    expect(matlockClayPy(8 * y50, deep, p).p).toBeCloseTo(pu, 6)
    expect(matlockClayPy(50 * y50, deep, p).p).toBeCloseTo(pu, 6)
    // half of pu at y = y50, by construction of the one-third power law
    expect(matlockClayPy(y50, deep, p).p).toBeCloseTo(0.5 * pu, 6)
  })

  it('Matlock is odd in y and monotone', () => {
    const p = { cu: 30, gamma: 8, D: 0.6 }
    expect(matlockClayPy(-0.01, 5, p).p).toBeCloseTo(-matlockClayPy(0.01, 5, p).p, 12)
    let prev = 0
    for (const y of [0.001, 0.005, 0.01, 0.05]) {
      const v = matlockClayPy(y, 5, p).p
      expect(v).toBeGreaterThan(prev)
      prev = v
    }
  })

  it('Matlock strength grows with depth until the N = 9 cap', () => {
    const p = { cu: 30, gamma: 8, D: 0.6 }
    const at = (z: number) => matlockClayPy(1, z, p).p        // y large ⇒ at pu
    expect(at(1)).toBeLessThan(at(3))
    expect(at(20)).toBeCloseTo(at(40), 6)                     // both capped
    expect(at(40)).toBeCloseTo(9 * 30 * 0.6, 6)
  })

  it('API sand coefficients are positive and increase with φ', () => {
    let prev = { C1: 0, C2: 0, C3: 0 }
    for (const phi of [25, 30, 35, 40]) {
      const c = apiSandCoeffs(phi)
      expect(c.C1).toBeGreaterThan(prev.C1)
      expect(c.C2).toBeGreaterThan(prev.C2)
      expect(c.C3).toBeGreaterThan(prev.C3)
      prev = c
    }
    // magnitudes in the range the published chart shows
    const c30 = apiSandCoeffs(30)
    expect(c30.C1).toBeGreaterThan(1); expect(c30.C1).toBeLessThan(4)
    expect(c30.C3).toBeGreaterThan(15); expect(c30.C3).toBeLessThan(60)
  })

  it('API sand tends to A·pu and is zero at the surface', () => {
    const p = { gamma: 10, phiDeg: 35, D: 0.6, k: 30000 }
    expect(apiSandPy(0.1, 0, p).p).toBe(0)          // no confinement at z = 0
    const big = apiSandPy(10, 5, p).p
    const bigger = apiSandPy(50, 5, p).p
    expect(bigger).toBeCloseTo(big, 6)              // tanh saturated
    expect(apiSandPy(1e-9, 5, p).k).toBeCloseTo(30000 * 5, 3)   // initial slope k·z
  })
})

describe('pyAnalysis', () => {
  const clay: SoilModel = { kind: 'clay', cu: 40, gamma: 9, e50: 0.01 }
  const sand: SoilModel = { kind: 'sand', gamma: 10, phiDeg: 33, k: 25000 }
  const base = { L: 12, D: 0.6, EI: 180000, elements: 40 }

  it('converges and returns a sane deflected shape in clay', () => {
    const r = pyAnalysis({ ...base, H: 150, soil: clay })
    expect(r.converged).toBe(true)
    expect(r.residual).toBeLessThan(1e-8)
    expect(r.yHead).toBeGreaterThan(0)
    // deflection decays down the pile and the toe barely moves
    expect(Math.abs(r.stations[r.stations.length - 1].y)).toBeLessThan(Math.abs(r.yHead) / 10)
    expect(r.Mmax).toBeGreaterThan(0)
    expect(r.zMmax).toBeGreaterThan(0)
    expect(r.zMmax).toBeLessThan(base.L / 2)
  })

  it('converges in sand too', () => {
    const r = pyAnalysis({ ...base, H: 150, soil: sand })
    expect(r.converged).toBe(true)
    expect(r.yHead).toBeGreaterThan(0)
    expect(r.Mmax).toBeGreaterThan(0)
  })

  it('is monotone in load, and softens as the soil yields', () => {
    const y = [50, 100, 200, 400].map((H) => pyAnalysis({ ...base, H, soil: clay }).yHead)
    for (let k = 1; k < y.length; k++) expect(y[k]).toBeGreaterThan(y[k - 1])
    // nonlinear: doubling the load more than doubles the deflection
    expect(y[1] / y[0]).toBeGreaterThan(2)
  })

  it('a head moment increases deflection, and a fixed head reduces it', () => {
    const plain = pyAnalysis({ ...base, H: 150, soil: clay })
    const eccentric = pyAnalysis({ ...base, H: 150, M: 300, soil: clay })
    expect(eccentric.yHead).toBeGreaterThan(plain.yHead)
    const fixed = pyAnalysis({ ...base, H: 150, soil: clay, head: 'fixed' })
    expect(fixed.yHead).toBeLessThan(plain.yHead)
  })

  it('stiffer soil and stiffer pile both reduce head deflection', () => {
    const soft = pyAnalysis({ ...base, H: 150, soil: clay })
    const stiff = pyAnalysis({ ...base, H: 150, soil: { kind: 'clay', cu: 120, gamma: 9 } })
    expect(stiff.yHead).toBeLessThan(soft.yHead)
    const rigid = pyAnalysis({ ...base, EI: 900000, H: 150, soil: clay })
    expect(rigid.yHead).toBeLessThan(soft.yHead)
  })

  it('is already mesh-converged at a coarse discretisation', () => {
    // The beam element is exact for a cubic, so the only discretisation error is
    // in lumping the springs — 20 elements over 12 m already agrees with 80 to
    // better than 0.1%, which is why the default of 50 is comfortable.
    const at = (elements: number) => pyAnalysis({ ...base, elements, H: 150, soil: clay }).yHead
    const a = at(20), c = at(80)
    expect(Math.abs(a - c) / c).toBeLessThan(1e-3)
  })

  it('converges quickly at service loads, not just at large ones', () => {
    // Regression on the cube-root singularity: before the origin was
    // regularised, every load below ~150 kN stalled at a residual around 2e-6
    // no matter how many iterations it was given.
    for (const H of [10, 25, 50, 100, 200]) {
      const r = pyAnalysis({ ...base, H, soil: clay })
      expect(r.converged, `H = ${H} kN`).toBe(true)
      expect(r.residual).toBeLessThan(1e-9)
      expect(r.iterations).toBeLessThan(20)
      expect(r.yHead).toBeGreaterThan(0)
    }
  })

  it('an eccentric load pushes the head further, not less', () => {
    // The head-moment sign is stated physically, because the solver's own DOF
    // convention has the opposite sense — getting it wrong made an eccentric
    // load REDUCE the deflection, which is the kind of error that never
    // announces itself.
    const plain = pyAnalysis({ ...base, H: 150, soil: clay }).yHead
    let prev = plain
    for (const e of [1, 2, 4]) {
      const y = pyAnalysis({ ...base, H: 150, e, soil: clay }).yHead
      expect(y).toBeGreaterThan(prev)
      prev = y
    }
    // and `e` is exactly equivalent to the matching moment
    expect(pyAnalysis({ ...base, H: 150, e: 2, soil: clay }).yHead)
      .toBeCloseTo(pyAnalysis({ ...base, H: 150, M: 300, soil: clay }).yHead, 9)
  })

  it('a pile long enough to be flexible stops caring about extra length', () => {
    // beyond the active length the toe is doing nothing, so adding pile does not
    // change the head response — the classic "long pile" signature
    const a = pyAnalysis({ ...base, L: 12, H: 150, soil: clay }).yHead
    const b = pyAnalysis({ ...base, L: 18, H: 150, soil: clay }).yHead
    expect(Math.abs(b - a) / a).toBeLessThan(0.02)
  })
})
