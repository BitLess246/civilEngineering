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

  it('edge: b0 = 2(c1/2+d) + (c2+d)  (c1 ∥ free edge)', () => {
    const r = designPunchingShear({ ...BASE, position: 'edge' })
    expect(r.b0).toBeCloseTo(2 * (250 + 150) + (500 + 150), 9)       // 1450 mm
  })

  it('corner: b0 = (c1/2+d) + (c2/2+d)', () => {
    const r = designPunchingShear({ ...BASE, position: 'corner' })
    expect(r.b0).toBeCloseTo((250 + 150) + (250 + 150), 9)           // 800 mm
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
