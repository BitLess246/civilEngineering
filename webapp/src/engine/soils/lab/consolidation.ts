// ─────────────────────────────────────────────────────────────────────────
// One-dimensional consolidation (oedometer). Layer 8. ASTM D2435.
//
// A specimen is loaded in doubling increments and its compression recorded, and
// the resulting e–log σ′ curve gives the three numbers settlement analysis
// actually needs: the preconsolidation pressure σ′p, the compression index Cc
// on the virgin branch, and the recompression index Cr below it.
//
// σ′p IS THE ONE THAT MATTERS MOST AND IS THE LEAST CERTAIN. It is not
// measured, it is INFERRED from the shape of the curve. The classical method is
// Casagrande's graphical construction, which turns on where the eye judges the
// point of minimum radius to be — two engineers routinely differ by 20% on the
// same curve. This module uses a two-segment fit instead (see fitBreak) and
// says so, rather than claiming a construction it does not perform.
//
// The consequence is not academic: settlement below σ′p follows Cr, above it
// follows Cc, and Cc is typically five to ten times larger. Placing σ′p wrongly
// changes a predicted settlement by a factor, not a percentage.
//
// UNITS: stress kPa; heights mm; masses g; void ratio and indices dimensionless.
// ─────────────────────────────────────────────────────────────────────────

import { type LabNote, info, warn } from '../notes'

/** One load increment held to the end of primary consolidation. */
export interface ConsolidationPoint {
  /** Applied effective vertical stress, kPa. */
  stress: number
  /** Cumulative compression of the specimen at the end of the increment, mm. */
  compression: number
  /** t50 or t90 from the increment's time curve, minutes. Optional. */
  t50?: number
}

export interface ConsolidationData {
  /** Initial specimen height, mm. */
  initialHeight: number
  /** Specimen diameter, mm — for the area, and so cv can be reported. */
  diameter: number
  /** Oven-dry mass of the specimen, g. */
  dryMass: number
  /** Specific gravity of solids. Needed for the height of solids. */
  specificGravity: number
  points: ConsolidationPoint[]
}

export interface ConsolidationRow {
  stress: number
  compression: number
  height: number
  voidRatio: number
  /** Coefficient of consolidation from this increment, m²/year. Undefined without t50. */
  cv?: number
}

export interface ConsolidationResult {
  /** Equivalent height of solids, mm. */
  solidHeight: number
  initialVoidRatio: number
  rows: ConsolidationRow[]
  /** Compression index, from the steepest straight portion at high stress. */
  cc: number
  /** Recompression index, from the low-stress portion. Undefined with too few points. */
  cr?: number
  /**
   * Preconsolidation pressure from the two-segment fit, kPa. An ESTIMATE, not a
   * measurement, and not the graphical Casagrande value — see fitBreak.
   */
  preconsolidationPressure?: number
  /** Points used for the Cc fit, for a plot to highlight. */
  virginRange?: { from: number; to: number }
  notes: LabNote[]
}

/**
 * Height of solids Hs = Ms / (Gs · ρw · A), the datum every void ratio is
 * measured against. In consistent units with Ms in g, A in mm² and ρw as
 * 1 g/cm³ = 0.001 g/mm³.
 */
export function heightOfSolids(dryMass: number, gs: number, areaMm2: number): number {
  if (!(gs > 0) || !(areaMm2 > 0)) {
    throw new Error('Specific gravity and specimen area must both be greater than zero.')
  }
  return dryMass / (gs * 0.001 * areaMm2)
}

/** Least-squares slope of e against log₁₀ σ′ over a set of rows. */
function slope(rows: ConsolidationRow[]): number {
  const n = rows.length
  if (n < 2) return 0
  const xs = rows.map((r) => Math.log10(r.stress))
  const ys = rows.map((r) => r.voidRatio)
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  const sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0)
  // e falls as σ′ rises, so the compression index is the NEGATIVE slope.
  return sxx > 1e-12 ? -(sxy / sxx) : 0
}

