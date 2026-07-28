// ─────────────────────────────────────────────────────────────────────────
// BIAXIAL (P–My–Mz) PLASTIC HINGE — the constitutive law. Layer L5.
//
// `hysteresis.ts` gives a 1-D hinge: one moment, one rotation, yield at ±Fy.
// A column in a real 3-D frame bends about BOTH local axes at once, and the
// section yields on a surface in (P, My, Mz) — not independently per axis.
// Running two uncoupled 1-D hinges is unconservative exactly where it matters:
// a corner column under skew seismic input can sit at My = 0.8·Mpy AND
// Mz = 0.8·Mpz, which two 1-D hinges call elastic and the real section calls
// well past yield.
//
// This module is the 2-D generalisation: moment VECTOR M = (My, Mz), rotation
// vector θ = (θy, θz), and a yield surface Φ(M, P) ≤ 0 coupling them. It is a
// pure constitutive law — no frame, no DOFs. `nonlinearFrame3d` (next phase)
// consumes it the way `nonlinearFrame` consumes `bilinearProbe`.
//
// FORMULATION — vector return mapping with kinematic hardening, the direct
// 2-D lift of the 1-D algebra in `hysteresis.ts`. The moment splits into a
// hardening branch and a perfectly-plastic branch:
//
//     M = b∘k₀∘θ  +  Mp,      Mp = kp∘(θ − θp),  kp = (1−b)∘k₀
//
// with Mp confined to the surface scaled by (1−b). ∘ is componentwise: the two
// axes have their own stiffness, capacity and hardening ratio; only the YIELD
// SURFACE couples them. Consequences, all pinned by tests:
//   • initial tangent is diag(k₀y, k₀z) — an unyielded hinge is uncoupled
//   • uniaxial loading reproduces `bilinearProbe` to machine precision
//   • unloading freezes θp, so the tangent snaps back to k₀ (kinematic)
//
// Plastic flow is ASSOCIATIVE: θ̇p = γ̇·∂Φ/∂M, so the plastic rotation increment
// is normal to the yield surface. Return mapping is closest-point projection —
// a 3×3 Newton in (My, Mz, Δγ) — and the tangent handed back is the ALGORITHMIC
// (consistent) tangent of that map, not the continuum one. That distinction is
// what preserves Newton's quadratic convergence in the frame solve above; a
// test finite-differences the returned tangent against the map itself.
//
// YIELD SURFACES
//  • 'orbison'  Orbison (1982), the standard surface for compact I-shapes in
//    plastic-hinge frame analysis — McGuire, Gallagher & Ziemian, *Matrix
//    Structural Analysis* 2nd ed. Eq. 10.18:
//        Φ = 1.15p² + m_z² + m_y⁴ + 3.67p²m_z² + 3p⁶m_y² + 4.65m_z²m_y⁴ − 1
//    with p = P/Py, m_z = Mz/Mpz (strong axis), m_y = My/Mpy (weak axis). Even
//    powers only, so it is C^∞ with a bounded Hessian everywhere — which is why
//    the return map is well behaved right at the uniaxial states that dominate.
//    Axial force enters the surface DIRECTLY, so pass the pure-bending Mpy/Mpz.
//    Note the fit gives pure-axial squash at p = 1/√1.15 = 0.933, not 1.0 —
//    slightly conservative in near-pure compression, and tested as such.
//  • 'power'    Φ = |m_y|^α + |m_z|^α − 1, the Bresler load contour (ACI 318-14
//    R22.4 / Bresler 1960). α = 2 (default) is the ellipse; α ≈ 1.5 is the usual
//    RC column fit; α = 1 is the linear AISC §H1-1b-style chord. This surface
//    does NOT see P — reduce Mpy/Mpz first with `reducedBiaxialCapacities`.
//
// Units: moments kN·m, rotations rad, stiffness kN·m/rad, axial kN.
// Refs: Simo & Hughes, *Computational Inelasticity* Box 3.2 (return mapping and
// the consistent tangent); McGuire/Gallagher/Ziemian §10.3; Bresler (1960).
// ─────────────────────────────────────────────────────────────────────────
import { reducedPlasticMoment, type PmKind } from './pmInteraction'

