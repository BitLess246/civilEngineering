// ─────────────────────────────────────────────────────────────────────────
// Particle-size distribution from a sieve stack. Layer 8.
// ASTM D6913 (sieving) · ASTM D2487 (fractions, Cu, Cc).
//
// The stack is weighed dry, mass retained per sieve, and the cumulative
// passing curve follows. From it come the fractions that drive the USCS
// classifier — gravel, sand and fines — and the shape parameters Cu and Cc
// that separate well-graded from poorly graded material.
//
// D10, D30 and D60 ARE INTERPOLATED ON A LOG SCALE, which is the only thing
// that makes them meaningful: particle sizes span four orders of magnitude, so
// linear interpolation between 2 mm and 0.075 mm would put the midpoint at
// roughly 1 mm rather than the 0.39 mm a log scale gives. Every published
// grain-size curve is drawn on a log axis for the same reason.
//
// UNITS: sieve openings mm; masses g (any consistent unit — only ratios are
// used); percentages 0–100.
// ─────────────────────────────────────────────────────────────────────────

/** Standard sieve boundaries used by ASTM D2487, mm. */
export const SIEVE_75MM = 75      // gravel / cobble boundary
export const SIEVE_NO4 = 4.75     // gravel / sand boundary
export const SIEVE_NO200 = 0.075  // sand / fines boundary

/** One sieve in the stack. */
export interface SieveReading {
  /** Clear opening, mm. */
  size: number
  /** Designation as it prints on the test sheet, e.g. 'No. 40'. */
  designation?: string
  /** Mass retained on this sieve, g. */
  massRetained: number
}

export interface SieveInput {
  /** Total dry mass of the specimen before sieving, g. */
  totalMass: number
  readings: SieveReading[]
  /** Mass passing the finest sieve and caught in the pan, g. */
  panMass?: number
}

export interface SieveRow {
  size: number
  designation?: string
  massRetained: number
  percentRetained: number
  cumulativeRetained: number
  percentPassing: number
}

export interface GradationResult {
  rows: SieveRow[]
  /** Percent by mass coarser than 4.75 mm, %. */
  gravel: number
  /** Percent between 4.75 mm and 0.075 mm, %. */
  sand: number
  /** Percent finer than 0.075 mm, %. */
  fines: number
  /** Percent coarser than 75 mm — excluded from the D2487 classification. */
  cobbles: number
  /** Grain sizes at 10 / 30 / 60% passing, mm. Undefined when off the curve. */
  d10?: number
  d30?: number
  d60?: number
  /** D60/D10. Undefined when D10 is off the curve. */
  cu?: number
  /** D30²/(D10·D60). Undefined when any of the three is off the curve. */
  cc?: number
  /** Mass balance error, % of the total. */
  massError: number
  notes: string[]
}

/**
 * Grain size at a given percent passing, log-interpolated between the two
 * bracketing sieves. Undefined when the curve never reaches that percentage,
 * which is the honest answer: a soil with 15% fines has no D10 from sieving
 * alone and needs a hydrometer.
 */
export function interpolateD(rows: SieveRow[], percent: number): number | undefined {
  // Rows coarse → fine, so percentPassing decreases down the list.
  const sorted = [...rows].sort((a, b) => b.size - a.size)
  for (let i = 1; i < sorted.length; i++) {
    const hi = sorted[i - 1], lo = sorted[i]
    if (percent <= hi.percentPassing && percent >= lo.percentPassing) {
      const span = hi.percentPassing - lo.percentPassing
      if (span <= 1e-9) return lo.size
      const f = (percent - lo.percentPassing) / span
      // Log-linear: log D = log D_lo + f·(log D_hi − log D_lo)
      return Math.pow(10, Math.log10(lo.size) + f * (Math.log10(hi.size) - Math.log10(lo.size)))
    }
  }
  return undefined
}

