// ─────────────────────────────────────────────────────────────────────────
// A MEMBER'S LOCAL FRAME FOR DRAWING — the solver's, not a second opinion.
//
// The 3D view oriented members with a shortest-arc rotation from the box's x
// onto the member axis. That agrees with the solver's `localAxes` only for
// plumb columns and level beams: lean a column toward Z and the box rolled
// about its own axis, and an explicit `axisRotation` on a concrete member was
// not drawn at all. Both renderers now take the same [x′, y′, z′] the stiffness
// matrix was built in, so the depth on screen is the depth analysed.
// ─────────────────────────────────────────────────────────────────────────
import { localAxes, defaultAxisRotation, type V3 } from '../engine/frame3d'

/** [x′, y′, z′] for a member from a to b: x′ along it, y′ along the section
 *  depth h, z′ along the width b. */
export function memberFrame(a: V3, b: V3, role: string, axisRotation?: number): [V3, V3, V3] {
  const dir: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  return localAxes(dir, defaultAxisRotation(dir, axisRotation, role))
}

/** Column-major 3×3 rotation taking the drawing's own axes onto the frame:
 *  `box` — a box whose x is its length, y its depth, z its width;
 *  `extrusion` — a profile drawn in XY (Y = depth) extruded along +Z. */
export function frameBasis(f: [V3, V3, V3], kind: 'box' | 'extrusion'): [V3, V3, V3] {
  const [xp, yp, zp] = f
  return kind === 'box' ? [xp, yp, zp] : [[-zp[0], -zp[1], -zp[2]], yp, xp]
}
