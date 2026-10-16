// ─────────────────────────────────────────────────────────────────────────
// One-way shear in a footing, in three dimensions — the pad split at d.
//
// The section is a vertical plane across the full width B, d from the column
// face; Vc acts on B·d of it (§422.5.5.1), and Vu is the soil pressure on the
// strip beyond it, B·aᵥ (§413.2.7.2 — the section at d for a footing). Drawn
// with that strip pulled clear, the plane is a face and the strip is a block.
//
// World for `lib/isometric`: x along L (the shear direction), y along B, z up
// from the underside, mm, the column centred on the origin.
// ─────────────────────────────────────────────────────────────────────────
import type { Vec3 } from './isometric'
import type { FootingShearInput } from './codes/types'

export interface FootingShearIso {
  /** The pad up to the section, and the column on it. */
  pad: { lo: Vec3; hi: Vec3 }
  column: { lo: Vec3; hi: Vec3 }
  /** The loaded strip beyond the section, pulled clear along +x; null when the section is past the edge. */
  strip: { lo: Vec3; hi: Vec3 } | null
  /** The section face on the pad: full depth, the B·d part Vc counts (top → bars), and the cover under the bars it does not. */
  section: Vec3[]
  shearArea: Vec3[]
  cover: Vec3[]
  /** The bottom mat's level, z mm (= h − d). */
  zs: number
  /** The main bars (along L) where they cross the section — on the B·d face's lower edge. */
  cuts: Vec3[]
  /** The same bars bridging the pulled-apart cut, section → strip. */
  crossings: { a: Vec3; b: Vec3 }[]
  /** aᵥ, mm (0 when the section falls outside), and B·d, mm². */
  arm: number
  Bd: number
  /** Upward pressure arrows: foot (below the strip) → head (its underside). */
  arrows: { from: Vec3; to: Vec3 }[]
}

/** Main-bar spacing drawn, mm — schematic: the provision carries d, not a bar layout. */
const BAR_SPACING = 200
const SIDE_COVER = 75

export function footingShearIso(i: FootingShearInput): FootingShearIso | null {
  if (!(i.d > 0) || i.d >= i.h || !(i.B > 0) || !(i.L > 0) || !(i.c > 0) || i.c / 1000 >= i.L) return null
  const L = i.L * 1000, B = i.B * 1000, hx = L / 2, hy = B / 2
  const xs = Math.min(hx, i.c / 2 + i.d)                  // the section, from the column's centre
  const arm = Math.max(0, hx - xs)
  // wide enough to see down into the cut: the section face (≥ h) and the bars crossing it at d (≥ 1.7d from the drawing's view)
  const gap = Math.max(0.12 * L, 1.05 * i.h, 1.7 * i.d)
  const colH = Math.max(0.6 * i.c, 0.5 * i.h)
  const strip = arm > 0 ? { lo: [xs + gap, -hy, 0] as Vec3, hi: [hx + gap, hy, i.h] as Vec3 } : null
  const zSteel = i.h - i.d
  const arrows: FootingShearIso['arrows'] = []
  if (strip) {
    const rise = 0.55 * i.h, n = Math.max(2, Math.min(5, Math.round(arm / (0.12 * L)) + 1))
    for (let k = 0; k < n; k++) {
      const x = strip.lo[0] + ((k + 0.5) / n) * arm
      arrows.push({ from: [x, -hy, -rise], to: [x, -hy, 0] })
    }
  }
  // bars along L on a grid through the column's axis, inside the side cover
  const ys: number[] = []
  for (let k = Math.ceil((-hy + SIDE_COVER) / BAR_SPACING); k * BAR_SPACING <= hy - SIDE_COVER; k++) ys.push(k * BAR_SPACING)
  const cuts = ys.map((y): Vec3 => [xs, y, zSteel])
  const crossings = strip ? ys.map((y) => ({ a: [xs, y, zSteel] as Vec3, b: [xs + gap, y, zSteel] as Vec3 })) : []
  return {
    zs: zSteel, cuts, crossings,
    cover: [[xs, -hy, 0], [xs, hy, 0], [xs, hy, zSteel], [xs, -hy, zSteel]],
    pad: { lo: [-hx, -hy, 0], hi: [xs, hy, i.h] },
    column: { lo: [-i.c / 2, -i.c / 2, i.h], hi: [i.c / 2, i.c / 2, i.h + colH] },
    strip,
    section: [[xs, -hy, 0], [xs, hy, 0], [xs, hy, i.h], [xs, -hy, i.h]],
    shearArea: [[xs, -hy, zSteel], [xs, hy, zSteel], [xs, hy, i.h], [xs, -hy, i.h]],
    arm, Bd: B * i.d, arrows,
  }
}
