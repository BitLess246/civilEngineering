// ─────────────────────────────────────────────────────────────────────────
// CONCRETE MIX DESIGN — ACI 211.1 absolute-volume method, the classroom
// and board-exam procedure:
//
//   1. w/c from the target mean strength (Table 6.3.4(a))
//   2. mixing water from slump and maximum aggregate size (Table 6.3.3),
//      with the matching entrapped / entrained air content
//   3. cement = water / (w/c)
//   4. coarse aggregate = bulk volume (Table 6.3.6, by FM) × DRUW
//   5. fine aggregate fills the remaining absolute volume
//   6. moisture corrections convert oven-dry batch weights to wet stock
//
// The ACI tables are reproduced as the printed review-textbook values
// (psi-based strength axis); intermediate points interpolate linearly,
// which reproduces the metric table exactly at its printed rows.
// ─────────────────────────────────────────────────────────────────────────

export const SG_CEMENT = 3.15

export type SlumpBand = '25-50' | '75-100' | '125-150'
export type Exposure = 'mild' | 'moderate' | 'severe'
export type MaxAgg = 9.5 | 12.5 | 19 | 25 | 37.5 | 50 | 75 | 150

/** Table 6.3.4(a) — 28-day compressive strength (psi) → w/c. */
const WC_PSI: { psi: number; nonAE: number; ae: number | null }[] = [
  { psi: 6000, nonAE: 0.41, ae: null },
  { psi: 5000, nonAE: 0.48, ae: 0.40 },
  { psi: 4000, nonAE: 0.57, ae: 0.48 },
  { psi: 3000, nonAE: 0.68, ae: 0.59 },
  { psi: 2000, nonAE: 0.82, ae: 0.74 },
]

const PSI_PER_MPA = 145.0377 // = 1/0.00689476

/** w/c for a target mean strength (MPa); linear interpolation on the psi axis,
 *  clamped at the table edges (beyond the table, trial batches govern). */
export function wcFromStrength(fcrMPa: number, airEntrained: boolean): number {
  const psi = fcrMPa * PSI_PER_MPA
  // the air-entrained column has no 6000-psi entry — drop that row for AE
  const rows = (airEntrained
    ? WC_PSI.filter((r) => r.ae !== null).map((r) => ({ psi: r.psi, wc: r.ae as number }))
    : WC_PSI.map((r) => ({ psi: r.psi, wc: r.nonAE })))
  if (psi >= rows[0].psi) return rows[0].wc
  const last = rows[rows.length - 1]
  if (psi <= last.psi) return last.wc
  for (let i = 1; i < rows.length; i++) {
    const hi = rows[i - 1], lo = rows[i]
    if (psi <= hi.psi && psi >= lo.psi) {
      const t = (psi - lo.psi) / (hi.psi - lo.psi)
      return lo.wc + t * (hi.wc - lo.wc)
    }
  }
  return last.wc
}

/** Table 6.3.3 — approximate mixing water (kg/m³) per max size, slump band, AE. */
const WATER: Record<MaxAgg, Record<SlumpBand, [number, number]>> = {
  9.5:   { '25-50': [207, 181], '75-100': [228, 202], '125-150': [243, 216] },
  12.5:  { '25-50': [199, 175], '75-100': [216, 193], '125-150': [228, 205] },
  19:    { '25-50': [190, 168], '75-100': [205, 184], '125-150': [216, 197] },
  25:    { '25-50': [179, 160], '75-100': [193, 175], '125-150': [202, 184] },
  37.5:  { '25-50': [166, 150], '75-100': [181, 165], '125-150': [190, 174] },
  50:    { '25-50': [154, 142], '75-100': [169, 157], '125-150': [178, 165] },
  75:    { '25-50': [130, 122], '75-100': [145, 133], '125-150': [160, 143] },
  150:   { '25-50': [113, 107], '75-100': [124, 118], '125-150': [0, 0] },
}

/** Entrapped air (%) by maximum aggregate size, non-air-entrained mixes. */
const ENTRAPPED_AIR: Record<MaxAgg, number> = {
  9.5: 3.0, 12.5: 2.5, 19: 2.0, 25: 1.5, 37.5: 1.0, 50: 0.5, 75: 0.3, 150: 0.2,
}

