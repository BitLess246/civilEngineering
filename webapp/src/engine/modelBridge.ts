// ─────────────────────────────────────────────────────────────────────────
// StructuralModel → frame3d bridge. Sections become E/G/A/Iy/Iz/J; supports
// map to fixed/pin; slab AREA loads run through the Phase-3 tributary engine
// and land on the matching edge members as vdl/udl gravity loads (categories
// preserved) — the load path, automated.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, RectSection } from './model'
import type { F3Node, F3Member, F3Support, F3Load } from './frame3d'
import { rectJ } from './frame3d'
import { distributePanel, type AreaLoad } from './tributary'
import type { BeamLoad } from './beamAnalysis'

export interface BridgeResult {
  nodes: F3Node[]
  members: F3Member[]
  supports: F3Support[]
  loads: F3Load[]
  /** Edges whose loads could not be attached (no matching member). */
  orphanEdges: string[]
}

function sectionProps(s: RectSection) {
  const E = 4700 * Math.sqrt(Math.max(s.fc, 1))
  return {
    E,
    G: E / 2.4,                 // ν = 0.2
    A: s.b * s.h,
    Iz: (s.b * s.h ** 3) / 12,  // gravity bending (depth h vertical)
    Iy: (s.h * s.b ** 3) / 12,
    J: rectJ(s.b, s.h),
  }
}

/** Map a BeamLoad (x from edge start) onto a member that may run either way. */
function edgeLoadToMember(ld: BeamLoad, memberId: string, sameDir: boolean, L: number): F3Load | null {
  if (ld.type === 'udl') {
    const [x1, x2] = sameDir ? [ld.x1, ld.x2] : [L - ld.x2, L - ld.x1]
    return { kind: 'member-vdl', member: memberId, x1, x2, w1: ld.w, w2: ld.w, cat: ld.cat }
  }
  if (ld.type === 'vdl') {
    if (sameDir) return { kind: 'member-vdl', member: memberId, x1: ld.x1, x2: ld.x2, w1: ld.w1, w2: ld.w2, cat: ld.cat }
    return { kind: 'member-vdl', member: memberId, x1: L - ld.x2, x2: L - ld.x1, w1: ld.w2, w2: ld.w1, cat: ld.cat }
  }
  if (ld.type === 'point') return { kind: 'member-point', member: memberId, a: sameDir ? ld.x : L - ld.x, P: ld.P, cat: ld.cat }
  return null
}

export function modelToFrame3D(model: StructuralModel): BridgeResult {
  const nodes: F3Node[] = model.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, z: n.z }))
  const nm = new Map(nodes.map((n) => [n.id, n]))
  const secById = new Map(model.sections.map((s) => [s.id, sectionProps(s)]))
  const fallback = sectionProps(model.sections[0] ?? { id: '', name: '', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 })

  const members: F3Member[] = model.members.map((m) => ({
    id: m.id, i: m.i, j: m.j, ...(secById.get(m.section) ?? fallback),
  }))
  const memberByPair = new Map<string, { id: string; i: string; j: string }>()
  for (const m of model.members) {
    memberByPair.set(`${m.i}|${m.j}`, m)
    memberByPair.set(`${m.j}|${m.i}`, m)
  }

  const supports: F3Support[] = model.supports.map((s) => ({
    node: s.node,
    fixity: s.fixity === 'fixed' ? 'fixed' : 'pin',   // roller/spring → pin in 3D for now
  }))

  const loads: F3Load[] = []
  const orphanEdges: string[] = []

  // direct loads
  for (const ld of model.loads) {
    if (ld.kind === 'node') loads.push({ kind: 'node', node: ld.node, Fx: ld.Fx, Fy: ld.Fy, Fz: ld.Fz, cat: ld.cat })
    else if (ld.kind === 'member-udl') loads.push({ kind: 'member-udl', member: ld.member, w: ld.w, cat: ld.cat })
    else if (ld.kind === 'member-point') {
      const m = model.members.find((q) => q.id === ld.member)
      if (!m) continue
      const a = nm.get(m.i)!, b = nm.get(m.j)!
      const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
      loads.push({ kind: 'member-point', member: ld.member, a: ld.t * L, P: ld.P, cat: ld.cat })
    }
  }

  // slab area loads → tributary → edge members
  for (const plate of model.plates) {
    const areaLoads: AreaLoad[] = model.loads
      .filter((l) => l.kind === 'area' && l.plate === plate.id)
      .map((l) => ({ q: (l as { q: number }).q, cat: l.cat }))
    if (areaLoads.length === 0) continue

    const c = plate.corners.map((id) => nm.get(id))
    if (c.some((q) => !q)) continue
    const [c0, c1, c2, c3] = c as F3Node[]
    const lxSpan = Math.hypot(c1.x - c0.x, c1.y - c0.y, c1.z - c0.z)   // edge c0→c1 (and c3→c2)
    const lzSpan = Math.hypot(c3.x - c0.x, c3.y - c0.y, c3.z - c0.z)   // edge c0→c3 (and c1→c2)
    const trib = distributePanel(lxSpan, lzSpan, areaLoads)

    // pair the panel's long/short tributary edges with the actual corner edges
    const xEdges: [F3Node, F3Node][] = [[c0, c1], [c3, c2]]
    const zEdges: [F3Node, F3Node][] = [[c0, c3], [c1, c2]]
    const longEdges = lxSpan >= lzSpan ? xEdges : zEdges
    const shortEdges = lxSpan >= lzSpan ? zEdges : xEdges
    const assign: [EdgePair: [F3Node, F3Node], kind: 'long' | 'short'][] = [
      [longEdges[0], 'long'], [longEdges[1], 'long'],
      [shortEdges[0], 'short'], [shortEdges[1], 'short'],
    ]

    let li = 0, si = 0
    for (const [[a, b], kind] of assign) {
      const trEdge = kind === 'long'
        ? trib.edges.filter((e) => e.kind === 'long')[li++]
        : trib.edges.filter((e) => e.kind === 'short')[si++]
      if (!trEdge || trEdge.loads.length === 0) continue
      const m = memberByPair.get(`${a.id}|${b.id}`)
      if (!m) { orphanEdges.push(`${plate.id}:${a.id}-${b.id}`); continue }
      const sameDir = m.i === a.id
      const L = trEdge.length
      for (const ld of trEdge.loads) {
        const f3 = edgeLoadToMember(ld, m.id, sameDir, L)
        if (f3) loads.push(f3)
      }
    }
  }

  return { nodes, members, supports, loads, orphanEdges }
}
