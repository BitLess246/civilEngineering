// ─────────────────────────────────────────────────────────────────────────
// Liquefaction triggering — the NCEER simplified procedure. Layer 8.
//
// Youd, T.L. et al. (2001), "Liquefaction Resistance of Soils: Summary Report
// from the 1996 NCEER and 1998 NCEER/NSF Workshops on Evaluation of
// Liquefaction Resistance of Soils", J. Geotech. Geoenviron. Eng. 127(10),
// after Seed & Idriss (1971).
//
// The demand (CSR) and the capacity (CRR) are both expressed as cyclic stress
// ratios and divided:
//
//     CSR  = 0.65 (a_max/g)(σ_v0/σ′_v0) r_d
//     CRR  = CRR_7.5 · MSF · K_σ · K_α
//     FS   = CRR / CSR
//
// WHAT THIS DOES NOT DO, stated up front because the number it returns is easy
// to over-read:
//
//  • FS is a TRIGGERING factor of safety. It says whether excess pore pressure
//    is expected to reach initial liquefaction — not how much the ground
//    settles, not whether a footing on it survives, and not whether the slope
//    above it moves. Post-liquefaction settlement and lateral spread are
//    separate analyses.
//  • It applies to SATURATED COHESIONLESS soils. Above the water table there is
//    no liquefaction to trigger, and for clays this method is simply the wrong
//    one — Bray & Sancio (2006) and Boulanger & Idriss (2006) govern there.
//    Both cases are reported as not-applicable rather than given a number.
//  • The simplified procedure is a screening method calibrated against case
//    histories of level ground, shallow depth and M≈7.5. Outside that envelope
//    it flags rather than silently extrapolates.
//
// UNITS: depth m; stress kPa; a_max in g; magnitude is moment magnitude M_w.
// ─────────────────────────────────────────────────────────────────────────

import type { Borehole } from './model'
import { layerThickness, soilFamily, isCohesive } from './model'
import { P_ATM } from './spt'
import { verticalStress, type StressLayer } from './overburden'
import { sptCorrections } from './spt'
import type { LayerUnitWeight } from './sptProfile'

/**
 * Stress reduction coefficient r_d (Youd et al. eq. 3, after Liao & Whitman
 * 1986) — the flexibility of the soil column, which makes the real shear stress
 * at depth smaller than the rigid-body value.
 */
export function stressReduction(depth: number): number {
  if (depth < 0) throw new Error('Depth must not be negative.')
  if (depth <= 9.15) return 1.0 - 0.00765 * depth
  if (depth <= 23) return 1.174 - 0.0267 * depth
  if (depth <= 30) return 0.744 - 0.008 * depth
  return 0.5
}

/** Cyclic stress ratio — the earthquake DEMAND (Youd et al. eq. 2). */
export function cyclicStressRatio(
  amax: number, totalStress: number, effectiveStress: number, depth: number,
): number {
  if (!(effectiveStress > 0)) throw new Error("Effective stress must be greater than zero.")
  return 0.65 * amax * (totalStress / effectiveStress) * stressReduction(depth)
}

/**
 * Fines correction to an equivalent clean-sand blow count (Youd et al.
 * eqs. 6a–7c). Fines raise the apparent resistance, so the same (N₁)₆₀ in a
 * silty sand represents a looser, weaker soil than in a clean sand.
 */
export function finesCorrection(n160: number, finesContent: number): {
  alpha: number; beta: number; n160cs: number
} {
  const fc = Math.max(0, finesContent)
  const alpha = fc <= 5 ? 0
    : fc >= 35 ? 5.0
    : Math.exp(1.76 - 190 / (fc * fc))
  const beta = fc <= 5 ? 1.0
    : fc >= 35 ? 1.2
    : 0.99 + Math.pow(fc, 1.5) / 1000
  return { alpha, beta, n160cs: alpha + beta * n160 }
}

/**
 * (N₁)₆₀cs above which a clean granular soil is taken as too dense to liquefy.
 * The base curve is asymptotic here and the Rauch approximation diverges past
 * it, so this is a limit of the METHOD, not a soil property.
 */
export const DENSE_LIMIT = 30

