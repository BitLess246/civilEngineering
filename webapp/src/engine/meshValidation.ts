// ─────────────────────────────────────────────────────────────────────────
// Mesh validation (CLAUDE.md §1). A strictly upstream, pure check that runs
// before analysis: it catches the geometry/connectivity errors that would
// otherwise produce a singular stiffness matrix with no explanation, and
// reports them against the offending node/member ids. Errors are fatal (the
// solve would fail); warnings are advisory (the solve still runs).
//
// What it can prove cheaply from the graph alone:
//   • duplicate node ids, member/support refs to missing nodes
//   • zero-length members (singular element stiffness)
//   • a model with no supports, or a connected component with no support
//     node (an unrestrained rigid body → singular K)
//   • a node attached to no member whose DOFs aren't fully fixed (free DOFs
//     with zero stiffness → singular K)
//   • coincident distinct nodes / duplicate members (advisory)
//
// It deliberately does NOT try to prove full 6-DOF stability of a restrained
// component (that needs the assembled matrix rank): it only flags components
// with *zero* supports, which are always rigid bodies — so it never blocks a
// valid model with a false error.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from './model'
import { barContinuityGroups } from './modelBuilder'
import { WOOD_SPECIES } from './woodDesign'

export type MeshSeverity = 'error' | 'warning'
export interface MeshIssue {
  severity: MeshSeverity
  code: string
  message: string
  refs: string[]              // involved node / member ids
}

const COINCIDENT_TOL = 1e-6  // m

