// ─────────────────────────────────────────────────────────────────────────
// THE SHEET PALETTE
//
// A structural drawing is read in two layers: the STEEL, and everything said
// about it. Six sheets had each declared their own copy of the same colours,
// and the beam elevation had drifted to five inks at once — orange bars, blue
// cranks, tan hoops, cyan laps, purple column steel — with the callouts
// printed in the bar colour on top of that. At a glance nothing led.
//
// So: ONE accent, for reinforcement and nothing else, and dark ink for every
// dimension, callout and note. That is the convention a detailer expects, and
// it is what makes a busy sheet scan.
//
// Secondary steel — hoops, ties, the supporting member's own bars — is drawn
// in a tint of the same accent or in grey, so the bars this sheet is ABOUT
// read first without introducing another colour.
// ─────────────────────────────────────────────────────────────────────────

/** Linework and primary text. */
export const SHEET_INK = '#1e293b'
/** Secondary text — notes, leader labels, dimension text. */
export const SHEET_NOTE = '#475569'
/** Extension lines, hatch, section outlines — behind everything. */
export const SHEET_GRID = '#9aa5b5'
/** The one accent: reinforcement. */
export const STEEL = '#1d4ed8'
/** Transverse steel, and steel shown for context — the same accent, stepped
 *  back so the bars the sheet is about read first. */
export const STEEL_LIGHT = '#93b4f5'
/** Steel belonging to a DIFFERENT member, shown for context — the supporting
 *  column's own bars on a beam sheet. Grey, so it never reads as this member's
 *  steel, but darker than the grid so it does not read as an extension line. */
export const STEEL_CONTEXT = '#64748b'
/** A zone the sheet wants to name — a confinement band, a panel. */
export const SHEET_ZONE = '#0f766e'
/** Something the design flagged. */
export const SHEET_WARN = '#b91c1c'
