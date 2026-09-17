// ─────────────────────────────────────────────────────────────────────────
// StructuralModel → shell FE bridge (Tier 4 #11).
//
// Meshes the model's quad plates into a conforming triangular flat-shell mesh
// (D10 `subdivideQuadPlates`), solves the membrane+bending FE problem under a
// chosen load-factor set, and recovers the per-element stress/moment field. The
// recovered slab bending moments then drive Wood-Armer reinforcement design,
// integrating the shell results into the NSCP design pipeline (previously the FE
// field was visualised only; slabs were sized by the empirical DDM).
//
// Units: coordinates m; pressures kPa (kN/m²); moments kN·m/m.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from './model'
import type { LoadCategory } from './beamAnalysis'
import {
  subdivideQuadPlates, solveShell, recoverShellStress, triFrame,
  type V3, type QuadPlateSpec, type ShellNode, type ShellElem, type ShellSupport,
  type ShellNodeLoad, type ShellPressure, type ElementStress,
} from './shell'
import { designSlabFE, type SlabFEDesign, type ShellMomentSample } from './woodArmer'

/** Default concrete shell material (E MPa, ν). */
const SHELL_E = 25000
const SHELL_NU = 0.2

export interface ShellModelMesh {
  nodes: ShellNode[]
  elems: ShellElem[]
}

export interface ShellModelStress extends ShellModelMesh {
  stresses: ElementStress[]
}

/** Mesh every quad plate into an n×n conforming triangular shell mesh. Model
 *  node ids are reused at coincident corners so supports/loads still attach. */
export function meshModelShells(model: StructuralModel, subdiv = 4): ShellModelMesh {
  const posById = new Map(model.nodes.map((n) => [n.id, [n.x, n.y, n.z] as V3]))
  const cornerId = (p: V3): string | undefined => {
    for (const n of model.nodes)
      if (Math.hypot(p[0] - n.x, p[1] - n.y, p[2] - n.z) < 1e-4) return n.id
    return undefined
  }
  const specs: QuadPlateSpec[] = model.plates.flatMap((p) => {
    const cs = p.corners.map((id) => posById.get(id))
    if (cs.some((c) => !c)) return []
    return [{ id: p.id, corners: cs as [V3, V3, V3, V3], E: SHELL_E, nu: SHELL_NU, t: p.thickness }]
  })
  return subdivideQuadPlates(specs, Math.max(1, Math.round(subdiv)), cornerId)
}

/** Map the model's support fixities onto the shell mesh. 'fixed' restrains all
 *  six DOF; every other fixity (pin / roller / spring) restrains TRANSLATIONS
 *  only — rotations stay free, which is what a pin means and what the old
 *  always-fixed mapping quietly over-stiffened. */
function shellSupports(model: StructuralModel): ShellSupport[] {
  return model.supports.map((s) => {
    const full = s.fixity === 'fixed'
    return { node: s.node, ux: true, uy: true, uz: true, rx: full, ry: full, rz: full }
  })
}

/** Area-load categories that are gravity: they always act along global −Y,
 *  regardless of how the plate's corners happen to be wound. W/E are lateral
 *  and act along the element's own normal (a wall's wind pressure). */
const GRAVITY_CATS = new Set<LoadCategory | string>(['D', 'L', 'Lr', 'S', 'R'])

/**
 * Solve the model's shell mesh under a factored area-load combination and recover
 * the element stress/moment field. `factors` scale each load category (default
 * {D:1, L:1} → service field for display; pass {D:1.2, L:1.6} for design).
 *
 * LOAD DIRECTION. Gravity categories are lumped q·A/3 to each element node
 * along global −Y — the same convention the frame bridge uses for shell
 * panels — so the result no longer depends on the plate's corner winding (a
 * user-drawn slab wound the other way used to have its gravity load applied
 * UPWARD along the element normal). W/E area loads stay along the element
 * normal (lateral pressure on walls).
 *
 * LOAD ACCUMULATION. Categories are summed per element. (The old pressure
 * `Map` keyed by element id silently kept only the LAST category per element —
 * a slab with both D and L loads was solved under L alone.)
 *
 * Returns null if the model has no plates or the solve is singular (a mesh
 * with no load path to a supported node — an elevated slab whose panels are
 * not tied to the ground by shell elements — cannot be solved standalone).
 */
