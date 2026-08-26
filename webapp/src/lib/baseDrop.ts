// ─────────────────────────────────────────────────────────────────────────
// WHERE A COLUMN MEETS ITS PAD
//
// A column does not stop at its base node. The footing's top is the founding
// depth less the pad's own thickness below that node, and the column runs down
// to meet it — the pedestal. Drawn from the node, the column floats above the
// footing it is supposed to stand on.
//
// Only the LOWER end gets the drop. Applied to both, a column would stretch at
// the top as well; applied to the wrong one it would hang in the air. This is
// the whole rule, kept as a pure function of four numbers so it can be tested
// without a scene — and so the caller is handed VALUES to build new vectors
// from, rather than being invited to subtract from the ones it was given.
//
// That last part is the bug this exists to prevent. The scene's node positions
// are memoised on the model, so they outlive a render; the code that used to
// live here subtracted the pedestal from one of them in place, and the supports
// sank another pedestal deeper every time the view re-rendered.
//
// Units: m.
// ─────────────────────────────────────────────────────────────────────────

/** How far below each end's node that end is actually drawn, m. */
export interface EndDrops {
  i: number
  j: number
}

/**
 * The pedestal drop for a column's two ends.
 *
 * `yI`/`yJ` are the two node levels and `pedI`/`pedJ` the pedestal at each of
 * those nodes. The lower end is the one standing on a pad, and it is the only
 * one that moves. A column with both ends at the same level is degenerate; `i`
 * is taken as the base so the answer is at least deterministic.
 */
export function endDrops(yI: number, yJ: number, pedI: number, pedJ: number): EndDrops {
  const baseIsI = yI <= yJ
  const ped = Math.max(0, baseIsI ? pedI : pedJ)
  return { i: baseIsI ? ped : 0, j: baseIsI ? 0 : ped }
}
