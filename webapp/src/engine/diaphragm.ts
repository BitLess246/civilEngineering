// ─────────────────────────────────────────────────────────────────────────
// Rigid floor diaphragm — identifies which nodes share in-plane DOFs.
//
// Each storey in the structural model corresponds to one diaphragm plane.
// All nodes at a storey elevation are grouped; the first node is the master
// and the rest are slaves. The constraint is:
//   ux_s = ux_m − (z_s − z_m)·θy_m     (rigid body, y is up)
//   uz_s = uz_m + (x_s − x_m)·θy_m
//   θy_s = θy_m
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from './model'
import type { F3DiaphragmGroup } from './frame3d'

const YTOL = 1e-4   // m; elevation matching tolerance

/**
 * Builds rigid floor diaphragm groups from the model's storey elevations.
 * Only storeys with ≥2 nodes at that elevation produce a group.
 */
export function buildDiaphragmGroups(model: StructuralModel): F3DiaphragmGroup[] {
  if (!model.storeys || model.storeys.length === 0) return []
  const groups: F3DiaphragmGroup[] = []
  for (const storey of model.storeys) {
    const atLevel = model.nodes.filter((n) => Math.abs(n.y - storey.elevation) < YTOL)
    if (atLevel.length < 2) continue
    const [master, ...rest] = atLevel
    groups.push({ masterNode: master.id, slaveNodes: rest.map((n) => n.id) })
  }
  return groups
}
