// ─────────────────────────────────────────────────────────────────────────
// Cone penetration testing. Layer 8.
//
// Robertson, P.K. (1990, 2009, 2010) and Robertson & Cabal, "Guide to Cone
// Penetration Testing"; Kulhawy & Mayne (1990) for the correlations.
//
// WHAT A CPT IS AND IS NOT. It is a continuous record of resistance — far more
// detail than an SPT at 1.5 m centres, and no sample. Everything about the
// SOIL TYPE is therefore inferred from mechanical behaviour, which is why the
// output is a soil BEHAVIOUR type (SBT), not a classification. A clayey sand
// and a sandy clay can plot in the same place; only a sample settles it.
// `sbtOf` returns behaviour language for that reason, and the module never
// emits a USCS symbol.
//
// THE CORRECTION MATTERS MOST WHERE THE SOIL IS SOFTEST. q_t = q_c + u₂(1 − a)
// is a rounding detail in dense sand and the dominant term in soft clay, where
// pore pressure on the cone shoulder can exceed the cone resistance itself.
// A "qc" reported without saying whether it was corrected is ambiguous in
// exactly the soils where it matters.
//
// UNITS: q_c and q_t MPa; f_s and u₂ kPa; stresses kPa; depth m; angles degrees.
// ─────────────────────────────────────────────────────────────────────────

import { P_ATM } from './spt'
import { verticalStress, type StressLayer } from './overburden'

/** One cone reading at one depth. */
export interface CptReading {
  depth: number
  /** Cone resistance, MPa. */
  qc: number
  /** Sleeve friction, kPa. */
  fs: number
  /** Pore pressure behind the cone (u₂), kPa. Omit for a cone without it. */
  u2?: number
}

export interface CptOptions {
  /** Net area ratio of the cone, typically 0.70–0.85. */
  netAreaRatio?: number
  /** Cone factor N_kt for undrained strength, typically 14–16. */
  nkt?: number
}

/**
 * Corrected cone resistance q_t = q_c + u₂(1 − a), MPa.
 *
 * Without a u₂ measurement no correction is possible, and in soft clay the
 * uncorrected value can be out by more than it is worth — so the caller is
 * told rather than silently handed q_c.
 */
export function correctedResistance(qc: number, u2: number | undefined, netAreaRatio = 0.8): {
  qt: number; corrected: boolean
} {
  if (u2 == null) return { qt: qc, corrected: false }
  return { qt: qc + (u2 / 1000) * (1 - netAreaRatio), corrected: true }
}

export interface CptNormalised {
  /** Corrected cone resistance, MPa. */
  qt: number
  /** Friction ratio R_f = f_s/q_t × 100, %. */
  rf: number
  /** Normalised friction ratio F_r = f_s/(q_t − σv0) × 100, %. */
  fr: number
  /** Stress exponent, converged. */
  n: number
  /** Stress-normalised cone resistance. */
  qtn: number
  /** Soil behaviour type index. */
  ic: number
  /** Iterations the exponent took to settle. */
  iterations: number
  converged: boolean
}

/**
 * Normalise a reading and solve for the soil behaviour type index.
 *
 * n and I_c are mutually dependent — n depends on I_c, and I_c on Q_tn which
 * depends on n — so this iterates to a fixed point rather than assuming n = 1
 * or n = 0.5. Convergence is reported, not assumed: a reading that will not
 * settle is a reading the method does not describe.
 */