/** Recommended total air (%) for frost resistance, moderate / severe exposure. */
const AE_AIR: Record<MaxAgg, { moderate: number; severe: number }> = {
  9.5: { moderate: 6.0, severe: 7.5 },
  12.5: { moderate: 5.5, severe: 7.0 },
  19: { moderate: 5.0, severe: 6.0 },
  25: { moderate: 4.5, severe: 6.0 },
  37.5: { moderate: 4.5, severe: 5.5 },
  50: { moderate: 4.0, severe: 5.0 },
  75: { moderate: 3.5, severe: 4.5 },
  150: { moderate: 3.0, severe: 4.0 },
}

/** Table 6.3.6 — volume of dry-rodded coarse aggregate per unit volume of
 *  concrete, by maximum size and fineness modulus of the fine aggregate. */
const CA_BULK: Record<MaxAgg, [fm240: number, fm260: number, fm280: number, fm300: number]> = {
  9.5: [0.50, 0.48, 0.46, 0.44],
  12.5: [0.59, 0.57, 0.55, 0.53],
  19: [0.66, 0.64, 0.62, 0.60],
  25: [0.71, 0.69, 0.67, 0.65],
  37.5: [0.75, 0.73, 0.71, 0.69],
  50: [0.78, 0.76, 0.74, 0.72],
  75: [0.82, 0.80, 0.78, 0.76],
  150: [0.87, 0.85, 0.83, 0.81],
}

/** Table 6.3.7.1 — first estimate of fresh concrete density (kg/m³). */
const DENSITY: Record<MaxAgg, { nonAE: number; ae: number }> = {
  9.5: { nonAE: 2285, ae: 2190 },
  12.5: { nonAE: 2310, ae: 2235 },
  19: { nonAE: 2345, ae: 2275 },
  25: { nonAE: 2370, ae: 2290 },
  37.5: { nonAE: 2400, ae: 2320 },
  50: { nonAE: 2415, ae: 2345 },
  75: { nonAE: 2445, ae: 2370 },
  150: { nonAE: 2465, ae: 2390 },
}

/** Interpolate a CA bulk volume row on FM (2.40 → 3.00). */
export function caBulkVolume(maxAgg: MaxAgg, FM: number): number {
  const row = CA_BULK[maxAgg]
  const fms = [2.4, 2.6, 2.8, 3.0]
  const fm = Math.min(3.0, Math.max(2.4, FM))
  for (let i = 1; i < fms.length; i++) {
    if (fm <= fms[i]) {
      const t = (fm - fms[i - 1]) / (fms[i] - fms[i - 1])
      return row[i - 1] + t * (row[i] - row[i - 1])
    }
  }
  return row[3]
}

export interface MixInput {
  /** Target mean (design) strength f'cr, MPa — above f'c to cover variability. */
  fcrMPa: number
  slumpBand: SlumpBand
  maxAgg: MaxAgg
  exposure: Exposure
  /** Fineness modulus of the fine aggregate. */
  FM: number
  /** Dry-rodded unit weight of coarse aggregate (kg/m³). */
  druwc: number
  /** Specific gravities (SSD basis). */
  sgCA: number
  sgFA: number
  /** Moisture: stock moisture and absorption, fractions (0.012 = 1.2%). */
  mcCA: number
  absCA: number
  mcFA: number
  absFA: number
  /** Batch size (m³). */
  volume: number
}

export interface MixResult {
  airEntrained: boolean
  /** Total air content used (%). */
  airPct: number
  /** Table w/c and the strength it came from. */
  wc: number
  /** Mixing water, oven-dry batch basis (kg per m³). */
  water: number
  /** Cement content (kg per m³). */
  cement: number
  /** Coarse aggregate bulk volume and oven-dry mass (kg per m³). */
  caBulk: number
  caDry: number
  /** Fine aggregate oven-dry mass (kg per m³). */
  faDry: number
  /** Absolute volumes occupied (m³ per m³ of concrete). */
  vCement: number
  vWater: number
  vAir: number
  vCA: number
  vFA: number
  /** Computed fresh density of the dry-batch mix (kg/m³) + ACI first estimate. */
  freshDensity: number
  densityEstimate: number
  /** Wet stockpile batch weights per m³ (kg). */
  batchCA: number
  batchFA: number
  /** Mixing water to add at the plant per m³ (kg) after moisture corrections. */
  batchWater: number
  /** Free-water correction carried by the aggregates (kg). */
  freeWater: number
  /** Per total batch volume. */
  totals: { cement: number; water: number; ca: number; fa: number; bags40: number }
  warnings: string[]
}