/**
 * Preconsolidation pressure by a TWO-SEGMENT (bilinear) fit of the e–log σ′
 * curve: every candidate break is tried, each splitting the points into a
 * recompression line and a virgin line, and the break with the smallest total
 * residual wins. σ′p is where the two fitted lines intersect.
 *
 * THIS IS NOT THE CASAGRANDE CONSTRUCTION, and the difference is worth stating
 * rather than glossing. Casagrande bisects the angle between the horizontal and
 * the tangent at the point of minimum radius of curvature — a judgement made by
 * eye on a plot, which no numerical rule reproduces faithfully. A bilinear fit
 * is a different, more reproducible estimate that lands close to Casagrande on
 * a curve with a sharp break and diverges from it on a rounded one.
 *
 * I tried the numerical-Casagrande route first and it was wrong by a factor of
 * five on a synthetic curve with a planted break at 100 kPa. A method that
 * cannot recover a break it was handed has no business estimating one from real
 * data, so it was replaced rather than tuned.
 *
 * Returns undefined when no break improves on a single straight line — the
 * honest answer for a normally consolidated clay.
 */
export interface BreakFit {
  /** Preconsolidation pressure at the intersection, kPa. */
  sigmaP: number
  /** Compression index above the break. */
  cc: number
  /** Recompression index below it. */
  cr: number
  /** Index of the first point on the virgin branch. */
  breakIndex: number
}

/** Least-squares fit of e against log₁₀ σ′; returns intercept and NEGATIVE slope. */
function fitLine(rows: ConsolidationRow[]): { intercept: number; index: number; ssr: number } {
  const n = rows.length
  const xs = rows.map((r) => Math.log10(r.stress))
  const ys = rows.map((r) => r.voidRatio)
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  const sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0)
  const m = sxx > 1e-12 ? sxy / sxx : 0
  const b = my - m * mx
  const ssr = ys.reduce((s, y, i) => s + (y - (b + m * xs[i])) ** 2, 0)
  return { intercept: b, index: -m, ssr }
}

export function fitBreak(rows: ConsolidationRow[]): BreakFit | undefined {
  const pts = rows.filter((r) => r.stress > 0)
  if (pts.length < 5) return undefined

  const whole = fitLine(pts)
  let best: (BreakFit & { ssr: number }) | undefined

  // Each segment needs at least two points, so the break can sit anywhere from
  // index 2 to n−2.
  for (let k = 2; k <= pts.length - 2; k++) {
    const lower = fitLine(pts.slice(0, k))
    const upper = fitLine(pts.slice(k))
    const ssr = lower.ssr + upper.ssr

    // Intersection of e = b₁ − Cr·x and e = b₂ − Cc·x:
    //   b₁ − Cr·x = b₂ − Cc·x  ⇒  x = (b₂ − b₁)/(Cc − Cr)
    // The numerator's sign matters and I had it the wrong way round at first,
    // which put σ′p at 0.005 kPa and made every break fall outside the tested
    // range — so the fit silently returned "no break" on a curve built to have
    // one.
    const denom = upper.index - lower.index
    if (denom <= 1e-9) continue            // virgin must be steeper than recompression
    const x = (upper.intercept - lower.intercept) / denom
    const sigmaP = Math.pow(10, x)

    // A break outside the tested range is an extrapolation the data cannot support.
    if (!Number.isFinite(sigmaP)) continue
    if (sigmaP < pts[0].stress || sigmaP > pts[pts.length - 1].stress) continue

    if (!best || ssr < best.ssr) {
      best = { sigmaP, cc: upper.index, cr: lower.index, breakIndex: k, ssr }
    }
  }

  // A break must explain the curve materially better than one straight line;
  // otherwise the soil is normally consolidated and there is nothing to find.
  if (!best || best.ssr > whole.ssr * 0.5) return undefined
  return { sigmaP: best.sigmaP, cc: best.cc, cr: best.cr, breakIndex: best.breakIndex }
}

