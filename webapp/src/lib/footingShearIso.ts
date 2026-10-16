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
  /** The section face on the pad: full depth, and the B·d part Vc counts. */
  section: Vec3[]
  shearArea: Vec3[]
  /** aᵥ, mm (0 when the section falls outside), and B·d, mm². */
  arm: number
  Bd: number
  /** Upward pressure arrows: foot (below the strip) → head (its underside). */
  arrows: { from: Vec3; to: Vec3 }[]
}

export function footingShearIso(i: FootingShearInput): FootingShearIso | null {
  if (!(i.d > 0) || i.d >= i.h || !(i.B > 0) || !(i.L > 0) || !(i.c > 0) || i.c / 1000 >= i.L) return null
  const L = i.L * 1000, B = i.B * 1000, hx = L / 2, hy = B / 2
  const xs = Math.min(hx, i.c / 2 + i.d)                  // the section, from the column's centre
  const arm = Math.max(0, hx - xs)
  // ≥ h, so no part of the section face hides behind the strip from above
  const gap = Math.max(0.12 * L, 1.05 * i.h)
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
  return {
    pad: { lo: [-hx, -hy, 0], hi: [xs, hy, i.h] },
    column: { lo: [-i.c / 2, -i.c / 2, i.h], hi: [i.c / 2, i.c / 2, i.h + colH] },
    strip,
    section: [[xs, -hy, 0], [xs, hy, 0], [xs, hy, i.h], [xs, -hy, i.h]],
    shearArea: [[xs, -hy, zSteel], [xs, hy, zSteel], [xs, hy, i.h], [xs, -hy, i.h]],
    arm, Bd: B * i.d, arrows,
  }
}