export function solveModelShells(
  model: StructuralModel, opts: { subdiv?: number; factors?: Partial<Record<LoadCategory, number>> } = {},
): ShellModelStress | null {
  if (!model.plates.length) return null
  const { nodes, elems } = meshModelShells(model, opts.subdiv ?? 4)
  if (!nodes.length || !elems.length) return null
  const factors = opts.factors ?? { D: 1, L: 1 }

  const posById = new Map(nodes.map((n) => [n.id, [n.x, n.y, n.z] as V3]))
  const areaOf = (e: ShellElem): number => {
    const p = e.nodes.map((id) => posById.get(id)!)
    if (p.some((q) => !q)) return 0
    const [p1, p2, p3] = p as [V3, V3, V3]
    const u: V3 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]]
    const v: V3 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]]
    const c: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    return Math.hypot(c[0], c[1], c[2]) / 2
  }

  // Element ids are `${plateId}_i_j_k`, so grouping by the prefix before the
  // first underscore regroups exactly the meshed panel's triangles.
  const elemsByPlate = new Map<string, ShellElem[]>()
  for (const e of elems) {
    const pid = e.id.slice(0, e.id.indexOf('_'))
    const list = elemsByPlate.get(pid)
    if (list) list.push(e)
    else elemsByPlate.set(pid, [e])
  }

  const nodeLoads: ShellNodeLoad[] = []
  const pressureAcc = new Map<string, number>()
  for (const l of model.loads) {
    if (l.kind !== 'area') continue
    const f = factors[l.cat] ?? 0
    const q = l.q * f
    if (!Number.isFinite(q) || Math.abs(q) < 1e-12) continue
    const es = elemsByPlate.get(l.plate)
    if (!es) continue
    if (GRAVITY_CATS.has(l.cat)) {
      for (const e of es) {
        const fn = (q * areaOf(e)) / 3
        if (!(Math.abs(fn) > 0)) continue
        for (const nid of e.nodes) nodeLoads.push({ node: nid, Fy: -fn })
      }
    } else {
      for (const e of es) pressureAcc.set(e.id, (pressureAcc.get(e.id) ?? 0) + q)
    }
  }
  const pressures: ShellPressure[] = [...pressureAcc].map(([elem, q]) => ({ elem, q }))

  const result = solveShell(nodes, elems, shellSupports(model), nodeLoads, pressures)
  if (!result) return null
  return { nodes, elems, stresses: toPanelFrames(nodes, elems, recoverShellStress(nodes, elems, result)) }
}

// ── Panel-frame stress transformation ────────────────────────────────────────
// Each triangle's recovered σx/σy/τxy and Mx/My/Mxy are expressed in THAT
// triangle's own local frame (x̂ along its node1→node2) — and the two triangle
// families of every cell differ by the diagonal angle. Averaging such values
// across a node (contours) or across a panel (Wood-Armer) mixes incompatible
// frames. Transforming each element's tensors into ONE per-panel reference
// frame — best-fit over the panel's own triangles — before anything downstream
// reads them makes the components comparable again. The invariants (von Mises,
// σ1/σ2) are unaffected by the rotation.

const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross3 = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
]
const norm3 = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

/** Rotate a symmetric in-plane tensor (σx, σy, τxy — or Mx, My, Mxy) from one
 *  right-handed 3D frame to another via full 3D tensor rotation. */
export function rotateInPlaneTensor(
  t: [number, number, number], from: [V3, V3, V3], to: [V3, V3, V3],
): [number, number, number] {
  const [sx, sy, txy] = t
  const S = [
    [sx, txy, 0],
    [txy, sy, 0],
    [0, 0, 0],
  ]
  // S_glob = Rᵀ S R  (R rows = the `from` frame's axes, global→local)
  const Sg = Array.from({ length: 3 }, () => new Array<number>(3).fill(0))
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++)
        for (let l = 0; l < 3; l++)
          Sg[i][j] += from[k][i] * S[k][l] * from[l][j]
  // S_p = R_p S_glob R_pᵀ  (R_p rows = the `to` frame's axes)
  const Sp = Array.from({ length: 3 }, () => new Array<number>(3).fill(0))
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++)
        for (let l = 0; l < 3; l++)
          Sp[i][j] += to[i][k] * Sg[k][l] * to[j][l]
  return [Sp[0][0], Sp[1][1], Sp[0][1]]
}

/**
 * Re-express every element's σ/M components in its PANEL's reference frame.
 * Panels are grouped by the element-id prefix before the first underscore
 * (`{plateId}_i_j_k`). The reference frame per panel is the area-weighted
 * best fit over its triangles: x̂ from the area-weighted mean of the element
 * x-axes, ẑ from the area-weighted mean normal, ŷ = ẑ × x̂. For a flat panel
 * this is exact; for a curved one it is the sensible single-frame approximation.
 */
