// ─────────────────────────────────────────────────────────────────────────
// California Bearing Ratio. Layer 8. ASTM D1883.
//
// A plunger is driven into a compacted specimen and the load recorded against
// penetration. CBR is that load as a percentage of the load a standard crushed
// stone takes at the same penetration:
//
//     2.54 mm → 6.9 MPa      5.08 mm → 10.3 MPa
//
// TWO THINGS DECIDE THE ANSWER AND NEITHER IS THE ARITHMETIC.
//
// 1. THE ORIGIN CORRECTION. A load–penetration curve often starts concave
//    upward — the plunger is bedding into a surface that is not quite plane, so
//    the first fraction of a millimetre costs load that the soil never resisted.
//    D1883 corrects it by extending the straight (steepest) part of the curve
//    back to zero load and taking THAT intercept as the new origin. Skipping the
//    correction understates CBR, sometimes by a third, and it is the single
//    most common way a CBR sheet is wrong. This module performs the
//    construction, reports the shift, and says when it applied one.
//
// 2. THE 5.08 mm VALUE GOVERNS WHEN IT IS HIGHER. Normally CBR at 2.54 mm is
//    the larger of the two and is the result. When 5.08 mm comes out higher,
//    D1883 §11.3 says the test is RE-RUN, and if the second run repeats it, the
//    5.08 mm value is the one reported. A module that silently takes the maximum
//    hides a test that the standard asks you to repeat, so both are returned,
//    the governing one is named, and the re-run is called for in writing.
//
// SOAKED OR UNSOAKED IS NOT A DETAIL. A soaked CBR on a plastic subgrade can be
// a third of the unsoaked value; a pavement designed on the unsoaked number is
// designed for a dry season it will not always have. The condition is stored and
// printed and never defaulted silently.
//
// UNITS: penetration mm; stress MPa; CBR %.
// ─────────────────────────────────────────────────────────────────────────

/** Standard crushed-stone stresses, MPa, at the two reference penetrations. */
export const STANDARD_STRESS = { at2_54: 6.9, at5_08: 10.3 } as const

export interface CbrPoint {
  /** Plunger penetration, mm. */
  penetration: number
  /** Stress on the plunger, MPa (load ÷ 1935 mm² for the standard plunger). */
  stress: number
}

export interface CbrData {
  points: CbrPoint[]
  /** Whether the specimen was soaked for four days before penetration. */
  soaked?: boolean
  /** Swell during soaking, % of the initial specimen height. */
  swell?: number
  /** Dry density of the specimen, Mg/m³ — CBR belongs to a compaction state. */
  dryDensity?: number
}

export interface CbrResult {
  /** Origin shift applied by the D1883 construction, mm. Zero when none. */
  originShift: number
  /** Corrected stress at 2.54 mm, MPa. */
  stress2_54: number
  /** Corrected stress at 5.08 mm, MPa. */
  stress5_08: number
  /** CBR at 2.54 mm, %. */
  cbr2_54: number
  /** CBR at 5.08 mm, %. */
  cbr5_08: number
  /** The value to report, %, and which penetration it came from. */
  cbr: number
  governing: 2.54 | 5.08
  soaked: boolean
  swell?: number
  notes: string[]
}

/** Linear interpolation of stress at a penetration, on the corrected curve. */
function stressAt(points: CbrPoint[], x: number): number {
  if (x <= points[0].penetration) return points[0].stress
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    if (x <= b.penetration) {
      const t = (x - a.penetration) / (b.penetration - a.penetration)
      return a.stress + t * (b.stress - a.stress)
    }
  }
  // Beyond the last reading the curve is EXTRAPOLATED along its final segment;
  // the caller is told, because a CBR read past the end of the data is a guess.
  const a = points[points.length - 2], b = points[points.length - 1]
  const slope = (b.stress - a.stress) / (b.penetration - a.penetration)
  return b.stress + slope * (x - b.penetration)
}

/**
 * The D1883 origin correction.
 *
 * The steepest segment of the early curve is the straight portion; extended
 * back to zero stress it meets the penetration axis at the corrected origin.
 * A curve that is already straight from zero gives a shift of zero (or a
 * negative one, which is not a correction and is discarded).
 *
 * Returns the shift in mm.
 */
