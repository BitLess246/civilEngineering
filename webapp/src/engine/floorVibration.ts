// ─────────────────────────────────────────────────────────────────────────
// Floor vibration serviceability — AISC Design Guide 11 (Vibrations of Steel-
// Framed Structural Systems Due to Human Activity), walking excitation of a
// low-frequency floor (fn ≲ 9 Hz). Post-processes the frame analysis: the floor
// framing deflection Δ under the supported load gives the fundamental frequency
//   fn = 0.18·√(g/Δ)                                   (DG11 Eq. 3.3)
// and the predicted peak acceleration ratio from a walker is
//   ap/g = Po·exp(−0.35·fn) / (β·W)                    (DG11 Eq. 4.1)
// checked against the occupancy tolerance ao/g (DG11 Table 4.1). All forces in
// kN, deflections in m, g in m/s².
// ─────────────────────────────────────────────────────────────────────────
import { GRAVITY } from './modal'

/** Fundamental frequency (Hz) of a floor system from its deflection Δ (m) under
 *  the supported weight. DG11 Eq. 3.3: fn = 0.18·√(g/Δ). */
export function freqFromDeflection(defl: number): number {
  if (defl <= 0) return Infinity
  return 0.18 * Math.sqrt(GRAVITY / defl)
}

export interface DG11Input {
  /** Fundamental frequency, Hz. */
  fn: number
  /** Effective weight supported by the panel, kN. */
  W: number
  /** Modal damping ratio β (e.g. 0.03 for a furnished office floor). */
  beta: number
  /** Constant walking force Po, kN (≈0.29 buildings, 0.41 footbridges). */
  Po: number
  /** Acceleration tolerance ao/g (fraction of g, e.g. 0.005 for offices). */
  aoLimit: number
}

export interface DG11Result {
  fn: number
  /** Predicted peak acceleration ratio ap/g (fraction of g). */
  apOverG: number
  /** Acceptance limit ao/g (fraction of g). */
  aoLimit: number
  /** apOverG / aoLimit — ≤ 1 passes. */
  ratio: number
  ok: boolean
}

/** DG11 walking-excitation check (Eq. 4.1) for a low-frequency floor. */
export function dg11Walking(i: DG11Input): DG11Result {
  const apOverG = i.W > 0 && i.beta > 0
    ? (i.Po * Math.exp(-0.35 * i.fn)) / (i.beta * i.W)
    : Infinity
  const ratio = apOverG / i.aoLimit
  return { fn: i.fn, apOverG, aoLimit: i.aoLimit, ratio, ok: ratio <= 1 }
}

export interface OccupancyPreset {
  id: string
  label: string
  Po: number        // kN
  beta: number      // recommended modal damping ratio
  aoLimit: number   // ao/g
}

/** DG11 Table 4.1 recommended Po, β and acceleration limits by occupancy. */
export const DG11_OCCUPANCY: OccupancyPreset[] = [
  { id: 'office',      label: 'Office / residence / church', Po: 0.29, beta: 0.03, aoLimit: 0.005 },
  { id: 'office-bare', label: 'Office — bare floor (β=0.02)', Po: 0.29, beta: 0.02, aoLimit: 0.005 },
  { id: 'office-part', label: 'Office — full-height partitions (β=0.05)', Po: 0.29, beta: 0.05, aoLimit: 0.005 },
  { id: 'mall',        label: 'Shopping mall', Po: 0.29, beta: 0.02, aoLimit: 0.015 },
  { id: 'footbridge-in',  label: 'Indoor footbridge', Po: 0.41, beta: 0.01, aoLimit: 0.015 },
  { id: 'footbridge-out', label: 'Outdoor footbridge', Po: 0.41, beta: 0.01, aoLimit: 0.050 },
]
