// ─────────────────────────────────────────────────────────────────────────
// Punching shear in three dimensions — the solid the plan is a slice of.
//
// The plan draws b₀ as a dashed line, which hides that the critical section
// is an AREA: vertical shear planes d deep, standing d/2 off each column face
// (§22.6.4.1), whose total is the b₀·d that Vc = v·b₀·d multiplies. A free
// edge removes a plane, which is exactly why αs falls 40 → 30 → 20.
//
// Axes as `lib/isometric`: x along c₁ (plan right), y along c₂ (plan up, where
// an edge column's free edge is), z up from the slab's underside. mm throughout.
// Same placement as `PunchingPlan`: the column stands flush with each free
// edge — north for an edge column, north and west for a corner one.
// ─────────────────────────────────────────────────────────────────────────
import type { Vec3 } from './isometric'
import type { ColumnPosition } from '../engine/shear'

export type Side = 'west' | 'east' | 'south' | 'north'

export interface ShearPlane {
  side: Side
  /** Four corners, compression face first, anticlockwise seen from outside — d tall. */
  pts: Vec3[]
  /** The rest of the slab depth on that line, steel → tension face: cover, NOT in b₀·d. */
  cover: Vec3[]
  /** Outward normal (away from the column). */
  n: Vec3
  /** Plan length of the plane, mm — the plane's share of b₀. */
  len: number
  /** Where the tension bars square to this plane pass through it — on its steel edge. */
  cuts: Vec3[]
}

/** Which side of the slab the column is on: under a suspended slab, on top of a footing. */
export type ColumnSide = 'below' | 'above'

export interface PunchingIsoGeometry {
  slab: { lo: Vec3; hi: Vec3 }
  column: { lo: Vec3; hi: Vec3 }
  /** The compression face (on the column's side) and the tension-steel level, z mm: |zc − zs| = d. */
  zc: number
  zs: number
  /** Only the sides that exist: a free edge drops its plane. */
  planes: ShearPlane[]
  /** Σ plane lengths = b₀, mm. */
  b0: number
  /** Σ plane areas = b₀·d, mm². */
  area: number
  /** The 45° failure surface: column-face corners at the compression face → spread by d at the steel, held to the slab. */
  cone: { from: Vec3; to: Vec3 }[]
  /** The cone's outline at the steel. */
  coneTop: Vec3[]
  /** The cone's sloped faces, a free edge dropping its own — trapezoids, column edge first. */
  coneFaces: { side: Side; pts: Vec3[]; n: Vec3 }[]
  /** The tension mat at z = zs, both ways (schematic spacing). */
  bars: { a: Vec3; b: Vec3; along: 'x' | 'y' }[]
  /** Slab edges that are free, as top-face lines (for the "free edge" weight). */
  freeEdges: { side: Side; a: Vec3; b: Vec3 }[]
}

/**
 * The solid geometry; null when it can't be drawn (non-positive sizes, d ≥ h).
 * `column: 'below'` is a slab on its column (compression at the soffit, top
 * steel); `'above'` a footing under its column (compression on top, bottom
 * mat). Either way the planes run d from the column's face of the slab to the
 * tension bars — the depth §22.6.5.2 multiplies b₀ by — and the cover beyond
 * the bars is outside it.
 */
