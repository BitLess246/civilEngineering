// ─────────────────────────────────────────────────────────────────────────
// WHAT EVERY STEEL BEAM END IS CONNECTED WITH — decided once, BEFORE the
// analysis, and read by the analysis (releases, modelBridge) and the
// connection design (steelConnections) alike, so the joint that is built is
// the joint that was analysed.
//
// It used to be decided AFTER. The frame was analysed with every joint rigid;
// then any beam-to-column end whose moment came out under 20% of φMn was
// detailed as a shear tab and labelled "pin — releases Mz", on a beam that had
// been designed for an end moment a pin cannot carry and without the midspan
// moment a pin sheds into the span. A beam framing into a girder was detailed
// as a coped fin plate on an analysis that held it continuous.
//
// The rule — an EXPLICIT per-end connection always wins:
//   · the end sits on a node with a column           → 'moment'  (rigid, as analysed)
//   · the end is carried by a through beam/girder    → 'simple'  (coped fin plate,
//                                                      AISC SCM Part 10 — a pin)
//   · anything else (a member running through, a free end) → continuous
// Only STEEL beams and girders are resolved. Concrete is monolithic and timber
// is out of scope here, so both keep exactly the connections they were given.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, Member, MemberConnections, ConnectionKind } from './model'
import { shapeByName } from './aiscSections'

type End = 'iEnd' | 'jEnd'

const isFlexural = (m: Member) => m.role === 'beam' || m.role === 'girder'

/** The collinear pair of steel beams/girders running THROUGH a node (outward
 *  directions opposed), preferring girders, then the deeper shape — the member
 *  that carries whatever else frames in there. Null when no pair runs through. */
export function throughCarrier(
  model: Pick<StructuralModel, 'nodes' | 'sections'>, nodeId: string, mems: Member[],
): [Member, Member] | null {
  const nodeMap = new Map(model.nodes.map((n) => [n.id, n]))
  const secOf = new Map(model.sections.map((s) => [s.id, s]))
  const outDir = (m: Member): [number, number] | null => {
    const a = nodeMap.get(nodeId), b = nodeMap.get(m.i === nodeId ? m.j : m.i)
    if (!a || !b) return null
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz)
    return L > 1e-9 ? [dx / L, dz / L] : null
  }
  let carrier: [Member, Member] | null = null, best = -1
  for (let a = 0; a < mems.length; a++)
    for (let b = a + 1; b < mems.length; b++) {
      const da = outDir(mems[a]), db = outDir(mems[b])
      if (!da || !db || da[0] * db[0] + da[1] * db[1] > -0.999) continue   // not collinear-through
      const depth = (shapeByName(secOf.get(mems[a].section)?.shape ?? '')?.d ?? 0) + (mems[a].role === 'girder' ? 1e6 : 0)
      if (depth > best) { best = depth; carrier = [mems[a], mems[b]] }
    }
  return carrier
}

/** Every steel beam/girder end's connection, resolved (see file header). An end
 *  left out of the result is continuous. */
export function resolveSteelConnections(model: Pick<StructuralModel, 'nodes' | 'sections' | 'members'>): Map<string, MemberConnections> {
  const steel = new Set(model.sections.filter((s) => s.material === 'steel').map((s) => s.id))
  const atNode = new Map<string, Member[]>()
  for (const m of model.members)
    for (const n of [m.i, m.j]) {
      const list = atNode.get(n); if (list) list.push(m); else atNode.set(n, [m])
    }
  const out = new Map<string, MemberConnections>()
  for (const m of model.members) {
    if (!isFlexural(m) || !steel.has(m.section)) continue
    const conn: MemberConnections = {}
    for (const [end, node] of [['iEnd', m.i], ['jEnd', m.j]] as [End, string][]) {
      const explicit = m.connections?.[end]
      if (explicit) { conn[end] = explicit; continue }
      const here = atNode.get(node) ?? []
      let kind: ConnectionKind | undefined
      if (here.some((x) => x.role === 'column')) kind = 'moment'
      else {
        const flex = here.filter((x) => isFlexural(x) && steel.has(x.section))
        const carrier = flex.length >= 3 ? throughCarrier(model, node, flex) : null
        if (carrier && !carrier.some((c) => c.id === m.id)) kind = 'simple'
      }
      if (kind) conn[end] = kind
    }
    if (conn.iEnd || conn.jEnd) out.set(m.id, conn)
  }
  return out
}
