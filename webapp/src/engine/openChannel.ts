// ─────────────────────────────────────────────────────────────────────────
// OPEN CHANNEL FLOW — Manning normal depth, critical depth & Froude,
// and the hydraulic jump, for the four section shapes a board exam asks.
//
//   Manning            Q = (1/n)·A·R^(2/3)·√S        SI units
//   Critical condition Q²·T / (g·A³) = 1
//   Froude number      Fr = √(Q²·T / (g·A³))
//   Specific energy    E  = y + Q²/(2g·A²)
//   Sequent depth      M(y₂) = M(y₁),  M = Q²/(gA) + A·ȳ   (momentum function)
//     rectangular:     y₂ = (y₁/2)·(√(1 + 8Fr₁²) − 1)
//   Energy loss        ΔE = (y₂ − y₁)³ / (4·y₁·y₂)   (rectangular)
//
// Depth solvers are bisection on the monotone branches — no closed-form
// exists for trapezoids and circles, and 60 iterations bracket to machine
// precision on the widths this app allows.
// ─────────────────────────────────────────────────────────────────────────

export const G = 9.81

export type ChannelShape =
  | { kind: 'rect'; b: number }
  | { kind: 'trap'; b: number; z: number }
  | { kind: 'tri'; z: number }
  | { kind: 'circle'; D: number }

export interface SectionGeom {
  /** Wetted area (m²). */
  A: number
  /** Wetted perimeter (m). */
  P: number
  /** Top width (m). */
  T: number
  /** Hydraulic radius A/P (m). */
  R: number
  /** Hydraulic depth A/T (m). */
  Dh: number
}

export function geomAt(shape: ChannelShape, y: number): SectionGeom {
  let A: number, P: number, T: number
  if (shape.kind === 'rect') {
    A = shape.b * y
    P = shape.b + 2 * y
    T = shape.b
  } else if (shape.kind === 'trap') {
    A = (shape.b + shape.z * y) * y
    P = shape.b + 2 * y * Math.sqrt(1 + shape.z * shape.z)
    T = shape.b + 2 * shape.z * y
  } else if (shape.kind === 'tri') {
    A = shape.z * y * y
    P = 2 * y * Math.sqrt(1 + shape.z * shape.z)
    T = 2 * shape.z * y
  } else {
    // circular: θ = central angle of the wetted arc (rad, from the centre)
    const D = shape.D
    if (y >= D) {
      A = Math.PI * D * D / 4
      P = Math.PI * D
      T = 0 // full pipe: no free surface
    } else {
      const th = 2 * Math.acos(1 - 2 * y / D)
      A = D * D / 8 * (th - Math.sin(th))
      P = D * th / 2
      T = D * Math.sin(th / 2)
    }
  }
  return { A, P, T, R: A / P, Dh: T > 0 ? A / T : Infinity }
}

/** Manning discharge at depth y, SI: Q = (1/n)·A·R^(2/3)·√S. */
export function manningQ(shape: ChannelShape, y: number, n: number, S: number): number {
  const { A, R } = geomAt(shape, y)
  return A * Math.pow(R, 2 / 3) * Math.sqrt(S) / n
}

/** Manning velocity at depth y. */
export function manningV(shape: ChannelShape, y: number, n: number, S: number): number {
  return manningQ(shape, y, n, S) / geomAt(shape, y).A
}

/** Froude number at depth y: Fr = √(Q²T/(gA³)). */
export function froude(shape: ChannelShape, y: number, Q: number): number {
  const { A, T } = geomAt(shape, y)
  return Math.sqrt(Q * Q * T / (G * A * A * A))
}

/** Specific energy at depth y: E = y + Q²/(2gA²). */
export function specificEnergy(shape: ChannelShape, y: number, Q: number): number {
  const { A } = geomAt(shape, y)
  return y + Q * Q / (2 * G * A * A)
}

/** Momentum function per unit weight: M = Q²/(gA) + A·ȳ, ȳ = centroid depth below surface (m³). */
export function momentum(shape: ChannelShape, y: number, Q: number): number {
  const { A } = geomAt(shape, y)
  return Q * Q / (G * A) + A * centroidDepth(shape, y)
}

