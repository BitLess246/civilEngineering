// ─────────────────────────────────────────────────────────────────────────
// Compaction (Proctor). Layer 8. ASTM D698 (standard effort) / D1557 (modified).
//
// A soil is compacted into a mould at several water contents and the dry
// density plotted against water content. The curve peaks: too dry and the
// grains will not slide past each other, too wet and the water occupies volume
// the solids could have had. The peak gives the two numbers earthworks are
// specified and paid against — maximum dry density γd,max and optimum moisture
// content OMC — and every field density test is a percentage of the first.
//
// THREE THINGS THIS MODULE REFUSES TO GLOSS.
//
// 1. OMC IS READ OFF A CURVE, NOT MEASURED. No specimen is compacted at the
//    optimum; the peak is inferred from four or five points around it. This
//    module fits a parabola by least squares and reports the vertex, which is
//    what the hand construction approximates by eye. When the vertex falls
//    outside the water contents actually tested, that is an extrapolation and
//    is reported as one rather than printed as a result.
//
// 2. NO POINT CAN LIE ABOVE THE ZERO-AIR-VOIDS CURVE. ZAV is the density of a
//    fully saturated soil at that water content — an upper bound with no
//    modelling in it, only Gs and the definition of saturation. A point above
//    it is not a dense soil, it is a measurement error (usually the mould
//    volume, a mis-stated Gs, or a water content from the wrong can), and it is
//    reported by name with the saturation it implies.
//
// 3. THE TWO EFFORTS ARE NOT INTERCHANGEABLE. D1557 delivers 4.5× the energy of
//    D698, and its curve sits higher and drier — typically 5–10% more density
//    at 2–4% less water. "95% of MDD" means nothing until it says which. The
//    effort is stored, printed and carried into the note.
//
// WHAT IS NOT HERE: compaction is a construction-control test on a REMOULDED
// specimen, so it describes what the soil can be made into, not what the ground
// currently is. It is deliberately not wired into the interpreted-parameter
// engine, which reports in-situ state.
//
// UNITS: masses g; mould volume cm³; density Mg/m³ (= g/cm³); unit weight
// kN/m³; water content % (0–100).
// ─────────────────────────────────────────────────────────────────────────

import { type LabNote, info, warn } from '../notes'

/** Gravity used to turn a density (Mg/m³) into a unit weight (kN/m³). */
export const G = 9.807

/** Density of water at laboratory temperature, Mg/m³. */
export const RHO_W = 1.0

export type CompactionEffort = 'standard' | 'modified'

/** One compacted specimen: one mould, one water content. */
export interface CompactionPoint {
  /**
   * Water content of this specimen, %, from its companion D2216 determination.
   * Stored rather than derived here because the oven-dry pair belongs to that
   * test — book it as its own moisture test when the cans matter.
   */
  moisture: number
  /** Mass of the mould plus the compacted wet soil, g. */
  mouldSoilMass: number
}

export interface CompactionData {
  /** Volume of the compaction mould, cm³ (944 for the 4-inch, 2124 for the 6-inch). */
  mouldVolume: number
  /** Mass of the empty mould, g. */
  mouldMass: number
  /** Specific gravity of solids. Without it there is no zero-air-voids curve. */
  specificGravity?: number
  /** Which energy was applied. Absent ⇒ standard (D698). */
  effort?: CompactionEffort
  points: CompactionPoint[]
}

export interface CompactionRow {
  moisture: number
  /** Wet (bulk) density, Mg/m³. */
  wetDensity: number
  /** Dry density, Mg/m³. */
  dryDensity: number
  /** Dry unit weight, kN/m³. */
  dryUnitWeight: number
  /** Zero-air-voids dry density at this water content, Mg/m³. Needs Gs. */
  zavDensity?: number
  /** Degree of saturation implied by this point, %. Needs Gs. */
  saturation?: number
}

export interface CompactionResult {
  effort: CompactionEffort
  rows: CompactionRow[]
  /** Maximum dry density from the fitted peak, Mg/m³. */
  maxDryDensity: number
  /** The same peak as a unit weight, kN/m³ — the module's reporting convention. */
  maxDryUnitWeight: number
  /** Optimum water content at the peak, %. */
  optimumMoisture: number
  /**
   * How the peak was obtained. 'fit' is the parabola vertex; 'highest-point'
   * means the fit was rejected and the best MEASURED point is reported instead,
   * which is a weaker claim and says so.
   */
  peakFrom: 'fit' | 'highest-point'
  /** Water contents actually tested, %. */
  moistureRange: { min: number; max: number }
  /**
   * Coefficients of the accepted parabola ρd = a·w² + b·w + c, so the chart
   * draws the SAME curve the peak was read from. Absent when the fit was
   * rejected — one fit, one home; a chart that refits would be free to disagree
   * with the number printed beside it.
   */
  fit?: { a: number; b: number; c: number }
  /** Degree of saturation at the optimum, %. Needs Gs. */
  saturationAtOptimum?: number
  notes: LabNote[]
}

