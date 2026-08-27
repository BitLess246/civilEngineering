// ─────────────────────────────────────────────────────────────────────────
// Frame and profile arithmetic for the stair-flight elevation.
//
// Pulled out of `StairElevation.tsx` — the same split `sectionLayout` got, and
// for the same reason: the complaint that started this ("the riser is diagonal,
// not a step vertical") is a statement about these numbers and nothing else,
// and rendering the component to check it would need a DOM the test setup does
// not have. The numbers do not.
//
// Units in: span m, t/R/G mm, θ degrees. Units out: SVG viewBox units.
// ─────────────────────────────────────────────────────────────────────────

export const MARGIN = { left: 70, right: 74, top: 18, bottom: 64 } as const
export const DRAW_W = 470

export type Pt = readonly [number, number]

export interface FlightGeometry {
  /** mm → viewBox units. */
  scale: number
  W: number
  HT: number
  /** Top margin, once the waist above the soffit's top end is allowed for. */
  MT: number
  /** Soffit, bottom end → top end. */
  x0: number; y0: number
  x1: number; y1: number
  /** Waist ⟂ to the soffit, and the VERTICAL height of that same waist. */
  tw: number
  tv: number
  /** Waist offset vector — normal to the soffit, pointing up out of the slab. */
  nx: number; ny: number
  nSteps: number
  /** Stepped top surface, bottom → top: riser (up R), tread (across G), … */
  profile: Pt[]
  /** The whole flight as ONE boundary: soffit, top end face, back down the
   *  steps, bottom end face. Both end faces are vertical. */
  flight: Pt[]
  /** The two landings, as closed slabs of the same waist thickness. Empty when
   *  no landing length was given. */
  lowLanding: Pt[]
  upLanding: Pt[]
  /** Soffit and top-face polylines through the WHOLE assembly, landing to
   *  landing. The bar layers are these two lines pulled in by the cover. */
  soffitLine: Pt[]
  topLine: Pt[]
  /** Where the flight meets each landing, on the soffit and on the top face —
   *  the re-entrant corners the anchorage extensions are measured from. */
  kinks: { lowSoffit: Pt; lowTop: Pt; upSoffit: Pt; upTop: Pt }
}

/** A point `d` mm from `a` towards `b`. */
export function along(a: Pt, b: Pt, d: number, scale: number): Pt {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const L = Math.hypot(dx, dy) || 1
  const f = Math.min(1, (d * scale) / L)
  return [a[0] + dx * f, a[1] + dy * f]
}

export function flightGeometry(
  span: number, t: number, R: number, G: number, thetaDeg: number, landing = 0,
): FlightGeometry {
  const th = (thetaDeg * Math.PI) / 180
  const nSteps = Math.max(1, Math.round((span * 1000 * Math.cos(th)) / Math.max(G, 1)))
  const run = nSteps * G, rise = nSteps * R
  // The landings share the drawing width with the flight, so the whole
  // assembly is to ONE scale — a landing drawn to its own would misreport the
  // 450 extension it exists to dimension.
  const land = Math.max(0, landing)
  const scale = DRAW_W / Math.max(run + 2 * land, 1)

  // ── Where the waist's top face sits ────────────────────────────────────
  // The soffit runs (cosθ, −sinθ) on screen. A normal to it is (−sinθ, −cosθ):
  // offsetting perpendicular from a slope that climbs to the RIGHT moves you up
  // and to the LEFT. The drawing used (sinθ, −cosθ) — up and to the RIGHT —
  // whose dot product with the soffit is 2 sinθ cosθ, not zero. So the one
  // thing this elevation exists to show, "t measured NORMAL to the soffit",
  // was measured along a direction that is not normal, and every face built off
  // it leaned by 2θ: the flight's end faces came out as diagonals exactly where
  // the first and last risers belong.
  //
  // Two parallel lines a perpendicular distance t apart are t/cosθ apart
  // VERTICALLY, so the top face is the soffit raised by that much — and the end
  // faces are then honestly vertical, which is how a flight is cut where it
  // meets a landing.
  const tw = t * scale
  const tv = tw / Math.max(Math.cos(th), 1e-6)
  const nx = -Math.sin(th) * tw, ny = -Math.cos(th) * tw

  const H = rise * scale
  // With landings there is a spacing callout over each one and an extension
  // dimension under it, and the flight's own top corner sits at the very top of
  // the frame — so the margins have to open up or the upper landing's label is
  // cut off by the viewBox.
  const pad = land > 0 ? 26 : 0
  const MT = MARGIN.top + tv + pad
  const W = MARGIN.left + DRAW_W + MARGIN.right
  const HT = MT + H + MARGIN.bottom + pad
  const lw = land * scale
  const x0 = MARGIN.left + lw, y0 = MT + H
  const x1 = x0 + run * scale, y1 = MT

  // Each step is riser-then-tread: UP by R, then ACROSS by G. The point a riser
  // starts from is the step's INNER corner — where a tread meets the next riser
  // — and those corners sit on the waist's top face, which is what the waist
  // being the thinnest ⟂ section means.
  const profile: Pt[] = [[x0, y0 - tv]]
  for (let i = 0; i < nSteps; i++) {
    const bx = x0 + i * G * scale, by = y0 - tv - i * R * scale
    profile.push([bx, by - R * scale], [bx + G * scale, by - R * scale])
  }

  const flight: Pt[] = [
    [x0, y0], [x1, y1], [x1, y1 - tv],
    ...[...profile].slice(0, -1).reverse(),
  ]

  // ── landings ───────────────────────────────────────────────────────────
  // Flat slabs of the same waist, butting the flight's vertical end faces.
  // The lower one runs back from the bottom of the flight, the upper one on
  // from the top: the flight's soffit meets each at a RE-ENTRANT corner, which
  // is the whole reason the steel has to be lapped past it rather than bent
  // around it.
  const lowLanding: Pt[] = lw === 0 ? [] : [
    [x0 - lw, y0], [x0, y0], [x0, y0 - tv], [x0 - lw, y0 - tv],
  ]
  const upLanding: Pt[] = lw === 0 ? [] : [
    [x1, y1], [x1 + lw, y1], [x1 + lw, y1 - tv], [x1, y1 - tv],
  ]

  const soffitLine: Pt[] = lw === 0
    ? [[x0, y0], [x1, y1]]
    : [[x0 - lw, y0], [x0, y0], [x1, y1], [x1 + lw, y1]]
  const topLine: Pt[] = lw === 0
    ? [[x0, y0 - tv], [x1, y1 - tv]]
    : [[x0 - lw, y0 - tv], [x0, y0 - tv], [x1, y1 - tv], [x1 + lw, y1 - tv]]

  return {
    scale, W, HT, MT, x0, y0, x1, y1, tw, tv, nx, ny, nSteps, profile, flight,
    lowLanding, upLanding, soffitLine, topLine,
    kinks: {
      lowSoffit: [x0, y0], lowTop: [x0, y0 - tv],
      upSoffit: [x1, y1], upTop: [x1, y1 - tv],
    },
  }
}

