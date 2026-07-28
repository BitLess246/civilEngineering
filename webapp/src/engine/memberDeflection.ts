// ─────────────────────────────────────────────────────────────────────────
// CRACKED SERVICE DEFLECTION of a frame member, from its own FEM moment
// diagram. NSCP 2015 §424.2 (= ACI 318-14 §24.2).
//
// The standalone beam page computes δ from an assumed uniform load and a
// tabulated coefficient (`beamServiceDeflection`). A member inside a frame has
// neither: its load pattern is whatever the model applies, and its end
// restraint comes from the joints, not a table. So instead of guessing an
// equivalent UDL, this integrates the member's ACTUAL service moment diagram:
//
//   EI·v″ = M(x)   ⇒   v(x) = ∬ M/EI  with the member's own end conditions.
//
// Two boundary cases, matching what the deflection LIMIT means:
//   • spanning member — v(0) = v(L) = 0. The result is the deflection relative
//     to the CHORD through the two displaced joints, which is the quantity
//     L/360 and L/240 are written against (joint settlement/sway is not a
//     flexural serviceability problem).
//   • cantilever — v(0) = v′(0) = 0 at the built-in end; the tip is free, so a
//     chord condition would wrongly report zero tip deflection.
//
// The flexural rigidity is Ec·Ie with Branson's effective inertia, so the
// member's stiffness reflects cracking even though the FEM solved on gross (or
// ACI §6.6.3.1.1 modified) sections — the moment DIAGRAM of a prismatic member
// is insensitive to a uniform stiffness scale, so scaling only the integration
// is consistent.
//
// Units: xs/L m; M kN·m; b/h/d/d′ mm; As mm²; fc/fy MPa; δ mm.
// ─────────────────────────────────────────────────────────────────────────
import { Ec } from './slabDeflection'
import { crackedInertia, longTermMultiplier, minBeamThickness, type BeamSupport } from './beamDeflection'

/**
 * Branson's effective moment of inertia (§424.2.3.5):
 *   Ie = (Mcr/Ma)³·Ig + [1 − (Mcr/Ma)³]·Icr ≤ Ig,  and Ie = Ig while Ma ≤ Mcr.
 * `Ma` and `Mcr` in the same units; `Ig`/`Icr` in the same units.
 */
export function bransonIe(Ma: number, Mcr: number, Ig: number, Icr: number): number {
  if (!(Ma > Mcr) || !(Ma > 0)) return Ig
  const r = (Mcr / Ma) ** 3
  return Math.min(Ig, r * Ig + (1 - r) * Icr)
}

/** Modulus of rupture fr = 0.62·λ·√f′c, MPa (§419.2.3.1). */
export function ruptureModulus(fc: number, lambda = 1): number {
  return 0.62 * lambda * Math.sqrt(Math.max(fc, 1))
}

export interface ChordDeflection {
  /** Deflection at each station, mm. Positive = downward (sagging). */
  v: number[]
  /** Largest |v|, mm. */
  max: number
  /** Station (m from the i-end) where |v| peaks. */
  xMax: number
}

/**
 * Double-integrate M/EI along a member.
 *
 * `xs` are stations in m (ascending, first = 0), `M` the moment at each in
 * kN·m with the frame3d sign convention (M > 0 = sagging = tension on the
 * bottom). `EI` is in kN·m² and may vary per station (pass one value to use it
 * everywhere).
 *
 * The curvature φ = M/EI is taken as piecewise LINEAR between stations and
 * BOTH integrals are then evaluated in closed form, so a linear moment diagram
 * — what the frame element recovers between load points — is integrated
 * EXACTLY, and a parabolic one (UDL) converges as O(Δx²). Trapezoid on the
 * second integral would not be exact even in the linear case.
 *
 * `cantilever` integrates from the built-in i-end (v = v′ = 0); otherwise both
 * ends are pinned to the chord (v(0) = v(L) = 0).
 *
 * Sign: DOWNWARD deflection is positive in both boundary cases — a sagging
 * span and a gravity-loaded cantilever tip both come out +.
 */
export function chordDeflection(
  xs: number[], M: number[], EI: number | number[], cantilever = false,
): ChordDeflection {
  const n = Math.min(xs.length, M.length)
  if (n < 2) return { v: new Array(Math.max(n, 0)).fill(0), max: 0, xMax: 0 }
  const ei = (k: number) => {
    const e = Array.isArray(EI) ? (EI[k] ?? EI[0]) : EI
    return Math.abs(e) > 1e-12 ? e : 1e-12
  }
  // curvature φ = M/EI, 1/m
  const phi = new Array(n)
  for (let k = 0; k < n; k++) phi[k] = M[k] / ei(k)

  // θ(x) = ∫φ dx and w(x) = ∫θ dx, both exact for φ linear on each segment:
  //   θ₁ = θ₀ + s·(φ₀+φ₁)/2
  //   w₁ = w₀ + θ₀·s + φ₀·s²/2 + (φ₁−φ₀)·s²/6
  const theta = new Array(n).fill(0)
  const w = new Array(n).fill(0)
  for (let k = 1; k < n; k++) {
    const s = xs[k] - xs[k - 1]
    w[k] = w[k - 1] + theta[k - 1] * s + (phi[k - 1] * s * s) / 2 + ((phi[k] - phi[k - 1]) * s * s) / 6
    theta[k] = theta[k - 1] + 0.5 * (phi[k] + phi[k - 1]) * s
  }

  const L = xs[n - 1] - xs[0]
  const v = new Array(n)
  if (cantilever || L <= 1e-12) {
    // built-in at the i-end: the particular solution already has v = v′ = 0
    for (let k = 0; k < n; k++) v[k] = w[k]
  } else {
    // enforce v(L) = 0 by adding the linear term that the slope constant gives
    const slope = w[n - 1] / L
    for (let k = 0; k < n; k++) v[k] = w[k] - slope * (xs[k] - xs[0])
  }

  // report DOWNWARD deflection as positive: both a sagging span and a
  // gravity-loaded (hogging) cantilever integrate to v < 0 in this convention
  let max = 0, xMax = xs[0]
  for (let k = 0; k < n; k++) {
    v[k] = -v[k] * 1000            // m → mm, flip so sag is +
    if (Math.abs(v[k]) > Math.abs(max)) { max = v[k]; xMax = xs[k] }
  }
  return { v, max, xMax }
}

