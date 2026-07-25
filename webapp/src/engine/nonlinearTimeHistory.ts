// ─────────────────────────────────────────────────────────────────────────
// NONLINEAR direct-integration time-history — Newmark-β with Newton-Raphson
// equilibrium iteration inside every step. Layer L5. Builds directly on the
// linear direct-integration path (`directTimeHistory.ts`), which established
// the full-MDOF Newmark machinery and the Rayleigh damping model.
//
//   M ü + C u̇ + f_s(u) = P(t),        C = α·M + β·K₀
//
// f_s is no longer K·u but the assembled restoring force of a network of
// HYSTERETIC springs (`hysteresis.ts`), so the structure can yield, unload and
// re-yield. Damping uses the INITIAL elastic stiffness K₀ (standard practice —
// tying β to a softening tangent injects spurious damping as the structure
// yields).
//
// Per step, with u_n, v_n, a_n known, Newmark expresses velocity and
// acceleration as functions of the unknown u:
//   v(u) = a₁(u−u_n) − a₄v_n − a₅a_n
//   a(u) = a₀(u−u_n) − a₂v_n − a₃a_n
// and Newton-Raphson drives the residual to zero:
//   R(u) = P − M·a(u) − C·v(u) − f_s(u),     K̂_t = K_t(u) + a₀M + a₁C
//   solve K̂_t·Δu = R,  u ← u + Δu
// With every spring elastic this collapses to the single linear solve of
// `newmarkDirect` — asserted to roundoff in the tests, which is what makes the
// nonlinear path trustworthy.
//
// The tangent is re-factored only when the YIELD PATTERN changes (which springs
// are on their plastic branch); while the pattern holds, K̂_t is constant and
// the existing LU factorization is reused — the same shared-factorization
// discipline as the linear paths.
//
// Units: force kN, mass tonnes, displacement m, stiffness kN/m, dt s.
// Refs: Chopra, Dynamics of Structures §16.3–16.5; Newmark (1959).
// ─────────────────────────────────────────────────────────────────────────
import { luFactor, luSolve, matVec, type LUFactor } from './fem'
import {
  bilinearProbe, bilinearCommit, newBilinearState,
  type BilinearParams, type BilinearState,
} from './hysteresis'
import type { RayleighCoeffs } from './directTimeHistory'

/** One hysteretic spring between two DOFs (or between a DOF and ground). */
export interface HystSpring {
  /** First DOF index. */
  i: number
  /** Second DOF index; omit for a grounded spring (deformation = u[i]). */
  j?: number
  params: BilinearParams
}

export interface NonlinearTHInput {
  /** Lumped mass per DOF (diagonal M). Length sets the system size. */
  mass: number[]
  springs: HystSpring[]
  /** Rayleigh coefficients for C = α·M + β·K₀. */
  rayleigh: RayleighCoeffs
  /** Forcing: the full nSteps×n array, or a generator P(step). */
  P: number[][] | ((step: number) => number[])
  dt: number
  /** Required with the generator form. */
  nSteps?: number
  beta?: number
  gamma?: number
  /** Newton convergence tolerance on ‖Δu‖ (relative). Default 1e-10. */
  tol?: number
  /** Newton iteration cap per step. Default 25. */
  maxIter?: number
  /** Collect the full displacement history (default true). */
  collect?: boolean
}

export interface NonlinearTHResult {
  steps: number
  /** Displacement history (empty when `collect: false`). */
  u: number[][]
  /** Peak |displacement| per DOF. */
  peak: number[]
  /** Sum of forces in the GROUNDED springs — the base force history. */
  baseForce: number[]
  peakBaseForce: number
  /** Energy dissipated by hysteresis, per spring and in total. */
  dissipated: number[]
  totalDissipated: number
  /** Peak ductility demand per spring, |d|max / u_y (Infinity-safe). */
  ductility: number[]
  /** True when every step reached the Newton tolerance. */
  converged: boolean
  /** Worst Newton iteration count over all steps. */
  maxIterations: number
  /** Largest final ‖Δu‖ left at the end of any step. */
  worstResidual: number
  /** True if any spring ever yielded. */
  yielded: boolean
}

