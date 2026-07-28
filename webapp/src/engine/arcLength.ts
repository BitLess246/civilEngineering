// ─────────────────────────────────────────────────────────────────────────
// ARC-LENGTH (Riks / Crisfield) path following for the plane-frame plastic
// hinge model. Completes the control trio in `nonlinearFrame`:
//
//   load control          prescribes λ, solves for d
//                         → dies AT the peak: no equilibrium exists above it.
//   displacement control  prescribes d[ctrl], solves for λ
//                         → follows a DESCENDING branch, but needs a control DOF
//                           that keeps moving, and marches in fixed Δd whatever
//                           the curvature of the path.
//   arc-length (here)     prescribes the LENGTH of the step in (d, λ) space and
//                         solves for BOTH → the step size is bounded in the
//                         combined space, it passes limit points on the sign of
//                         det(Kt) rather than on a guess, and it can shorten
//                         itself automatically where the path turns sharply.
//
// SCOPE, honestly stated. This reliably traces the ascending branch, the load
// limit point and the descending branch, and it agrees with displacement
// control point-for-point wherever both apply. TRUE SNAP-BACK — where the
// control displacement itself reverses — is detected and reported when it
// happens (`snapBack`), and the tests show one case being traced, but it is NOT
// robust: whether the branch is picked up depends on the arc length, and it
// terminates after a few steps. The obstacle is the non-smooth elastic→plastic
// switch (the hinge tangent jumps by ~10³ and changes sign), which needs a
// smoothed yield transition or a nonsmooth line search to handle properly.
// Do not rely on this for snap-back-governed problems yet.
//
// Constraint (Crisfield, generalized-spherical):
//
//   ‖Δd‖² + ψ²·Δλ²·‖Pref‖² = Δl²
//
// with Δd, Δλ the increments accumulated SINCE the start of the step. ψ = 0
// gives the cylindrical form, which is the robust default — it makes the
// constraint purely geometric and immune to the units of the load vector.
//
// Each Newton iteration splits the increment the same way displacement control
// does — δd = δd_R + δλ·δd_P — but instead of a linear constraint on one DOF,
// substituting into the sphere gives a QUADRATIC in δλ. The root that keeps the
// step moving in its current direction is taken; a step whose discriminant goes
// negative (the sphere no longer meets the equilibrium path) is retried with a
// halved arc length rather than being silently accepted.
//
// Units: geometry m, E MPa, A mm², I mm⁴, loads kN / kN·m — as `nonlinearFrame`.
// ─────────────────────────────────────────────────────────────────────────
import { luFactor, luSolve } from './fem'
import { bilinearCommit, bilinearProbe, type BilinearState } from './hysteresis'
import {
  assembleFrame,
  type NLFrameInput, type NLFrameStep, type HingeReport,
} from './nonlinearFrame'

export interface ArcLengthInput extends Omit<NLFrameInput, 'control' | 'schedule' | 'dispSchedule' | 'lambdaMax' | 'dispMax'> {
  /** Arc length Δl of one step. Default: 1/40 of `dispStop` (a displacement-like
   *  scale, since ψ = 0 makes the constraint purely geometric). */
  arcLength?: number
  /** Maximum number of arc steps (default 80). */
  arcSteps?: number
  /** Load-scaling parameter ψ (default 0 = cylindrical). */
  psi?: number
  /** How many times a failing step may halve its arc length (default 6). */
  maxCuts?: number
  /** Stop once |λ| falls back below this AFTER the peak (default: no stop). */
  lambdaStop?: number
  /** Stop once the control displacement passes this magnitude (default 0.5 m). */
  dispStop?: number
}

export interface ArcStep extends NLFrameStep {
  /** Arc length actually used for this step (after any cutting), m. */
  arc: number
  /** How many times the step had to be cut before it converged. */
  cuts: number
}

