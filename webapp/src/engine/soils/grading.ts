// ─────────────────────────────────────────────────────────────────────────
// Combined grading: the sieve stack and the sedimentation run as ONE curve.
// Layer 8. ASTM D6913 (sieving) + ASTM D7928 (sedimentation), read together
// the way a combined particle-size analysis is reported.
//
// WHY THE TWO CURVES MUST BE ONE. A sieve stops at 0.075 mm. Any soil with
// more than about 10% fines therefore never reaches 10% passing, so it has no
// D₁₀ — and with no D₁₀ there is no Cu and no Cc, which is exactly what D2487
// needs to finish a dual symbol in the 5–12% fines band. The sedimentation run
// carries the curve two decades further down. Kept apart, the two tests answer
// half a question each; joined, they answer it.
//
// WHO GOVERNS WHERE. The specimen for a sedimentation run is the material that
// PASSED the finest sieve, so the two tests measure different populations and
// the boundary between them is that sieve:
//
//     ≥ finest sieve opening   the sieve governs — it weighed those grains
//     < finest sieve opening   the sedimentation run governs — the sieve
//                              could not see them at all
//
// A sedimentation point coarser than the finest sieve is an OVERLAP, and the
// two readings there should agree. The size of their disagreement is the one
// honest check on whether `fractionOfTotal` was set correctly, so it is
// measured and reported rather than averaged away.
//
// THE JOIN CAN ALSO HAVE A HOLE IN IT. A sieve ending at 0.075 mm and a first
// hydrometer reading at 0.025 mm leave a factor-of-three band with no
// measurement in it. The curve is still drawn across it, because that is what a
// grading chart does, but a D-value that lands inside the gap is interpolated
// through unmeasured ground and says so.
//
// SILT AND CLAY HERE ARE SIZES, NOT BEHAVIOUR. `clay` below is the fraction
// finer than 0.002 mm. USCS decides silt from clay by PLASTICITY and would
// disagree — a rock flour with 40% of its grains under 2 μm is an ML, not a
// CL. The two meanings share a word and nothing else.
//
// UNITS: sizes mm; percentages 0–100, of the WHOLE sample.
// ─────────────────────────────────────────────────────────────────────────

import { type GradationResult, type SizePassing, interpolateD, passingAt } from './sieve'
import type { HydrometerResult } from './lab/hydrometer'

/** Clay/silt size boundary, mm — the sedimentation run's reason for existing. */
export const CLAY_SIZE = 0.002

export interface GradingPoint extends SizePassing {
  /** Which apparatus measured this point. */
  source: 'sieve' | 'hydrometer'
  designation?: string
}

export interface CombinedGrading {
  /** Coarse → fine. Sieve points then sedimentation points, never interleaved. */
  points: GradingPoint[]
  /** True when a sedimentation run contributed points. */
  combined: boolean
  /** Opening of the finest sieve, mm — where the sedimentation run takes over. */
  joinSize?: number
  /**
   * Sedimentation minus sieve at the join, percentage points, when the two
   * curves overlap there. Positive means the suspension holds more fine
   * material than the sieve says passed, which cannot be true of one specimen.
   */
  joinMismatch?: number
  /** Size ratio across an unmeasured band at the join, when there is one. */
  joinGap?: number
  /** Grain sizes at 10 / 30 / 60% passing on the COMBINED curve, mm. */
  d10?: number
  d30?: number
  d60?: number
  cu?: number
  cc?: number
  /** True when a D-value was interpolated across the unmeasured join band. */
  dAcrossGap: boolean
  /** D2487 fractions, from the sieve — the merge does not move them. */
  gravel: number
  sand: number
  fines: number
  /** Finer than 0.002 mm by SIZE, % of the whole sample. Needs sedimentation. */
  clay?: number
  /** Between 0.002 mm and the No. 200 sieve, % of the whole sample. */
  silt?: number
  notes: string[]
}

/**
 * Join a gradation and a sedimentation result into one curve.
 *
 * Called with no hydrometer it is a pass-through: the same curve, the same
 * D-values, `combined: false`. That is deliberate — every caller can build one
 * of these and never branch on whether a sedimentation run exists.
 */
