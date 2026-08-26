// ─────────────────────────────────────────────────────────────────────────
// LATERAL TIES BEYOND THE PERIMETER HOOP — §425.7.2.3 / §418.7.5.2
//
// The outer tie supports the four corner bars and nothing else. The code's rule
// for the rest is the "every other bar" rule:
//
//   • every corner bar and every ALTERNATE longitudinal bar shall have lateral
//     support from the corner of a tie with an included angle ≤ 135°, and
//   • no bar shall be more than 150 mm CLEAR either side of such a supported
//     bar (§425.7.2.3).
//
// Which extra piece of steel does that depends only on where the bars are:
//
//   DIAMOND   one intermediate bar per face, all four faces — the symmetric
//             8-bar column. A single loop rotated 45° catches all four at once,
//             which is the whole reason the shape exists. It is useless on 10
//             or 12 bars: the diagonals pass between the interior bars.
//   INNER     a face carrying two or more intermediates, mirrored on the
//             opposite face. A small closed rectangle inside the hoop is a
//             rigid 4-legged tie that cannot shift during the pour, which is
//             why it is preferred to a fistful of loose cross ties.
//   CROSS     a single-legged bar, 135° hook one end and 90° the other, tying
//             one intermediate bar to the one opposite it. The least congested
//             way to catch a lone middle bar.
//
// It DESIGNS nothing: bar positions come from `columnCage.perimeterBars`, which
// places what `columnDesign` sized. This decides the tie pattern those bars
// require, and says so when a bar is left unsupported.
//
// Units: plan offsets and bar sizes mm.
// ─────────────────────────────────────────────────────────────────────────

/** §425.7.2.3 — the greatest clear distance from a laterally supported bar. */
export const MAX_CLEAR_TO_SUPPORTED = 150

export type TieKind = 'diamond' | 'inner' | 'cross'

export interface TieShape {
  kind: TieKind
  /** Plan offsets from the column centre, mm — a closed loop for `diamond` and
   *  `inner`, the two ends of the bar for `cross`. */
  corners: [number, number][]
  closed: boolean
}

export interface TieSetResult {
  ties: TieShape[]
  /** Bars the pattern leaves without lateral support, as plan offsets. */
  unsupported: [number, number][]
  notes: string[]
}

const key = (p: [number, number]) => `${Math.round(p[0])},${Math.round(p[1])}`

/**
 * The supplementary ties a bar layout needs, on top of the perimeter hoop.
 *
 * `bars` are plan offsets `[along h, across b]` — `perimeterBars`' own output.
 */
export function supplementaryTies(bars: [number, number][], barDia: number): TieSetResult {
  const notes: string[] = []
  if (bars.length < 4) return { ties: [], unsupported: [], notes }

  const faceX = Math.max(...bars.map(([x]) => Math.abs(x)))
  const faceZ = Math.max(...bars.map(([, z]) => Math.abs(z)))
  const on = (v: number, face: number) => face > 0 && Math.abs(Math.abs(v) - face) < 1e-6

  const corners = bars.filter(([x, z]) => on(x, faceX) && on(z, faceZ))
  // Intermediates, split by which pair of faces they stand on.
  const onXFaces = bars.filter(([x, z]) => on(x, faceX) && !on(z, faceZ))   // vary in z
  const onZFaces = bars.filter(([x, z]) => on(z, faceZ) && !on(x, faceX))   // vary in x
  const zLevels = [...new Set(onXFaces.map(([, z]) => z))].sort((a, b) => a - b)
  const xLevels = [...new Set(onZFaces.map(([x]) => x))].sort((a, b) => a - b)

  const ties: TieShape[] = []

  // ── the 8-bar diamond ────────────────────────────────────────────────────
  // Exactly one intermediate per face, all four faces, and each at mid-face:
  // one rotated loop through those four bars supports every one of them.
  const midOnly = zLevels.length === 1 && xLevels.length === 1
    && Math.abs(zLevels[0]) < 1e-6 && Math.abs(xLevels[0]) < 1e-6
    && onXFaces.length === 2 && onZFaces.length === 2
  if (midOnly) {
    ties.push({
      kind: 'diamond', closed: true,
      corners: [[faceX, 0], [0, faceZ], [-faceX, 0], [0, -faceZ]],
    })
  } else {
    // ── an inner rectangle wherever a FACE PAIR carries two or more ────────
    // Two opposite faces each holding two intermediates make a closed loop
    // through four real bars: a rigid 4-legged tie that cannot shift in the
    // pour, which is why it beats a fistful of loose cross ties. The two
    // directions are judged separately — a 400×600 with three bars up the long
    // faces and one across the short ones gets an inner tie in one direction
    // and cross ties in the other, and requiring both would have got neither.
    const usedInner = new Set<string>()
    if (xLevels.length >= 2) {
      const a = xLevels[0], b = xLevels[xLevels.length - 1]
      const loop: [number, number][] = [[a, -faceZ], [b, -faceZ], [b, faceZ], [a, faceZ]]
      ties.push({ kind: 'inner', closed: true, corners: loop })
      for (const p of loop) usedInner.add(key(p))
    }
    if (zLevels.length >= 2) {
      const a = zLevels[0], b = zLevels[zLevels.length - 1]
      const loop: [number, number][] = [[-faceX, a], [-faceX, b], [faceX, b], [faceX, a]]
      ties.push({ kind: 'inner', closed: true, corners: loop })
      for (const p of loop) usedInner.add(key(p))
    }
    // ── cross ties for whatever the loops did not reach ────────────────────
    for (const z of zLevels) {
      const pair: [[number, number], [number, number]] = [[-faceX, z], [faceX, z]]
      if (pair.every((p) => usedInner.has(key(p)))) continue
      ties.push({ kind: 'cross', closed: false, corners: pair })
    }
    for (const x of xLevels) {
      const pair: [[number, number], [number, number]] = [[x, -faceZ], [x, faceZ]]
      if (pair.every((p) => usedInner.has(key(p)))) continue
      ties.push({ kind: 'cross', closed: false, corners: pair })
    }
  }

  // ── who ended up supported, and does §425.7.2.3 hold ─────────────────────
  const supported = new Set<string>(corners.map(key))
  for (const t of ties) for (const p of t.corners) supported.add(key(p))

  const unsupported = bars.filter((b) => !supported.has(key(b)))
  // The clear-distance rule is measured ALONG the tie, face by face: a bar is
  // allowed to be unsupported only while it is within 150 mm clear of one that
  // is not — which for a bar on a face means its neighbours on that same face.
  const onSameFace = (a: [number, number], b: [number, number]) =>
    (on(a[0], faceX) && on(b[0], faceX) && Math.sign(a[0]) === Math.sign(b[0]))
    || (on(a[1], faceZ) && on(b[1], faceZ) && Math.sign(a[1]) === Math.sign(b[1]))
  const stranded = unsupported.filter((u) => {
    const near = bars.filter((b) => supported.has(key(b)) && onSameFace(u, b))
    if (!near.length) return true
    const clear = Math.min(...near.map((b) => Math.hypot(b[0] - u[0], b[1] - u[1]) - barDia))
    return clear > MAX_CLEAR_TO_SUPPORTED
  })
  if (stranded.length) {
    notes.push(`${stranded.length} longitudinal bar(s) are more than ${MAX_CLEAR_TO_SUPPORTED} mm clear of a laterally supported bar (§425.7.2.3) — add a cross tie`)
  }
  return { ties, unsupported: stranded, notes }
}