/** Which surface couples the two bending axes. */
export type BiaxialSurfaceSpec =
  /**
   * Bresler load contour |m_y|^α + |m_z|^α = 1. Capacities must be P-reduced.
   *
   * Useful range is roughly α ∈ [1, 6]: 1 is the linear chord, 1.15–1.55 the
   * usual RC column fits, 2 the ellipse. Beyond ~6 the contour approaches a
   * sharp-cornered box — the uncoupled limit — where the normal swings almost
   * discontinuously near the axes and the return map stops converging reliably.
   * Measured on a two-storey frame, α = 20 failed to converge on most steps.
   * If you want genuinely uncoupled axes, run two 1-D hinges, not α → ∞.
   */
  | { kind: 'power'; alpha?: number }
  /** Orbison steel surface; takes P/Py directly, so capacities stay pure-bending. */
  | { kind: 'orbison' }

export interface BiaxialHingeParams {
  /** Elastic hinge stiffness about local y (weak) and z (strong), kN·m/rad. */
  k0y: number
  k0z: number
  /** Plastic moment capacity about local y and z, kN·m. Infinity = no hinge on
   *  that axis (the axis then stays elastic and the surface degenerates to 1-D). */
  Mpy: number
  Mpz: number
  /** Post-yield stiffness ratios, as a fraction of k₀ on that axis (default 0). */
  by?: number
  bz?: number
  /** Normalised axial force p = P/Py, signed. Only 'orbison' reads it. */
  p?: number
  /** Default: elliptical power surface (α = 2). */
  surface?: BiaxialSurfaceSpec
}

/** Evolving plastic state of one biaxial hinge. */
export interface BiaxialState {
  /** Plastic rotation about local y and z, rad — the kinematic back-rotation. */
  thpY: number
  thpZ: number
  /** Cumulative plastic rotation path length √(Δθpy² + Δθpz²) — a ductility odometer. */
  cumPlastic: number
  /** Energy dissipated by hysteresis so far, ∫M·dθp, kN·m. */
  dissipated: number
}

export const newBiaxialState = (): BiaxialState =>
  ({ thpY: 0, thpZ: 0, cumPlastic: 0, dissipated: 0 })

export interface BiaxialResponse {
  /** Moment about local y (weak axis), kN·m. */
  My: number
  /** Moment about local z (strong axis), kN·m. */
  Mz: number
  /** Consistent tangent, kN·m/rad: kt[r][c] = ∂M_r/∂θ_c with r,c ordered (y, z). */
  kt: [[number, number], [number, number]]
  /** True when this step is on the yielding branch. */
  yielding: boolean
  /** Yield-surface value at the returned moment (≤ 0 elastic, ≈ 0 while yielding). */
  phi: number
  /** Plastic multiplier increment of this step (0 when elastic). */
  dGamma: number
  /** False when the return-map Newton hit its iteration cap. */
  converged: boolean
}

/**
 * Capacity floor, kN·m. `reducedPlasticMoment` legitimately returns 0 at
 * P = Pcap, and a zero-size yield surface makes the normalised moments
 * singular. Flooring keeps the projection well posed while leaving the hinge
 * with, for all engineering purposes, no moment capacity at all.
 */
const CAP_FLOOR = 1e-9

/**
 * Regularisation of |m|^α as (m² + ε²)^(α/2). For α < 2 the exact power has an
 * unbounded second derivative at m = 0 — precisely the uniaxial state every
 * beam sits in — which would wreck the Newton Hessian. ε = 1e-6 bounds it while
 * shifting the surface by ε^α ≈ 1e-9, far below any tolerance here (tested).
 * For α ≥ 2 the regularisation is inactive to the same order.
 */
const EPS_REG = 1e-6

/** Surface value, gradient and Hessian in NORMALISED moment space (m_y, m_z). */
interface SurfaceEval {
  phi: number
  gy: number; gz: number
  hyy: number; hyz: number; hzz: number
}

function powerSurface(my: number, mz: number, alpha: number): SurfaceEval {
  // g(m) = (m² + ε²)^(α/2), with its first two derivatives
  const g = (m: number): [number, number, number] => {
    const r = m * m + EPS_REG * EPS_REG
    const h = alpha / 2
    const p0 = Math.pow(r, h)
    const p1 = Math.pow(r, h - 1)
    return [p0, alpha * m * p1, alpha * p1 + alpha * (alpha - 2) * m * m * Math.pow(r, h - 2)]
  }
  const [py, dy, ddy] = g(my)
  const [pz, dz, ddz] = g(mz)
  return { phi: py + pz - 1, gy: dy, gz: dz, hyy: ddy, hyz: 0, hzz: ddz }
}

