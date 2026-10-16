// Load colours by NSCP category — one palette for the 3D load diagrams and the
// 2D beam elevations, so a live load is the same green on both. Kept free of
// three.js so a 2D sketch can import it without pulling in the 3D bundle.
import type { LoadCategory } from '../engine/beamAnalysis'

export const LOAD_COLOR: Record<string, string> = {
  D: '#64748b', L: '#15803d', Lr: '#15803d', S: '#0891b2', R: '#0891b2', W: '#0ea5e9', E: '#7c3aed',
}

/** What each category is, for a legend. */
export const LOAD_NAME: Record<LoadCategory, string> = {
  D: 'dead', L: 'live', Lr: 'roof live', S: 'snow', R: 'rain', W: 'wind', E: 'seismic', T: 'thermal',
}

/** A category's colour; anything without one draws in the old load red. */
export const loadColor = (cat: string): string => LOAD_COLOR[cat] ?? '#dc2626'
