// ─────────────────────────────────────────────────────────────────────────
// EXACT BIAXIAL STRENGTH OF A RECTANGULAR RC COLUMN — strain compatibility
// about an INCLINED neutral axis (ACI 318-14 §22.2; NSCP 2015 §422.2).
//
// The design check (`pmCapacityBiaxial`) uses Bresler's reciprocal load
// method, an approximation to the failure surface; this module computes the
// surface itself, so the approximation can be measured against it:
//   · plane sections, εcu = 0.003 at the most-compressed corner (§22.2.2.1);
//   · a uniform 0.85f′c over depth β1·c measured PERPENDICULAR to the neutral
//     axis, clipped to the rectangle (§22.2.2.4.1) — a triangle, trapezoid or
//     pentagon depending on c and the angle;
//   · bars elastic–perfectly plastic, Es·ε within ±fy, with the displaced
//     concrete deducted for a bar inside the block;
//   · φ from εt at the extreme TENSION bar (§21.2.2, 318-14 limits).
//
// Angle α: the neutral axis's rotation from the x axis — α = 0 compresses the
// +y face (bending about x, Mnx), α = 90° the +x face (Mny). Moments are taken
// about the section's centroid, positive for the compressed +x, +y quadrant.
//
// Units: mm, mm², MPa → kN, kN·m.
// ─────────────────────────────────────────────────────────────────────────
import { beta1 as beta1Of } from './loads'

/** A bar at (x, y) from the section centroid, mm, area mm². */
export interface BiaxialBar { x: number; y: number; As: number }
export interface BiaxialSection {
  /** Width along x, depth along y, mm. */
  b: number; h: number
  fc: number; fy: number
  /** MPa — default 200 000. */
  Es?: number
  /** Default Table 22.2.2.4.3 (SI row). */
  beta1?: number
  bars: BiaxialBar[]
}
export interface BiaxialPoint {
  /** Neutral-axis depth from the most-compressed corner, mm; its angle, degrees. */
  c: number; alpha: number
  Pn: number; Mnx: number; Mny: number
  /** Net tensile strain at the extreme tension bar, and φ (tied). */
  et: number; phi: number
}

type Pt = [number, number]
/** Sutherland–Hodgman: the part of a convex polygon where f ≥ 0. */
function clip(poly: Pt[], f: (p: Pt) => number): Pt[] {
  const out: Pt[] = []
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length], fa = f(a), fb = f(b)
    if (fa >= 0) out.push(a)
    if ((fa >= 0) !== (fb >= 0)) {
      const t = fa / (fa - fb)
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])])
    }
  }
  return out
}
function areaCentroid(p: Pt[]): { A: number; x: number; y: number } {
  let A2 = 0, cx = 0, cy = 0
  for (let k = 0; k < p.length; k++) {
    const [x0, y0] = p[k], [x1, y1] = p[(k + 1) % p.length], cr = x0 * y1 - x1 * y0
    A2 += cr; cx += (x0 + x1) * cr; cy += (y0 + y1) * cr
  }
  if (Math.abs(A2) < 1e-12) return { A: 0, x: 0, y: 0 }
  return { A: Math.abs(A2) / 2, x: cx / (3 * A2), y: cy / (3 * A2) }
}

/** The section's nominal strength at neutral-axis depth c and angle α. */
export function biaxialPoint(s: BiaxialSection, c: number, alphaDeg: number): BiaxialPoint {
  const a = (alphaDeg * Math.PI) / 180
  const n: Pt = [Math.sin(a), Math.cos(a)]                     // toward the compressed corner
  const rect: Pt[] = [[-s.b / 2, -s.h / 2], [s.b / 2, -s.h / 2], [s.b / 2, s.h / 2], [-s.b / 2, s.h / 2]]
  const top = Math.max(...rect.map(([x, y]) => x * n[0] + y * n[1]))
  const depth = (p: Pt) => top - (p[0] * n[0] + p[1] * n[1])  // from the extreme compression fibre
  const b1 = s.beta1 ?? beta1Of(s.fc), Es = s.Es ?? 200_000
  const blk = areaCentroid(clip(rect, (p) => b1 * c - depth(p)))
  const Cc = (0.85 * s.fc * blk.A) / 1000                     // kN
  let Pn = Cc, Mx = Cc * blk.y, My = Cc * blk.x               // kN·mm
  let dt = 0
  for (const bar of s.bars) {
    const d = depth([bar.x, bar.y])
    dt = Math.max(dt, d)
    let fs = Math.max(-s.fy, Math.min(s.fy, (Es * 0.003 * (c - d)) / c))
    if (d < b1 * c) fs -= 0.85 * s.fc
    const F = (bar.As * fs) / 1000
    Pn += F; Mx += F * bar.y; My += F * bar.x
  }
  const et = (0.003 * (dt - c)) / c, ety = s.fy / Es
  const phi = et >= 0.005 ? 0.9 : et <= ety ? 0.65 : 0.65 + (0.25 * (et - ety)) / (0.005 - ety)
  return { c, alpha: alphaDeg, Pn, Mnx: Mx / 1000, Mny: My / 1000, et, phi }
}