export function originCorrection(points: CbrPoint[]): number {
  if (points.length < 3) return 0
  let best = { slope: 0, shift: 0 }
  // Only the early part of the curve can define the straight portion — past
  // 5 mm the curve is flattening and its slope says nothing about bedding.
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    if (a.penetration > 5.08) break
    const dx = b.penetration - a.penetration
    if (!(dx > 0)) continue
    const slope = (b.stress - a.stress) / dx
    if (slope <= best.slope) continue
    // where this segment, extended, crosses zero stress
    const shift = a.penetration - a.stress / slope
    best = { slope, shift }
  }
  return best.shift > 0 ? best.shift : 0
}

export function cbr(d: CbrData): CbrResult {
  const notes: string[] = []
  const points = [...d.points]
    .filter((p) => Number.isFinite(p.penetration) && Number.isFinite(p.stress))
    .sort((a, b) => a.penetration - b.penetration)

  if (points.length < 3) throw new Error('A CBR curve needs at least three penetration readings.')
  if (points.some((p) => p.penetration < 0)) throw new Error('A penetration cannot be negative.')
  if (points.some((p) => p.stress < 0)) throw new Error('A plunger stress cannot be negative.')

  const originShift = originCorrection(points)
  const corrected = points
    .map((p) => ({ penetration: p.penetration - originShift, stress: p.stress }))
    .filter((p) => p.penetration >= 0)

  if (corrected.length < 2) {
    throw new Error('The origin correction consumed the whole curve. Check the penetration column.')
  }

  const stress2_54 = stressAt(corrected, 2.54)
  const stress5_08 = stressAt(corrected, 5.08)
  const cbr2_54 = (stress2_54 / STANDARD_STRESS.at2_54) * 100
  const cbr5_08 = (stress5_08 / STANDARD_STRESS.at5_08) * 100

  const governing: 2.54 | 5.08 = cbr5_08 > cbr2_54 ? 5.08 : 2.54
  const value = governing === 5.08 ? cbr5_08 : cbr2_54

  if (originShift > 0) {
    notes.push(
      `The curve was concave upward at the start, so the D1883 origin correction moved the zero by ${originShift.toFixed(2)} mm — the straight portion extended back to zero load. Without it this CBR would read ${((stressAt(points, 2.54) / STANDARD_STRESS.at2_54) * 100).toFixed(1)}% instead of ${cbr2_54.toFixed(1)}%.`,
    )
  }
  if (governing === 5.08) {
    notes.push(
      `CBR at 5.08 mm (${cbr5_08.toFixed(1)}%) exceeds the value at 2.54 mm (${cbr2_54.toFixed(1)}%). D1883 §11.3 asks for the test to be RE-RUN in that case; if the re-run repeats it, the 5.08 mm value is the one reported — which is what is reported here.`,
    )
  }
  const maxPen = corrected[corrected.length - 1].penetration
  if (maxPen < 5.08) {
    notes.push(
      `The curve stops at ${maxPen.toFixed(2)} mm of corrected penetration, so the 5.08 mm ordinate is EXTRAPOLATED along the last segment rather than read. D1883 takes readings to 7.62 mm; run the plunger further before trusting the 5.08 mm value.`,
    )
  }

  const soaked = d.soaked ?? false
  notes.push(
    soaked
      ? 'Soaked (four-day) CBR — the condition a subgrade reaches under a pavement in the wet season, and the value pavement design normally uses.'
      : 'UNSOAKED CBR. On a plastic subgrade the soaked value can be a third of this one, and a pavement designed on an unsoaked number is designed for a dry season it will not always have. State the condition wherever this value is quoted.',
  )
  if (d.swell != null && d.swell > 3) {
    notes.push(`Swell of ${d.swell.toFixed(1)}% during soaking is high — above about 3% the subgrade is expansive, and CBR alone does not describe how it will behave under a pavement.`)
  }
  if (d.dryDensity == null) {
    notes.push('No dry density recorded with this CBR. A bearing ratio belongs to a compaction state — the same soil at 90% and 95% of maximum dry density gives very different values, so the number is not transferable without it.')
  }

  return {
    originShift,
    stress2_54,
    stress5_08,
    cbr2_54,
    cbr5_08,
    cbr: value,
    governing,
    soaked,
    swell: d.swell,
    notes,
  }
}
