// ─────────────────────────────────────────────────────────────────────────
// BEAM AXIS OFFSETS — reconciling the level the drawings use with the line the
// analysis solves on.
//
// A floor level is the TOP of the beams at it: the column below stops there,
// the column above starts there, and the beam hangs under the pair. That is
// what the detailing does — `cageBuilder` hangs every cage off `y − h` and the
// frame elevations draw it — and it is the only convention under which a beam
// does not run up through the column that starts at its own node.
//
// The ANALYSIS still puts the element on the node line, which is the beam's
// CENTROID. So the drawn beam and the analysed beam sat h/2 apart: the same
// member, two different places, and nothing in the model said which was meant.
//
// This is the reconciliation, and it belongs at the bridge (layer 2) rather
// than in the solver. A rigid arm from the node down to the beam's centroid is
// exactly what `MemberOffsets` already models, so folding the drop in here
// means the stiffness, the equivalent nodal loads, the force recovery, P-Δ and
// the buckling analysis all inherit it without any of them knowing.
//
// WHAT IT CHANGES, AND WHAT IT DOES NOT. Both ends drop by the same vector, so
// the beam is TRANSLATED, not stretched: its length is unchanged, the columns'
// node-to-node length is unchanged, and equilibrium is untouched — ΣR is
// identical to the last digit, because a rigid arm carries force without
// consuming any. What changes is that the beam now delivers its end forces to
// the joint through a 0.25 m arm instead of at the node, so the column sees the
// couple of that eccentricity. On the sample two-bay frame the beam moment
// moves 0.4% and the column moment 15%.
//
// That is a real change to the answers, so it is OFF by default at every level
// — an engineer turns it on knowing the numbers move, the same way
// `crackedSections` works.
//
// Units: m throughout.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, RectSection } from './model'

/** The vector from a node to the member end it holds, m, global. */
export type Offset3 = [number, number, number]

/** Roles whose node line is the top of the member rather than its axis. */
const HANGS_BELOW = new Set(['beam', 'girder'])

/**
 * The drop from the node line to the centroid of each horizontal beam, m.
 *
 * Keyed by member id, the same shape `autoRigidOffsets` returns so the bridge
 * can combine the two. Only HORIZONTAL beams and girders get one:
 *
 *   • a column's node line IS its axis — there is nothing to reconcile;
 *   • a sloping member has no single level to hang from, and a drop applied to
 *     one end and not the other would tilt it.
 *
 * The drop is the same at both ends, so the element stays parallel to the line
 * between its nodes: this moves the beam down, it does not rotate it.
 */
export function beamAxisOffsets(model: StructuralModel): Map<string, Offset3> {
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]))
  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const out = new Map<string, Offset3>()
  for (const m of model.members) {
    if (!HANGS_BELOW.has(m.role)) continue
    const ni = nodeById.get(m.i), nj = nodeById.get(m.j)
    if (!ni || !nj || Math.abs(ni.y - nj.y) > 1e-6) continue
    const sec = secById.get(m.section) as RectSection | undefined
    const h = sec?.h ?? sec?.b
    if (!h || h <= 0) continue
    out.set(m.id, [0, -h / 2000, 0])
  }
  return out
}

/**
 * Two offsets at one end, summed — `undefined` where there is nothing.
 *
 * A rigid end zone runs ALONG the member and the beam drop runs DOWN, so they
 * are independent and both apply: taking one and discarding the other would
 * silently drop whichever the caller listed second.
 */
export function addOffsets(a?: Offset3, b?: Offset3): Offset3 | undefined {
  if (!a) return b
  if (!b) return a
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}
