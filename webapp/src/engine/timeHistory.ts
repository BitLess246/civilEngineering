// ─────────────────────────────────────────────────────────────────────────
// Linear time-history analysis by modal superposition (Tier 3 #11).
//
// Each natural mode is an independent SDOF oscillator. For ground excitation
// a_g(t) in one global direction, the unit-participation modal coordinate D_r(t)
// obeys the decoupled equation of motion
//     D̈_r + 2ζ_r ω_r Ḋ_r + ω_r² D_r = −a_g(t)
// integrated step-by-step with the Newmark-β method (average-acceleration,
// β=¼ γ=½ → unconditionally stable, energy-conserving for free vibration).
//
// Recombination (scaling-free, see modal.ts — φ·q is invariant to mode scale):
//   physical displacement  u(t)   = Σ_r φ_r · Γ_r · D_r(t)
//   total base shear       V_b(t) = Σ_r effMass_r(dir) · ω_r² · D_r(t)
// where Γ_r = L_r/M*_r is the modal participation factor in the excitation
// direction and effMass_r = L_r²/M*_r the effective modal mass (from modal.ts).
//
// Units: a_g in m/s²; ω in rad/s; D, u in m; mass in tonnes; V_b in kN
//   (t·m/s² = kN). dt in s.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from './model'
import { modalAnalysis, buildSeismicMass } from './modal'

/** Newmark integration parameters. Defaults: average-acceleration (β=¼, γ=½). */
export interface NewmarkOpts { beta?: number; gamma?: number; u0?: number; v0?: number }

/**
 * Newmark-β step-by-step solution of a linear SDOF oscillator with unit mass:
 *   ü + 2ζω u̇ + ω² u = p(t)
 * `p[i]` is the forcing sampled at t = i·dt. Returns displacement, velocity and
 * acceleration histories (each length p.length). Pure — no model knowledge.
 */
export function newmarkSDOF(
  omega: number, zeta: number, p: number[], dt: number, opts?: NewmarkOpts,
): { u: number[]; v: number[]; a: number[] } {
  const n = p.length
  const u = new Array(n).fill(0)
  const v = new Array(n).fill(0)
  const a = new Array(n).fill(0)
  if (n === 0) return { u, v, a }

  const beta = opts?.beta ?? 0.25
  const gamma = opts?.gamma ?? 0.5
  const m = 1, k = omega * omega, c = 2 * zeta * omega

  u[0] = opts?.u0 ?? 0
  v[0] = opts?.v0 ?? 0
  a[0] = (p[0] - c * v[0] - k * u[0]) / m

  const a1 = m / (beta * dt * dt) + (gamma * c) / (beta * dt)
  const a2 = m / (beta * dt) + (gamma / beta - 1) * c
  const a3 = (1 / (2 * beta) - 1) * m + dt * (gamma / (2 * beta) - 1) * c
  const khat = k + a1

  for (let i = 1; i < n; i++) {
    const phat = p[i] + a1 * u[i - 1] + a2 * v[i - 1] + a3 * a[i - 1]
    u[i] = phat / khat
    v[i] = (gamma / (beta * dt)) * (u[i] - u[i - 1]) + (1 - gamma / beta) * v[i - 1] + dt * (1 - gamma / (2 * beta)) * a[i - 1]
    a[i] = (1 / (beta * dt * dt)) * (u[i] - u[i - 1]) - (1 / (beta * dt)) * v[i - 1] - (1 / (2 * beta) - 1) * a[i - 1]
  }
  return { u, v, a }
}

/** Uniform ground-acceleration record applied along one global direction. */
export interface GroundMotion {
  /** Time step, s. */
  dt: number
  /** Ground acceleration samples, m/s². */
  ag: number[]
  /** Excitation direction: 0 = X, 1 = Y, 2 = Z. */
  dir: 0 | 1 | 2
}

export interface TimeHistoryOpts extends NewmarkOpts {
  /** Viscous damping ratio applied to every mode (default 0.05). */
  zeta?: number
  /** Number of modes to include (default 12, capped by available modes). */
  nModes?: number
  /** When set, the full displacement history of this node is returned (nodeHistory). */
  historyNode?: string
}

/** Per-mode time-history contribution. */
export interface ModalTH {
  modeIdx: number
  period: number
  omega: number
  /** Modal participation factor Γ in the excitation direction. */
  gamma: number
  /** Unit-participation modal coordinate D_r(t), m (D̈+2ζωḊ+ω²D = −a_g). */
  D: number[]
  /** Peak |D_r|, m. */
  peakD: number
  /** Peak pseudo-acceleration |ω²·D_r|, m/s². */
  peakA: number
}