/** Depth of the wetted area's centroid below the surface (m). */
export function centroidDepth(shape: ChannelShape, y: number): number {
  if (shape.kind === 'rect') return y / 2
  if (shape.kind === 'tri') return (2 / 3) * y
  if (shape.kind === 'trap') {
    const { b, z } = shape
    const T = b + 2 * z * y
    // trapezoid centroid measured from its top edge: y·(T + 2b)/(3(T + b))
    return y * (T + 2 * b) / (3 * (T + b))
  }
  // circle — first moment about the surface, Simpson on t·T(t)
  const m = (t: number) => t * geomAt(shape, t).T
  const N = 200
  const h = y / N
  let s = m(0) + m(y)
  for (let i = 1; i < N; i++) s += (i % 2 === 0 ? 2 : 4) * m(i * h)
  return (h / 3) * s / geomAt(shape, y).A
}

// ── solvers ───────────────────────────────────────────────────────────────

function bisect(f: (y: number) => number, lo: number, hi: number): number {
  let a = lo, b = hi
  let fa = f(a)
  for (let i = 0; i < 80; i++) {
    const mid = (a + b) / 2
    const fm = f(mid)
    if (fa * fm <= 0) { b = mid } else { a = mid; fa = fm }
    if (b - a < 1e-12) break
  }
  return (a + b) / 2
}

/** Largest sensible depth to search for an open (non-circular) section. */
function openMaxDepth(shape: ChannelShape): number {
  const scale = shape.kind === 'rect' ? shape.b
    : shape.kind === 'trap' ? Math.max(shape.b, shape.z * 10)
    : shape.kind === 'tri' ? shape.z * 10
    : shape.D
  return Math.max(10 * scale, 1)
}

/** Normal depth by Manning — the root of (1/n)A R^(2/3) √S = Q. */
export function normalDepth(shape: ChannelShape, Q: number, n: number, S: number): number {
  if (!(Q > 0)) throw new Error('Normal depth: discharge must be positive.')
  if (!(n > 0)) throw new Error('Normal depth: Manning n must be positive.')
  if (!(S > 0)) throw new Error('Normal depth: bed slope must be positive.')

  if (shape.kind === 'circle') {
    const D = shape.D
    // Q(y) peaks near y ≈ 0.94 D then falls back to 0 at the full pipe —
    // find the peak first, then bracket the (lower) physical root.
    const yPeak = peakFlowDepth(shape)
    const Qmax = manningQ(shape, yPeak, n, S)
    if (Q > Qmax * (1 + 1e-9)) {
      throw new Error(`Q = ${Q.toFixed(4)} m³/s exceeds the pipe's peak Manning capacity ${Qmax.toFixed(4)} m³/s (at y/D = ${(yPeak / D).toFixed(3)}). No uniform-flow depth exists.`)
    }
    return bisect((y) => manningQ(shape, y, n, S) - Q, 1e-9 * D, yPeak)
  }

  const yMax = openMaxDepth(shape)
  // expand the bracket if the section is very capable
  let hi = yMax
  let guard = 0
  while (manningQ(shape, hi, n, S) < Q && guard++ < 60) hi *= 2
  if (manningQ(shape, hi, n, S) < Q) throw new Error('Normal depth: no root found within the searched depth range.')
  return bisect((y) => manningQ(shape, y, n, S) - Q, 1e-9, hi)
}

/** Depth of maximum Manning discharge in a circular pipe (≈ 0.938 D). */
export function peakFlowDepth(shape: ChannelShape): number {
  if (shape.kind !== 'circle') throw new Error('peakFlowDepth is defined for circular sections.')
  const D = shape.D
  let best = 0.9 * D
  let bestQ = -1
  for (let i = 1; i <= 940; i++) {
    const y = (i / 1000) * D
    const q = manningQ(shape, y, 1, 1)
    if (q > bestQ) { bestQ = q; best = y }
  }
  return best
}

/** Peak (section-maximum) Manning discharge of a circular pipe and its depth. */
export function circularPeakCapacity(D: number, n: number, S: number): { Qmax: number; yPeak: number } {
  const shape: ChannelShape = { kind: 'circle', D }
  const yPeak = peakFlowDepth(shape)
  return { Qmax: manningQ(shape, yPeak, n, S), yPeak }
}

