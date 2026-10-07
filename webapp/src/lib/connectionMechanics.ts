// ─────────────────────────────────────────────────────────────────────────
// SHEAR-TAB MECHANICS — the geometry behind each failure mode, for drawing.
//
// The connection engine reports numbers (Agv, Anv, Ant, φRn per bolt …). A
// reader checking them needs to SEE what each number is the area OF: which
// line the block tears along, which strip of plate a bolt bears on, how far a
// hole is from the edge it would tear out through. This module turns the bolt
// pattern into those shapes — pure, so the drawing only paints them.
//
// Frame: plate coordinates, mm, origin at the plate's bottom-left, y UP. The
// tab is welded along x = 0 (the support face) and its FREE edge is x = W —
// the edge `shearTabBlockShear` measures `ex_edge` to (AISC §J4.3: the
// tension plane runs from the bolt line to the free edge).
// ─────────────────────────────────────────────────────────────────────────
import { W_SORTED, type AiscShape } from '../engine/aiscSections'

export interface Pt { x: number; y: number }

/** Standard hole, mm — the +2 mm the engine's block shear uses (§J3.2). */
export const holeDia = (db: number) => db + 2

export interface BlockPath {
  /** The torn block, as a polygon (plate mm). */
  polygon: Pt[]
  /** Shear plane: along the bolt line, from the plate edge to the far bolt. */
  shear: [Pt, Pt]
  /** Tension plane: from the far bolt to the free edge. */
  tension: [Pt, Pt]
  /** Bolt holes the shear plane passes through (centres). */
  holes: Pt[]
  /** Gross lengths, mm — Lv along the shear plane, Lt across the tension plane. */
  Lv: number
  Lt: number
}

/**
 * The block §J4.3 tears out of a single-line shear tab, for case A (shear
 * path from the BOTTOM edge up to the top bolt) or B (top edge down to the
 * bottom bolt) — the two cases `shearTabBlockShear` reports, in that order.
 * The bolt line is the one nearest the free edge; a multi-column pattern is
 * checked on that line, as the engine checks it.
 */
export function blockShearPath(bolts: readonly Pt[], W: number, H: number, which: 'A' | 'B'): BlockPath {
  const xLine = Math.max(...bolts.map((b) => b.x))
  const line = bolts.filter((b) => Math.abs(b.x - xLine) < 1e-6).sort((a, b) => a.y - b.y)
  const top = line[line.length - 1], bot = line[0]
  if (which === 'A') {
    return {
      polygon: [{ x: xLine, y: 0 }, { x: W, y: 0 }, { x: W, y: top.y }, { x: xLine, y: top.y }],
      shear: [{ x: xLine, y: 0 }, { x: xLine, y: top.y }],
      tension: [{ x: xLine, y: top.y }, { x: W, y: top.y }],
      holes: line, Lv: top.y, Lt: W - xLine,
    }
  }
  return {
    polygon: [{ x: xLine, y: bot.y }, { x: W, y: bot.y }, { x: W, y: H }, { x: xLine, y: H }],
    shear: [{ x: xLine, y: H }, { x: xLine, y: bot.y }],
    tension: [{ x: xLine, y: bot.y }, { x: W, y: bot.y }],
    holes: line, Lv: H - bot.y, Lt: W - xLine,
  }
}

/**
 * Clear distance lc, mm, from a hole's edge along the direction its bolt
 * pushes the plate, to the plate edge or the edge of the next hole in the
 * way (AISC §J3.10: the material a bolt tears out through). `dir` need not
 * be unit; a zero force has no tear-out direction and returns null.
 *
 * The plate edge only counts on the free sides: x = 0 is welded to the
 * support, so a bolt bearing toward it pushes into the weld, not off a free
 * edge — that face is skipped.
 */