export interface TimeHistoryResult {
  /** Time stamps, s (length = ag.length). */
  t: number[]
  dir: 0 | 1 | 2
  modal: ModalTH[]
  /** Total base shear history in the excitation direction, kN. */
  baseShear: number[]
  /** Peak |base shear|, kN. */
  peakBaseShear: number
  /** Peak absolute displacement per node, per global direction [X,Y,Z], m. */
  peakDisp: Record<string, [number, number, number]>
  /** Node id with the largest peak total displacement magnitude. */
  peakNode: string | null
  /** Largest peak total displacement magnitude (over all nodes), m. */
  peakNodeDisp: number
  /** Full displacement history [ux,uy,uz] (m) at opts.historyNode, when requested. */
  nodeHistory?: { node: string; u: [number, number, number][] }
}

/**
 * Linear modal time-history analysis of a structural model under uniform
 * ground acceleration. Returns per-mode modal coordinates, the base-shear
 * history and peak nodal displacements, or null if modal analysis fails
 * (singular K / no mass) or the record is empty.
 */
export function modalTimeHistory(
  model: StructuralModel, gm: GroundMotion, opts?: TimeHistoryOpts,
): TimeHistoryResult | null {
  if (gm.ag.length === 0) return null
  const modal = modalAnalysis(model, opts?.nModes ?? 12)
  if (!modal || modal.modes.length === 0) return null

  const zeta = opts?.zeta ?? 0.05
  const massByNode = buildSeismicMass(model)
  // Forcing for the unit-participation coordinate: D̈ + 2ζωḊ + ω²D = −a_g(t).
  const p = gm.ag.map((ag) => -ag)
  const n = gm.ag.length
  const t = Array.from({ length: n }, (_, i) => i * gm.dt)

  // Per-mode: integrate D_r and derive Γ_r, M*_r from the (scaling-arbitrary)
  // mode shape together with the lumped nodal mass.
  const Ds: number[][] = []
  const gammas: number[] = []
  const modal_out: ModalTH[] = modal.modes.map((mode, r) => {
    let Mstar = 0, L = 0
    for (const [nodeId, phi] of Object.entries(mode.shape)) {
      const mn = massByNode.get(nodeId) ?? 0
      if (mn <= 0) continue
      Mstar += mn * (phi[0] * phi[0] + phi[1] * phi[1] + phi[2] * phi[2])
      L += mn * phi[gm.dir]
    }
    const gamma = Mstar > 0 ? L / Mstar : 0
    const { u: D } = newmarkSDOF(mode.omega, zeta, p, gm.dt, opts)
    Ds.push(D)
    gammas.push(gamma)
    let peakD = 0
    for (const d of D) peakD = Math.max(peakD, Math.abs(d))
    return {
      modeIdx: r + 1, period: mode.period, omega: mode.omega, gamma,
      D, peakD, peakA: peakD * mode.omega * mode.omega,
    }
  })

  // Base shear: V_b(t) = Σ_r effMass_r(dir)·ω_r²·D_r(t).
  const baseShear = new Array(n).fill(0)
  modal.modes.forEach((mode, r) => {
    const w2em = mode.omega * mode.omega * mode.effMass[gm.dir]
    const D = Ds[r]
    for (let i = 0; i < n; i++) baseShear[i] += w2em * D[i]
  })
  let peakBaseShear = 0
  for (const vb of baseShear) peakBaseShear = Math.max(peakBaseShear, Math.abs(vb))

  // Peak nodal displacement: u_node,d(t) = Σ_r φ_r[node][d]·Γ_r·D_r(t).
  const nodeIds = new Set<string>()
  for (const mode of modal.modes) for (const id of Object.keys(mode.shape)) nodeIds.add(id)
  const peakDisp: Record<string, [number, number, number]> = {}
  let peakNode: string | null = null, peakNodeDisp = 0
  let nodeHistory: TimeHistoryResult['nodeHistory']
  for (const id of nodeIds) {
    const peak: [number, number, number] = [0, 0, 0]
    const keepHist = id === opts?.historyNode
    const hist: [number, number, number][] | null = keepHist ? Array.from({ length: n }, () => [0, 0, 0]) : null
    for (let d = 0; d < 3; d++) {
      // coefficient per mode: φ_r·Γ_r  → response is Σ_r coeff·D_r(t)
      const coeff = modal.modes.map((mode, r) => (mode.shape[id]?.[d] ?? 0) * gammas[r])
      for (let i = 0; i < n; i++) {
        let s = 0
        for (let r = 0; r < coeff.length; r++) s += coeff[r] * Ds[r][i]
        if (hist) hist[i][d] = s
        const abs = Math.abs(s)
        if (abs > peak[d]) peak[d] = abs
      }
    }
    peakDisp[id] = peak
    if (hist) nodeHistory = { node: id, u: hist }
    const mag = Math.hypot(peak[0], peak[1], peak[2])
    if (mag > peakNodeDisp) { peakNodeDisp = mag; peakNode = id }
  }

  return { t, dir: gm.dir, modal: modal_out, baseShear, peakBaseShear, peakDisp, peakNode, peakNodeDisp, ...(nodeHistory ? { nodeHistory } : {}) }
}
