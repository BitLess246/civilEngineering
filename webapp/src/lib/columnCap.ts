// ─────────────────────────────────────────────────────────────────────────
// HOW FAR A TERMINATING COLUMN IS DRAWN ABOVE ITS TOP NODE.
//
// A floor level is the TOP of the beams at it: the column below stops there,
// the column above starts there, and the beam hangs under the pair
// (`sceneTokens.levelDrop`, `beamAxisOffsets`). At an intermediate node the
// storey above fills the joint block, so nothing is needed. Where the stack
// ENDS — a roof column, or one that stops short — the solid has to reach the
// top of the deepest member framing into it, or the joint block is an open
// notch with nothing in it.
//
// THE VIEWPORT USED TO TAKE THAT RISE FROM `autoRigidOffsets`, AND THAT IS NOW
// HALF A BEAM TOO FAR. A rigid end zone is measured from the node to the face
// of the supporting member — half the framing depth — which was exactly the
// right rise back when a beam was drawn CENTRED on its node and its top sat
// h/2 above it. Once beams were dropped so their top IS the node, the same
// number became pure overshoot: every roof column grew a 0.25 m stub above its
// own slab (500 mm beams), visible as a block standing proud of the roof.
//
// So the rise is measured from what is actually DRAWN rather than from the
// analysis zone: for each member framing into the node, how far its own solid
// reaches above that node. A beam that hangs contributes zero, because its top
// is the node. Anything that does not hang — a brace, a sloping member —
// still contributes its half-extent, so the general case keeps working.
//
// Units: metres.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, RectSection } from '../engine/model'
import { depthWidth } from '../engine/rigidEndZones'
import { localAxes, defaultAxisRotation, type V3 } from '../engine/frame3d'
import { HANGS_BELOW_NODE } from '../components/modelSpace/sceneTokens'

const UP: V3 = [0, 1, 0]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * Metres a column's solid should be drawn ABOVE its upper node, by member id.
 *
 * Absent or 0 ⇒ draw to the node. Only terminating columns get an entry: where
 * another column continues from the same node, that column's own solid fills
 * the joint and adding a cap would double it.
 */
export function columnCapRise(model: StructuralModel): Map<string, number> {
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]))
  const secById = new Map(model.sections.map((s) => [s.id, s as RectSection]))
  const out = new Map<string, number>()

  /** How far this member's DRAWN solid reaches above the node it holds, m. */
  const riseAbove = (m: StructuralModel['members'][number]): number => {
    const ni = nodeById.get(m.i), nj = nodeById.get(m.j)
    if (!ni || !nj) return 0
    const dir: V3 = [nj.x - ni.x, nj.y - ni.y, nj.z - ni.z]
    if (Math.hypot(...dir) <= 1e-9) return 0
    const [, yp, zp] = localAxes(dir, defaultAxisRotation(dir, m.axisRotation))
    const { depth, width } = depthWidth(secById.get(m.section))
    // The section's own half-extent measured straight up — the same projection
    // the rigid zone uses, so the two cannot disagree about the geometry.
    const half = (depth / 2) * Math.abs(dot(UP, yp)) + (width / 2) * Math.abs(dot(UP, zp))
    // …less however far the member is DRAWN below its node. For a hanging
    // beam those are equal and the rise is zero, which is the whole point.
    const drop = HANGS_BELOW_NODE.has(m.role) && Math.abs(ni.y - nj.y) <= 1e-6 ? depth / 2 : 0
    return Math.max(0, half - drop)
  }

  const atNode = new Map<string, StructuralModel['members'][number][]>()
  for (const m of model.members) {
    for (const nd of [m.i, m.j]) {
      const list = atNode.get(nd) ?? []
      list.push(m)
      atNode.set(nd, list)
    }
  }

  for (const m of model.members) {
    if (m.role !== 'column') continue
    const ni = nodeById.get(m.i), nj = nodeById.get(m.j)
    if (!ni || !nj) continue
    const top = ni.y >= nj.y ? m.i : m.j          // the upper node of this column
    const others = (atNode.get(top) ?? []).filter((o) => o.id !== m.id)
    if (others.some((o) => o.role === 'column')) continue   // the storey above fills it
    let rise = 0
    for (const o of others) rise = Math.max(rise, riseAbove(o))
    if (rise > 1e-9) out.set(m.id, rise)
  }
  return out
}