export function clearDistance(
  bolt: Pt, dir: Pt, others: readonly Pt[], W: number, H: number, dh: number,
): { lc: number; to: Pt } | null {
  const l = Math.hypot(dir.x, dir.y)
  if (l < 1e-9) return null
  const ux = dir.x / l, uy = dir.y / l
  // distance along the ray to the plate boundary (free faces only)
  let tEdge = Infinity
  if (ux > 1e-9) tEdge = Math.min(tEdge, (W - bolt.x) / ux)
  if (uy > 1e-9) tEdge = Math.min(tEdge, (H - bolt.y) / uy)
  if (uy < -1e-9) tEdge = Math.min(tEdge, (0 - bolt.y) / uy)
  let best = Number.isFinite(tEdge) ? tEdge - dh / 2 : Infinity
  // the next hole whose bore the ray passes through
  for (const o of others) {
    if (o === bolt || (o.x === bolt.x && o.y === bolt.y)) continue
    const rx = o.x - bolt.x, ry = o.y - bolt.y
    const along = rx * ux + ry * uy
    if (along <= 0) continue
    const off = Math.abs(rx * uy - ry * ux)
    if (off >= dh / 2) continue
    best = Math.min(best, along - dh)
  }
  if (!Number.isFinite(best)) return null
  const lc = Math.max(0, best)
  return { lc, to: { x: bolt.x + ux * (dh / 2 + lc), y: bolt.y + uy * (dh / 2 + lc) } }
}

/**
 * A W-shape to DRAW the supported beam with — the lightest whose clear web
 * (d − 2tf − 2·20 mm of fillet and clearance) takes the tab. Drawing only:
 * the calculation checks the tab, and says so.
 */
export function defaultBeamFor(plateH: number): AiscShape | undefined {
  return W_SORTED.find((s) => (s.d ?? 0) - 2 * (s.tf ?? 0) - 40 >= plateH + 20)
    ?? W_SORTED[W_SORTED.length - 1]
}

/** A stocky W column to draw the support with — W250-class, flange ≥ 250. */
export function defaultColumn(): AiscShape | undefined {
  return W_SORTED.find((s) => (s.d ?? 0) >= 240 && (s.d ?? 0) <= 275 && (s.bf ?? 0) >= 250) ?? W_SORTED[0]
}

/**
 * AISC 360-16 §J2.2b(b): the largest fillet along the EDGE of a part t thick,
 * mm — the full thickness below 6 mm, t − 2 mm from 6 mm up (so the edge is
 * not melted away and the leg can be inspected).
 */
export const maxFilletAlongEdge = (t: number) => (t < 6 ? t : t - 2)

/**
 * AISC 360-16 Table J2.4: the MINIMUM fillet size for the thinner part
 * joined, mm — 3 to 6 mm thick, 5 to 13, 6 to 19, 8 above. A weld the page
 * draws but does not design is drawn at this size and labelled as such.
 */
export function minFilletSize(tThinner: number): number {
  if (tThinner <= 6) return 3
  if (tThinner <= 13) return 5
  if (tThinner <= 19) return 6
  return 8
}

/**
 * Do the weld lines sit on a column's FLANGE TIPS? Two (or more) vertical
 * lines on exactly two x positions — the textbook bracket: a plate lapped
 * across the flange face, fillet-welded along both flange edges. Returns the
 * flange width the lines imply, mm, or null for any other pattern.
 */
export function flangeTipSpan(segs: readonly { x1: number; y1: number; x2: number; y2: number }[]): number | null {
  if (segs.length < 2 || segs.some((g) => Math.abs(g.x1 - g.x2) > 1e-6)) return null
  const xs = [...new Set(segs.map((g) => Math.round(g.x1 * 1000) / 1000))]
  return xs.length === 2 ? Math.abs(xs[1] - xs[0]) : null
}

/** The W whose flange is closest to a width, mm — for drawing a bracket whose
 *  welds sit on the flange tips. */
export function columnForFlange(bf: number): AiscShape | undefined {
  let best: AiscShape | undefined, err = Infinity
  for (const s of W_SORTED) {
    const e = Math.abs((s.bf ?? 0) - bf)
    if (e < err - 1e-9) { best = s; err = e }
  }
  return best
}
