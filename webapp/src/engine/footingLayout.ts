// ─────────────────────────────────────────────────────────────────────────
// Footing footprint layout for the 3D view. Turns the designed footings
// (isolated squares + combined CRF/CTF) into to-scale plan rectangles centred
// on their base nodes, and flags overlapping footprints (axis-aligned bounding-
// box test). Pure + framework-free so it can be unit-tested; the 3D scene maps
// each Footprint to a translucent box below grade.
// Units: metres.
// ─────────────────────────────────────────────────────────────────────────

export interface FootingIn { node: string; B: number; Dc: number }            // isolated square (mm Dc)
/**
 * A combined pad, in the frame `designCombinedFooting` works in: `Bx` along the
 * pad's own axis from `nodes[0]` towards `nodes[1]`, `By1`/`By2` the widths at
 * each end, and `x1` the overhang BEYOND the first column.
 *
 * `x1` is what makes the pad placeable. It is not half the leftover length: on
 * a pad sized so the bearing resultant sits at mid-length, the two overhangs
 * differ by however much the two column loads differ, and on a 6 m spacing that
 * is routinely close to a metre.
 */
export interface CombinedIn {
  nodes: [string, string]
  Bx: number; By1: number; By2: number; x1: number
  Dc: number
}

export interface Footprint {
  key: string
  cx: number; cz: number          // plan centre, m
  bx: number; bz: number          // plan dimensions, m (local, before rotation)
  /** Width at each end of a tapered pad, m. Equal on a rectangular one. */
  bz1: number; bz2: number
  dc: number                      // depth, m
  angle: number                   // plan rotation about +Y, rad (0 for isolated)
  hx: number; hz: number          // world AABB half-extents, m (for overlap test)
  label: string
}

const aabbHalf = (bx: number, bz: number, angle: number) => ({
  hx: (Math.abs(bx * Math.cos(angle)) + Math.abs(bz * Math.sin(angle))) / 2,
  hz: (Math.abs(bx * Math.sin(angle)) + Math.abs(bz * Math.cos(angle))) / 2,
})

/** Build to-scale footprints + the set of overlapping keys. */
export function footingLayout(
  footings: FootingIn[], combined: CombinedIn[], nodeXZ: Map<string, { x: number; z: number }>,
): { items: Footprint[]; overlaps: Set<string> } {
  const items: Footprint[] = []
  for (const f of footings) {
    const p = nodeXZ.get(f.node); if (!p) continue
    items.push({
      key: `ft-${f.node}`, cx: p.x, cz: p.z, bx: f.B, bz: f.B, bz1: f.B, bz2: f.B,
      dc: f.Dc / 1000, angle: 0,
      hx: f.B / 2, hz: f.B / 2, label: `${f.node}  ${f.B.toFixed(2)}×${f.B.toFixed(2)}`,
    })
  }
  for (const cf of combined) {
    const a = nodeXZ.get(cf.nodes[0]), b = nodeXZ.get(cf.nodes[1]); if (!a || !b) continue
    const angle = Math.atan2(b.z - a.z, b.x - a.x)
    const wide = Math.max(cf.By1, cf.By2)
    const { hx, hz } = aabbHalf(cf.Bx, wide, angle)
    // The pad's centre is Bx/2 along its axis from an origin sitting x1 BACK
    // from the first column — not the midpoint of the two nodes. Those coincide
    // only when the overhangs are equal, which is exactly what a pad sized to
    // centre its bearing resultant is not.
    const ux = Math.cos(angle), uz = Math.sin(angle)
    const off = cf.Bx / 2 - cf.x1
    const trapezoid = Math.abs(cf.By1 - cf.By2) > 1e-6
    items.push({
      key: `cf-${cf.nodes.join('-')}`,
      cx: a.x + ux * off, cz: a.z + uz * off,
      bx: cf.Bx, bz: wide, bz1: cf.By1, bz2: cf.By2,
      dc: cf.Dc / 1000, angle, hx, hz,
      label: trapezoid
        ? `CTF ${cf.Bx.toFixed(2)}×${cf.By1.toFixed(2)}/${cf.By2.toFixed(2)}`
        : `CRF ${cf.Bx.toFixed(2)}×${cf.By1.toFixed(2)}`,
    })
  }
  const overlaps = new Set<string>()
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const A = items[i], C = items[j]
      if (Math.abs(A.cx - C.cx) < A.hx + C.hx - 1e-6 && Math.abs(A.cz - C.cz) < A.hz + C.hz - 1e-6) {
        overlaps.add(A.key); overlaps.add(C.key)
      }
    }
  return { items, overlaps }
}
