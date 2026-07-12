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
import { GRAVITY, buildSeismicMass } from './modal'
import type { StructuralModel, ModelLoad } from './model'

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

// ── RSA → equivalent lateral loads (§208.6.4) ───────────────────────────────
// Turns the combined response-spectrum storey shears into a static storey-force
// pattern the design pipeline can envelope like any other lateral case:
//   per mode m:  f_{m,k} = Γ_m · Sa(T_m) · Σ_{n ∈ level k} m_n·φ_{n,dir}
//   modal storey shear  V_{m,k} = Σ_{j ≥ k} f_{m,j}
//   combined shear      V_k = SRSS/CQC over modes (per level)
//   storey force        F_k = V_k − V_{k+1}   (ETABS-style back-difference, so
//                        the combined shear diagram — the design quantity — is
//                        reproduced exactly by a single static pattern)
// §208.6.4.2 scaling: the caller supplies the minimum design base shear
// (0.9·V_B / 0.8·V_A floors for regular structures, 1.0·V for irregular) and
// every force is scaled by max(1, Vfloor/V_base).
// Units: mass t, Sa m/s², forces kN, elevations m.

export interface RsaStoreyRow {
  elevation: number
  /** Combined (and scaled) storey shear at this level, kN. */
  V: number
  /** Equivalent static storey force at this level, kN (scaled). */
  F: number
}

export interface RsaLateralParams {
  Ca: number; Cv: number; I: number; R: number
  dir: 'x' | 'z'
  /** Viscous damping ratio for CQC (default 0.05). */
  zeta?: number
  /** Modal combination rule (default 'cqc'). */
  combine?: 'srss' | 'cqc'
  /** §208.6.4.2 minimum design base shear, kN; forces are scaled up so the
   *  combined base shear is at least this. Omit → no scaling. */
  Vfloor?: number
}

export interface RsaLateralResult {
  dir: 'x' | 'z'
  /** Levels bottom-up with combined shear and equivalent force (scaled). */
  storeys: RsaStoreyRow[]
  /** Combined base shear BEFORE scaling, kN. */
  Vdyn: number
  /** Scaling floor supplied (0 when none). */
  Vfloor: number
  /** Applied scale factor = max(1, Vfloor/Vdyn). */
  scale: number
  /** Σ effective-mass ratio captured in `dir` (§208.6.4.1 requires ≥ 0.90). */
  massRatio: number
  /** Scaled node loads (cat 'E'), mass-proportional within each level. */
  loads: ModelLoad[]
}

/**
 * Equivalent static lateral loads from a response-spectrum analysis, per
 * NSCP 2015 §208.6.4. Returns null when the model has no storeys, no modes or
 * a zero combined base shear in the requested direction.
 */
export function rsaEquivalentLoads(
  model: StructuralModel, modal: ModalResult, p: RsaLateralParams,
): RsaLateralResult | null {
  const dirIdx = p.dir === 'x' ? 0 : 2
  const zeta = p.zeta ?? 0.05
  const levels = [...new Set(model.storeys.map((s) => s.elevation))].sort((a, b) => a - b)
  if (levels.length === 0 || modal.modes.length === 0) return null
  const mass = buildSeismicMass(model)
  const nodesAt = (e: number) => model.nodes.filter((n) => Math.abs(n.y - e) < 1e-6)

  // per-mode storey forces: Γ·Sa is normalization-invariant (Γ = L/M* rescales
  // with the shape), so the max|φ|=1 normalized shapes are safe to use here.
  const modes = modal.modes.map((m) => {
    let Mstar = 0, L = 0
    for (const [id, phi] of Object.entries(m.shape)) {
      const mn = mass.get(id) ?? 0
      Mstar += mn * (phi[0] * phi[0] + phi[1] * phi[1] + phi[2] * phi[2])
      L += mn * phi[dirIdx]
    }
    const Sa = nscp208Spectrum(m.period, p.Ca, p.Cv, p.I, p.R)
    const gammaSa = Mstar > 1e-12 ? (L / Mstar) * Sa : 0
    const f = levels.map((e) => gammaSa * nodesAt(e)
      .reduce((s, n) => s + (mass.get(n.id) ?? 0) * (m.shape[n.id]?.[dirIdx] ?? 0), 0))
    // storey shears, accumulated from the roof down
    const V = new Array<number>(levels.length).fill(0)
    for (let k = levels.length - 1, acc = 0; k >= 0; k--) { acc += f[k]; V[k] = acc }
    return { omega: m.omega, V }
  })

  // combine per level over modes
  const combine = p.combine ?? 'cqc'
  const Vk = levels.map((_, k) => {
    if (combine === 'srss') return Math.sqrt(modes.reduce((s, m) => s + m.V[k] * m.V[k], 0))
    let sum = 0
    for (let i = 0; i < modes.length; i++) {
      for (let j = 0; j < modes.length; j++) {
        const rho = i === j ? 1 : cqcCorrel(modes[i].omega, modes[j].omega, zeta)
        sum += rho * modes[i].V[k] * modes[j].V[k]
      }
    }
    return Math.sqrt(Math.max(0, sum))
  })

  const Vdyn = Vk[0] ?? 0
  if (!(Vdyn > 0)) return null
  const scale = p.Vfloor !== undefined && p.Vfloor > Vdyn ? p.Vfloor / Vdyn : 1

  const storeys: RsaStoreyRow[] = levels.map((e, k) => ({
    elevation: e, V: scale * Vk[k], F: scale * (Vk[k] - (Vk[k + 1] ?? 0)),
  }))

  // storey force → node loads, split ∝ nodal seismic mass at the level
  const loads: ModelLoad[] = []
  for (const s of storeys) {
    if (Math.abs(s.F) < 1e-9) continue
    const nodes = nodesAt(s.elevation)
    if (nodes.length === 0) continue
    const mTot = nodes.reduce((t, n) => t + (mass.get(n.id) ?? 0), 0)
    for (const n of nodes) {
      const F = s.F * (mTot > 1e-12 ? (mass.get(n.id) ?? 0) / mTot : 1 / nodes.length)
      if (Math.abs(F) < 1e-12) continue
      loads.push(p.dir === 'x'
        ? { kind: 'node', node: n.id, Fx: F, cat: 'E' }
        : { kind: 'node', node: n.id, Fz: F, cat: 'E' })
    }
  }

  const massRatio = modal.modes.reduce((s, m) => s + m.effMassRatio[dirIdx], 0)
  return { dir: p.dir, storeys, Vdyn, Vfloor: p.Vfloor ?? 0, scale, massRatio, loads }
}