/**
 * Zero-air-voids dry density at a water content, Mg/m³.
 *
 *   ρd,zav = Gs·ρw / (1 + w·Gs/100)
 *
 * From ρd = Gs·ρw/(1+e) with S·e = w·Gs, at S = 100%. No empiricism: this is
 * the definition of saturation, which is why a point above it is an error
 * rather than a surprise.
 */
export function zeroAirVoids(moisture: number, gs: number): number {
  if (!(gs > 0)) throw new Error('Specific gravity must be greater than zero.')
  return (gs * RHO_W) / (1 + (moisture * gs) / 100)
}

/**
 * Degree of saturation of a compacted point, %.
 *
 *   e = Gs·ρw/ρd − 1,   S = w·Gs/e
 */
export function saturationOf(dryDensity: number, moisture: number, gs: number): number {
  const e = (gs * RHO_W) / dryDensity - 1
  if (!(e > 1e-9)) return 100
  return (moisture * gs) / e
}

/** Least-squares quadratic y = a·x² + b·x + c through the points. */
function fitQuadratic(xs: number[], ys: number[]): { a: number; b: number; c: number } | undefined {
  const n = xs.length
  if (n < 3) return undefined
  let s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0
  for (let i = 0; i < n; i++) {
    const x = xs[i], y = ys[i]
    const x2 = x * x
    s1 += x; s2 += x2; s3 += x2 * x; s4 += x2 * x2
    t0 += y; t1 += x * y; t2 += x2 * y
  }
  // Normal equations for [a, b, c] — solved by Cramer's rule on the 3×3.
  const m = [
    [s4, s3, s2],
    [s3, s2, s1],
    [s2, s1, n],
  ]
  const r = [t2, t1, t0]
  const det = (q: number[][]) =>
    q[0][0] * (q[1][1] * q[2][2] - q[1][2] * q[2][1])
    - q[0][1] * (q[1][0] * q[2][2] - q[1][2] * q[2][0])
    + q[0][2] * (q[1][0] * q[2][1] - q[1][1] * q[2][0])
  const D = det(m)
  if (Math.abs(D) < 1e-12) return undefined
  const sub = (col: number) => m.map((row, i) => row.map((v, j) => (j === col ? r[i] : v)))
  return { a: det(sub(0)) / D, b: det(sub(1)) / D, c: det(sub(2)) / D }
}

