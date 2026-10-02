// ─────────────────────────────────────────────────────────────────────────
// PILE CAPACITY — static ultimate and allowable capacity of a single driven
// pile through layered soil, the board-exam workhorse method set.
//
// SI throughout: forces in kN, stresses in kPa, lengths in m. Water unit
// weight 9.81 kN/m³; effective stresses below the water table use the
// submerged (buoyant) unit weight.
//
// Methods (standard textbook forms — Das, Principles of Foundation
// Engineering; Tomlinson; API RP2A for the sand factors):
//
//   SHAFT, CLAY (α method)
//     f = α·cu with α interpolating 1.0 at cu ≤ 25 kPa down to 0.5 at
//     cu ≥ 70 kPa (linear in between) — the common simplified adhesion
//     relation; Qs = Σ p·f·ΔL per layer.
//   SHAFT, SAND
//     f = K·σ′v·tanδ taken at each layer's mid-depth; defaults
//     K = 1 − sin φ (≈ earth pressure at rest, driven piles) and
//     δ = φ − 5° (driven displacement piles), both overridable.
//   END BEARING, CLAY (φ = 0)
//     qp = 9·cu  (bearing capacity factor Nc = 9 for a deep tip).
//   END BEARING, SAND (Meyerhof, with the deep-tip cap)
//     qp = q′·Nq ≤ ql = 0.5·pa·Nq·tan φ,  Nq = e^{π·tanφ}·tan²(45+φ/2),
//     pa = 100 kPa. The cap is what stops q′·Nq growing without bound —
//     it is the closed-form of Meyerhof's critical-depth behaviour.
//
// Q_ult = Qp + Qs; Q_all = Q_ult/FS (FS input, default 3).
// ─────────────────────────────────────────────────────────────────────────

export const GAMMA_W = 9.81

export type SoilKind = 'clay' | 'sand'

export interface SoilLayer {
  /** Layer thickness, m. */
  thickness: number
  kind: SoilKind
  /** Undrained shear strength, kPa (clay). */
  cu?: number
  /** Friction angle, degrees (sand). */
  phi?: number
  /** Bulk unit weight above the water table, kN/m³. */
  gamma: number
  /** Unit weight below the water table (saturated); defaults to gamma. */
  gammaSat?: number
}

export type PileKind = 'circular' | 'square' | 'pipe'

export interface PileSection {
  kind: PileKind
  /** Diameter, m (circular and pipe). */
  d?: number
  /** Side width, m (square). */
  b?: number
  /** Wall thickness, m (pipe, for the record — end bearing assumes plugged). */
  t?: number
}

export interface PileInput {
  /** Soil layers top → bottom; the pile tip sits inside the LAST layer. */
  layers: SoilLayer[]
  section: PileSection
  /** Depth of the water table below ground, m (Infinity or a big number = dry). */
  waterTable?: number
  /** Embedment depth of the pile tip, m (default: full thickness of all layers). */
  embedDepth?: number
  /** Factor of safety (default 3). */
  FS?: number
  /** Shaft K override for sand layers (default 1 − sin φ). */
  K?: number
  /** Shaft δ override, degrees (default φ − 5). */
  deltaDeg?: number
}

export interface ShaftSegment {
  from: number
  to: number
  kind: SoilKind
  /** Shaft resistance f for the segment, kPa. */
  f: number
  /** Parameters used, for the worked solution. */
  detail: string
  /** Perimeter × f × length, kN. */
  Q: number
}

export interface PileResult {
  /** Shaft perimeter, m. */
  perimeter: number
  /** Gross end area, m² (pipe = plugged full circle). */
  area: number
  /** Embedment length used, m. */
  embedDepth: number
  /** Effective overburden at the tip, kPa. */
  sigmaTip: number
  /** Unit end bearing resistance, kPa. */
  qp: number
  /** Whether the Meyerhof cap governed the sand tip. */
  capped: boolean
  /** End-bearing capacity, kN. */
  Qp: number
  /** Total shaft friction, kN. */
  Qs: number
  /** Ultimate capacity, kN. */
  Qult: number
  /** Allowable capacity, kN. */
  Qall: number
  FS: number
  /** Per-layer shaft breakdown. */
  segments: ShaftSegment[]
  /** β = K·tanδ for the sand segments (shown per segment detail). */
  warnings: string[]
}

export function pileGeometry(s: PileSection): { perimeter: number; area: number } {
  switch (s.kind) {
    case 'circular':
      if (!(s.d && s.d > 0)) throw new Error('Circular pile needs a positive diameter')
      return { perimeter: Math.PI * s.d, area: Math.PI * s.d * s.d / 4 }
    case 'square':
      if (!(s.b && s.b > 0)) throw new Error('Square pile needs a positive width')
      return { perimeter: 4 * s.b, area: s.b * s.b }
    case 'pipe':
      if (!(s.d && s.d > 0)) throw new Error('Pipe pile needs a positive diameter')
      if (!(s.t && s.t > 0 && s.t < s.d / 2)) throw new Error('Pipe wall thickness must be positive and less than half the diameter')
      return { perimeter: Math.PI * s.d, area: Math.PI * s.d * s.d / 4 }
  }
}

/** The α–cu relation: 1.0 at cu ≤ 25 kPa, 0.5 at cu ≥ 70 kPa, linear between. */
export function alphaFor(cu: number): number {
  if (!(cu > 0)) throw new Error('Undrained shear strength must be positive')
  if (cu <= 25) return 1.0
  if (cu >= 70) return 0.5
  return 1.0 - (cu - 25) / 90
}

