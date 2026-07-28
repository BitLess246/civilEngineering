// ─────────────────────────────────────────────────────────────────────────
// NONLINEAR DYNAMIC analysis of a plane frame with distributed member-end
// plastic hinges — Newmark-β + Newton-Raphson over the FRAME DOFs. Layer L5.
//
//   M ü + C u̇ + f_int(u) = P(t),      C = α·M + β·K₀
//
// This is the dynamic counterpart of `nonlinearFrame` (load control) and the
// successor to `nonlinearModel`'s storey-spring reduction: plasticity now lives
// at real member ends, so the shear-type (strong-beam/weak-column) idealization
// the reduction had to assume is gone — a beam-hinging frame hinges in its
// beams, because every member end has its own hinge.
//
// Both drivers share `assembleFrame`, so geometry, the hinge DOF map and the
// hysteretic state are identical between a pushover and a time history.
//
// Mass: LUMPED translational at the nodes. Rotational DOFs — including the
// extra hinge rotations — carry no mass, so M is singular; harmless, because
// K̂ = K + a₀M + a₁C stays non-singular whenever K does (same argument as
// `directTimeHistory`).
//
// Units: mass tonnes, force kN, displacement m, dt s.
// ─────────────────────────────────────────────────────────────────────────
import { luFactor, luSolve } from './fem'
import { bilinearProbe, bilinearCommit } from './hysteresis'
import { assembleFrame, type NLFrameInput, type HingeReport } from './nonlinearFrame'
import type { RayleighCoeffs } from './directTimeHistory'

export interface NLDynamicInput extends Omit<NLFrameInput, 'schedule' | 'steps' | 'lambdaMax'> {
  /** Lumped mass per node id, tonnes. Nodes absent carry no mass. */
  mass: Record<string, number>
  rayleigh: RayleighCoeffs
  /** Ground acceleration record, m/s². */
  ag: number[]
  dt: number
  /** Excitation direction (default 'x'). */
  dir?: 'x' | 'y'
  beta?: number
  gamma?: number
}

export interface NLDynamicResult {
  t: number[]
  /** Control-node displacement history, m. */
  disp: number[]
  peakDisp: number
  /** Total inertia (base shear) history in the excitation direction, kN. */
  baseShear: number[]
  peakBaseShear: number
  hinges: HingeReport[]
  totalDissipated: number
  /** Hinges that yielded at any point in the record. */
  yieldedHinges: number
  converged: boolean
  maxIterations: number
  /** Free DOFs integrated (includes the extra hinge rotations). */
  ndof: number
}

/**
 * Newmark-β nonlinear time history of a plane frame with member-end hinges.
 * Returns null when the frame cannot be assembled or the record is empty.
 */
