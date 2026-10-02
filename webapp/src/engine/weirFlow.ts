// ─────────────────────────────────────────────────────────────────────────
// WEIR FLOW — discharge over sharp-crested and broad-crested weirs, the
// standard measurement structures of hydraulics lab and field work.
//
// SI throughout: Q in m³/s, heads in m, lengths in m, g = 9.81.
// H is the head ABOVE the crest, measured upstream where the water surface
// is undisturbed. All formulas are the textbook SI set (verified against
// USBR Water Measurement Manual ch. 7 and the standard hydraulics texts):
//
//   · Rectangular suppressed (Francis, end contractions absent):
//       Q = 1.84·L·H^1.5
//   · Rectangular contracted (Francis): each end contraction steals
//     0.1·H of crest length, n ends:
//       Q = 1.84·(L − 0.1·n·H)·H^1.5
//   · With velocity of approach (ha = V_a²/2g), the Francis head becomes
//     H + ha and the ha^1.5 term is subtracted back out:
//       Q = 1.84·L·[(H+ha)^1.5 − ha^1.5]
//   · Cipolletti trapezoid (side slope 1H:4V compensates the end
//     contractions, so the effective length needs no correction):
//       Q = 1.86·L·H^1.5
//   · Triangular V-notch, half-angle θ/2 from vertical:
//       Q = (8/15)·Cd·√(2g)·tan(θ/2)·H^2.5   (Cd ≈ 0.60)
//     The 90° notch has Cone's empirical fit Q = 1.343·H^2.48 (SI form of
//     the USBR 2.49·h^2.48 in ft³/s) shown as a cross-check row.
//   · Broad-crested (critical flow over the horizontal crest, ideal
//     coefficient 1.705 with a discharge coefficient for real losses):
//       Q = Cd·1.705·b·H^1.5
//
// The inverse problem (what head gives a target Q?) is monotone in every
// shape, so a bounded bisection closes it without ceremony.
// ─────────────────────────────────────────────────────────────────────────

export const G = 9.81

export type WeirShape =
  | 'rectSuppressed'
  | 'rectContracted'
  | 'cipolletti'
  | 'vnotch'
  | 'broadCrested'

export interface WeirInput {
  shape: WeirShape
  /** Head above the crest, m. */
  H: number
  /** Crest length (rectangular / Cipolletti / broad-crested), m. */
  L?: number
  /** Number of end contractions (rectangular contracted, 0–2). */
  n?: number
  /** Notch total angle, degrees (V-notch; 90 default). */
  angle?: number
  /** Discharge coefficient of the V-notch (default 0.60). */
  Cd?: number
  /** Broad-crested discharge coefficient (default 1.0 = ideal critical flow). */
  Cb?: number
  /** Velocity-of-approach head ha = Va²/2g, m (rectangular shapes only). */
  ha?: number
}

export interface WeirResult {
  Q: number
  /** The effective crest length actually wetted, m (V-notch: width at surface). */
  effectiveLength: number
  /** Francis correction applied, for the record. */
  notes: string[]
}

function assertHead(H: number): void {
  if (!(H > 0)) throw new Error('Head above the crest must be positive')
}

