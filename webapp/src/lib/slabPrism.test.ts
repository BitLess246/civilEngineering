import { describe, it, expect } from 'vitest'
import { slabPrism, panelNormal, SLAB_LIFT, type P3 } from './slabPrism'

describe('slabPrism — the panel meets its corner nodes', () => {
  it('a skewed panel (one corner node moved) has its top on all four nodes', () => {
    const c: P3[] = [[-1, 3.5, 0], [6, 3.5, 0], [6, 3.5, 5], [0, 3.5, 5]]
    const { positions } = slabPrism(c, 0.15)
    for (let k = 0; k < 4; k++) {
      expect(positions[3 * k]).toBeCloseTo(c[k][0], 12)
      expect(positions[3 * k + 1]).toBeCloseTo(c[k][1] + SLAB_LIFT, 12)
      expect(positions[3 * k + 2]).toBeCloseTo(c[k][2], 12)
      expect(positions[12 + 3 * k + 1]).toBeCloseTo(c[k][1] + SLAB_LIFT - 0.15, 12)   // bottom hangs below
    }
  })
  it('the normal points up whichever way the corners wind', () => {
    const cw: P3[] = [[0, 0, 0], [0, 0, 5], [6, 0, 5], [6, 0, 0]]
    expect(panelNormal(cw)[1]).toBeCloseTo(1, 12)
    expect(panelNormal([...cw].reverse())[1]).toBeCloseTo(1, 12)
  })
  it('a sloped panel keeps its thickness square to itself', () => {
    const c: P3[] = [[0, 0, 0], [4, 3, 0], [4, 3, 5], [0, 0, 5]]   // 3:4 roof
    const { positions } = slabPrism(c, 0.2)
    const d = [0, 1, 2].map((q) => positions[q] - positions[12 + q])
    expect(Math.hypot(...d)).toBeCloseTo(0.2, 12)
    expect(d[0] / d[1]).toBeCloseTo(-3 / 4, 12)
  })
  it('12 triangles, all indices in range', () => {
    const { index } = slabPrism([[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], 0.1)
    expect(index).toHaveLength(36)
    expect(Math.max(...index)).toBe(7)
  })
})
