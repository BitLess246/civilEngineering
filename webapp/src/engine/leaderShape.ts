// ─────────────────────────────────────────────────────────────────────────
// THE LEADER'S SHAPE — one geometry for every leader the app draws, on the
// plotted sheets (`detailSheet.leader`) and in the on-screen figures
// (`components/Leader`).
//
//            label  ⌐|── landing ──┐ knee
//                   └┘              ╲  leg
//                                    ◣ arrowhead, on the thing named
//
// Four parts, drafted the way a hand-drawn leader is:
//
//   · the ARROWHEAD sits on the point named;
//   · the LEG runs from it to the knee;
//   · the LANDING (dogleg) is level, from the knee back towards the label;
//   · the GLYPH closes the landing beside the label — up, across, down past
//     the landing and a short return — so the end of the leader reads as an
//     end and not as a line that merely stops near some text.
//
// THE ANGLE AT THE KNEE IS NEVER ACUTE. The leg may leave the landing square
// (straight down or up to the target) or open away from the label; it may
// not fold back under its own landing. Two rules hold it there:
//
//   1. the knee never passes the target — a landing longer than the reach
//      to the target stops at it, and the leg drops square;
//   2. a target too nearly under its label for any landing to reach (closer
//      than the glyph's gap plus a minimum landing) slides the LABEL along
//      its own line until it can. That is the only case the label moves.
//
// Pure geometry: sheet units in, points out. y runs down, as on the sheet.
// ─────────────────────────────────────────────────────────────────────────

export type LPt = readonly [number, number]

export interface LeaderInput {
  /** The point named — the arrowhead's tip. */
  x: number
  y: number
  /** The label's anchor and baseline: the text ends (or starts) here. */
  tx: number
  ty: number
  /** Text height, sheet units — everything else is proportioned from it. */
  size: number
  /** Which way the landing runs, when the target is near enough straight
   *  above or below for either to be a real choice. */
  side?: 'left' | 'right'
  /** Landing length. Default 2.2 × size. */
  landing?: number
  /** Arrowhead length. Default 0.285 × size. */
  arrow?: number
}

export interface LeaderShape {
  /** Which way the landing runs FROM the label. */
  side: 'left' | 'right'
  /** The label anchor actually used (moved only by rule 2) and its alignment. */
  tx: number
  ty: number
  anchor: 'start' | 'end'
  /** How far rule 2 slid the label, sheet units (0 almost always). */
  slid: number
  /** Glyph, landing and leg as ONE polyline — glyph tail first, back of the arrowhead last. */
  line: LPt[]
  /** The arrowhead: tip, then the two barbs. */
  head: [LPt, LPt, LPt]
  /** The knee, and the angle there between landing and leg, degrees (≥ 90). */
  knee: LPt
  kneeAngle: number
}

/** Label anchor to the start of the landing: the glyph's width and a little air. */
export const LEADER_GAP = 0.57
/** The shortest landing drawn, × size. */
export const MIN_LANDING = 0.9
const GLYPH_W = 0.32, GLYPH_H = 0.42

/** Anchor to knee, horizontally, at the default landing. */
export const leaderKneeDistance = (size: number, landing?: number) =>
  size * LEADER_GAP + (landing ?? size * 2.2)

export function leaderShape(o: LeaderInput): LeaderShape {
  const gap = o.size * LEADER_GAP
  const knee = leaderKneeDistance(o.size, o.landing)
  // The landing runs towards the target; the caller's side only breaks the
  // tie when the target is roughly above or below the label.
  const toward: 'left' | 'right' = o.x <= o.tx ? 'left' : 'right'
  const side = Math.abs(o.x - o.tx) <= knee ? (o.side ?? toward) : toward
  const s = side === 'left' ? -1 : 1

  // rule 2: a target nearer than gap + a minimum landing slides the label back
  const need = gap + o.size * MIN_LANDING
  const reach = s * (o.x - o.tx)
  const tx = reach < need ? o.x - s * need : o.tx
  const gx = tx + s * gap
  // rule 1: the knee stops at the target
  let kx = s > 0 ? Math.min(tx + s * knee, o.x) : Math.max(tx + s * knee, o.x)

  const a0 = o.arrow ?? o.size * 0.285
  let dx = o.x - kx, dy = o.y - o.ty
  let len = Math.hypot(dx, dy)
  if (len < a0 * 1.2) {
    // the target sits on the landing's own line: the landing runs straight into the arrowhead
    kx = o.x - s * a0 * 1.2
    dx = o.x - kx; dy = o.y - o.ty; len = Math.hypot(dx, dy)
  }
  const ux = dx / len, uy = dy / len
  const a = Math.min(a0, len * 0.6)
  const bx = o.x - ux * a, by = o.y - uy * a
  const hw = a * 0.2

  const w = o.size * GLYPH_W, h = o.size * GLYPH_H
  const line: LPt[] = [
    [gx - s * w * 0.45, o.ty + h * 0.5],    // the short return
    [gx - s * w * 0.45, o.ty + h],
    [gx - s * w, o.ty + h],                 // down past the landing, on the label side
    [gx - s * w, o.ty - h],
    [gx, o.ty - h],                         // across the top
    [gx, o.ty],                             // down onto the landing
    [kx, o.ty],                             // the landing
    [bx, by],                               // the leg, to the back of the arrowhead
  ]
  // the angle at the knee, between the landing (back towards the label) and the leg
  const lx = gx - kx, ly = 0, gxv = bx - kx, gyv = by - o.ty
  const cos = (lx * gxv + ly * gyv) / ((Math.hypot(lx, ly) || 1) * (Math.hypot(gxv, gyv) || 1))
  return {
    side, tx, ty: o.ty, anchor: side === 'left' ? 'start' : 'end', slid: Math.abs(tx - o.tx),
    line,
    head: [[o.x, o.y], [bx - uy * hw, by + ux * hw], [bx + uy * hw, by - ux * hw]],
    knee: [kx, o.ty],
    kneeAngle: (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI,
  }
}
