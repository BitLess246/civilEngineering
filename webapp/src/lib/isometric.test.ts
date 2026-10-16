import { describe, it, expect } from 'vitest'
import { SE, NE, isoRaw, isoDepth, faceVisible, boxFaces, boxEdges, edgeVisible, sortFaces, fitIso, isoPath, extrudeFaces, type IsoView, type Vec3 } from './isometric'

const VIEWS: IsoView[] = [SE, NE, { sx: -1, sy: 1 }, { sx: -1, sy: -1 }]
const len = ([u, v]: readonly [number, number]) => Math.hypot(u, v)

describe('isometric projection', () => {
  it('keeps every axis at full length, the three toward the viewer 120° apart, z straight up', () => {
    for (const view of VIEWS) {
      const ex = isoRaw([view.sx, 0, 0], view), ey = isoRaw([0, view.sy, 0], view), ez = isoRaw([0, 0, 1], view)
      for (const e of [ex, ey, ez]) expect(len(e)).toBeCloseTo(1, 12)
      expect(ez[0]).toBeCloseTo(0, 12)
      expect(ez[1]).toBeCloseTo(-1, 12)                  // up the sheet (v runs down)
      const cos = (a: typeof ex, b: typeof ex) => a[0] * b[0] + a[1] * b[1]
      expect(cos(ex, ey)).toBeCloseTo(-0.5, 12)          // 120°
      expect(cos(ex, ez)).toBeCloseTo(-0.5, 12)
    }
  })

  it('SE: east runs down-right at 30°, north up-right at 30°', () => {
    const [ux, vx] = isoRaw([1, 0, 0], SE), [uy, vy] = isoRaw([0, 1, 0], SE)
    expect(ux).toBeGreaterThan(0); expect(vx).toBeCloseTo(0.5, 12)
    expect(uy).toBeGreaterThan(0); expect(vy).toBeCloseTo(-0.5, 12)
  })

  it('is linear: parallel world lines stay parallel', () => {
    const a: Vec3 = [3, -2, 5], b: Vec3 = [7, 1, 2], t: Vec3 = [-4, 9, 1.5]
    const pa = isoRaw(a), pb = isoRaw(b)
    const qa = isoRaw([a[0] + t[0], a[1] + t[1], a[2] + t[2]]), qb = isoRaw([b[0] + t[0], b[1] + t[1], b[2] + t[2]])
    expect(qb[0] - qa[0]).toBeCloseTo(pb[0] - pa[0], 12)
    expect(qb[1] - qa[1]).toBeCloseTo(pb[1] - pa[1], 12)
  })

  it('points along the view direction land on one sheet point, nearer = deeper', () => {
    for (const view of VIEWS) {
      const d: Vec3 = [view.sx, view.sy, 1]
      const p0 = isoRaw([0, 0, 0], view), p1 = isoRaw(d, view)
      expect(p1[0]).toBeCloseTo(p0[0], 12); expect(p1[1]).toBeCloseTo(p0[1], 12)
      expect(isoDepth(d, view)).toBeGreaterThan(isoDepth([0, 0, 0], view))
    }
  })
})

describe('boxes', () => {
  const lo: Vec3 = [0, 0, 0], hi: Vec3 = [4, 2, 1]
  it('shows exactly three faces from every view — the top and the two the viewer stands beside', () => {
    for (const view of VIEWS) {
      const seen = boxFaces(lo, hi).filter((f) => faceVisible(f.n, view)).map((f) => f.key).sort()
      expect(seen).toEqual([view.sx > 0 ? '+x' : '-x', view.sy > 0 ? '+y' : '-y', '+z'].sort())
    }
  })

  it('paints every hidden face before every visible one', () => {
    for (const view of VIEWS) {
      const order = sortFaces(boxFaces(lo, hi), view).map((f) => faceVisible(f.n, view))
      expect(order).toEqual([false, false, false, true, true, true])
    }
  })

  it('has twelve edges, three of them out of sight', () => {
    for (const view of VIEWS) {
      const e = boxEdges(lo, hi)
      expect(e).toHaveLength(12)
      expect(e.filter((x) => !edgeVisible(x, view))).toHaveLength(3)
      // the hidden three meet at the corner furthest from the viewer
      const far: Vec3 = [view.sx > 0 ? 0 : 4, view.sy > 0 ? 0 : 2, 0]
      for (const x of e.filter((q) => !edgeVisible(q, view))) expect([x.a, x.b]).toContainEqual(far)
    }
  })
})

describe('fitting to the sheet', () => {
  it('fits inside the box at one scale, centred across', () => {
    const pts: Vec3[] = boxFaces([0, 0, 0], [1000, 600, 300]).flatMap((f) => f.pts)
    const f = fitIso(pts, 20, 30, 300, 400)
    const sheet = pts.map(f.p)
    const us = sheet.map((q) => q[0]), vs = sheet.map((q) => q[1])
    expect(Math.min(...us)).toBeGreaterThanOrEqual(20 - 1e-9)
    expect(Math.max(...us)).toBeLessThanOrEqual(320 + 1e-9)
    expect(Math.min(...vs)).toBeCloseTo(30, 9)
    expect(Math.max(...vs)).toBeLessThanOrEqual(430 + 1e-9)
    expect((Math.min(...us) + Math.max(...us)) / 2).toBeCloseTo(170, 9)
    // a world length along any axis is s on the sheet
    const a = f.p([0, 0, 0]), b = f.p([0, 0, 100])
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(100 * f.s, 9)
    expect(f.box.h).toBeCloseTo(Math.max(...vs) - 30, 9)
  })

  it('writes a closed path', () => {
    expect(isoPath([[0, 0], [10, 0], [10, 5]])).toBe('M0.0 0.0 L10.0 0.0 L10.0 5.0 Z')
    expect(isoPath([[0, 0], [1, 1]], false)).toBe('M0.0 0.0 L1.0 1.0')
  })
})

describe('extruded outlines', () => {
  it('an anticlockwise L gives outward side normals, and a notch face looking into the notch', () => {
    // a 100 × 200 tab with its bottom-right corner torn out up to z = 120 from x = 60
    const L = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 120 }, { x: 100, y: 120 }, { x: 100, y: 200 }, { x: 0, y: 200 }]
    const f = extrudeFaces(L, 0, 10)
    expect(f).toHaveLength(8)
    const n = Object.fromEntries(f.map((x) => [x.key, x.n.map((v) => Math.round(v) + 0)]))
    expect(n.s0).toEqual([0, 0, -1])      // bottom
    expect(n.s1).toEqual([1, 0, 0])       // the notch's shear face, looking +x
    expect(n.s2).toEqual([0, 0, -1])      // the notch's roof
    expect(n.s3).toEqual([1, 0, 0])       // free edge
    expect(n.s5).toEqual([-1, 0, 0])      // welded edge
    // from SE the front cap, the top, and both +x faces show
    expect(f.filter((x) => faceVisible(x.n, SE)).map((x) => x.key).sort()).toEqual(['front', 's1', 's3', 's4'])
  })

  it('shifts the whole body', () => {
    const f = extrudeFaces([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], 0, 2, [5, 0, -3])
    expect(f[0].pts[0]).toEqual([5, 0, -3])
    expect(f[1].pts[2]).toEqual([6, 2, -2])
  })
})
