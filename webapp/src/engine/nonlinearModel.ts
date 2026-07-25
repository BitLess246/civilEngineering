// ─────────────────────────────────────────────────────────────────────────
// StructuralModel → nonlinear time-history bridge (layer L2 in spirit: model →
// engine input; all the policy lives here, tested, so the page stays thin).
//
// The nonlinear engine (`nonlinearTimeHistory.ts`) integrates a network of
// hysteretic springs. This module reduces a 3D frame to the classic EQUIVALENT
// NONLINEAR SHEAR BUILDING — one hysteretic spring per storey, chained
// ground → L1 → L2 → … — which is the standard idealization for fast
// inelastic response history work.
//
// Per storey s (between levels s−1 and s), in one horizontal direction:
//
//   mass  m_s = lumped seismic mass at level s          (`buildSeismicMass`)
//   k₀_s  = V_s / Δ_s  from a static solve under a unit-per-level lateral
//           pattern: V_s is the storey shear, Δ_s the interstorey drift. This
//           is the SAME secant-stiffness definition the NSCP soft-storey check
//           uses (`irregularity.ts`), so the two agree by construction.
//   Fy_s  = Σ_columns 2·Mp/h — the shear-type (strong-beam) storey mechanism,
//           each column hinging at both ends. Mp from `plasticMoment`.
//
// ASSUMPTIONS — state them with any result:
//   • SHEAR-TYPE mechanism (strong-beam / weak-column). A frame that hinges in
//     its beams has a LOWER real capacity than Σ2Mp/h, so Fy is unconservative
//     there; use the pushover engine to check the governing mechanism first.
//   • One horizontal direction at a time; torsion and biaxial effects ignored.
//   • Storey stiffness is secant to the applied pattern, not exact for every
//     deformed shape.
//
// Units: mass tonnes, k kN/m, Fy kN, force kN, displacement m.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from './model'
import { modelToFrame3D } from './modelBridge'
import { solveFrame3D, type F3Load } from './frame3d'
import { buildSeismicMass } from './modal'
import { plasticMoment } from './pushoverModel'
import { rayleighCoeffs, type RayleighCoeffs } from './directTimeHistory'
import {
  nonlinearTimeHistory, groundMotionForcing,
  type HystSpring, type NonlinearTHResult,
} from './nonlinearTimeHistory'
import type { GroundMotion } from './timeHistory'

export interface StoreyProps {
  /** 1-based storey number (1 = the storey above the base). */
  storey: number
  /** Elevation of the storey's TOP level, m. */
  elevation: number
  /** Storey height, m. */
  h: number
  /** Lumped seismic mass at the top level, tonnes. */
  mass: number
  /** Secant lateral stiffness V/Δ, kN/m. */
  k0: number
  /** Shear-type storey capacity Σ 2·Mp/h, kN. */
  Fy: number
  /** Columns counted in the capacity. */
  columns: number
}

export interface ReductionOpts {
  /** Horizontal direction to reduce along (default 'x'). */
  dir?: 'x' | 'z'
  /** Tension steel ratio assumed for RC plastic moments (default 0.015). */
  rho?: number
}

/**
 * Reduce a frame to per-storey mass / stiffness / capacity. Returns null when
 * the model has no framed levels or the static probe solve fails.
 */
export function storeyReduction(model: StructuralModel, opts: ReductionOpts = {}): StoreyProps[] | null {
  const dir = opts.dir ?? 'x'
  const levels = [...new Set(model.storeys.map((s) => s.elevation))].sort((a, b) => a - b)
  if (levels.length === 0) return null
  const all = [0, ...levels]

  const br = modelToFrame3D(model, { useShells: false })
  const nodesAt = (e: number) => model.nodes.filter((n) => Math.abs(n.y - e) < 1e-6)

  // unit lateral probe: 1 kN total at EVERY framed level, split across its nodes
  const loads: F3Load[] = []
  for (const e of levels) {
    const ns = nodesAt(e)
    if (ns.length === 0) continue
    const per = 1 / ns.length
    for (const n of ns) {
      loads.push(dir === 'x'
        ? { kind: 'node', node: n.id, Fx: per, cat: 'E' }
        : { kind: 'node', node: n.id, Fz: per, cat: 'E' })
    }
  }
  const sol = solveFrame3D(br.nodes, br.members, br.supports, loads, {}, br.shells)
  if (!sol) return null

  // mean lateral displacement per level (m)
  const comp = dir === 'x' ? 0 : 2
  const pos = new Map(br.nodes.map((n, i) => [n.id, i]))
  const uOf = (e: number): number => {
    const ns = nodesAt(e)
    if (ns.length === 0) return 0
    let s = 0, c = 0
    for (const n of ns) {
      const i = pos.get(n.id)
      if (i === undefined) continue
      s += sol.d[6 * i + comp]; c++
    }
    return c ? s / c : 0
  }
  const u = all.map(uOf)

  const massByNode = buildSeismicMass(model)
  const secOf = new Map(model.sections.map((s) => [s.id, s]))
  const nm = new Map(model.nodes.map((n) => [n.id, n]))

  const out: StoreyProps[] = []
  for (let s = 1; s < all.length; s++) {
    const top = all[s], bot = all[s - 1]
    const h = top - bot
    const drift = u[s] - u[s - 1]
    // storey shear under the probe = 1 kN per level at or above this storey
    const V = all.length - s
    const k0 = Math.abs(drift) > 1e-12 ? V / drift : Infinity

    let mass = 0
    for (const n of nodesAt(top)) mass += massByNode.get(n.id) ?? 0

    // shear-type capacity: every column spanning this storey hinges top & bottom
    let Fy = 0, columns = 0
    for (const m of model.members) {
      if (m.role !== 'column') continue
      const a = nm.get(m.i), b = nm.get(m.j)
      if (!a || !b) continue
      const lo = Math.min(a.y, b.y), hi = Math.max(a.y, b.y)
      if (Math.abs(lo - bot) > 1e-6 || Math.abs(hi - top) > 1e-6) continue
      const sec = secOf.get(m.section)
      if (!sec) continue
      const Mp = plasticMoment(sec, opts.rho ?? 0.015)   // kN·m
      Fy += (2 * Mp) / Math.max(h, 1e-6)                 // kN
      columns++
    }
    out.push({ storey: s, elevation: top, h, mass, k0, Fy, columns })
  }
  return out
}

