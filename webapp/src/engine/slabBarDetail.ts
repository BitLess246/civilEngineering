// ─────────────────────────────────────────────────────────────────────────
// SLAB BAR ARRANGEMENT — where each mat starts and stops along a strip.
//
// Produces the geometry for a longitudinal SECTION through one span of a
// two-way slab: the top mat over each support, the bottom mat through
// mid-span, and the shrinkage/temperature mat running the other way (seen
// end-on, so it draws as a row of dots).
//
// EXTENSIONS: ACI 318-14 Fig. 8.7.4.1.3(a) / NSCP 2015 Fig. 408.7.4.1.3(a) —
// "minimum extensions for deformed reinforcement in two-way slabs without
// beams". Checked against the printed figure; what it gives is:
//
//                           | WITHOUT drop panels | WITH drop panels
//   ------------------------+---------------------+------------------
//   COLUMN  top, 50%        |      0.30 ln        |     0.33 ln
//   STRIP   top, remainder  |      0.20 ln        |     0.20 ln
//           bottom, 100%    |   CONTINUOUS, 150 mm into the support
//   ------------------------+---------------------+------------------
//   MIDDLE  top, 100%       |      0.22 ln        |     0.22 ln
//   STRIP   bottom, 50%     |   CONTINUOUS, 150 mm into the support
//           bottom, rem.    |   max 0.15 ln from the support centreline
//
// THE COLUMN STRIP HAS NO SHORT BOTTOM RUN. The figure gives its bottom mat
// as 100% continuous, with splices permitted only in the mid-span region and
// at least two bars carried through the column core per §8.7.4.2 (structural
// integrity). An earlier version of this file cut the column-strip bottom
// bars at 0.20 ln from each face — a run that does not exist in the figure,
// and one that would have removed the very bars §8.7.4.2 exists to keep.
// `bottomShort: null` is how "all of them are continuous" is expressed.
//
// The 6 in. embedment in the figure is carried as 150 mm.
//
// The fractions stay an INPUT with a default rather than a constant buried in
// a drawing: they are printed on the drawing next to the clause, so an
// engineer sees exactly what was assumed. A wrong cut-off length that nobody
// can see is the failure mode worth designing against here.
//
// Units: metres for spans, millimetres for the slab and its cover.
// ─────────────────────────────────────────────────────────────────────────

/** Fractions of the clear span ℓn, measured from the FACE of support. */
export interface SlabBarExtensions {
  /** Top mat, the bars that run furthest — at least half of them. */
  topLong: number
  /** Top mat, the remainder. */
  topShort: number
  /**
   * Bottom mat, the remainder that is not carried through the support —
   * a fraction of ln measured from the support CENTRELINE.
   *
   * `null` where the figure gives the bottom mat as 100% continuous, which is
   * the case for the column strip. Not zero: zero would draw a bar that stops
   * exactly at the centreline, which is a different (and wrong) statement.
   *
   * Measured from the CENTRELINE, not the face. The figure dimensions this
   * one from the support centre line, and it is the tighter of the two
   * readings — it carries the bar closer to the support, so a
   * misinterpretation errs toward more steel rather than less.
   */
  bottomShort: number | null
  /** Minimum embedment of a continuous bottom bar into the support, mm. */
  supportEmbed: number
}

/**
 * Flat plate — no beams, NO drop panels. The column strip and middle strip
 * differ in the figure, which is why `slabBarRuns` takes the set to use
 * rather than choosing one.
 */
export const DEFAULT_EXT: Record<'column' | 'middle', SlabBarExtensions> = {
  column: { topLong: 0.30, topShort: 0.20, bottomShort: null, supportEmbed: 150 },
  middle: { topLong: 0.22, topShort: 0.22, bottomShort: 0.15, supportEmbed: 150 },
}

/**
 * Flat slab WITH drop panels. Only one number moves: the column strip's
 * longer top run goes from 0.30 ln to 0.33 ln, because the drop panel pushes
 * the point of inflection further into the span.
 */
export const DROP_PANEL_EXT: Record<'column' | 'middle', SlabBarExtensions> = {
  column: { ...DEFAULT_EXT.column, topLong: 0.33 },
  middle: { ...DEFAULT_EXT.middle },
}

