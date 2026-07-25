// ─────────────────────────────────────────────────────────────────────────
// DIRECT-INTEGRATION time-history analysis on the full MDOF system with
// RAYLEIGH damping — the companion to the modal-superposition path in
// `timeHistory.ts` (which decouples the system and can only carry a constant
// modal ζ). Layer L5.
//
//   M ü + C u̇ + K u = P(t),      C = α·M + β·K      (Rayleigh)
//
// integrated step-by-step with Newmark-β (average acceleration β=¼, γ=½ →
// unconditionally stable). The effective stiffness
//   K̂ = K + a0·M + a1·C,   a0 = 1/(β·dt²),  a1 = γ/(β·dt)
// is CONSTANT for a fixed dt, so it is LU-factored ONCE and reused for every
// step — the same shared-factorization discipline the static solver uses.
//
// Why this and not modal superposition:
//   • no mode truncation — every free DOF participates,
//   • damping need not be diagonalizable by the modes (prerequisite for
//     nonlinear time-history, where modes stop existing),
//   • frequency-dependent ζ(ω) = α/(2ω) + β·ω/2 is the physical Rayleigh model.
//
// Mass model: LUMPED translational (same source as modal.ts — `buildSeismicMass`).
// Rotational DOFs carry no mass, so M is singular; that is harmless here because
// K̂ = (1+a1·β)·K + (a0+a1·α)·M stays non-singular whenever K is.
//
// Diaphragm constraints are NOT applied on this path (same as `modal.ts`, which
// also calls `precomputeFrame` without diaphragm groups).
//
// Units: mass tonnes, K kN/m, a_g m/s², u m, base shear kN (t·m/s² = kN), dt s.
// Refs: Newmark (1959); Chopra, Dynamics of Structures §16.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from './model'
import { precomputeFrame } from './frame3d'
import { modelToFrame3D } from './modelBridge'
import { luFactor, luSolve, matVec } from './fem'
import { buildSeismicMass, modalAnalysis } from './modal'
import { validateMesh, hasMeshErrors } from './meshValidation'
import type { GroundMotion } from './timeHistory'

// ── Rayleigh damping ─────────────────────────────────────────────────────

export interface RayleighCoeffs { alpha: number; beta: number }

/**
 * Rayleigh coefficients that produce damping ratios ζ₁ at ω₁ and ζ₂ at ω₂:
 *   ζ(ω) = α/(2ω) + β·ω/2
 *   α = 2·ω₁·ω₂·(ζ₁·ω₂ − ζ₂·ω₁)/(ω₂² − ω₁²)
 *   β = 2·(ζ₂·ω₂ − ζ₁·ω₁)/(ω₂² − ω₁²)
 * ω₁ ≠ ω₂ required (returns mass-proportional-only when they coincide).
 */
export function rayleighCoeffs(w1: number, z1: number, w2: number, z2: number): RayleighCoeffs {
  const d = w2 * w2 - w1 * w1
  if (!(Math.abs(d) > 1e-12)) return { alpha: w1 > 0 ? 2 * z1 * w1 : 0, beta: 0 }
  return {
    alpha: (2 * w1 * w2 * (z1 * w2 - z2 * w1)) / d,
    beta: (2 * (z2 * w2 - z1 * w1)) / d,
  }
}

/** Damping ratio the Rayleigh model delivers at circular frequency ω. */
export function rayleighZeta(c: RayleighCoeffs, omega: number): number {
  return omega > 0 ? c.alpha / (2 * omega) + (c.beta * omega) / 2 : 0
}

// ── Newmark direct integration (pure matrix level) ───────────────────────

export interface DirectNewmarkOpts {
  beta?: number
  gamma?: number
  /** Initial displacement / velocity vectors (default zero). */
  u0?: number[]
  v0?: number[]
  /**
   * Per-step observer. The arrays passed are REUSED between steps — copy what
   * you keep. Lets a caller track peaks without retaining the whole history.
   */
  onStep?: (step: number, u: number[], v: number[], a: number[]) => void
  /** Collect the full u/v/a histories in the result (default true). */
  collect?: boolean
}

export interface DirectResult {
  /** Displacement history per step (empty when `collect: false`). */
  u: number[][]
  v: number[][]
  a: number[][]
  steps: number
}

/**
 * Newmark-β direct integration of `M ü + C u̇ + K u = P(t)` for a linear MDOF
 * system. `P` is either the full nStep×n forcing or a generator `P(step)`;
 * `nSteps` is required with the generator form. Returns null when K̂ is
 * singular (the LU pivot check fails).
 */
