// ─────────────────────────────────────────────────────────────────────────
// ISOMETRIC — one projection for every 3-D figure on a 2-D sheet.
//
// A plan and a section are two pictures of one solid, and the reader has to
// fuse them. A punching cone, a footing's shear plane and a bolt group's
// tear-out are SURFACES inside a body — the thing a plan reduces to a dashed
// line. An isometric shows the surface as a surface.
//
// CONVENTION. World axes x east, y north, z up, in whatever unit the caller
// uses. Screen u right, v DOWN (SVG). This is an isometric DRAWING, not a true
// projection: each axis keeps full length (the 0.816 true foreshortening is
// a uniform scale, so it is folded into the fit). The viewer stands above one
// plan quadrant, `{ sx, sy }` — `SE` = south-east, looking north-west.
//
// Pure geometry. No React, no SVG strings beyond a path helper.
// ─────────────────────────────────────────────────────────────────────────

export type Vec3 = readonly [number, number, number]
export type Pt = readonly [number, number]
/** The plan quadrant the viewer stands over: +1/−1 along x and y. */
export interface IsoView { sx: 1 | -1; sy: 1 | -1 }

export const SE: IsoView = { sx: 1, sy: -1 }
export const NE: IsoView = { sx: 1, sy: 1 }

const C30 = Math.sqrt(3) / 2

/** Unit-scale projection: world → screen (v down). Each axis maps to a unit vector. */
export function isoRaw([x, y, z]: Vec3, view: IsoView = SE): Pt {
  const u = (-view.sy * x + view.sx * y) * C30
  const up = z - (view.sx * x + view.sy * y) * 0.5
  return [u, -up]
}

/** Nearness to the viewer: larger is in front. Paint ascending. */
export function isoDepth([x, y, z]: Vec3, view: IsoView = SE): number {
  return view.sx * x + view.sy * y + z
}

/** A face whose OUTWARD normal points at the viewer is seen from outside. */
export function faceVisible(n: Vec3, view: IsoView = SE): boolean {
  return n[0] * view.sx + n[1] * view.sy + n[2] > 1e-12
}

export interface Face { pts: Vec3[]; n: Vec3; key: string }

const centroid = (pts: readonly Vec3[]): Vec3 => {
  const k = 1 / pts.length
  return pts.reduce<Vec3>((a, p) => [a[0] + p[0] * k, a[1] + p[1] * k, a[2] + p[2] * k], [0, 0, 0])
}

/** Back to front, by the depth of each face's centroid — painter's order. */
export function sortFaces<F extends { pts: readonly Vec3[] }>(faces: F[], view: IsoView = SE): F[] {
  return [...faces].sort((a, b) => isoDepth(centroid(a.pts), view) - isoDepth(centroid(b.pts), view))
}

/** The six faces of an axis-aligned box, each with its outward normal. */
export function boxFaces(lo: Vec3, hi: Vec3): Face[] {
  const [x0, y0, z0] = lo, [x1, y1, z1] = hi
  return [
    { key: '-x', n: [-1, 0, 0], pts: [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]] },
    { key: '+x', n: [1, 0, 0], pts: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]] },
    { key: '-y', n: [0, -1, 0], pts: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] },
    { key: '+y', n: [0, 1, 0], pts: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]] },
    { key: '-z', n: [0, 0, -1], pts: [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]] },
    { key: '+z', n: [0, 0, 1], pts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },
  ]
}

export interface Edge { a: Vec3; b: Vec3; n: [Vec3, Vec3] }

/** The twelve edges of a box, each with the normals of the two faces it joins. */
export function boxEdges(lo: Vec3, hi: Vec3): Edge[] {
  const out: Edge[] = []
  const c = [lo, hi]
  for (const i of [0, 1]) for (const j of [0, 1]) {
    // along x, y and z in turn; the other two coordinates pick the edge
    out.push({ a: [lo[0], c[i][1], c[j][2]], b: [hi[0], c[i][1], c[j][2]], n: [[0, i ? 1 : -1, 0], [0, 0, j ? 1 : -1]] })
    out.push({ a: [c[i][0], lo[1], c[j][2]], b: [c[i][0], hi[1], c[j][2]], n: [[i ? 1 : -1, 0, 0], [0, 0, j ? 1 : -1]] })
    out.push({ a: [c[i][0], c[j][1], lo[2]], b: [c[i][0], c[j][1], hi[2]], n: [[i ? 1 : -1, 0, 0], [0, j ? 1 : -1, 0]] })
  }
  return out
}

/** An edge is on the visible side when either face it bounds is. */
export const edgeVisible = (e: Edge, view: IsoView = SE): boolean => faceVisible(e.n[0], view) || faceVisible(e.n[1], view)

export interface IsoFit {
  /** World → sheet coordinates. */
  p: (v: Vec3) => Pt
  /** Sheet units per world unit. */
  s: number
  /** The fitted drawing's extent on the sheet. */
  box: { x: number; y: number; w: number; h: number }
}

/** Scale and place `pts` to fit inside (x, y, w, h) at one scale, centred across, top-aligned. */
export function fitIso(pts: readonly Vec3[], x: number, y: number, w: number, h: number, view: IsoView = SE): IsoFit {
  const raw = pts.map((q) => isoRaw(q, view))
  const us = raw.map((q) => q[0]), vs = raw.map((q) => q[1])
  const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs)
  const s = Math.min(w / Math.max(u1 - u0, 1e-9), h / Math.max(v1 - v0, 1e-9))
  const ox = x + (w - (u1 - u0) * s) / 2 - u0 * s, oy = y - v0 * s
  return {
    s,
    p: (q) => { const [u, v] = isoRaw(q, view); return [ox + u * s, oy + v * s] },
    box: { x: ox + u0 * s, y, w: (u1 - u0) * s, h: (v1 - v0) * s },
  }
}

/** An SVG path through projected points. */
export function isoPath(pts: readonly Pt[], close = true): string {
  return pts.map((q, k) => `${k ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ') + (close ? ' Z' : '')
}

/**
 * A flat outline in the (x, z) plane, anticlockwise, extruded through y0 → y1:
 * the front cap (y0), the back cap (y1), and one side per outline edge with
 * its outward normal. A plate on edge, a notched tab.
 */
export function extrudeFaces(outline: readonly { x: number; y: number }[], y0: number, y1: number, shift: Vec3 = [0, 0, 0]): Face[] {
  const at = (q: { x: number; y: number }, y: number): Vec3 => [q.x + shift[0], y + shift[1], q.y + shift[2]]
  const sides = outline.map((a, k): Face => {
    const b = outline[(k + 1) % outline.length]
    const dx = b.x - a.x, dz = b.y - a.y, L = Math.hypot(dx, dz) || 1
    return { key: `s${k}`, n: [dz / L, 0, -dx / L], pts: [at(a, y0), at(b, y0), at(b, y1), at(a, y1)] }
  })
  return [
    { key: 'front', n: [0, -1, 0], pts: outline.map((q) => at(q, y0)) },
    { key: 'back', n: [0, 1, 0], pts: outline.map((q) => at(q, y1)) },
    ...sides,
  ]
}