export function normalise(
  qt: number, fs: number, totalStress: number, effectiveStress: number,
): CptNormalised | undefined {
  const qtKpa = qt * 1000
  const net = qtKpa - totalStress
  if (!(net > 0) || !(effectiveStress > 0) || !(fs > 0)) return undefined

  const rf = (fs / qtKpa) * 100
  const fr = (fs / net) * 100

  // The loop converges the EXPONENT; Q_tn and I_c are computed once from the
  // settled value, so an unconverged run cannot leave a half-updated pair.
  const indexAt = (exp: number) => {
    const q = (net / P_ATM) * Math.pow(P_ATM / effectiveStress, exp)
    return { q, ic: Math.sqrt((3.47 - Math.log10(q)) ** 2 + (Math.log10(fr) + 1.22) ** 2) }
  }

  let n = 1.0
  let iterations = 0
  let converged = false
  for (; iterations < 50; iterations++) {
    const { q, ic } = indexAt(n)
    if (!(q > 0)) return undefined
    // Robertson (2009): n = 0.381 Ic + 0.05(σ'v0/pa) − 0.15, capped at 1.
    const next = Math.min(1, 0.381 * ic + 0.05 * (effectiveStress / P_ATM) - 0.15)
    if (Math.abs(next - n) < 1e-6) { n = next; converged = true; break }
    n = next
  }
  const { q: qtn, ic } = indexAt(n)
  if (!(qtn > 0)) return undefined

  return { qt, rf, fr, n, qtn, ic, iterations, converged }
}

export type SbtZone = 2 | 3 | 4 | 5 | 6 | 7

export interface Sbt {
  zone: SbtZone
  /** Behaviour description — NOT a USCS classification. */
  label: string
  /** Whether the material behaves in a drained (granular) way. */
  granular: boolean
}

/**
 * Soil behaviour type from I_c (Robertson 2010 boundaries).
 *
 * Behaviour, not classification: a CPT takes no sample, and two soils a
 * geologist would name differently can plot in the same zone.
 */
export function sbtOf(ic: number): Sbt {
  if (ic < 1.31) return { zone: 7, label: 'gravelly sand to dense sand', granular: true }
  if (ic < 2.05) return { zone: 6, label: 'clean sand to silty sand', granular: true }
  if (ic < 2.60) return { zone: 5, label: 'silty sand to sandy silt', granular: true }
  if (ic < 2.95) return { zone: 4, label: 'clayey silt to silty clay', granular: false }
  if (ic < 3.60) return { zone: 3, label: 'silty clay to clay', granular: false }
  return { zone: 2, label: 'organic soil — clay', granular: false }
}

/**
 * I_c above which Robertson & Wride treat a soil as too clay-rich to liquefy.
 * A screening boundary, not a property: soils near it need sampling.
 */
export const IC_NON_LIQUEFIABLE = 2.6

export interface CptCorrelation {
  value?: number
  unit: string
  /** Why the correlation was not applied. Present exactly when value is absent. */
  refusal?: string
  note?: string
}

/** Relative density, Kulhawy & Mayne: D_r = √(Q_tn/305). Clean sands only. */
export function relativeDensity(n: CptNormalised): CptCorrelation {
  const sbt = sbtOf(n.ic)
  if (!sbt.granular) {
    return { unit: '%', refusal: `Relative density has no meaning in ${sbt.label}; it is a granular-soil property.` }
  }
  const dr = Math.sqrt(n.qtn / 305) * 100
  return {
    value: Math.min(dr, 100), unit: '%',
    note: dr > 100
      ? 'The correlation returned above 100% and has been capped. That usually means an overconsolidated or cemented sand, where it does not apply.'
      : 'Kulhawy & Mayne (1990) for unaged, uncemented quartz sand. Ageing and cementation both raise q_c without raising D_r.',
  }
}

/** Effective friction angle, Kulhawy & Mayne: φ′ = 17.6 + 11·log₁₀(Q_tn). */
export function frictionAngle(n: CptNormalised): CptCorrelation {
  const sbt = sbtOf(n.ic)
  if (!sbt.granular) {
    return { unit: '°', refusal: `A drained φ′ from cone resistance applies to sands; this reading behaves as ${sbt.label}.` }
  }
  return {
    value: 17.6 + 11 * Math.log10(n.qtn), unit: '°',
    note: 'Kulhawy & Mayne (1990), clean quartz sand. Quote to the nearest degree at best — the scatter is several degrees.',
  }
}

/**
 * Undrained shear strength s_u = (q_t − σv0)/N_kt.
 *
 * N_kt is the whole answer and is not a constant: 10–20 across sites, commonly
 * taken as 14–16 without local calibration. The strength is therefore
 * proportional to a number that was assumed, which the note says out loud.
 */
