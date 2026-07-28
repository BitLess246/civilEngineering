// ─────────────────────────────────────────────────────────────────────────
// Dash-pattern geometry for viewport overlays (pure, no THREE / no React).
//
// Used to draw a member as a broken line — e.g. a tension/compression-only
// member that DROPPED OUT of a load combination's active set. The maths lives
// here so it can be unit-tested; the component only lerps along the axis.
//
// Units: lengths m.
// ─────────────────────────────────────────────────────────────────────────

export interface DashOpts {
  /** Preferred dash+gap pitch, m (default 0.2). */
  pitch?: number
  /** Minimum number of dash+gap cells, so short members still read as dashed. */
  minCells?: number
  /** Fraction of a cell that is drawn (default 0.75 ⇒ 25% gap). */
  fill?: number
}

export interface DashPattern {
  /** Mid-point parameters t ∈ (0,1) of each drawn dash, i→j along the member. */
  t: number[]
  /** Length of one dash, m. */
  dash: number
  /** Number of cells the member was divided into (always odd). */
  cells: number
}

/**
 * Split a member of length `len` into an ODD number of equal cells and draw
 * every other one, starting and ending with a dash — so both ends of the
 * member are marked and the pattern is symmetric about mid-span.
 *
 * Returns an empty pattern for a degenerate (zero-length) member.
 */
export function dashSpans(len: number, opts: DashOpts = {}): DashPattern {
  if (!(len > 1e-6)) return { t: [], dash: 0, cells: 0 }
  const pitch = opts.pitch ?? 0.2
  const minCells = opts.minCells ?? 6
  const fill = opts.fill ?? 0.75
  // odd cell count ⇒ cells 0 and n−1 are both drawn (a dash at each end)
  const cells = Math.max(minCells, Math.round(len / pitch)) | 1
  const t: number[] = []
  for (let k = 0; k < cells; k += 2) t.push((k + 0.5) / cells)
  return { t, dash: (fill * len) / cells, cells }
}
