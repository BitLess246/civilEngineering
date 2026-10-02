// ─────────────────────────────────────────────────────────────────────────
// TRAFFIC VOLUME STUDIES — the counting vocabulary of traffic engineering.
//
//   PHF (peak-hour factor) = hourly volume / (4 × peak-15-min volume)
//       how evenly the peak hour is loaded; 1.0 = perfectly uniform.
//   Flow rate  = hourly volume / PHF  — the demand the design must clear.
//   DHV  = ADT × K   (K = share of daily traffic in the 30th-highest hour)
//   DDHV = ADT × K × D (D = directional split) — the number directional
//       design actually sizes for.
//   AADT projection: AADT_t = AADT₀ · (1 + g)ⁿ — compound growth from the
//       base year to the design year.
//   Design year either by year (calendar) or by n years from today's count.
// ─────────────────────────────────────────────────────────────────────────

export interface PeakHourInput {
  /** Total vehicles counted in the peak hour (veh/h). */
  hourly: number
  /** Vehicles in the busiest 15 minutes (veh). */
  peak15: number
}

export interface DesignVolumeInput {
  /** Average annual daily traffic, both directions (veh/day). */
  adt: number
  /** K factor — fraction of ADT occurring in the design hour (0–1). */
  k: number
  /** D factor — peak-direction share of the design-hour volume (0.5–1). */
  d: number
}

export interface GrowthInput {
  /** Base-year AADT (veh/day). */
  aadt0: number
  /** Annual growth rate as a percent (e.g. 3 for 3 %/yr). */
  growthPct: number
  /** Years from the base year to the design year. */
  years: number
}

export interface TrafficVolumeResult {
  /** PHF and the peak-15 flow rate (veh/h). */
  phf: number
  flowRate: number
  /** Design-hour volumes (veh/h). */
  dhv: number
  ddhv: number
  /** Projected AADT (veh/day). */
  aadtDesign: number
  /** Consistency notes the engine attaches when inputs look off. */
  warnings: string[]
}

/** One call covers the whole page: every sub-calculation is cheap and the
 *  page lays the pieces out as sections of one study. */
export function trafficVolumes(
  peak: PeakHourInput,
  design: DesignVolumeInput,
  growth: GrowthInput,
): TrafficVolumeResult {
  const warnings: string[] = []

  if (!(peak.hourly > 0)) throw new Error('Peak-hour volume must be positive.')
  if (!(peak.peak15 > 0)) throw new Error('Peak-15-minute volume must be positive.')
  const phf = peak.hourly / (4 * peak.peak15)
  if (phf > 1.0001) warnings.push('PHF > 1.00 — the peak-15 count exceeds the hourly total; check the counts.')
  const flowRate = peak.hourly / Math.max(phf, 1e-9)

  if (!(design.adt > 0)) throw new Error('AADT must be positive.')
  if (design.k <= 0 || design.k >= 1) throw new Error('K must be between 0 and 1.')
  if (design.d < 0.5 || design.d > 1) throw new Error('D must be between 0.5 and 1.')
  const dhv = design.adt * design.k
  const ddhv = dhv * design.d

  if (!(growth.aadt0 > 0)) throw new Error('Base AADT must be positive.')
  if (growth.years < 0) throw new Error('Projection years cannot be negative.')
  if (growth.growthPct <= -100) throw new Error('Growth rate cannot be ≤ −100 %.')
  const g = growth.growthPct / 100
  const aadtDesign = growth.aadt0 * Math.pow(1 + g, growth.years)

  // Typical ranges from the planning literature — advisory only.
  if (design.k < 0.08 || design.k > 0.13) warnings.push(`K = ${design.k.toFixed(3)} sits outside the usual 0.08–0.13 planning range.`)
  if (design.d < 0.52 || design.d > 0.68) warnings.push(`D = ${design.d.toFixed(2)} sits outside the usual 0.52–0.68 planning range.`)

  return { phf, flowRate, dhv, ddhv, aadtDesign, warnings }
}
