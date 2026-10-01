// ─────────────────────────────────────────────────────────────────────────
// Where a beam-end connection sits vertically, m — shared by the 3D joint
// hardware and its test.
//
// A floor level is the TOP of the beams framing into it: the scene hangs a
// level beam `levelDrop` (= d/2) below its node line, so its web centre is at
// node − d/2 and its flanges at node − tf/2 and node − d + tf/2. The joint
// hardware used to centre on the node itself and guess the depth as
// "tab height + 160 mm", so every plate, bolt, flange weld and continuity plate
// floated half a beam above the steel it connects. Everything here comes from
// the supported beam's own shape and the same drop the member is drawn with.
// ─────────────────────────────────────────────────────────────────────────
import type { AiscShape } from '../engine/aiscSections'

export interface ConnectionLevels {
  /** Web centre — where the tab plate and its bolt group are centred. */
  yc: number
  /** Centre of the top and bottom flange — CJP beads, extension and continuity plates. */
  yTopFlange: number
  yBotFlange: number
  /** The beam's own section, m. */
  d: number; tf: number; bf: number; tw: number
}

/** `drop` is the member's `levelDrop` (d/2 for a level beam, 0 for a sloping one). */
export function connectionLevels(nodeY: number, beam: AiscShape | undefined, drop: number, fallbackDmm = 300): ConnectionLevels {
  const MM = 1 / 1000
  const d = (beam?.d ?? fallbackDmm) * MM, tf = (beam?.tf ?? 10) * MM
  const bf = (beam?.bf ?? 150) * MM, tw = (beam?.tw ?? 8) * MM
  const yc = nodeY - drop
  return { yc, yTopFlange: yc + d / 2 - tf / 2, yBotFlange: yc - d / 2 + tf / 2, d, tf, bf, tw }
}