export function undrainedStrength(
  n: CptNormalised, totalStress: number, nkt = 15,
): CptCorrelation {
  const sbt = sbtOf(n.ic)
  if (sbt.granular) {
    return { unit: 'kPa', refusal: `An undrained strength does not apply to ${sbt.label}, which behaves drained.` }
  }
  if (!(nkt > 0)) return { unit: 'kPa', refusal: 'N_kt must be greater than zero.' }
  return {
    value: (n.qt * 1000 - totalStress) / nkt, unit: 'kPa',
    note: `Taken with N_kt = ${nkt}. N_kt ranges 10–20 between sites, so s_u carries that spread directly — a site-specific calibration against vane or triaxial data is worth more than any default.`,
  }
}

// ── Whole sounding ────────────────────────────────────────────────────────

export interface CptRow {
  depth: number
  qc: number
  fs: number
  u2?: number
  qt: number
  corrected: boolean
  totalStress: number
  effectiveStress: number
  normalised?: CptNormalised
  sbt?: Sbt
  /** Why this depth could not be normalised. */
  skipped?: string
}

export interface CptSounding {
  rows: CptRow[]
  notes: string[]
}

/**
 * Process a sounding.
 *
 * Unit weights come in explicitly, as everywhere in this module — σv0 and σ′v0
 * sit under every normalised quantity, and a CPT takes no sample to weigh.
 */
export function processSounding(
  readings: CptReading[],
  layers: StressLayer[],
  waterTable: number | undefined,
  opts: CptOptions = {},
): CptSounding {
  const notes: string[] = []
  const a = opts.netAreaRatio ?? 0.8
  const ordered = [...readings].sort((x, y) => x.depth - y.depth)

  if (opts.netAreaRatio == null) {
    notes.push('Net area ratio taken as 0.80. It is a property of the specific cone and should come from its calibration certificate.')
  }
  if (waterTable == null) {
    notes.push('No water table given, so the profile is treated as dry. Every normalised quantity below reads high if it is not.')
  }
  if (ordered.some((r) => r.u2 == null)) {
    notes.push('Some readings carry no u₂, so q_t could not be corrected there. In soft clay that correction is not a refinement — pore pressure on the shoulder can exceed the cone resistance itself.')
  }

  const rows: CptRow[] = ordered.map((r) => {
    const { qt, corrected } = correctedResistance(r.qc, r.u2, a)
    const s = verticalStress(layers, r.depth, waterTable ?? Infinity)
    const normalised = normalise(qt, r.fs, s.total, s.effective)
    return {
      depth: r.depth, qc: r.qc, fs: r.fs, u2: r.u2, qt, corrected,
      totalStress: s.total, effectiveStress: s.effective,
      normalised, sbt: normalised ? sbtOf(normalised.ic) : undefined,
      skipped: normalised ? undefined
        : 'Not normalised: the net cone resistance, effective stress or sleeve friction is not positive at this depth.',
    }
  })

  const unconverged = rows.filter((r) => r.normalised && !r.normalised.converged).length
  if (unconverged) {
    notes.push(`${unconverged} reading${unconverged === 1 ? '' : 's'} did not converge on a stress exponent. Those I_c values are the last iterate, not a solution, and should not be relied on.`)
  }
  const skipped = rows.filter((r) => r.skipped).length
  if (skipped) {
    notes.push(`${skipped} reading${skipped === 1 ? '' : 's'} could not be normalised and ${skipped === 1 ? 'is' : 'are'} reported raw.`)
  }
  return { rows, notes }
}

/** Thickness-weighted fractions of each behaviour zone over a sounding. */
export function sbtProfile(s: CptSounding): { zone: SbtZone; label: string; fraction: number }[] {
  const rows = s.rows.filter((r) => r.sbt)
  if (!rows.length) return []
  const counts = new Map<SbtZone, { label: string; n: number }>()
  for (const r of rows) {
    const e = counts.get(r.sbt!.zone) ?? { label: r.sbt!.label, n: 0 }
    e.n++
    counts.set(r.sbt!.zone, e)
  }
  return [...counts.entries()]
    .map(([zone, e]) => ({ zone, label: e.label, fraction: e.n / rows.length }))
    .sort((x, y) => y.fraction - x.fraction)
}
