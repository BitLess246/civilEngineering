import { describe, it, expect } from 'vitest'
import { smoothHinge, smoothYieldDeformation, bilinearBackbone } from './smoothHinge'
import { bilinearProbe, newBilinearState } from './hysteresis'

const p = { k0: 1000, Fy: 50, b: 0.02 }
const uy = smoothYieldDeformation(p)          // 0.05

describe('smoothHinge — the two asymptotes it joins', () => {
  it('is elastic at the origin: slope k0, force 0', () => {
    const r = smoothHinge(0, p)
    expect(r.f).toBe(0)
    expect(r.kt).toBeCloseTo(p.k0, 12)
  })

  it('approaches the post-yield line b·k0·u + (1−b)·Fy far past the knee', () => {
    for (const m of [20, 50, 200]) {
      const u = m * uy
      const r = smoothHinge(u, p)
      const asymptote = p.b * p.k0 * u + (1 - p.b) * p.Fy
      expect(Math.abs(r.f / asymptote - 1)).toBeLessThan(1e-12)
      expect(r.kt).toBeCloseTo(p.b * p.k0, 9)
    }
  })

  it('agrees with the bilinear backbone away from the knee, both directions', () => {
    for (const u of [-40 * uy, -10 * uy, 10 * uy, 40 * uy]) {
      const rel = Math.abs(smoothHinge(u, p).f / bilinearBackbone(u, p) - 1)
      expect(rel).toBeLessThan(1e-6)
    }
    // Deep inside the elastic range it is still slightly SOFTER than k0·u,
    // because tanh(x) < x for every x > 0 — the rounding is the material, not
    // an error. It vanishes quadratically: tanh(x)/x = 1 − x²/3 + O(x⁴), so the
    // softness must fall by 100× for every 10× reduction in u.
    const soften = (u: number) => 1 - smoothHinge(u, p).f / bilinearBackbone(u, p)
    for (const u of [0.01 * uy, 0.1 * uy]) expect(soften(u)).toBeGreaterThan(0)
    expect(soften(0.1 * uy) / soften(0.01 * uy)).toBeCloseTo(100, 0)
    // and the leading term is (1−b)·x²/3 with x = u/uy
    expect(soften(0.1 * uy)).toBeCloseTo(((1 - p.b) * 0.1 ** 2) / 3, 4)
  })

  it('matches `bilinearProbe` on its virgin backbone away from the knee', () => {
    // the engine's own material, unloaded state — the smooth law must be the
    // same curve, not merely a similar one
    const st = newBilinearState()
    for (const u of [-30 * uy, -8 * uy, 8 * uy, 30 * uy]) {
      const bl = bilinearProbe(u, st, p).f
      expect(Math.abs(smoothHinge(u, p).f / bl - 1)).toBeLessThan(1e-6)
    }
  })

  it('rounds the corner — inside the knee it is BELOW the bilinear force', () => {
    // this is the price of smoothness, and the reason collapse benchmarks stay
    // on the bilinear material
    const r = smoothHinge(uy, p)
    expect(Math.abs(r.f)).toBeLessThan(Math.abs(bilinearBackbone(uy, p)))
    expect(Math.abs(r.f / bilinearBackbone(uy, p) - 1)).toBeLessThan(0.3)
  })
})

