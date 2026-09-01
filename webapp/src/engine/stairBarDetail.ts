// ─────────────────────────────────────────────────────────────────────────
// THE STAIR BAR DETAIL — which bar turns a re-entrant kink, and which two
// cross it.
//
// This is the one detailing rule a stair with landings turns on, and it is
// here — an engine module, planar and unit-agnostic — because TWO drawings
// need it and they must not be allowed to disagree: `StairElevation` draws a
// flight with its landings in SVG, and `stairCage` places the same bars in
// model space. Both work in the flight's own vertical plane, so both can ask
// the same function the same question.
//
// THE PLANE. Points are (x along the run, y ACROSS it, increasing DOWNWARDS) —
// the SVG convention, because that is where the rule was worked out. A caller
// working in world coordinates with y up maps a height h to −h and back, which
// is all the 3D cage does.
//
// Units are the caller's: `ext` is multiplied by `scale` to reach them, so the
// elevation passes millimetres with its mm→viewBox scale, and the cage passes
// metres with a scale of 1.
// ─────────────────────────────────────────────────────────────────────────

export type Pt = readonly [number, number]

/** Unit vector a→b. */
const unit = (a: Pt, b: Pt): Pt => {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const L = Math.hypot(dx, dy) || 1
  return [dx / L, dy / L]
}

/**
 * Where the infinite line through `p` along `d` meets the one through `q` along
 * `e`, and how far along `d` that is (negative = behind `p`). Null when they are
 * parallel.
 *
 * This is the corner of two bar lines: where a landing's layer and the flight's
 * layer, each pulled the same cover inside its own face, actually meet. Taking
 * the corner to be directly under the face's corner instead is wrong at a
 * re-entrant kink by cover·(1 − cosθ)/sinθ, and wrong in the direction that
 * puts the bar outside the concrete.
 */
export function meetLines(p: Pt, d: Pt, q: Pt, e: Pt): { at: Pt; dist: number } | null {
  const den = d[0] * e[1] - d[1] * e[0]
  if (Math.abs(den) < 1e-9) return null
  const dist = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den
  return { at: [p[0] + d[0] * dist, p[1] + d[1] * dist], dist }
}

/**
 * Where a ray from `p` along unit `d` first meets the infinite line through `q`
 * along `e` — and how far along the ray that is. Null when they are parallel or
 * the meeting is behind the start.
 */
export function rayMeetsLine(p: Pt, d: Pt, q: Pt, e: Pt): { at: Pt; dist: number } | null {
  const hit = meetLines(p, d, q, e)
  return hit && hit.dist > 1e-9 ? hit : null
}

/**
 * The unit normal to a→b whose PAGE-Y sign is `dy` (−1 up the page, +1 down).
 *
 * A hook is named by where it goes — a top bar's hook turns into the slab, a
 * soffit bar's the other way — and that is a fact about the plane, not about
 * which way the bar happens to run. Signing the perpendicular instead makes the
 * answer flip with the run direction, so the same "soffit bar" sign hooked one
 * way on the bar drawn left-to-right and the other on the one drawn
 * right-to-left, out through the cover it was meant to hide inside.
 */
export function normalToward(a: Pt, b: Pt, dy: -1 | 1): Pt {
  const dx = b[0] - a[0], dyy = b[1] - a[1]
  const L = Math.hypot(dx, dyy) || 1
  const n: Pt = [-dyy / L, dx / L]
  return n[1] * dy >= 0 ? n : [-n[0], -n[1]]
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

/** Which side of a flight a kink sits at. */
export type KinkKind = 'bottom' | 'top'

/** True when a→b is flat in this plane — a landing, as against the flight. */
const flat = (a: Pt, b: Pt): boolean =>
  Math.abs(b[1] - a[1]) <= 1e-6 * Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1]))

/**
 * Which kind of kink sits at `at`.
 *
 * A landing is flat and the flight is not, so the kink where the flight LEAVES
 * a landing is a bottom kink and the one where it ARRIVES at the next is a top
 * kink. Read off the geometry rather than passed in, so the two callers cannot
 * label the same corner differently.
 */
export function kinkKind(prev: Pt, at: Pt, next: Pt): KinkKind {
  if (flat(prev, at)) return 'bottom'
  if (flat(at, next)) return 'top'
  // Neither leg flat: take the kink to be at the foot of the steeper one.
  return Math.abs(at[1] - prev[1]) < Math.abs(next[1] - at[1]) ? 'bottom' : 'top'
}

export type BarFace = 'top' | 'soffit'

