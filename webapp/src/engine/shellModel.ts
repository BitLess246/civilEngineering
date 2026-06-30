// ─────────────────────────────────────────────────────────────────────────
// StructuralModel → shell FE bridge (Tier 4 #11).
//
// Meshes the model's quad plates into a conforming triangular flat-shell mesh
// (D10 `subdivideQuadPlates`), solves the membrane+bending FE problem under a
// chosen load factor, and recovers the per-element stress/moment field. The
// recovered slab bending moments then drive Wood-Armer reinforcement design,
// integrating the shell results into the NSCP design pipeline (previously the FE
// field was visualised only; slabs were sized by the empirical DDM).
//
// Units: coordinates m; pressures kPa (kN/m²); moments kN·m/m.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from './model'
import {
  subdivideQuadPlates, solveShell, recoverShellStress,
  type V3, type QuadPlateSpec, type ShellNode, type ShellElem, type ShellSupport, type ElementStress,
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

/** Fully restrain every supported model node in the shell mesh (all 6 DOFs). */
function shellSupports(model: StructuralModel): ShellSupport[] {
  return model.supports.map((s) => ({
    node: s.node, ux: true, uy: true, uz: true, rx: true, ry: true, rz: true,
  }))
}

/**
 * Solve the model's shell mesh under a factored area-load combination and recover
 * the element stress/moment field. `dFactor`/`lFactor` scale the dead/live area
 * loads (default 1.0/1.0 → service field for display; pass 1.2/1.6 for design).
 * Returns null if the model has no plates or the solve is singular.
 */
export function solveModelShells(
  model: StructuralModel, opts: { subdiv?: number; dFactor?: number; lFactor?: number } = {},
): ShellModelStress | null {
  if (!model.plates.length) return null
  const { nodes, elems } = meshModelShells(model, opts.subdiv ?? 4)
  if (!nodes.length || !elems.length) return null
  const dF = opts.dFactor ?? 1, lF = opts.lFactor ?? 1
  const pressures = model.loads.flatMap((l) => {
    if (l.kind !== 'area') return []
    const factor = l.cat === 'D' ? dF : l.cat === 'L' ? lF : 1
    if (factor === 0) return []
    return elems.filter((e) => e.id.startsWith(`${l.plate}_`)).map((e) => ({ elem: e.id, q: l.q * factor }))
  })
  const result = solveShell(nodes, elems, shellSupports(model), [], pressures)
  if (!result) return null
  return { nodes, elems, stresses: recoverShellStress(nodes, elems, result) }
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
 */
export function designModelSlabsFE(
  model: StructuralModel, opts: ShellDesignOpts = {},
): { mesh: ShellModelStress; rows: SlabFEScheduleRow[] } | null {
  const solved = solveModelShells(model, {
    subdiv: opts.subdiv, dFactor: opts.dFactor ?? 1.2, lFactor: opts.lFactor ?? 1.6,
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
