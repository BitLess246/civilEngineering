// ─────────────────────────────────────────────────────────────────────────
// StructuralModel → pushover bridge (Tier 3 #12, UI phase).
//
// Turns a model into a PushoverInput: derives a plastic-moment capacity per
// member, builds a lateral load pattern from the lumped seismic mass, and picks
// the roof control node. Keeps the page thin — all the policy lives here, tested.
//
// Plastic moment (kN·m):
//   steel W/WT : Mp = Fy·Zx                       (exact plastic capacity)
//   steel other: Mp ≈ 1.1·Fy·Sx, Sx = Ix/(d/2)    (shape factor on elastic)
//   concrete   : C = T solved for the neutral axis at an assumed ρ, with
//                fs = min(fy, 600(d−c)/c) — see `flexure.rectCapacity`
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, RectSection } from './model'
import { shapeByName } from './aiscSections'
import { deriveWSection } from './steelDesign'
import { rectCapacity } from './flexure'
import { modelToFrame3D } from './modelBridge'
import { buildSeismicMass, GRAVITY } from './modal'
import { pushoverAnalysis, type PushoverResult } from './pushover'

/** Axial capacity for the P–M interaction surface, kN:
 *  steel  Py = Fy·A      (squash load; A from the AISC shape, else b×h)
 *  concr. Pn0 = 0.85·f′c·Ag   (ACI pure-axial, conservatively ignoring rebar) */
export function axialCapacity(s: RectSection): number {
  if (s.material === 'steel') {
    const Fy = s.steelFy ?? 345
    const shape = s.shape ? shapeByName(s.shape) : undefined
    const A = shape?.A ?? s.b * s.h     // mm²
    return (Fy * A) / 1e3               // kN
  }
  return (0.85 * Math.max(s.fc, 1) * s.b * s.h) / 1e3   // kN
}

/** Nominal plastic moment capacity of a section, kN·m (see file header). */
export function plasticMoment(s: RectSection, rho = 0.015): number {
  if (s.material === 'steel') {
    const Fy = s.steelFy ?? 345
    const shape = s.shape ? shapeByName(s.shape) : undefined
    if (shape && (shape.family === 'W' || shape.family === 'WT')) {
      return (Fy * deriveWSection(shape).Zx) / 1e6
    }
    if (shape) {
      const depth = shape.d ?? shape.h ?? shape.D ?? s.h
      const Sx = (shape.A * shape.rx ** 2) / (depth / 2)
      return (1.1 * Fy * Sx) / 1e6
    }
    const Sx = (s.b * s.h ** 2) / 6     // rectangular bounding box
    return (1.1 * Fy * Sx) / 1e6
  }
  // Concrete — the hinge strength of an ASSUMED tension steel ratio ρ.
  //
  // This was ρbd²fy(1 − 0.59ρfy/f'c), which is As·fy·(d − a/2) written out:
  // exact while the steel yields, and silently wrong when it does not. ρ here
  // is a caller's modelling choice, not a designed area, so nothing bounds it
  // — at ρ = 3% with fy 550 the formula overstates the hinge by 14–24%, in the
  // direction that makes a frame look stronger than it is. It stops yielding
  // above ρ ≈ 2.0% on f'c 28 / fy 550, which is inside the range a user can
  // ask for.
  //
  // `rectCapacity` solves the steel stress instead, so an over-reinforced ρ now
  // returns the lower strength it really has. Where the steel does yield the
  // two agree to 0.05% — the old constant is 0.59 where the algebra gives
  // 1/1.7 = 0.588235, and that rounding is the whole of the difference.
  const d = Math.max(s.h - s.cover - s.tieDia - s.barDia / 2, 0.5 * s.h)
  return rectCapacity(s.b, d, d, rho * s.b * d, Math.max(s.fc, 1), s.fy).Mn
}

export type PushoverPattern = 'uniform' | 'triangular'