export interface ArcLengthResult {
  steps: ArcStep[]
  hinges: HingeReport[]
  d: number[]
  totalDissipated: number
  converged: boolean
  /** True when the tangent went singular and no step cut could recover. */
  mechanism: boolean
  /** True when at least one step traced a SNAP-BACK — λ and |d_ctrl| decreasing
   *  together. Reported for information; see the scope note at the top of this
   *  module — snap-back tracing is not yet robust. */
  snapBack: boolean
  /** Peak λ reached, and the control displacement there. */
  peakLambda: number
  peakDisp: number
}

const dot = (a: number[], b: number[]) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

/**
 * Sign of det(Kt) from its LU factors: the product of the signs of U's diagonal
 * times the parity of the row permutation.
 *
 * This is the predictor's direction rule. det(Kt) changes sign every time the
 * path crosses a LOAD limit point (one tangent eigenvalue passes through zero),
 * so taking sign(Δλ) = sign(det Kt) makes the step reverse into the descending
 * branch automatically — where the more obvious "continue in the direction of
 * the last increment" rule reflects off the peak and retraces the path it came
 * from.
 */
function detSign(lu: { LU: number[][]; piv: number[]; n: number }): number {
  let sign = 1
  for (let i = 0; i < lu.n; i++) if (lu.LU[i][i] < 0) sign = -sign
  // permutation parity: each transposition in the cycle decomposition flips it
  const seen = new Array(lu.n).fill(false)
  for (let i = 0; i < lu.n; i++) {
    if (seen[i]) continue
    let j = i, len = 0
    while (!seen[j]) { seen[j] = true; j = lu.piv[j]; len++ }
    if (len % 2 === 0) sign = -sign
  }
  return sign
}

/**
 * Trace the equilibrium path of a plane frame with member-end plastic hinges by
 * arc-length control. Returns null when the model cannot be assembled or the
 * control node/DOF does not exist.
 */
