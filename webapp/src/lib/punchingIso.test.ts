import { describe, it, expect } from 'vitest'
import { criticalSection, type ColumnPosition } from '../engine/shear'
import { punchingIsoGeometry } from './punchingIso'

const POS: ColumnPosition[] = ['interior', 'edge', 'corner']

describe('punching shear in 3-D — the planes are the engine\'s b₀', () => {
  it('Σ plane lengths = criticalSection b₀, and the area is b₀·d, at every position', () => {
    for (const [c1, c2, d] of [[400, 400, 175], [600, 350, 220], [300, 500, 140]]) {
      for (const pos of POS) {
        const g = punchingIsoGeometry(c1, c2, d, d + 40, pos)!
        // PunchingPlan's convention: criticalSection(c2, c1, …)
        const cs = criticalSection(c2, c1, d, pos)
        expect(g.b0).toBeCloseTo(cs.bo, 9)
        expect(g.area).toBeCloseTo(cs.bo * d, 6)
      }
    }
  })

  it('a free edge drops its plane: 4 / 3 / 2 planes, never one on a free side', () => {
    const sides = (p: ColumnPosition) => punchingIsoGeometry(400, 400, 175, 220, p)!.planes.map((x) => x.side).sort()
    expect(sides('interior')).toEqual(['east', 'north', 'south', 'west'])
    expect(sides('edge')).toEqual(['east', 'south', 'west'])
    expect(sides('corner')).toEqual(['east', 'south'])
  })

  it('hand calc: interior 400 × 400, d = 175 → four planes of 575, b₀ = 2 300, b₀d = 0.4025 m²', () => {
    const g = punchingIsoGeometry(400, 400, 175, 220, 'interior')!
    for (const p of g.planes) expect(p.len).toBeCloseTo(575, 9)
    expect(g.b0).toBeCloseTo(2300, 9)
    expect(g.area / 1e6).toBeCloseTo(0.4025, 9)
  })

  it('every plane stands d/2 off its column face, d tall, facing out', () => {
    const c1 = 500, c2 = 300, d = 200
    const g = punchingIsoGeometry(c1, c2, d, 260, 'interior')!
    for (const p of g.planes) {
      const zs = p.pts.map((q) => q[2])
      expect(Math.min(...zs)).toBe(0); expect(Math.max(...zs)).toBe(d)
      const axis = p.n[0] !== 0 ? 0 : 1, half = axis === 0 ? c1 / 2 : c2 / 2
      for (const q of p.pts) expect(q[axis] * p.n[axis]).toBeCloseTo(half + d / 2, 9)
    }
  })

  it('the column stands flush with the free edges, and the slab holds the section', () => {
    const g = punchingIsoGeometry(400, 400, 175, 220, 'corner')!
    expect(g.column.hi[1]).toBe(g.slab.hi[1])            // north face on the free edge
    expect(g.column.lo[0]).toBe(g.slab.lo[0])            // west face on the free edge
    expect(g.freeEdges.map((e) => e.side).sort()).toEqual(['north', 'west'])
    for (const p of g.planes) for (const q of p.pts) {
      for (const k of [0, 1, 2] as const) {
        expect(q[k]).toBeGreaterThanOrEqual(g.slab.lo[k] - 1e-9)
        expect(q[k]).toBeLessThanOrEqual(g.slab.hi[k] + 1e-9)
      }
    }
  })

  it('the cone rises at 45° and stops at a free edge', () => {
    const d = 180
    const g = punchingIsoGeometry(400, 400, d, 230, 'edge')!
    for (const { from, to } of g.cone) {
      expect(to[2] - from[2]).toBe(d)
      const run = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]))
      expect(run).toBeCloseTo(d, 9)
      expect(to[1]).toBeLessThanOrEqual(g.slab.hi[1])
    }
  })

  it('the cone has a sloped face wherever there is a plane', () => {
    for (const pos of POS) {
      const g = punchingIsoGeometry(400, 400, 175, 220, pos)!
      expect(g.coneFaces.map((f) => f.side).sort()).toEqual(g.planes.map((f) => f.side).sort())
    }
  })

  it('refuses geometry it cannot draw', () => {
    expect(punchingIsoGeometry(0, 400, 175, 220, 'interior')).toBeNull()
    expect(punchingIsoGeometry(400, 400, 220, 220, 'interior')).toBeNull()
  })
})