export function newmarkDirect(
  M: number[][], C: number[][], K: number[][],
  P: number[][] | ((step: number) => number[]),
  dt: number, opts?: DirectNewmarkOpts & { nSteps?: number },
): DirectResult | null {
  const n = K.length
  const isFn = typeof P === 'function'
  const nSteps = isFn ? (opts?.nSteps ?? 0) : (P as number[][]).length
  const pAt = isFn ? (P as (s: number) => number[]) : (s: number) => (P as number[][])[s]
  const collect = opts?.collect !== false
  if (n === 0 || nSteps === 0) return { u: [], v: [], a: [], steps: 0 }

  const beta = opts?.beta ?? 0.25
  const gamma = opts?.gamma ?? 0.5
  // Newmark constants (Chopra Table 16.2.2)
  const a0 = 1 / (beta * dt * dt), a1 = gamma / (beta * dt)
  const a2 = 1 / (beta * dt), a3 = 1 / (2 * beta) - 1
  const a4 = gamma / beta - 1, a5 = dt * (gamma / (2 * beta) - 1)

  // K̂ = K + a0·M + a1·C — constant for fixed dt, factored once
  const Khat: number[][] = Array.from({ length: n }, (_, i) => {
    const row = new Array<number>(n)
    for (let j = 0; j < n; j++) row[j] = K[i][j] + a0 * M[i][j] + a1 * C[i][j]
    return row
  })
  const lu = luFactor(Khat)
  if (!lu) return null

  let u = opts?.u0 ? [...opts.u0] : new Array(n).fill(0)
  let v = opts?.v0 ? [...opts.v0] : new Array(n).fill(0)
  // a₀ = M⁻¹(P₀ − C·v₀ − K·u₀); M is singular on rotational DOFs, so seed the
  // acceleration only where mass exists (zero elsewhere — those DOFs are
  // stiffness-slaved and carry no inertia).
  const p0 = pAt(0), Cv0 = matVec(C, v), Ku0 = matVec(K, u)
  const a = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    const mi = M[i][i]
    if (mi > 0) a[i] = (p0[i] - Cv0[i] - Ku0[i]) / mi
  }

  const uH: number[][] = [], vH: number[][] = [], aH: number[][] = []
  const push = () => { if (collect) { uH.push([...u]); vH.push([...v]); aH.push([...a]) } }
  push()
  opts?.onStep?.(0, u, v, a)

  const rhs = new Array(n).fill(0)
  for (let s = 1; s < nSteps; s++) {
    const p = pAt(s)
    // P̂ = P + M(a0·u + a2·v + a3·a) + C(a1·u + a4·v + a5·a)
    const mTerm = matVec(M, u.map((ui, i) => a0 * ui + a2 * v[i] + a3 * a[i]))
    const cTerm = matVec(C, u.map((ui, i) => a1 * ui + a4 * v[i] + a5 * a[i]))
    for (let i = 0; i < n; i++) rhs[i] = p[i] + mTerm[i] + cTerm[i]

    const uNext = luSolve(lu, rhs)
    const aNext = new Array(n)
    const vNext = new Array(n)
    for (let i = 0; i < n; i++) {
      aNext[i] = a0 * (uNext[i] - u[i]) - a2 * v[i] - a3 * a[i]
      vNext[i] = v[i] + dt * (1 - gamma) * a[i] + dt * gamma * aNext[i]
    }
    u = uNext; v = vNext
    for (let i = 0; i < n; i++) a[i] = aNext[i]
    push()
    opts?.onStep?.(s, u, v, a)
  }
  return { u: uH, v: vH, a: aH, steps: nSteps }
}

// ── Model-level driver ───────────────────────────────────────────────────

export interface DirectTHOpts extends DirectNewmarkOpts {
  /** Explicit Rayleigh coefficients. Takes precedence over the ζ/mode form. */
  rayleigh?: RayleighCoeffs
  /** Target damping ratio for the two anchor modes (default 0.05). */
  zeta?: number
  /** 1-based mode numbers the Rayleigh curve is anchored to (default 1 and 3). */
  anchorModes?: [number, number]
  /** Full displacement history of this node is returned in `nodeHistory`. */
  historyNode?: string
}

export interface DirectTHResult {
  t: number[]
  dir: 0 | 1 | 2
  /** Rayleigh coefficients actually used. */
  rayleigh: RayleighCoeffs
  /** ζ the Rayleigh curve delivers at each anchor frequency. */
  anchors: { omega: number; zeta: number }[]
  /** Free DOFs integrated (the full MDOF system size). */
  ndof: number
  /** Total base shear (inertia) history in the excitation direction, kN. */
  baseShear: number[]
  peakBaseShear: number
  /** Peak |displacement| per node, per global direction [X,Y,Z], m. */
  peakDisp: Record<string, [number, number, number]>
  peakNode: string | null
  peakNodeDisp: number
  nodeHistory?: { node: string; u: [number, number, number][] }
}

/**
 * Direct-integration time-history of a structural model under uniform ground
 * acceleration, with Rayleigh damping anchored to two modes. Returns null when
 * the mesh is invalid, K is singular, or the record is empty.
 */