/**
 * Clean-sand cyclic resistance ratio at M 7.5 (Youd et al. eq. 4, Rauch's
 * approximation of the Seed et al. base curve).
 *
 * Returns undefined at (N₁)₆₀cs ≥ 30, where the curve no longer applies —
 * evaluating the expression there returns a number, and that number is
 * meaningless (it turns negative above 34).
 */
export function crr75(n160cs: number): number | undefined {
  if (n160cs >= DENSE_LIMIT) return undefined
  const n = Math.max(0, n160cs)
  return 1 / (34 - n) + n / 135 + 50 / Math.pow(10 * n + 45, 2) - 1 / 200
}

/**
 * Magnitude scaling factor (Idriss, the NCEER-recommended lower bound —
 * Youd et al. Table 3). The base curve is for M 7.5; a smaller event applies
 * fewer cycles and the soil resists more.
 */
export function magnitudeScalingFactor(magnitude: number): number {
  if (!(magnitude > 0)) throw new Error('Magnitude must be greater than zero.')
  return Math.pow(10, 2.24) / Math.pow(magnitude, 2.56)
}

/**
 * Overburden correction K_σ (Youd et al. eq. 31), CAPPED AT 1.0.
 *
 * The relation was developed from tests above 100 kPa; applying it at shallower
 * depths returns a value above one, which would credit the soil with resistance
 * the case histories do not support. Youd et al. state K_σ should not be taken
 * greater than 1.
 */
export function overburdenFactor(effectiveStress: number, relativeDensity?: number): number {
  if (!(effectiveStress > 0)) throw new Error('Effective stress must be greater than zero.')
  // f = 0.8 at Dr ≈ 40%, falling to 0.6 at Dr ≈ 80% (Youd et al. §K_σ).
  const f = relativeDensity == null ? 0.7
    : relativeDensity <= 40 ? 0.8
    : relativeDensity >= 80 ? 0.6
    : 0.8 - (0.2 * (relativeDensity - 40)) / 40
  return Math.min(1, Math.pow(effectiveStress / P_ATM, f - 1))
}

export interface LiquefactionInput {
  depth: number
  /** Total and effective vertical stress at the depth, kPa. */
  totalStress: number
  effectiveStress: number
  /** Overburden-corrected blow count. */
  n160: number
  /** Fines passing the 0.075 mm sieve, %. */
  finesContent?: number
  /** Peak ground acceleration at the surface, in g. */
  amax: number
  /** Moment magnitude of the design event. */
  magnitude: number
  relativeDensity?: number
  /** Sloping-ground correction. Left at 1.0 unless a specialist sets it. */
  ka?: number
  /** The blow count came from a drive that hit refusal — a lower bound. */
  refusal?: boolean
}

export interface LiquefactionResult {
  depth: number
  rd: number
  csr: number
  alpha: number
  beta: number
  n160cs: number
  /** Undefined where the soil is denser than the base curve covers. */
  crr75?: number
  msf: number
  ksigma: number
  ka: number
  /** CRR at the design magnitude and overburden. Undefined with crr75. */
  crr?: number
  /** FS = CRR/CSR. Undefined when the soil is too dense for the curve. */
  factorOfSafety?: number
  /** True only when FS < 1 was actually computed. */
  liquefiable: boolean
  notes: string[]
}

