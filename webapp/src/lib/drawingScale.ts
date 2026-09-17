// ─────────────────────────────────────────────────────────────────────────
// HOW SMALL A DRAWING IS ALLOWED TO GET.
//
// An SVG `font-size` is in viewBox USER UNITS, so what the reader actually
// sees is `fontUnits × (renderedWidth / viewBoxWidth)`. Every drawing in this
// app sets `viewBox` + `w-full`, which scales the geometry AND the annotation
// together — so on a phone the section survives and its dimensions do not.
// Measured at 320 px: every drawing's smallest annotation under 7.2 px, the
// worst three at 2.5–2.8 px. The bar callouts and dimensions ARE the content
// of an engineering drawing, so that is not a small drawing, it is no drawing.
//
// This module is the arithmetic, kept pure so it can be tested against a hand
// calculation instead of a screenshot. `components/Drawing.tsx` applies it.
//
// THE DEFECT ONLY EXISTS AT RENDER TIME, which is why it went unnoticed: the
// source says `fontSize={6.5}` and every static rule that checks a minimum
// font size reads 6.5 and passes it. The number in the file is in user units;
// the number on the screen is user units × scale. Guard the second.
// ─────────────────────────────────────────────────────────────────────────

/**
 * The smallest annotation a drawing may render at, in CSS px.
 *
 * A JUDGEMENT, and the one number to change if it is the wrong one. It sits
 * above everything measured on the shipped app (2.5–7.1 px at 320) and below
 * Impeccable's 14 px floor for secondary text, deliberately: that floor is for
 * copy you read in a column, and a drawing is panned and inspected. Holding
 * annotation to 14 px would demand roughly 1 500 px of panning for a section
 * on a 320 px screen, which trades an unreadable drawing for an unusable one.
 *
 * The printed sheet is unaffected and always was — `pdfKit` sets absolute
 * 6.2–7.2 pt, because paper has no viewport.
 */
export const ANNOTATION_FLOOR_PX = 9

/** What a reader actually sees, in CSS px, for text set in viewBox user units. */
export function renderedTextPx(
  fontUnits: number, renderedWidth: number, viewBoxWidth: number,
): number {
  if (!(viewBoxWidth > 0) || !(renderedWidth > 0)) return 0
  return fontUnits * (renderedWidth / viewBoxWidth)
}

/**
 * The narrowest this drawing may be rendered before its smallest annotation
 * drops below `floorPx`, in CSS px.
 *
 * Below this the container scrolls rather than the drawing shrinking further.
 * Panning a legible drawing beats reading an illegible one, and it leaves the
 * drawing's own composition exactly as it was authored — the alternative,
 * growing the annotation as the box narrows, re-flows labels that were placed
 * by hand and collides them.
 */
export function minDrawingWidth(
  viewBoxWidth: number, smallestFontUnits: number, floorPx = ANNOTATION_FLOOR_PX,
): number {
  if (!(viewBoxWidth > 0) || !(smallestFontUnits > 0) || !(floorPx > 0)) return 0
  return (viewBoxWidth * floorPx) / smallestFontUnits
}

/**
 * Does this drawing clear the floor at `renderedWidth`?
 *
 * Stated as its own predicate because the guard test asks exactly this, and a
 * test that re-derives the comparison is testing its own arithmetic twice.
 */
export function clearsFloor(
  fontUnits: number, renderedWidth: number, viewBoxWidth: number,
  floorPx = ANNOTATION_FLOOR_PX,
): boolean {
  return renderedTextPx(fontUnits, renderedWidth, viewBoxWidth) >= floorPx
}

/**
 * The tallest a figure may render, as a fraction of the viewport height.
 *
 * ESTABLISHED, NOT ASSUMED. The audit recorded D4 as "five of twenty drawings
 * cap their width, the rest run to 1410–1418 px at 1920" and said explicitly
 * that whether the large end LOOKED wrong had not been checked. It does: the
 * cantilever retaining wall renders 1410 × 1594 on a 1920 × 1200 screen, so a
 * single cross-section is taller than the window and cannot be seen at once,
 * with the drawing's own whitespace stretched around it.
 *
 * Height is the binding constraint at the top end, not width — a section is
 * usually taller than it is wide, so a width cap large enough to keep the
 * annotation comfortable still lets the figure run off the screen vertically.
 * `TSection` already had a `max-h-[440px]` for exactly this reason; this
 * generalises that one component's fix into the policy.
 */
export const DRAWING_MAX_VH = 0.72

/**
 * The width at which this figure is `maxHeightPx` tall, in CSS px.
 *
 * Capping the FRAME's width rather than the SVG's height on purpose: an
 * `max-height` on a `preserveAspectRatio` SVG letterboxes it — the box keeps
 * its width, the drawing shrinks inside it, and the difference is whitespace.
 * Deriving the width from the height keeps the figure flush with its frame.
 */
export function maxDrawingWidth(
  viewBoxWidth: number, viewBoxHeight: number, maxHeightPx: number,
): number {
  if (!(viewBoxWidth > 0) || !(viewBoxHeight > 0) || !(maxHeightPx > 0)) return 0
  return maxHeightPx * (viewBoxWidth / viewBoxHeight)
}

/**
 * The width this figure should actually render at: no narrower than legible,
 * no taller than the screen.
 *
 * THE FLOOR WINS WHEN THEY CONFLICT, and they do conflict — a tall, densely
 * annotated section can need more width to stay readable than fits the height
 * budget. Given the choice between a figure you must scroll and a figure you
 * cannot read, this repo has already decided: scroll. So the ceiling is a
 * preference and the floor is a rule.
 */
export function drawingWidthBounds(
  viewBoxWidth: number, viewBoxHeight: number, smallestFontUnits: number,
  maxHeightPx: number, floorPx = ANNOTATION_FLOOR_PX,
): { min: number; max: number } {
  const min = minDrawingWidth(viewBoxWidth, smallestFontUnits, floorPx)
  const ceiling = maxDrawingWidth(viewBoxWidth, viewBoxHeight, maxHeightPx)
  return { min, max: ceiling > 0 ? Math.max(ceiling, min) : 0 }
}