export interface StairBar {
  id: string
  /** Polyline through the bar's own points, in the caller's units. */
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
 * this rule exists to make.
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
 * ONE KINK OR TWO. A flight may have a landing at one end only — a stair
 * breaking on an intermediate beam, with the half-landing given to one of the
 * two flights — so the layer that crosses a kink is worked out per kink rather
 * than assumed to be the four-point case. A layer with no kink of its own kind
 * to cross is ONE continuous bar; a layer that crosses one is two, and the
 * piece carrying the flight is the `-through` bar, the piece that lives on a
 * landing the `-lap`.
 *
 * `bot` / `top` are the two bar LINES (the faces pulled in by the cover), with
 * the same number of points and their kinks at matching indices; `ext` is the
 * anchorage carried past each kink, measured ALONG the bar, in whatever units
 * `scale` converts to the points'.
 */
export function stairBars(
  bot: Pt[], top: Pt[], ext: number, scale: number, gap = 0,
): StairBar[] {
  const n = Math.min(bot.length, top.length)
  // No kink: a plain flight, two straight bars, nothing to turn.
  if (n < 3) {
    return [
      { id: 'soffit', pts: [bot[0], bot[bot.length - 1]], face: 'soffit', hookStart: 0, hookEnd: 0 },
      { id: 'top', pts: [top[0], top[top.length - 1]], face: 'top', hookStart: 0, hookEnd: 0 },
    ]
  }
  const kinks = Array.from({ length: n - 2 }, (_, k) => ({
    at: k + 1, kind: kinkKind(bot[k], bot[k + 1], bot[k + 2]),
  }))
  const dir = (a: Pt, b: Pt): Pt => [b[0] - a[0], b[1] - a[1]]

  // A far face a crossed bar can run into, pulled `gap` further INTO the member
  // than the layer already lying on it. Two bars cannot occupy one line: turned
  // onto the face itself the lapping bar sits exactly under the layer it laps,
  // and the drawing shows one bar where there are two.
  const inset = (p: Pt, d: Pt, into: -1 | 1): { p: Pt; dir: Pt } => {
    const L = Math.hypot(d[0], d[1]) || 1
    let nrm: Pt = [-d[1] / L, d[0] / L]
    if (nrm[1] * into < 0) nrm = [-nrm[0], -nrm[1]]
    return { p: [p[0] + nrm[0] * gap, p[1] + nrm[1] * gap], dir: d }
  }

  const out: StairBar[] = []
  for (const face of ['soffit', 'top'] as const) {
    const line = face === 'soffit' ? bot : top
    const other = face === 'soffit' ? top : bot
    // A layer crosses the kink whose bend would push out through its OWN cover:
    // the soffit layer crosses a top kink, the top layer crosses a bottom one.
    const crossing = kinks.find((k) => k.kind === (face === 'soffit' ? 'top' : 'bottom'))
    if (!crossing) {
      // Nothing to cross — one bar, bent at its own kink, free at both ends.
      out.push({ id: `${face}-through`, pts: [...line], face, hookStart: 1, hookEnd: 1 })
      continue
    }
    const k = crossing.at
    // A soffit is reached from above, so its bar line steps UP the page (−1);
    // a top face is reached from below, so its line steps DOWN (+1). A crossing
    // bar runs into the OPPOSITE layer's line on the member it has entered.
    const into: -1 | 1 = face === 'soffit' ? 1 : -1
    const runOn = crossPast(line[k], line[k - 1], inset(other[k], dir(other[k], other[k + 1]), into), ext, scale)
    const runIn = crossPast(line[k], line[k + 1], inset(other[k], dir(other[k], other[k - 1]), into), ext, scale)
    // The piece carrying the FLIGHT is the through bar; the other lives on a
    // landing. `line[k]` is collinear between its neighbour and the run beyond
    // it, so it is not a vertex of either: neither bar bends at the crossing,
    // which is the whole point.
    const flightBefore = line.slice(0, k + 1).some((p, i) => i > 0 && !flat(line[i - 1], p))
    out.push(
      { id: `${face}-${flightBefore ? 'through' : 'lap'}`, face, hookStart: 1, hookEnd: 0,
        pts: [...line.slice(0, k), ...runOn], anchor: { corner: line[k], run: runOn } },
      { id: `${face}-${flightBefore ? 'lap' : 'through'}`, face, hookStart: 1, hookEnd: 0,
        pts: [...line.slice(k + 1).reverse(), ...runIn], anchor: { corner: line[k], run: runIn } },
    )
  }
  return out
}
