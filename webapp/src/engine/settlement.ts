// ─────────────────────────────────────────────────────────────────────────
// FOUNDATION SETTLEMENT — stress distribution, immediate (elastic) settlement,
// one-dimensional consolidation and its time rate. Layer L8 (geotech).
//
// `bearing.ts` answers "will the soil fail?"; this answers "how far will it
// move, and when?" — the serviceability half of a foundation check, and the one
// that usually governs on compressible ground.
//
// Three pieces, each usable on its own:
//
//  1. STRESS INCREASE. Boussinesq's elastic solution for the corner of a
//     uniformly loaded rectangle, superposed four ways for the centre. This is
//     what turns a bearing pressure into the Δσ′ each sublayer actually feels.
//     The cruder 2:1 spread is also provided, because it is what hand checks
//     use and the difference between them is worth being able to see.
//
//  2. IMMEDIATE SETTLEMENT. Elastic (Se = q·B·(1−ν²)·If/Es) for a quick check,
//     and SCHMERTMANN's strain-influence method, which is the one to use on
//     sands: it puts the strain where it physically occurs (peak at ~B/2 for a
//     square footing, not at the surface) and carries creep through C2.
//
//  3. CONSOLIDATION. Terzaghi 1-D, layer by layer, with the overconsolidated
//     case handled properly — recompression up to σ′p, virgin compression
//     beyond it, and the two-part case where the stress increment crosses σ′p.
//     Getting that split wrong is the classic way to overestimate settlement on
//     a crust by a factor of several. Plus U ↔ Tv both ways, so "how much by
//     when" and "how long until 90%" are both answerable.
//
// Units: lengths m; unit weights kN/m³; stresses and moduli kPa; time years
// (cv in m²/yr); settlement returned in mm.
// Refs: Das, *Principles of Foundation Engineering* §5–§11; Terzaghi 1943;
// Schmertmann, Hartman & Brown (1978); Boussinesq (1885).
// ─────────────────────────────────────────────────────────────────────────

const GAMMA_W = 9.81   // kN/m³

/**
 * Boussinesq influence factor for the CORNER of a uniformly loaded rectangle:
 * Δσ = q·I with m = B/z and n = L/z. Symmetric in m and n.
 *
 * The arctangent needs a branch shift: when m²n² > m²+n²+1 the denominator goes
 * negative and `Math.atan` returns the wrong branch, which silently halves the
 * factor for large loaded areas. Adding π there is not a fudge — it is the
 * correct principal value, and a test pins I → 0.25 as m, n → ∞ to catch it.
 */
export function boussinesqCorner(m: number, n: number): number {
  if (!(m > 0) || !(n > 0)) return 0
  const m2 = m * m, n2 = n * n
  const a = m2 + n2 + 1
  const b = m2 * n2
  const root = Math.sqrt(a)
  const t1 = ((2 * m * n * root) / (a + b)) * ((m2 + n2 + 2) / a)
  let t2 = Math.atan((2 * m * n * root) / (a - b))
  if (b > a) t2 += Math.PI
  return (t1 + t2) / (4 * Math.PI)
}

export type LoadPosition = 'center' | 'corner'

/**
 * Vertical stress increase at depth `z` below a uniformly loaded B × L
 * rectangle, kPa. `z` is measured from the loaded plane (the footing base).
 *
 * The centre is four quarter-rectangles of B/2 × L/2 superposed — Boussinesq is
 * linear elastic, so superposition is exact rather than an approximation.
 */
export function stressUnderRect(
  q: number, B: number, L: number, z: number, position: LoadPosition = 'center',
): number {
  if (!(z > 0)) return q
  if (position === 'corner') return q * boussinesqCorner(B / z, L / z)
  return 4 * q * boussinesqCorner(B / 2 / z, L / 2 / z)
}

/**
 * The 2:1 (one horizontal to two vertical) spread, kPa — the hand-check
 * approximation. Kept alongside Boussinesq so a user can see how far apart they
 * are; it is NOT used by the consolidation routine.
 */
export function stress2to1(q: number, B: number, L: number, z: number): number {
  if (!(z > 0)) return q
  return (q * B * L) / ((B + z) * (L + z))
}