/** Meyerhof deep Nq = e^{π·tanφ}·tan²(45 + φ/2), φ in degrees. */
export function NqOf(phiDeg: number): number {
  if (!(phiDeg > 0 && phiDeg <= 50)) throw new Error('Friction angle must be in (0, 50] degrees')
  const t = Math.tan(phiDeg * Math.PI / 180)
  return Math.exp(Math.PI * t) * Math.pow(Math.tan((45 + phiDeg / 2) * Math.PI / 180), 2)
}

export function pileCapacity(p: PileInput): PileResult {
  if (!p.layers.length) throw new Error('At least one soil layer is required')
  const { perimeter, area } = pileGeometry(p.section)
  const FS = p.FS ?? 3
  if (!(FS >= 1.5)) throw new Error('Factor of safety must be at least 1.5')
  const fullDepth = p.layers.reduce((s, l) => s + l.thickness, 0)
  const D = Math.min(p.embedDepth ?? fullDepth, fullDepth)
  if (!(D > 0)) throw new Error('Embedment depth must be positive')
  const wt = p.waterTable ?? Infinity

  // Effective-stress profile by walking down the layers.
  const segments: ShaftSegment[] = []
  const warnings: string[] = []
  let z = 0 // depth at the top of the current layer
  let sigma = 0 // effective vertical stress at depth z
  let sigmaTip = 0
  let tipLayer: SoilLayer | null = null
  let Qs = 0
  let Qp = 0
  let qp = 0
  let capped = false

  for (const layer of p.layers) {
    const bottom = Math.min(z + layer.thickness, D)
    const segLen = bottom - z
    if (segLen <= 1e-12) { z += layer.thickness; continue }
    const gAbove = layer.gamma
    const gBelow = layer.gammaSat ?? layer.gamma
    // walk in 1 sub-steps not needed: use mid-depth stresses per sub-segment
    // split the layer at the water table if it crosses it
    const pieces: { a: number; b: number }[] = []
    if (wt > z && wt < bottom) {
      pieces.push({ a: z, b: wt }, { a: wt, b: bottom })
    } else {
      pieces.push({ a: z, b: bottom })
    }
    let segQ = 0
    let fVal = 0
    let detail = ''
    for (const pc of pieces) {
      const len = pc.b - pc.a
      if (len <= 1e-12) continue
      const g = pc.a >= wt - 1e-12 ? gBelow - GAMMA_W : gAbove
      // effective stress at the piece MIDPOINT: sigma at pc.a + g·len/2
      const sigmaMid = sigma + g * len / 2
      sigma += g * len
      if (layer.kind === 'clay') {
        const cu = layer.cu
        if (!(cu && cu > 0)) throw new Error('Clay layers need an undrained shear strength cu')
        const alpha = alphaFor(cu)
        fVal = alpha * cu
        detail = `α = ${alpha.toFixed(3)} (cu = ${cu.toFixed(1)} kPa), f = α·cu = ${fVal.toFixed(2)} kPa`
      } else {
        const phi = layer.phi
        if (!(phi && phi > 0)) throw new Error('Sand layers need a friction angle φ')
        const K = p.K ?? 1 - Math.sin(phi * Math.PI / 180)
        const delta = (p.deltaDeg ?? phi - 5) * Math.PI / 180
        if (delta <= 0) throw new Error('δ came out non-positive — check the friction angle')
        fVal = K * sigmaMid * Math.tan(delta)
        detail = `K = ${K.toFixed(3)}, δ = ${((p.deltaDeg ?? phi - 5)).toFixed(1)}°, σ′ mid = ${sigmaMid.toFixed(2)} kPa → f = K·σ′·tanδ = ${fVal.toFixed(2)} kPa (β = ${(K * Math.tan(delta)).toFixed(3)})`
      }
      segQ += perimeter * fVal * len
    }
    segments.push({ from: z, to: bottom, kind: layer.kind, f: fVal, detail, Q: segQ })
    Qs += segQ

    // tip inside this layer?
    if (D <= z + layer.thickness + 1e-9 || bottom >= D - 1e-9) {
      tipLayer = layer
      sigmaTip = sigma // effective stress at the TIP depth (D)
      if (layer.kind === 'clay') {
        const cu = layer.cu
        if (!(cu && cu > 0)) throw new Error('Clay bearing layer needs cu')
        qp = 9 * cu
        Qp = qp * area
      } else {
        const phi = layer.phi
        if (!(phi && phi > 0)) throw new Error('Sand bearing layer needs φ')
        const Nq = NqOf(phi)
        qp = sigmaTip * Nq
        const ql = 0.5 * 100 * Nq * Math.tan(phi * Math.PI / 180)
        capped = qp > ql
        if (capped) {
          qp = ql
          warnings.push(`End bearing capped at ql = 0.5·pa·Nq·tanφ = ${ql.toFixed(1)} kPa (Meyerhof critical-depth limit)`)
        }
        Qp = qp * area
      }
    }
    z += layer.thickness
    if (z >= D - 1e-9) break
  }

  if (!tipLayer) throw new Error('Embedment depth falls outside the listed layers')

  const Qult = Qp + Qs
  return {
    perimeter, area, embedDepth: D, sigmaTip, qp, capped, Qp, Qs, Qult,
    Qall: Qult / FS, FS, segments, warnings,
  }
}
