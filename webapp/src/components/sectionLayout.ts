// ─────────────────────────────────────────────────────────────────────────
// Frame arithmetic for the flanged-section drawing.
//
// Pulled out of `TSection.tsx` so it can be tested: the whole complaint was
// "the drawing is too small and the drawing area is not fully used", which is
// a statement about these numbers and nothing else. Rendering the component to
// check would need a DOM the test setup does not have; the numbers do not.
//
// THE OLD FRAME WAS FIXED at 340×285 with a 210×200 drawing area, so:
//   • the section could never use more than 62% of the frame's width, and
//   • a flanged section is WIDE AND SHORT — bf 1800, h 600 is ordinary — so
//     scaling to fit left roughly half the frame empty below the beam.
// Both come from one mistake: a frame whose shape has nothing to do with the
// shape of the thing inside it.
// ─────────────────────────────────────────────────────────────────────────

/** Margins, sized by what sits in them: the `h` dimension and its rotated
 *  label on the left, `hf` on the right, `bf` above, `bw` (plus the bar
 *  callout, when there is one) below. */
export const MARGIN = { left: 54, right: 50, top: 40, bottom: 40, bottomWithBars: 54 } as const

/** The largest the drawing itself is allowed to get, in viewBox units. The
 *  SVG scales to its container, so these set the frame's PROPORTIONS, not the
 *  rendered size. */
export const DRAW = { width: 260, height: 235 } as const

/** Frames never narrower than this, so the `bw` label has somewhere to go. */
export const MIN_DRAW_W = 120

export interface SectionFrame {
  /** mm → viewBox units. */
  scale: number
  /** viewBox dimensions. */
  W: number
  HT: number
  /** Top-left of the flange. */
  x0: number
  y0: number
  /** Drawn flange width and overall depth. */
  w: number
  ht: number
}

/**
 * Frame for a flanged section of `bf × h`, with `bars` deciding whether the
 * bottom margin has to carry the bar callout as well as the `bw` dimension.
 *
 * Fills the width, caps the height, then sizes the FRAME from the result — so
 * the viewBox's aspect ratio matches the beam's and there is no dead band in
 * either direction.
 */
export function sectionFrame(bf: number, h: number, bars = 0): SectionFrame {
  const mb = bars > 0 ? MARGIN.bottomWithBars : MARGIN.bottom
  const scale = Math.min(DRAW.width / bf, DRAW.height / h)
  const w = bf * scale, ht = h * scale
  const drawW = Math.max(w, MIN_DRAW_W)
  return {
    scale,
    W: MARGIN.left + drawW + MARGIN.right,
    HT: MARGIN.top + ht + mb,
    x0: MARGIN.left + (drawW - w) / 2,
    y0: MARGIN.top,
    w,
    ht,
  }
}

/** Share of the frame's area the section itself occupies — the number the old
 *  frame got wrong. Exported for the test rather than computed inline there,
 *  so the definition of "well used" lives with the thing it judges. */
export const fillRatio = (f: SectionFrame): number => (f.w * f.ht) / (f.W * f.HT)