export function arcLengthFrame(inp: ArcLengthInput): ArcLengthResult | null {
  const asm = assembleFrame(inp as NLFrameInput)
  if (!asm) return null
  const { nodeIdx, hinges, fpos, nf, Kbeam, Pref, hingeDeform, hingeContrib, hingeCapacity } = asm

  const ctrlDir = inp.controlDir ?? 'x'
  const ctrlIdx = (() => {
    const i = nodeIdx.get(inp.controlNode)
    if (i === undefined) return undefined
    return fpos.get(i * 3 + (ctrlDir === 'x' ? 0 : 1))
  })()
  if (ctrlIdx === undefined) return null

  const tol = inp.tol ?? 1e-9
  const maxIter = inp.maxIter ?? 40
  const psi = inp.psi ?? 0
  const maxCuts = inp.maxCuts ?? 6
  const nSteps = inp.arcSteps ?? 80
  const dispStop = inp.dispStop ?? 0.5
  const arc0 = inp.arcLength ?? dispStop / 40
  const Pnorm2 = dot(Pref, Pref)

  const d = new Array(nf).fill(0)
  let dPrev = new Array(nf).fill(0)
  let lambda = 0
  const steps: ArcStep[] = []
  let mechanism = false, allConverged = true, snapBack = false
  let peakLambda = 0, peakDisp = 0

  const snapshot = () => hinges.map((h) => ({ ...h.state }))
  const restore = (snap: BilinearState[]) => hinges.forEach((h, i) => { h.state = { ...snap[i] } })

  for (let s = 0; s < nSteps; s++) {
    const d0 = [...d]
    const lam0 = lambda
    const hinge0 = snapshot()
    let arc = arc0
    let cuts = 0
    let ok = false, it = 0
    let Delta: number[] = new Array(nf).fill(0)
    let dLambda = 0
    let events = 0            // deliberate trims to land on a yield event

    for (; cuts <= maxCuts && !ok; cuts++) {
      // restart the step from its committed state
      for (let r = 0; r < nf; r++) d[r] = d0[r]
      lambda = lam0
      restore(hinge0)
      Delta = new Array(nf).fill(0)
      dLambda = 0
      let failed = false, trimmed = false

      for (it = 0; it < maxIter; it++) {
        const { fs, Kh } = hingeContrib(d)
        const R = new Array(nf).fill(0)
        for (let r = 0; r < nf; r++) {
          let kd = 0
          for (let q = 0; q < nf; q++) kd += Kbeam[r][q] * d[q]
          R[r] = lambda * Pref[r] - kd - fs[r]
        }
        const Kt: number[][] = Array.from({ length: nf }, (_, r) => {
          const row = new Array<number>(nf)
          for (let q = 0; q < nf; q++) row[q] = Kbeam[r][q] + Kh[r][q]
          return row
        })
        const lu = luFactor(Kt)
        if (!lu) { failed = true; break }

        const dR = luSolve(lu, R)
        const dP = luSolve(lu, Pref)

        let dl: number
        if (it === 0) {
          // PREDICTOR: pure tangent step of the prescribed arc length. Its sign
          // continues the previous direction of travel — this is what carries
          // the path THROUGH a limit point instead of reflecting off it.
          const denom = Math.sqrt(dot(dP, dP) + psi * psi * Pnorm2)
          if (!(denom > 1e-300)) { failed = true; break }
          const mag = arc / denom
          dl = detSign(lu) * mag

          // YIELD-EVENT LIMITING. The hinge tangent jumps from k0 to b·EI/L at
          // yield — a contrast of thousands, and negative when the hinge
          // softens. A corrector that starts on the wrong side of that switch
          // flies onto a different branch (the sphere then misses the path
          // entirely). So trim the step to land just PAST the first crossing,
          // exactly as the event-to-event pushover does, and let the next step
          // start with an unambiguous tangent.
          if (events < 3) {
            let alpha = 1
            for (const h of hinges) {
              const Fy = hingeCapacity(d, h)
              if (!Number.isFinite(Fy)) continue
              const θ = hingeDeform(d, h)
              const rate = hingeDeform(dP, h) * dl           // Δθ over this predictor
              if (Math.abs(rate) < 1e-300) continue
              const yieldθ = Fy / h.k0
              if (Math.abs(θ - h.state.up) >= yieldθ * (1 - 1e-12)) continue   // already yielding
              const target = h.state.up + Math.sign(rate) * yieldθ
              const a = (target - θ) / rate
              if (a > 1e-9 && a < alpha) alpha = a
            }
            if (alpha < 1) {
              // land a hair past the event so the state is unambiguous, but
              // never take a vanishing step
              arc *= Math.max(alpha * 1.001, 0.02)
              events++
              trimmed = true
              break
            }
          }
        } else {
          // CORRECTOR: pick δλ so the updated increment lands back on the sphere
          //   ‖Δd + δd_R + δλ·δd_P‖² + ψ²(Δλ + δλ)²‖Pref‖² = Δl²
          const u = new Array(nf)
          for (let r = 0; r < nf; r++) u[r] = Delta[r] + dR[r]
          const a = dot(dP, dP) + psi * psi * Pnorm2
          const b = 2 * (dot(u, dP) + psi * psi * dLambda * Pnorm2)
          const c = dot(u, u) + psi * psi * dLambda * dLambda * Pnorm2 - arc * arc
          let disc = b * b - 4 * a * c
          // A sphere TANGENT to the path has disc = 0, and round-off pushes it
          // slightly negative — which happens exactly at the elastic→yielded
          // switch, where the tangent stiffness jumps by orders of magnitude.
          // Treat a negligibly negative discriminant as the double root rather
          // than declaring the step failed; only a genuine miss cuts the arc.
          if (disc < 0 && disc > -1e-8 * Math.max(b * b, Math.abs(4 * a * c))) disc = 0
          if (!(a > 1e-300) || disc < 0) { failed = true; break }   // sphere misses the path → cut
          const sq = Math.sqrt(disc)
          const r1 = (-b + sq) / (2 * a), r2 = (-b - sq) / (2 * a)
          // keep the root whose resulting increment stays closest in direction
          // to the increment so far (Crisfield's angle criterion)
          const cos = (root: number) => {
            let v = 0
            for (let r = 0; r < nf; r++) v += (u[r] + root * dP[r]) * Delta[r]
            return v
          }
          dl = dot(Delta, Delta) > 1e-300 ? (cos(r1) >= cos(r2) ? r1 : r2)
            : (Math.abs(r1) <= Math.abs(r2) ? r1 : r2)
        }

        let dn = 0, dnorm = 0
        for (let r = 0; r < nf; r++) {
          const inc = (it === 0 ? 0 : dR[r]) + dl * dP[r]
          d[r] += inc; Delta[r] += inc
          dn += inc * inc; dnorm += d[r] * d[r]
        }
        lambda += dl; dLambda += dl

        // the predictor is never a convergence test — it has no residual behind it
        if (it > 0 && Math.sqrt(dn) / Math.max(1, Math.sqrt(dnorm)) <= tol) { it++; ok = true; break }
      }

      if (ok) break
      // an event trim has already set the arc for the retry, and is not a
      // failure — don't halve on top of it, and don't spend a cut on it
      if (trimmed) { cuts--; continue }
      if (failed || !ok) arc *= 0.5          // genuine failure: retry shorter
    }

    if (!ok) {
      // Exhausted the cuts. Restore the last CONVERGED state so the returned
      // `d` and hinge report describe an equilibrium point rather than a
      // half-finished iterate. (λ is not restored — it is not returned, and the
      // last accepted value is already recorded in `steps`.)
      for (let r = 0; r < nf; r++) d[r] = d0[r]
      restore(hinge0)
      mechanism = true
      allConverged = false
      break
    }

    // Snap-back: the load falls AND the control displacement retreats toward
    // the origin. Tested on |d_ctrl| rather than the signed increment — the
    // cantilever below deflects in −y, so a negative increment is the NORMAL
    // direction of travel, not a reversal.
    if (dLambda < 0 && Math.abs(d[ctrlIdx]) < Math.abs(d0[ctrlIdx]) && steps.length > 0) snapBack = true

    // commit hinge plastic state for the accepted step
    let yielded = 0
    for (const h of hinges) {
      const θ = hingeDeform(d, h), θp = hingeDeform(dPrev, h)
      const { resp, state } = bilinearCommit(θ, θp, h.state, { k0: h.k0, Fy: hingeCapacity(d, h), b: h.b })
      h.state = state
      if (resp.yielding) yielded++
    }
    dPrev = [...d]

    if (lambda > peakLambda) { peakLambda = lambda; peakDisp = d[ctrlIdx] }
    steps.push({
      lambda, disp: d[ctrlIdx], load: lambda * Pref[ctrlIdx],
      hinges: yielded, converged: true, iterations: it,
      arc, cuts,
    })

    if (Math.abs(d[ctrlIdx]) >= dispStop) break
    if (inp.lambdaStop !== undefined && steps.length > 2 && lambda < inp.lambdaStop) break
  }

  const report: HingeReport[] = hinges.map((h) => {
    const θ = hingeDeform(d, h)
    const { f: M, yielding } = bilinearProbe(θ, h.state, { k0: h.k0, Fy: hingeCapacity(d, h), b: h.b })
    return {
      member: h.member, end: h.end, moment: M, rotation: θ,
      plastic: h.state.up, yielded: yielding || h.state.cumPlastic > 0,
      dissipated: h.state.dissipated,
    }
  })

  return {
    steps, hinges: report, d,
    totalDissipated: report.reduce((s, h) => s + h.dissipated, 0),
    converged: allConverged, mechanism, snapBack,
    peakLambda, peakDisp,
  }
}
