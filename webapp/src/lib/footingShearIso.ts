// ─────────────────────────────────────────────────────────────────────────
// One-way shear in a footing, in three dimensions — the pad split at d.
//
// The section is a vertical plane across the full width B, d from the column
// face; Vc acts on B·d of it (§422.5.5.1), and Vu is the soil pressure on the
// strip beyond it (§413.2.7.2 — the section at d for a footing). That pressure
// bears on the strip's UNDERSIDE, so B·aᵥ is the bottom face, not the top:
// Vu = qu·B·aᵥ is the soil pushing up on it. Drawn with the strip pulled
// clear, the plane is a face and the strip is a block with its bearing face
// shaded from below.
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
  /** Bar diameter and spacing drawn, mm, and whether they are the design's or a schematic stand-in. */
  db: number
  spacing: number
  schematic: boolean
  /** The main bars (along L) cut by the section: their ends on the pad's section face, at d. */
  cuts: Vec3[]
  /** The same bars inside the pulled-off strip — from ITS cut face to the end cover; nothing spans the gap. */
  stripBars: { a: Vec3; b: Vec3 }[]
  /** The cross bars in the strip (along B), sitting on the main bars. */
  crossBars: { a: Vec3; b: Vec3 }[]
  /** aᵥ, mm (0 when the section falls outside), and B·d, mm². */
  arm: number
  Bd: number
  /** The strip's underside — the bearing face B·aᵥ the soil pressure acts on; null with no strip. */
  bearing: Vec3[] | null
  /** Upward pressure arrows on a grid under the bearing face, far rows first: foot (below) → head (on the underside). */
  arrows: { from: Vec3; to: Vec3 }[]
}

/** Bars drawn when the caller has no layout, mm — the provision carries d, not a bar schedule. */
const SCHEMATIC = { db: 16, spacing: 200 }
const COVER = 75

/**
 * The pad split at the one-way shear section. `bars` is the design's bottom
 * mat in the shear direction (⌀ and spacing, mm) when the caller has one —
 * the Foundation Design page does; the Code Library draws a schematic mat.
 */
export function footingShearIso(i: FootingShearInput, bars?: { db: number; spacing: number }): FootingShearIso | null {
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
    // spread over the whole bearing face: a few across aᵥ, three across B, the far row painted first
    const rise = 0.55 * i.h, nx = Math.max(2, Math.min(5, Math.round(arm / (0.12 * L)) + 1)), ny = 3
    for (let j = ny - 1; j >= 0; j--) for (let k = 0; k < nx; k++) {
      const x = strip.lo[0] + ((k + 0.5) / nx) * arm, y = -hy + ((j + 0.5) / ny) * B
      arrows.push({ from: [x, y, -rise], to: [x, y, 0] })
    }
  }
  const bearing: Vec3[] | null = strip
    ? [[strip.lo[0], -hy, 0], [strip.hi[0], -hy, 0], [strip.hi[0], hy, 0], [strip.lo[0], hy, 0]] : null
  // bars along L on a grid through the column's axis, inside the side cover —
  // cut by the section, so each piece ends at its own cut face: the pad shows
  // the ends on its section face, the strip carries its pieces from its cut
  // face to the end cover. Nothing spans the gap: it is a cut, not a hinge.
  const { db, spacing } = bars && bars.db > 0 && bars.spacing > 0 ? bars : SCHEMATIC
  const ys: number[] = []
  for (let k = Math.ceil((-hy + COVER) / spacing); k * spacing <= hy - COVER; k++) ys.push(k * spacing)
  const cuts = ys.map((y): Vec3 => [xs, y, zSteel])
  const stripBars = strip ? ys.map((y) => ({ a: [strip.lo[0], y, zSteel] as Vec3, b: [strip.hi[0] - COVER, y, zSteel] as Vec3 })) : []
  const crossBars: FootingShearIso['crossBars'] = []
  if (strip) {
    // the cross bars on the same module, measured from the strip's far edge, on top of the main bars
    for (let x = strip.hi[0] - COVER; x > strip.lo[0] + db; x -= spacing) {
      crossBars.push({ a: [x, -hy + COVER, zSteel + db], b: [x, hy - COVER, zSteel + db] })
    }
  }
  return {
    zs: zSteel, cuts, stripBars, crossBars, db, spacing, schematic: !(bars && bars.db > 0 && bars.spacing > 0),
    cover: [[xs, -hy, 0], [xs, hy, 0], [xs, hy, zSteel], [xs, -hy, zSteel]],
    pad: { lo: [-hx, -hy, 0], hi: [xs, hy, i.h] },
    column: { lo: [-i.c / 2, -i.c / 2, i.h], hi: [i.c / 2, i.c / 2, i.h + colH] },
    strip,
    section: [[xs, -hy, 0], [xs, hy, 0], [xs, hy, i.h], [xs, -hy, i.h]],
    shearArea: [[xs, -hy, zSteel], [xs, hy, zSteel], [xs, hy, i.h], [xs, -hy, i.h]],
    arm, Bd: B * i.d, arrows, bearing,
  }
}
