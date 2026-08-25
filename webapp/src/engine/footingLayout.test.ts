import { describe, it, expect } from 'vitest'
import { buildPlan, type PlanPrimitive } from './planRenderer'
import { generateGridModel } from './modelBuilder'
import type { RectSection } from './model'
import { footingLayout, footingPrism, type FootingIn, type CombinedIn } from './footingLayout'

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
    // n0 at (0,0), n1 at (3,0). A 4.5 m pad with 0.75 of overhang past n0 runs
    // −0.75 … 3.75, so its centre is at 1.5 — which here coincides with the
    // node midpoint because the overhangs happen to be equal.
    const cf: CombinedIn[] = [{ nodes: ['n0', 'n1'], Bx: 4.5, By1: 1.5, By2: 1.5, x1: 0.75, Dc: 500 }]
    const { items } = footingLayout([], cf, xz)
    const it = items[0]
    expect(it.angle).toBeCloseTo(0, 9)              // n0→n1 along +x
    expect(it.cx).toBeCloseTo(1.5, 9); expect(it.cz).toBeCloseTo(0, 9)
    expect(it.hx).toBeCloseTo(2.25, 9); expect(it.hz).toBeCloseTo(0.75, 9)
    expect(it.label).toContain('CRF')
  })

  it('places the pad from its OWN origin, not the midpoint of the two nodes', () => {
    // The real case: a pad sized to centre its bearing resultant has unequal
    // overhangs. Bx = 8.4 with x1 = 0.212 puts the pad centre 3.988 m from n0,
    // where the node midpoint is 1.5 — an error of nearly 2.5 m here, and
    // close to a metre on a typical 6 m bay.
    const cf: CombinedIn[] = [{ nodes: ['n0', 'n1'], Bx: 8.4, By1: 0.6, By2: 0.6, x1: 0.212, Dc: 475 }]
    const { items } = footingLayout([], cf, xz)
    expect(items[0].cx).toBeCloseTo(8.4 / 2 - 0.212, 9)
    expect(items[0].cx).not.toBeCloseTo(1.5, 1)
  })

  it('follows the axis when the pad does not run along +x', () => {
    // n0 (0,0) → n2 (0,8): the offset has to go into z, not x.
    const cf: CombinedIn[] = [{ nodes: ['n0', 'n2'], Bx: 6, By1: 1.2, By2: 1.2, x1: 1, Dc: 500 }]
    const { items } = footingLayout([], cf, xz)
    expect(items[0].cx).toBeCloseTo(0, 9)
    expect(items[0].cz).toBeCloseTo(2, 9)          // 6/2 − 1 along +z
    expect(items[0].hx).toBeCloseTo(0.6, 9)        // widths and lengths swap
    expect(items[0].hz).toBeCloseTo(3, 9)
  })

  it('keeps BOTH end widths, so a tapered pad is not drawn on the mean', () => {
    // Boxing a trapezoid on (By1+By2)/2 puts the plan edge in the wrong place
    // at both ends — the whole difference between the two shapes.
    const cf: CombinedIn[] = [{ nodes: ['n0', 'n1'], Bx: 8, By1: 2.4, By2: 1.6, x1: 1, Dc: 500 }]
    const { items } = footingLayout([], cf, xz)
    expect(items[0].bz1).toBeCloseTo(2.4, 9)
    expect(items[0].bz2).toBeCloseTo(1.6, 9)
    expect(items[0].bz).toBeCloseTo(2.4, 9)        // AABB takes the wider end
    expect(items[0].label).toContain('CTF')
    expect(items[0].label).toContain('2.40/1.60')
  })
})

