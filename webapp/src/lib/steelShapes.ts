// ─────────────────────────────────────────────────────────────────────────
// Shape catalogue and grade table for the steel pages. View-support layer.
//
// Split out of `components/steelUi.tsx` because a file that exports both
// components and plain values breaks Fast Refresh — the whole module reloads
// instead of the component, so edits lose page state. The lint rule enforces
// it; this file is the "somewhere else" it asks for.
// ─────────────────────────────────────────────────────────────────────────

import { shapesOf, shapeByName } from '../engine/aiscSections'
import type { AiscShape } from '../engine/aiscSections'

export type Grade = 'A36' | 'A572G50'

export const GRADES: Record<Grade, { Fy: number; Fu: number; label: string }> = {
  A36:     { Fy: 248, Fu: 400, label: 'A36 / SS400  (Fy 248 MPa)' },
  A572G50: { Fy: 345, Fu: 448, label: 'A572 Gr50 / A992  (Fy 345 MPa)' },
}

export const W_SHAPES = shapesOf('W')

/** Never returns undefined: a stale saved name falls back to the first shape
 *  rather than crashing a page on an empty section. */
export function shapeOrFirst(name: string): AiscShape {
  return shapeByName(name) ?? W_SHAPES[0]
}
