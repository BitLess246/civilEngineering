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
//   concrete   : Mn = ρ·b·d²·fy·(1 − 0.59·ρ·fy/f′c)   (assumed tension ratio ρ)
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, RectSection } from './model'
import { shapeByName } from './aiscSections'
import { deriveWSection } from './steelDesign'
import { modelToFrame3D } from './modelBridge'
import { buildSeismicMass } from './modal'
import { pushoverAnalysis, type PushoverResult } from './pushover'

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
  // concrete — assumed tension steel ratio ρ
  const d = Math.max(s.h - s.cover - s.tieDia - s.barDia / 2, 0.5 * s.h)
  const Mn = rho * s.b * d * d * s.fy * (1 - (0.59 * rho * s.fy) / Math.max(s.fc, 1))
  return Mn / 1e6
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
  /** Control node id; defaults to the highest node (roof). */
  controlNode?: string
  /** Stop at this fraction of the total height (default 0.04 = 4% drift). */
  targetDispRatio?: number
  /** Max hinge events (default 100). */
  maxEvents?: number
}

export interface PushoverModelResult {
  result: PushoverResult
  /** Node used for the capacity-curve abscissa. */
  controlNode: string
  /** Total frame height (y span), m. */
  totalHeight: number
  /** Number of members assigned a plastic-moment capacity. */
  nHingeable: number
}

/**
 * Build and run a pushover analysis from a structural model. Returns null when
 * the model has no nodes. The lateral pattern is normalised so Σ = 1, hence the
 * reported base shear equals the load factor λ at each event.
 */
export function runPushoverModel(model: StructuralModel, opts: PushoverModelOpts = {}): PushoverModelResult | null {
  const br = modelToFrame3D(model)
  if (br.nodes.length === 0) return null
  const dir = opts.dir ?? 0

  // plastic moment per member
  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const Mp: Record<string, number> = {}
  for (const m of model.members) {
    const s = secById.get(m.section)
    if (!s) continue
    const mp = plasticMoment(s, opts.rho) * (opts.mpScale ?? 1)
    if (mp > 0) Mp[m.id] = mp
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

  const result = pushoverAnalysis({
    nodes: br.nodes, members: br.members, supports: br.supports,
    Mp, pattern, dir, controlNode, targetDisp, maxEvents: opts.maxEvents ?? 100,
  })
  return { result, controlNode, totalHeight, nHingeable: Object.keys(Mp).length }
}
