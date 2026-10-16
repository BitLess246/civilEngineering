// ─────────────────────────────────────────────────────────────────────────
// Punching shear in three dimensions — the solid the plan is a slice of.
//
// The plan draws b₀ as a dashed line, which hides that the critical section
// is an AREA: vertical shear planes d deep, standing d/2 off each column face
// (§22.6.4.1), whose total is the b₀·d that Vc = v·b₀·d multiplies. A free
// edge removes a plane, which is exactly why αs falls 40 → 30 → 20.
//
// Axes as `lib/isometric`: x along c₁ (plan right), y along c₂ (plan up, where
// an edge column's free edge is), z up from the slab soffit. mm throughout.
// Same placement as `PunchingPlan`: the column stands flush with each free
// edge — north for an edge column, north and west for a corner one.
// ─────────────────────────────────────────────────────────────────────────
import type { Vec3 } from './isometric'
import type { ColumnPosition } from '../engine/shear'

export type Side = 'west' | 'east' | 'south' | 'north'

export interface ShearPlane {
  side: Side
  /** Four corners, soffit first, anticlockwise seen from outside. */
  pts: Vec3[]
  /** Outward normal (away from the column). */
  n: Vec3
  /** Plan length of the plane, mm — the plane's share of b₀. */
  len: number
}

export interface PunchingIsoGeometry {
  slab: { lo: Vec3; hi: Vec3 }
  column: { lo: Vec3; hi: Vec3 }
  /** Only the sides that exist: a free edge drops its plane. */
  planes: ShearPlane[]
  /** Σ plane lengths = b₀, mm. */
  b0: number
  /** Σ plane areas = b₀·d, mm². */
  area: number
  /** The 45° failure surface: column-face corners at the soffit → spread by d at the steel, held to the slab. */
  cone: { from: Vec3; to: Vec3 }[]
  /** The cone's top outline at z = d. */
  coneTop: Vec3[]
  /** The cone's sloped faces, a free edge dropping its own — trapezoids, soffit edge first. */
  coneFaces: { side: Side; pts: Vec3[]; n: Vec3 }[]
  /** Slab edges that are free, as top-face lines (for the "free edge" weight). */
  freeEdges: { side: Side; a: Vec3; b: Vec3 }[]
}

/** The solid geometry; null when it can't be drawn (non-positive sizes, d ≥ h). */
export function punchingIsoGeometry(c1: number, c2: number, d: number, h: number, position: ColumnPosition): PunchingIsoGeometry | null {
  if (!(c1 > 0 && c2 > 0 && d > 0 && h > d)) return null
  const openN = position !== 'interior', openW = position === 'corner'
  const hx = c1 / 2, hy = c2 / 2, o = d / 2
  // the critical section's extent: d/2 off every face that has slab beyond it
  const xl = openW ? -hx : -hx - o, xr = hx + o
  const ys = -hy - o, yn = openN ? hy : hy + o
  // the slab: a margin past the section on each continuing side, cut at a free edge
  const m = Math.max(0.3 * Math.max(c1, c2), 0.8 * d)
  const slab = { lo: [openW ? -hx : xl - m, ys - m, 0] as Vec3, hi: [xr + m, openN ? hy : yn + m, h] as Vec3 }
  const colH = Math.max(c1, c2) * 0.45
  const column = { lo: [-hx, -hy, -colH] as Vec3, hi: [hx, hy, 0] as Vec3 }

  const planes: ShearPlane[] = []
  const plane = (side: Side, a: [number, number], b: [number, number], n: Vec3) =>
    planes.push({ side, n, len: Math.hypot(b[0] - a[0], b[1] - a[1]),
      pts: [[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], d], [a[0], a[1], d]] })
  plane('south', [xl, ys], [xr, ys], [0, -1, 0])
  plane('east', [xr, ys], [xr, yn], [1, 0, 0])
  if (!openN) plane('north', [xr, yn], [xl, yn], [0, 1, 0])
  if (!openW) plane('west', [xl, yn], [xl, ys], [-1, 0, 0])
  const b0 = planes.reduce((s, p) => s + p.len, 0)

  // the cone spreads d horizontally over d vertically (45°), stopped by a free edge
  const tx0 = openW ? -hx : -hx - d, tx1 = hx + d, ty0 = -hy - d, ty1 = openN ? hy : hy + d
  const cone = ([[-hx, -hy, tx0, ty0], [hx, -hy, tx1, ty0], [hx, hy, tx1, ty1], [-hx, hy, tx0, ty1]] as const)
    .map(([x, y, X, Y]) => ({ from: [x, y, 0] as Vec3, to: [X, Y, d] as Vec3 }))
  const coneTop: Vec3[] = [[tx0, ty0, d], [tx1, ty0, d], [tx1, ty1, d], [tx0, ty1, d]]
  const face = (side: Side, i: number, j: number, n: Vec3) => ({ side, n, pts: [cone[i].from, cone[j].from, cone[j].to, cone[i].to] })
  const coneFaces = [face('south', 0, 1, [0, -1, 1]), face('east', 1, 2, [1, 0, 1]),
    ...(openN ? [] : [face('north', 2, 3, [0, 1, 1])]), ...(openW ? [] : [face('west', 3, 0, [-1, 0, 1])])]

  const { lo, hi } = slab
  const freeEdges: PunchingIsoGeometry['freeEdges'] = []
  if (openN) freeEdges.push({ side: 'north', a: [lo[0], hi[1], h], b: [hi[0], hi[1], h] })
  if (openW) freeEdges.push({ side: 'west', a: [lo[0], lo[1], h], b: [lo[0], hi[1], h] })

  return { slab, column, planes, b0, area: b0 * d, cone, coneTop, coneFaces, freeEdges }
}