function orbisonSurface(my: number, mz: number, p: number): SurfaceEval {
  const p2 = p * p, p6 = p2 * p2 * p2
  const my2 = my * my, my3 = my2 * my, my4 = my2 * my2
  const mz2 = mz * mz
  return {
    phi: 1.15 * p2 + mz2 + my4 + 3.67 * p2 * mz2 + 3 * p6 * my2 + 4.65 * mz2 * my4 - 1,
    gy: 4 * my3 + 6 * p6 * my + 18.6 * mz2 * my3,
    gz: 2 * mz + 7.34 * p2 * mz + 9.3 * mz * my4,
    hyy: 12 * my2 + 6 * p6 + 55.8 * mz2 * my2,
    hyz: 37.2 * mz * my3,
    hzz: 2 + 7.34 * p2 + 9.3 * my4,
  }
}

const evalSurface = (my: number, mz: number, p: number, s: BiaxialSurfaceSpec): SurfaceEval =>
  s.kind === 'orbison' ? orbisonSurface(my, mz, p) : powerSurface(my, mz, s.alpha ?? 2)

/**
 * Yield-surface value at a moment pair, for callers that only want to ask
 * "is this section past yield?" without running a return map. Φ ≤ 0 is safe.
 * `Mpy`/`Mpz` are the axis capacities and `p = P/Py` is read by 'orbison' only.
 */
export function biaxialYieldFunction(
  My: number, Mz: number, Mpy: number, Mpz: number,
  p = 0, surface: BiaxialSurfaceSpec = { kind: 'power' },
): number {
  const fy = Math.max(Mpy, CAP_FLOOR), fz = Math.max(Mpz, CAP_FLOOR)
  return evalSurface(My / fy, Mz / fz, p, surface).phi
}

/**
 * Demand/capacity ratio on the surface, matching the convention every other
 * design check in the repo uses: 1.0 is exactly at yield, < 1 elastic, > 1 past
 * it. Computed as 1/s where s is the factor the CURRENT moment pair would have
 * to be scaled by to land on the surface — found by bisection on the radial
 * scale, so it holds for any surface shape rather than just the ellipse.
 *
 * Two degenerate answers, both meaningful:
 *  • Infinity — axial force ALONE is already at or past the surface, so no
 *    reduction of the moments can bring the section back (Orbison, p ≥ 0.933).
 *  • 0 — the hinge has no capacity on either loaded axis, so it never yields.
 */
export function biaxialUtilisation(
  My: number, Mz: number, Mpy: number, Mpz: number,
  p = 0, surface: BiaxialSurfaceSpec = { kind: 'power' },
): number {
  const at = (s: number) => biaxialYieldFunction(s * My, s * Mz, Mpy, Mpz, p, surface)
  if (at(0) >= 0) return Infinity
  let hi = 1
  for (let i = 0; i < 60 && at(hi) < 0; i++) hi *= 2
  if (at(hi) < 0) return 0
  let lo = 0
  for (let i = 0; i < 100; i++) { const m = 0.5 * (lo + hi); if (at(m) < 0) lo = m; else hi = m }
  const s = 0.5 * (lo + hi)
  return s > 0 ? 1 / s : Infinity
}

/**
 * Axis capacities reduced for axial force by the uniaxial P–M chords in
 * `pmInteraction`, ready for the 'power' surface. Use for RC sections and for
 * any case where you want the codified uniaxial reduction rather than Orbison's
 * fitted p-terms. `kindY`/`kindZ` default to the steel weak/strong pair.
 */
export function reducedBiaxialCapacities(
  Mpy: number, Mpz: number, P: number, Pcap: number,
  kindY: PmKind = 'steel-weak', kindZ: PmKind = 'steel-strong',
): { Mpy: number; Mpz: number } {
  return {
    Mpy: reducedPlasticMoment(Mpy, P, Pcap, kindY),
    Mpz: reducedPlasticMoment(Mpz, P, Pcap, kindZ),
  }
}

/** Gaussian elimination with partial pivoting on a 3×3. Null if singular. */
function solve3(A: number[][], b: number[]): number[] | null {
  const M = [[...A[0], b[0]], [...A[1], b[1]], [...A[2], b[2]]]
  for (let c = 0; c < 3; c++) {
    let piv = c
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r
    if (!(Math.abs(M[piv][c]) > 1e-300)) return null
    if (piv !== c) { const t = M[piv]; M[piv] = M[c]; M[c] = t }
    for (let r = c + 1; r < 3; r++) {
      const f = M[r][c] / M[c][c]
      for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]
    }
  }
  const x = [0, 0, 0]
  for (let r = 2; r >= 0; r--) {
    let s = M[r][3]
    for (let k = r + 1; k < 3; k++) s -= M[r][k] * x[k]
    x[r] = s / M[r][r]
  }
  return x.every(Number.isFinite) ? x : null
}