/** Approximate fundamental period of the reduced shear building, s. */
export function reducedPeriod(st: StoreyProps[]): number {
  // inverse iteration on the chained shear-building K, M (few storeys ⇒ cheap)
  const n = st.length
  if (n === 0) return 0
  const K: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    const k = st[i].k0
    K[i][i] += k
    if (i > 0) { K[i - 1][i - 1] += k; K[i][i - 1] -= k; K[i - 1][i] -= k }
  }
  // Rayleigh quotient iteration with a linear first guess
  let phi = Array.from({ length: n }, (_, i) => (i + 1) / n)
  for (let it = 0; it < 200; it++) {
    // solve K x = M phi  (Gaussian elimination on a small dense system)
    const A = K.map((r) => [...r])
    const rhs = phi.map((p, i) => st[i].mass * p)
    for (let c = 0; c < n; c++) {
      let piv = c
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r
      if (Math.abs(A[piv][c]) < 1e-300) return 0
      ;[A[c], A[piv]] = [A[piv], A[c]];[rhs[c], rhs[piv]] = [rhs[piv], rhs[c]]
      for (let r = c + 1; r < n; r++) {
        const f = A[r][c] / A[c][c]
        for (let k2 = c; k2 < n; k2++) A[r][k2] -= f * A[c][k2]
        rhs[r] -= f * rhs[c]
      }
    }
    const x = new Array(n).fill(0)
    for (let r = n - 1; r >= 0; r--) {
      let sum = rhs[r]
      for (let c = r + 1; c < n; c++) sum -= A[r][c] * x[c]
      x[r] = sum / A[r][r]
    }
    const norm = Math.sqrt(x.reduce((s, v) => s + v * v, 0))
    if (!(norm > 0)) return 0
    phi = x.map((v) => v / norm)
  }
  // ω² = (φᵀKφ)/(φᵀMφ)
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    den += st[i].mass * phi[i] * phi[i]
    for (let j = 0; j < n; j++) num += phi[i] * K[i][j] * phi[j]
  }
  const w2 = den > 0 ? num / den : 0
  return w2 > 0 ? (2 * Math.PI) / Math.sqrt(w2) : 0
}

export interface NonlinearModelOpts extends ReductionOpts {
  /** Target damping ratio at the two Rayleigh anchors (default 0.05). */
  zeta?: number
  /** Post-yield stiffness ratio for every storey spring (default 0.03). */
  b?: number
  /** Force the springs elastic — the linear reference run. */
  elastic?: boolean
  historyNode?: never
  collect?: boolean
}

export interface NonlinearModelResult {
  storeys: StoreyProps[]
  /** Fundamental period of the reduced elastic shear building, s. */
  period: number
  rayleigh: RayleighCoeffs
  response: NonlinearTHResult
}

/**
 * Run a nonlinear (or elastic-reference) time history on the equivalent shear
 * building reduced from `model`. Returns null when the reduction fails or the
 * record is empty.
 */
export function runNonlinearModel(
  model: StructuralModel, gm: GroundMotion, opts: NonlinearModelOpts = {},
): NonlinearModelResult | null {
  if (gm.ag.length === 0) return null
  const dir = gm.dir === 2 ? 'z' : 'x'
  const st = storeyReduction(model, { ...opts, dir })
  if (!st || st.length === 0) return null
  if (!st.every((s) => s.mass > 0 && Number.isFinite(s.k0) && s.k0 > 0)) return null

  const springs: HystSpring[] = st.map((s, i) => ({
    i,
    ...(i > 0 ? { j: i - 1 } : {}),
    params: { k0: s.k0, Fy: opts.elastic ? Infinity : s.Fy, b: opts.b ?? 0.03 },
  }))
  const mass = st.map((s) => s.mass)

  // Rayleigh anchored to the reduced building's first period and its 3rd
  // harmonic (a standard 2-anchor choice when only T₁ is known).
  const T1 = reducedPeriod(st)
  const w1 = T1 > 0 ? (2 * Math.PI) / T1 : 1
  const zeta = opts.zeta ?? 0.05
  const rayleigh = rayleighCoeffs(w1, zeta, 3 * w1, zeta)

  const response = nonlinearTimeHistory({
    mass, springs, rayleigh,
    P: groundMotionForcing(mass, mass.map(() => 1), gm.ag),
    nSteps: gm.ag.length, dt: gm.dt, collect: opts.collect,
  })
  return response ? { storeys: st, period: T1, rayleigh, response } : null
}
