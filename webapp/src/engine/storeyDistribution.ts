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
import type { StructuralModel, ModelLoad } from './model'
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

// ─────────────────────────────────────────────────────────────────────────
// WHERE THE RESULTANT ENDS UP.
//
// Sharing a level's force by column stiffness fixes how hard each column is
// pushed, but it also decides WHERE the level's resultant acts: the line of
// action passes through the weighted centroid of the pattern. With E·I weights
// that centroid is the level's centre of RIGIDITY, and a resultant applied at
// the centre of rigidity twists nothing — the inherent torsion F·(CM − CR) the
// building actually feels is thrown away. (The equal split had the same defect
// with a different target: it put the resultant at the nodes' geometric
// centroid, which is no more the right point, just a less predictable one.)
//
// NSCP §208.7.2.7 is explicit that the design eccentricity is the ACTUAL
// eccentricity plus the ±5% accidental one. In a hand calculation the actual
// part is applied as a torque F·e about the centre of rigidity. In an FEM it
// is applied by putting the force where it comes from — the centre of MASS —
// and letting the structure twist about whatever centre of rigidity it has.
// `shiftResultantLoads` is that correction: a self-equilibrating couple that
// moves the pattern's line of action onto a stated plan coordinate, leaving
// ΣF untouched. Wind gets the same treatment against a different target, the
// centre of the face the pressure acts on.

/** Perpendicular plan coordinate: a push along x levers about z, and v.v. */
const perp = (n: { x: number; z: number }, dir: 'x' | 'z') => (dir === 'x' ? n.z : n.x)

/**
 * Perpendicular plan coordinate of a level's centre of rigidity for a push
 * along `dir` — Σ(k_i·d_i)/Σk_i over the columns below the level. `null` when
 * no column below the level carries stiffness, i.e. when `columnShares` is not
 * usable and there is no rigidity centre to speak of.
 */
export function centreOfRigidity(
  model: StructuralModel, elevation: number, dir: 'x' | 'z',
): number | null {
  const cs = columnShares(model, elevation, dir)
  if (!cs.usable) return null
  const nm = new Map(model.nodes.map((n) => [n.id, n]))
  let c = 0
  for (const [id, f] of cs.share) {
    const n = nm.get(id)
    if (n) c += f * perp(n, dir)
  }
  return c
}

/**
 * Self-equilibrating node forces that move the resultant of `base` onto the
 * plan coordinate `target` gives for each level.
 *
 * For a level carrying ΣF at the weighted centroid c̄ of the pattern, the
 * required torque is T = ΣF·(target − c̄); it is realised exactly as the
 * §208.7.2.7 accidental couple is, by
 *
 *     ΔF_i = T · w_i·d_i / Σ w_j·d_j²      (d measured from the w-centroid)
 *
 * so ΣΔF = 0 (statics unchanged) and ΣΔF·d = T (the shift is exact). `weight`
 * supplies w_i; a level with no torsional lever (single frame line, Σw·d² ≈ 0)
 * cannot be shifted and contributes nothing. `target` returning `null` means
 * "leave this level alone".
 */
export function shiftResultantLoads(
  model: StructuralModel,
  base: ModelLoad[],
  dir: 'x' | 'z',
  cat: ModelLoad['cat'],
  target: (nodes: StructuralModel['nodes'], elevation: number) => number | null,
  weight: (id: string) => number,
): ModelLoad[] {
  const nm = new Map(model.nodes.map((n) => [n.id, n]))

  // group the pattern's forces by level (node elevation)
  const byLevel = new Map<number, { node: string; F: number }[]>()
  for (const l of base) {
    if (l.kind !== 'node') continue
    const n = nm.get(l.node)
    if (!n) continue
    const F = (dir === 'x' ? l.Fx : l.Fz) ?? 0
    if (F === 0) continue
    const key = [...byLevel.keys()].find((e) => Math.abs(e - n.y) < 1e-6) ?? n.y
    const arr = byLevel.get(key) ?? []
    arr.push({ node: l.node, F })
    byLevel.set(key, arr)
  }

  const out: ModelLoad[] = []
  for (const [y, entries] of byLevel) {
    const Flevel = entries.reduce((s, e) => s + e.F, 0)
    if (!(Math.abs(Flevel) > 1e-12)) continue
    const nodes = model.nodes.filter((n) => Math.abs(n.y - y) < 1e-6)
    if (nodes.length < 2) continue
    const tgt = target(nodes, y)
    if (tgt === null) continue
    // torque needed to move the pattern's line of action onto the target
    let applied = 0
    for (const e of entries) {
      const n = nm.get(e.node)
      if (n) applied += e.F * perp(n, dir)
    }
    const T = Flevel * tgt - applied
    if (!(Math.abs(T) > 1e-12)) continue
    // weighted centroid and torsional lever Σw·d² of the level
    let wTot = 0, wC = 0
    for (const n of nodes) { const w = weight(n.id); wTot += w; wC += w * perp(n, dir) }
    if (!(wTot > 0)) continue
    const cbar = wC / wTot
    let denom = 0
    for (const n of nodes) denom += weight(n.id) * (perp(n, dir) - cbar) ** 2
    if (!(denom > 1e-9)) continue                    // no lever — single frame line
    for (const n of nodes) {
      const dF = (T * weight(n.id) * (perp(n, dir) - cbar)) / denom
      if (Math.abs(dF) < 1e-12) continue
      out.push(dir === 'x'
        ? { kind: 'node', node: n.id, Fx: dF, cat }
        : { kind: 'node', node: n.id, Fz: dF, cat })
    }
  }
  return out
}
