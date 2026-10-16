import { describe, it, expect } from 'vitest'
import { shearTabBlockShear } from '../engine/steelDesign'
import { blockShearIso, solidPieces } from './blockShearIso'

// a single-line tab the way the engine sees it: n bolts at W − ex, pitch sy
const tab = (n: number, sy: number, eyBot: number, eyTop: number, ex: number, W: number) => {
  const bolts = Array.from({ length: n }, (_, k) => ({ x: W - ex, y: eyBot + k * sy }))
  return { bolts, H: eyBot + (n - 1) * sy + eyTop }
}

describe('block shear in 3-D — the faces are the engine\'s areas', () => {
  it('t × net lengths = Anv and Ant, t × gross = Agv and Agt, for both cases', () => {
    for (const [n, sy, eb, et, ex, W, db, t] of [[3, 75, 40, 40, 40, 100, 20, 10], [4, 70, 35, 50, 45, 115, 22, 12], [2, 80, 38, 38, 38, 90, 16, 8]]) {
      const { bolts, H } = tab(n, sy, eb, et, ex, W)
      const eng = shearTabBlockShear(n, sy, et, eb, ex, db, t, 250, 400)
      ;(['A', 'B'] as const).forEach((which, k) => {
        const g = blockShearIso(bolts, W, H, t, db + 2, which)
        expect(g.shear.gross * t).toBeCloseTo(eng[k].Agv, 9)
        expect(g.shear.net * t).toBeCloseTo(eng[k].Anv, 9)
        expect(g.tension.gross * t).toBeCloseTo(eng[k].Agt, 9)
        expect(g.tension.net * t).toBeCloseTo(eng[k].Ant, 9)
      })
    }
  })

  it('hand calc: 3 bolts @ 75, edges 40, ex 40, ⌀20 (dh 22), t 10 → Anv = 10·(190 − 2.5·22) = 1 350 mm²', () => {
    const { bolts, H } = tab(3, 75, 40, 40, 40, 100)
    const g = blockShearIso(bolts, 100, H, 10, 22, 'A')
    expect(g.shear.gross).toBe(190)
    expect(g.shear.net * 10).toBeCloseTo(1350, 9)
    expect(g.tension.net * 10).toBeCloseTo(10 * (40 - 11), 9)
    expect(g.shear.strips).toHaveLength(3)            // below, between, between — the top hole ends it
  })

  it('pulls the block clear of both cut faces, down for A and up for B', () => {
    const { bolts, H } = tab(3, 75, 40, 40, 40, 100)
    const a = blockShearIso(bolts, 100, H, 10, 22, 'A'), b = blockShearIso(bolts, 100, H, 10, 22, 'B')
    expect(a.block.shift[0]).toBeGreaterThanOrEqual(a.tDraw)
    expect(a.block.shift[2]).toBeLessThan(0)
    expect(b.block.shift[2]).toBeGreaterThan(0)
    expect(a.holes.filter((h) => h.split)).toHaveLength(3)
  })

  it('cuts holes out of an interval, edge-clipped', () => {
    expect(solidPieces(0, 100, [[10, 20], [90, 110]])).toEqual([[0, 10], [20, 90]])
    expect(solidPieces(0, 10, [[-5, 15]])).toEqual([])
  })
})