/** One drawn bar run, in metres along the span from the left support centre. */
export interface BarRun {
  /** Which mat it belongs to. */
  mat: 'top' | 'bottom'
  /** Start and end, metres from the left support CENTRELINE. */
  x1: number
  x2: number
  /** What to call it on the drawing. */
  label: string
  /** True when the run continues past the drawn span rather than stopping. */
  continuesLeft: boolean
  continuesRight: boolean
}

export interface SlabBarLayout {
  /** Clear span used, m. */
  ln: number
  /** Support width, m — the span is drawn between support centrelines. */
  support: number
  /** Overall drawn length, support centre to support centre, m. */
  total: number
  runs: BarRun[]
  /** Depth of each mat below the top face, mm. Temperature bars share the mats. */
  topCover: number
  bottomCover: number
}

/**
 * Bar runs for one span of one strip.
 *
 * `l1` is centre-to-centre, `c` the support width, so ℓn = l1 − c and the face
 * of support sits at c/2 from each centreline. Everything is returned in the
 * same coordinate — metres from the left support centre — so the drawing does
 * no arithmetic of its own.
 */
export function slabBarRuns(
  l1: number, c: number, slabH: number, cover: number, ext: SlabBarExtensions,
): SlabBarLayout {
  const support = Math.max(0, c)
  const ln = Math.max(0, l1 - support)
  const face = support / 2
  const right = l1 - face          // right face of support, from left centreline

  const runs: BarRun[] = []

  // ── Top mat: over each support, cut off in the span ────────────────────
  // Drawn as two bands at each end because the figure splits the steel: the
  // longer run carries at least half the bars, the shorter one the rest.
  for (const [frac, label] of [[ext.topLong, `0.${(ext.topLong * 100).toFixed(0)}ℓn`],
                               [ext.topShort, `0.${(ext.topShort * 100).toFixed(0)}ℓn`]] as [number, string][]) {
    runs.push({ mat: 'top', x1: 0, x2: face + frac * ln, label, continuesLeft: true, continuesRight: false })
    runs.push({ mat: 'top', x1: right - frac * ln, x2: l1, label, continuesLeft: false, continuesRight: true })
  }

  // ── Bottom mat ────────────────────────────────────────────────────────
  // Continuous through the support — 100% of the column strip, 50% of the
  // middle strip. These are the bars that stop a mid-span crack becoming a
  // hinge (§8.7.4.2), so they run the whole way with the embedment noted.
  const embed = ext.supportEmbed / 1000
  runs.push({
    mat: 'bottom', x1: face - Math.min(embed, face), x2: right + Math.min(embed, face),
    label: `continuous · ${ext.supportEmbed} mm into support`,
    continuesLeft: false, continuesRight: false,
  })
  // The remainder, where the figure has one. Measured from the support
  // CENTRELINE — see `bottomShort`. The column strip has no such run.
  if (ext.bottomShort !== null) {
    runs.push({
      mat: 'bottom', x1: ext.bottomShort * ln, x2: l1 - ext.bottomShort * ln,
      label: `max 0.${(ext.bottomShort * 100).toFixed(0)}ℓn from support ℄`,
      continuesLeft: false, continuesRight: false,
    })
  }

  return {
    ln, support, total: l1, runs,
    topCover: cover,
    bottomCover: Math.max(0, slabH - cover),
  }
}

/**
 * Shrinkage and temperature steel — ACI 318-14 §24.4.3.2 / NSCP §424.4.3.2.
 *
 * Ratio of gross area: 0.0020 for Grade 280/350 deformed bars, 0.0018 for
 * Grade 420, and 0.0018 × 420/fy for higher grades but never below 0.0014.
 * Returned as area per metre width so it can sit beside the flexural steel.
 */
export function tempSteelArea(slabH: number, fy: number): { rho: number; As: number } {
  const rho = fy <= 350 ? 0.0020
    : fy <= 420 ? 0.0018
    : Math.max(0.0014, (0.0018 * 420) / fy)
  return { rho, As: rho * 1000 * slabH }
}

/**
 * Maximum spacing of shrinkage and temperature bars — §24.4.3.3:
 * the lesser of 5h and 450 mm.
 */
export const tempSpacingMax = (slabH: number): number => Math.min(5 * slabH, 450)
