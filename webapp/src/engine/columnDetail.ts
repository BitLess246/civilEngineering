// ─────────────────────────────────────────────────────────────────────────
// COLUMN DETAILING RULES — the code geometry, not a drawing
//
// This file used to build the TYPICAL COLUMN DETAIL: one storey of one column
// type, deduplicated by section and tie schedule, with every figure on it — the
// tie positions, the lap, the confinement zones — computed here from b, h and a
// spacing. The sheet is now `columnStackDetail`, which draws ONE SHEET PER
// COLUMN from footing to top and takes every bar off the placed cage, so there
// is no longer a second opinion about where a tie goes.
//
// `tiePositions` went with it. It was a tie layout, and `columnCage.tieLevels`
// is the one that gets built, scheduled and weighed; two layouts for one thing
// is the defect the whole change set exists to remove.
//
// What is left is code geometry that decides nothing about ink:
//
//   clearHeight    ℓu — the storey less the member framing in at the top, which
//                  is the length §418.7.5 is written against
//   spliceWindow   the centre half of ℓu, where §418.7.4.3 permits a lap
//   offsetBentBars §410.7.4 — the crank where a column steps, and the rule that
//                  past 75 mm of face offset it may not be bent at all
//
// Units: geometry m; bar/column sizes mm.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Clear height ℓu, m.
 *
 * The storey height less the depth of the member framing in at the top — the
 * length that can actually hinge, and the length §418.7.5 is written against.
 * Using the storey height instead understates ℓo and puts the first tie in the
 * wrong place.
 */
export function clearHeight(storey: number, beamDepth: number): number {
  return Math.max(0, storey - beamDepth / 1000)
}

/**
 * Where a lap splice may sit — the centre half of the clear height
 * (§418.7.4.3). Returns [zStart, zEnd] from the bottom of ℓu, m.
 */
export function spliceWindow(lu: number): [number, number] {
  return [lu / 4, (3 * lu) / 4]
}

// ── Offset bent bars — NSCP §410.7.4 / ACI 318-14 §10.7.4 ──────────────────
//
// Where a column narrows from one storey to the next, the bars from below have
// to be cranked inward to line up with the smaller cage above. The code governs
// that crank, and until now nothing in the app checked it even though the model
// has always been able to represent the change:
//
//   §410.7.4.1  slope of the INCLINED portion ≤ 1 in 6 relative to the axis
//   §410.7.4.2  the portions above and below the offset stay parallel to the axis
//   §410.7.4.3  horizontal support by ties/spirals placed within 150 mm of the
//               bend — they carry 1.5× the horizontal component of the bar force
//   §410.7.4.5  where the face offset exceeds 75 mm, the bars may NOT be bent:
//               separate dowels lapped with the bars below are required
//
// The last one is the rule that matters most and the one most often missed: a
// big step in column size is not a bend problem, it is a dowel detail.

/** Maximum slope of the inclined portion, §410.7.4.1 — 1 horizontal in 6 vertical. */
export const OFFSET_MAX_SLOPE = 1 / 6
/** §410.7.4.5 — face offset beyond which bars must be doweled, not bent, mm. */
export const OFFSET_DOWEL_LIMIT = 75
/** §410.7.4.3 — ties giving horizontal support sit within this of the bend, mm. */
export const OFFSET_TIE_REACH = 150

export interface OffsetBentBarResult {
  /** Horizontal offset of the bar per face, mm. */
  offset: number
  /** Vertical length the crank needs at the limiting 1:6 slope, mm. */
  minCrankLength: number
  /** Actual slope run:rise as a fraction, at `crankLength` if one is supplied. */
  slope: number | null
  /** §410.7.4.1 satisfied. */
  slopeOK: boolean
  /** True when §410.7.4.5 forbids bending — separate dowels are required. */
  dowelsRequired: boolean
  /** 1.5 × the horizontal component of the bar force, kN — §410.7.4.3. */
  tieForce: number
  notes: string[]
}

/**
 * Check the crank where a column steps from `bLower` to `bUpper` (mm, the same
 * face both times), with `barDia` verticals of yield `fy`.
 *
 * `crankLength` is the vertical length available for the bend, mm; omit it to
 * get the minimum the slope limit demands.
 *
 * The offset per face is HALF the change in width — the cage narrows on both
 * sides — which is the step people get wrong by a factor of two, and it is the
 * factor that decides whether §410.7.4.5 forces dowels.
 */
export function offsetBentBars(
  bLower: number, bUpper: number, barDia: number, fy = 415, crankLength?: number,
): OffsetBentBarResult {
  const notes: string[] = []
  const offset = Math.max(0, (bLower - bUpper) / 2)
  const minCrankLength = offset / OFFSET_MAX_SLOPE          // rise = run / (1/6)
  const slope = crankLength && crankLength > 0 ? offset / crankLength : null
  const slopeOK = slope == null ? true : slope <= OFFSET_MAX_SLOPE + 1e-9
  const dowelsRequired = offset > OFFSET_DOWEL_LIMIT

  // §410.7.4.3 — the tie force is 1.5× the HORIZONTAL component of the bar
  // force, and the horizontal component follows the crank slope.
  const Ab = (Math.PI / 4) * barDia * barDia
  const s = slope ?? OFFSET_MAX_SLOPE
  const tieForce = (1.5 * Ab * fy * s) / 1e3                // N → kN

  if (dowelsRequired) {
    notes.push(`offset ${Math.round(offset)} mm > ${OFFSET_DOWEL_LIMIT} mm — bars may NOT be bent; use separate dowels lapped with the bars below (§410.7.4.5)`)
  }
  if (!slopeOK) {
    notes.push(`crank slope 1:${(1 / (slope as number)).toFixed(1)} is steeper than the 1:6 limit — lengthen the bend to ${Math.ceil(minCrankLength)} mm (§410.7.4.1)`)
  }
  if (offset > 0) {
    notes.push(`provide ties within ${OFFSET_TIE_REACH} mm of the bend for ${tieForce.toFixed(1)} kN horizontal (§410.7.4.3)`)
  }
  return { offset, minCrankLength, slope, slopeOK, dowelsRequired, tieForce, notes }
}
