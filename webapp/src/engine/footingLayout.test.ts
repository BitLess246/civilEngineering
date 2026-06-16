import { describe, it, expect } from 'vitest'
import { footingLayout, type FootingIn, type CombinedIn } from './footingLayout'

const xz = new Map([
  ['n0', { x: 0, z: 0 }],
  ['n1', { x: 3, z: 0 }],   // 3 m away in x
  ['n2', { x: 0, z: 8 }],   // far in z
])

describe('footing footprint layout & overlap', () => {
  it('isolated footings are to-scale squares centred on their node', () => {
    const f: FootingIn[] = [{ node: 'n0', B: 1.8, Dc: 400 }]
    const { items } = footingLayout(f, [], xz)
    expect(items).toHaveLength(1)
    const it = items[0]
    expect(it.bx).toBe(1.8); expect(it.bz).toBe(1.8)
    expect(it.dc).toBeCloseTo(0.4, 9)               // 400 mm → 0.4 m
    expect(it.cx).toBe(0); expect(it.cz).toBe(0)
    expect(it.label).toContain('1.80×1.80')
  })

  it('flags overlapping footprints and clears non-overlapping ones', () => {
    // n0 & n1 are 3 m apart: B = 3.2 → halves 1.6+1.6 = 3.2 > 3 → overlap
    const big = footingLayout([{ node: 'n0', B: 3.2, Dc: 400 }, { node: 'n1', B: 3.2, Dc: 400 }], [], xz)
    expect(big.overlaps.has('ft-n0')).toBe(true)
    expect(big.overlaps.has('ft-n1')).toBe(true)
    // B = 2.0 → halves 1.0+1.0 = 2.0 < 3 → no overlap
    const ok = footingLayout([{ node: 'n0', B: 2.0, Dc: 400 }, { node: 'n1', B: 2.0, Dc: 400 }], [], xz)
    expect(ok.overlaps.size).toBe(0)
    // far node never overlaps
    const far = footingLayout([{ node: 'n0', B: 3.2, Dc: 400 }, { node: 'n2', B: 3.2, Dc: 400 }], [], xz)
    expect(far.overlaps.size).toBe(0)
  })

  it('combined footing is oriented along the column axis with the right AABB', () => {
    const cf: CombinedIn[] = [{ nodes: ['n0', 'n1'], Bx: 4.5, By: 1.5, Dc: 500, trapezoid: false }]
    const { items } = footingLayout([], cf, xz)
    const it = items[0]
    expect(it.angle).toBeCloseTo(0, 9)              // n0→n1 along +x
    expect(it.cx).toBeCloseTo(1.5, 9); expect(it.cz).toBeCloseTo(0, 9)   // midpoint
    expect(it.hx).toBeCloseTo(2.25, 9); expect(it.hz).toBeCloseTo(0.75, 9)
    expect(it.label).toContain('CRF')
  })
})
