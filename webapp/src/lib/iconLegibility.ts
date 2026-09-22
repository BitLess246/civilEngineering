// ─────────────────────────────────────────────────────────────────────────
// WILL THIS MARK READ AT THE SIZE IT SHIPS AT?
//
// The icon guards checked the grid, the stroke, the command letters and the
// path count — every property that makes a set a set — and passed a ribbon
// whose marks were, rendered at 20 px and inspected at 4×, ILLEGIBLE. A UDL
// whose four arrows sat 4.5 units apart drew a solid comb. A moment diagram
// hatched every 2.4 units filled in. A beam elevation with its bars 2.5 units
// inside its own outline came out a hatched bar. A hysteresis loop spanning
// 11 of 24 units was a scribble on a cross.
//
// The common cause is arithmetic, not taste. `ICON_STROKE` is 1.6 grid units
// and the stroke is CENTRED on the path, so two parallel strokes 3 units apart
// leave 3 − 1.6 = 1.4 units of gap — at 20 px, a shade over one physical pixel,
// and antialiasing closes it. Below that the two strokes are one thick stroke.
//
// So this module states the two rules the drawings have to satisfy, as
// geometry that can be computed from the `d` strings:
//
//   · parallel strokes that overlap keep `MIN_FEATURE_GAP` between them;
//   · the mark FILLS its box, because a small drawing is a detailed drawing
//     scaled down, with all the same merging and less of everything else.
//
// Deliberately a proxy and not a renderer. It reads axis-parallel segments
// only — the combs, rules, hatches and outlines that actually merged — and
// says nothing about curves. It is what a 4× screenshot taught, written down
// so the next mark does not have to learn it the same way.
// ─────────────────────────────────────────────────────────────────────────
import type { GroupIcon } from './toolGroupIcons'

/**
 * The least distance between two parallel strokes, in grid units.
 *
 * 3.0 = the 1.6-unit stroke plus 1.4 of clear air. Every mark that read badly
 * at 20 px was under it and every mark that read well was over it, which is
 * the whole derivation — there is no theory here beyond the stroke width.
 */
export const MIN_FEATURE_GAP = 3

/**
 * The least a mark must span in each direction, in grid units.
 *
 * 14 of 24. The two marks that read worst were also the two smallest: the
 * hysteresis loop at 11 units across and the mode shapes at 8 tall. A mark
 * drawn small is a mark whose every feature is proportionally closer together.
 */
export const MIN_EXTENT = 14

/**
 * A box containing the elliptical arc from (x0, y0) to (x1, y1).
 *
 * CONSERVATIVE ON PURPOSE. This returns the corners of the box around the
 * whole ELLIPSE the arc lies on, not the arc's own extrema — so for a quarter
 * arc it over-reports. That is the safe direction for the lower-bound "is the
 * mark big enough" test the caller runs: it can let a marginal drawing
 * through, never reject a good one. The same trade-off the curve control
 * points already make.
 *
 * The centre comes from the SVG spec's endpoint-to-centre conversion
 * (F.6.5), with the radii scaled up per F.6.6 when they are too small to
 * span the chord — which is what a browser does, so the box matches what is
 * actually drawn. Rotation is ignored, which widens the box further, never
 * narrows it.
 */
export function arcBox(
  x0: number, y0: number, rx: number, ry: number,
  largeArc: boolean, sweep: boolean, x1: number, y1: number,
): number[][] {
  const ax = Math.abs(rx), ay = Math.abs(ry)
  // A zero radius is a straight line by the spec; the endpoints bound it.
  if (!(ax > 0) || !(ay > 0)) return [[x0, y0], [x1, y1]]
  const dx2 = (x0 - x1) / 2, dy2 = (y0 - y1) / 2
  // F.6.6: grow the radii until they can reach across the chord.
  const lam = (dx2 * dx2) / (ax * ax) + (dy2 * dy2) / (ay * ay)
  const k = lam > 1 ? Math.sqrt(lam) : 1
  const RX = ax * k, RY = ay * k
  const num = RX * RX * RY * RY - RX * RX * dy2 * dy2 - RY * RY * dx2 * dx2
  const den = RX * RX * dy2 * dy2 + RY * RY * dx2 * dx2
  const co = den > 0 ? Math.sqrt(Math.max(0, num / den)) : 0
  const sign = largeArc === sweep ? -1 : 1
  const cxp = sign * co * ((RX * dy2) / RY)
  const cyp = sign * co * (-(RY * dx2) / RX)
  const cx = cxp + (x0 + x1) / 2
  const cy = cyp + (y0 + y1) / 2
  return [[cx - RX, cy - RY], [cx + RX, cy + RY]]
}

export interface Segment {
  x1: number; y1: number; x2: number; y2: number
}

/**
 * The straight segments of a path, in absolute coordinates.
 *
 * Handles the commands this repo's icons actually use — `M`, `L`, `H`, `V` —
 * and STOPS at a curve rather than approximating one: a wrong approximation
 * would produce false gaps, and a guard that cries wolf gets deleted. A `Z`
 * closing line is skipped for the same reason it is safe to skip: every closed
 * outline here also states its own sides.
 */