describe('smoothHinge — smoothness, which is the whole point', () => {
  const fd = (u: number, h = 1e-7) => (smoothHinge(u + h, p).f - smoothHinge(u - h, p).f) / (2 * h)

  it('the reported tangent IS df/du, including right through the knee', () => {
    for (const u of [-3 * uy, -uy, -0.2 * uy, 0, 0.2 * uy, uy, 3 * uy]) {
      expect(fd(u)).toBeCloseTo(smoothHinge(u, p).kt, 4)
    }
  })

  it('the tangent is continuous across the knee — no jump to fall through', () => {
    // sample densely over the transition and bound the step-to-step change
    let maxJump = 0
    const n = 4000, lo = -4 * uy, hi = 4 * uy
    let prev = smoothHinge(lo, p).kt
    for (let i = 1; i <= n; i++) {
      const kt = smoothHinge(lo + ((hi - lo) * i) / n, p).kt
      maxJump = Math.max(maxJump, Math.abs(kt - prev))
      prev = kt
    }
    // the whole k0 → b·k0 swing is ~980; a discontinuity would show the entire
    // swing in one sample. Spread over 4000 samples it must be a tiny fraction.
    expect(maxJump).toBeLessThan(0.01 * (p.k0 - p.b * p.k0))

    // the bilinear law, by contrast, DOES jump the full swing in one sample
    const st = newBilinearState()
    let blJump = 0, blPrev = bilinearProbe(lo, st, p).kt
    for (let i = 1; i <= n; i++) {
      const kt = bilinearProbe(lo + ((hi - lo) * i) / n, st, p).kt
      blJump = Math.max(blJump, Math.abs(kt - blPrev))
      blPrev = kt
    }
    expect(blJump).toBeGreaterThan(0.9 * (p.k0 - p.b * p.k0))
  })

  it('the tangent stays between the two asymptote slopes', () => {
    for (let i = -200; i <= 200; i++) {
      const kt = smoothHinge((i / 20) * uy, p).kt
      expect(kt).toBeLessThanOrEqual(p.k0 + 1e-9)
      expect(kt).toBeGreaterThanOrEqual(p.b * p.k0 - 1e-9)
    }
  })

  it('a SOFTENING hinge has a genuinely negative tangent past the knee', () => {
    const soft = { k0: 1000, Fy: 50, b: -0.5 }
    expect(smoothHinge(0, soft).kt).toBeCloseTo(soft.k0, 9)
    // sech² decays but never reaches 0, so compare relatively
    const far = smoothHinge(10 * smoothYieldDeformation(soft), soft).kt
    expect(Math.abs(far / (soft.b * soft.k0) - 1)).toBeLessThan(1e-6)
    // and it passes through zero exactly once on the way — smoothly
    const at = (u: number) => smoothHinge(u, soft).kt
    expect(at(0.5 * smoothYieldDeformation(soft))).toBeGreaterThan(0)
    expect(at(3 * smoothYieldDeformation(soft))).toBeLessThan(0)
  })
})

describe('smoothHinge — it is nonlinear ELASTIC, and says so', () => {
  it('is an odd function: unloading retraces loading', () => {
    for (const u of [0.3 * uy, uy, 5 * uy, 50 * uy]) {
      expect(smoothHinge(-u, p).f).toBeCloseTo(-smoothHinge(u, p).f, 12)
      expect(smoothHinge(-u, p).kt).toBeCloseTo(smoothHinge(u, p).kt, 12)
    }
  })

  it('a full cycle returns to the origin with zero net work — no dissipation', () => {
    // trapezoidal ∫f du around 0 → A → 0 → −A → 0
    const A = 8 * uy, n = 4000
    const leg = (from: number, to: number) => {
      let w = 0, uPrev = from, fPrev = smoothHinge(from, p).f
      for (let i = 1; i <= n; i++) {
        const u = from + ((to - from) * i) / n
        const f = smoothHinge(u, p).f
        w += 0.5 * (f + fPrev) * (u - uPrev)
        uPrev = u; fPrev = f
      }
      return w
    }
    const loop = leg(0, A) + leg(A, 0) + leg(0, -A) + leg(-A, 0)
    expect(Math.abs(loop)).toBeLessThan(1e-9 * Math.abs(leg(0, A)))
    // path independence: the force depends only on the current u
    expect(smoothHinge(0, p).f).toBe(0)
  })

  it('leaves NO permanent set, unlike the plastic law it smooths', () => {
    expect(smoothHinge(0, p).f).toBe(0)
    // the bilinear material, cycled to the same amplitude, does retain one
    const st = newBilinearState()
    expect(bilinearProbe(0, { ...st, up: 0.4 }, p).f).not.toBe(0)
  })
})

describe('smoothHinge — degenerate inputs', () => {
  it('an infinite capacity is purely linear', () => {
    const lin = { k0: 1000, Fy: Infinity, b: 0.02 }
    expect(smoothHinge(3, lin).f).toBeCloseTo(3000, 9)
    expect(smoothHinge(3, lin).kt).toBe(1000)
    expect(smoothHinge(3, lin).x).toBe(0)
  })

  it('a zero capacity degenerates to the post-yield line alone', () => {
    const r = smoothHinge(2, { k0: 1000, Fy: 0, b: 0.02 })
    expect(r.f).toBeCloseTo(0.02 * 1000 * 2, 9)
    expect(r.kt).toBeCloseTo(20, 9)
  })

  it('b defaults to perfectly plastic', () => {
    const pp = { k0: 1000, Fy: 50 }
    expect(smoothHinge(100 * uy, pp).f).toBeCloseTo(50, 6)   // flat plateau at Fy
    expect(smoothHinge(100 * uy, pp).kt).toBeCloseTo(0, 6)
  })

  it('the yield deformation is Fy/k0', () => {
    expect(smoothYieldDeformation(p)).toBeCloseTo(50 / 1000, 12)
  })
})
