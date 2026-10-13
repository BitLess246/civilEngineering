// ─────────────────────────────────────────────────────────────────────────
// THE OUTLINE OF A ROLLED SHAPE — pure geometry, no sheet.
//
// Split out of `steelSection` so the framing plan (`planRenderer`) can draw a
// steel column's true section without importing the section-sheet builder,
// which imports `planRenderer` back. `steelSection` re-exports all of it.
// Units: mm, centroid at (0, 0), y up (y = the section depth).
// ─────────────────────────────────────────────────────────────────────────
import type { EffectiveSection } from './aiscSections'

export type P2 = [number, number]
/** One closed outline and the holes cut from it, mm, y up. */
export interface SteelProfile { outer: P2[]; holes: P2[][] }

const circle = (r: number, n = 48): P2[] =>
  Array.from({ length: n }, (_, k) => [r * Math.cos((2 * Math.PI * k) / n), r * Math.sin((2 * Math.PI * k) / n)] as P2)

/** An angle with its heel at x0, legs running `dir` (±1) and up. */
function angle(x0: number, dir: 1 | -1, t: number, legH: number, legV: number): P2[] {
  const bot = -legV / 2, top = legV / 2
  return [[x0, bot], [x0 + dir * legH, bot], [x0 + dir * legH, bot + t], [x0 + dir * t, bot + t], [x0 + dir * t, top], [x0, top]]
}

/** The outline(s) of a section, mm, centroid at the origin, y up. */
export function steelProfile(eff: EffectiveSection): SteelProfile[] {
  const ps = rawProfile(eff)
  const [cx, cy] = profileCentroid(ps)
  if (Math.abs(cx) < 1e-9 && Math.abs(cy) < 1e-9) return ps
  const mv = (q: P2[]): P2[] => q.map(([x, y]) => [x - cx, y - cy])
  return ps.map((p) => ({ outer: mv(p.outer), holes: p.holes.map(mv) }))
}

/** The outline(s) about the bounding-box centre. */
function rawProfile(eff: EffectiveSection): SteelProfile[] {
  const s = eff.base
  if (eff.family === 'W' || eff.family === 'WT') {
    const bf = s.bf ?? 100, d = s.d ?? 100, tf = s.tf ?? 8, tw = s.tw ?? 6
    const X = bf / 2, Y = d / 2
    if (eff.family === 'WT')
      return [{ outer: [[-X, Y], [X, Y], [X, Y - tf], [tw / 2, Y - tf], [tw / 2, -Y], [-tw / 2, -Y], [-tw / 2, Y - tf], [-X, Y - tf]], holes: [] }]
    return [{ outer: [
      [-X, Y], [X, Y], [X, Y - tf], [tw / 2, Y - tf], [tw / 2, -(Y - tf)], [X, -(Y - tf)],
      [X, -Y], [-X, -Y], [-X, -(Y - tf)], [-tw / 2, -(Y - tf)], [-tw / 2, Y - tf], [-X, Y - tf],
    ], holes: [] }]
  }
  if (eff.family === 'C') {
    const bf = s.bf ?? 60, d = s.d ?? 100, tf = s.tf ?? 9, tw = s.tw ?? 8
    const X = bf / 2, Y = d / 2
    return [{ outer: [[-X, Y], [X, Y], [X, Y - tf], [-X + tw, Y - tf], [-X + tw, -(Y - tf)], [X, -(Y - tf)], [X, -Y], [-X, -Y]], holes: [] }]
  }
  if (eff.family === 'L') {
    const legV = Math.max(s.leg1 ?? 50, s.leg2 ?? 50), legH = Math.min(s.leg1 ?? 50, s.leg2 ?? 50), t = s.t ?? 8
    if (eff.double) {
      const g = eff.gap ?? 0
      return [{ outer: angle(-g / 2, -1, t, legH, legV), holes: [] }, { outer: angle(g / 2, 1, t, legH, legV), holes: [] }]
    }
    return [{ outer: angle(-legH / 2, 1, t, legH, legV), holes: [] }]
  }
  if (eff.family === 'HSS') {
    const b = s.b ?? 100, h = s.h ?? 100, t = s.t ?? 6
    return [{
      outer: [[-b / 2, h / 2], [b / 2, h / 2], [b / 2, -h / 2], [-b / 2, -h / 2]],
      holes: [[[-b / 2 + t, h / 2 - t], [b / 2 - t, h / 2 - t], [b / 2 - t, -(h / 2 - t)], [-b / 2 + t, -(h / 2 - t)]]],
    }]
  }
  const R = (s.D ?? 100) / 2, t = s.t ?? 6
  return [{ outer: circle(R), holes: [circle(R - t)] }]
}

const ringArea = (q: P2[]) => q.reduce((s, p, k) => { const n = q[(k + 1) % q.length]!; return s + p[0] * n[1] - n[0] * p[1] }, 0) / 2

/** Area centroid of a profile set (holes subtracted), mm. Each ring's own
 *  centroid (Σ(xᵢ+xᵢ₊₁)·cᵢ / 6a, c the shoelace cross term) weighted by ±|a|,
 *  so the winding a ring was written in does not matter. */
export function profileCentroid(ps: SteelProfile[]): P2 {
  let A = 0, Mx = 0, My = 0
  const add = (q: P2[], sign: 1 | -1) => {
    const a = ringArea(q)
    if (Math.abs(a) < 1e-12) return
    let sx = 0, sy = 0
    q.forEach((p, k) => { const n = q[(k + 1) % q.length]!; const c = p[0] * n[1] - n[0] * p[1]; sx += (p[0] + n[0]) * c; sy += (p[1] + n[1]) * c })
    const w = sign * Math.abs(a)
    A += w; Mx += w * (sx / (6 * a)); My += w * (sy / (6 * a))
  }
  for (const p of ps) { add(p.outer, 1); for (const h of p.holes) add(h, -1) }
  return A > 0 ? [Mx / A, My / A] : [0, 0]
}

/** Shoelace area of a profile set, mm² — what the outline encloses. */
export function profileArea(ps: SteelProfile[]): number {
  const a = (q: P2[]) => Math.abs(ringArea(q))
  return ps.reduce((s, p) => s + a(p.outer) - p.holes.reduce((h, q) => h + a(q), 0), 0)
}