// ── how a bar is actually bent ────────────────────────────────────────────
// The elevation drew each layer as a bare polyline: sharp corners, and both
// ends stopping dead in mid-air. Neither is a bar. Reinforcement turns through
// a radius, and where it reaches a free edge it returns 90° into the slab
// rather than ending at the cover line where there is nothing to develop it.

/** A drawn bar: an SVG path, and the corners worth marking. */
export interface BarPath {
  d: string
  bends: Pt[]
}

const towards = (a: Pt, b: Pt, d: number): Pt => {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const L = Math.hypot(dx, dy) || 1
  const f = Math.min(0.5, d / L)                 // never past the segment's middle
  return [a[0] + dx * f, a[1] + dy * f]
}

/**
 * A bar along `pts`, bent through radius `r` at every interior corner and
 * returned 90° into the slab at each end.
 *
 * `hookSign` is which way the return turns, as a sign on the perpendicular:
 * +1 is clockwise from the run direction (down, for a bar running left to
 * right), −1 anticlockwise. A top bar hooks DOWN into the slab and a bottom bar
 * UP — in both cases away from the face it is covering, which is the only way a
 * hook has concrete around it.
 *
 * Units are SVG, not mm: the caller has already scaled.
 */
export function barPath(pts: Pt[], r: number, hook = 0, hookSign: 1 | -1 = 1): BarPath {
  if (pts.length < 2) return { d: '', bends: [] }
  const perp = (a: Pt, b: Pt): Pt => {
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const L = Math.hypot(dx, dy) || 1
    return [(-dy / L) * hookSign, (dx / L) * hookSign]
  }
  const bends: Pt[] = []
  let d = ''

  if (hook > 0) {
    const n = perp(pts[0], pts[1])
    d += `M${pts[0][0] + n[0] * hook},${pts[0][1] + n[1] * hook} L${pts[0][0]},${pts[0][1]} `
  } else {
    d += `M${pts[0][0]},${pts[0][1]} `
  }

  for (let i = 1; i < pts.length - 1; i++) {
    const a = towards(pts[i], pts[i - 1], r)
    const b = towards(pts[i], pts[i + 1], r)
    // Quadratic through the corner: the vertex is the control point, so the
    // curve leaves and rejoins the two legs tangentially — which is what a
    // bending machine does.
    d += `L${a[0]},${a[1]} Q${pts[i][0]},${pts[i][1]} ${b[0]},${b[1]} `
    bends.push(pts[i])
  }

  const last = pts[pts.length - 1]
  d += `L${last[0]},${last[1]}`
  if (hook > 0) {
    const n = perp(pts[pts.length - 2], last)
    d += ` L${last[0] + n[0] * hook},${last[1] + n[1] * hook}`
  }
  return { d, bends }
}

/**
 * The lapping bar across one corner: a straight run reaching `ext` mm along
 * each leg.
 *
 * At a stair's re-entrant corner the main steel cannot simply be bent round the
 * inside — the bend would try to straighten under tension and drive the cover
 * off. The detail is a separate bar lapped past the corner on both legs, and
 * this is that bar. It is what the 450 dimension on the reference sheet
 * measures.
 */
export function lapBar(corner: Pt, back: Pt, fwd: Pt, ext: number, scale: number): Pt[] {
  return [along(corner, back, ext, scale), corner, along(corner, fwd, ext, scale)]
}
