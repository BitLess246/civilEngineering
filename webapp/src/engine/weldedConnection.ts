// ─────────────────────────────────────────────────────────────────────────
// Eccentrically-loaded fillet weld group — elastic (weld-as-a-line) method.
// A weld group made of straight segments carries an in-plane load P applied at
// an eccentricity (ex, ey) from the group centroid. Treating the weld as a line
// of unit throat, forces are per unit length (N/mm):
//   Direct    fdx = Px/Lw ,  fdy = Py/Lw            (Lw = total weld length)
//   Torsional (about the centroid, T = Py·ex − Px·ey):
//             ftx = −T·yc/(J/t) ,  fty = T·xc/(J/t)
//   with the unit-throat polar moment of the line
//             J/t = Σ[ L³/12 + L·(xc² + yc²) ]      (general for any orientation,
//                                                    since sin²θ + cos²θ = 1)
// The resultant f = √(fx² + fy²) is evaluated at every segment endpoint; the
// largest governs. The fillet throat is 0.707·w (NSCP 510.2.2 / AISC J2.2), so
// the design strength per unit length is φ·0.60·FEXX·0.707·w. The required weld
// size and the maximum applied load P follow (f scales linearly with P).
// Units: coordinates mm; P kN; forces N/mm; FEXX MPa; weld size w mm.
// ─────────────────────────────────────────────────────────────────────────

/** A straight fillet-weld segment given by its two endpoints (plate mm coords). */
export interface WeldSegment { id: string; x1: number; y1: number; x2: number; y2: number }

export interface WeldPoint { x: number; y: number; fx: number; fy: number; f: number }

export interface WeldConnLoad {
  /** Magnitude of the applied load, kN. */
  P: number
  /** Direction, degrees from +X (horizontal), positive CCW. */
  angleDeg: number
  /** Load application point in plate coordinates, mm. */
  px: number; py: number
}

export interface WeldConnResult {
  Lw: number                   // total weld length, mm
  Cx: number; Cy: number       // weld-group centroid, mm
  Jt: number                   // unit-throat polar moment J/t, mm³
  Px: number; Py: number       // load components, kN
  ex: number; ey: number       // eccentricity of the load from the centroid, mm
  T: number                    // torsional moment about the centroid, kN·mm
  points: WeldPoint[]          // resultant per-unit-length force at each endpoint, N/mm
  fMax: number; criticalIndex: number   // governing endpoint
  throat: number               // effective throat = 0.707·w, mm
  capacityPerLen: number       // design strength per unit length φ·0.6·FEXX·throat, N/mm
  reqSize: number              // required fillet leg for the applied P, mm
  maxP: number                 // max applied P for the given weld size, kN
  ok: boolean
}

/** Length of a weld segment (mm). */
function segLen(s: WeldSegment): number {
  return Math.hypot(s.x2 - s.x1, s.y2 - s.y1)
}

/**
 * Solve an eccentrically-loaded fillet-weld group by the elastic line method.
 * `size` is the fillet leg w (mm); `FEXX` is the electrode strength (MPa,
 * default E70 ≈ 480); `phi` is the LRFD resistance factor (default 0.75).
 */
export function solveWeldedConnection(p: {
  segments: WeldSegment[]; size: number; load: WeldConnLoad; FEXX?: number; phi?: number;
}): WeldConnResult {
  const FEXX = p.FEXX ?? 480
  const phi = p.phi ?? 0.75
  const segs = p.segments

  // Total length and centroid of the weld line (sum of segment midpoints × length).
  const Lw = segs.reduce((a, s) => a + segLen(s), 0)
  let sx = 0, sy = 0
  for (const s of segs) {
    const L = segLen(s)
    sx += L * (s.x1 + s.x2) / 2
    sy += L * (s.y1 + s.y2) / 2
  }
  const Cx = Lw > 0 ? sx / Lw : 0
  const Cy = Lw > 0 ? sy / Lw : 0

  // Unit-throat polar moment about the centroid: Σ[L³/12 + L·(xc²+yc²)], where
  // (xc,yc) is the segment midpoint relative to the centroid. L³/12 is the line's
  // own second moment about its midpoint (valid for any segment orientation).
  let Jt = 0
  for (const s of segs) {
    const L = segLen(s)
    const mx = (s.x1 + s.x2) / 2 - Cx
    const my = (s.y1 + s.y2) / 2 - Cy
    Jt += (L * L * L) / 12 + L * (mx * mx + my * my)
  }

  const rad = (p.load.angleDeg * Math.PI) / 180
  const Px = p.load.P * Math.cos(rad)
  const Py = p.load.P * Math.sin(rad)
  const ex = p.load.px - Cx
  const ey = p.load.py - Cy
  const T = Py * ex - Px * ey            // kN·mm, +CCW

  // Direct force per unit length (N/mm): (kN → N) / mm.
  const fdx = Lw > 0 ? (Px * 1000) / Lw : 0
  const fdy = Lw > 0 ? (Py * 1000) / Lw : 0

  // Evaluate the resultant at each segment endpoint; the extreme fibre governs.
  const points: WeldPoint[] = []
  for (const s of segs) {
    for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]] as const) {
      const rx = x - Cx, ry = y - Cy
      // Torsional force per unit length: fT = T·ρ/(J/t), ⟂ to ρ.
      const ftx = Jt > 0 ? (-(T * 1000) * ry) / Jt : 0
      const fty = Jt > 0 ? ((T * 1000) * rx) / Jt : 0
      const fx = fdx + ftx
      const fy = fdy + fty
      points.push({ x, y, fx, fy, f: Math.hypot(fx, fy) })
    }
  }

  const criticalIndex = points.reduce((mi, _, i) => (points[i].f > points[mi].f ? i : mi), 0)
  const fMax = points.length ? points[criticalIndex].f : 0

  const throat = 0.707 * p.size
  const capacityPerLen = phi * 0.6 * FEXX * throat   // N/mm
  // f scales linearly with the applied load and with the weld size:
  //   reqSize = size · fMax / capacityPerLen ;  maxP = P · capacity / fMax.
  const reqSize = capacityPerLen > 1e-9 ? (p.size * fMax) / capacityPerLen : Infinity
  const maxP = fMax > 1e-9 ? (p.load.P * capacityPerLen) / fMax : Infinity

  return {
    Lw, Cx, Cy, Jt, Px, Py, ex, ey, T, points,
    fMax, criticalIndex, throat, capacityPerLen, reqSize, maxP,
    ok: fMax <= capacityPerLen + 1e-6,
  }
}
