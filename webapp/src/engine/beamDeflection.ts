// ─────────────────────────────────────────────────────────────────────────
// RC beam serviceability helpers — minimum thickness, cracked inertia (with
// compression steel), long-term multiplier and the uniform-load deflection
// coefficient. NSCP 2015 §409.3 / §424.2  (= ACI 318-14 §9.3 / §24.2).
// These back `beamServiceDeflection` (beamDesign.ts); kept pure for testing.
// Units: span m; b/d/d′ mm; As mm²; fc/fy MPa.
// ─────────────────────────────────────────────────────────────────────────
import { Ec } from './slabDeflection'

const ES = 200000          // MPa, steel modulus
const XI_LONGTERM = 2.0    // sustained-load time factor (≥ 5 years)

export type BeamSupport = 'simple' | 'one-end' | 'both-ends' | 'cantilever'

/** Minimum thickness h (mm) not requiring a deflection check (Table 409.3.1.1),
 *  ×(0.4 + fy/700) for fy ≠ 420. */
export function minBeamThickness(spanL: number, support: BeamSupport, fy = 420): number {
  const denom = support === 'simple' ? 16 : support === 'one-end' ? 18.5 : support === 'both-ends' ? 21 : 8
  return ((spanL * 1000) / denom) * (0.4 + fy / 700)
}

/** Deflection coefficient k in δ = k·w·ℓ⁴/(384·E·I) for a uniform load. */
export function deflCoeff(support: BeamSupport): number {
  switch (support) {
    case 'simple': return 5          // 5wℓ⁴/384EI
    case 'one-end': return 2.6       // end span, ACI approximation
    case 'both-ends': return 1       // wℓ⁴/384EI
    case 'cantilever': return 48     // wℓ⁴/8EI
  }
}

/** Cracked transformed moment of inertia of a (doubly) reinforced rectangular
 *  beam, mm⁴. Compression steel As′ at depth d′ uses the (n−1) transform; with
 *  As′ = 0 this is the usual singly-reinforced result. */
export function crackedInertia(params: {
  b: number; d: number; As: number; fc: number; dPrime?: number; AsPrime?: number
}): number {
  const { b, d, As, fc } = params
  if (As <= 0 || b <= 0 || d <= 0) return (b * d ** 3) / 12
  const n = ES / Ec(fc)
  const AsP = params.AsPrime ?? 0, dP = params.dPrime ?? 0
  // Neutral axis: b/2·kd² + (n−1)As′(kd−d′) = n·As(d−kd)
  const A = b / 2
  const B = (n - 1) * AsP + n * As
  const C = -((n - 1) * AsP * dP + n * As * d)
  const kd = (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A)
  return (b * kd ** 3) / 3 + (n - 1) * AsP * (kd - dP) ** 2 + n * As * (d - kd) ** 2
}

/** Long-term multiplier λΔ = ξ/(1 + 50ρ′) (§424.2.4.1.1). */
export function longTermMultiplier(rhoPrime: number, xi = XI_LONGTERM): number {
  return xi / (1 + 50 * Math.max(rhoPrime, 0))
}
