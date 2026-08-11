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

import { type SolutionStep, sn0, sn1, sn2 } from '../lib/solution'

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

// ── Worked solution ────────────────────────────────────────────────────────
// The elastic method is five moves, and four of them are geometry. Printing it
// this way matters more here than on most pages: the answer is a WELD SIZE, and
// a reviewer's only way to disagree with it is to disagree with the centroid,
// the polar moment or which endpoint was taken as critical.
export function weldedConnectionSolution(p: {
  segments: WeldSegment[]; size: number; load: WeldConnLoad; FEXX?: number; phi?: number
}, r: WeldConnResult): SolutionStep[] {
  const FEXX = p.FEXX ?? 480
  const phi = p.phi ?? 0.75
  const crit = r.points[r.criticalIndex]
  return [
    {
      title: 'Weld group — length and centroid', clause: 'Elastic (weld-as-a-line) method',
      lines: [
        { text: `${p.segments.length} segment${p.segments.length === 1 ? '' : 's'}, treated as a line of unit throat: the group is solved for force per unit length, and the throat is applied only at the end.` },
        { tex: `L_w = \\sum L_i = ${sn1(r.Lw)}\\ \\text{mm}` },
        { tex: `\\bar{x} = \\dfrac{\\sum L_i x_i}{L_w} = ${sn1(r.Cx)}\\ \\text{mm},\\quad \\bar{y} = \\dfrac{\\sum L_i y_i}{L_w} = ${sn1(r.Cy)}\\ \\text{mm}` },
      ],
    },
    {
      title: 'Unit-throat polar moment', clause: 'J/t about the group centroid',
      lines: [
        { tex: `\\dfrac{J}{t} = \\sum\\left[\\dfrac{L_i^3}{12} + L_i\\left(x_{c,i}^2 + y_{c,i}^2\\right)\\right] = ${sn0(r.Jt)}\\ \\text{mm}^3` },
        { text: 'L³/12 is the segment’s own second moment about its midpoint. Because sin²θ + cos²θ = 1, that single term is correct for a segment at any orientation — no separate Ix and Iy are needed.' },
      ],
    },
    {
      title: 'Load, eccentricity and torsion',
      lines: [
        { tex: `P_x = P\\cos\\theta = ${sn2(r.Px)}\\ \\text{kN},\\quad P_y = P\\sin\\theta = ${sn2(r.Py)}\\ \\text{kN}\\quad (\\theta = ${sn0(p.load.angleDeg)}^\\circ)` },
        { tex: `e_x = ${sn1(r.ex)}\\ \\text{mm},\\quad e_y = ${sn1(r.ey)}\\ \\text{mm}` },
        { tex: `T = P_y e_x - P_x e_y = ${sn1(r.T)}\\ \\text{kN·mm}` },
        { text: 'Eccentricity is measured from the group CENTROID, not from the column face — moving the weld pattern moves the centroid and so changes T.' },
      ],
    },
    {
      title: 'Governing endpoint', clause: 'f = √(fx² + fy²), max over all endpoints',
      lines: [
        { tex: `f_{dx} = \\dfrac{P_x}{L_w} = ${sn2((r.Px * 1000) / r.Lw)},\\quad f_{dy} = \\dfrac{P_y}{L_w} = ${sn2((r.Py * 1000) / r.Lw)}\\ \\text{N/mm}` },
        { tex: `f_{tx} = \\dfrac{-T\\,y_c}{J/t},\\quad f_{ty} = \\dfrac{T\\,x_c}{J/t}` },
        { tex: `\\text{at } (${sn0(crit.x)},\\,${sn0(crit.y)}):\\; f = \\sqrt{${sn2(crit.fx)}^2 + ${sn2(crit.fy)}^2} = ${sn2(r.fMax)}\\ \\text{N/mm}` },
        { text: 'The torsional component is perpendicular to the radius from the centroid, so the extreme fibre — the endpoint furthest from the centroid on the side where the two components add — governs.' },
      ],
    },
    {
      title: 'Fillet capacity and required size', clause: 'NSCP 510.2.2 / AISC §J2.2',
      lines: [
        { tex: `t_e = 0.707w = 0.707\\times ${sn1(p.size)} = ${sn2(r.throat)}\\ \\text{mm}` },
        { tex: `\\phi R_n = \\phi\\,0.60F_{EXX}\\,t_e = ${sn2(phi)}\\times 0.60\\times ${sn0(FEXX)}\\times ${sn2(r.throat)} = ${sn2(r.capacityPerLen)}\\ \\text{N/mm}` },
        { tex: `f_{max} = ${sn2(r.fMax)} \\;${r.ok ? '\\le' : '>'}\\; ${sn2(r.capacityPerLen)}\\ \\text{N/mm}` },
        { tex: `w_{req} = w\\dfrac{f_{max}}{\\phi R_n} = ${sn2(r.reqSize)}\\ \\text{mm};\\quad P_{max} = P\\dfrac{\\phi R_n}{f_{max}} = ${sn1(r.maxP)}\\ \\text{kN}` },
        { text: 'f is linear in both the applied load and the weld size, so the required size and the maximum load follow by proportion — no second solve.' },
      ],
      pass: r.ok,
      note: 'Base-metal shear rupture at the weld line and the minimum/maximum fillet sizes of §J2.2b are separate checks.',
    },
  ]
}
