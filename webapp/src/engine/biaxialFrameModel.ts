// ─────────────────────────────────────────────────────────────────────────
// StructuralModel → SPACE FRAME WITH BIAXIAL HINGES, and a skew pushover on it.
// Layer L2 (bridge) driving layer L5 (`nonlinearFrame3d`).
//
// The existing hinge bridge (`nonlinearFrameModel`) condenses the building into
// one equivalent PLANE frame: every frame line parallel to the loading
// direction is summed onto a single 2-D frame. That reduction is what makes the
// plane-frame hinge engines usable on a 3-D model, and it is also exactly what
// stops working once hinges are biaxial — collapsing the perpendicular
// coordinate throws away the second bending axis the surface couples, and it
// cannot represent a push that is not parallel to a frame line at all.
//
// So this bridge does NOT condense. Model members map 1:1 onto `nonlinearFrame3d`
// members, and the section properties come from `modelToFrame3D` — the same
// bridge the linear solver uses — so cracked-section modifiers, local-axis
// rotation and material moduli are inherited rather than re-derived. What this
// module adds on top is the pair of plastic capacities per member (strong Mpz
// and weak Mpy), the axial capacity for P–M, and the yield surface.
//
// The payoff is the SKEW PUSHOVER: a lateral push at any plan angle, not just
// along a frame line. At 45° on a symmetric frame every corner column bends
// about both axes at once, which is the case the whole biaxial series exists to
// capture and the one the equivalent-plane-frame reduction cannot express.
//
// WHAT IS NOT CARRIED OVER (reported, never silently dropped — see
// `BiaxialFrameBridge.unsupported`):
//   • member end RELEASES — `nonlinearFrame3d` has no per-end release, and a
//     pinned end silently becoming fixed would change results materially.
//   • rigid end OFFSETS — likewise not represented in the hinge element.
//   • Timoshenko shear areas — the hinge element is Euler-Bernoulli.
// Members carrying any of these are listed so the caller (and the UI) can say so.
//
// Units: geometry m, sections mm/mm², E MPa, Mp kN·m, forces kN, mass tonnes.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, RectSection } from './model'
import { modelToFrame3D } from './modelBridge'
import { buildSeismicMass } from './modal'
import { plasticMoment, axialCapacity } from './pushoverModel'
import { shapeByName } from './aiscSections'
import { deriveWSection } from './steelDesign'
import { effectiveReleases } from './modelBridge'
import {
  nonlinearFrame3D,
  type NL3Input, type NL3Member, type NL3Node, type NL3Support, type NL3Result,
} from './nonlinearFrame3d'
import type { BiaxialSurfaceSpec } from './biaxialHinge'

/**
 * WEAK-axis plastic moment, kN·m — the companion to `pushoverModel`'s
 * (strong-axis) `plasticMoment`, which a biaxial hinge needs as its second
 * capacity.
 *
 *  • steel W/WT — Fy·Zy from the same first-moment derivation as Zx
 *  • other steel shapes — 1.1·Fy·Sy with Sy = A·ry²/(width/2), mirroring the
 *    strong-axis fallback exactly (shape factor 1.1)
 *  • concrete / wood / no shape — the strong-axis formula on the section with
 *    b and h SWAPPED, which is what bending about the other axis means for a
 *    rectangle; written that way so the two axes cannot drift apart.
 */
export function weakPlasticMoment(s: RectSection, rho = 0.015): number {
  if (s.material === 'steel') {
    const Fy = s.steelFy ?? 345
    const shape = s.shape ? shapeByName(s.shape) : undefined
    if (shape && (shape.family === 'W' || shape.family === 'WT')) {
      return (Fy * deriveWSection(shape).Zy) / 1e6
    }
    if (shape) {
      const width = shape.bf ?? shape.b ?? shape.D ?? s.b
      const Sy = (shape.A * shape.ry ** 2) / (width / 2)
      return (1.1 * Fy * Sy) / 1e6
    }
  }
  return plasticMoment({ ...s, b: s.h, h: s.b }, rho)
}

