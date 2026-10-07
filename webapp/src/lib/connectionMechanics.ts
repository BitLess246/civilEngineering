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
import { clearDistance as engineClearDistance, holeDia, minFilletSize, maxFilletAlongEdge } from '../engine/steelDesign'

/** The fillet-size rules live in the engine (they are checks); re-exported for the drawings. */
export { minFilletSize, maxFilletAlongEdge }

export interface Pt { x: number; y: number }

/** Standard hole, mm — the engine's (d + 2, as block shear takes it). */
export { holeDia }

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
 * pushes the TAB, to a free edge or the next hole — the engine's §J3.10(a)
 * `clearDistance`, in the tab's frame: welded along x = 0, free at x = W,
 * y = 0 and y = H. One implementation, so the lc the drawing dimensions is
 * the lc the check used.
 */
export function clearDistance(
  bolt: Pt, dir: Pt, others: readonly Pt[], W: number, H: number, dh: number,
): { lc: number; to: Pt } | null {
  const c = engineClearDistance(bolt, dir, others, dh, { xMax: W, yMin: 0, yMax: H })
  return c && Number.isFinite(c.lc) ? c : null
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