export interface SoilLayer {
  name?: string
  /** Layer thickness, m. */
  H: number
  /** Bulk unit weight, kN/m³ (used above the water table). */
  gamma: number
  /** Saturated unit weight, kN/m³ — defaults to `gamma`. */
  gammaSat?: number
  /** Initial void ratio e₀. Required for the layer to consolidate. */
  e0?: number
  /** Virgin compression index Cc. Omit (or 0) for a non-compressible layer. */
  Cc?: number
  /**
   * Recompression index Cr. Defaults to Cc/6 — the middle of the commonly
   * quoted Cr ≈ Cc/5…Cc/10 band. Supply it when you have oedometer data; the
   * default is a stated assumption, not a measurement.
   */
  Cr?: number
  /** Preconsolidation pressure σ′p, kPa. Omit ⇒ normally consolidated. */
  sigmaP?: number
  /** Coefficient of consolidation, m²/yr. */
  cv?: number
  /** Drainage: 'both' faces (default) halves the drainage path. */
  drainage?: 'both' | 'one'
}

export interface LayerSettlement {
  name: string
  /** Depth to the top and mid-height of the layer, m below ground. */
  zTop: number
  zMid: number
  H: number
  /** Effective overburden at mid-height before loading, kPa. */
  sigma0: number
  /** Stress increase at mid-height, kPa. */
  dSigma: number
  /** Preconsolidation pressure used, kPa (= sigma0 when normally consolidated). */
  sigmaP: number
  /** Which branch of the e–log σ′ curve was used. */
  branch: 'normally-consolidated' | 'recompression' | 'recompression+virgin' | 'none'
  /** Settlement of this layer, mm. */
  settlement: number
}

export interface ConsolidationInput {
  layers: SoilLayer[]
  /** Depth to the water table below ground, m. Infinity = dry profile. */
  waterTable?: number
  /** Footing bearing pressure (net, at base level), kPa. */
  q: number
  /** Footing plan dimensions, m. */
  B: number
  L: number
  /** Founding depth below ground, m. */
  Df?: number
  /** Sublayers each soil layer is divided into for the stress integration. */
  slices?: number
  /** Where under the footing to evaluate (default the centre — the maximum). */
  position?: LoadPosition
}

export interface ConsolidationResult {
  layers: LayerSettlement[]
  /** Total primary consolidation settlement, mm. */
  total: number
}

/**
 * Effective overburden σ′v at a depth, kPa, from a layered profile with a water
 * table. Pore pressure is subtracted below the table, so this is the effective
 * stress consolidation is driven by — not the total.
 */
export function effectiveStress(layers: SoilLayer[], z: number, waterTable = Infinity): number {
  let sig = 0, depth = 0
  for (const l of layers) {
    const top = depth, bot = depth + l.H
    if (z <= top) break
    const dz = Math.min(z, bot) - top
    // split the slice at the water table
    const dry = Math.max(0, Math.min(dz, waterTable - top))
    const wet = dz - dry
    sig += dry * l.gamma + wet * (l.gammaSat ?? l.gamma)
    depth = bot
    if (z <= bot) break
  }
  const u = z > waterTable ? (z - waterTable) * GAMMA_W : 0
  return Math.max(sig - u, 0)
}

/**
 * Primary consolidation settlement of a layered profile under a rectangular
 * footing, mm. Each layer is sliced so the stress increase is integrated rather
 * than taken at one mid-height point.
 *
 * Per slice, with σ′₀ the effective overburden and σ′f = σ′₀ + Δσ:
 *   σ′f ≤ σ′p                 →  Cr·H/(1+e₀)·log₁₀(σ′f/σ′₀)          (recompression)
 *   σ′₀ ≥ σ′p                 →  Cc·H/(1+e₀)·log₁₀(σ′f/σ′₀)          (virgin)
 *   σ′₀ < σ′p < σ′f           →  Cr·…·log₁₀(σ′p/σ′₀) + Cc·…·log₁₀(σ′f/σ′p)
 * The third case is the one that matters: treating an overconsolidated crust as
 * normally consolidated overestimates its settlement several-fold.
 */