export interface BiaxialBridgeOpts {
  /** Assumed concrete tension-steel ratio for the plastic moments (default 0.015). */
  rho?: number
  /** Multiplier applied to every plastic moment (default 1). */
  mpScale?: number
  /** Post-yield hinge stiffness ratios, fraction of EI/L (default 0.02 both axes). */
  b?: number
  /** Elastic hinge stiffness as a multiple of EI/L (default 1e4). */
  rigidity?: number
  /** Every member elastic (no hinges) — the linear reference frame. */
  elastic?: boolean
  /** Reduce hinge capacity for axial load (default true). */
  pmInteraction?: boolean
  /** Yield surface. Default: the elliptical power surface, with the axis
   *  capacities reduced on the codified uniaxial chords. Steel frames may
   *  prefer 'orbison', which carries the axial term inside the surface. */
  surface?: BiaxialSurfaceSpec
  /** Apply ACI §6.6.3.1.1 cracked-section modifiers (passed to `modelToFrame3D`). */
  crackedSections?: boolean
}

export interface BiaxialFrameBridge {
  nodes: NL3Node[]
  members: NL3Member[]
  supports: NL3Support[]
  /** Lumped seismic mass per node, tonnes. */
  mass: Map<string, number>
  /** Members given a plastic capacity. */
  nHingeable: number
  /** Model features the hinge element cannot represent, by member id. Empty
   *  arrays mean the bridge is exact for this model. */
  unsupported: {
    /** Members with an end release (treated here as fully continuous). */
    releases: string[]
    /** Members with a rigid end offset (treated here as node-to-node). */
    offsets: string[]
  }
}

/**
 * Map a `StructuralModel` 1:1 onto space-frame members with biaxial hinges.
 * Geometry and section properties come from `modelToFrame3D`; this adds the
 * plastic capacities, the axial capacity and the surface. Returns null when the
 * model has no members.
 */
export function modelToBiaxialFrame(
  model: StructuralModel, opts: BiaxialBridgeOpts = {},
): BiaxialFrameBridge | null {
  const br = modelToFrame3D(model, { useShells: false, crackedSections: opts.crackedSections })
  if (br.members.length === 0) return null

  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const modelById = new Map(model.members.map((m) => [m.id, m]))
  const scale = opts.mpScale ?? 1
  const usePM = opts.pmInteraction !== false && !opts.elastic
  const surface = opts.surface ?? { kind: 'power' as const }
  const releases: string[] = [], offsets: string[] = []
  let nHingeable = 0

  const members: NL3Member[] = br.members.map((f) => {
    const src = modelById.get(f.id)
    const sec = src ? secById.get(src.section) : undefined

    if (src) {
      const rel = effectiveReleases(src)
      const anyRel = (e?: Record<string, boolean | undefined>) => !!e && Object.values(e).some(Boolean)
      if (anyRel(rel.iEnd) || anyRel(rel.jEnd)) releases.push(f.id)
      if (src.offsets?.iEnd || src.offsets?.jEnd) offsets.push(f.id)
    }

    const base: NL3Member = {
      id: f.id, i: f.i, j: f.j,
      E: f.E, G: f.G, A: f.A, Iy: f.Iy, Iz: f.Iz, J: f.J,
      ...(f.rot !== undefined ? { rot: f.rot } : {}),
    }
    if (!sec || opts.elastic) return base

    const Mpz = plasticMoment(sec, opts.rho) * scale
    const Mpy = weakPlasticMoment(sec, opts.rho) * scale
    if (!(Mpz > 0) || !(Mpy > 0)) return base
    nHingeable++
    return {
      ...base,
      Mpy, Mpz,
      by: opts.b ?? 0.02, bz: opts.b ?? 0.02,
      ...(opts.rigidity !== undefined ? { rigidity: opts.rigidity } : {}),
      surface,
      ...(usePM
        ? {
          Pcap: axialCapacity(sec),
          // the power surface reduces each axis on its own uniaxial chord; a
          // concrete section uses the ACI straight line on BOTH axes
          ...(sec.material === 'steel'
            ? {}
            : { pmKindY: 'concrete' as const, pmKindZ: 'concrete' as const }),
        }
        : {}),
    }
  })

  return {
    nodes: br.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, z: n.z })),
    members,
    supports: br.supports.map((s) => ({
      node: s.node, fixity: s.fixity === 'fixed' ? 'fixed' as const : 'pin' as const,
    })),
    mass: buildSeismicMass(model),
    nHingeable,
    unsupported: { releases, offsets },
  }
}