export function combineGrading(g: GradationResult, h?: HydrometerResult): CombinedGrading {
  const notes: string[] = []
  const sievePoints: GradingPoint[] = [...g.rows]
    .filter((r) => r.size > 0)
    .sort((a, b) => b.size - a.size)
    .map((r) => ({ size: r.size, percentPassing: r.percentPassing, source: 'sieve', designation: r.designation }))

  const base = {
    combined: false, dAcrossGap: false,
    gravel: g.gravel, sand: g.sand, fines: g.fines,
  }

  if (!h || !h.rows.length || !sievePoints.length) {
    return {
      ...base, points: sievePoints,
      d10: g.d10, d30: g.d30, d60: g.d60, cu: g.cu, cc: g.cc,
      notes,
    }
  }

  const joinSize = sievePoints[sievePoints.length - 1].size
  const passingAtJoin = sievePoints[sievePoints.length - 1].percentPassing

  const hydro = [...h.rows]
    .filter((r) => r.diameter > 0)
    .sort((a, b) => b.diameter - a.diameter)
  const overlap = hydro.filter((r) => r.diameter >= joinSize)
  const below = hydro.filter((r) => r.diameter < joinSize)

  // ── The join check ──
  let joinMismatch: number | undefined
  let joinGap: number | undefined
  if (overlap.length) {
    const atJoin = interpolateFiner(hydro, joinSize)
    if (atJoin != null) {
      joinMismatch = atJoin - passingAtJoin
      if (Math.abs(joinMismatch) > 2) {
        notes.push(
          `At the ${joinSize} mm join the sieve says ${passingAtJoin.toFixed(1)}% passed and the suspension says ${atJoin.toFixed(1)}% is finer — a disagreement of ${joinMismatch.toFixed(1)} points on one specimen. The usual cause is the fraction of the whole sample the suspension represents; check it before reading anything off the fine end of this curve.`,
        )
      }
    }
    notes.push(
      `${overlap.length} sedimentation reading${overlap.length === 1 ? ' is' : 's are'} coarser than the ${joinSize} mm sieve and ${overlap.length === 1 ? 'was' : 'were'} dropped: the sieve weighed those grains directly, which beats inferring them from a settling velocity.`,
    )
  } else if (below.length) {
    joinGap = joinSize / below[0].diameter
    if (joinGap > 3) {
      notes.push(
        `Nothing was measured between ${joinSize} mm and ${below[0].diameter.toFixed(4)} mm — a factor of ${joinGap.toFixed(1)} in size. The curve is drawn across it, but an earlier first reading would measure that band instead of interpolating it.`,
      )
    }
  }

  if (below.length && below[0].percentFiner > passingAtJoin + 0.5) {
    notes.push(
      `The suspension reports ${below[0].percentFiner.toFixed(1)}% finer than ${below[0].diameter.toFixed(4)} mm, which is more than the ${passingAtJoin.toFixed(1)}% that passed the ${joinSize} mm sieve. A subset of the sample cannot be larger than the sample; the scaling to the whole specimen is wrong.`,
    )
  }

  const points: GradingPoint[] = [
    ...sievePoints,
    ...below.map((r) => ({ size: r.diameter, percentPassing: r.percentFiner, source: 'hydrometer' as const })),
  ]

  // ── Shape parameters, now off the whole curve ──
  const d10 = interpolateD(points, 10)
  const d30 = interpolateD(points, 30)
  const d60 = interpolateD(points, 60)
  const cu = d10 && d60 ? d60 / d10 : undefined
  const cc = d10 && d30 && d60 ? (d30 * d30) / (d10 * d60) : undefined

  // A D-value inside the unmeasured band is a reading of the interpolation, not
  // of the soil. Worth saying, since Cu and Cc are quoted to two figures.
  const inGap = (d?: number) =>
    d != null && below.length > 0 && d < joinSize && d > below[0].diameter
  const dAcrossGap = Boolean(joinGap && joinGap > 3 && [d10, d30, d60].some(inGap))
  if (dAcrossGap) {
    notes.push(
      'One of D₁₀, D₃₀ or D₆₀ falls inside the unmeasured band at the join, so Cu and Cc below are read off the interpolation rather than off a measurement.',
    )
  }

  if (g.d10 == null && d10 != null) {
    notes.push(
      `D₁₀ = ${d10.toFixed(4)} mm comes from the sedimentation run — the sieve curve alone stopped at ${passingAtJoin.toFixed(0)}% passing and could not reach it.`,
    )
  }

  // ── Size-based silt and clay ──
  const clay = passingOnCurve(points, CLAY_SIZE)
  const silt = clay != null ? Math.max(g.fines - clay, 0) : undefined
  if (clay == null) {
    notes.push(
      `The combined curve stops at ${points[points.length - 1].size.toFixed(4)} mm, above the 0.002 mm clay boundary, so the clay fraction is still unknown. A longer sedimentation run — the 24-hour reading — is what reaches it.`,
    )
  }

  return {
    ...base, combined: true, points,
    joinSize, joinMismatch, joinGap,
    d10, d30, d60, cu, cc, dAcrossGap,
    clay, silt,
    notes,
  }
}

/** Percent finer at a size on the sedimentation rows alone, log-interpolated. */
function interpolateFiner(
  rows: { diameter: number; percentFiner: number }[], size: number,
): number | undefined {
  const sorted = [...rows].sort((a, b) => b.diameter - a.diameter)
  for (let i = 1; i < sorted.length; i++) {
    const hi = sorted[i - 1], lo = sorted[i]
    if (size <= hi.diameter && size >= lo.diameter && hi.diameter > lo.diameter) {
      const f = (Math.log10(size) - Math.log10(lo.diameter)) / (Math.log10(hi.diameter) - Math.log10(lo.diameter))
      return lo.percentFiner + f * (hi.percentFiner - lo.percentFiner)
    }
  }
  return undefined
}

/**
 * Percent passing at a size on the combined curve — undefined off either end,
 * unlike `passingAt`, which clamps. Extrapolating past the finest reading is
 * how a clay fraction gets invented.
 */
export function passingOnCurve(points: SizePassing[], size: number): number | undefined {
  const sorted = [...points].sort((a, b) => b.size - a.size)
  const exact = sorted.find((r) => Math.abs(r.size - size) < 1e-12)
  if (exact) return exact.percentPassing
  for (let i = 1; i < sorted.length; i++) {
    const hi = sorted[i - 1], lo = sorted[i]
    if (size <= hi.size && size >= lo.size && hi.size > lo.size) {
      const f = (Math.log10(size) - Math.log10(lo.size)) / (Math.log10(hi.size) - Math.log10(lo.size))
      return lo.percentPassing + f * (hi.percentPassing - lo.percentPassing)
    }
  }
  return undefined
}

/**
 * Percent passing at a size, clamping off the ends — a size coarser than the
 * top sieve genuinely passes 100% of the sample, which is a fact rather than an
 * extrapolation.
 */
export function passingOrClamp(c: CombinedGrading, size: number): number {
  return passingAt(c.points, size)
}
