// ─────────────────────────────────────────────────────────────────────────
// Footing footprint layout for the 3D view. Turns the designed footings
// (isolated squares + combined CRF/CTF) into to-scale plan rectangles centred
// on their base nodes, and flags overlapping footprints (axis-aligned bounding-
// box test). Pure + framework-free so it can be unit-tested; the 3D scene maps
// each Footprint to a translucent box below grade.
// Units: metres.
// ─────────────────────────────────────────────────────────────────────────

export interface FootingIn { node: string; B: number; Dc: number }            // isolated square (mm Dc)
export interface CombinedIn { nodes: [string, string]; Bx: number; By: number; Dc: number; trapezoid: boolean }

export interface Footprint {
  key: string
  cx: number; cz: number          // plan centre, m
  bx: number; bz: number          // plan dimensions, m (local, before rotation)
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
      key: `ft-${f.node}`, cx: p.x, cz: p.z, bx: f.B, bz: f.B, dc: f.Dc / 1000, angle: 0,
      hx: f.B / 2, hz: f.B / 2, label: `${f.node}  ${f.B.toFixed(2)}×${f.B.toFixed(2)}`,
    })
  }
  for (const cf of combined) {
    const a = nodeXZ.get(cf.nodes[0]), b = nodeXZ.get(cf.nodes[1]); if (!a || !b) continue
    const angle = Math.atan2(b.z - a.z, b.x - a.x)
    const { hx, hz } = aabbHalf(cf.Bx, cf.By, angle)
    items.push({
      key: `cf-${cf.nodes.join('-')}`, cx: (a.x + b.x) / 2, cz: (a.z + b.z) / 2,
      bx: cf.Bx, bz: cf.By, dc: cf.Dc / 1000, angle, hx, hz,
      label: `${cf.trapezoid ? 'CTF' : 'CRF'} ${cf.Bx.toFixed(2)}×${cf.By.toFixed(2)}`,
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
