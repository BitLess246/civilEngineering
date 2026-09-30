// ─────────────────────────────────────────────────────────────────────────
// WHICH CONTOUR THE 3D VIEW PAINTS — one at a time.
//
// Member stress, plate stress and the deformed shape were three independent
// checkboxes. Nothing stopped all three being on at once: the deformed shape
// then REPLACED the model while the two stress fields were still painted where
// it had been, and the panel stacked three colour bars on three scales. They
// are alternatives, so the Display tab offers them as a radio group, and this
// module says which of them can be chosen right now and why not.
// ─────────────────────────────────────────────────────────────────────────

export type ContourView = 'none' | 'member' | 'plate' | 'displacement'

export interface ContourContext {
  /** An analysis result exists for the displayed load case. */
  analysed: boolean
  /** The model has shell elements on and at least one plate to mesh. */
  shells: boolean
}

export interface ContourOption {
  key: ContourView
  label: string
  /** Why it cannot be chosen now, or null when it can. */
  blocked: (c: ContourContext) => string | null
}

export const CONTOUR_OPTIONS: readonly ContourOption[] = [
  { key: 'none', label: 'None', blocked: () => null },
  {
    key: 'member', label: 'Beam / column stress',
    blocked: (c) => (c.analysed ? null : 'Analyse the model first — the stresses are the analysed member forces put on the section.'),
  },
  {
    key: 'plate', label: 'Plate stress',
    // Recovered from the analysis when there is one, from an isolated slab
    // solve before it — so only the shells themselves are required.
    blocked: (c) => (c.shells ? null : 'Turn on “Shell elements for slab / wall panels” in the Analysis tab.'),
  },
  {
    key: 'displacement', label: 'Displacement',
    blocked: (c) => (c.analysed ? null : 'Analyse the model first — the shape is the analysed joint displacements.'),
  },
]

/**
 * The contour to actually paint: the chosen one while it can be drawn,
 * otherwise none. Choosing is kept (it comes back when, say, the analysis
 * that a re-design cleared is run again); painting a field with no data is not.
 */
export function effectiveContour(chosen: ContourView, c: ContourContext): ContourView {
  const opt = CONTOUR_OPTIONS.find((o) => o.key === chosen)
  return opt && !opt.blocked(c) ? chosen : 'none'
}
