// ─────────────────────────────────────────────────────────────────────────
// TIMBER SIZES THAT CAN BE BOUGHT — the stock sawn sizes a Philippine lumber
// yard carries, and the glulam a member moves to once no stocked size will do.
//
// The optimizer used to grow a timber member the way it grows a concrete one,
// 50 mm at a time up to the cast-in-place cap: a 1000-deep "timber" girder is
// a size nobody sells. Here a sawn member only ever takes a size from
// `SAWN_STOCK`, and past the largest one it becomes glulam — laminated in
// 38 mm lams on the standard widths — which is how a timber frame actually
// gets a bigger member.
//
// Sizes are NOMINAL in millimetres (2" = 50 mm, the trade convention for
// rough-sawn Philippine lumber), b ≤ d. Pure; units mm.
// ─────────────────────────────────────────────────────────────────────────
import type { RectSection } from './model'
import { WOOD_SPECIES } from './woodDesign'

/** Stocked rough-sawn sizes [b, d], mm — 2×3 through 12×12. */
export const SAWN_STOCK: readonly (readonly [number, number])[] = [
  [50, 75], [50, 100], [50, 150], [50, 200], [50, 250], [50, 300],
  [75, 75], [75, 100], [75, 150], [75, 200],
  [100, 100], [100, 150], [100, 200], [100, 250], [100, 300],
  [150, 150], [150, 200], [150, 250], [150, 300],
  [200, 200], [200, 250], [200, 300],
  [250, 250], [250, 300],
  [300, 300],
]

/**
 * The longest sawn piece a yard stocks, m — 20 ft. A sawn member longer than
 * this has to be spliced (a connection nobody designed) or made glulam, which
 * is laminated to any length; the design flags it and the optimizer starts it
 * on glulam.
 */
export const SAWN_MAX_LENGTH = 6.1

/** Does a member of this kind and length, m, come in one stocked piece? */
export const withinStockLength = (kind: string | undefined, L: number): boolean =>
  kind === 'glulam' || L <= SAWN_MAX_LENGTH + 1e-9

/** Glulam: standard widths (3⅛" … 10¾") and the 38 mm (1½") lamination. */
export const GLULAM_WIDTHS: readonly number[] = [80, 130, 175, 220, 275]
export const GLULAM_LAM = 38
/** The glulam grade a member moves to — 24F-1.8E (24F-V4) Douglas Fir. */
export const GLULAM_ID = 'GLULAM-24F'

/** The default timber member sizes for a new frame: 6×6 posts, 4×12 girders,
 *  4×10 beams — all stocked, and a 3–4 m storey's worth of post. */
export const TIMBER_DEFAULT_SIZES = {
  column: [150, 150], girder: [100, 300], beam: [100, 250],
} as const satisfies Record<string, readonly [number, number]>

/**
 * A light superimposed dead load for a timber floor, kPa — what sits on a
 * deck that is not the deck: 22 mm hardwood finish 0.19, ½" gypsum ceiling
 * 0.10, services 0.20 and light timber-stud partitions 0.50 (NSCP Table 204-1
 * component weights). The RC default (4.8 kPa: screed, tiles, CHB partitions)
 * on a timber deck sized every joist for a floor it does not carry.
 */
export const TIMBER_FLOOR_SDL = 1.0

const isFlexural = (role: string) => role !== 'column'
const modulus = (b: number, d: number) => (b * d * d) / 6
const minorI = (b: number, d: number) => (Math.min(b, d) ** 3 * Math.max(b, d)) / 12

/** Is this exact b×d (either way round) a stocked sawn size? */
export const isStockSawn = (b: number, d: number): boolean =>
  SAWN_STOCK.some(([sb, sd]) => (sb === b && sd === d) || (sb === d && sd === b))

/** Does a candidate b×d carry `util` times what the current section does? A
 *  flexural member is judged by S (bending governs); a post by area AND its
 *  least-axis I (crushing and buckling). */
function carries(role: string, cur: [number, number], cand: [number, number], util: number): boolean {
  const [b, d] = cur, [cb, cd] = cand
  if (isFlexural(role)) return modulus(cb, cd) >= util * modulus(b, d) - 1e-6 && cd >= d
  return cb * cd >= util * b * d - 1e-6 && minorI(cb, cd) >= util * minorI(b, d) - 1e-6
}

/** A post stays squarish (d ≤ 2b); a beam keeps d/b ≤ 6 (NDS §4.4.1 bracing
 *  rules beyond that). */
const fitsRole = (role: string, b: number, d: number) =>
  isFlexural(role) ? d / b <= 6 : d / b <= 2

/** The cheapest (least-area) stocked size that carries `util` × the current
 *  section — strictly bigger, or at least as big. */
function cheapestSawn(role: string, cur: [number, number], util: number, bigger: boolean): [number, number] | null {
  const fit = SAWN_STOCK
    .filter(([b, d]) => fitsRole(role, b, d) && (bigger ? b * d > cur[0] * cur[1] : true) && carries(role, cur, [b, d], util))
    .sort((p, q) => p[0] * p[1] - q[0] * q[1] || q[1] - p[1])
  return fit[0] ? [fit[0][0], fit[0][1]] : null
}