export function punchingIsoGeometry(c1: number, c2: number, d: number, h: number, position: ColumnPosition,
  opts: { column?: ColumnSide; barSpacing?: number } = {}): PunchingIsoGeometry | null {
  if (!(c1 > 0 && c2 > 0 && d > 0 && h > d)) return null
  const above = opts.column === 'above'
  const zc = above ? h : 0, zs = above ? h - d : d, zt = above ? 0 : h      // compression, steel, tension face
  const openN = position !== 'interior', openW = position === 'corner'
  const hx = c1 / 2, hy = c2 / 2, o = d / 2
  // the critical section's extent: d/2 off every face that has slab beyond it
  const xl = openW ? -hx : -hx - o, xr = hx + o
  const ys = -hy - o, yn = openN ? hy : hy + o
  // the slab: a margin past the section on each continuing side, cut at a free edge
  const m = Math.max(0.3 * Math.max(c1, c2), 0.8 * d)
  const slab = { lo: [openW ? -hx : xl - m, ys - m, 0] as Vec3, hi: [xr + m, openN ? hy : yn + m, h] as Vec3 }
  // a stub, enough to read as the column; on a footing it stands in front of the far planes, so shorter
  const colH = above ? Math.max(0.25 * Math.max(c1, c2), 0.4 * h) : Math.max(c1, c2) * 0.45
  const column = above
    ? { lo: [-hx, -hy, h] as Vec3, hi: [hx, hy, h + colH] as Vec3 }
    : { lo: [-hx, -hy, -colH] as Vec3, hi: [hx, hy, 0] as Vec3 }

  // the mat: bars on a grid through the column's axis, inside the slab by a cover
  const sp = opts.barSpacing ?? 200, inset = 40
  const grid = (lo: number, hi: number) => {
    const out: number[] = []
    for (let k = Math.ceil((lo + inset) / sp); k * sp <= hi - inset; k++) out.push(k * sp)
    return out
  }
  const { lo, hi } = slab
  const gx = grid(lo[0], hi[0]), gy = grid(lo[1], hi[1])
  const bars: PunchingIsoGeometry['bars'] = [
    ...gy.map((y) => ({ along: 'x' as const, a: [lo[0] + inset, y, zs] as Vec3, b: [hi[0] - inset, y, zs] as Vec3 })),
    ...gx.map((x) => ({ along: 'y' as const, a: [x, lo[1] + inset, zs] as Vec3, b: [x, hi[1] - inset, zs] as Vec3 })),
  ]

  const planes: ShearPlane[] = []
  const plane = (side: Side, a: [number, number], b: [number, number], n: Vec3) => {
    // bars square to the plane: along x through an x-facing plane, along y through a y-facing one
    const [u0, u1] = n[0] !== 0 ? [Math.min(a[1], b[1]), Math.max(a[1], b[1])] : [Math.min(a[0], b[0]), Math.max(a[0], b[0])]
    const cuts = (n[0] !== 0 ? gy : gx).filter((u) => u > u0 && u < u1)
      .map((u): Vec3 => n[0] !== 0 ? [a[0], u, zs] : [u, a[1], zs])
    planes.push({ side, n, len: Math.hypot(b[0] - a[0], b[1] - a[1]), cuts,
      pts: [[a[0], a[1], zc], [b[0], b[1], zc], [b[0], b[1], zs], [a[0], a[1], zs]],
      cover: [[a[0], a[1], zs], [b[0], b[1], zs], [b[0], b[1], zt], [a[0], a[1], zt]] })
  }
  plane('south', [xl, ys], [xr, ys], [0, -1, 0])
  plane('east', [xr, ys], [xr, yn], [1, 0, 0])
  if (!openN) plane('north', [xr, yn], [xl, yn], [0, 1, 0])
  if (!openW) plane('west', [xl, yn], [xl, ys], [-1, 0, 0])
  const b0 = planes.reduce((s, p) => s + p.len, 0)

  // the cone spreads d horizontally over d through the depth (45°), stopped by a free edge
  const tx0 = openW ? -hx : -hx - d, tx1 = hx + d, ty0 = -hy - d, ty1 = openN ? hy : hy + d
  const cone = ([[-hx, -hy, tx0, ty0], [hx, -hy, tx1, ty0], [hx, hy, tx1, ty1], [-hx, hy, tx0, ty1]] as const)
    .map(([x, y, X, Y]) => ({ from: [x, y, zc] as Vec3, to: [X, Y, zs] as Vec3 }))
  const coneTop: Vec3[] = [[tx0, ty0, zs], [tx1, ty0, zs], [tx1, ty1, zs], [tx0, ty1, zs]]
  const nz = above ? -1 : 1      // the cone's faces look out and toward the tension face
  const face = (side: Side, i: number, j: number, n: Vec3) => ({ side, n, pts: [cone[i].from, cone[j].from, cone[j].to, cone[i].to] })
  const coneFaces = [face('south', 0, 1, [0, -1, nz]), face('east', 1, 2, [1, 0, nz]),
    ...(openN ? [] : [face('north', 2, 3, [0, 1, nz])]), ...(openW ? [] : [face('west', 3, 0, [-1, 0, nz])])]

  const freeEdges: PunchingIsoGeometry['freeEdges'] = []
  if (openN) freeEdges.push({ side: 'north', a: [lo[0], hi[1], h], b: [hi[0], hi[1], h] })
  if (openW) freeEdges.push({ side: 'west', a: [lo[0], lo[1], h], b: [lo[0], hi[1], h] })

  return { slab, column, zc, zs, planes, b0, area: b0 * d, cone, coneTop, coneFaces, bars, freeEdges }
}
