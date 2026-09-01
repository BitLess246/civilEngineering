import { describe, it, expect } from 'vitest'
import { designPunchingShear } from './punchingShear'

// Reference: interior square column 500×500, d=150, fc=28, λ=1, Vu=500 kN
const BASE = {
  c1: 500, c2: 500, d: 150, fc: 28, lambda: 1.0, Vu: 500,
  position: 'interior' as const,
}

describe('designPunchingShear — critical perimeter b0', () => {
  it('interior: b0 = 2(c1+d) + 2(c2+d)', () => {
    const r = designPunchingShear(BASE)
    expect(r.b0).toBeCloseTo(2 * (500 + 150) + 2 * (500 + 150), 9)  // 2600 mm
  })

  // These two asserted `c/2 + d` where the geometry gives `c + d/2`. The
  // section runs d/2 PAST the far column face and stops AT the free edge, so
  // an edge halves the d term in that direction, never the column dimension.
  // b0 came out 19% short at an edge and 30% at a corner.
  it('edge: b0 = (c1+d) + 2(c2+d/2)  (c1 ∥ free edge, c2 ⊥ it)', () => {
    const r = designPunchingShear({ ...BASE, position: 'edge' })
    expect(r.b0).toBeCloseTo((500 + 150) + 2 * (500 + 75), 9)        // 1800 mm
  })

  it('corner: b0 = (c1+d/2) + (c2+d/2)', () => {
    const r = designPunchingShear({ ...BASE, position: 'corner' })
    expect(r.b0).toBeCloseTo((500 + 75) + (500 + 75), 9)             // 1150 mm
  })

  it('is the interior section less what each free edge removes', () => {
    // A second derivation: drop one whole side, and d/2 off each side that
    // survives. Agreement with the formula is the check.
    const d = 150, c = 500
    const interior = designPunchingShear(BASE).b0
    expect(designPunchingShear({ ...BASE, position: 'edge' }).b0)
      .toBeCloseTo(interior - (c + d) - d, 9)
  })

  it('orientation matters for a rectangular column', () => {
    // c1 ∥ the free edge and c2 ⊥ it are not interchangeable — swapping them
    // is a different footing, and the old formula gave the same answer to both
    // for a square column, which is where the transposition hid.
    const a = designPunchingShear({ ...BASE, c1: 300, c2: 600, position: 'edge' }).b0
    const b = designPunchingShear({ ...BASE, c1: 600, c2: 300, position: 'edge' }).b0
    expect(a).not.toBeCloseTo(b, 6)
  })

  it('b0 increases with d (thicker slab → larger perimeter)', () => {
    const r1 = designPunchingShear({ ...BASE, d: 100 })
    const r2 = designPunchingShear({ ...BASE, d: 200 })
    expect(r2.b0).toBeGreaterThan(r1.b0)
  })

  it('rectangular column: b0 uses both c1 and c2', () => {
    const r = designPunchingShear({ ...BASE, c1: 300, c2: 600 })
    expect(r.b0).toBeCloseTo(2 * (300 + 150) + 2 * (600 + 150), 9)
  })
})

describe('designPunchingShear — aspect ratio and αs', () => {
  it('betac = 1 for square column', () => {
    expect(designPunchingShear(BASE).betac).toBeCloseTo(1, 9)
  })

  it('betac = max/min for rectangular column', () => {
    const r = designPunchingShear({ ...BASE, c1: 400, c2: 800 })
    expect(r.betac).toBeCloseTo(800 / 400, 9)
  })

  it('alphaS = 40 for interior', () => {
    expect(designPunchingShear(BASE).alphaS).toBe(40)
  })

  it('alphaS = 30 for edge', () => {
    expect(designPunchingShear({ ...BASE, position: 'edge' }).alphaS).toBe(30)
  })

  it('alphaS = 20 for corner', () => {
    expect(designPunchingShear({ ...BASE, position: 'corner' }).alphaS).toBe(20)
  })
})

describe('designPunchingShear — Vc equations §22.6.5.2', () => {
  const r = designPunchingShear(BASE)
  const sqrtFc = Math.sqrt(28)
  const b0 = 2 * (500 + 150) + 2 * (500 + 150)  // 2600
  const base = 1.0 * sqrtFc * b0 * 150

  it('Vc3 = 0.33·λ·√f\'c·b0·d  (kN)', () => {
    expect(r.Vc3).toBeCloseTo(0.33 * base / 1000, 6)
  })

  it('Vc1 = (0.17 + 0.33/βc)·λ·√f\'c·b0·d  (kN)', () => {
    const expected = (0.17 + 0.33 / 1) * base / 1000
    expect(r.Vc1).toBeCloseTo(expected, 6)
  })

  it('Vc2 = (0.083·αs·d/b0 + 0.17)·λ·√f\'c·b0·d  (kN)', () => {
    const expected = (0.083 * 40 * 150 / b0 + 0.17) * base / 1000
    expect(r.Vc2).toBeCloseTo(expected, 6)
  })

  it('Vc = min(Vc1, Vc2, Vc3)', () => {
    expect(r.Vc).toBeCloseTo(Math.min(r.Vc1, r.Vc2, r.Vc3), 9)
  })

  it('for square interior column βc=1, Vc1 = 0.5·base and Vc3 = 0.33·base → Vc3 governs', () => {
    // 0.17 + 0.33/1 = 0.50 > 0.33, so Vc1 > Vc3 → Vc3 governs over Vc1
    expect(r.Vc).toBeCloseTo(r.Vc3, 9)
  })

  it('Vc1 governs when βc is large (elongated column)', () => {
    // βc = 4 → Vc1 coefficient = 0.17+0.33/4 = 0.2525 < 0.33 (Vc3) → Vc1 governs
    const r2 = designPunchingShear({ ...BASE, c1: 200, c2: 800 })
    expect(r2.betac).toBeCloseTo(4, 9)
    expect(r2.Vc).toBeCloseTo(r2.Vc1, 9)
  })

  it('lightweight concrete (λ=0.75) reduces all Vc values', () => {
    const r_nw = designPunchingShear(BASE)
    const r_lw = designPunchingShear({ ...BASE, lambda: 0.75 })
    expect(r_lw.Vc).toBeCloseTo(r_nw.Vc * 0.75, 6)
  })
})

describe('designPunchingShear — φVc and demand check', () => {
  it('phiVc = 0.75 × Vc', () => {
    const r = designPunchingShear(BASE)
    expect(r.phiVc).toBeCloseTo(0.75 * r.Vc, 9)
  })

  it('ratio = Vu / φVc', () => {
    const r = designPunchingShear(BASE)
    expect(r.ratio).toBeCloseTo(500 / r.phiVc, 9)
  })

  it('ok = true when Vu ≤ φVc', () => {
    const r = designPunchingShear({ ...BASE, Vu: 1 })   // tiny demand
    expect(r.ok).toBe(true)
  })

  it('ok = false when Vu > φVc', () => {
    const r = designPunchingShear({ ...BASE, Vu: 9999 })  // huge demand
    expect(r.ok).toBe(false)
  })
})
