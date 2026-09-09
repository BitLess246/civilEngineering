// ─────────────────────────────────────────────────────────────────────────
// STACKING TENSION BARS INTO LAYERS — one rule, one home.
//
// Lifted out of `beamDesign.ts` when the T-beam engine turned out to have its
// own greedy loop with no pairing, so a T-beam could be detailed with a single
// bar sitting alone in its top layer. The rectangular-beam page had never
// drawn one; the T-beam page had, since it shipped.
//
// THE DETAILING RULE. No layer carries a single bar. A lone bar in the upper
// (least-full) layer has nothing to tie to on either side, so it is paired
// with a second and the two sit beside the stirrup legs. Pairing ADDS a bar,
// which is conservative on As — the section ends up with slightly more steel
// than the strength calculation demanded, never less.
// ─────────────────────────────────────────────────────────────────────────

export interface BarLayers {
  /** Total bars after any pairing bump — use THIS for As provided, not the
   *  count that went in, or the section is reported with steel it does not have. */
  bars: number
  /** Bars per layer, extreme (bottom) layer first. */
  layers: number[]
}

/**
 * Split `n` bars into layers of at most `maxPerLayer`, fullest at the bottom.
 *
 * `maxPerLayer < 2` means the web cannot hold two bars side by side at all;
 * pairing is then meaningless and the stack is left as it comes out, because
 * the honest answer is that the section is too narrow, not that it needs
 * another bar.
 */
export function splitLayers(n: number, maxPerLayer: number): BarLayers {
  // THE LOOP HAS TO TERMINATE ON ANY INPUT, and it did not.
  //
  // `left -= Math.min(left, maxPerLayer)` subtracts NOTHING when maxPerLayer
  // is 0 (and grows `left` when it is negative), and subtracting a finite
  // step from an infinite count never reaches zero — so the while loop pushed
  // until the array hit its engine limit: measured at 12.8 s of allocation
  // followed by `RangeError: Invalid array length`. In a browser that is a
  // frozen tab, not an exception.
  //
  // Both inputs are reachable from an ordinary typo. `n` is As/Ab, so a bar
  // diameter of 0 — one keystroke in the bar-Ø field — makes it Infinity;
  // `maxPerLayer` is a floor() of the room left across the web, which goes to
  // 0 on a section too narrow for a bar, the very case this function's own
  // docstring describes.
  //
  // Neither is clamped into a pretend answer: a non-finite count has no
  // layout and returns an empty one, and a web that cannot hold a bar is
  // detailed one bar per layer, which is what `maxPerLayer < 2` already means
  // to every caller. The caller's own `maxPerLayer`/`jointFit` reporting is
  // what tells the user the section is too narrow — that is not this
  // function's job, and inventing a layout here would hide it.
  if (!Number.isFinite(n)) return { bars: 0, layers: [] }
  let total = Math.max(0, Math.ceil(n))
  const perLayer = Number.isFinite(maxPerLayer) ? Math.max(1, Math.floor(maxPerLayer)) : total
  const build = (m: number): number[] => {
    const out: number[] = []
    let left = m
    while (left > 0) { const take = Math.min(left, perLayer); out.push(take); left -= take }
    return out
  }
  let layers = build(total)
  if (perLayer >= 2 && layers.length > 1 && layers[layers.length - 1] === 1) {
    total += 1
    layers = build(total)
  }
  return { bars: total, layers }
}

/**
 * Centroid rise of the bar group above the extreme (bottom) layer — Varignon.
 *
 * `pitch` is the layer-to-layer centre distance, db + 25 mm clear per
 * ACI 318-14 §25.2.2 / NSCP §425.2.2. The result is subtracted from dt to give
 * the effective depth of the group, so stacking layers always REDUCES d.
 */
export function centroidRise(layers: number[], pitch: number): number {
  const n = layers.reduce((s, k) => s + k, 0)
  const sum = layers.reduce((s, k, i) => s + k * i * pitch, 0)
  return n > 0 ? sum / n : 0
}

/**
 * How far off the beam's centreline a longitudinal bar may sit, mm, if it is
 * to pass the supporting column's own verticals — `BeamCageInput.maxBarOffset`.
 *
 * The column's outer bar stands `cover + tie + Ø/2` in from its face and runs
 * the full height, so in plan it is a POINT the beam's bar line would run
 * straight through. The beam's bar therefore steps inside it, by half of each
 * diameter — the two just touching, which is the geometric minimum.
 *
 * `face` is the column dimension ACROSS the beam: `columnCage` reads h across
 * world x and b across world z, so a beam running along x is bounded by the
 * column's b and one running along z by its h. Taking the narrow face either
 * way pulled a z-running beam's bars 100 mm too far in.
 *
 * Shared, because two layers need the same number and used to derive it once
 * each: the CAGE cranks the bars to it at each joint, and the DESIGN has to lay
 * them out in the width it leaves — otherwise the schedule checks §407.7.1
 * across a web the bars are not allowed to use, and passes a spacing the cage
 * cannot build. Cranking buys the SPAN its width back; the layer still has to
 * fit through the joint, so this is still the width the layout is set in.
 */
export function jointBarRoom(
  face: number, colCover: number, colTieDia: number, colBarDia: number, beamBarDia: number,
): number {
  const colBarOffset = face / 2 - (colCover + colTieDia + colBarDia / 2)
  return Math.max(0, colBarOffset - (colBarDia + beamBarDia) / 2)
}

/**
 * The clear width a layer of bars may actually occupy, mm.
 *
 * Nominally `b − 2(cover + ds)`, the gap between the stirrup legs. Where the
 * joint is tighter than the beam, `room` (`jointBarRoom`) is the binding
 * constraint instead and the band is `2·room + db`, measured the same way —
 * outside face of one extreme bar to the outside face of the other — so the
 * two are directly comparable and the smaller governs.
 */
export function barLayoutWidth(
  b: number, cover: number, stirrupDia: number, barDia: number, room?: number,
): number {
  const nominal = b - 2 * (cover + stirrupDia)
  return room == null ? nominal : Math.min(nominal, 2 * room + barDia)
}
