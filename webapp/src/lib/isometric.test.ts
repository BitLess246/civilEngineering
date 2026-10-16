import { describe, it, expect } from 'vitest'
import { AXO, ISO_SE, viewAxes, isoRaw, isoDepth, faceVisible, boxFaces, boxEdges, edgeVisible, sortFaces, fitIso, isoPath, extrudeFaces, type IsoView, type Vec3 } from './isometric'

// one generic view per plan quadrant, and the true isometric
const VIEWS: IsoView[] = [AXO, { az: 55, el: 28 }, { az: 145, el: 30 }, { az: -125, el: 22 }, ISO_SE]
const len = ([u, v]: readonly [number, number]) => Math.hypot(u, v)
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const sx = (v: IsoView) => Math.sign(Math.cos((v.az * Math.PI) / 180))
const sy = (v: IsoView) => Math.sign(Math.sin((v.az * Math.PI) / 180))

describe('axonometric projection', () => {
  it('views through an orthonormal frame: toward, right and up are unit and mutually square', () => {
    for (const view of VIEWS) {
      const { toward, right, up } = viewAxes(view)
      for (const e of [toward, right, up]) expect(Math.hypot(...e)).toBeCloseTo(1, 12)
      expect(dot(toward, right)).toBeCloseTo(0, 12)
      expect(dot(toward, up)).toBeCloseTo(0, 12)
      expect(dot(right, up)).toBeCloseTo(0, 12)
    }
  })

  it('keeps verticals vertical, foreshortened by cos(elevation)', () => {
    for (const view of VIEWS) {
      const ez = isoRaw([0, 0, 1], view)
      expect(ez[0]).toBeCloseTo(0, 12)
      expect(ez[1]).toBeCloseTo(-Math.cos((view.el * Math.PI) / 180), 12)   // up the sheet (v runs down)
    }
  })

  it('ISO_SE is the true isometric: equal axes 120° apart, the 45° diagonal seen end-on', () => {
    const ex = isoRaw([1, 0, 0], ISO_SE), ey = isoRaw([0, -1, 0], ISO_SE), ez = isoRaw([0, 0, 1], ISO_SE)
    for (const e of [ex, ey, ez]) expect(len(e)).toBeCloseTo(Math.sqrt(2 / 3), 12)
    const cos = (a: typeof ex, b: typeof ex) => (a[0] * b[0] + a[1] * b[1]) / (len(a) * len(b))
    expect(cos(ex, ey)).toBeCloseTo(-0.5, 12)
    expect(cos(ex, ez)).toBeCloseTo(-0.5, 12)
    expect(len(isoRaw([1, -1, 1], ISO_SE))).toBeCloseTo(0, 12)    // why the drawings do not use it
  })

  it('AXO sees every 45° cone edge as a line, and no two axes in line', () => {
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      expect(len(isoRaw([a, b, 1], AXO))).toBeGreaterThan(0.25)
    }
    const ang = ([u, v]: readonly [number, number]) => Math.atan2(v, u)
    const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((e) => ang(isoRaw(e as unknown as Vec3, AXO)))
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const d = Math.abs(Math.sin(axes[i] - axes[j]))
      expect(d).toBeGreaterThan(0.3)
    }
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
      const d = viewAxes(view).toward
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
      expect(seen).toEqual([sx(view) > 0 ? '+x' : '-x', sy(view) > 0 ? '+y' : '-y', '+z'].sort())
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
      const far: Vec3 = [sx(view) > 0 ? 0 : 4, sy(view) > 0 ? 0 : 2, 0]
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
    // a world length square to the line of sight is s on the sheet
    const r = viewAxes(AXO).right
    const a = f.p([0, 0, 0]), b = f.p([100 * r[0], 100 * r[1], 100 * r[2]])
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
    // from AXO the front cap, the top, and both +x faces show
    expect(f.filter((x) => faceVisible(x.n, AXO)).map((x) => x.key).sort()).toEqual(['front', 's1', 's3', 's4'])
  })

  it('shifts the whole body', () => {
    const f = extrudeFaces([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], 0, 2, [5, 0, -3])
    expect(f[0].pts[0]).toEqual([5, 0, -3])
    expect(f[1].pts[2]).toEqual([6, 2, -2])
  })
})