export function toPanelFrames(
  nodes: ShellNode[], elems: ShellElem[], stresses: ElementStress[],
): ElementStress[] {
  const posById = new Map(nodes.map((n) => [n.id, [n.x, n.y, n.z] as V3]))
  const frames = new Map<string, [V3, V3, V3]>()   // elem id → triFrame R rows
  const panel = new Map<string, { A: number; xs: V3; zs: V3 }>()

  for (const e of elems) {
    const p = e.nodes.map((id) => posById.get(id)!)
    if (p.some((q) => !q)) continue
    const f = triFrame(p[0] as V3, p[1] as V3, p[2] as V3)
    frames.set(e.id, f.R)
    const pid = e.id.slice(0, e.id.indexOf('_'))
    const acc = panel.get(pid) ?? { A: 0, xs: [0, 0, 0] as V3, zs: [0, 0, 0] as V3 }
    acc.A += f.A
    acc.xs = [acc.xs[0] + f.R[0][0] * f.A, acc.xs[1] + f.R[0][1] * f.A, acc.xs[2] + f.R[0][2] * f.A]
    acc.zs = [acc.zs[0] + f.R[2][0] * f.A, acc.zs[1] + f.R[2][1] * f.A, acc.zs[2] + f.R[2][2] * f.A]
    panel.set(pid, acc)
  }

  const refFrames = new Map<string, [V3, V3, V3]>()
  for (const [pid, acc] of panel) {
    if (acc.A < 1e-12) continue
    const zp = norm3(acc.zs)
    // x̂: mean element x-axis projected onto the plane ⊥ ẑ (falls back to the
    // unprojected mean when that vanished — a fully symmetric fold).
    const proj: V3 = [acc.xs[0] - dot3(acc.xs, zp) * zp[0], acc.xs[1] - dot3(acc.xs, zp) * zp[1], acc.xs[2] - dot3(acc.xs, zp) * zp[2]]
    const xp = norm3(Math.hypot(proj[0], proj[1], proj[2]) > 1e-9 ? proj : acc.xs)
    refFrames.set(pid, [xp, cross3(zp, xp), zp])
  }

  return stresses.map((s) => {
    const Re = frames.get(s.id)
    const Rp = Re && refFrames.get(s.id.slice(0, s.id.indexOf('_')))
    if (!Re || !Rp) return s
    const [sx, sy, txy] = rotateInPlaneTensor([s.sigmaX, s.sigmaY, s.tauXY], Re, Rp)
    const [mx, my, mxy] = rotateInPlaneTensor([s.Mx, s.My, s.Mxy], Re, Rp)
    return { ...s, sigmaX: sx, sigmaY: sy, tauXY: txy, Mx: mx, My: my, Mxy: mxy }
  })
}

/** Wood-Armer reinforcement design for one model plate. */
export interface SlabFEScheduleRow {
  plate: string
  thickness: number          // mm
  design: SlabFEDesign
}

export interface ShellDesignOpts {
  subdiv?: number
  /** Factored load factors (default NSCP 1.2D + 1.6L). */
  dFactor?: number; lFactor?: number
  /** Slab reinforcement parameters (default cover 20 mm, ⌀12, fc 28, fy 415). */
  cover?: number; barDia?: number; fc?: number; fy?: number
}

/**
 * Design slab reinforcement for every plate from the shell FE moment field via
 * Wood-Armer. Solves the mesh once under the factored combination, groups the
 * element moments per plate (by the `{plateId}_…` element-id prefix), and sizes
 * the four reinforcement strips. Returns null when there are no plates.
 *
 * The moment field is expressed per-PANEL (see `toPanelFrames`), so Mx/My are
 * the strip moments along the panel's own c0→c1 / c0→c3 directions for every
 * triangle of that panel — the two triangle families no longer report moments
 * about their own (differently rotated) frames.
 */
export function designModelSlabsFE(
  model: StructuralModel, opts: ShellDesignOpts = {},
): { mesh: ShellModelStress; rows: SlabFEScheduleRow[] } | null {
  const solved = solveModelShells(model, {
    subdiv: opts.subdiv,
    factors: { D: opts.dFactor ?? 1.2, L: opts.lFactor ?? 1.6 },
  })
  if (!solved) return null
  const sByElem = new Map(solved.stresses.map((s) => [s.id, s]))
  const sec = { cover: opts.cover ?? 20, barDia: opts.barDia ?? 12, fc: opts.fc ?? 28, fy: opts.fy ?? 415 }
  const rows: SlabFEScheduleRow[] = []
  for (const p of model.plates) {
    if (p.role === 'wall') continue
    const samples: ShellMomentSample[] = solved.elems
      .filter((e) => e.id.startsWith(`${p.id}_`))
      .map((e) => { const s = sByElem.get(e.id)!; return { id: e.id, Mx: s.Mx, My: s.My, Mxy: s.Mxy } })
    const design = designSlabFE(samples, { t: p.thickness, ...sec })
    if (design) rows.push({ plate: p.id, thickness: p.thickness, design })
  }
  return { mesh: solved, rows }
}