/** 2×2 inverse; null if singular. */
function inv2(a: number, b: number, c: number, d: number): [number, number, number, number] | null {
  const det = a * d - b * c
  if (!(Math.abs(det) > 1e-300)) return null
  return [d / det, -b / det, -c / det, a / det]
}

/**
 * Moment vector and consistent tangent at a rotation pair, WITHOUT mutating
 * state — the form Newton-Raphson in the frame solve needs, since a trial
 * rotation may be discarded and re-tried within a step.
 */
export function biaxialProbe(
  thY: number, thZ: number, st: BiaxialState, prm: BiaxialHingeParams,
): BiaxialResponse {
  const by = prm.by ?? 0, bz = prm.bz ?? 0
  const surface = prm.surface ?? { kind: 'power' }
  const p = prm.p ?? 0
  const kpy = (1 - by) * prm.k0y, kpz = (1 - bz) * prm.k0z
  const hardY = by * prm.k0y * thY, hardZ = bz * prm.k0z * thZ

  const elastic = (phi: number): BiaxialResponse => ({
    My: hardY + kpy * (thY - st.thpY),
    Mz: hardZ + kpz * (thZ - st.thpZ),
    kt: [[prm.k0y, 0], [0, prm.k0z]],
    yielding: false, phi, dGamma: 0, converged: true,
  })

  // A hinge with no capacity on either axis never yields — and for 'orbison'
  // that also means p is irrelevant, since the surface can never be reached.
  if (!Number.isFinite(prm.Mpy) && !Number.isFinite(prm.Mpz)) return elastic(-1)

  // Capacities of the perfectly-plastic branch (the hardening branch is
  // unbounded, exactly as in the 1-D law).
  const Fpy = Number.isFinite(prm.Mpy) ? Math.max((1 - by) * prm.Mpy, CAP_FLOOR) : Infinity
  const Fpz = Number.isFinite(prm.Mpz) ? Math.max((1 - bz) * prm.Mpz, CAP_FLOOR) : Infinity

  // ── elastic predictor on the plastic branch ──
  let My = kpy * (thY - st.thpY)
  let Mz = kpz * (thZ - st.thpZ)
  const trialY = My, trialZ = Mz
  const trial = evalSurface(My / Fpy, Mz / Fpz, p, surface)
  if (trial.phi <= 0) return elastic(trial.phi)

  // ── closest-point projection: Newton on (My, Mz, Δγ) ──
  // r1 = My − My_tr + kpy·Δγ·∂Φ/∂My
  // r2 = Mz − Mz_tr + kpz·Δγ·∂Φ/∂Mz
  // r3 = Φ(My, Mz)
  let dg = 0
  let converged = false
  // moment scale for the residual test; the surface residual is dimensionless
  const scale = Math.max(Math.abs(trialY), Math.abs(trialZ), 1e-12)
  for (let it = 0; it < 60; it++) {
    const e = evalSurface(My / Fpy, Mz / Fpz, p, surface)
    const NY = e.gy / Fpy, NZ = e.gz / Fpz
    const HYY = e.hyy / (Fpy * Fpy), HYZ = e.hyz / (Fpy * Fpz), HZZ = e.hzz / (Fpz * Fpz)
    const r1 = My - trialY + kpy * dg * NY
    const r2 = Mz - trialZ + kpz * dg * NZ
    const r3 = e.phi
    if (Math.abs(r1) <= 1e-12 * scale && Math.abs(r2) <= 1e-12 * scale && Math.abs(r3) <= 1e-13) {
      converged = true
      break
    }
    const J = [
      [1 + kpy * dg * HYY, kpy * dg * HYZ, kpy * NY],
      [kpz * dg * HYZ, 1 + kpz * dg * HZZ, kpz * NZ],
      [NY, NZ, 0],
    ]
    const dx = solve3(J, [-r1, -r2, -r3])
    if (!dx) break
    My += dx[0]; Mz += dx[1]; dg += dx[2]
    // Δγ is a magnitude; a negative iterate means the step overshot back into
    // the elastic domain, and clamping keeps the map on the plastic branch.
    if (dg < 0) dg = 0
  }
  // the loop leaves My/Mz one update ahead of its last surface evaluation, so
  // the returned Φ and the tangent below are taken from a fresh one
  const ev = evalSurface(My / Fpy, Mz / Fpz, p, surface)

  // ── algorithmic (consistent) tangent ──
  // dMp = [Ξ − (Ξn)(Ξn)ᵀ / (nᵀΞn)] dθ,  Ξ = [kp⁻¹ + Δγ·H]⁻¹   (Simo & Hughes)
  const NY = ev.gy / Fpy, NZ = ev.gz / Fpz
  const HYY = ev.hyy / (Fpy * Fpy), HYZ = ev.hyz / (Fpy * Fpz), HZZ = ev.hzz / (Fpz * Fpz)
  let kt: [[number, number], [number, number]] = [[prm.k0y, 0], [0, prm.k0z]]
  const xi = inv2(1 / kpy + dg * HYY, dg * HYZ, dg * HYZ, 1 / kpz + dg * HZZ)
  if (xi) {
    const [x11, x12, x21, x22] = xi
    const xn1 = x11 * NY + x12 * NZ, xn2 = x21 * NY + x22 * NZ
    const den = NY * xn1 + NZ * xn2
    const [t11, t12, t21, t22] = Math.abs(den) > 1e-300
      ? [x11 - (xn1 * xn1) / den, x12 - (xn1 * xn2) / den,
         x21 - (xn2 * xn1) / den, x22 - (xn2 * xn2) / den]
      : [x11, x12, x21, x22]
    kt = [[by * prm.k0y + t11, t12], [t21, bz * prm.k0z + t22]]
  }

  return {
    My: hardY + My, Mz: hardZ + Mz, kt,
    yielding: true, phi: ev.phi, dGamma: dg, converged,
  }
}

