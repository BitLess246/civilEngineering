import type { RebarLayout } from '../engine/rebarScore'

// How a layout is written on a drawing. A cage is counted; a mat is spaced —
// "4⌀20" and "⌀16 @ 125" are the same kind of fact stated the way each trade
// reads it. Kept out of the component so fast refresh stays happy.

/** "4⌀20" — beams and columns count bars. */
export const nameCage = (l: RebarLayout): string => `${l.bars}⌀${l.db}`

/** "⌀16 @ 125" — mats are specified by spacing. */
export const nameMat = (l: RebarLayout): string => `⌀${l.db} @ ${l.spacing.toFixed(0)}`