export interface PushoverModelOpts {
  /** Push direction: 0 = X (default), 2 = Z. */
  dir?: 0 | 2
  /** Lateral pattern: 'triangular' (mass×height, first-mode-like, default) or 'uniform' (mass). */
  pattern?: PushoverPattern
  /** Assumed concrete tension-steel ratio for Mp (default 0.015). */
  rho?: number
  /** Multiplier applied to every member Mp (default 1). */
  mpScale?: number
  /** Apply P–M interaction (reduced plastic moment Mpc(P)) at each hinge.
   *  Default false → pure-bending Mp, matching the original behaviour. */
  pmInteraction?: boolean
  /** Control node id; defaults to the highest node (roof). */
  controlNode?: string
  /** Stop at this fraction of the total height (default 0.04 = 4% drift). */
  targetDispRatio?: number
  /** Max hinge events (default 100). */
  maxEvents?: number
  /** Include second-order P-Δ in the pushover tangent. The geometric stiffness is
   *  built from the gravity weight (seismic mass × g, applied downward) and held
   *  constant while the lateral pattern is scaled. Default false. */
  pDelta?: boolean
}

export interface PushoverModelResult {
  result: PushoverResult
  /** Node used for the capacity-curve abscissa. */
  controlNode: string
  /** Total frame height (y span), m. */
  totalHeight: number
  /** Number of members assigned a plastic-moment capacity. */
  nHingeable: number
  /** Whether P–M interaction was applied (reduced plastic moment at hinges). */
  pmInteraction: boolean
  /** Whether second-order P-Δ (gravity geometric stiffness) was included. */
  pDelta: boolean
}

/**
 * Build and run a pushover analysis from a structural model. Returns null when
 * the model has no nodes. The lateral pattern is normalised so Σ = 1, hence the
 * reported base shear equals the load factor λ at each event.
 */
export function runPushoverModel(model: StructuralModel, opts: PushoverModelOpts = {}): PushoverModelResult | null {
  const br = modelToFrame3D(model, { useShells: false })
  if (br.nodes.length === 0) return null
  const dir = opts.dir ?? 0

  // plastic moment per member (+ P–M interaction data when enabled)
  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const Mp: Record<string, number> = {}
  const usePM = opts.pmInteraction ?? false
  const pm: Record<string, { Pcap: number; kind: 'steel' | 'concrete' }> = {}
  for (const m of model.members) {
    const s = secById.get(m.section)
    if (!s) continue
    const mp = plasticMoment(s, opts.rho) * (opts.mpScale ?? 1)
    if (mp > 0) {
      Mp[m.id] = mp
      if (usePM) pm[m.id] = { Pcap: axialCapacity(s), kind: s.material === 'steel' ? 'steel' : 'concrete' }
    }
  }

  // control node = highest; total height from the y span
  const ys = model.nodes.map((n) => n.y)
  const yMax = Math.max(...ys), yMin = Math.min(...ys)
  const totalHeight = yMax - yMin
  const controlNode = opts.controlNode ?? (model.nodes.find((n) => n.y === yMax)?.id ?? model.nodes[0].id)

  // lateral pattern from lumped mass (×height for triangular), normalised Σ=1
  const mass = buildSeismicMass(model)
  const pattern: Record<string, number> = {}
  let sum = 0
  const tri = (opts.pattern ?? 'triangular') === 'triangular'
  for (const node of model.nodes) {
    const m = mass.get(node.id) ?? 0
    if (m <= 0) continue
    const w = tri ? m * Math.max(node.y - yMin, 0) : m
    if (w > 0) { pattern[node.id] = w; sum += w }
  }
  if (sum > 0) for (const k of Object.keys(pattern)) pattern[k] /= sum

  const targetDisp = totalHeight > 0 ? totalHeight * (opts.targetDispRatio ?? 0.04) : undefined

  // P-Δ gravity preload: lumped seismic weight (mass[t]×g) applied downward (−Y).
  const usePDelta = opts.pDelta ?? false
  const gravity = usePDelta
    ? [...mass].filter(([, mt]) => mt > 0).map(([node, mt]) => ({ node, Fy: -mt * GRAVITY }))
    : undefined

  const result = pushoverAnalysis({
    nodes: br.nodes, members: br.members, supports: br.supports,
    Mp, pattern, dir, controlNode, targetDisp, maxEvents: opts.maxEvents ?? 100,
    ...(usePM ? { pm } : {}),
    ...(usePDelta && gravity && gravity.length ? { pDelta: true, gravity } : {}),
  })
  return { result, controlNode, totalHeight, nHingeable: Object.keys(Mp).length, pmInteraction: usePM, pDelta: usePDelta }
}
