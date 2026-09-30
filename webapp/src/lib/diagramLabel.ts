// ─────────────────────────────────────────────────────────────────────────
// WHERE A DIAGRAM'S PEAK LABEL GOES.
//
// `Diagram` tags its max above the diamond and its min below. A max sitting on
// the top of the plot then put its label in the title band (the "LOAD w"
// diagram printed its peak over its own title), and a min on the bottom edge
// put it on the x-axis tick labels. The label flips to the other side of the
// diamond — into the plot — when its own side has no room, and hugs the plot
// edge instead of centring when centring would run it out past one.
// All values in SVG user units.
// ─────────────────────────────────────────────────────────────────────────

export interface PlotBox { left: number; right: number; top: number; bottom: number }

export interface LabelPos { x: number; y: number; anchor: 'start' | 'middle' | 'end' }

/** Baseline offset above the diamond, and below it (a 9.5 px label). */
export const LABEL_ABOVE = 9
export const LABEL_BELOW = 15
/** Rough advance of one 9.5 px Arial character — enough to keep text inside. */
export const LABEL_CHAR_W = 5.4
const CAP = 7   // cap height of a 9.5 px label

export function markerLabelPos(
  x: number, y: number, place: 'above' | 'below', text: string, box: PlotBox,
): LabelPos {
  const above = y - LABEL_ABOVE, below = y + LABEL_BELOW
  // the label's top must stay inside the plot; its baseline above the axis
  const fitsAbove = above - CAP >= box.top
  const fitsBelow = below <= box.bottom - 2
  const ly = place === 'above' ? (fitsAbove ? above : below) : (fitsBelow ? below : above)
  const half = (text.length * LABEL_CHAR_W) / 2
  if (x - half < box.left) return { x: box.left + 2, y: ly, anchor: 'start' }
  if (x + half > box.right) return { x: box.right - 2, y: ly, anchor: 'end' }
  return { x, y: ly, anchor: 'middle' }
}

/** Two extrema that would print as the same number are one extremum. */
export function sameValue(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b))
}
