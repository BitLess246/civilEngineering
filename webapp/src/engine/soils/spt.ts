// ─────────────────────────────────────────────────────────────────────────
// Standard Penetration Test corrections and correlations. Layer 8.
// ASTM D1586 · Skempton (1986) · Youd et al. (2001) NCEER.
//
// The raw SPT blow count is not a soil property. It is the response of one
// particular hammer, on one particular rig, through one particular length of
// rod, at one particular depth — and every one of those changes the number.
// N60 removes the equipment; (N1)60 additionally removes the overburden, so
// that two tests at 3 m and 15 m in the same sand can be compared.
//
// WHAT THIS MODULE WILL NOT DO:
//
//  • It will not correct a REFUSAL. A drive that stopped short of 450 mm gives
//    a blow count that is a lower bound, not a measurement, and multiplying a
//    lower bound by C_N produces a more precise-looking lower bound rather than
//    a better estimate. `sptCorrections` reports it and refuses the correlations.
//
//  • It will not apply a sand correlation to a clay. Every correlation here
//    carries the soil it was fitted to, and `correlate*` returns a warning
//    rather than a number when asked outside that range.
//
// Every correlated value comes back as a `SourcedValue` with
// `kind: 'correlated'`, its basis, its source AND its scatter — a correlation
// quoted bare reads exactly like a measurement, which is the misreading the
// whole module exists to prevent.
//
// UNITS: depth m; rod length m; borehole diameter mm; stress kPa; angles degrees.
// ─────────────────────────────────────────────────────────────────────────

import type { SptTest, HammerType, SamplerType } from './model'
import { fieldN, isRefusal } from './model'
import { correlated, type SourcedValue } from './provenance'

/** Atmospheric pressure used as the reference overburden, kPa. */
export const P_ATM = 100

/**
 * Hammer energy ratios, %. These are DEFAULTS, and weak ones: measured energy
 * ratios for nominally identical hammers span a wide band in practice, so a
 * measured E_R is worth far more than the correction it replaces.
 * Ranges after Skempton (1986) / NCEER.
 */
export const HAMMER_ENERGY: Record<HammerType, number> = {
  donut: 45,
  safety: 60,
  automatic: 80,
}

/** Borehole-diameter correction C_B (Skempton 1986). */
export function correctionCB(diameterMm: number | undefined): number {
  if (diameterMm == null) return 1.0
  if (diameterMm <= 115) return 1.0    // 65–115 mm
  if (diameterMm <= 150) return 1.05
  return 1.15                          // 200 mm
}

/**
 * Sampler correction C_S. A sampler built for a liner but used WITHOUT one
 * gives a lower blow count, so the correction is above 1.
 */
export function correctionCS(sampler: SamplerType | undefined): number {
  return sampler === 'liner-absent' ? 1.2 : 1.0
}

/** Rod-length correction C_R (Youd et al. 2001, Table 2). */
export function correctionCR(rodLengthM: number | undefined): number {
  if (rodLengthM == null) return 1.0
  if (rodLengthM < 3) return 0.75
  if (rodLengthM < 4) return 0.8
  if (rodLengthM < 6) return 0.85
  if (rodLengthM < 10) return 0.95
  return 1.0
}

/**
 * Overburden correction C_N = √(Pa/σ′v0), capped at 1.7 (Liao & Whitman 1986,
 * cap per Youd et al. 2001). Without the cap a shallow test would be inflated
 * without limit as σ′v0 → 0.
 */
export function correctionCN(effectiveStress: number): number {
  if (!(effectiveStress > 0)) return 1.7
  return Math.min(Math.sqrt(P_ATM / effectiveStress), 1.7)
}

export interface SptCorrectionInput {
  test: SptTest
  /** Hole diameter, mm. Falls back to the borehole's own value upstream. */
  boreholeDiameter?: number
  /** Effective vertical stress at the test depth, kPa. Needed for (N1)60. */
  effectiveStress?: number
}

export interface SptCorrections {
  /** Field N — second plus third increment. */
  N: number
  energyRatio: number
  /** True when E_R came from a measurement rather than a hammer-type default. */
  energyMeasured: boolean
  cb: number
  cs: number
  cr: number
  n60: number
  /** Overburden correction. Undefined without an effective stress. */
  cn?: number
  /** (N1)60. Undefined without an effective stress. */
  n160?: number
  /** The drive did not achieve full penetration — N is a lower bound. */
  refusal: boolean
  notes: string[]
}

export function sptCorrections(i: SptCorrectionInput): SptCorrections {
  const t = i.test
  const notes: string[] = []
  const N = fieldN(t)
  const refusal = isRefusal(t)

  const energyMeasured = t.energyRatio != null
  const energyRatio = t.energyRatio ?? HAMMER_ENERGY[t.hammer ?? 'safety']
  if (!energyMeasured) {
    notes.push(
      `Hammer energy taken as the ${t.hammer ?? 'safety'}-hammer default of ${energyRatio}%. Measured energy ratios vary widely between nominally identical rigs — a measured value is worth more than this correction.`,
    )
  }

  const cb = correctionCB(i.boreholeDiameter)
  const cs = correctionCS(t.sampler)
  const cr = correctionCR(t.rodLength)
  if (t.rodLength == null) {
    notes.push('No rod length recorded, so C_R is taken as 1.0. Shallow tests are over-estimated without it.')
  }

  const n60 = N * (energyRatio / 60) * cb * cs * cr

  let cn: number | undefined
  let n160: number | undefined
  if (i.effectiveStress != null) {
    cn = correctionCN(i.effectiveStress)
    n160 = cn * n60
    if (cn >= 1.7) {
      notes.push('The overburden correction is at its 1.7 cap — the test is shallow and (N₁)₆₀ is a capped estimate.')
    }
  }

  if (refusal) {
    notes.push(
      'The drive did not achieve full penetration. N is a LOWER BOUND, not a measurement: corrections make it look more precise without making it more accurate, and correlations must not be applied to it.',
    )
  }

  return { N, energyRatio, energyMeasured, cb, cs, cr, n60, cn, n160, refusal, notes }
}

