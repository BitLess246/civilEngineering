// ─────────────────────────────────────────────────────────────────────────
// NSCP 2015 §208.6 (UBC-97 §1631) Dynamic Lateral Force Procedure —
// Response Spectrum Analysis (RSA).
//
// Design spectrum (NSCP Fig. 208-3 / UBC-97 Fig. 16-3):
//   Plateau  (T ≤ Ts):  Sa/g = 2.5·Ca·I/R      (constant acceleration)
//   Velocity (T > Ts):  Sa/g = Cv·I/(R·T)       (constant velocity)
//   Minimum  (all T):   Sa/g ≥ 0.11·Ca·I/R      (§208-10)
//   Ts = Cv/(2.5·Ca)
//
// Per-mode base shear: V_i(dir) = m*_i(dir) · Sa(T_i)   [t · m/s² = kN]
//   where m*_i(dir) is the effective modal mass in direction dir (tonnes).
//
// Modal combination:
//   SRSS: V = √(Σ V_i²)
//   CQC:  V = √(Σ_i Σ_j ρ_ij · V_i · V_j)
//   CQC correlation (Wilson/Der Kiureghian 1981, ζ = 5% default):
//     ρ_ij = 8ζ²(1+β)β^(3/2) / ((1−β²)² + 4ζ²β(1+β)²),  β = min(ωi,ωj)/max(ωi,ωj)
//
// Scaling (§208.6.4.2): if V_CQC < 0.9·V_static, results must be scaled up;
//   cqcRatio = V_CQC / V_static — caller applies the ≥ 0.9 floor as needed.
//
// Units: T (s), Ca/Cv/Sa (g-fraction or m/s²), mass (t), V (kN).
// ─────────────────────────────────────────────────────────────────────────
import type { ModalResult } from './modal'
import { GRAVITY } from './modal'

export interface SpectrumParams {
  Ca: number; Cv: number
  I: number; R: number
  /** Viscous damping ratio (default 0.05). */
  zeta?: number
  /** Static ELF base shear [X, Y, Z] kN, for §208.6.4.2 ratio (optional). */
  staticV?: [number, number, number]
}

export interface ModalForce {
  modeIdx: number
  period: number
  /** Spectral acceleration, m/s². */
  Sa: number
  /** Sa / g (dimensionless). */
  SaG: number
  /** Modal base shear per global direction [X, Y, Z], kN. */
  baseShear: [number, number, number]
}

export interface ResponseSpectrumResult {
  params: SpectrumParams & { Ts: number }
  modalForces: ModalForce[]
  /** SRSS-combined base shear per direction [X, Y, Z], kN. */
  srss: [number, number, number]
  /** CQC-combined base shear per direction [X, Y, Z], kN. */
  cqc: [number, number, number]
  /** V_CQC / V_static per direction; null when staticV not supplied or zero. */
  cqcRatio: [number | null, number | null, number | null]
}

/** NSCP §208 elastic design spectral acceleration [m/s²] at period T. */
export function nscp208Spectrum(T: number, Ca: number, Cv: number, I: number, R: number): number {
  const plateau = (2.5 * Ca * I) / R
  const velocity = T > 1e-9 ? (Cv * I) / (R * T) : plateau
  const minimum = (0.11 * Ca * I) / R
  return Math.max(minimum, Math.min(plateau, velocity)) * GRAVITY
}

/** CQC cross-correlation coefficient (Wilson, Der Kiureghian & Bayo 1981). */
export function cqcCorrel(omegaI: number, omegaJ: number, zeta: number): number {
  if (omegaI <= 0 || omegaJ <= 0) return omegaI === omegaJ ? 1 : 0
  // β is always ≤ 1 (smaller over larger)
  const beta = omegaI <= omegaJ ? omegaI / omegaJ : omegaJ / omegaI
  const b2 = beta * beta
  const num = 8 * zeta * zeta * (1 + beta) * Math.pow(beta, 1.5)
  const den = (1 - b2) * (1 - b2) + 4 * zeta * zeta * beta * (1 + beta) * (1 + beta)
  return den > 1e-300 ? num / den : 1
}

/**
 * Computes modal base shears and SRSS/CQC combinations from modal analysis
 * results and NSCP §208 design spectrum parameters.
 */
export function computeResponseSpectrum(
  modal: ModalResult, p: SpectrumParams,
): ResponseSpectrumResult {
  const zeta = p.zeta ?? 0.05
  const Ts = p.Cv / (2.5 * p.Ca)

  if (modal.modes.length === 0) {
    return {
      params: { ...p, Ts }, modalForces: [],
      srss: [0, 0, 0], cqc: [0, 0, 0], cqcRatio: [null, null, null],
    }
  }

  const modalForces: ModalForce[] = modal.modes.map((m, i) => {
    const Sa = nscp208Spectrum(m.period, p.Ca, p.Cv, p.I, p.R)
    return {
      modeIdx: i + 1,
      period: m.period,
      Sa,
      SaG: Sa / GRAVITY,
      baseShear: m.effMass.map((em) => em * Sa) as [number, number, number],
    }
  })

  // SRSS: √(Σ V_i²)
  const srss: [number, number, number] = [0, 1, 2].map((dir) =>
    Math.sqrt(modalForces.reduce((s, mf) => s + mf.baseShear[dir] ** 2, 0)),
  ) as [number, number, number]

  // CQC: √(Σ_i Σ_j ρ_ij · V_i · V_j)
  const omegas = modal.modes.map((m) => m.omega)
  const cqc: [number, number, number] = [0, 1, 2].map((dir) => {
    let sum = 0
    for (let i = 0; i < modalForces.length; i++) {
      for (let j = 0; j < modalForces.length; j++) {
        const rho = i === j ? 1 : cqcCorrel(omegas[i], omegas[j], zeta)
        sum += rho * modalForces[i].baseShear[dir] * modalForces[j].baseShear[dir]
      }
    }
    return Math.sqrt(Math.max(0, sum))
  }) as [number, number, number]

  const cqcRatio: [number | null, number | null, number | null] = [0, 1, 2].map((dir) => {
    const sv = p.staticV?.[dir]
    return sv && sv > 0 ? cqc[dir] / sv : null
  }) as [number | null, number | null, number | null]

  return { params: { ...p, Ts }, modalForces, srss, cqc, cqcRatio }
}
