// ─────────────────────────────────────────────────────────────────────────
// THE ROOF TRUSSES' PANEL-POINT JOINTS — layer 6, downstream of the solve.
//
// Every panel point where webs land on a chord (engine/roofTruss), checked by
// `hssTrussJoint` (AISC 360-16 §K3) in EVERY load combination — a joint's
// branch forces act together, so the check is run on each combination's own
// set and the worst kept, never on the members' separate envelopes. A joint
// a combination puts outside Table K3.2A is reported as not covered (a gusset
// plate detail) rather than failed.
//
// The bearings — where the chords meet on a column top — are seats, not
// branch-on-chord joints, and are not checked here.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from './model'
import type { F3Result } from './frame3d'
import { trussPart } from './roofTruss'
import { designTrussJoint, type JointResult, type JointBranch } from './hssTrussJoint'

export interface TrussJointRow {
  node: string
  truss: number
  /** 'top' or 'bottom' — which chord the webs land on. */
  chord: 'top' | 'bottom'
  result: JointResult
  /** The combination that governs. */
  gov: string
}

export interface TrussJointsOut {
  rows: TrussJointRow[]
  /** Joints Chapter K does not cover in some combination — with why. */
  notCovered: { node: string; shape: string; reason: string }[]
}

export function designTrussJoints(model: StructuralModel, runs: readonly { name: string; result: F3Result }[]): TrussJointsOut {
  const node = new Map(model.nodes.map((n) => [n.id, n]))
  const sec = new Map(model.sections.map((s) => [s.id, s]))
  const parts = model.members.map((m) => ({ m, t: trussPart(m.id) })).filter((x) => x.t)
  const out: TrussJointsOut = { rows: [], notCovered: [] }
  const existing = new Set<string>()          // bearings: nodes a column also frames into
  for (const m of model.members) if (m.role === 'column') { existing.add(m.i); existing.add(m.j) }

  const ids = [...new Set(parts.flatMap(({ m }) => [m.i, m.j]))]
  for (const id of ids) {
    if (existing.has(id)) continue
    const at = parts.filter(({ m }) => m.i === id || m.j === id)
    const webs = at.filter(({ t }) => t!.part === 'web')
    const chords = at.filter(({ t }) => t!.part !== 'web')
    if (!webs.length || chords.length < 2) continue
    // a joint on ONE chord: the webs land on the top chord or on the bottom
    const chordPart = chords[0].t!.part as 'top' | 'bottom'
    if (chords.some(({ t }) => t!.part !== chordPart)) continue
    const p0 = node.get(id)!
    const dirOf = (m: StructuralModel['members'][number]) => {
      const o = node.get(m.i === id ? m.j : m.i)!
      const v = [o.x - p0.x, o.y - p0.y, o.z - p0.z]
      const L = Math.hypot(v[0], v[1], v[2]) || 1
      return v.map((c) => c / L)
    }
    const cDir = dirOf(chords[0].m)
    const chordSec = sec.get(chords[0].m.section)
    if (!chordSec?.shape) continue
    let worst: { r: JointResult; gov: string } | null = null
    let uncovered: { r: JointResult; gov: string } | null = null
    for (const run of runs) {
      const N = (mid: string) => run.result.members.find((x) => x.id === mid)?.N[0] ?? 0
      const branches: JointBranch[] = webs.map(({ m }) => {
        const d = dirOf(m)
        const cos = Math.abs(d[0] * cDir[0] + d[1] * cDir[1] + d[2] * cDir[2])
        const s = sec.get(m.section)
        return {
          id: m.id, shape: s?.shape ?? '', theta: (Math.acos(Math.min(1, cos)) * 180) / Math.PI,
          P: N(m.id), Fy: s?.steelFy ?? 248, Fu: s?.steelFu ?? 400,
        }
      })
      const r = designTrussJoint({
        node: id, chordShape: chordSec.shape, Fy: chordSec.steelFy ?? 248, Fu: chordSec.steelFu ?? 400,
        chordN: chords.map(({ m }) => N(m.id)), branches,
      })
      if (!r) continue
      if (!r.covered) { if (!uncovered) uncovered = { r, gov: run.name }; continue }
      if (!worst || r.util > worst.r.util) worst = { r, gov: run.name }
    }
    const truss = chords[0].t!.truss
    if (uncovered) {
      out.notCovered.push({ node: id, shape: chordSec.shape, reason: `roof-truss joint outside AISC 360-16 Table K3.2A (${uncovered.r.limitNotes.join('; ')}) in ${uncovered.gov} — detail it with a gusset plate` })
      out.rows.push({ node: id, truss, chord: chordPart, result: uncovered.r, gov: uncovered.gov })
    } else if (worst) out.rows.push({ node: id, truss, chord: chordPart, result: worst.r, gov: worst.gov })
  }
  return out
}
