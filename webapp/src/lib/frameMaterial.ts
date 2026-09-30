// ─────────────────────────────────────────────────────────────────────────
// WHICH FRAME MATERIALS THE MODEL SPACE OFFERS.
//
// Steel and timber frames generate, analyse and design, but an end-to-end
// check found gaps that make their output unfit to build from: timber
// pushover/NLTH hinges are computed as reinforced concrete, the plan set is
// RC-only (a W-shape column drawn with 4-⌀20 bars and ties), and a steel
// connection is chosen after an analysis that assumed it rigid. Until those
// close they are withheld from the dropdown rather than offered as working.
//
// A session that ALREADY holds a steel or timber model keeps its option, marked
// as being reworked — hiding it would leave the dropdown naming a material the
// model on screen is not made of, and regenerate the user's frame the moment
// they touched it.
// ─────────────────────────────────────────────────────────────────────────

import type { StructuralModel } from '../engine/model'

export type FrameMaterial = 'concrete' | 'steel' | 'wood'

const LABEL: Record<FrameMaterial, string> = {
  concrete: 'Reinforced concrete',
  steel: 'Structural steel (AISC W)',
  wood: 'Timber (wood frame)',
}

/** Offered to everyone. Add 'steel' / 'wood' back here when their gaps close. */
export const OFFERED_FRAME_MATERIALS: readonly FrameMaterial[] = ['concrete']

export const isOfferedFrameMaterial = (m: FrameMaterial): boolean => OFFERED_FRAME_MATERIALS.includes(m)

/** The Members dropdown: the offered materials, plus the current one if it is
 *  withheld (an existing model), labelled so nobody mistakes it for finished. */
export function frameMaterialOptions(current: FrameMaterial): [FrameMaterial, string][] {
  const opts = OFFERED_FRAME_MATERIALS.map((m): [FrameMaterial, string] => [m, LABEL[m]])
  return isOfferedFrameMaterial(current) ? opts : [...opts, [current, `${LABEL[current]} — being reworked`]]
}

/** Whether any member of the model is made of `m`. */
export function modelIsMadeOf(model: Pick<StructuralModel, 'members' | 'sections'> | null, m: FrameMaterial): boolean {
  if (!model) return false
  const secs = new Set(model.sections.filter((s) => (s.material ?? 'concrete') === m).map((s) => s.id))
  return model.members.some((mem) => secs.has(mem.section))
}
