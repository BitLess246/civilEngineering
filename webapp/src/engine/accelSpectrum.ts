// ─────────────────────────────────────────────────────────────────────────
// Elastic response spectrum from a recorded ground-acceleration time history
// (Tier 4 C8). For each trial period T a unit-mass SDOF oscillator
//   ü + 2ζω u̇ + ω² u = −a_g(t)        (relative-displacement EOM, ω = 2π/T)
// is integrated by Newmark-β (reusing `newmarkSDOF`); its peak relative
// displacement is the spectral displacement Sd(T). The pseudo quantities are
//   PSV = ω·Sd      PSA = ω²·Sd
// PSA is the pseudo-spectral acceleration plotted against period and overlaid
// on the NSCP 208 design spectrum (`nscp208DesignCurve`) for comparison.
//
// The T = 0 anchor is the rigid-oscillator limit S_a(0) = PGA (the mass follows
// the ground; pseudo-accel → peak ground acceleration).
// Units: a_g and PSA/PGA in m/s²; Sd in m; PSV in m/s; T in s.
// ─────────────────────────────────────────────────────────────────────────
import { newmarkSDOF } from './timeHistory'
import { nscp208Spectrum } from './responseSpectrum'
import { GRAVITY } from './modal'

export interface SpectrumPoint {
  T: number          // period, s
  Sd: number         // spectral (relative) displacement, m
  PSV: number        // pseudo-spectral velocity = ω·Sd, m/s
  PSA: number        // pseudo-spectral acceleration = ω²·Sd, m/s²
  PSAg: number       // PSA / g (dimensionless)
}

export interface AccelSpectrumOpts {
  /** Viscous damping ratio (default 0.05). */
  zeta?: number
  /** Explicit period list (s). When omitted a log-spaced grid Tmin…Tmax is used. */
  periods?: number[]
  /** Period-grid bounds + count (defaults 0.05 s, 4.0 s, 60 points, log-spaced). */
  Tmin?: number; Tmax?: number; nT?: number
}

export interface AccelSpectrum {
  zeta: number
  /** Spectrum ordinates, ascending in T. The first point is the T = 0 PGA anchor. */
  points: SpectrumPoint[]
  /** Peak ground acceleration |a_g|max, m/s². */
  pga: number
  /** Maximum PSA over the period range, m/s², and the period at which it occurs. */
  peakPSA: number
  peakPSAT: number
}

/** Log-spaced period grid (inclusive of both ends). */
function logspace(a: number, b: number, n: number): number[] {
  if (n <= 1) return [a]
  const r = Math.pow(b / a, 1 / (n - 1))
  return Array.from({ length: n }, (_, i) => a * Math.pow(r, i))
}

/**
 * Elastic response spectrum of a ground-acceleration record. Returns null when
 * the record is empty or dt ≤ 0. `ag` must be in m/s² (use parseAccelerogram to
 * convert g → m/s² beforehand).
 */
export function elasticResponseSpectrum(
  ag: number[], dt: number, opts: AccelSpectrumOpts = {},
): AccelSpectrum | null {
  if (ag.length === 0 || dt <= 0) return null
  const zeta = opts.zeta ?? 0.05
  const pga = ag.reduce((m, v) => Math.max(m, Math.abs(v)), 0)

  const periods = (opts.periods ?? logspace(opts.Tmin ?? 0.05, opts.Tmax ?? 4.0, opts.nT ?? 60))
    .filter((T) => T > 0).sort((p, q) => p - q)

  // forcing p(t) = −a_g(t) for the unit-mass relative-displacement oscillator
  const neg = ag.map((a) => -a)

  // T = 0 anchor: rigid oscillator follows the ground ⇒ S_a = PGA.
  const points: SpectrumPoint[] = [{ T: 0, Sd: 0, PSV: 0, PSA: pga, PSAg: pga / GRAVITY }]
  let peakPSA = pga, peakPSAT = 0

  for (const T of periods) {
    const omega = (2 * Math.PI) / T
    const { u } = newmarkSDOF(omega, zeta, neg, dt)
    const Sd = u.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    const PSV = omega * Sd
    const PSA = omega * omega * Sd
    points.push({ T, Sd, PSV, PSA, PSAg: PSA / GRAVITY })
    if (PSA > peakPSA) { peakPSA = PSA; peakPSAT = T }
  }

  return { zeta, points, pga, peakPSA, peakPSAT }
}

export interface DesignSpectrumPoint { T: number; Sa: number; SaG: number }

/**
 * NSCP §208 elastic design spectrum sampled at the given periods (m/s²), for
 * overlaying on a recorded response spectrum. Reuses `nscp208Spectrum`.
 */
export function nscp208DesignCurve(
  periods: number[], Ca: number, Cv: number, I: number, R: number,
): DesignSpectrumPoint[] {
  return periods.map((T) => {
    const Sa = nscp208Spectrum(T, Ca, Cv, I, R)
    return { T, Sa, SaG: Sa / GRAVITY }
  })
}