export function consolidationSettlement(inp: ConsolidationInput): ConsolidationResult {
  const { layers, q, B, L } = inp
  const waterTable = inp.waterTable ?? Infinity
  const Df = inp.Df ?? 0
  const slices = Math.max(1, Math.floor(inp.slices ?? 10))
  const position = inp.position ?? 'center'

  const out: LayerSettlement[] = []
  let zTop = 0
  for (const [k, l] of layers.entries()) {
    const compressible = (l.Cc ?? 0) > 0 && (l.e0 ?? 0) > 0
    let s = 0
    let branchSeen: LayerSettlement['branch'] = 'none'
    const dz = l.H / slices
    for (let i = 0; i < slices; i++) {
      const z = zTop + (i + 0.5) * dz
      if (!compressible || z <= Df) continue
      const sigma0 = effectiveStress(layers, z, waterTable)
      if (!(sigma0 > 0)) continue
      const dSig = stressUnderRect(q, B, L, z - Df, position)
      const sigmaF = sigma0 + dSig
      const sigmaP = Math.max(l.sigmaP ?? 0, sigma0)     // never below overburden
      const Cc = l.Cc!, Cr = l.Cr ?? Cc / 6, e0 = l.e0!
      const f = dz / (1 + e0)
      let ds: number
      if (sigmaF <= sigmaP) {
        ds = Cr * f * Math.log10(sigmaF / sigma0)
        if (branchSeen === 'none') branchSeen = 'recompression'
      } else if (sigma0 >= sigmaP) {
        ds = Cc * f * Math.log10(sigmaF / sigma0)
        if (branchSeen === 'none') branchSeen = 'normally-consolidated'
      } else {
        ds = Cr * f * Math.log10(sigmaP / sigma0) + Cc * f * Math.log10(sigmaF / sigmaP)
        branchSeen = 'recompression+virgin'
      }
      s += ds
    }
    const zMid = zTop + l.H / 2
    out.push({
      name: l.name ?? `Layer ${k + 1}`,
      zTop, zMid, H: l.H,
      sigma0: effectiveStress(layers, zMid, waterTable),
      dSigma: zMid > Df ? stressUnderRect(q, B, L, zMid - Df, position) : 0,
      sigmaP: Math.max(l.sigmaP ?? 0, effectiveStress(layers, zMid, waterTable)),
      branch: branchSeen,
      settlement: s * 1000,        // m → mm
    })
    zTop += l.H
  }
  return { layers: out, total: out.reduce((a, b) => a + b.settlement, 0) }
}

// ── Time rate of consolidation (Terzaghi) ───────────────────────────────────

/**
 * Time factor Tv for a given average degree of consolidation U (0…1).
 *   U ≤ 60%   Tv = (π/4)·U²
 *   U > 60%   Tv = 1.781 − 0.933·log₁₀(100 − U%)
 *
 * These are the standard closed-form approximations to Terzaghi's Fourier
 * series, not the series itself: at U = 50% the parabola gives 0.1963 against
 * the tabulated 0.197, about 0.3% low. The two branches also do NOT meet
 * exactly at 60% — 0.2827 against 0.2863, a 1.3% step — which is a property of
 * the published fit rather than an error here, and is small next to the
 * uncertainty in cv. Both facts are pinned by tests so neither can be mistaken
 * for exactness later.
 */
export function timeFactor(U: number): number {
  const u = Math.min(Math.max(U, 0), 0.9999)
  if (u <= 0.6) return (Math.PI / 4) * u * u
  return 1.781 - 0.933 * Math.log10(100 - u * 100)
}

/** Average degree of consolidation for a time factor — the inverse of `timeFactor`. */
export function degreeOfConsolidation(Tv: number): number {
  if (!(Tv > 0)) return 0
  const boundary = (Math.PI / 4) * 0.36          // Tv at U = 60%
  if (Tv <= boundary) return Math.min(Math.sqrt((4 * Tv) / Math.PI), 0.6)
  const U = 1 - Math.pow(10, (1.781 - Tv) / 0.933) / 100
  return Math.min(Math.max(U, 0), 1)
}

/** Drainage path length, m: half the layer when it drains both faces. */
export const drainagePath = (l: SoilLayer): number =>
  (l.drainage ?? 'both') === 'both' ? l.H / 2 : l.H

/** Time (years) to reach a degree of consolidation U in a layer: t = Tv·H_dr²/cv. */
export function timeToConsolidation(l: SoilLayer, U: number): number {
  const cv = l.cv ?? 0
  if (!(cv > 0)) return Infinity
  return (timeFactor(U) * drainagePath(l) ** 2) / cv
}

/** Degree of consolidation reached after `t` years. */
export function consolidationAfter(l: SoilLayer, t: number): number {
  const cv = l.cv ?? 0
  if (!(cv > 0) || !(t > 0)) return 0
  return degreeOfConsolidation((cv * t) / drainagePath(l) ** 2)
}

// ── Immediate (elastic) settlement ──────────────────────────────────────────

