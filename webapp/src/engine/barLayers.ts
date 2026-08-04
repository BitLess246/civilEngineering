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
  let total = Math.max(0, Math.ceil(n))
  const build = (m: number): number[] => {
    const out: number[] = []
    let left = m
    while (left > 0) { const take = Math.min(left, maxPerLayer); out.push(take); left -= take }
    return out
  }
  let layers = build(total)
  if (maxPerLayer >= 2 && layers.length > 1 && layers[layers.length - 1] === 1) {
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