export interface BiaxialPushoverOpts extends BiaxialBridgeOpts {
  /** Push direction in plan, degrees from +X toward +Z (default 0). 45° is the
   *  skew case the biaxial surface exists for. */
  angleDeg?: number
  /** 'triangular' (mass×height, first-mode-like, default) or 'uniform' (mass). */
  pattern?: 'triangular' | 'uniform'
  /** Roof drift to push to, as a fraction of total height (default 0.04 = 4%). */
  targetDispRatio?: number
  /** Number of displacement increments (default 80). */
  steps?: number
  /** Control node id; defaults to the highest node. */
  controlNode?: string
}

export interface BiaxialPushoverResult {
  bridge: BiaxialFrameBridge
  input: NL3Input
  result: NL3Result
  controlNode: string
  /** Global axis the capacity curve is measured on — the dominant push component. */
  controlDir: 'x' | 'z'
  angleDeg: number
  totalHeight: number
  /**
   * Capacity curve. `disp` is the control-node displacement ALONG `controlDir`
   * (the quantity the solver drives, not the resultant — for an asymmetric plan
   * the roof does not travel parallel to the push). `shear` is the base shear:
   * the lateral pattern is normalised to Σ = 1 and each nodal force is a unit
   * direction vector, so the load factor IS the total applied lateral force.
   */
  curve: { disp: number; shear: number; hinges: number }[]
  /** Peak base shear reached, kN. */
  peakShear: number
  /** Hinges past yield at the end of the push. */
  yieldedHinges: number
}

/**
 * Pushover of the full 3-D model with biaxial hinges, pushed at an arbitrary
 * plan angle. Returns null when the model cannot be bridged or carries no mass.
 */
export function runBiaxialPushover(
  model: StructuralModel, opts: BiaxialPushoverOpts = {},
): BiaxialPushoverResult | null {
  const bridge = modelToBiaxialFrame(model, opts)
  if (!bridge || bridge.nodes.length === 0) return null

  const th = ((opts.angleDeg ?? 0) * Math.PI) / 180
  const ex = Math.cos(th), ez = Math.sin(th)

  const ys = bridge.nodes.map((n) => n.y)
  const yMax = Math.max(...ys), yMin = Math.min(...ys)
  const totalHeight = yMax - yMin
  const controlNode = opts.controlNode
    ?? bridge.nodes.filter((n) => n.y === yMax).sort((a, b) => a.x - b.x || a.z - b.z)[0].id

  // lateral pattern from lumped mass (×height for triangular), normalised Σ = 1
  const tri = (opts.pattern ?? 'triangular') === 'triangular'
  const w = new Map<string, number>()
  let sum = 0
  for (const n of bridge.nodes) {
    const m = bridge.mass.get(n.id) ?? 0
    if (m <= 0) continue
    const v = tri ? m * Math.max(n.y - yMin, 0) : m
    if (v > 0) { w.set(n.id, v); sum += v }
  }
  if (sum <= 0) return null
  const loads = [...w].map(([node, v]) => ({ node, Fx: (v / sum) * ex, Fz: (v / sum) * ez }))

  // Control on whichever global axis carries more of the push, and drive it to
  // the component of the target drift on that axis so the RESULTANT roof drift
  // lands near targetDispRatio regardless of the angle.
  const controlDir: 'x' | 'z' = Math.abs(ex) >= Math.abs(ez) ? 'x' : 'z'
  const comp = controlDir === 'x' ? ex : ez
  const target = totalHeight * (opts.targetDispRatio ?? 0.04) * comp

  const input: NL3Input = {
    nodes: bridge.nodes, members: bridge.members, supports: bridge.supports,
    loads, controlNode, controlDir,
    control: 'displacement',
    dispMax: target, steps: opts.steps ?? 80,
  }
  const result = nonlinearFrame3D(input)
  if (!result) return null

  const curve = result.steps
    .filter((s) => s.converged)
    .map((s) => ({ disp: s.disp, shear: s.lambda, hinges: s.hinges }))
  return {
    bridge, input, result, controlNode, controlDir,
    angleDeg: opts.angleDeg ?? 0,
    totalHeight,
    curve,
    peakShear: curve.length ? Math.max(...curve.map((c) => Math.abs(c.shear))) : 0,
    yieldedHinges: result.hinges.filter((h) => h.yielded).length,
  }
}
