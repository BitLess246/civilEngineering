// ─────────────────────────────────────────────────────────────────────────
// Automatic rigid end zones (ETABS "End Length Offsets — Automatic from
// Connectivity"). At every joint, each member framing in gets a rigid arm whose
// length is the panel-zone size derived from the OTHER members meeting there:
// the half-extent of the largest connecting member's cross-section projected on
// this member's axis, scaled by a rigid-zone factor (0–1).
//
// The result is a per-member { offI, offJ } pointing inward (node→clear-span
// end), consumed by the rigid-link engine (frame3d offI/offJ). Manual member
// offsets take precedence over these auto values in the bridge.
//
// Units: section b/h in mm → m; offsets in m (global).
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from './model'
import { localAxes, type V3 } from './frame3d'

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

interface MG { id: string; i: string; j: string; e: V3; L: number; yp: V3; zp: V3; b: number; h: number }

/**
 * Auto end-offset vectors per member from joint connectivity + member depths.
 * `factor` (0–1) scales the rigid-zone length (ETABS rigid-zone factor). Returns
 * an empty map when factor ≤ 0. offI points i→j, offJ points j→i (inward).
 */
export function autoRigidOffsets(
  model: StructuralModel, factor: number,
): Map<string, { offI?: V3; offJ?: V3 }> {
  const out = new Map<string, { offI?: V3; offJ?: V3 }>()
  if (!(factor > 0)) return out

  const nm = new Map(model.nodes.map((n) => [n.id, [n.x, n.y, n.z] as V3]))
  const secById = new Map(model.sections.map((s) => [s.id, s]))

  const mgs: MG[] = []
  for (const m of model.members) {
    const pi = nm.get(m.i), pj = nm.get(m.j)
    if (!pi || !pj) continue
    const dir = sub(pj, pi)
    const L = Math.hypot(...dir)
    if (L <= 1e-9) continue
    const [xp, yp, zp] = localAxes(dir)
    const sec = secById.get(m.section)
    mgs.push({ id: m.id, i: m.i, j: m.j, e: xp, L, yp, zp, b: (sec?.b ?? 0) / 1000, h: (sec?.h ?? 0) / 1000 })
  }

  const byNode = new Map<string, MG[]>()
  for (const mg of mgs) for (const nd of [mg.i, mg.j]) {
    const list = byNode.get(nd) ?? []
    list.push(mg)
    byNode.set(nd, list)
  }

  // half-extent of member n's cross-section projected on direction e (m)
  const halfExtent = (n: MG, e: V3) => (n.h / 2) * Math.abs(dot(e, n.yp)) + (n.b / 2) * Math.abs(dot(e, n.zp))

  for (const mg of mgs) {
    const zone = (nd: string) => {
      let d = 0
      for (const o of byNode.get(nd) ?? []) if (o.id !== mg.id) d = Math.max(d, halfExtent(o, mg.e))
      return factor * d
    }
    let li = zone(mg.i), lj = zone(mg.j)
    // keep a positive clear span
    const cap = 0.9 * mg.L
    if (li + lj > cap && li + lj > 0) { const s = cap / (li + lj); li *= s; lj *= s }

    const entry: { offI?: V3; offJ?: V3 } = {}
    if (li > 1e-9) entry.offI = [mg.e[0] * li, mg.e[1] * li, mg.e[2] * li]
    if (lj > 1e-9) entry.offJ = [-mg.e[0] * lj, -mg.e[1] * lj, -mg.e[2] * lj]
    if (entry.offI || entry.offJ) out.set(mg.id, entry)
  }
  return out
}
