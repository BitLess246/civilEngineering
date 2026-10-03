// ─────────────────────────────────────────────────────────────────────────
// GEOMETRIC DESIGN — stopping sight distance, parabolic vertical curves and
// superelevation, the three algebra pillars of highway alignment design.
//
// Units are SI throughout: speed V in km/h, lengths in metres, grades as
// PERCENT (the highway convention), distances as plain metres.
//
// Constants and where they come from (all hand-verified against the AASHTO
// Green Book / FE reference handbook forms):
//   · SSD: d = 0.278·V·t + V²/(254·(f ± G)). 0.278 = 1000/3600 converts
//     km/h to m/s for the 2.5 s reaction piece; 254 = 2·9.81·12960/1000 is
//     the braking constant in km/h²→m. Grade enters as f + G with G in
//     DECIMAL, + on an upgrade (gravity helps, shorter) and − on a
//     downgrade (longer).
//   · Crest curve (sight over the curve): L = A·S²/[100·(√(2h₁)+√(2h₂))²].
//     AASHTO metric eye/object 1.08/0.60 m → the classic L = A·S²/658;
//     US customary 3.5/2.0 ft → L = A·S²/2158. S > L branch:
//     L = 2S − c/A where c = 100·(√(2h₁)+√(2h₂))².
//   · Sag curve (headlight): L = A·S²/(200·h + 3.5·S) with h the headlight
//     height (0.60 m metric → L = A·S²/(120+3.5S); 2.0 ft US → the classic
//     L = A·S²/(400+3.5S)). S > L: L = 2S − (200h + 3.5S)/A.
//   · Sag comfort: L ≥ A·V²/395 (metric, radial acceleration 0.3 m/s³).
// ─────────────────────────────────────────────────────────────────────────

export const GRAVITY = 9.81

/** Stopping sight distance: reaction piece + braking piece. */
export interface SSDInput {
  /** Design speed, km/h. */
  V: number
  /** Perception–brake reaction time, s (AASHTO default 2.5). */
  t?: number
  /** Braking friction coefficient (default 0.35, the AASHTO design value). */
  f?: number
  /** Grade as a decimal, + upgrade / − downgrade (default 0). */
  grade?: number
}

export interface SSDResult {
  /** Reaction (perception–brake) distance, m. */
  reaction: number
  /** Braking distance, m. */
  braking: number
  /** Total stopping sight distance, m. */
  total: number
}

export function stoppingSightDistance(p: SSDInput): SSDResult {
  const t = p.t ?? 2.5
  const f = p.f ?? 0.35
  const G = p.grade ?? 0
  if (!(p.V > 0)) throw new Error('Design speed must be positive')
  if (!(t > 0)) throw new Error('Reaction time must be positive')
  if (!(f + G > 0)) throw new Error('f + grade must stay positive — the grade is too steep to brake on')
  const reaction = 0.278 * p.V * t
  const braking = (p.V * p.V) / (254 * (f + G))
  return { reaction, braking, total: reaction + braking }
}

// ── parabolic vertical curve geometry ────────────────────────────────────

export interface VertCurveInput {
  /** Entry grade g₁ in percent. */
  g1: number
  /** Exit grade g₂ in percent. */
  g2: number
  /** Curve length L in metres (along the horizontal). */
  L: number
  /** Station of the PVI, m (any chaining convention — arithmetic only). */
  PVIstation: number
  /** Elevation of the PVI, m. */
  PVIelev: number
}

export interface VertCurveResult {
  A: number
  /** Grade rate r = (g₂ − g₁)/(2L) in % per metre — d(elev)/dx/100. */
  r: number
  /** K = L/A, m per %; the design shorthand for sight distance. */
  K: number
  BVCstation: number
  BVCelev: number
  EVCstation: number
  EVCelev: number
  /** External ordinate e = A·L/800 — how far the curve sags below (or peaks above) the PVI. */
  PVIoffset: number
  /** Distance of the turning point from the BVC, m (null when monotonic). */
  turnX: number | null
  turnStation: number | null
  turnElev: number | null
  /** 'high' when the curve crests, 'low' when it sags, null when monotonic. */
  turnKind: 'high' | 'low' | null
  /** Curve elevation at x metres from the BVC. */
  elevAt(x: number): number
  /** Tangent (grade line) elevation at x metres from the BVC. */
  tangentAt(x: number): number
}

export function buildVerticalCurve(p: VertCurveInput): VertCurveResult {
  const { g1, g2, L, PVIstation, PVIelev } = p
  if (!(L > 0)) throw new Error('Curve length must be positive')
  const A = Math.abs(g2 - g1)
  const BVCstation = PVIstation - L / 2
  // Tangent grade on entry drops the PVI by g1·L/200 (percent·m / 100).
  const BVCelev = PVIelev - (g1 / 100) * (L / 2)
  const EVCstation = PVIstation + L / 2
  const EVCelev = PVIelev + (g2 / 100) * (L / 2)
  const a = (g2 - g1) / (200 * L) // per-metre² coefficient, elevations in m
  const b = g1 / 100
  const elevAt = (x: number): number => BVCelev + b * x + a * x * x
  const tangentAt = (x: number): number => BVCelev + b * x
  const PVIoffset = (A * L) / 800
  let turnX: number | null = null
  let turnKind: 'high' | 'low' | null = null
  if (g1 * g2 < 0) {
    const x = (-b / (2 * a))
    if (x > 0 && x < L) {
      turnX = x
      turnKind = g1 > 0 ? 'high' : 'low'
    }
  }
  return {
    A,
    r: (g2 - g1) / (2 * L),
    K: A > 0 ? L / A : Infinity,
    BVCstation, BVCelev, EVCstation, EVCelev, PVIoffset,
    turnX,
    turnStation: turnX != null ? BVCstation + turnX : null,
    turnElev: turnX != null ? elevAt(turnX) : null,
    turnKind,
    elevAt,
    tangentAt,
  }
}