export function directTimeHistory(
  model: StructuralModel, gm: GroundMotion, opts?: DirectTHOpts,
): DirectTHResult | null {
  if (gm.ag.length === 0) return null
  if (hasMeshErrors(validateMesh(model))) return null
  const br = modelToFrame3D(model, { useShells: false })
  const pre = precomputeFrame(br.nodes, br.members, br.supports)
  const K = pre.Kff_raw
  const nf = K.length
  if (nf === 0) return null

  // lumped mass on free translational DOFs (tonnes) — diagonal M
  const massByNode = buildSeismicMass(model)
  const mVec = new Array(nf).fill(0)
  /** free-DOF position → [nodeId, direction] for the massive translational DOFs */
  const dofNode: { fpos: number; node: string; dir: 0 | 1 | 2 }[] = []
  for (const [nodeId, m] of massByNode) {
    if (m <= 0) continue
    const ni = pre.idx.get(nodeId)
    if (ni === undefined) continue
    for (let d = 0 as 0 | 1 | 2; d < 3; d = (d + 1) as 0 | 1 | 2) {
      const fpos = pre.freeIdx.get(6 * ni + d)
      if (fpos === undefined) continue
      mVec[fpos] += m
      dofNode.push({ fpos, node: nodeId, dir: d })
    }
  }
  if (!mVec.some((m) => m > 0)) return null

  // Rayleigh coefficients — explicit, or anchored to two modal frequencies
  let ray = opts?.rayleigh
  const anchors: { omega: number; zeta: number }[] = []
  if (!ray) {
    const zeta = opts?.zeta ?? 0.05
    const [m1, m2] = opts?.anchorModes ?? [1, 3]
    const modal = modalAnalysis(model, Math.max(m1, m2))
    const w1 = modal?.modes[m1 - 1]?.omega
    const w2 = modal?.modes[m2 - 1]?.omega
    ray = w1 && w2 && Math.abs(w2 - w1) > 1e-9
      ? rayleighCoeffs(w1, zeta, w2, zeta)
      : { alpha: w1 ? 2 * zeta * w1 : 0, beta: 0 }   // single mode available
    if (w1) anchors.push({ omega: w1, zeta: rayleighZeta(ray, w1) })
    if (w2) anchors.push({ omega: w2, zeta: rayleighZeta(ray, w2) })
  }

  // M (diagonal) and C = αM + βK as dense matrices for the integrator
  const M: number[][] = Array.from({ length: nf }, (_, i) => {
    const row = new Array(nf).fill(0); row[i] = mVec[i]; return row
  })
  const C: number[][] = Array.from({ length: nf }, (_, i) => {
    const row = new Array<number>(nf)
    for (let j = 0; j < nf; j++) row[j] = ray!.beta * K[i][j] + (i === j ? ray!.alpha * mVec[i] : 0)
    return row
  })

  // P(t) = −M·ι·a_g(t): influence vector ι is 1 on free translational DOFs in `dir`
  const iota = new Array(nf).fill(0)
  for (const d of dofNode) if (d.dir === gm.dir) iota[d.fpos] = 1
  const mIota = mVec.map((m, i) => m * iota[i])
  const nSteps = gm.ag.length
  const pAt = (s: number): number[] => mIota.map((mi) => -mi * gm.ag[s])

  // integrate, tracking peaks per node (never retaining the whole field)
  const peakDisp: Record<string, [number, number, number]> = {}
  for (const d of dofNode) if (!peakDisp[d.node]) peakDisp[d.node] = [0, 0, 0]
  const baseShear = new Array(nSteps).fill(0)
  const histNode = opts?.historyNode
  const hist: [number, number, number][] | null =
    histNode && peakDisp[histNode] ? Array.from({ length: nSteps }, () => [0, 0, 0] as [number, number, number]) : null

  const res = newmarkDirect(M, C, K, pAt, gm.dt, {
    ...opts, nSteps, collect: false,
    onStep: (s, u, _v, acc) => {
      let vb = 0
      for (const d of dofNode) {
        const ud = Math.abs(u[d.fpos])
        if (ud > peakDisp[d.node][d.dir]) peakDisp[d.node][d.dir] = ud
        if (hist && d.node === histNode) hist[s][d.dir] = u[d.fpos]
        // total inertia force in the excitation direction = base shear
        if (d.dir === gm.dir) vb += mVec[d.fpos] * (acc[d.fpos] + gm.ag[s])
      }
      baseShear[s] = vb
    },
  })
  if (!res) return null

  let peakBaseShear = 0
  for (const vb of baseShear) peakBaseShear = Math.max(peakBaseShear, Math.abs(vb))
  let peakNode: string | null = null, peakNodeDisp = 0
  for (const [id, p] of Object.entries(peakDisp)) {
    const mag = Math.hypot(p[0], p[1], p[2])
    if (mag > peakNodeDisp) { peakNodeDisp = mag; peakNode = id }
  }

  return {
    t: Array.from({ length: nSteps }, (_, i) => i * gm.dt),
    dir: gm.dir, rayleigh: ray!, anchors, ndof: nf,
    baseShear, peakBaseShear, peakDisp, peakNode, peakNodeDisp,
    ...(hist ? { nodeHistory: { node: histNode!, u: hist } } : {}),
  }
}