export function weirDischarge(p: WeirInput): WeirResult {
  assertHead(p.H)
  const notes: string[] = []
  switch (p.shape) {
    case 'rectSuppressed': {
      if (!(p.L && p.L > 0)) throw new Error('Crest length must be positive')
      const ha = p.ha ?? 0
      if (ha < 0) throw new Error('Velocity-of-approach head cannot be negative')
      const Q = ha > 0
        ? 1.84 * p.L * (Math.pow(p.H + ha, 1.5) - Math.pow(ha, 1.5))
        : 1.84 * p.L * Math.pow(p.H, 1.5)
      if (ha > 0) notes.push('Velocity of approach: H replaced by H + ha with the ha^1.5 term removed (Francis form)')
      return { Q, effectiveLength: p.L, notes }
    }
    case 'rectContracted': {
      if (!(p.L && p.L > 0)) throw new Error('Crest length must be positive')
      const n = p.n ?? 2
      if (n < 0 || n > 2) throw new Error('End contractions must be 0, 1 or 2')
      const Le = p.L - 0.1 * n * p.H
      if (Le <= 0) throw new Error('Head too large for this crest — the 0.1·n·H contraction exceeds the crest length')
      const Q = 1.84 * Le * Math.pow(p.H, 1.5)
      notes.push(`${n} end contraction${n === 1 ? '' : 's'}: effective length L′ = L − 0.1·n·H = ${Le.toFixed(3)} m`)
      return { Q, effectiveLength: Le, notes }
    }
    case 'cipolletti': {
      if (!(p.L && p.L > 0)) throw new Error('Crest length must be positive')
      const Q = 1.86 * p.L * Math.pow(p.H, 1.5)
      return { Q, effectiveLength: p.L, notes }
    }
    case 'vnotch': {
      const angle = p.angle ?? 90
      const Cd = p.Cd ?? 0.6
      if (!(angle > 0 && angle < 180)) throw new Error('Notch angle must be between 0 and 180 degrees')
      if (!(Cd > 0 && Cd <= 1)) throw new Error('Discharge coefficient must be in (0, 1]')
      const tanHalf = Math.tan((angle / 2) * (Math.PI / 180))
      const Q = (8 / 15) * Cd * Math.sqrt(2 * G) * tanHalf * Math.pow(p.H, 2.5)
      const cone = angle === 90 ? 1.343 * Math.pow(p.H, 2.48) : null
      if (cone != null) notes.push(`Cone's 90° empirical fit gives Q = ${cone.toFixed(4)} m³/s for the same head`)
      return { Q, effectiveLength: 2 * p.H * tanHalf, notes }
    }
    case 'broadCrested': {
      if (!(p.L && p.L > 0)) throw new Error('Crest width must be positive')
      const Cb = p.Cb ?? 1.0
      if (!(Cb > 0 && Cb <= 1.2)) throw new Error('Broad-crested coefficient must be in (0, 1.2]')
      const Q = Cb * 1.705 * p.L * Math.pow(p.H, 1.5)
      notes.push('Ideal critical-flow coefficient 1.705; a real structure loses 2–15 % (drop Cb accordingly)')
      return { Q, effectiveLength: p.L, notes }
    }
  }
}

// ── inverse: head for a target discharge ─────────────────────────────────

export interface HeadForQInput {
  shape: WeirShape
  /** Target discharge, m³/s. */
  Q: number
  L?: number
  n?: number
  angle?: number
  Cd?: number
  Cb?: number
  ha?: number
}

/**
 * Solve H from Q by bisection. Q(H) is strictly increasing for every
 * shape, so bracket [1e-6, 100] is expanded until it holds the answer,
 * then bisected to 1e-10 relative precision.
 */
export function headForQ(p: HeadForQInput): number {
  if (!(p.Q > 0)) throw new Error('Target discharge must be positive')
  const f = (H: number): number => {
    try {
      return weirDischarge({ ...p, H }).Q
    } catch (err) {
      // contracted weirs can refuse huge heads — treat as "root is below"
      if (String(err).includes('too large')) return Infinity
      throw err
    }
  }
  let lo = 1e-6
  let hi = 1
  while (f(hi) < p.Q) {
    lo = hi
    hi *= 2
    if (hi > 1024) throw new Error('Discharge is beyond any realizable head on this weir (H > 1 km)')
  }
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) < p.Q) lo = mid
    else hi = mid
    if (hi - lo < 1e-10 * Math.max(1, hi)) break
  }
  return (lo + hi) / 2
}

/** Froude number of the approach channel — reading aid for the record. */
export function froudeOfApproach(Q: number, area: number, topWidth: number): number {
  if (!(area > 0) || !(topWidth > 0)) throw new Error('Approach area and top width must be positive')
  const V = Q / area
  return V / Math.sqrt(G * area / topWidth)
}