/** Squash load Po = 0.85f′c(Ag − Ast) + fy·Ast, kN (§22.4.2.2). */
export function biaxialPo(s: BiaxialSection): number {
  const Ast = s.bars.reduce((t, b) => t + b.As, 0)
  return (0.85 * s.fc * (s.b * s.h - Ast) + s.fy * Ast) / 1000
}

/** The point at axial load Pn (kN) with the neutral axis at α — bisection on
 *  c, Pn rising with c. null above Po. */
export function biaxialAtLoad(s: BiaxialSection, Pn: number, alphaDeg: number): BiaxialPoint | null {
  let lo = 1e-3 * Math.min(s.b, s.h), hi = 50 * Math.max(s.b, s.h)
  if (biaxialPoint(s, hi, alphaDeg).Pn < Pn) return null
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2
    if (biaxialPoint(s, mid, alphaDeg).Pn < Pn) lo = mid
    else hi = mid
  }
  return biaxialPoint(s, (lo + hi) / 2, alphaDeg)
}

/** The point at axial load Pn whose moment vector points at θ = atan(Mny/Mnx)
 *  (degrees, 0 = about x) — bisection on α, the direction turning with it. */
export function biaxialAtLoadAndDirection(s: BiaxialSection, Pn: number, thetaDeg: number): BiaxialPoint | null {
  const dir = (p: BiaxialPoint) => (Math.atan2(p.Mny, p.Mnx) * 180) / Math.PI
  let lo = 0, hi = 90
  for (let k = 0; k < 100; k++) {
    const mid = (lo + hi) / 2, p = biaxialAtLoad(s, Pn, mid)
    if (!p) return null
    if (dir(p) < thetaDeg) lo = mid
    else hi = mid
  }
  return biaxialAtLoad(s, Pn, (lo + hi) / 2)
}

/** The nominal capacity along the load ray ex = Mnx/Pn, ey = Mny/Pn, mm (the
 *  convention `pmCapacityBiaxial` uses: eX = Mux/Pu): the surface point with
 *  that moment direction and that resultant eccentricity. Two nested
 *  bisections — for a trial α, the c at which the resultant eccentricity
 *  equals the ray's (it falls as c grows); then α turned until the moment
 *  points along the ray — about 3 000 section evaluations. */
export function biaxialAlongRay(s: BiaxialSection, ex: number, ey: number): BiaxialPoint | null {
  const e = Math.hypot(ex, ey) / 1000                                        // m
  const theta = Math.atan2(ey, ex)
  const span = 50 * Math.max(s.b, s.h)
  const onRay = (alpha: number): BiaxialPoint | null => {
    let lo = 1e-3 * Math.min(s.b, s.h), hi = span
    const ecc = (p: BiaxialPoint) => (p.Pn > 1e-9 ? Math.hypot(p.Mnx, p.Mny) / p.Pn : Infinity)
    if (ecc(biaxialPoint(s, hi, alpha)) > e) return null
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2
      if (ecc(biaxialPoint(s, mid, alpha)) > e) lo = mid
      else hi = mid
    }
    return biaxialPoint(s, hi, alpha)
  }
  let lo = 0, hi = 90
  let best: BiaxialPoint | null = null
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2, p = onRay(mid)
    if (!p) return best
    best = p
    if (Math.atan2(p.Mny, p.Mnx) < theta) lo = mid
    else hi = mid
  }
  return best
}