export function nonlinearFrameDynamic(inp: NLDynamicInput): NLDynamicResult | null {
  if (inp.ag.length === 0) return null
  const asm = assembleFrame(inp)
  if (!asm) return null
  const { nodeIdx, hinges, fpos, nf, Kbeam, hingeDeform, hingeContrib, hingeCapacity } = asm
  if (nf === 0) return null

  const dt = inp.dt, beta = inp.beta ?? 0.25, gamma = inp.gamma ?? 0.5
  const tol = inp.tol ?? 1e-10, maxIter = inp.maxIter ?? 30
  const dirOff = (inp.dir ?? 'x') === 'x' ? 0 : 1
  const a0 = 1 / (beta * dt * dt), a1 = gamma / (beta * dt)
  const a2 = 1 / (beta * dt), a3 = 1 / (2 * beta) - 1
  const a4 = gamma / beta - 1, a5 = dt * (gamma / (2 * beta) - 1)

  // lumped translational mass on the free DOFs
  const mVec = new Array(nf).fill(0)
  /** free-DOF positions carrying mass in the excitation direction */
  const inertiaDofs: number[] = []
  for (const [id, m] of Object.entries(inp.mass)) {
    if (!(m > 0)) continue
    const ni = nodeIdx.get(id)
    if (ni === undefined) continue
    for (const off of [0, 1]) {
      const p = fpos.get(ni * 3 + off)
      if (p === undefined) continue
      mVec[p] += m
      if (off === dirOff) inertiaDofs.push(p)
    }
  }
  if (!mVec.some((m) => m > 0)) return null

  // C = αM + βK₀ where K₀ is the ELASTIC frame (beam + unyielded hinges)
  const { Kh: Kh0 } = hingeContrib(new Array(nf).fill(0))
  const { alpha, beta: bRay } = inp.rayleigh
  const C: number[][] = Array.from({ length: nf }, (_, i) => {
    const row = new Array<number>(nf)
    for (let j = 0; j < nf; j++) row[j] = bRay * (Kbeam[i][j] + Kh0[i][j]) + (i === j ? alpha * mVec[i] : 0)
    return row
  })

  // P(t) = −M·ι·a_g(t)
  const iota = new Array(nf).fill(0)
  for (const p of inertiaDofs) iota[p] = 1
  const mIota = mVec.map((m, i) => m * iota[i])

  const ctrlDof = (() => {
    const i = nodeIdx.get(inp.controlNode)
    if (i === undefined) return undefined
    return fpos.get(i * 3 + ((inp.controlDir ?? 'x') === 'x' ? 0 : 1))
  })()

  const n = inp.ag.length
  const u = new Array(nf).fill(0), v = new Array(nf).fill(0)
  let uPrev = new Array(nf).fill(0)

  // initial acceleration on the massive DOFs
  const { fs: fs0 } = hingeContrib(u)
  const a = new Array(nf).fill(0)
  for (let i = 0; i < nf; i++) if (mVec[i] > 0) a[i] = (-mIota[i] * inp.ag[0] - fs0[i]) / mVec[i]

  const disp = new Array(n).fill(0)
  const baseShear = new Array(n).fill(0)
  let converged = true, maxIterations = 0
  const record = (s: number) => {
    disp[s] = ctrlDof !== undefined ? u[ctrlDof] : 0
    let vb = 0
    for (const p of inertiaDofs) vb += mVec[p] * (a[p] + inp.ag[s])
    baseShear[s] = vb
  }
  record(0)

  for (let s = 1; s < n; s++) {
    const un = [...u], vn = [...v], an = [...a]
    let it = 0, dNorm = 0
    for (; it < maxIter; it++) {
      const { fs, Kh } = hingeContrib(u)
      const R = new Array(nf).fill(0)
      for (let i = 0; i < nf; i++) {
        const aT = a0 * (u[i] - un[i]) - a2 * vn[i] - a3 * an[i]
        let kd = 0, cv = 0
        for (let j = 0; j < nf; j++) {
          kd += Kbeam[i][j] * u[j]
          cv += C[i][j] * (a1 * (u[j] - un[j]) - a4 * vn[j] - a5 * an[j])
        }
        R[i] = -mIota[i] * inp.ag[s] - mVec[i] * aT - cv - kd - fs[i]
      }
      const Kt: number[][] = Array.from({ length: nf }, (_, i) => {
        const row = new Array<number>(nf)
        for (let j = 0; j < nf; j++) row[j] = Kbeam[i][j] + Kh[i][j] + a1 * C[i][j] + (i === j ? a0 * mVec[i] : 0)
        return row
      })
      const lu = luFactor(Kt)
      if (!lu) return null
      const du = luSolve(lu, R)
      let dn = 0, nrm = 0
      for (let i = 0; i < nf; i++) { u[i] += du[i]; dn += du[i] * du[i]; nrm += u[i] * u[i] }
      dNorm = Math.sqrt(dn) / Math.max(1, Math.sqrt(nrm))
      if (dNorm <= tol) { it++; break }
    }
    if (it >= maxIter && dNorm > tol) converged = false
    maxIterations = Math.max(maxIterations, it)

    for (let i = 0; i < nf; i++) {
      const aNext = a0 * (u[i] - un[i]) - a2 * vn[i] - a3 * an[i]
      v[i] = vn[i] + dt * (1 - gamma) * an[i] + dt * gamma * aNext
      a[i] = aNext
    }
    for (const h of hinges) {
      const { state } = bilinearCommit(hingeDeform(u, h), hingeDeform(uPrev, h), h.state,
        { k0: h.k0, Fy: hingeCapacity(u, h), b: h.b })
      h.state = state
    }
    uPrev = [...u]
    record(s)
  }

  const report: HingeReport[] = hinges.map((h) => {
    const θ = hingeDeform(u, h)
    const { f: M, yielding } = bilinearProbe(θ, h.state, { k0: h.k0, Fy: hingeCapacity(u, h), b: h.b })
    return {
      member: h.member, end: h.end, moment: M, rotation: θ,
      plastic: h.state.up, yielded: yielding || h.state.cumPlastic > 0,
      dissipated: h.state.dissipated,
    }
  })

  return {
    t: Array.from({ length: n }, (_, i) => i * dt),
    disp, peakDisp: Math.max(...disp.map(Math.abs)),
    baseShear, peakBaseShear: Math.max(...baseShear.map(Math.abs)),
    hinges: report,
    totalDissipated: report.reduce((s, h) => s + h.dissipated, 0),
    yieldedHinges: report.filter((h) => h.yielded).length,
    converged, maxIterations, ndof: nf,
  }
}