/** Critical depth — the root of Q²T/(gA³) = 1. */
export function criticalDepth(shape: ChannelShape, Q: number): number {
  if (!(Q > 0)) throw new Error('Critical depth: discharge must be positive.')
  const f = (y: number) => (Q * Q * geomAt(shape, y).T) / (G * Math.pow(geomAt(shape, y).A, 3)) - 1
  if (shape.kind === 'circle') {
    const D = shape.D
    return bisect(f, 1e-9 * D, D * (1 - 1e-9))
  }
  const yMax = openMaxDepth(shape)
  let hi = yMax
  let guard = 0
  while (f(hi) > 0 && guard++ < 60) hi *= 2
  if (f(hi) > 0) throw new Error('Critical depth: no root found within the searched depth range.')
  return bisect(f, 1e-9, hi)
}

/** Rectangular closed form, kept for the worked solution and tests. */
export function criticalDepthRect(Q: number, b: number): number {
  return Math.cbrt(Q * Q / (G * b * b))
}

/** Minimum specific energy and its depth (= critical). */
export function criticalState(shape: ChannelShape, Q: number): { yc: number; E_min: number } {
  const yc = criticalDepth(shape, Q)
  return { yc, E_min: specificEnergy(shape, yc, Q) }
}

// ── hydraulic jump ────────────────────────────────────────────────────────

export type JumpClass = 'undular' | 'weak' | 'oscillating' | 'steady' | 'strong'

/** USBR-style classification of a jump by its upstream Froude number. */
export function classifyJump(Fr1: number): JumpClass {
  if (Fr1 < 1.7) return 'undular'
  if (Fr1 < 2.5) return 'weak'
  if (Fr1 < 4.5) return 'oscillating'
  if (Fr1 < 9.0) return 'steady'
  return 'strong'
}

export interface JumpResult {
  y1: number
  y2: number
  Fr1: number
  Fr2: number
  E1: number
  E2: number
  /** Energy dissipated across the jump, ΔE = E1 − E2 (m). */
  dE: number
  /** Dissipated power (kW) = γ·Q·ΔE / 1000. */
  powerKW: number
  /** Classical average jump length ≈ 6.1·y₂ (m). */
  Lj: number
  cls: JumpClass
  /** Momentum function value on both sides (m³) — equal by construction. */
  M: number
  /** True when the sequent depth came from the closed rectangular form. */
  closedForm: boolean
}

/**
 * Sequent (conjugate) depth and jump energy balance. y1 must be the
 * supercritical depth (Fr1 > 1); the solver finds y2 on the subcritical
 * branch where the momentum function matches.
 */
export function hydraulicJump(shape: ChannelShape, Q: number, y1: number): JumpResult {
  if (!(Q > 0)) throw new Error('Jump: discharge must be positive.')
  if (!(y1 > 0)) throw new Error('Jump: entering depth must be positive.')
  const Fr1 = froude(shape, y1, Q)
  if (Fr1 <= 1) throw new Error(`Jump: the entering flow is subcritical (Fr₁ = ${Fr1.toFixed(3)} ≤ 1) — a jump needs supercritical approach flow.`)

  let y2: number
  let closedForm = false
  if (shape.kind === 'rect') {
    y2 = (y1 / 2) * (Math.sqrt(1 + 8 * Fr1 * Fr1) - 1)
    closedForm = true
  } else {
    const yc = criticalDepth(shape, Q)
    const M1 = momentum(shape, y1, Q)
    let hi = Math.max(2 * yc, 1e-3)
    let guard = 0
    while (momentum(shape, hi, Q) < M1 && guard++ < 60) {
      hi *= 2
      if (shape.kind === 'circle' && hi >= shape.D) { hi = shape.D * (1 - 1e-9); break }
    }
    if (momentum(shape, hi, Q) < M1) throw new Error('Jump: sequent depth not found in the searched range.')
    y2 = bisect((y) => momentum(shape, y, Q) - M1, yc, hi)
  }

  const E1 = specificEnergy(shape, y1, Q)
  const E2 = specificEnergy(shape, y2, Q)
  const dE = E1 - E2
  const Fr2 = froude(shape, y2, Q)
  return {
    y1, y2, Fr1, Fr2, E1, E2, dE,
    powerKW: 9.81 * Q * dE, // γ = 9.81 kN/m³, Q m³/s, ΔE m → kW
    Lj: 6.1 * y2,
    cls: classifyJump(Fr1),
    M: momentum(shape, y1, Q),
    closedForm,
  }
}

/** ΔE for a rectangular jump — the closed form the worked solution shows. */
export function rectJumpLoss(y1: number, y2: number): number {
  return Math.pow(y2 - y1, 3) / (4 * y1 * y2)
}