describe('the 3D footprint and the 2D plan describe the same pad', () => {
  // The defect this exists for: `footingLayout` (3D) and `buildPlan` (plan)
  // each had their own idea of where a combined pad sits. The plan was fixed to
  // place it from its own origin; the 3D copy was left centring on the node
  // midpoint, so the two views drew the same footing nearly a metre apart.
  const section: RectSection = {
    id: 'S1', name: 'C', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40,
  }
  const model = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3], section, slabThickness: 150 })
  const base = model.nodes.filter((n) => Math.abs(n.y) < 1e-6).sort((a, b) => a.x - b.x || a.z - b.z)
  const pair = base.filter((n) => Math.abs(n.z - base[0].z) < 1e-9).slice(0, 2)
  // the real shape of an asymmetric pad: unequal overhangs, tapered ends
  const cf = { Bx: 8.4, By1: 2.4, By2: 1.6, x1: 0.212, x2: 6.212, Dc: 475 }

  it('puts the pad centre in the same place in both', () => {
    const { items } = footingLayout([], [{ nodes: [pair[0].id, pair[1].id], ...cf }],
      new Map(model.nodes.map((n) => [n.id, { x: n.x, z: n.z }])))
    const plan = buildPlan(model, {
      kind: 'foundation',
      footings: [{ kind: 'combined', nodes: [pair[0].id, pair[1].id], bars: 8, barSpacing: 150, barDia: 20, ...cf }],
    })!
    const poly = plan.primitives.find(
      (p): p is Extract<PlanPrimitive, { kind: 'path' }> => p.kind === 'path' && p.closed === true,
    )!
    const cxPlan = poly.cmds.reduce((s, c) => s + c.x, 0) / poly.cmds.length
    const czPlan = poly.cmds.reduce((s, c) => s + c.y, 0) / poly.cmds.length
    expect(items[0].cx).toBeCloseTo(cxPlan, 6)
    expect(items[0].cz).toBeCloseTo(czPlan, 6)
  })

  it('gives the pad the same length and end widths in both', () => {
    const { items } = footingLayout([], [{ nodes: [pair[0].id, pair[1].id], ...cf }],
      new Map(model.nodes.map((n) => [n.id, { x: n.x, z: n.z }])))
    expect(items[0].bx).toBeCloseTo(cf.Bx, 9)
    expect(items[0].bz1).toBeCloseTo(cf.By1, 9)
    expect(items[0].bz2).toBeCloseTo(cf.By2, 9)
  })
})

describe('footingPrism — which axis is the thickness', () => {
  // The failure this pins: a pad 8.2 m long, 0.5 m wide and 1.0 m thick is a
  // plausible-looking box whichever way round you build it. Put Bx or By on
  // the vertical axis and it reads as a wall standing on edge, and nothing in
  // the scene says otherwise.
  const bounds = (v: number[]) => {
    const b = { x: [Infinity, -Infinity], y: [Infinity, -Infinity], z: [Infinity, -Infinity] }
    for (let k = 0; k < v.length; k += 3) {
      b.x[0] = Math.min(b.x[0], v[k]); b.x[1] = Math.max(b.x[1], v[k])
      b.y[0] = Math.min(b.y[0], v[k + 1]); b.y[1] = Math.max(b.y[1], v[k + 1])
      b.z[0] = Math.min(b.z[0], v[k + 2]); b.z[1] = Math.max(b.z[1], v[k + 2])
    }
    return b
  }

  it('puts the THICKNESS on y, the length on x and the width on z', () => {
    const b = bounds(footingPrism(8.2, 0.5, 0.5, 1.0))
    expect(b.x).toEqual([-4.1, 4.1])       // Bx along the pad
    expect(b.y).toEqual([-0.5, 0.5])       // Dc vertical — 1.0 thick
    expect(b.z).toEqual([-0.25, 0.25])     // By across it
  })

  it('is centred on the origin, exactly as the box it replaces', () => {
    // The scene puts the group at y = −dc/2 so the pad's TOP sits at grade.
    // A prism centred anywhere else floats above ground or sinks below it.
    const b = bounds(footingPrism(6, 1.2, 1.2, 0.4))
    for (const ax of ['x', 'y', 'z'] as const) {
      expect(b[ax][0] + b[ax][1]).toBeCloseTo(0, 12)
    }
  })

  it('tapers between the two end widths and nowhere else', () => {
    const v = footingPrism(8, 2.4, 1.6, 0.5)
    const atX = (x: number) => {
      const zs: number[] = []
      for (let k = 0; k < v.length; k += 3) if (Math.abs(v[k] - x) < 1e-9) zs.push(v[k + 2])
      return Math.max(...zs) - Math.min(...zs)
    }
    expect(atX(-4)).toBeCloseTo(2.4, 9)
    expect(atX(4)).toBeCloseTo(1.6, 9)
  })

  it('closes: every vertex is one of the eight corners', () => {
    const v = footingPrism(8, 2.4, 1.6, 0.5)
    expect(v.length).toBe(12 * 3 * 3)      // 12 triangles
    const uniq = new Set<string>()
    for (let k = 0; k < v.length; k += 3) uniq.add(`${v[k]},${v[k + 1]},${v[k + 2]}`)
    expect(uniq.size).toBe(8)
  })
})
