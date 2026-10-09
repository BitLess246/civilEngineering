import { describe, it, expect } from 'vitest'
import { solvePlateFE, type Pt } from './plateFE'

const rect = (W: number, H: number): Pt[] => [[0, 0], [W, 0], [W, H], [0, H]]

describe('solvePlateFE — plane stress, against closed forms', () => {
  it('uniform tension: σx = P/(H·t) everywhere, σy = τ = 0 (Q6 passes the patch)', () => {
    // 200 × 100 × 10, rollers on the left edge, one node pinned in y; 100 kN on the right edge
    const r = solvePlateFE({
      outline: rect(200, 100), t: 10, Fy: 250, h: 10,
      supports: [{ a: [0, 0], b: [0, 100], fix: 'x' }], pins: [{ at: [0, 0], fix: 'y' }],
      loads: [{ kind: 'line', a: [200, 0], b: [200, 100], Fx: 100000, Fy: 0 }],
    })!
    for (const e of r.elems) {
      expect(e.sx).toBeCloseTo(100, 6)
      expect(Math.abs(e.sy)).toBeLessThan(1e-6)
      expect(Math.abs(e.txy)).toBeLessThan(1e-6)
    }
  })
  it('cantilever: σx at the top fibre = M·y/I by beam theory, at mid-span', () => {
    // L 400, d 100, t 10; tip shear 20 kN; fixed at x = 0
    const L = 400, d = 100, t = 10, V = 20000
    const r = solvePlateFE({
      outline: rect(L, d), t, Fy: 250, h: 5,
      supports: [{ a: [0, 0], b: [0, d] }],
      loads: [{ kind: 'line', a: [L, 0], b: [L, d], Fx: 0, Fy: -V }],
    })!
    const I = (t * d ** 3) / 12
    // the top row's element straddling x = L/2: centre at y = d − h/2
    const e = r.elems.find((el) => {
      const cx = el.nodes.reduce((s, k) => s + r.nodes[k][0], 0) / el.nodes.length
      const cy = el.nodes.reduce((s, k) => s + r.nodes[k][1], 0) / el.nodes.length
      return Math.abs(cx - (L / 2 + 2.5)) < 1e-6 && Math.abs(cy - (d - 2.5)) < 1e-6
    })!
    const M = V * (L - (L / 2 + 2.5))                       // hogging at x
    const beam = (M * (d / 2 - 2.5)) / I                    // tension on top
    // Q6 carries a linearly varying moment exactly — Q4 would lock here
    expect(e.sx / beam).toBeCloseTo(1, 6)
  })
  it('equilibrium: the support reactions balance the applied loads', () => {
    const r = solvePlateFE({
      outline: rect(100, 230), holes: [{ x: 65, y: 40, d: 22 }, { x: 65, y: 115, d: 22 }, { x: 65, y: 190, d: 22 }], t: 10, Fy: 248,
      supports: [{ a: [0, 0], b: [0, 230] }],
      loads: [0, 1, 2].map((k) => ({ kind: 'hole' as const, hole: k, Fx: (k - 1) * 8000, Fy: -40000 })),
    })!
    expect(r.applied[0] + r.reaction[0]).toBeCloseTo(0, 6)
    expect(r.applied[1] + r.reaction[1]).toBeCloseTo(0, 6)
    expect((r.appliedM + r.reactionM) / Math.abs(r.appliedM)).toBeCloseTo(0, 9)
    // the holes are traced, not stair-stepped: the meshed area within 1.5 %
    expect(Math.abs(r.area - r.areaExact) / r.areaExact).toBeLessThan(0.015)
  })
  it('a hole in a tension strip concentrates stress to Kirsch/Howland (Kt → 3 on a wide plate)', { timeout: 20000 }, () => {
    // W = 400, d = 20 (d/W = 0.05: Howland Kt,gross ≈ 3.0)
    const r = solvePlateFE({
      outline: rect(400, 300), holes: [{ x: 200, y: 150, d: 20 }], t: 10, Fy: 1e9, h: 4,
      supports: [{ a: [0, 0], b: [0, 300], fix: 'x' }], pins: [{ at: [0, 0], fix: 'y' }],
      loads: [{ kind: 'line', a: [400, 0], b: [400, 300], Fx: 300 * 10 * 100, Fy: 0 }],
    })!
    // Howland, d/W = 0.067: Kt,gross ≈ 3.0 at the hole's top and bottom. The
    // O-grid converges onto it from below — 2.67, 2.84, 2.93, 2.97, 3.00 at
    // h = 8, 6, 4, 3, 2 mm — and h = 4 is asserted here
    const kt = r.maxVm / 100
    expect(kt).toBeGreaterThan(2.9)
    expect(kt).toBeLessThan(3.05)
    expect(Math.abs(r.maxAt[0] - 200)).toBeLessThan(3)
  })
  it('a convex gusset outline with diagonal edges meshes to its area', () => {
    const g: Pt[] = [[0, 0], [300, 0], [380, 120], [200, 330], [0, 260]]
    const r = solvePlateFE({ outline: g, t: 12, Fy: 248, supports: [{ a: [0, 0], b: [300, 0] }, { a: [0, 0], b: [0, 260] }],
      loads: [{ kind: 'line', a: [150, 150], b: [260, 240], Fx: 50000, Fy: 50000 }] })!
    expect(Math.abs(r.area - r.areaExact) / r.areaExact).toBeLessThan(0.01)
    expect(r.applied[0] + r.reaction[0]).toBeCloseTo(0, 6)
    expect(Number.isFinite(r.maxVm)).toBe(true)
  })
})