export function validateMesh(model: StructuralModel): MeshIssue[] {
  const issues: MeshIssue[] = []
  const { nodes, members, supports } = model

  // ── node id integrity ──────────────────────────────────────────────────
  const seen = new Set<string>()
  const dupIds = new Set<string>()
  for (const n of nodes) (seen.has(n.id) ? dupIds : seen).add(n.id)
  for (const id of dupIds)
    issues.push({ severity: 'error', code: 'duplicate-node-id', refs: [id],
      message: `Duplicate node id "${id}" — node ids must be unique.` })

  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  // ── member ref integrity & zero-length ──────────────────────────────────
  const pairSeen = new Map<string, string>()   // "i|j" (sorted) → first member id
  for (const m of members) {
    const a = nodeById.get(m.i), b = nodeById.get(m.j)
    if (!a || !b) {
      const missing = [!a ? m.i : null, !b ? m.j : null].filter(Boolean) as string[]
      issues.push({ severity: 'error', code: 'member-missing-node', refs: [m.id, ...missing],
        message: `Member ${m.id} references missing node(s) ${missing.join(', ')}.` })
      continue
    }
    if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < COINCIDENT_TOL)
      issues.push({ severity: 'error', code: 'zero-length-member', refs: [m.id],
        message: `Member ${m.id} has zero length (nodes ${m.i} and ${m.j} coincide) — its stiffness is singular.` })

    if (m.axisRotation !== undefined && !Number.isFinite(m.axisRotation))
      issues.push({ severity: 'error', code: 'bad-axis-rotation', refs: [m.id],
        message: `Member ${m.id} has a non-numeric local-axis rotation.` })

    const key = [m.i, m.j].sort().join('|')
    const prev = pairSeen.get(key)
    if (prev) issues.push({ severity: 'warning', code: 'duplicate-member', refs: [prev, m.id],
      message: `Members ${prev} and ${m.id} span the same nodes — stiffness is doubled.` })
    else pairSeen.set(key, m.id)
  }

  // ── bar-diameter continuity (advisory): a continuous beam line or column
  // stack should carry ONE main-bar Ø — bars pass through the joint / splice
  // storey to storey. Bar count may differ per span (cuts and splices). ──────
  const secDia = new Map(model.sections.map((s) => [s.id, s.barDia]))
  const memSec = new Map(model.members.map((m) => [m.id, m.section]))
  for (const group of barContinuityGroups(model)) {
    const dias = [...new Set(group.map((id) => secDia.get(memSec.get(id) ?? '') ?? 0))].filter((d) => d > 0)
    if (dias.length > 1)
      issues.push({ severity: 'warning', code: 'bar-dia-discontinuity', refs: group,
        message: `Members ${group.join(', ')} form a continuous run/stack but mix main-bar diameters (⌀${dias.sort((a, b) => a - b).join(', ⌀')}) — use one Ø through the joint; vary the bar COUNT per span instead.` })
  }

  // ── coincident distinct nodes (advisory: usually an unmerged mesh) ───────
  const byCoord = new Map<string, string[]>()
  for (const n of nodes) {
    const k = `${Math.round(n.x / COINCIDENT_TOL)},${Math.round(n.y / COINCIDENT_TOL)},${Math.round(n.z / COINCIDENT_TOL)}`
    ;(byCoord.get(k) ?? byCoord.set(k, []).get(k)!).push(n.id)
  }
  for (const ids of byCoord.values())
    if (ids.length > 1)
      issues.push({ severity: 'warning', code: 'coincident-nodes', refs: ids,
        message: `Nodes ${ids.join(', ')} share the same location — merge them if they should be one joint.` })

  // ── support ref integrity ───────────────────────────────────────────────
  const supById = new Map(supports.map((s) => [s.node, s]))
  for (const s of supports)
    if (!nodeById.has(s.node))
      issues.push({ severity: 'error', code: 'support-missing-node', refs: [s.node],
        message: `Support references missing node ${s.node}.` })

  // ── restraint / rigid-body checks ───────────────────────────────────────
  const validSupports = supports.filter((s) => nodeById.has(s.node))
  if (validSupports.length === 0) {
    if (nodes.length > 0)
      issues.push({ severity: 'error', code: 'no-supports', refs: [],
        message: 'Model has no supports — the structure is an unrestrained rigid body (singular K).' })
    return issues  // every component is a rigid body; one message is enough
  }

  // Nodes attached to ≥1 valid member, and the union-find over them.
  const inMember = new Set<string>()
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    while (parent.get(x) !== r) { const nx = parent.get(x)!; parent.set(x, r); x = nx }
    return r
  }
  const add = (id: string) => { if (!parent.has(id)) parent.set(id, id) }
  for (const m of members) {
    if (!nodeById.has(m.i) || !nodeById.has(m.j)) continue
    inMember.add(m.i); inMember.add(m.j)
    add(m.i); add(m.j)
    parent.set(find(m.i), find(m.j))
  }

  // Each connected component must contain at least one support node.
  const compNodes = new Map<string, string[]>()
  for (const id of parent.keys()) {
    const r = find(id)
    ;(compNodes.get(r) ?? compNodes.set(r, []).get(r)!).push(id)
  }
  for (const ids of compNodes.values()) {
    if (ids.some((id) => supById.has(id))) continue
    const sample = ids.slice(0, 5)
    issues.push({ severity: 'error', code: 'unrestrained-component', refs: sample,
      message: `${ids.length} connected node(s) (${sample.join(', ')}${ids.length > sample.length ? ', …' : ''}) have no support — this part of the model is an unrestrained rigid body (singular K).` })
  }

  // ── orphan nodes (no member): free DOFs with no stiffness ───────────────
  for (const n of nodes) {
    if (inMember.has(n.id)) continue
    const sup = supById.get(n.id)
    if (sup?.fixity === 'fixed')
      issues.push({ severity: 'warning', code: 'isolated-node', refs: [n.id],
        message: `Node ${n.id} is attached to no member (fully fixed, so harmless but unused).` })
    else
      issues.push({ severity: 'error', code: 'orphan-node', refs: [n.id],
        message: `Node ${n.id} is attached to no member; its free DOFs have no stiffness (singular K).` })
  }


  // ── timber sanity (L1 rule for wood sections) ───────────────────────────
  for (const sec of model.sections) {
    if (sec.material !== 'wood') continue
    if (sec.woodSpecies && !WOOD_SPECIES[sec.woodSpecies])
      issues.push({ severity: 'error', code: 'WOOD_SPECIES', message: `section ${sec.id}: unknown timber species "${sec.woodSpecies}" — not in the WOOD_SPECIES library`, refs: [sec.id] })
    if (!(sec.b > 0) || !(sec.h > 0))
      issues.push({ severity: 'error', code: 'WOOD_DIMS', message: `section ${sec.id}: timber b and d must be positive`, refs: [sec.id] })
  }

  // ── timber deck sanity (L1 rule for Plate.deck / wood slab) ─────────────
  for (const p of model.plates) {
    const d = p.deck; if (!d) continue
    if (d.joistSpecies && !WOOD_SPECIES[d.joistSpecies] && !d.joistRef)
      issues.push({ severity: 'error', code: 'DECK_SPECIES', message: `plate ${p.id}: unknown timber species "${d.joistSpecies}" — not in the WOOD_SPECIES library`, refs: [p.id] })
    if (!(d.joistB > 0) || !(d.joistD > 0) || !(d.joistSpacing > 0))
      issues.push({ severity: 'error', code: 'DECK_JOIST', message: `plate ${p.id}: deck joist b, d and spacing must be positive`, refs: [p.id] })
    if (!(d.deckThickness > 0))
      issues.push({ severity: 'error', code: 'DECK_THICKNESS', message: `plate ${p.id}: deck thickness must be positive`, refs: [p.id] })
  }

  // ── prestressing sanity (L1 rule for RectSection.ps) ────────────────────
  for (const sec of model.sections) {
    if (!sec.ps) continue
    if (sec.material === 'steel' || sec.material === 'wood')
      issues.push({ severity: 'error', code: 'PS_STEEL', message: `section ${sec.id}: prestressing is only supported on concrete sections`, refs: [sec.id] })
    if (!(sec.ps.Aps > 0) || !(sec.ps.fpu > 0) || !(sec.ps.fci > 0))
      issues.push({ severity: 'error', code: 'PS_PARAMS', message: `section ${sec.id}: Aps, fpu and f'ci must be positive`, refs: [sec.id] })
    if (!(sec.ps.e > 0) || sec.ps.e > sec.h / 2 - 40)
      issues.push({ severity: 'error', code: 'PS_ECC', message: `section ${sec.id}: tendon eccentricity must satisfy 0 < e ≤ h/2 − 40 mm`, refs: [sec.id] })
  }
  return issues
}

/** True if any issue is fatal (analysis would fail). */
export function hasMeshErrors(issues: MeshIssue[]): boolean {
  return issues.some((i) => i.severity === 'error')
}
