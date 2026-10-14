// ─────────────────────────────────────────────────────────────────────────
// Member loads on rigid end zones. A member with end offsets (auto rigid end
// zones, or manual ones) is solved as a FLEXIBLE element spanning end→end —
// frame3d places every member load along that flexible length, x = 0 at the
// offset i-end. Model loads are written along the NODE-to-node length, so
// passed straight through they lose the part that sits on a rigid zone (a UDL
// was spread over the clear span only: w·(L − aᵢ − aⱼ) instead of w·L) and the
// rest lands shifted by aᵢ. On the 3×2-bay, 4-storey frame that was 370 kN of
// 8 734 kN gravity — the statics check read a 4.2 % residual.
//
// The rebase here keeps L3 untouched: the flexible part becomes a member-vdl in
// flexible coordinates, and the part on each rigid arm goes to its node as the
// resultant force plus that force's moment about the node, M = r × F, r being
// the point on the rigid arm under the load's centroid. Rigid arms carry load
// to the joint without deforming, so this is exact, not an approximation.
//
// Units: lengths m, forces kN, moments kN·m; gravity loads act in global −Y.
// ─────────────────────────────────────────────────────────────────────────
import type { F3Load, F3Member, F3Node, V3 } from './frame3d'

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const EPS = 1e-9

interface Zones { L: number; ai: number; aj: number; offI: V3; offJ: V3; i: string; j: string }

/** A gravity force F (kN, acting in −Y) at arm r from the node → nodal load. */
function nodal(node: string, F: number, r: V3, cat: F3Load['cat']): F3Load {
  // M = r × (0, −F, 0) = (r_z·F, 0, −r_x·F)
  return { kind: 'node', node, Fy: -F, Mx: r[2] * F, Mz: -r[0] * F, cat }
}

/**
 * Re-express member loads (node-to-node coordinates) on each member's flexible
 * element, moving what falls on a rigid end zone to the node. Members without
 * an along-axis offset pass through untouched — a pure perpendicular offset
 * (the top-of-steel drop) keeps the length, so it needs no rebase.
 */
export function rebaseLoadsOnRigidZones(loads: F3Load[], members: F3Member[], nodes: F3Node[]): F3Load[] {
  const nm = new Map(nodes.map((n) => [n.id, [n.x, n.y, n.z] as V3]))
  const zones = new Map<string, Zones>()
  for (const m of members) {
    if (!m.offI && !m.offJ) continue
    const pi = nm.get(m.i), pj = nm.get(m.j)
    if (!pi || !pj) continue
    const d = sub(pj, pi), L = Math.hypot(...d)
    if (L <= EPS) continue
    const e: V3 = [d[0] / L, d[1] / L, d[2] / L]
    const offI = (m.offI ?? [0, 0, 0]) as V3, offJ = (m.offJ ?? [0, 0, 0]) as V3
    const ai = Math.max(0, dot(offI, e)), aj = Math.max(0, -dot(offJ, e))
    if (ai <= EPS && aj <= EPS) continue
    zones.set(m.id, { L, ai, aj, offI, offJ, i: m.i, j: m.j })
  }
  if (zones.size === 0) return loads

  const out: F3Load[] = []
  for (const ld of loads) {
    if (ld.kind === 'node' || ld.kind === 'member-thermal') { out.push(ld); continue }
    const z = zones.get(ld.member)
    if (!z) { out.push(ld); continue }
    const { L, ai, aj } = z, xe = L - aj                     // flexible part: [ai, xe] in node coordinates
    // the point on rigid arm i (or j) at node coordinate x
    const armI = (x: number): V3 => { const k = ai > EPS ? x / ai : 0; return [z.offI[0] * k, z.offI[1] * k, z.offI[2] * k] }
    const armJ = (x: number): V3 => { const k = aj > EPS ? (L - x) / aj : 0; return [z.offJ[0] * k, z.offJ[1] * k, z.offJ[2] * k] }

    if (ld.kind === 'member-point') {
      if (ld.a < ai) out.push(nodal(z.i, ld.P, armI(ld.a), ld.cat))
      else if (ld.a > xe) out.push(nodal(z.j, ld.P, armJ(ld.a), ld.cat))
      else out.push({ ...ld, a: ld.a - ai })
      continue
    }
    // a trapezoid over [x1, x2]: the UDL is the trapezoid over the whole length
    const [x1, x2, w1, w2] = ld.kind === 'member-udl' ? [0, L, ld.w, ld.w] : [ld.x1, ld.x2, ld.w1, ld.w2]
    const lo = Math.max(0, Math.min(x1, x2)), hi = Math.min(L, Math.max(x1, x2))
    if (!(hi - lo > EPS)) continue
    const wLo = x1 <= x2 ? w1 : w2, wHi = x1 <= x2 ? w2 : w1
    const wAt = (x: number) => wLo + ((wHi - wLo) * (x - lo)) / (hi - lo)
    // resultant and centroid of the trapezoid on [a, b]
    const piece = (a: number, b: number) => {
      const wa = wAt(a), wb = wAt(b), F = 0.5 * (wa + wb) * (b - a)
      const xc = Math.abs(wa + wb) > EPS ? a + ((b - a) * (wa + 2 * wb)) / (3 * (wa + wb)) : (a + b) / 2
      return { F, xc }
    }
    if (lo < ai) { const p = piece(lo, Math.min(hi, ai)); if (Math.abs(p.F) > 0) out.push(nodal(z.i, p.F, armI(p.xc), ld.cat)) }
    const a = Math.max(lo, ai), b = Math.min(hi, xe)
    if (b - a > EPS) out.push({ kind: 'member-vdl', member: ld.member, x1: a - ai, x2: b - ai, w1: wAt(a), w2: wAt(b), cat: ld.cat })
    if (hi > xe) { const p = piece(Math.max(lo, xe), hi); if (Math.abs(p.F) > 0) out.push(nodal(z.j, p.F, armJ(p.xc), ld.cat)) }
  }
  return out
}