/** The same member as glulam carrying at least what it does now — for a
 *  sawn member too long to buy in one piece. */
export function toGlulam(s: RectSection, role: string): RectSection {
  if (s.material !== 'wood' || s.woodKind === 'glulam') return s
  return nextTimberSize({ ...s, woodKind: 'glulam' }, 1 + 1e-6, role)
}

/**
 * A sawn size somebody typed in that no yard stocks (a 300×400 timber girder,
 * say) → the cheapest stocked size that carries at least as much, or glulam
 * past the top of stock. Stocked sizes and glulam come back unchanged.
 */
export function toStockSize(s: RectSection, role: string): RectSection {
  if (s.material !== 'wood' || s.woodKind === 'glulam' || isStockSawn(s.b, s.h)) return s
  const cur: [number, number] = [Math.min(s.b, s.h), Math.max(s.b, s.h)]
  const fit = cheapestSawn(role, cur, 1, false)
  return fit ? { ...s, b: fit[0], h: fit[1], name: `${fit[0]}×${fit[1]}` } : nextTimberSize({ ...s, woodKind: 'glulam' }, 1 + 1e-6, role)
}

/** The section as glulam b×d, its grade's reference values travelling with it. */
function asGlulam(s: RectSection, b: number, d: number): RectSection {
  const g = WOOD_SPECIES[GLULAM_ID]
  return {
    ...s, b, h: d, name: `${b}×${d}`,
    woodKind: 'glulam', woodSpecies: GLULAM_ID, woodGrade: g?.grade, woodRef: g?.ref,
  }
}

const lams = (d: number) => Math.max(4, Math.ceil(d / GLULAM_LAM - 1e-9)) * GLULAM_LAM

/**
 * The next size up for a timber member whose governing ratio is `util` (> 1):
 * the cheapest stocked sawn size (least area) that carries `util` times the
 * current one, or — past the top of stock — the glulam that does. A glulam
 * member grows in whole lams, stepping to the next standard width once it is
 * seven times deeper than wide. Returns the section unchanged at util ≤ 1.
 */
export function nextTimberSize(s: RectSection, util: number, role: string): RectSection {
  if (util <= 1 + 1e-9) return s
  const cur: [number, number] = [Math.min(s.b, s.h), Math.max(s.b, s.h)]
  const flex = isFlexural(role)
  if (s.woodKind !== 'glulam') {
    const fit = cheapestSawn(role, cur, util, true)
    if (fit) return { ...s, b: fit[0], h: fit[1], name: `${fit[0]}×${fit[1]}` }
  }
  // glulam — a beam keeps its width and adds lams; a post squares up
  if (flex) {
    const b = GLULAM_WIDTHS.find((w) => w >= cur[0]) ?? GLULAM_WIDTHS[GLULAM_WIDTHS.length - 1]!
    const S = util * modulus(cur[0], cur[1])
    let d = lams(Math.max(cur[1] + 1, Math.sqrt((6 * S) / b)))
    let w = b
    while (d > 7 * w && GLULAM_WIDTHS.some((x) => x > w)) {
      w = GLULAM_WIDTHS.find((x) => x > w)!
      d = lams(Math.max(cur[1] * 0.75, Math.sqrt((6 * S) / w)))
    }
    return asGlulam(s, w, d)
  }
  // a post: the narrowest width whose squarish section (d ≤ 2w) carries it
  const A = util * cur[0] * cur[1]
  for (const w of GLULAM_WIDTHS) {
    const d = lams(Math.max(w, A / w))
    if (d <= 2 * w && carries(role, cur, [w, d], util)) return asGlulam(s, w, d)
  }
  const w = GLULAM_WIDTHS[GLULAM_WIDTHS.length - 1]!
  return asGlulam(s, w, lams(2 * w))
}

/**
 * The next size DOWN, for the optimizer's trim: the largest stocked sawn size
 * smaller (by area) that keeps the member's role proportions, or a glulam one
 * lam shallower. Null where there is nothing smaller to try. The caller
 * re-designs the trial and keeps it only if it passes, so this need not
 * predict capacity — it only has to stay inside what can be bought.
 */
export function lighterTimberSize(s: RectSection, role: string): RectSection | null {
  const [b0, d0] = [Math.min(s.b, s.h), Math.max(s.b, s.h)]
  if (s.woodKind === 'glulam') {
    const d = d0 - GLULAM_LAM
    return d >= 4 * GLULAM_LAM && d >= b0 ? asGlulam(s, b0, d) : null
  }
  const flex = isFlexural(role)
  const down = SAWN_STOCK
    .filter(([b, d]) => fitsRole(role, b, d) && b * d < b0 * d0 && (flex ? d <= d0 && b <= b0 : true))
    .sort((p, q) => q[0] * q[1] - p[0] * p[1] || q[1] - p[1])
  const pick = down[0]
  return pick ? { ...s, b: pick[0], h: pick[1], name: `${pick[0]}×${pick[1]}` } : null
}