/**
 * Elastic settlement of a flexible footing corner/centre, mm:
 *   Se = q·B·(1 − ν²)·If / Es
 * `If` is the shape/rigidity influence factor — 1.12 (square, centre), 1.36
 * (L/B = 2) and 1.52 (L/B = 5) for a flexible base at the centre; a rigid base
 * settles about 7% less, applied when `rigid` is set.
 */
export function elasticSettlement(p: {
  q: number; B: number; L?: number; Es: number; nu?: number; rigid?: boolean
}): number {
  const { q, B, Es } = p
  if (!(Es > 0) || !(B > 0)) return 0
  const nu = p.nu ?? 0.3
  const ratio = (p.L ?? B) / B
  // centre of a flexible rectangle — interpolated on log(L/B) between the
  // classical values, which is how the published curve actually behaves
  const If = ratio <= 1 ? 1.12
    : ratio >= 5 ? 1.52 + 0.24 * Math.log10(ratio / 5)
      : 1.12 + ((1.52 - 1.12) * Math.log10(ratio)) / Math.log10(5)
  const se = (q * B * (1 - nu * nu) * If) / Es
  return se * 1000 * (p.rigid ? 0.93 : 1)
}

export interface SchmertmannLayer {
  /** Sublayer thickness, m. */
  H: number
  /** Deformation modulus, kPa. */
  Es: number
}

export interface SchmertmannResult {
  /** Depth-correction factor C₁ = 1 − 0.5·σ′₀/Δp, floored at 0.5. */
  C1: number
  /** Creep factor C₂ = 1 + 0.2·log₁₀(t/0.1). */
  C2: number
  /** Σ(Iz/Es)·Δz, m³/kN. */
  sumIzEz: number
  /** Settlement, mm. */
  settlement: number
  /** Peak strain-influence value used. */
  Izp: number
  /** Depth of influence below the footing, m. */
  zInfluence: number
}

/**
 * SCHMERTMANN strain-influence settlement of a footing on sand, mm.
 *
 *   Se = C₁·C₂·Δp·Σ (Iz/Es)·Δz
 *
 * The strain-influence diagram is triangular and — the physically important
 * part — peaks BELOW the footing rather than at it: at z = B/2 for a square
 * (influence to 2B) and at z = B for a strip (influence to 4B), interpolated on
 * L/B in between. The peak value is Izp = 0.5 + 0.1·√(Δp/σ′zp) with σ′zp the
 * effective overburden at the peak depth.
 *
 * `layers` are sublayers below the footing base, top-down.
 */
export function schmertmannSettlement(p: {
  /** Net applied pressure Δp, kPa. */
  dp: number
  /** Footing width and length, m. */
  B: number; L?: number
  /** Effective overburden at founding level, kPa. */
  sigma0: number
  /** Unit weight used to build σ′ below the base, kN/m³. */
  gamma: number
  layers: SchmertmannLayer[]
  /** Elapsed time for the creep factor, years (default 1). */
  years?: number
}): SchmertmannResult {
  const { dp, B, sigma0, gamma, layers } = p
  const ratio = (p.L ?? B) / B
  const strip = ratio >= 10
  const zPeak = strip ? B : ratio <= 1 ? B / 2 : (B / 2) * (1 + (ratio - 1) / 9)
  const zInf = strip ? 4 * B : ratio <= 1 ? 2 * B : 2 * B * (1 + (ratio - 1) / 9)

  const sigmaZp = sigma0 + gamma * zPeak
  const Izp = 0.5 + 0.1 * Math.sqrt(Math.max(dp, 0) / Math.max(sigmaZp, 1e-9))
  const Iz = (z: number) => {
    if (z <= 0) return strip ? 0.2 : 0.1
    if (z >= zInf) return 0
    const start = strip ? 0.2 : 0.1
    return z <= zPeak
      ? start + ((Izp - start) * z) / zPeak
      : (Izp * (zInf - z)) / (zInf - zPeak)
  }

  let sum = 0, z = 0
  for (const l of layers) {
    if (z >= zInf) break
    const h = Math.min(l.H, zInf - z)
    if (l.Es > 0) sum += (Iz(z + h / 2) / l.Es) * h
    z += l.H
  }

  const C1 = Math.max(1 - 0.5 * (sigma0 / Math.max(dp, 1e-9)), 0.5)
  const C2 = 1 + 0.2 * Math.log10(Math.max(p.years ?? 1, 0.1) / 0.1)
  return { C1, C2, sumIzEz: sum, Izp, zInfluence: zInf, settlement: C1 * C2 * dp * sum * 1000 }
}
