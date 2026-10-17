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

/** Illinois (modified regula falsi): the root of f on [lo, hi], f(lo) and
 *  f(hi) of opposite sign — superlinear on the smooth stretches, and never
 *  leaves the bracket, so a kink (a bar yielding, the block turning a corner)
 *  costs a few steps, not the root. */
function illinois(f: (x: number) => number, lo: number, hi: number, tol: number): number {
  let a = lo, b = hi, fa = f(a), fb = f(b), side = 0
  if (fa === 0) return a
  if (fb === 0) return b
  for (let k = 0; k < 100 && Math.abs(b - a) > tol; k++) {
    const c = (a * fb - b * fa) / (fb - fa), fc = f(c)
    if (fc === 0) return c
    if (fc * fb > 0) { b = c; fb = fc; if (side === -1) fa /= 2; side = -1 }
    else { a = c; fa = fc; if (side === 1) fb /= 2; side = 1 }
  }
  return (a + b) / 2
}

/** The nominal capacity along the load ray ex = Mnx/Pn, ey = Mny/Pn, mm (the
 *  convention `pmCapacityBiaxial` uses: eX = Mux/Pu): the surface point with
 *  that moment direction and that resultant eccentricity. Two nested root
 *  finds — for a trial α, the c at which e·Pn = |Mn| (e·Pn − |Mn| rises with
 *  c); then α turned until the moment points along the ray. Fast enough
 *  (~10² section evaluations) to run inside the design check. */
export function biaxialAlongRay(s: BiaxialSection, ex: number, ey: number): BiaxialPoint | null {
  const e = Math.hypot(ex, ey) / 1000                                        // m
  const theta = Math.atan2(ey, ex)
  const cLo = 1e-3 * Math.min(s.b, s.h), cHi = 50 * Math.max(s.b, s.h)
  const g = (p: BiaxialPoint) => e * p.Pn - Math.hypot(p.Mnx, p.Mny)
  const onRay = (alpha: number): BiaxialPoint | null => {
    if (g(biaxialPoint(s, cHi, alpha)) < 0 || g(biaxialPoint(s, cLo, alpha)) > 0) return null
    const c = illinois((c) => g(biaxialPoint(s, c, alpha)), cLo, cHi, 1e-7 * Math.max(s.b, s.h))
    return biaxialPoint(s, c, alpha)
  }
  if (ey <= 1e-12) return onRay(0)
  if (ex <= 1e-12) return onRay(90)
  const dir = (alpha: number) => { const p = onRay(alpha); return p ? Math.atan2(p.Mny, p.Mnx) - theta : NaN }
  const d0 = dir(0), d90 = dir(90)
  if (!(d0 <= 0 && d90 >= 0)) return null
  return onRay(illinois(dir, 0, 90, 1e-6))
}

/** A rectangular tied cage as bar points — the same arrangement `barLayers`
 *  (columnDesign) strain-checks, so the exact surface and the uniaxial checks
 *  see one physical cage. `two-face`: numBars/2 across each face ⟂ h;
 *  `all-around`: nx per b-face and the intermediate rows of 2 up the sides. */
export function rectCageBars(i: {
  b: number; h: number; cover: number; tieDia: number; barDia: number
  numBars: number; layout?: 'two-face' | 'all-around'
}, nx?: number, ny?: number): BiaxialBar[] {
  const dP = i.cover + i.tieDia + i.barDia / 2
  const Ab = (Math.PI / 4) * i.barDia ** 2
  const xs = (n: number) => Array.from({ length: n }, (_, k) => (n === 1 ? 0 : -i.b / 2 + dP + (k * (i.b - 2 * dP)) / (n - 1)))
  const yT = i.h / 2 - dP
  if ((i.layout ?? 'two-face') === 'two-face' || i.numBars < 4) {
    const n = Math.max(1, Math.round(i.numBars / 2))
    return [...xs(n).map((x) => ({ x, y: yT, As: Ab })), ...xs(n).map((x) => ({ x, y: -yT, As: Ab }))]
  }
  const NX = nx ?? 2, NY = ny ?? 2
  const bars = [...xs(NX).map((x) => ({ x, y: yT, As: Ab })), ...xs(NX).map((x) => ({ x, y: -yT, As: Ab }))]
  for (let k = 1; k <= NY - 2; k++) {
    const y = yT - (k * 2 * yT) / (NY - 1)
    bars.push({ x: -i.b / 2 + dP, y, As: Ab }, { x: i.b / 2 - dP, y, As: Ab })
  }
  return bars
}