/** One triggering check at one depth. */
export function liquefactionCheck(i: LiquefactionInput): LiquefactionResult {
  const notes: string[] = []

  const rd = stressReduction(i.depth)
  const csr = cyclicStressRatio(i.amax, i.totalStress, i.effectiveStress, i.depth)

  const fines = i.finesContent
  if (fines == null) {
    notes.push(
      'No fines content for this layer, so the blow count is treated as CLEAN SAND. A silty sand at the same (N₁)₆₀ is weaker — run a sieve on the sample rather than accepting this.',
    )
  }
  const { alpha, beta, n160cs } = finesCorrection(i.n160, fines ?? 0)

  const base = crr75(n160cs)
  const msf = magnitudeScalingFactor(i.magnitude)
  const ksigma = overburdenFactor(i.effectiveStress, i.relativeDensity)
  const ka = i.ka ?? 1

  if (i.refusal) {
    notes.push(
      'This blow count came from a drive that hit refusal. It is a LOWER BOUND, so the resistance — and the factor of safety with it — is a lower bound too.',
    )
  }
  if (i.depth > 23) {
    notes.push(
      `At ${i.depth.toFixed(1)} m the simplified procedure is outside the depth range its case histories cover (r_d is poorly constrained below 23 m). A site-response analysis is the defensible way to get CSR here.`,
    )
  }
  if (i.magnitude < 5.5 || i.magnitude > 8.5) {
    notes.push(`MSF is extrapolated at M ${i.magnitude.toFixed(1)} — the scaling relation is calibrated over roughly M 5.5–8.5.`)
  }
  if (i.ka != null && i.ka !== 1) {
    notes.push(
      'A sloping-ground factor K_α has been applied. The NCEER workshop recommends K_α be used only by specialists — it changes the answer substantially and is poorly constrained.',
    )
  }

  if (base == null) {
    notes.push(
      `(N₁)₆₀cs = ${n160cs.toFixed(1)} ≥ ${DENSE_LIMIT}: too dense for the base curve, which is taken as non-liquefiable. This is a limit of the METHOD — no factor of safety is reported rather than one invented past the end of the curve.`,
    )
    return {
      depth: i.depth, rd, csr, alpha, beta, n160cs,
      msf, ksigma, ka, liquefiable: false, notes,
    }
  }

  const crr = base * msf * ksigma * ka
  const factorOfSafety = crr / csr
  if (factorOfSafety < 1.3 && factorOfSafety >= 1) {
    notes.push('FS is below the 1.3 commonly required for a design margin, though above 1.')
  }

  return {
    depth: i.depth, rd, csr, alpha, beta, n160cs,
    crr75: base, msf, ksigma, ka, crr, factorOfSafety,
    liquefiable: factorOfSafety < 1, notes,
  }
}

// ── Whole-borehole profile ────────────────────────────────────────────────

/** Why a test was not evaluated. Absent from the FS profile, not zeroed. */
export type SkipReason = 'above-water-table' | 'cohesive' | 'no-stress' | 'no-blow-count'

export const SKIP_LABEL: Record<SkipReason, string> = {
  'above-water-table': 'above the water table — not saturated, so nothing to liquefy',
  cohesive: 'cohesive soil — this method does not apply (Bray & Sancio 2006 governs)',
  'no-stress': 'no effective stress — a layer above it has no unit weight',
  'no-blow-count': 'no usable (N₁)₆₀ at this depth',
}

export interface LiquefactionRow {
  testId: string
  depth: number
  layerId?: string
  layerName?: string
  result?: LiquefactionResult
  skipped?: SkipReason
}

export interface LiquefactionProfileInput {
  amax: number
  magnitude: number
  /** Fines content per layer id, %. Layers absent from this are clean sand. */
  finesContent?: Record<string, number>
  relativeDensity?: Record<string, number>
  ka?: number
}

export interface LiquefactionProfile {
  rows: LiquefactionRow[]
  /** Iwasaki liquefaction potential index over the top 20 m. */
  lpi: number
  lpiCategory: 'none' | 'low' | 'high' | 'very-high'
  /** Depth range over which FS < 1, m. Empty when nothing triggers. */
  liquefiableDepths: { top: number; bottom: number }[]
  notes: string[]
}

/**
 * Iwasaki et al. (1978) liquefaction potential index.
 *
 *     LPI = ∫₀²⁰ F(z) w(z) dz,  F = 1 − FS (FS<1, else 0),  w = 10 − 0.5z
 *
 * A single number for the WHOLE profile, which is its use and its danger: a
 * thin very-loose seam and a thick marginal one can share an LPI while
 * behaving nothing alike, so it never replaces reading the FS profile.
 */
export function liquefactionPotentialIndex(
  rows: { depth: number; factorOfSafety?: number }[],
): number {
  const pts = rows
    .filter((r) => r.depth <= 20 && r.factorOfSafety != null)
    .sort((a, b) => a.depth - b.depth)
  if (!pts.length) return 0

  // Each test represents the band midway to its neighbours.
  let lpi = 0
  for (let k = 0; k < pts.length; k++) {
    const top = k === 0 ? 0 : (pts[k - 1].depth + pts[k].depth) / 2
    const bottom = k === pts.length - 1
      ? Math.min(20, pts[k].depth + (pts[k].depth - top))
      : (pts[k].depth + pts[k + 1].depth) / 2
    const z = pts[k].depth
    const f = Math.max(0, 1 - pts[k].factorOfSafety!)
    const w = Math.max(0, 10 - 0.5 * z)
    lpi += f * w * Math.max(0, Math.min(20, bottom) - top)
  }
  return lpi
}