const deform = (u: number[], s: HystSpring) => u[s.i] - (s.j != null ? u[s.j] : 0)

/** Assemble the initial elastic stiffness K₀ of the spring network. */
export function assembleK0(n: number, springs: HystSpring[]): number[][] {
  const K: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  for (const s of springs) {
    const k = s.params.k0
    K[s.i][s.i] += k
    if (s.j != null) { K[s.j][s.j] += k; K[s.i][s.j] -= k; K[s.j][s.i] -= k }
  }
  return K
}

/** Convenience: P(t) = −M·ι·a_g(t) for uniform ground excitation. */
export function groundMotionForcing(mass: number[], iota: number[], ag: number[]): (s: number) => number[] {
  const mIota = mass.map((m, i) => m * (iota[i] ?? 0))
  return (s: number) => mIota.map((mi) => -mi * ag[s])
}

/**
 * Newmark-β + Newton-Raphson nonlinear time-history of a hysteretic spring
 * network. Returns null when the system is empty or the effective tangent is
 * singular at the first step.
 */
export function nonlinearTimeHistory(inp: NonlinearTHInput): NonlinearTHResult | null {
  const n = inp.mass.length
  const isFn = typeof inp.P === 'function'
  const nSteps = isFn ? (inp.nSteps ?? 0) : (inp.P as number[][]).length
  const pAt = isFn ? (inp.P as (s: number) => number[]) : (s: number) => (inp.P as number[][])[s]
  if (n === 0 || nSteps === 0) return null

  const beta = inp.beta ?? 0.25, gamma = inp.gamma ?? 0.5
  const dt = inp.dt, tol = inp.tol ?? 1e-10, maxIter = inp.maxIter ?? 25
  const collect = inp.collect !== false
  const a0 = 1 / (beta * dt * dt), a1 = gamma / (beta * dt)
  const a2 = 1 / (beta * dt), a3 = 1 / (2 * beta) - 1
  const a4 = gamma / beta - 1, a5 = dt * (gamma / (2 * beta) - 1)

  const K0 = assembleK0(n, inp.springs)
  const { alpha, beta: bRay } = inp.rayleigh
  // C = αM + βK₀ (initial-stiffness Rayleigh damping)
  const C: number[][] = Array.from({ length: n }, (_, i) => {
    const row = new Array<number>(n)
    for (let j = 0; j < n; j++) row[j] = bRay * K0[i][j] + (i === j ? alpha * inp.mass[i] : 0)
    return row
  })

  let states: BilinearState[] = inp.springs.map(() => newBilinearState())
  let u = new Array(n).fill(0), v = new Array(n).fill(0)
  let uPrev = new Array(n).fill(0)

  /** Internal force vector and tangent at a trial u, given the committed states. */
  const internal = (uTrial: number[], st: BilinearState[]) => {
    const fs = new Array(n).fill(0)
    const Kt: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
    let pattern = ''
    inp.springs.forEach((s, r) => {
      const d = deform(uTrial, s)
      const { f, kt, yielding } = bilinearProbe(d, st[r], s.params)
      pattern += yielding ? '1' : '0'
      fs[s.i] += f
      Kt[s.i][s.i] += kt
      if (s.j != null) {
        fs[s.j] -= f
        Kt[s.j][s.j] += kt; Kt[s.i][s.j] -= kt; Kt[s.j][s.i] -= kt
      }
    })
    return { fs, Kt, pattern }
  }

  // initial acceleration: M a₀ = P₀ − C v₀ − f_s(u₀); mass-less DOFs stay at 0
  const p0 = pAt(0)
  const { fs: fs0 } = internal(u, states)
  const Cv0 = matVec(C, v)
  const a = new Array(n).fill(0)
  for (let i = 0; i < n; i++) if (inp.mass[i] > 0) a[i] = (p0[i] - Cv0[i] - fs0[i]) / inp.mass[i]

  // LU cache — refactor only when the yield pattern changes
  let luKey = '', lu: LUFactor | null = null
  const effective = (Kt: number[][]): number[][] =>
    Array.from({ length: n }, (_, i) => {
      const row = new Array<number>(n)
      for (let j = 0; j < n; j++) row[j] = Kt[i][j] + a1 * C[i][j] + (i === j ? a0 * inp.mass[i] : 0)
      return row
    })

  const uH: number[][] = []
  const peak = new Array(n).fill(0)
  const baseForce = new Array(nSteps).fill(0)
  const peakDeform = inp.springs.map(() => 0)
  let converged = true, maxIterations = 0, worstResidual = 0, yielded = false

  const record = (s: number) => {
    if (collect) uH.push([...u])
    for (let i = 0; i < n; i++) peak[i] = Math.max(peak[i], Math.abs(u[i]))
    let bf = 0
    inp.springs.forEach((sp, r) => {
      const d = deform(u, sp)
      peakDeform[r] = Math.max(peakDeform[r], Math.abs(d))
      if (sp.j == null) bf += bilinearProbe(d, states[r], sp.params).f
    })
    baseForce[s] = bf
  }
  record(0)

  for (let s = 1; s < nSteps; s++) {
    const P = pAt(s)
    const un = [...u], vn = [...v], an = [...a]
    let it = 0, dNorm = 0

    for (; it < maxIter; it++) {
      const { fs, Kt, pattern } = internal(u, states)
      // Newmark kinematics at the current trial u
      const vTrial = new Array(n), aTrial = new Array(n)
      for (let i = 0; i < n; i++) {
        vTrial[i] = a1 * (u[i] - un[i]) - a4 * vn[i] - a5 * an[i]
        aTrial[i] = a0 * (u[i] - un[i]) - a2 * vn[i] - a3 * an[i]
      }
      const Cv = matVec(C, vTrial)
      const R = new Array(n)
      for (let i = 0; i < n; i++) R[i] = P[i] - inp.mass[i] * aTrial[i] - Cv[i] - fs[i]

      if (pattern !== luKey || !lu) {
        lu = luFactor(effective(Kt))
        if (!lu) return s === 1 ? null : finish()
        luKey = pattern
      }
      const du = luSolve(lu, R)
      let dn = 0, un2 = 0
      for (let i = 0; i < n; i++) { u[i] += du[i]; dn += du[i] * du[i]; un2 += u[i] * u[i] }
      dNorm = Math.sqrt(dn) / Math.max(1, Math.sqrt(un2))
      if (dNorm <= tol) { it++; break }
    }
    if (it >= maxIter && dNorm > tol) converged = false
    maxIterations = Math.max(maxIterations, it)
    worstResidual = Math.max(worstResidual, dNorm)

    // commit: advance kinematics and the plastic state
    for (let i = 0; i < n; i++) {
      const aNext = a0 * (u[i] - un[i]) - a2 * vn[i] - a3 * an[i]
      v[i] = vn[i] + dt * (1 - gamma) * an[i] + dt * gamma * aNext
      a[i] = aNext
    }
    states = inp.springs.map((sp, r) => {
      const { resp, state } = bilinearCommit(deform(u, sp), deform(uPrev, sp), states[r], sp.params)
      if (resp.yielding) yielded = true
      return state
    })
    uPrev = [...u]
    record(s)
  }

  function finish(): NonlinearTHResult {
    let peakBaseForce = 0
    for (const b of baseForce) peakBaseForce = Math.max(peakBaseForce, Math.abs(b))
    const dissipated = states.map((st) => st.dissipated)
    return {
      steps: nSteps, u: uH, peak, baseForce, peakBaseForce,
      dissipated, totalDissipated: dissipated.reduce((x, y) => x + y, 0),
      ductility: inp.springs.map((sp, r) => {
        const uy = sp.params.Fy / sp.params.k0
        return Number.isFinite(uy) && uy > 0 ? peakDeform[r] / uy : 0
      }),
      converged, maxIterations, worstResidual, yielded,
    }
  }
  return finish()
}
