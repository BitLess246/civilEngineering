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
  /** What was actually DRAWN, after rounding to whole steps: plan run, rise and
   *  slope length, m. The label prints these, not the input — rounding moves
   *  the geometry, and a dimension whose number came from the input while its
   *  line came from the drawing is a dimension that lies. */
  drawn: { run: number; rise: number; slope: number }
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

/**
 * `run` is the flight's PLAN length — the horizontal distance between the two
 * landings, which is what a horizontal dimension line on this drawing can
 * measure and what `designStair` computes Mu on (its load is kPa of PLAN area,
 * so the moment is w·L_plan²/denom).
 *
 * It used to be documented as the length along the SLOPE and then projected
 * here, `span·cosθ`. The page fed the same number to both this and
 * `designStair`, so one of them had it wrong whichever way the user read the
 * field — and the drawing then labelled its horizontal span dimension with the
 * raw input, which matched neither the plan run it was drawn over nor the slope
 * length it claimed: at span 3.5 with R 150 / G 300 the drawing came out with a
 * 3.000 run and a 3.354 slope, printed "3.50 m along the slope", and handed
 * `designStair` a span 36% longer in moment than the flight it had drawn.
 */
export function flightGeometry(
  run: number, t: number, R: number, G: number, thetaDeg: number, landing = 0,
): FlightGeometry {
  const th = (thetaDeg * Math.PI) / 180
  const nSteps = Math.max(1, Math.round((run * 1000) / Math.max(G, 1)))
  const runMm = nSteps * G, rise = nSteps * R
  // The landings share the drawing width with the flight, so the whole
  // assembly is to ONE scale — a landing drawn to its own would misreport the
  // 450 extension it exists to dimension.
  const land = Math.max(0, landing)
  const scale = DRAW_W / Math.max(runMm + 2 * land, 1)

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
  const x1 = x0 + runMm * scale, y1 = MT

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
    drawn: {
      run: runMm / 1000,
      rise: rise / 1000,
      slope: Math.hypot(runMm, rise) / 1000,
    },
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
 * The unit normal to a→b whose SCREEN-Y sign is `dy` (−1 up the page, +1 down).
 *
 * A hook is named by where it goes — a top bar's hook turns DOWN into the slab,
 * a soffit bar's UP — and that is a fact about the page, not about which way
 * the bar happens to run. Signing the perpendicular instead (the old `hookSign`)
 * makes the answer flip with the run direction, so the same "soffit bar" sign
 * hooked up on the bar drawn left-to-right and down on the one drawn
 * right-to-left, out through the cover it was meant to hide inside.
 */
export function normalToward(a: Pt, b: Pt, dy: -1 | 1): Pt {
  const dx = b[0] - a[0], dyy = b[1] - a[1]
  const L = Math.hypot(dx, dyy) || 1
  const p: Pt = [-dyy / L, dx / L]
  return p[1] * dy >= 0 ? p : [-p[0], -p[1]]
}

export interface BarPathOpts {
  /** Hook length at the first / last point, SVG units. 0 = none (a buried end
   *  needs no hook: it is already surrounded by concrete). */
  hookStart?: number
  hookEnd?: number
  /** Screen-y direction the hooks turn: −1 up the page, +1 down. */
  hookDy?: -1 | 1
}

/**
 * A bar along `pts`, bent through radius `r` at every interior corner, with an
 * optional 90° return into the slab at either end.
 *
 * Ends are asked for separately because a stair's crossed bars have ONE free
 * end each: the other stops buried in the adjoining member, where a hook would
 * be drawing an anchorage the bar does not need.
 *
 * Units are SVG, not mm: the caller has already scaled.
 */
export function barPath(pts: Pt[], r: number, opts: BarPathOpts = {}): BarPath {
  if (pts.length < 2) return { d: '', bends: [] }
  const { hookStart = 0, hookEnd = 0, hookDy = 1 } = opts
  const bends: Pt[] = []
  let d = ''

  if (hookStart > 0) {
    const n = normalToward(pts[0], pts[1], hookDy)
    d += `M${pts[0][0] + n[0] * hookStart},${pts[0][1] + n[1] * hookStart} L${pts[0][0]},${pts[0][1]} `
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
  if (hookEnd > 0) {
    const n = normalToward(pts[pts.length - 2], last, hookDy)
    d += ` L${last[0] + n[0] * hookEnd},${last[1] + n[1] * hookEnd}`
  }
  return { d, bends }
}

/** Unit vector a→b. */
const unit = (a: Pt, b: Pt): Pt => {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const L = Math.hypot(dx, dy) || 1
  return [dx / L, dy / L]
}

/**
 * Where a ray from `p` along unit `d` first meets the infinite line through `q`
 * along `e` — and how far along the ray that is. Null when they are parallel or
 * the meeting is behind the start.
 */
export function rayMeetsLine(p: Pt, d: Pt, q: Pt, e: Pt): { at: Pt; dist: number } | null {
  const den = d[0] * e[1] - d[1] * e[0]
  if (Math.abs(den) < 1e-9) return null
  const dist = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den
  if (dist <= 1e-9) return null
  return { at: [p[0] + d[0] * dist, p[1] + d[1] * dist], dist }
}

/**
 * The part of a crossed bar that lies BEYOND a kink: it carries straight on in
 * the direction it arrived, and when it reaches the far face of the member it
 * has run into, it turns and follows that face for whatever anchorage is left.
 * Total length past the corner is always `ext`.
 *
 * The turn matters and is not a detail: a 150 waist has only about 240 mm of
 * straight run before a horizontal bar entering the flight comes out through
 * the soffit, so a bar drawn straight for 450 leaves the concrete altogether.
 * Turning it at the far face keeps the anchorage inside the section, and the
 * turn is safe wherever it lands: at the soffit the concrete is above the bend,
 * at a top face it is below — the side the resultant pushes towards.
 *
 * Returns the points after the corner: one when the straight run is enough, two
 * when it has to turn.
 */
export function crossPast(
  corner: Pt, from: Pt, face: { p: Pt; dir: Pt }, ext: number, scale: number,
): Pt[] {
  const d = unit(from, corner)
  const total = ext * scale
  const e0 = unit([0, 0], face.dir)
  const hit = rayMeetsLine(corner, d, face.p, e0)
  if (!hit || hit.dist >= total) return [[corner[0] + d[0] * total, corner[1] + d[1] * total]]
  // Follow the face AWAY from the corner — the sense that carries on into the
  // member, not back out of it. Taken from the arrival direction, so `face.dir`
  // may be given either way round. (A bar arriving exactly perpendicular to the
  // face would leave this undecided; on a stair it never is — the arrival is
  // either horizontal or on the slope, and the face it meets is the other, so
  // the dot product is cos θ.)
  const e: Pt = e0[0] * d[0] + e0[1] * d[1] >= 0 ? e0 : [-e0[0], -e0[1]]
  const rest = total - hit.dist
  return [hit.at, [hit.at[0] + e[0] * rest, hit.at[1] + e[1] * rest]]
}

export type BarFace = 'top' | 'soffit'

export interface StairBar {
  id: string
  /** Polyline through the bar's own points, SVG units. */
  pts: Pt[]
  face: BarFace
  /** Hook at each end: 1 = free edge, hook it; 0 = buried, nothing to hook. */
  hookStart: 0 | 1
  hookEnd: 0 | 1
  /** The kink this bar runs STRAIGHT past, and the run beyond it — the two or
   *  three points the anchorage dimension follows. Present only on a crossed
   *  bar; a bar that turns the corner has no anchorage past it to measure. */
  anchor?: { corner: Pt; run: Pt[] }
}

/**
 * Which bar turns a kink and which two cross it — the one detailing decision
 * this drawing exists to make.
 *
 * At a bend the tension either side has a resultant along the bisector, towards
 * the OUTSIDE of the turn. Where that outside is concrete the bar bears on it
 * and the bend is fine; where it is the cover, the resultant drives the cover
 * off and the bar straightens. On a flight rising to the right, turning through
 * θ:
 *
 *   bottom kink   both layers turn UP, so the resultant is UP. The soffit bar
 *                 has the whole waist above it — SAFE, one bent bar. The top
 *                 bar has only its cover, so it is NOT bent there: the
 *                 landing's bar carries straight on into the flight and the
 *                 flight's carries straight on down into the landing, each
 *                 turning only once it is deep enough to bear on concrete.
 *   top kink      both layers turn DOWN — the mirror. The TOP bar turns at the
 *                 corner; the soffit pair cross it.
 *
 * So each kink has exactly one bar bent AT it, on the face where the concrete
 * is on the inside of the turn. Every other bend in the flight is buried.
 *
 * The old `lapBar` recognised the problem and then drew the lapping bar bent
 * around the same re-entrant corner, which has the identical resultant.
 *
 * `bot` / `top` are the two bar LINES (the faces pulled in by the cover);
 * `ext` is the anchorage carried past each kink, mm, measured ALONG the bar.
 */
export function stairBars(
  bot: Pt[], top: Pt[], ext: number, scale: number, gap = 0,
): StairBar[] {
  // No landings: a plain flight, two straight bars, nothing to turn.
  if (bot.length < 4 || top.length < 4) {
    return [
      { id: 'soffit', pts: [bot[0], bot[bot.length - 1]], face: 'soffit', hookStart: 0, hookEnd: 0 },
      { id: 'top', pts: [top[0], top[top.length - 1]], face: 'top', hookStart: 0, hookEnd: 0 },
    ]
  }
  const [b0, b1, b2, b3] = bot
  const [t0, t1, t2, t3] = top
  const dir = (a: Pt, b: Pt): Pt => [b[0] - a[0], b[1] - a[1]]

  // The four far faces a crossed bar can run into — each pulled `gap` further
  // INTO the member than the layer already lying on it. Two bars cannot occupy
  // one line: turned onto the face itself the lapping bar sits exactly under
  // the layer it laps, and the drawing shows one bar where there are two.
  const inset = (p: Pt, d: Pt, into: -1 | 1): { p: Pt; dir: Pt } => {
    const L = Math.hypot(d[0], d[1]) || 1
    let n: Pt = [-d[1] / L, d[0] / L]
    if (n[1] * into < 0) n = [-n[0], -n[1]]
    return { p: [p[0] + n[0] * gap, p[1] + n[1] * gap], dir: d }
  }
  // A soffit is reached from above, so its bar line steps UP the page (−1);
  // a top face is reached from below, so its line steps DOWN (+1).
  const flightSoffit = inset(b1, dir(b1, b2), -1)
  const flightTop = inset(t2, dir(t2, t1), 1)
  const lowSoffit = inset(b1, dir(b1, b0), -1)
  const upTop = inset(t2, dir(t2, t3), 1)

  // Past the TOP kink, on the soffit: the flight's bar carries on up into the
  // landing, the landing's carries on down under the flight.
  const soffitOn = crossPast(b2, b1, upTop, ext, scale)
  const soffitIn = crossPast(b2, b3, flightTop, ext, scale)
  // Past the BOTTOM kink, on the top face: the landing's bar carries on into
  // the flight, the flight's carries on down into the landing.
  const topOn = crossPast(t1, t0, flightSoffit, ext, scale)
  const topIn = crossPast(t1, t2, lowSoffit, ext, scale)

  return [
    // Bent at the bottom kink (concrete above the turn), straight past the top
    // one. b2 is collinear between b1 and the run beyond it, so it is not a
    // vertex: the bar has no bend at that corner, which is the whole point.
    { id: 'soffit-through', pts: [b0, b1, ...soffitOn], face: 'soffit', hookStart: 1, hookEnd: 0,
      anchor: { corner: b2, run: soffitOn } },
    { id: 'soffit-lap', pts: [b3, ...soffitIn], face: 'soffit', hookStart: 1, hookEnd: 0,
      anchor: { corner: b2, run: soffitIn } },
    { id: 'top-lap', pts: [t0, ...topOn], face: 'top', hookStart: 1, hookEnd: 0,
      anchor: { corner: t1, run: topOn } },
    // Starts buried under the lower landing, comes up through the bottom kink
    // without bending at it, and turns at the TOP kink where the waist is on
    // the inside of the turn.
    { id: 'top-through', pts: [...[...topIn].reverse(), t2, t3], face: 'top', hookStart: 0, hookEnd: 1,
      anchor: { corner: t1, run: topIn } },
  ]
}

/**
 * `pts` moved sideways by `dist`, each vertex along the average of the normals
 * of the legs meeting there — a witness line for a BENT bar.
 *
 * A bent anchorage cannot be dimensioned by the straight line between its ends:
 * that chord is far shorter than the bar, and a dimension drawn on it would
 * print 450 beside a line measuring 380. Following the bar's own shape says
 * which bar is meant and where it goes.
 *
 * It does NOT preserve length, and no parallel offset does: offset round the
 * inside of a corner the legs get shorter, round the outside longer. The
 * dimension is read off its end ticks and its number, both of which sit on the
 * bar's true ends — the line between them traces the path, it does not measure
 * itself. The number is the developed length ALONG the bar, which is the
 * quantity an anchorage is specified in.
 *
 * `side` is which way to step off: −1 turns the normal to the page's up.
 */
export function offsetPath(pts: Pt[], dist: number, side: -1 | 1): Pt[] {
  if (pts.length < 2) return [...pts]
  const nOf = (a: Pt, b: Pt): Pt => {
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const L = Math.hypot(dx, dy) || 1
    const n: Pt = [-dy / L, dx / L]
    return n[1] * side >= 0 ? n : [-n[0], -n[1]]
  }
  return pts.map((p, i) => {
    const a = i === 0 ? nOf(pts[0], pts[1]) : nOf(pts[i - 1], pts[i])
    const b = i === pts.length - 1 ? a : nOf(pts[i], pts[i + 1])
    const mx = a[0] + b[0], my = a[1] + b[1]
    const L = Math.hypot(mx, my) || 1
    return [p[0] + (mx / L) * dist, p[1] + (my / L) * dist] as Pt
  })
}

/** Total length of a polyline, SVG units. */
export const pathLength = (pts: Pt[]): number =>
  pts.slice(1).reduce((L, p, i) => L + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0)