/** The full ACI 211.1 absolute-volume design. */
export function designMix(input: MixInput): MixResult {
  const {
    fcrMPa, slumpBand, maxAgg, exposure, FM, druwc,
    sgCA, sgFA, mcCA, absCA, mcFA, absFA,
  } = input
  if (!(fcrMPa >= 14 && fcrMPa <= 45)) throw new Error('Target mean strength must sit between 14 and 45 MPa — outside that the ACI strength table no longer applies.')
  if (!(FM >= 2.3 && FM <= 3.1)) throw new Error('Fineness modulus must sit between 2.3 and 3.1 (the ACI table covers 2.40–3.00).')
  if (!(druwc > 1200 && druwc < 1800)) throw new Error('Dry-rodded unit weight of the coarse aggregate must be 1200–1800 kg/m³.')
  if (!(sgCA > 2.0 && sgCA < 3.2) || !(sgFA > 2.0 && sgFA < 3.2)) throw new Error('Specific gravities must sit between 2.0 and 3.2.')
  if (!(input.volume > 0)) throw new Error('Batch volume must be positive.')

  const warnings: string[] = []
  const airEntrained = exposure !== 'mild'
  const airPct = airEntrained ? AE_AIR[maxAgg][exposure] : ENTRAPPED_AIR[maxAgg]

  const wc = wcFromStrength(fcrMPa, airEntrained)
  const psiTop = airEntrained ? 34.5 : 41.4
  if (fcrMPa > psiTop) warnings.push(`f'cr ${fcrMPa.toFixed(1)} MPa sits beyond the ${psiTop} MPa table edge — w/c clamped at ${wc.toFixed(2)}; a trial batch must govern above the table.`)
  const [waterNonAE, waterAE] = WATER[maxAgg][slumpBand]
  if (waterNonAE === 0) throw new Error(`The ACI water table has no ${slumpBand} mm slump column for ${maxAgg} mm aggregate — pick a smaller slump band.`)
  const water = airEntrained ? waterAE : waterNonAE
  const cement = water / wc

  const caBulk = caBulkVolume(maxAgg, FM)
  const caDry = caBulk * druwc

  // absolute volumes (m³ per m³ concrete)
  const vCement = cement / (SG_CEMENT * 1000)
  const vWater = water / 1000
  const vAir = airPct / 100
  const vCA = caDry / (sgCA * 1000)
  const vFA = 1 - vCement - vWater - vAir - vCA
  if (vFA <= 0.05) warnings.push(`Fine aggregate volume resolves to ${vFA.toFixed(3)} m³ — the inputs leave an unusual sand fraction; check SG and DRUW.`)
  const faDry = vFA * sgFA * 1000

  const freshDensity = cement + water + caDry + faDry
  const densityEstimate = airEntrained ? DENSITY[maxAgg].ae : DENSITY[maxAgg].nonAE
  if (Math.abs(freshDensity - densityEstimate) / densityEstimate > 0.04) {
    warnings.push(`Computed fresh density ${freshDensity.toFixed(0)} kg/m³ drifts ${(100 * Math.abs(freshDensity - densityEstimate) / densityEstimate).toFixed(1)}% from the ACI first estimate ${densityEstimate} kg/m³ — plausible but worth a unit-weight check on trial batch 1.`)
  }

  // moisture corrections: oven-dry → wet stockpile
  const batchCA = caDry * (1 + mcCA)
  const batchFA = faDry * (1 + mcFA)
  const freeWater = caDry * (mcCA - absCA) + faDry * (mcFA - absFA)
  const batchWater = water - freeWater

  if (exposure === 'severe') warnings.push('Severe exposure: also cap w/c per ACI 318 exposure classes (e.g. 0.45 for freezing-and-thawing with deicers) if that governs over the strength table.')
  if (airEntrained) warnings.push(`Air-entrained mix: total air target ${airPct.toFixed(1)}% — verify with the air meter on every batch.`)

  const vol = input.volume
  return {
    airEntrained, airPct, wc, water, cement, caBulk, caDry, faDry,
    vCement, vWater, vAir, vCA, vFA,
    freshDensity, densityEstimate,
    batchCA, batchFA, batchWater, freeWater,
    totals: {
      cement: cement * vol,
      water: batchWater * vol,
      ca: batchCA * vol,
      fa: batchFA * vol,
      bags40: Math.ceil(cement * vol / 40),
    },
    warnings,
  }
}
