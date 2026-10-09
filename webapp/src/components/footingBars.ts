// ─────────────────────────────────────────────────────────────────────────
// WHERE A FOOTING'S MAT BARS ACTUALLY SIT.
//
// The footing sheet quotes the mat as "N ⌀db @ s mm c/c" — a count and a
// spacing — and until now the plan and section drew none of it. Drawing the
// bars back from those two numbers is a placement problem with one invariant:
// the outermost bars stay inside the cover line.
//
// Two upstream paths produce the pair (n, s), and they tile differently:
//   · the design path (`matLayout`) splits the run exactly — the outermost
//     bar centres land at cover + db/2 from each face, spacing = run/(n−1);
//   · the optimizer path adopts a spacing MODULE (`barsAt`: n = ⌊run/s⌋ + 1),
//     so (n−1)·s is shorter than the run and the group sits symmetrically
//     inside the cover line.
// One centred spread serves both: inset = (B − (n−1)·s)/2 is exactly
// cover + db/2 when the spacing tiles, and safely larger when it doesn't.
//
// For a rectangular footing the short-direction bars are NOT uniform —
// §13.3.3.3 concentrates a fraction of them in a central band (width = the
// short side, centred on the column) and spreads the rest over the two
// overhangs. `bandBarCentres` places the three groups, with a small seam
// shoulder where the groups meet so no two bars land on the same spot.
//
// Units: plan dimensions m, bars/cover/spacing mm. Positions are metres from
// the edge the bars start from, ready for the caller's own scale.
// ─────────────────────────────────────────────────────────────────────────

export interface MatSpec {
  /** Number of bars the schedule quotes. */
  bars: number
  /** Bar Ø, mm. */
  db: number
  /** Centre-to-centre spacing, mm. */
  spacing: number
}

/** Half the outer-bar-centre inset the code's own rule gives, mm. */
export function matEdgeInset(cover: number, db: number): number {
  return cover + db / 2
}

/**
 * Bar centres across a pad of width `B` (m): even spread, symmetric, the
 * outermost centres never inside the cover line. Metres from one edge.
 */
export function barCentres(B: number, cover: number, spec: MatSpec): number[] {
  const n = Math.max(2, Math.round(spec.bars))
  const s = spec.spacing / 1000
  const total = (n - 1) * s
  const inset = Math.max(matEdgeInset(cover, spec.db) / 1000, (B - total) / 2)
  return Array.from({ length: n }, (_, i) => inset + i * s)
}

export interface BandSpec extends MatSpec {
  /** Bars that §13.3.3.3 keeps in the central band. */
  bandBars: number
  /** Band width (the footing's short side), mm. */
  bandWidth: number
  /** Band centre, metres from the pad edge the bars run from. */
  bandCentre: number
}

/** Evenly place `k` centres across [a, b] (m); a degenerate run collapses. */
function group(k: number, a: number, b: number): number[] {
  if (k <= 0 || b - a <= 1e-9) return []
  if (k === 1) return [(a + b) / 2]
  return Array.from({ length: k }, (_, i) => a + ((b - a) * i) / (k - 1))
}

/**
 * Short-direction centres with the §13.3.3.3 band: `bandBars` across the
 * band, the rest split between the overhangs (an overhang with no room
 * hands its bars to the other one; none at all folds everything into the
 * band). Groups are separated by a 5 mm seam shoulder so the boundary bars
 * of adjacent groups never coincide. Metres from the pad edge.
 */
export function bandBarCentres(B: number, cover: number, spec: BandSpec): {
  band: number[]; left: number[]; right: number[]
} {
  const e = matEdgeInset(cover, spec.db) / 1000
  const lo = e
  const hi = B - e
  const halfW = spec.bandWidth / 2000
  const bL = Math.max(lo, spec.bandCentre - halfW)
  const bR = Math.min(hi, spec.bandCentre + halfW)
  const SEAM = 0.005
  const n = Math.max(2, Math.round(spec.bars))
  const nBand = Math.min(n, Math.max(2, Math.round(spec.bandBars)))
  const band = group(nBand, bL + SEAM, bR - SEAM)
  const nOver = Math.max(0, n - nBand)
  let nL = Math.ceil(nOver / 2)
  let nR = nOver - nL
  const hasL = bL - lo > SEAM
  const hasR = hi - bR > SEAM
  if (!hasL && hasR) { nR += nL; nL = 0 }
  else if (!hasR && hasL) { nL += nR; nR = 0 }
  else if (!hasL && !hasR) {
    // The band reaches both cover lines — it IS the mat.
    return { band: group(n, lo + SEAM, hi - SEAM), left: [], right: [] }
  }
  return { band, left: group(nL, lo, bL - SEAM), right: group(nR, bR + SEAM, hi) }
}

/**
 * Which of the centres the DRAWING shows. A dense mat (a bar every few
 * pixels) is sampled on a stride but always keeps the two edge bars — the
 * eye needs the extent, the callout carries the true count and spacing.
 */
export function sampleForDraw(centres: number[], minGap: number): number[] {
  if (centres.length <= 2) return [...centres]
  const gap = centres[1] - centres[0]
  const stride = Math.max(1, Math.ceil(minGap / Math.max(gap, 1e-9)))
  if (stride === 1) return [...centres]
  const out = centres.filter((_, i) => i % stride === 0)
  const last = centres[centres.length - 1]
  if (out[out.length - 1] !== last) {
    // the edge bar is the extent — it wins; a sampled bar that landed
    // inside the floor of it steps aside rather than doubling up
    if (out.length > 1 && last - out[out.length - 1] < minGap) out.pop()
    out.push(last)
  }
  return out
}

/**
 * The two mat levels in a section cut along the pad's long side, mm up from
 * the pad's bottom face: the bars running in the cut's own direction lie on
 * the cover, the cross bars rest ON them, one diameter higher — the layering
 * `footingCage` builds and `matLayout` designs to.
 */
export function matSectionLevels(db: number, cover: number): { longY: number; shortY: number } {
  return { longY: cover + db / 2, shortY: cover + (3 * db) / 2 }
}
