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
