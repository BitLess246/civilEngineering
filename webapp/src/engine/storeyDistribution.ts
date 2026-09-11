// ─────────────────────────────────────────────────────────────────────────
// HOW A STOREY FORCE REACHES THE NODES OF ITS LEVEL.
//
// The vertical distribution (NSCP §208.5.5) says how much force each level
// gets. This says how that level's force is shared out in PLAN, and until now
// the answer was `F / nodes.length` — an equal split, in both `computeSeismic`
// and `computeWind`.
//
// Equal is only right when every column at the level is identical and evenly
// placed. Otherwise it loads a slender corner column exactly as hard as a
// stout interior one, and — because the resultant then sits at the nodes'
// GEOMETRIC centroid — it introduces a torque nobody asked for. Measured on a
// two-storey grid with 6+6 m bays one way and 2+10 m the other, that unasked
// torque reached 8.7% of L⊥ against the ±5% accidental eccentricity the code
// deliberately adds, and it acted in ONE sense only, so the ⟳/⟲ envelope never
// explored the other side.
//
// The share is each column's flexural stiffness for bending IN THE LOAD
// DIRECTION. With the storey's columns at a common height — the normal case,
// and what every generated grid produces — the lateral stiffness of a column
// is k = 12·E·I/h³, so h³ is a constant of the level and weighting by E·I is
// weighting by k. A level whose columns have DIFFERENT heights would want the
// h³ as well; `columnShares` reports `equalHeights` so a caller can say so.
//
// WHICH I. The section carries Iz = b·h³/12 (depth h) and Iy = h·b³/12, and a
// column's local axes are set by `localAxes` with the vertical default of 90°,
// which puts local y′ on global +X. Rather than assume that default, each
// column's axes are built and the direction is PROJECTED onto them:
//
//     EI(ĝ) = E·( Iz·(ĝ·y′)² + Iy·(ĝ·z′)² )
//
// so a column rotated by an explicit `axisRotation` is weighed on the stiffness
// it actually presents to the push, not on the one it would present unrotated.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from './model'
import { sectionProps } from './modelBridge'
import { localAxes, defaultAxisRotation } from './frame3d'

export interface StoreyShares {
  /** node id → fraction of the level's force, summing to 1. */
  share: Map<string, number>
  /** False when no column below the level carried any stiffness, so the caller
   *  must fall back to an equal split rather than apply nothing. */
  usable: boolean
  /** True when every contributing column has the same clear height, which is
   *  what makes E·I proportional to the lateral stiffness 12·E·I/h³. */
  equalHeights: boolean
}

/**
 * Shares of a level's lateral force, by the flexural stiffness each node's
 * column presents to a push along `dir`.
 *
 * The columns that carry a level's shear are the ones BELOW it, so a node is
 * weighed by the column whose UPPER end it is. A node with no column under it
 * — a beam-only node, a cantilever tip — takes none of the force, which is
 * what pushes it onto the columns that can actually deliver it to the ground.
 */
export function columnShares(
  model: StructuralModel, elevation: number, dir: 'x' | 'z',
): StoreyShares {
  const nm = new Map(model.nodes.map((n) => [n.id, n]))
  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const g: [number, number, number] = dir === 'x' ? [1, 0, 0] : [0, 0, 1]
  const at = model.nodes.filter((n) => Math.abs(n.y - elevation) < 1e-6)
  const w = new Map<string, number>(at.map((n) => [n.id, 0]))
  const heights: number[] = []

  for (const m of model.members) {
    if (m.role !== 'column') continue
    const a = nm.get(m.i), b = nm.get(m.j)
    if (!a || !b) continue
    // the node at THIS level must be the column's upper end
    const upper = a.y > b.y ? a : b
    const lower = a.y > b.y ? b : a
    if (Math.abs(upper.y - elevation) > 1e-6) continue
    if (!w.has(upper.id)) continue
    const sec = secById.get(m.section)
    if (!sec) continue
    const p = sectionProps(sec)
    const dirV: [number, number, number] = [b.x - a.x, b.y - a.y, b.z - a.z]
    const [, yp, zp] = localAxes(dirV, defaultAxisRotation(dirV, m.axisRotation))
    const cy = g[0] * yp[0] + g[1] * yp[1] + g[2] * yp[2]
    const cz = g[0] * zp[0] + g[1] * zp[1] + g[2] * zp[2]
    const EI = p.E * (p.Iz * cy * cy + p.Iy * cz * cz)
    if (!(EI > 0) || !Number.isFinite(EI)) continue
    w.set(upper.id, (w.get(upper.id) ?? 0) + EI)
    heights.push(upper.y - lower.y)
  }

  const total = [...w.values()].reduce((s, v) => s + v, 0)
  if (!(total > 0)) return { share: new Map(), usable: false, equalHeights: true }
  const share = new Map<string, number>()
  for (const [id, v] of w) if (v > 0) share.set(id, v / total)
  const hMin = Math.min(...heights), hMax = Math.max(...heights)
  return { share, usable: true, equalHeights: hMax - hMin < 1e-6 }
}