// ── Correlations ──────────────────────────────────────────────────────────
// Each returns a SourcedValue tagged `correlated`, or a refusal explaining why
// it does not apply. Returning a bare number would strip exactly the context
// that stops a correlation being read as a measurement.

export type SoilKind = 'clean-sand' | 'silty-sand' | 'clay' | 'unknown'

export interface CorrelationOutput {
  value?: SourcedValue
  /** Present when the correlation was declined; says why. */
  declined?: string
}

/**
 * Effective friction angle from (N₁)₆₀ — Hatanaka & Uchida (1996):
 *   φ′ = √(20·(N₁)₆₀) + 20
 * Fitted to CLEAN SANDS, scatter roughly ±3°.
 */
export function correlatePhi(n160: number, soil: SoilKind, refusal = false): CorrelationOutput {
  if (refusal) return { declined: 'The blow count is a refusal lower bound; a friction angle from it would be meaningless.' }
  if (soil === 'clay') {
    return { declined: 'Hatanaka & Uchida is fitted to clean sands. A drained friction angle for clay needs a triaxial or direct shear test.' }
  }
  if (!(n160 >= 0)) return { declined: 'A negative or non-finite blow count cannot be correlated.' }

  const phi = Math.sqrt(20 * n160) + 20
  const note = soil === 'silty-sand'
    ? 'Applied to a silty sand — outside the clean-sand data the relation was fitted to.'
    : undefined
  return {
    value: correlated(phi, '°', {
      basis: `corrected SPT (N₁)₆₀ = ${n160.toFixed(0)}`,
      source: 'Hatanaka & Uchida (1996)',
      scatter: '±3°',
    }, note),
  }
}

/**
 * Relative density from (N₁)₆₀ — Skempton (1986):
 *   D_r = √((N₁)₆₀ / 60) × 100
 * Fitted to normally consolidated clean sand.
 */
export function correlateRelativeDensity(n160: number, soil: SoilKind, refusal = false): CorrelationOutput {
  if (refusal) return { declined: 'The blow count is a refusal lower bound.' }
  if (soil === 'clay') return { declined: 'Relative density is not defined for a cohesive soil.' }
  if (!(n160 >= 0)) return { declined: 'A negative or non-finite blow count cannot be correlated.' }

  const dr = Math.min(Math.sqrt(n160 / 60) * 100, 100)
  return {
    value: correlated(dr, '%', {
      basis: `corrected SPT (N₁)₆₀ = ${n160.toFixed(0)}`,
      source: 'Skempton (1986), normally consolidated clean sand',
      scatter: 'overconsolidated or aged deposits read high',
    }),
  }
}

/**
 * Undrained shear strength from N₆₀ — Stroud (1974): c_u ≈ f·N₆₀ with f
 * between about 4 and 6 kPa depending on plasticity. This is an
 * order-of-magnitude estimate, and SPT in soft clay is a poor test outright.
 */
export function correlateUndrainedStrength(
  n60: number, soil: SoilKind, plasticityIndex?: number, refusal = false,
): CorrelationOutput {
  if (refusal) return { declined: 'The blow count is a refusal lower bound.' }
  if (soil !== 'clay' && soil !== 'unknown') {
    return { declined: 'Undrained shear strength applies to cohesive soils; this layer is granular.' }
  }
  if (!(n60 >= 0)) return { declined: 'A negative or non-finite blow count cannot be correlated.' }

  // f rises with plasticity across Stroud's band; 6 kPa at PI ≈ 20–30.
  const f = plasticityIndex == null ? 5 : plasticityIndex < 20 ? 4.5 : plasticityIndex <= 30 ? 6 : 5
  const cu = f * n60
  return {
    value: correlated(cu, 'kPa', {
      basis: `N₆₀ = ${n60.toFixed(0)}${plasticityIndex != null ? `, PI = ${plasticityIndex.toFixed(0)}%` : ''}`,
      source: `Stroud (1974), f = ${f} kPa`,
      scatter: 'f ranges 4–6 kPa with plasticity; an order-of-magnitude estimate',
    }, n60 < 5 ? 'SPT is a poor test in soft clay — prefer a vane, UCS or triaxial where one exists.' : undefined),
  }
}

/** Descriptive density of a granular soil from N₆₀ (Terzaghi & Peck). */
export function densityFromN60(n60: number): string {
  if (n60 < 4) return 'very loose'
  if (n60 < 10) return 'loose'
  if (n60 < 30) return 'medium dense'
  if (n60 < 50) return 'dense'
  return 'very dense'
}

/** Descriptive consistency of a cohesive soil from N₆₀ (Terzaghi & Peck). */
export function consistencyFromN60(n60: number): string {
  if (n60 < 2) return 'very soft'
  if (n60 < 4) return 'soft'
  if (n60 < 8) return 'firm'
  if (n60 < 15) return 'stiff'
  if (n60 < 30) return 'very stiff'
  return 'hard'
}
