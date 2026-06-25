// ─────────────────────────────────────────────────────────────────────────
// Effective length factor K from the AISC alignment chart (Commentary C-C2 /
// NSCP 2015 §503). Each column end has a stiffness ratio
//   G = Σ(E·I/L) of columns / Σ(E·I/L) of beams  rigidly framing into the joint,
// and K is read from the braced (sidesway-inhibited) or sway (sidesway-
// uninhibited) chart. We use Dumonteil's closed-form fits to those charts
// (P. Dumonteil, "Simple Equations for Effective Length Factors", AISC
// Engineering Journal, 1992) — accurate to within chart-reading precision and
// free of the transcendental singularities of the exact equations.
//
// Recommended end G for idealised supports (AISC Commentary):
//   fixed base  G ≈ 1.0   (theoretical 0, but no base is perfectly rigid)
//   pinned base G ≈ 10    (theoretical ∞)
// Stiffness ratios are dimensionless, so E·I/L may be carried in any consistent
// units (here MPa·mm⁴·m⁻¹); the units cancel in G.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from './model'
import { modelToFrame3D } from './modelBridge'

export type SwayCase = 'braced' | 'sway'

/** AISC practical end-restraint G for a column end sitting on a support. */
export const G_FIXED = 1.0
export const G_PINNED = 10.0

/**
 * Effective length factor K for a column with end stiffness ratios GA, GB.
 * Dumonteil's closed-form fit to the alignment chart:
 *   braced: K = (3·GA·GB + 1.4(GA+GB) + 0.64) / (3·GA·GB + 2(GA+GB) + 1.28)
 *   sway:   K = √[ (1.6·GA·GB + 4(GA+GB) + 7.5) / (GA+GB + 7.5) ]
 */
export function effectiveLengthK(GA: number, GB: number, sway: SwayCase): number {
  const a = Math.min(Math.max(GA, 0), G_PINNED)
  const b = Math.min(Math.max(GB, 0), G_PINNED)
  const sum = a + b, prod = a * b
  if (sway === 'braced') {
    return (3 * prod + 1.4 * sum + 0.64) / (3 * prod + 2 * sum + 1.28)
  }
  return Math.sqrt((1.6 * prod + 4 * sum + 7.5) / (sum + 7.5))
}

interface KMember { id: string; i: string; j: string; ix: number; iy: number; iz: number; jx: number; jy: number; jz: number; E: number; Iy: number; Iz: number; L: number }
type Dir = 'col' | 'xbeam' | 'zbeam' | 'other'

/** Classify a member by its dominant geometric direction. */
function classify(m: KMember): Dir {
  const dx = Math.abs(m.jx - m.ix), dy = Math.abs(m.jy - m.iy), dz = Math.abs(m.jz - m.iz)
  if (dy >= dx && dy >= dz) return 'col'
  if (dx >= dz) return 'xbeam'
  return 'zbeam'
}

export interface ColumnK {
  memberId: string
  /** G at end i / end j, for X-sway and Z-sway respectively. */
  Gi: { x: number; z: number }
  Gj: { x: number; z: number }
  /** K resisting sway in the global-X direction (column bends about Iy). */
  Kx: { braced: number; sway: number }
  /** K resisting sway in the global-Z direction (column bends about Iz). */
  Kz: { braced: number; sway: number }
}

/**
 * Compute the alignment-chart G-factors and effective length factors K for every
 * column in the model, for both horizontal sway directions.
 *
 * For X-sway the column resists with Iy and the restraining beams run in X
 * (their gravity-plane stiffness Iz); for Z-sway the column uses Iz and the
 * beams run in Z. A column end landing on a support takes the recommended
 * support G (fixed → 1, pinned/roller/spring → 10, since translational springs
 * give no rotational restraint). A joint with no restraining beams in a
 * direction is treated as pinned (G = 10) for that direction.
 */
export function columnKFactors(model: StructuralModel): ColumnK[] {
  const br = modelToFrame3D(model, { useShells: false })
  const pos = new Map(model.nodes.map((n) => [n.id, n]))
  const realIds = new Set(model.members.map((m) => m.id))
  const f3ById = new Map(br.members.map((m) => [m.id, m]))

  const mems: (KMember & { dir: Dir })[] = []
  for (const m of model.members) {
    const f3 = f3ById.get(m.id), a = pos.get(m.i), b = pos.get(m.j)
    if (!f3 || !a || !b) continue
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1
    const km: KMember = { id: m.id, i: m.i, j: m.j, ix: a.x, iy: a.y, iz: a.z, jx: b.x, jy: b.y, jz: b.z, E: f3.E, Iy: f3.Iy, Iz: f3.Iz, L }
    mems.push({ ...km, dir: classify(km) })
  }

  // members framing into each node
  const atNode = new Map<string, (KMember & { dir: Dir })[]>()
  const push = (id: string, m: KMember & { dir: Dir }) => {
    const arr = atNode.get(id); if (arr) arr.push(m); else atNode.set(id, [m])
  }
  for (const m of mems) { push(m.i, m); push(m.j, m) }

  const supG = new Map<string, number>()
  for (const s of model.supports) supG.set(s.node, s.fixity === 'fixed' ? G_FIXED : G_PINNED)

  /** G at a joint for the given sway direction. */
  const gAt = (nodeId: string, dir: 'x' | 'z'): number => {
    if (supG.has(nodeId)) return supG.get(nodeId)!
    const arr = atNode.get(nodeId) ?? []
    let col = 0, beam = 0
    for (const m of arr) {
      if (m.dir === 'col') col += (m.E * (dir === 'x' ? m.Iy : m.Iz)) / m.L
      else if (dir === 'x' && m.dir === 'xbeam') beam += (m.E * m.Iz) / m.L
      else if (dir === 'z' && m.dir === 'zbeam') beam += (m.E * m.Iz) / m.L
    }
    return beam > 1e-12 ? col / beam : G_PINNED
  }

  const out: ColumnK[] = []
  for (const m of mems) {
    if (m.dir !== 'col' || !realIds.has(m.id)) continue
    const Gi = { x: gAt(m.i, 'x'), z: gAt(m.i, 'z') }
    const Gj = { x: gAt(m.j, 'x'), z: gAt(m.j, 'z') }
    out.push({
      memberId: m.id, Gi, Gj,
      Kx: { braced: effectiveLengthK(Gi.x, Gj.x, 'braced'), sway: effectiveLengthK(Gi.x, Gj.x, 'sway') },
      Kz: { braced: effectiveLengthK(Gi.z, Gj.z, 'braced'), sway: effectiveLengthK(Gi.z, Gj.z, 'sway') },
    })
  }
  return out
}
