// ─────────────────────────────────────────────────────────────────────────
// WHICH FRAME MATERIALS THE MODEL SPACE OFFERS, AND WHAT A SWITCH SETS.
//
// Steel and timber were withheld from the dropdown (#824) while an
// end-to-end check's gaps closed: timber hinges computed as RC (#825), steel
// connections chosen after an analysis that assumed them rigid (#826), an
// RC-only plan set (#827, #828), no Philippine species (#829), columns
// standing on nothing (#830, #831), and an optimizer that grew timber to sizes
// nobody sells (#833). All three are offered again.
//
// The withholding mechanism stays: a material taken out of
// `OFFERED_FRAME_MATERIALS` keeps an existing model its own option, marked as
// being reworked, rather than regenerating the user's frame under them.
// ─────────────────────────────────────────────────────────────────────────

import type { StructuralModel } from '../engine/model'
import { TIMBER_DEFAULT_SIZES, TIMBER_FLOOR_SDL } from '../engine/timberStock'

export type FrameMaterial = 'concrete' | 'steel' | 'wood'

const LABEL: Record<FrameMaterial, string> = {
  concrete: 'Reinforced concrete',
  steel: 'Structural steel (AISC W)',
  wood: 'Timber (wood frame)',
}

/** Offered to everyone. Remove one here to withhold it again. */
export const OFFERED_FRAME_MATERIALS: readonly FrameMaterial[] = ['concrete', 'steel', 'wood']

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

/** The member-size fields (b × h, mm) and floor SDL (kPa) of the generator form. */
export interface FrameFormDefaults {
  col: readonly [number, number]
  gir: readonly [number, number]
  bea: readonly [number, number]
  qD: number
}

/**
 * What each material starts a frame with. Steel members take their size from
 * the chosen W-shapes, and its slabs are RC, so it shares concrete's fields;
 * timber starts on stocked sizes (6×6 posts, 4×12 girders, 4×10 beams) under
 * the light timber-floor SDL instead of RC's screed-tile-and-CHB 4.8 kPa.
 */
export const FRAME_FORM_DEFAULTS: Record<'concrete' | 'wood', FrameFormDefaults> = {
  concrete: { col: [400, 400], gir: [300, 500], bea: [250, 450], qD: 4.8 },
  wood: { col: TIMBER_DEFAULT_SIZES.column, gir: TIMBER_DEFAULT_SIZES.girder, bea: TIMBER_DEFAULT_SIZES.beam, qD: TIMBER_FLOOR_SDL },
}
const defaultsOf = (m: FrameMaterial) => FRAME_FORM_DEFAULTS[m === 'wood' ? 'wood' : 'concrete']

/**
 * The form after a material switch: every field still at the OLD material's
 * default moves to the new material's, and anything the user typed stays. A
 * 400×400 RC column becoming a 400×400 timber post is the failure this
 * prevents; a user's deliberate 200×200 post surviving the switch is the
 * thing it must not break.
 */
export function switchFrameDefaults(from: FrameMaterial, to: FrameMaterial, cur: FrameFormDefaults): FrameFormDefaults {
  const a = defaultsOf(from), b = defaultsOf(to)
  const pick = (k: 'col' | 'gir' | 'bea') =>
    cur[k][0] === a[k][0] && cur[k][1] === a[k][1] ? b[k] : cur[k]
  return { col: pick('col'), gir: pick('gir'), bea: pick('bea'), qD: cur.qD === a.qD ? b.qD : cur.qD }
}

/** The timber a new frame is cut from: Apitong (Dipterocarpus spp.), 80%
 *  stress grade, NSCP Table 615.2-1 — the commonest structural lumber in the
 *  Philippines. Replaces the NDS Douglas Fir-Larch No.2 the form used to start
 *  on, but only where the user has not picked a species of their own. */
export const DEFAULT_PH_WOOD = { species: 'PH-APITONG', grade: '80' } as const
const LEGACY_WOOD_DEFAULT = { species: 'DFL', grade: '2' } as const

export function switchWoodDefault(species: string, grade: string): { species: string; grade: string } {
  return species === LEGACY_WOOD_DEFAULT.species && grade === LEGACY_WOOD_DEFAULT.grade
    ? { ...DEFAULT_PH_WOOD } : { species, grade }
}