export function compaction(d: CompactionData): CompactionResult {
  const notes: LabNote[] = []
  if (!(d.mouldVolume > 0)) throw new Error('Mould volume must be greater than zero.')
  if (!(d.mouldMass >= 0)) throw new Error('Mould mass cannot be negative.')

  const effort: CompactionEffort = d.effort ?? 'standard'
  const gs = d.specificGravity && d.specificGravity > 0 ? d.specificGravity : undefined

  const pts = [...d.points]
    .filter((p) => Number.isFinite(p.moisture) && Number.isFinite(p.mouldSoilMass))
    .sort((a, b) => a.moisture - b.moisture)

  if (pts.length < 3) {
    throw new Error('A compaction curve needs at least three compacted points.')
  }

  const rows: CompactionRow[] = pts.map((p) => {
    const soil = p.mouldSoilMass - d.mouldMass
    if (!(soil > 0)) {
      throw new Error('A specimen weighs no more than the empty mould. Check the mould mass and the mould + soil masses.')
    }
    if (p.moisture < 0) throw new Error('A water content cannot be negative.')
    const wetDensity = soil / d.mouldVolume
    const dryDensity = wetDensity / (1 + p.moisture / 100)
    return {
      moisture: p.moisture,
      wetDensity,
      dryDensity,
      dryUnitWeight: dryDensity * G,
      zavDensity: gs ? zeroAirVoids(p.moisture, gs) : undefined,
      saturation: gs ? saturationOf(dryDensity, p.moisture, gs) : undefined,
    }
  })

  const moistureRange = { min: rows[0].moisture, max: rows[rows.length - 1].moisture }

  // ── The peak ────────────────────────────────────────────────────────────
  // A parabola is the shape the hand construction draws by eye. It is accepted
  // only when it opens DOWNWARD and its vertex sits inside the water contents
  // tested; anything else is a curve with no peak in it, and reporting a vertex
  // from an extrapolated arm would invent an optimum the laboratory never
  // approached.
  const fit = fitQuadratic(rows.map((r) => r.moisture), rows.map((r) => r.dryDensity))
  const best = rows.reduce((a, b) => (b.dryDensity > a.dryDensity ? b : a))
  let maxDryDensity = best.dryDensity
  let optimumMoisture = best.moisture
  let peakFrom: 'fit' | 'highest-point' = 'highest-point'
  let accepted: { a: number; b: number; c: number } | undefined

  if (fit && fit.a < 0) {
    const w = -fit.b / (2 * fit.a)
    const rho = fit.c - (fit.b * fit.b) / (4 * fit.a)
    if (w >= moistureRange.min && w <= moistureRange.max && rho > 0) {
      maxDryDensity = rho
      optimumMoisture = w
      peakFrom = 'fit'
      accepted = fit
    }
  }

  if (peakFrom === 'highest-point') {
    notes.push(warn(
      'No downward parabola with its vertex inside the water contents tested fits these points, so the HIGHEST MEASURED point is reported instead of an interpolated peak. The true optimum is at or beyond one end of the range — run points on the missing side before accepting γd,max.',
    ))
  }

  // ── Checks worth failing on ─────────────────────────────────────────────
  if (gs) {
    const impossible = rows.filter((r) => r.dryDensity > (r.zavDensity ?? Infinity) + 1e-9)
    for (const r of impossible) {
      notes.push(warn(
        `The point at w = ${r.moisture.toFixed(1)}% plots ABOVE the zero-air-voids curve (ρd = ${r.dryDensity.toFixed(3)} vs ZAV ${(r.zavDensity ?? 0).toFixed(3)} Mg/m³, implying S = ${(r.saturation ?? 0).toFixed(0)}%). That is impossible, not merely dense — check the mould volume, the specific gravity, and that this point's water content came from its own specimen.`,
      ))
    }
  } else {
    notes.push(warn(
      'No specific gravity given, so no zero-air-voids curve can be drawn and the one check that can prove a point impossible — a dry density above full saturation — cannot run.',
    ))
  }

  // Points ON the optimum support neither arm, and the vertex lands a rounding
  // artefact away from a point that was planted exactly at it — so the arms are
  // counted with a tolerance far below what a water content is ever read to.
  const AT_PEAK = 1e-6
  const below = rows.filter((r) => r.moisture < optimumMoisture - AT_PEAK).length
  const above = rows.filter((r) => r.moisture > optimumMoisture + AT_PEAK).length
  if (below < 2 || above < 2) {
    notes.push(warn(
      `Only ${below} point(s) dry of the optimum and ${above} wet of it. D698 asks for enough points to define both arms — with fewer than two on a side the peak is held by one measurement, and a single bad specimen moves γd,max and OMC together.`,
    ))
  }
  if (rows.length < 4) {
    notes.push(warn(`Only ${rows.length} points. D698 §10 expects at least four, and five is the usual practice.`))
  }

  notes.push(info(
    effort === 'modified'
      ? 'Modified effort (D1557, 2 700 kN·m/m³). This curve sits higher and drier than the standard-effort curve for the same soil, so a "95% compaction" specification written against D698 is NOT satisfied by 95% of this value.'
      : 'Standard effort (D698, 600 kN·m/m³). A specification written against modified effort (D1557) refers to a higher, drier curve — state which one the field densities are being judged against.',
  ))

  return {
    effort,
    rows,
    maxDryDensity,
    maxDryUnitWeight: maxDryDensity * G,
    optimumMoisture,
    peakFrom,
    moistureRange,
    fit: accepted,
    saturationAtOptimum: gs ? saturationOf(maxDryDensity, optimumMoisture, gs) : undefined,
    notes,
  }
}

/**
 * Relative compaction, %: the field dry density as a percentage of the
 * laboratory maximum. The number every earthworks specification is written in
 * ("95% of MDD"), and meaningless unless both densities refer to the same
 * effort — see the note the curve carries.
 */
export function relativeCompaction(fieldDryDensity: number, maxDryDensity: number): number {
  if (!(maxDryDensity > 0)) throw new Error('Maximum dry density must be greater than zero.')
  return (fieldDryDensity / maxDryDensity) * 100
}