const lpiCategory = (lpi: number): LiquefactionProfile['lpiCategory'] =>
  lpi <= 0 ? 'none' : lpi < 5 ? 'low' : lpi <= 15 ? 'high' : 'very-high'

/**
 * Run the triggering check down a whole hole.
 *
 * Unit weights come in explicitly, as everywhere else in this module: they are
 * an interpretation, and σ′v0 sits under both the demand and the capacity.
 */
export function liquefactionProfile(
  bh: Borehole,
  unitWeights: Record<string, LayerUnitWeight>,
  input: LiquefactionProfileInput,
): LiquefactionProfile {
  const notes: string[] = []
  const water = bh.groundwaterDepth

  if (water == null) {
    notes.push(
      'No groundwater depth recorded. Liquefaction requires saturation, so with the hole treated as dry NOTHING is evaluated — record the water table before reading anything into that.',
    )
  }

  const ordered = [...bh.layers].sort((a, b) => a.depthTop - b.depthTop)
  const stressLayers: StressLayer[] = []
  let knownTo = 0
  for (const l of ordered) {
    const uw = unitWeights[l.id]
    if (uw == null) break
    stressLayers.push({ thickness: layerThickness(l), gamma: uw.gamma, gammaSat: uw.gammaSat })
    knownTo = l.depthBottom
  }

  const rows: LiquefactionRow[] = [...bh.spt]
    .sort((a, b) => a.depth - b.depth)
    .map((t) => {
      const layer = ordered.find((l) => t.depth >= l.depthTop && t.depth < l.depthBottom)
      const base = { testId: t.id, depth: t.depth, layerId: layer?.id, layerName: layer?.name }

      if (water == null || t.depth < water) return { ...base, skipped: 'above-water-table' as const }
      if (layer && isCohesive(soilFamily(layer.symbol, layer.name))) {
        return { ...base, skipped: 'cohesive' as const }
      }
      if (t.depth > knownTo + 1e-9) return { ...base, skipped: 'no-stress' as const }

      const s = verticalStress(stressLayers, t.depth, water)
      const c = sptCorrections({ test: t, boreholeDiameter: bh.diameter, effectiveStress: s.effective })
      if (c.n160 == null) return { ...base, skipped: 'no-blow-count' as const }

      return {
        ...base,
        result: liquefactionCheck({
          depth: t.depth,
          totalStress: s.total,
          effectiveStress: s.effective,
          n160: c.n160,
          finesContent: layer ? input.finesContent?.[layer.id] : undefined,
          relativeDensity: layer ? input.relativeDensity?.[layer.id] : undefined,
          amax: input.amax,
          magnitude: input.magnitude,
          ka: input.ka,
          refusal: c.refusal,
        }),
      }
    })

  const evaluated = rows.filter((r) => r.result).map((r) => r.result!)
  const lpi = liquefactionPotentialIndex(evaluated)

  // Contiguous runs of FS < 1, reported as depth bands rather than test points.
  const liquefiableDepths: { top: number; bottom: number }[] = []
  for (const r of rows) {
    if (!r.result?.liquefiable) continue
    const last = liquefiableDepths[liquefiableDepths.length - 1]
    if (last && r.depth - last.bottom <= 3.0) last.bottom = r.depth
    else liquefiableDepths.push({ top: r.depth, bottom: r.depth })
  }

  const cohesive = rows.filter((r) => r.skipped === 'cohesive').length
  if (cohesive) {
    notes.push(
      `${cohesive} test${cohesive > 1 ? 's fall' : ' falls'} in cohesive soil and ${cohesive > 1 ? 'were' : 'was'} not evaluated. Fine-grained soils can still soften cyclically — that is a different check, not an absent one.`,
    )
  }
  if (!evaluated.length) {
    notes.push('No test in this hole met the conditions for a triggering check, so the profile is empty rather than clear.')
  }
  if (evaluated.length && rows.some((r) => r.depth > 20 && r.result)) {
    notes.push('LPI is defined over the top 20 m only; deeper results are reported per test but do not enter the index.')
  }

  return { rows, lpi, lpiCategory: lpiCategory(lpi), liquefiableDepths, notes }
}
