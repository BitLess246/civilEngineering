// ─────────────────────────────────────────────────────────────────────────
// REBAR AS A POLYLINE TO DRAW — bends rounded, ends untouched.
//
// A `RebarRun` stores the corners a detailer dimensions to, plus the inside
// bend diameter at each one. Anything drawing the bar — a 3D view, an
// elevation — wants the real shape instead: the bar leaves the straight a
// tangent distance short of the corner, sweeps the arc, and rejoins beyond it.
//
// Pure geometry, no renderer: plain [x, y, z] in and out, so it is testable
// without mounting anything and reusable by any view.
// ─────────────────────────────────────────────────────────────────────────
import { bendRadius, type RebarRun, type RebarRole, type Vec3 } from './rebarModel'

/** One colour per role, so a cage reads at a glance. */
export const REBAR_ROLE_COLOR: Record<RebarRole, string> = {
  top: '#dc2626',
  bottom: '#2563eb',
  side: '#7c3aed',
  stirrup: '#16a34a',
  tie: '#16a34a',
  hoop: '#0d9488',
  vertical: '#ea580c',
  mat: '#0891b2',
  dowel: '#c026d3',
  diagonal: '#ca8a04',
  trimmer: '#db2777',
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const cross = (a: Vec3, b: Vec3): Vec3 =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** Rotate `v` about a unit `axis` by `ang`, Rodrigues. */
function rotate(v: Vec3, axis: Vec3, ang: number): Vec3 {
  const c = Math.cos(ang), s = Math.sin(ang)
  return add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c)))
}

/**
 * The points replacing one corner, rounded to `radius`.
 *
 * A corner too tight for the legs either side is left SQUARE. Shortening a leg
 * to force the fillet in would move the bar, and a bar drawn where it is not
 * is worse than a sharp corner on a screen.
 */
export function filletCorner(a: Vec3, c: Vec3, b: Vec3, radius: number, seg = 6): Vec3[] {
  const ua = sub(a, c), ub = sub(b, c)
  const la = len(ua), lb = len(ub)
  if (la < 1e-9 || lb < 1e-9) return [c]
  const u = mul(ua, 1 / la), v = mul(ub, 1 / lb)
  const theta = Math.acos(Math.min(1, Math.max(-1, dot(u, v))))   // included angle
  if (theta > Math.PI - 1e-6 || theta < 1e-6) return [c]
  const t = radius / Math.tan(theta / 2)                          // tangent distance
  if (t > la * 0.98 || t > lb * 0.98) return [c]
  const p0 = add(c, mul(u, t))
  const bis = add(u, v)
  const lbis = len(bis)
  if (lbis < 1e-12) return [c]
  const centre = add(c, mul(mul(bis, 1 / lbis), radius / Math.sin(theta / 2)))
  const r0 = sub(p0, centre), r1 = sub(add(c, mul(v, t)), centre)
  const ax = cross(r0, r1)
  const lax = len(ax)
  if (lax < 1e-15) return [c]
  const axis = mul(ax, 1 / lax)
  const sweep = Math.acos(Math.min(1, Math.max(-1, dot(r0, r1) / (len(r0) * len(r1)))))
  const out: Vec3[] = []
  for (let k = 0; k <= seg; k++) out.push(add(centre, rotate(r0, axis, (sweep * k) / seg)))
  return out
}

/** A run's centreline with its bends rounded — what a view actually draws. */
export function runPoints(run: RebarRun): Vec3[] {
  const v = run.path
  if (v.length < 2) return [...v]
  const closed = run.closed === true
  const n = v.length
  const at = (k: number) => v[((k % n) + n) % n]
  const out: Vec3[] = []
  if (!closed) out.push(v[0])
  const lo = closed ? 0 : 1
  const hi = closed ? n - 1 : n - 2
  for (let k = lo; k <= hi; k++) {
    const D = run.bendDia[closed ? k : k - 1]
    const r = D > 0 ? bendRadius(D, run.dia) / 1000 : 0
    out.push(...(r > 0 ? filletCorner(at(k - 1), at(k), at(k + 1), r) : [at(k)]))
  }
  if (!closed) out.push(v[n - 1]); else out.push(out[0])
  return out
}
