import { describe, it, expect } from 'vitest'
import { woodDeckLayout, MAX_SEAMS } from './woodDeckGeometry'
import { SLAB_LIFT, type P3 } from './slabPrism'
import { woodSlabSelfWeight } from '../engine/woodSlab'

// a 4 m × 6 m bay at level 3.0 (x 0–6, z 0–4): joists span the 4 m side
const bay: P3[] = [[0, 3, 0], [6, 3, 0], [6, 3, 4], [0, 3, 4]]
const deck = { joistB: 50, joistD: 200, joistSpacing: 400, deckThickness: 25, deckWidth: 140 }

const vtx = (p: number[], i: number) => [p[3 * i], p[3 * i + 1], p[3 * i + 2]]

describe('woodDeckLayout — the timber floor that was designed', () => {
  it('as many joists as the design counts, spanning the shorter side', () => {
    const g = woodDeckLayout(bay, deck)
    expect(g.joistCount).toBe(Math.floor(6000 / 400) + 1)                 // 16, across the 6 m side
    expect(g.joistCount).toBe(woodSlabSelfWeight({
      Lx: 4, Ly: 6, joistRef: { Fb: 10, Ft: 6, Fv: 1, FcPerp: 4, Fc: 10, E: 10000, Emin: 4000, G: 0.5 },
      joistB: 50, joistD: 200, joistSpacing: 400, deckMaterial: 'plank', deckThickness: 25,
    }).joistCount)
    expect(g.pitch).toBeLessThanOrEqual(0.4 + 1e-12)
    expect(g.joists.positions.length).toBe(g.joistCount * 8 * 3)
    // every joist runs along z (the 4 m side), full length
    for (let j = 0; j < g.joistCount; j++) {
      const p = vtx(g.joists.positions, j * 8), q = vtx(g.joists.positions, j * 8 + 2)
      expect(Math.abs(q[2] - p[2])).toBeCloseTo(4, 9)
      expect(q[0]).toBeCloseTo(p[0], 9)
    }
  })

  it('the outer joists sit against the panel edges', () => {
    const g = woodDeckLayout(bay, deck)
    const xs = Array.from({ length: g.joistCount }, (_, j) => (vtx(g.joists.positions, j * 8)[0] + vtx(g.joists.positions, j * 8 + 1)[0]) / 2)
    expect(Math.min(...xs)).toBeCloseTo(0.025, 9)                          // b/2 in from x = 0
    expect(Math.max(...xs)).toBeCloseTo(6 - 0.025, 9)
  })

  it('joists hang under the deck: top at the deck soffit, b wide, d deep', () => {
    const g = woodDeckLayout(bay, deck)
    const top = 3 + SLAB_LIFT - 0.025
    const p0 = vtx(g.joists.positions, 0), p1 = vtx(g.joists.positions, 1), b0 = vtx(g.joists.positions, 4)
    expect(p0[1]).toBeCloseTo(top, 9)
    expect(b0[1]).toBeCloseTo(top - 0.2, 9)
    expect(Math.hypot(p1[0] - p0[0], p1[2] - p0[2])).toBeCloseTo(0.05, 9)
    // and the deck is its own thickness, not the plate's
    expect(g.deck.positions[1] - g.deck.positions[13]).toBeCloseTo(0.025, 9)
  })

  it('every joist face points out of its box — nothing is culled from outside', () => {
    const g = woodDeckLayout(bay, deck)
    const P = g.joists.positions, I = g.joists.index
    for (let t = 0; t < I.length; t += 3) {
      const j = Math.floor(I[t] / 8)
      const c = [0, 1, 2].map((k) => Array.from({ length: 8 }, (_, v) => P[3 * (j * 8 + v) + k]).reduce((s, x) => s + x, 0) / 8)
      const [a, b, cc] = [I[t], I[t + 1], I[t + 2]].map((i) => vtx(P, i))
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [cc[0] - a[0], cc[1] - a[1], cc[2] - a[2]]
      const nrm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
      const out = [(a[0] + b[0] + cc[0]) / 3 - c[0], (a[1] + b[1] + cc[1]) / 3 - c[1], (a[2] + b[2] + cc[2]) / 3 - c[2]]
      expect(nrm[0] * out[0] + nrm[1] * out[1] + nrm[2] * out[2]).toBeGreaterThan(0)
    }
  })

  it('board joints run along the long side, one per board width, on the deck top', () => {
    const g = woodDeckLayout(bay, deck)
    expect(g.seams.length / 6).toBe(Math.floor(4 / 0.14))                   // 28 joints across the 4 m span
    expect(g.seams[1]).toBeGreaterThan(3 + SLAB_LIFT)
    expect(Math.abs(g.seams[3] - g.seams[0])).toBeCloseTo(6, 9)              // along x, the long side
    // a 20 mm slat on a big bay is capped, not drawn by the hundred
    expect(woodDeckLayout([[0, 0, 0], [20, 0, 0], [20, 0, 12], [0, 0, 12]], { ...deck, deckWidth: 20 }).seams.length / 6).toBe(MAX_SEAMS)
  })

  it('a skewed panel: each joist runs between the two long edges where they actually are', () => {
    const skew: P3[] = [[0, 3, 0], [6, 3, 0], [7, 3, 4], [0, 3, 4]]          // one corner node moved +1 m in x
    const g = woodDeckLayout(skew, deck)
    const last = g.joistCount - 1
    // last joist's far end, on its centreline (midway between its two top corners)
    const q2 = vtx(g.joists.positions, last * 8 + 2), q3 = vtx(g.joists.positions, last * 8 + 3)
    const q = [(q2[0] + q3[0]) / 2, (q2[1] + q3[1]) / 2, (q2[2] + q3[2]) / 2]
    expect(q[2]).toBeCloseTo(4, 9)
    expect(q[0]).toBeGreaterThan(6.5)                                        // follows the moved corner
  })

  it('joists span z when the bay is longer in z', () => {
    const g = woodDeckLayout([[0, 0, 0], [3, 0, 0], [3, 0, 8], [0, 0, 8]], deck)
    expect(g.joistCount).toBe(Math.floor(8000 / 400) + 1)
    const p = vtx(g.joists.positions, 0), q = vtx(g.joists.positions, 2)
    expect(Math.abs(q[0] - p[0])).toBeCloseTo(3, 9)
  })
})