export interface MemberDeflectionInput {
  /** Stations along the member, m (from the frame3d member result). */
  xs: number[]
  /** Service DEAD moment diagram, kN·m (D-only solve). */
  MD: number[]
  /** Service LIVE moment diagram, kN·m (L-only solve). */
  ML: number[]
  /** Member length, m. */
  L: number
  /** Section: width, overall depth, effective depth (mm). */
  b: number; h: number; d: number
  /** Tension steel at the critical sagging section, mm². */
  As: number
  /** Compression steel and its depth there (mm², mm). */
  AsPrime?: number; dPrime?: number
  fc: number
  fy?: number
  /** Lightweight-concrete factor λ (§419.2.4). */
  lambda?: number
  /** Span type — only used for the deemed-to-comply hMin and to detect a
   *  cantilever's boundary condition. */
  support?: BeamSupport
}

export interface MemberDeflectionResult {
  Ig: number; Icr: number; Ie: number
  /** Cracking moment and the service moment that governs Ie, kN·m. */
  Mcr: number; Ma: number
  cracked: boolean
  /** Immediate dead / live deflection, mm. */
  deltaD: number; deltaL: number
  /** λΔ = ξ/(1+50ρ′) and the long-term (sustained) dead deflection, mm. */
  lambdaDelta: number; deltaLong: number
  /** Total = long-term dead + immediate live, mm (§424.2.2). */
  deltaTotal: number
  limitL360: number; limitL240: number
  liveOK: boolean; totalOK: boolean
  /** Table 409.3.1.1 deemed-to-comply thickness and whether the section meets it. */
  hMin: number; hMinOK: boolean
  /** Station of the peak total deflection, m from the i-end. */
  xMax: number
  support: BeamSupport
}

/**
 * §424.2 service deflection of a frame member, integrated from its own D-only
 * and L-only moment diagrams.
 *
 * `Ma` for Branson is taken as the peak |M| of the SERVICE (D + L) diagram,
 * which is where the member is most cracked; a single Ie over the span is what
 * §424.2.3.5 intends (R24.2.3.6 allows averaging for continuous members — not
 * done here, so the result is the conservative side).
 */
export function memberServiceDeflection(i: MemberDeflectionInput): MemberDeflectionResult {
  const { xs, MD, ML, L, b, h, d, As, fc } = i
  const lambda = i.lambda ?? 1
  const support = i.support ?? 'both-ends'
  const AsPrime = i.AsPrime ?? 0

  const Ig = (b * h ** 3) / 12
  const Icr = crackedInertia({ b, d, As, fc, AsPrime, dPrime: i.dPrime })
  const Mcr = (ruptureModulus(fc, lambda) * Ig) / (h / 2) / 1e6      // kN·m

  const n = Math.min(xs.length, MD.length, ML.length)
  let Ma = 0
  for (let k = 0; k < n; k++) Ma = Math.max(Ma, Math.abs(MD[k] + ML[k]))
  const Ie = bransonIe(Ma, Mcr, Ig, Icr)
  const cracked = Ma > Mcr && Ma > 0

  // EI in kN·m². Ec [MPa = N/mm²] × I [mm⁴] = N·mm²; ×1e-3 (N→kN) ×1e-6
  // (mm²→m²) = ×1e-9. Getting this exponent wrong scales every deflection by
  // 1000, so it is spelled out rather than folded into a magic constant.
  const EI = (Ec(fc) * Ie) * 1e-9
  const cant = support === 'cantilever'
  const dD = chordDeflection(xs.slice(0, n), MD.slice(0, n), EI, cant)
  const dL = chordDeflection(xs.slice(0, n), ML.slice(0, n), EI, cant)

  const deltaD = Math.abs(dD.max)
  const deltaL = Math.abs(dL.max)
  const lambdaDelta = longTermMultiplier(AsPrime / Math.max(b * d, 1e-9))
  const deltaLong = lambdaDelta * deltaD
  const deltaTotal = deltaLong + deltaL

  const Lmm = L * 1000
  const limitL360 = Lmm / 360
  const limitL240 = Lmm / 240
  const hMin = minBeamThickness(L, support, i.fy ?? 420)

  return {
    Ig, Icr, Ie, Mcr, Ma, cracked,
    deltaD, deltaL, lambdaDelta, deltaLong, deltaTotal,
    limitL360, limitL240,
    liveOK: deltaL <= limitL360 + 1e-9,
    totalOK: deltaTotal <= limitL240 + 1e-9,
    hMin, hMinOK: h >= hMin - 1e-9,
    xMax: Math.abs(dD.max) >= Math.abs(dL.max) ? dD.xMax : dL.xMax,
    support,
  }
}