export function consolidation(d: ConsolidationData): ConsolidationResult {
  const notes: LabNote[] = []
  if (!(d.initialHeight > 0)) throw new Error('Initial specimen height must be greater than zero.')
  if (!(d.diameter > 0)) throw new Error('Specimen diameter must be greater than zero.')

  const area = (Math.PI / 4) * d.diameter ** 2
  const solidHeight = heightOfSolids(d.dryMass, d.specificGravity, area)

  if (solidHeight >= d.initialHeight) {
    throw new Error(
      'The height of solids equals or exceeds the specimen height, which leaves no voids. Check the dry mass, the specific gravity and the specimen dimensions.',
    )
  }

  const initialVoidRatio = d.initialHeight / solidHeight - 1

  const pts = [...d.points]
    .filter((p) => p.stress > 0 && Number.isFinite(p.compression))
    .sort((a, b) => a.stress - b.stress)

  if (pts.length < 3) {
    throw new Error('A consolidation curve needs at least three load increments.')
  }

  const rows: ConsolidationRow[] = pts.map((p) => {
    const height = d.initialHeight - p.compression
    const voidRatio = height / solidHeight - 1
    // cv = T50·Hdr²/t50, T50 = 0.197, Hdr = half the specimen (drained both faces).
    // mm²/min → m²/year: ×(1e-6)×(525600)
    const hdr = height / 2
    const cv = p.t50 && p.t50 > 0
      ? (0.197 * hdr * hdr / p.t50) * 1e-6 * 525600
      : undefined
    return { stress: p.stress, compression: p.compression, height, voidRatio, cv }
  })

  if (rows.some((r) => r.voidRatio < 0)) {
    throw new Error('A load increment compressed the specimen below its height of solids, which is impossible. Check the compression readings.')
  }

  // The break decides both branches: fitting Cc over an arbitrary "upper half"
  // drags recompression points into it and flattens the index.
  const fit = fitBreak(rows)
  const virgin = fit ? rows.slice(fit.breakIndex) : rows.slice(Math.floor(rows.length / 2))
  const cc = fit ? fit.cc : slope(virgin)
  // Without a break the branches are not separable, but a recompression index
  // over the lower half is still worth computing so the sanity check below can
  // catch a curve whose branches were entered the wrong way round.
  const cr = fit ? fit.cr : slope(rows.slice(0, Math.max(Math.floor(rows.length / 2), 2)))
  const preconsolidationPressure = fit?.sigmaP

  if (preconsolidationPressure == null) {
    notes.push(warn(
      'No break in the curve fits materially better than a single straight line. That is the honest result for a normally consolidated clay, where σ′p sits at or below the lowest stress applied — but it also happens when too few increments were run below the break, so check the plot before concluding either.',
    ))
  } else {
    notes.push(info(
      `σ′p = ${preconsolidationPressure.toFixed(0)} kPa is an ESTIMATE from a two-segment fit, not a measurement, and not the graphical Casagrande construction — the two agree on a sharp break and diverge on a rounded one. Settlement below σ′p follows Cr and above it follows Cc, which is several times larger, so where the break is placed changes a prediction by a factor rather than a percentage. Check it against the plotted curve.`,
    ))
  }

  if (cr != null && cr >= cc) {
    notes.push(warn('The recompression index is not smaller than the compression index, which no real soil does — the two branches have probably been read the wrong way round.'))
  }
  if (cc <= 0) {
    notes.push(warn('The compression index came out zero or negative: the specimen did not compress with increasing stress. Check the compression column.'))
  }
  if (rows.length < 6) {
    notes.push(warn(`Only ${rows.length} increments. D2435 asks for enough to define both branches and the break between them; with this few the Casagrande construction is poorly constrained.`))
  }
  if (!rows.some((r) => r.cv != null)) {
    notes.push(warn('No t50 recorded on any increment, so cv — and therefore the RATE of settlement — cannot be computed. The magnitude can.'))
  }

  return {
    solidHeight,
    initialVoidRatio,
    rows,
    cc,
    cr,
    preconsolidationPressure,
    virginRange: { from: virgin[0].stress, to: virgin[virgin.length - 1].stress },
    notes,
  }
}

/**
 * Overconsolidation ratio, σ′p / σ′v0. Above about 1.2 the soil is
 * overconsolidated and will settle on the much flatter Cr branch until the new
 * load pushes it past σ′p.
 */
export function overconsolidationRatio(sigmaP: number, effectiveOverburden: number): number {
  if (!(effectiveOverburden > 0)) throw new Error('Effective overburden must be greater than zero.')
  return sigmaP / effectiveOverburden
}
