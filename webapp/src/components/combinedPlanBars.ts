// ─────────────────────────────────────────────────────────────────────────
// WHERE A COMBINED FOOTING'S BARS ACTUALLY SIT, IN PLAN.
//
// The sheet quotes three groups — "N ⌀db @ s c/c" each — and until #927's
// sibling on the isolated pad the combined plan drew none of them:
//
//   · LONGITUDINAL, bottom: the mat that carries the sagging regions, run
//     the full length and spread across the width. On a trapezoidal pad the
//     straight bars are spread across the NARROWEST width, centred — a bar
//     that stays inside the taper at both ends stays inside it everywhere.
//   · LONGITUDINAL, top: the hogging steel over the columns. Its extent is
//     the column zone — from the first column's outer face to the second's —
//     which is where every top critical section the sheet designs sits.
//   · TRANSVERSE, under each column: banded, centred on the column, band
//     width = the column dimension along the length + 2d (the effective
//     spread of the column's transverse strip — the rule the combined-
//     footing textbooks detail to; the page's references cite Das). The
//     schedule's spacing tiles the band, centred, exactly the way
//     `barCentres` spreads a mat across a pad.
//
// Like `footingBars`, the outermost bars never leave the cover line and a
// dense group is SAMPLED for the drawing while the callout keeps the true
// count — the extent is the drawing's job, the count stays the callout's.
//
// Units: plan dims in m, bars/cover/spacing/d in mm. Centres are metres from
// the edge they run from, ready for the caller's scale.
// ─────────────────────────────────────────────────────────────────────────
import { barCentres, sampleForDraw } from './footingBars'

/** Band width across the length: the column dimension + the spread each side. */
export function bandWidth(cColM: number, dM: number): number {
  return cColM + 2 * dM
}

/** The band centred on the column, clipped to the pad — an edge column's
 *  band falls off the end and the clip is where the bars stop. */
export function bandExtent(xc: number, cColM: number, dM: number, L: number): [number, number] {
  const half = bandWidth(cColM, dM) / 2
  return [Math.max(0, xc - half), Math.min(L, xc + half)]
}

/**
 * Transverse centres along the length: the schedule's spacing tiled across
 * the band, symmetric about the column. A band too narrow for the floor of
 * two bars still returns the column centre — the group can never draw empty.
 */
export function transverseCentres(
  xc: number, cColM: number, dM: number, spacing: number, L: number, db: number,
): number[] {
  const [from, to] = bandExtent(xc, cColM, dM, L)
  const w = to - from
  if (w <= 1e-9) return [xc]
  // The module path: n = ⌊w/s⌋ + 1 keeps (n−1)·s ≤ w, so the centred spread
  // never pokes past the band. A band narrower than one spacing carries a
  // single bar at the column centre — the group can never draw empty.
  const n = Math.floor(w / (spacing / 1000)) + 1
  if (n <= 1) return [xc]
  return barCentres(w, 0, { bars: n, spacing, db }).map((x) => x + from)
}

/** Which centres the DRAWING shows (the callout keeps the true count). */
export function transverseCentresForDraw(
  xc: number, cColM: number, dM: number, spacing: number, L: number, db: number, minGapPx: number, pxPerM: number,
): number[] {
  return sampleForDraw(transverseCentres(xc, cColM, dM, spacing, L, db), minGapPx / pxPerM)
}

/** The pad's width at a station — constant on a rectangle, the taper on a
 *  trapezoid: the transverse bars over each column span their own width. */
export function slabWidthAt(x: number, By1: number, By2: number, Bx: number): number {
  if (Bx <= 1e-9) return By1
  return By1 + ((By2 - By1) * x) / Bx
}

/** The extent of the top (hogging) steel: column outer face to column outer
 *  face — the zone that contains every top critical section. */
export function topZone(x1: number, c1M: number, x2: number, c2M: number): [number, number] {
  return [x1 - c1M / 2, x2 + c2M / 2]
}