export function segments(d: string): Segment[] {
  const out: Segment[] = []
  let x = 0, y = 0
  // Split into command + argument runs. Curves are consumed so the pen stays
  // in the right place, but contribute no segment.
  for (const m of d.matchAll(/([MLHVCSQTAZ])([^MLHVCSQTAZ]*)/g)) {
    const cmd = m[1]
    const n = (m[2].match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
    if (cmd === 'M') { x = n[0]; y = n[1] }
    else if (cmd === 'L') { out.push({ x1: x, y1: y, x2: n[0], y2: n[1] }); x = n[0]; y = n[1] }
    else if (cmd === 'H') { out.push({ x1: x, y1: y, x2: n[0], y2: y }); x = n[0] }
    else if (cmd === 'V') { out.push({ x1: x, y1: y, x2: x, y2: n[0] }); y = n[0] }
    else if (n.length >= 2) { x = n[n.length - 2]; y = n[n.length - 1] }
  }
  return out
}

/** Segments that are exactly horizontal or vertical, and long enough to read. */
const axisParallel = (segs: Segment[], axis: 'h' | 'v') => segs.filter((s) =>
  axis === 'h'
    ? s.y1 === s.y2 && Math.abs(s.x2 - s.x1) > 1
    : s.x1 === s.x2 && Math.abs(s.y2 - s.y1) > 1)

const overlaps = (a1: number, a2: number, b1: number, b2: number) =>
  Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2)) > 0.01

/**
 * Pairs of parallel strokes closer than `gap`, with the distance between them.
 *
 * Only pairs whose projections actually OVERLAP: two verticals at the same x
 * range but stacked end to end never touch, and flagging them would force the
 * drawings apart for nothing.
 */
export function crowdedPairs(icon: GroupIcon, gap = MIN_FEATURE_GAP): string[] {
  const segs = icon.paths.flatMap(segments)
  const hits: string[] = []
  for (const axis of ['h', 'v'] as const) {
    const ss = axisParallel(segs, axis)
    for (let i = 0; i < ss.length; i++) {
      for (let j = i + 1; j < ss.length; j++) {
        const a = ss[i], b = ss[j]
        const d = axis === 'h' ? Math.abs(a.y1 - b.y1) : Math.abs(a.x1 - b.x1)
        if (d >= gap || d === 0) continue          // 0 = collinear, not two strokes
        const ok = axis === 'h'
          ? overlaps(a.x1, a.x2, b.x1, b.x2) : overlaps(a.y1, a.y2, b.y1, b.y2)
        if (ok) hits.push(`${axis} strokes ${d.toFixed(2)} apart`)
      }
    }
  }
  return hits
}

/**
 * Every point a path's commands actually name, as (x, y) pairs.
 *
 * PER COMMAND, because the arguments are not interchangeable. A first attempt
 * scanned the `d` string for number pairs and read an arc's `A5 5 0 0 1 14 19`
 * as the points (5, 5), (0, 0) and (1, 14) — three coordinates that are a
 * radius, two flags and a rotation. It also read only STRAIGHT segments, which
 * made the mode shapes measure 9 units tall when their curves span 22.
 *
 * A curve's control points are included and lie OUTSIDE the curve, so the box
 * this returns can be slightly generous. That is the safe direction for a
 * lower-bound "is the mark big enough" test: it can let a marginal drawing
 * through, never reject a good one.
 */
export function points(d: string): number[][] {
  const out: number[][] = []
  let x = 0, y = 0
  for (const m of d.matchAll(/([MLHVCSQTAZ])([^MLHVCSQTAZ]*)/g)) {
    const cmd = m[1]
    const n = (m[2].match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
    if (cmd === 'H') { x = n[0]; out.push([x, y]) }
    else if (cmd === 'V') { y = n[0]; out.push([x, y]) }
    else if (cmd === 'A') {
      // rx ry rotation large-arc sweep x y. Only the last pair is a point —
      // but the ARC BULGES away from it, and `Timber` is two arcs whose every
      // named point shares x = 12, so endpoints alone measured a circle as
      // zero units wide. Bound the arc by the circle it lies on instead.
      for (let i = 0; i + 7 <= n.length; i += 7) {
        const [rx, ry, , laf, sf, ex, ey] = n.slice(i, i + 7)
        out.push(...arcBox(x, y, rx, ry, laf === 1, sf === 1, ex, ey))
        x = ex; y = ey
      }
    } else if (cmd !== 'Z') {
      for (let i = 0; i + 1 < n.length; i += 2) { x = n[i]; y = n[i + 1]; out.push([x, y]) }
    }
  }
  return out
}

/** How far the mark spans in each direction, in grid units. */
export function extent(icon: GroupIcon): { w: number; h: number } {
  const pts = [
    ...icon.paths.flatMap(points),
    // A dot's own radius counts: it is filled, so it is the whole mark's edge.
    ...(icon.dots ?? []).flatMap((c) => [[c.cx - c.r, c.cy - c.r], [c.cx + c.r, c.cy + c.r]]),
  ]
  if (!pts.length) return { w: 0, h: 0 }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}