/**
 * Commit a converged rotation pair: returns the response AND the advanced state
 * (plastic flow, dissipation). `thYPrev`/`thZPrev` are the last committed
 * rotations, used to integrate dissipated energy across the step.
 */
export function biaxialCommit(
  thY: number, thZ: number, thYPrev: number, thZPrev: number,
  st: BiaxialState, prm: BiaxialHingeParams,
): { resp: BiaxialResponse; state: BiaxialState } {
  const resp = biaxialProbe(thY, thZ, st, prm)
  if (!resp.yielding) return { resp, state: st }

  const by = prm.by ?? 0, bz = prm.bz ?? 0
  const kpy = (1 - by) * prm.k0y, kpz = (1 - bz) * prm.k0z
  // Recover the plastic increment from the projection itself: Mp = kp(θ − θp),
  // so θp_new = θ − Mp/kp. Deriving it this way rather than from Δγ·n keeps the
  // state exactly consistent with the moment that was returned.
  const MpY = resp.My - by * prm.k0y * thY
  const MpZ = resp.Mz - bz * prm.k0z * thZ
  const thpY = kpy > 0 ? thY - MpY / kpy : st.thpY
  const thpZ = kpz > 0 ? thZ - MpZ / kpz : st.thpZ
  const dY = thpY - st.thpY, dZ = thpZ - st.thpZ

  const prev = biaxialProbe(thYPrev, thZPrev, st, prm)
  return {
    resp,
    state: {
      thpY, thpZ,
      cumPlastic: st.cumPlastic + Math.hypot(dY, dZ),
      // trapezoidal ∫M·dθp over the step (plastic work only)
      dissipated: st.dissipated
        + 0.5 * ((prev.My + resp.My) * dY + (prev.Mz + resp.Mz) * dZ),
    },
  }
}

/**
 * Trace a rotation path through one hinge, committing every point — the
 * convenient form for cyclic characterisation and for tests.
 */
export function biaxialPath(
  path: Array<[number, number]>, prm: BiaxialHingeParams,
): { My: number[]; Mz: number[]; state: BiaxialState } {
  let st = newBiaxialState()
  let pY = 0, pZ = 0
  const My: number[] = [], Mz: number[] = []
  for (const [thY, thZ] of path) {
    const { resp, state } = biaxialCommit(thY, thZ, pY, pZ, st, prm)
    My.push(resp.My); Mz.push(resp.Mz)
    st = state; pY = thY; pZ = thZ
  }
  return { My, Mz, state: st }
}