// ── sight-distance length requirements ───────────────────────────────────

export interface SightSpec {
  /** Sight (stopping) distance S, m. */
  S: number
  /** Algebraic grade difference A = |g₂ − g₁|, percent. */
  A: number
  /** Driver eye height, m (metric AASHTO 1.08). */
  h1?: number
  /** Object height (crest) or headlight height (sag), m (0.60). */
  h2?: number
}

export interface CurveLengthResult {
  /** Minimum curve length, m (never negative — 0 means a tangent suffices). */
  Lmin: number
  /** Which branch governed: the sight distance fits inside the curve or not. */
  regime: 'S ≤ L' | 'S > L'
  /** K value of the required curve, m/%. */
  K: number
}

/** Minimum CREST curve length so the sight line clears over the curve. */
export function minCrestLength(p: SightSpec): CurveLengthResult {
  const h1 = p.h1 ?? 1.08
  const h2 = p.h2 ?? 0.6
  if (!(p.S > 0)) throw new Error('Sight distance must be positive')
  if (!(p.A > 0)) throw new Error('Grade difference A must be positive')
  const c = 100 * Math.pow(Math.sqrt(2 * h1) + Math.sqrt(2 * h2), 2) // 658 metric
  const flat = (p.A * p.S * p.S) / c // the S ≤ L candidate
  if (flat >= p.S) {
    return { Lmin: flat, regime: 'S ≤ L', K: flat / p.A }
  }
  const long = Math.max(0, 2 * p.S - c / p.A) // the S > L candidate
  return { Lmin: long, regime: 'S > L', K: long / p.A }
}

/** Minimum SAG curve length for headlight sight distance at night. */
export function minSagLength(p: SightSpec): CurveLengthResult {
  const h = p.h2 ?? 0.6
  if (!(p.S > 0)) throw new Error('Sight distance must be positive')
  if (!(p.A > 0)) throw new Error('Grade difference A must be positive')
  const d = 200 * h // 120 metric — the constant of the headlight criterion
  const flat = (p.A * p.S * p.S) / (d + 3.5 * p.S)
  if (flat >= p.S) {
    return { Lmin: flat, regime: 'S ≤ L', K: flat / p.A }
  }
  const long = Math.max(0, 2 * p.S - (d + 3.5 * p.S) / p.A)
  return { Lmin: long, regime: 'S > L', K: long / p.A }
}

/**
 * Minimum sag length by RIDER COMFORT (radial acceleration ≤ 0.3 m/s³):
 * L ≥ A·V²/395 with A in % and V in km/h. Comfort governs only rarely —
 * at high speed on gentle grade changes — and is independent of sight.
 */
export function minSagComfort(A: number, V: number): number {
  if (!(A > 0)) throw new Error('Grade difference A must be positive')
  if (!(V > 0)) throw new Error('Speed must be positive')
  return (A * V * V) / 395
}

// ── superelevation ───────────────────────────────────────────────────────

export interface SuperInput {
  /** Design speed, km/h. */
  V: number
  /** Curve radius, m. */
  R: number
  /** Maximum superelevation rate, decimal (default 0.08). */
  eMax?: number
  /** Side-friction factor (default 0.15). */
  fMax?: number
}

export interface SuperResult {
  /** Centripetal demand e + f = V²/(127R). */
  demand: number
  /** Superelevation to supply, decimal (capped at eMax; may be negative = crown removal territory). */
  e: number
  /** Side friction left to the tyres, decimal. */
  f: number
  /** Minimum radius for the given eMax and fMax, m. */
  Rmin: number
  /** Degree of curve (arc definition), degrees per 100 m of arc. */
  D: number
  /** True when R ≥ Rmin — the radius can carry the speed with the given limits. */
  ok: boolean
  warning: string | null
}

/**
 * Superelevation by the point-mass balance e + f = V²/(127·R): the required
 * rate is taken as the demand minus the full side-friction allowance, then
 * capped at eMax (any leftover friction beyond eMax is checked against fMax).
 */
export function superelevation(p: SuperInput): SuperResult {
  const eMax = p.eMax ?? 0.08
  const fMax = p.fMax ?? 0.15
  if (!(p.V > 0)) throw new Error('Design speed must be positive')
  if (!(p.R > 0)) throw new Error('Radius must be positive')
  if (!(eMax >= 0 && eMax < 0.14)) throw new Error('eMax must be in [0, 0.14) — 0.14 is ice territory')
  if (!(fMax > 0 && fMax <= 0.3)) throw new Error('Side friction factor must be in (0, 0.3]')
  const demand = (p.V * p.V) / (127 * p.R)
  const Rmin = (p.V * p.V) / (127 * (eMax + fMax))
  const D = 5729.578 / p.R // arc definition, degrees
  let e = Math.max(0, demand - fMax)
  if (e > eMax) e = eMax
  const f = Math.max(0, demand - e)
  const ok = p.R >= Rmin - 1e-9
  const warning = ok
    ? null
    : `Radius ${p.R.toFixed(1)} m is below Rmin = ${Rmin.toFixed(1)} m — the curve cannot carry ${p.V} km/h with eMax = ${(eMax * 100).toFixed(0)}% and f = ${fMax.toFixed(2)}`
  return { demand, e, f, Rmin, D, ok, warning }
}
