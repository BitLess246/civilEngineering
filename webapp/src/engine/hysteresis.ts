// ─────────────────────────────────────────────────────────────────────────
// Rate-independent HYSTERETIC restoring-force models for nonlinear dynamic
// analysis. Layer L5.
//
// The pushover engine (`pushover.ts`) models plasticity as an event-to-event
// hinge = a permanent DOF release. That is monotonic-only: a released DOF can
// never re-stiffen, so it cannot represent UNLOADING — which is precisely what
// cyclic and dynamic response requires. These models carry the plastic state
// explicitly and unload elastically, so a spring can yield, unload, and yield
// again in the other direction.
//
// BILINEAR with kinematic hardening (the workhorse; b = 0 ⇒ elastic-perfectly-
// plastic). Classic 1-D return mapping, splitting the force into a hardening
// branch and an elastic-perfectly-plastic branch:
//
//   f(u) = b·k₀·u  +  (1−b)·k₀·(u − u_p)
//                     └── capped at ±(1−b)·Fy ──┘
//
//   • initial stiffness  f'(0) = b·k₀ + (1−b)·k₀ = k₀
//   • yields exactly at  u = u_y = Fy/k₀  with f = b·Fy + (1−b)·Fy = Fy
//   • post-yield slope   b·k₀
//   • UNLOADING freezes u_p, so the slope returns to k₀ (Bauschinger-free,
//     kinematic translation of the yield surface)
//
// Units: force kN, displacement m, stiffness kN/m (any consistent set works —
// the models are dimensionally agnostic).
// Refs: Chopra, Dynamics of Structures §7; Simo & Hughes, return mapping.
// ─────────────────────────────────────────────────────────────────────────

export interface BilinearParams {
  /** Initial (elastic) stiffness k₀ > 0. */
  k0: number
  /** Yield force (magnitude) Fy > 0. Use Infinity for a linear spring. */
  Fy: number
  /** Post-yield stiffness ratio b (0 = elastic-perfectly-plastic, default 0). */
  b?: number
}

/** Evolving plastic state of one bilinear spring. */
export interface BilinearState {
  /** Accumulated plastic displacement (the kinematic back-displacement). */
  up: number
  /** Cumulative |plastic strain| — a damage/ductility odometer. */
  cumPlastic: number
  /** Energy dissipated by hysteresis so far (∫ f·du_p). */
  dissipated: number
}

export const newBilinearState = (): BilinearState => ({ up: 0, cumPlastic: 0, dissipated: 0 })

export interface SpringResponse {
  /** Restoring force at u. */
  f: number
  /** Tangent stiffness df/du (k₀ elastic, b·k₀ while yielding). */
  kt: number
  /** True when this step is on the yielding branch. */
  yielding: boolean
}

/**
 * Force and tangent WITHOUT mutating state — the form Newton-Raphson needs,
 * since a trial displacement may be discarded and re-tried within a step.
 */
export function bilinearProbe(u: number, st: BilinearState, p: BilinearParams): SpringResponse {
  const b = p.b ?? 0
  if (!Number.isFinite(p.Fy)) return { f: p.k0 * u, kt: p.k0, yielding: false }
  const kp = (1 - b) * p.k0            // stiffness of the perfectly-plastic branch
  const Fp = (1 - b) * p.Fy            // its capacity
  const fe = kp * (u - st.up)          // elastic predictor on that branch
  if (Math.abs(fe) <= Fp) return { f: b * p.k0 * u + fe, kt: p.k0, yielding: false }
  const s = Math.sign(fe)
  return { f: b * p.k0 * u + s * Fp, kt: b * p.k0, yielding: true }
}

/**
 * Commit a converged displacement: returns the response AND the advanced state
 * (plastic flow, dissipation). `uPrev` is the last committed displacement, used
 * to integrate the dissipated energy over the step.
 */
export function bilinearCommit(
  u: number, uPrev: number, st: BilinearState, p: BilinearParams,
): { resp: SpringResponse; state: BilinearState } {
  const b = p.b ?? 0
  const resp = bilinearProbe(u, st, p)
  if (!resp.yielding || !Number.isFinite(p.Fy)) return { resp, state: st }
  const kp = (1 - b) * p.k0, Fp = (1 - b) * p.Fy
  const fe = kp * (u - st.up)
  const s = Math.sign(fe)
  // return mapping: pull the predictor back onto the (translated) yield surface
  const dup = (Math.abs(fe) - Fp) / kp * s
  const fPrev = bilinearProbe(uPrev, st, p).f
  return {
    resp,
    state: {
      up: st.up + dup,
      cumPlastic: st.cumPlastic + Math.abs(dup),
      // trapezoidal ∫f·du_p over the step (plastic work only)
      dissipated: st.dissipated + Math.abs(dup) * (Math.abs(fPrev) + Math.abs(resp.f)) / 2,
    },
  }
}

/**
 * Trace a displacement path through one spring, committing every point.
 * Returns the force at each point plus the final state — the convenient form
 * for cyclic (quasi-static) characterisation and for tests.
 */
export function bilinearPath(us: number[], p: BilinearParams): { f: number[]; state: BilinearState } {
  let st = newBilinearState()
  let uPrev = 0
  const f: number[] = []
  for (const u of us) {
    const { resp, state } = bilinearCommit(u, uPrev, st, p)
    f.push(resp.f)
    st = state
    uPrev = u
  }
  return { f, state: st }
}

/**
 * Closed-form energy dissipated per full symmetric cycle of amplitude A — the
 * parallelogram area
 *   E = 4·Fy·(A − u_y),   u_y = Fy/k₀      (zero when A ≤ u_y)
 * For b > 0 the loop is the same parallelogram (the hardening branch is
 * conservative and encloses no area), so the formula carries over.
 *
 * NOTE this is the STEADY-STATE loop. The first excursion out of the virgin
 * state (0 → A) is only a half-loop and dissipates Fy·(A − u_y); count cycles
 * from the first reversal, not from zero.
 */
export function bilinearCycleEnergy(A: number, p: BilinearParams): number {
  if (!Number.isFinite(p.Fy)) return 0
  const uy = p.Fy / p.k0
  return A <= uy ? 0 : 4 * p.Fy * (A - uy)
}
