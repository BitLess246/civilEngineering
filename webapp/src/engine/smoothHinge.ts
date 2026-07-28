// ─────────────────────────────────────────────────────────────────────────
// SMOOTH (C^∞) HINGE BACKBONE for static equilibrium-path tracing.
//
// The bilinear hinge law in `hysteresis.ts` is the right material for pushover
// and time-history work: it yields at a definite moment, unloads elastically,
// and dissipates energy. But its TANGENT is discontinuous — at yield it jumps
// from k0 to b·k0, a factor of ~10³, and changes sign when the hinge softens.
// A Newton corrector that lands on the wrong side of that jump is thrown onto a
// different branch, which is what stopped arc-length continuation from tracing
// snap-back (see `arcLength.ts`).
//
// This module provides the same backbone with the corner rounded off:
//
//   f(u)  = b·k0·u + Fp·tanh( kp·u / Fp )        kp = (1−b)·k0,  Fp = (1−b)·Fy
//   kt(u) = b·k0 + kp·sech²( kp·u / Fp )
//
// which is exactly the bilinear law's pair of asymptotes joined smoothly:
//   • slope at the origin is k0 (elastic),
//   • f → b·k0·u ± Fp as |u| → ∞ (the post-yield lines),
//   • kt is continuous and differentiable everywhere, with no jump to cross.
//
// WHAT THIS IS NOT. It is **nonlinear elastic**, not plastic: the response is
// path-independent, unloading retraces the loading curve, no permanent set is
// left and no energy is dissipated. That is the correct idealisation for
// tracing a static equilibrium path — continuation methods want a function of
// the current state, not of its history — but it means this material must NOT
// be used for cyclic or dynamic analysis. Those keep the bilinear law.
//
// The rounding is not free: because the corner is smoothed, the limit load is
// approached from BELOW (a few tenths of a percent low on the cases tested), so
// collapse-load benchmarks should stay on the bilinear material.
//
// Units: u rad, f kN·m, k0/kt kN·m/rad, Fy kN·m — as `hysteresis.ts`.
// ─────────────────────────────────────────────────────────────────────────

export interface SmoothHingeParams {
  /** Initial (elastic) stiffness. */
  k0: number
  /** Yield force — the asymptote intercept is (1−b)·Fy. Infinite ⇒ linear. */
  Fy: number
  /** Post-yield stiffness ratio; negative softens. Default 0. */
  b?: number
}

export interface SmoothHingeResponse {
  /** Restoring force at u. */
  f: number
  /** Tangent df/du — continuous everywhere. */
  kt: number
  /**
   * Normalised distance into the knee, x = kp·u/Fp. |x| ≲ 1 is the rounded
   * corner; |x| ≫ 1 is on the post-yield asymptote. Callers use this to keep a
   * continuation step small enough to RESOLVE the knee.
   */
  x: number
}

/**
 * Smooth backbone force and tangent at deformation `u`.
 *
 * A non-finite `Fy` gives the purely linear response (no knee), matching how
 * `bilinearProbe` treats an infinite capacity.
 */
export function smoothHinge(u: number, p: SmoothHingeParams): SmoothHingeResponse {
  const b = p.b ?? 0
  if (!Number.isFinite(p.Fy)) return { f: p.k0 * u, kt: p.k0, x: 0 }
  const kp = (1 - b) * p.k0
  const Fp = (1 - b) * p.Fy
  if (!(Math.abs(Fp) > 1e-300)) return { f: b * p.k0 * u, kt: b * p.k0, x: Infinity }
  const x = (kp * u) / Fp
  const th = Math.tanh(x)
  return { f: b * p.k0 * u + Fp * th, kt: b * p.k0 + kp * (1 - th * th), x }
}

/**
 * Deformation at which the knee is centred — the bilinear law's yield
 * deformation, Fy/k0. The smooth transition occupies roughly ±1 of these.
 */
export function smoothYieldDeformation(p: SmoothHingeParams): number {
  return Math.abs(p.Fy) / Math.abs(p.k0)
}

/**
 * The bilinear backbone this smooths, for comparison: f = k0·u while elastic,
 * then b·k0·u ± (1−b)·Fy. Exported so tests can measure the two against each
 * other rather than restating the formula.
 */
export function bilinearBackbone(u: number, p: SmoothHingeParams): number {
  const b = p.b ?? 0
  if (!Number.isFinite(p.Fy)) return p.k0 * u
  const kp = (1 - b) * p.k0, Fp = (1 - b) * p.Fy
  const fe = kp * u
  return Math.abs(fe) <= Math.abs(Fp) ? p.k0 * u : b * p.k0 * u + Math.sign(fe) * Math.abs(Fp)
}