/** Percent passing a given size, log-interpolated. Used for the D2487 fractions. */
export function passingAt(rows: SieveRow[], size: number): number {
  const sorted = [...rows].sort((a, b) => b.size - a.size)
  const exact = sorted.find((r) => Math.abs(r.size - size) < 1e-9)
  if (exact) return exact.percentPassing

  if (!sorted.length) return 0
  if (size >= sorted[0].size) return 100
  if (size <= sorted[sorted.length - 1].size) return sorted[sorted.length - 1].percentPassing

  for (let i = 1; i < sorted.length; i++) {
    const hi = sorted[i - 1], lo = sorted[i]
    if (size <= hi.size && size >= lo.size) {
      const f = (Math.log10(size) - Math.log10(lo.size)) / (Math.log10(hi.size) - Math.log10(lo.size))
      return lo.percentPassing + f * (hi.percentPassing - lo.percentPassing)
    }
  }
  return 0
}

export function gradation(i: SieveInput): GradationResult {
  const notes: string[] = []
  if (!(i.totalMass > 0)) throw new Error('Total specimen mass must be greater than zero.')

  const sorted = [...i.readings].sort((a, b) => b.size - a.size)
  const pan = i.panMass ?? 0

  const rows: SieveRow[] = []
  let cumulative = 0
  for (const r of sorted) {
    const percentRetained = (r.massRetained / i.totalMass) * 100
    cumulative += percentRetained
    rows.push({
      size: r.size,
      designation: r.designation,
      massRetained: r.massRetained,
      percentRetained,
      cumulativeRetained: cumulative,
      // Clamped at zero: a mass-balance error must not print a negative
      // percentage passing, which would be read as a data-entry mistake in the
      // wrong place. The error itself is reported separately.
      percentPassing: Math.max(100 - cumulative, 0),
    })
  }

  const accounted = sorted.reduce((s, r) => s + r.massRetained, 0) + pan
  const massError = ((accounted - i.totalMass) / i.totalMass) * 100
  if (Math.abs(massError) > 1) {
    notes.push(
      `Mass balance is off by ${massError.toFixed(1)}% — D6913 requires closure within 1%. Re-weigh before using this grading.`,
    )
  }

  const passing75 = passingAt(rows, SIEVE_75MM)
  const passing4 = passingAt(rows, SIEVE_NO4)
  const passing200 = passingAt(rows, SIEVE_NO200)

  const cobbles = 100 - passing75
  const gravel = passing75 - passing4
  const sand = passing4 - passing200
  const fines = passing200

  const d10 = interpolateD(rows, 10)
  const d30 = interpolateD(rows, 30)
  const d60 = interpolateD(rows, 60)

  const cu = d10 && d60 ? d60 / d10 : undefined
  const cc = d10 && d30 && d60 ? (d30 * d30) / (d10 * d60) : undefined

  if (d10 == null && fines > 10) {
    notes.push(
      `The curve does not reach 10% passing (${fines.toFixed(0)}% fines) — D₁₀, Cu and Cc need a hydrometer analysis to complete the grading.`,
    )
  }
  if (cobbles > 0) {
    notes.push(
      `${cobbles.toFixed(0)}% is coarser than 75 mm. D2487 classifies the minus-75 mm fraction and reports cobbles and boulders separately.`,
    )
  }

  return { rows, gravel, sand, fines, cobbles, d10, d30, d60, cu, cc, massError, notes }
}

/**
 * Gradation criteria of ASTM D2487 Table 1. A gravel is well graded when
 * Cu ≥ 4 and 1 ≤ Cc ≤ 3; a sand needs the stiffer Cu ≥ 6. Undefined when the
 * shape parameters could not be computed — "unknown" is not "poorly graded".
 */
export function isWellGraded(cu: number | undefined, cc: number | undefined, kind: 'gravel' | 'sand'): boolean | undefined {
  if (cu == null || cc == null) return undefined
  const cuLimit = kind === 'gravel' ? 4 : 6
  return cu >= cuLimit && cc >= 1 && cc <= 3
}
