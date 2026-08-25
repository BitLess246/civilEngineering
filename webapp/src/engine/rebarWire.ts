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
  // A tie bent around a bar curls at (wrapDia + dia)/2 — the two in contact.
  // The fabricated bend may legally be looser, but drawn at that looser radius
  // the arc sweeps INSIDE the bar and the bar ends up behind the tie instead of
  // nestled in it.
  const wrap = run.wrapDia && run.wrapDia > 0 ? bendRadius(run.wrapDia, run.dia) / 1000 : 0
  for (let k = lo; k <= hi; k++) {
    const D = run.bendDia[closed ? k : k - 1]
    const r = wrap > 0 ? wrap : (D > 0 ? bendRadius(D, run.dia) / 1000 : 0)
    out.push(...(r > 0 ? filletCorner(at(k - 1), at(k), at(k + 1), r) : [at(k)]))
  }
  if (!closed) out.push(v[n - 1]); else out.push(out[0])
  return out
}

// ─────────────────────────────────────────────────────────────────────────
// HOOK TAILS ON A CLOSED TIE
//
// A tie or stirrup is stored as a closed loop plus a `hookAllowance` — a
// LENGTH, for the bill. The two 135° hooks the loop's vertices cannot express
// (§425.3.2) were therefore never drawn, so a cage rendered as open rectangles
// with no ends: the one detail an inspector looks for first.
//
// Both ends of the bar meet at the loop's first corner. Each folds back 135°
// and runs a straight tail of max(6d_t, 75 mm) diagonally into the core, which
// is the pair of strokes the section drawing has always shown.
// ─────────────────────────────────────────────────────────────────────────

/** §425.3.2 — 135° seismic hook on transverse steel. */
export const HOOK_TURN_DEG = 135

/** Straight tail beyond the bend, m: max(6d_t, 75 mm). */
export function hookTailLength(dia: number): number {
  return Math.max(6 * dia, 75) / 1000
}

/**
 * Every polyline a run draws: its filleted centreline, plus a tail for each
 * hook a closed run carries.
 *
 * Separate polylines rather than one, because a hook genuinely leaves the loop
 * — joining them would draw a bar running through the core that does not exist.
 */
/**
 * The two hooks on an open transverse bar — a cross tie, or single-legged
 * stirrup.
 *
 * Each end turns a FULL 180° around the longitudinal bar it grips and the tail
 * runs back beside the leg it came in on. That U is the whole bar: it is what
 * makes a single leg an anchored stirrup rather than a loose dowel, and it is
 * what the detail draws. A 135° tail folded off the leg — which is what this
 * drew — is the hook a CLOSED tie's ends carry, and on an open bar it grips
 * nothing.
 *
 * Both U's turn the same way, so the two tails lie on the same side.
 */
export function openEndHooks(run: RebarRun): Vec3[][] {
  const v = run.path
  const n = v.length
  if (n < 2) return []
  const tail = hookTailLength(run.dia)
  // It bends around the bar it grips, so that bar sets the radius.
  const r = (run.wrapDia && run.wrapDia > 0
    ? bendRadius(run.wrapDia, run.dia)
    : bendRadius(run.bendDia[0] > 0 ? run.bendDia[0] : 4 * run.dia, run.dia)) / 1000
  const dir = (a: Vec3, b: Vec3): Vec3 | null => {
    const d = sub(b, a), l = len(d)
    return l < 1e-9 ? null : mul(d, 1 / l)
  }
  const along = dir(v[0], v[n - 1])
  if (!along || r <= 0) return []
  // A tie lies in a horizontal plane, so it turns about the vertical; a bar
  // that is itself vertical turns about x instead.
  const axis: Vec3 = Math.abs(along[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
  const p = rotate(along, axis, Math.PI / 2)      // one side, shared by both ends

  const SEG = 12
  /** A 180° turn at `e`, bulging along `out`, finishing in a tail back inboard. */
  const uturn = (e: Vec3, out: Vec3, sign: number): Vec3[] => {
    const c = add(e, mul(p, r))
    const arc: Vec3[] = []
    for (let k = 0; k <= SEG; k++) {
      arc.push(add(c, rotate(mul(p, -r), axis, (sign * Math.PI * k) / SEG)))
    }
    arc.push(add(arc[arc.length - 1], mul(out, -tail)))
    return arc
  }
  return [
    uturn(v[0], mul(along, -1), 1),
    uturn(v[n - 1], along, -1),
  ]
}

export function runPolylines(run: RebarRun): Vec3[][] {
  const spine = runPoints(run)
  const v = run.path
  if (!run.hookAllowance) return [spine]
  // A CROSS TIE is a single straight bar hooked at both ends (§425.3.2) — an
  // open run, so the closed-loop path below has nothing to work with. Drawn
  // without them it stopped dead at each bar instead of gripping it.
  if (!run.closed) return [spine, ...openEndHooks(run)]
  if (v.length < 3) return [spine]
  const n = v.length
  const p0 = v[0]
  const dOut = sub(v[1], p0), dIn = sub(p0, v[n - 1])
  const lOut = len(dOut), lIn = len(dIn)
  if (lOut < 1e-9 || lIn < 1e-9) return [spine]
  const uOut = mul(dOut, 1 / lOut)          // leaving the corner
  const uIn = mul(dIn, 1 / lIn)             // arriving at it

  // The loop's plane, and the direction into the core at this corner.
  const nrm = cross(uOut, mul(uIn, -1))
  const lnrm = len(nrm)
  if (lnrm < 1e-9) return [spine]
  const axis = mul(nrm, 1 / lnrm)
  const inward = sub(uOut, uIn)             // corner bisector, pointing inboard
  const lb = len(inward)
  const bis = lb > 1e-9 ? mul(inward, 1 / lb) : uOut

  const turn = (HOOK_TURN_DEG * Math.PI) / 180
  const tail = hookTailLength(run.dia)
  /** Fold `d` by 135°, whichever way puts the tail inside the core. */
  const fold = (d: Vec3): Vec3 => {
    const a = rotate(d, axis, turn), b = rotate(d, axis, -turn)
    return dot(a, bis) >= dot(b, bis) ? a : b
  }

  // ── ONE curl at the corner, and two STRAIGHT tails off it ───────────────
  //
  // The corner already has a bend — the loop's own, filleted like every other.
  // The hooks are what leaves it: two straight extensions at 135°, into the
  // core. Giving each tail a bend of its own drew a second and third curl on
  // top of the first, which is the knot that appeared at that corner; starting
  // them at the corner POINT instead drew them cutting across it, because the
  // loop is filleted there and never passes through it.
  //
  // They start on the bar, at the tangent points where the corner's own arc
  // meets each leg — so the tails come off the steel, one either side of the
  // curl, and run straight.
  const theta = Math.acos(Math.min(1, Math.max(-1, dot(mul(uIn, -1), uOut))))
  const r = (run.wrapDia && run.wrapDia > 0
    ? bendRadius(run.wrapDia, run.dia)
    : bendRadius(run.bendDia[0] > 0 ? run.bendDia[0] : 4 * run.dia, run.dia)) / 1000
  const t = theta > 1e-6 && theta < Math.PI - 1e-6 ? r / Math.tan(theta / 2) : 0
  const back = Math.min(t, 0.45 * lIn), fwd = Math.min(t, 0.45 * lOut)
  const qIn = add(p0, mul(uIn, -back))      // tangent point on the arriving leg
  const qOut = add(p0, mul(uOut, fwd))      // …and on the leaving one
  return [
    spine,
    [qIn, add(qIn, mul(fold(uIn), tail))],
    [qOut, add(qOut, mul(fold(mul(uOut, -1)), tail))],
  ]
}

// ─────────────────────────────────────────────────────────────────────────
// BARS AS SOLID TUBES
//
// A ⌀20 bar drawn as a 1-pixel line reads as a wire diagram, not as a cage:
// it has no thickness to compare against the cover, the hooks vanish at any
// distance, and two bars in the same plane are indistinguishable. Sweeping a
// circle of the bar's own radius along the centreline gives the cage the
// reference detail shows, and makes bar SIZE visible instead of implied.
//
// Frames are parallel-transported rather than Frenet: a Frenet frame is
// undefined on the straight runs that make up most of a bar, and flips through
// 180° at an inflection, which twists the tube.
// ─────────────────────────────────────────────────────────────────────────

export interface TubeMesh {
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
}

export const EMPTY_TUBE: TubeMesh = {
  positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0),
}

/** A round bar of `radius` swept along `pts`, capped flat at both cut ends. */
export function tubeFromPolyline(pts: Vec3[], radius: number, radial = 8): TubeMesh {
  const p: Vec3[] = []
  for (const q of pts) if (!p.length || len(sub(q, p[p.length - 1])) > 1e-9) p.push(q)
  const n = p.length
  if (n < 2 || radius <= 0 || radial < 3) return EMPTY_TUBE

  // Tangents: the mean of the two adjacent segment directions, so a bend gets
  // one mitred ring instead of two rings fighting over the corner.
  const tan: Vec3[] = []
  for (let i = 0; i < n; i++) {
    const a = i > 0 ? mul(sub(p[i], p[i - 1]), 1 / len(sub(p[i], p[i - 1]))) : null
    const b = i < n - 1 ? mul(sub(p[i + 1], p[i]), 1 / len(sub(p[i + 1], p[i]))) : null
    const t = a && b ? add(a, b) : (a ?? b) as Vec3
    const lt = len(t)
    tan.push(lt > 1e-9 ? mul(t, 1 / lt) : (b ?? a) as Vec3)
  }

  // Parallel transport: start from any normal, then rotate it by the same turn
  // the tangent makes at each vertex, so the ring never spins about the bar.
  const nor: Vec3[] = []
  const seed: Vec3 = Math.abs(tan[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  let cur = cross(tan[0], seed)
  cur = mul(cur, 1 / Math.max(len(cur), 1e-12))
  nor.push(cur)
  for (let i = 1; i < n; i++) {
    const ax = cross(tan[i - 1], tan[i])
    const s = len(ax)
    if (s > 1e-9) {
      cur = rotate(cur, mul(ax, 1 / s), Math.atan2(s, dot(tan[i - 1], tan[i])))
    }
    // re-orthogonalise, or accumulated float drift tilts the ring off the bar
    cur = sub(cur, mul(tan[i], dot(cur, tan[i])))
    cur = mul(cur, 1 / Math.max(len(cur), 1e-12))
    nor.push(cur)
  }

  const vertsPerRing = radial
  const pos = new Float32Array((n * vertsPerRing + 2) * 3)
  const nrm = new Float32Array((n * vertsPerRing + 2) * 3)
  for (let i = 0; i < n; i++) {
    const bi = cross(tan[i], nor[i])
    for (let j = 0; j < radial; j++) {
      const a = (2 * Math.PI * j) / radial
      const dir = add(mul(nor[i], Math.cos(a)), mul(bi, Math.sin(a)))
      const o = (i * radial + j) * 3
      pos[o] = p[i][0] + dir[0] * radius
      pos[o + 1] = p[i][1] + dir[1] * radius
      pos[o + 2] = p[i][2] + dir[2] * radius
      nrm[o] = dir[0]; nrm[o + 1] = dir[1]; nrm[o + 2] = dir[2]
    }
  }
  // cap centres, last two vertices
  const c0 = n * radial, c1 = c0 + 1
  for (const [idx, at, t] of [[c0, p[0], mul(tan[0], -1)], [c1, p[n - 1], tan[n - 1]]] as const) {
    const o = idx * 3
    pos[o] = at[0]; pos[o + 1] = at[1]; pos[o + 2] = at[2]
    nrm[o] = t[0]; nrm[o + 1] = t[1]; nrm[o + 2] = t[2]
  }

  const idx = new Uint32Array((n - 1) * radial * 6 + radial * 6)
  let k = 0
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const j2 = (j + 1) % radial
      const a = i * radial + j, b = i * radial + j2
      const c = (i + 1) * radial + j2, d = (i + 1) * radial + j
      idx[k++] = a; idx[k++] = b; idx[k++] = c
      idx[k++] = a; idx[k++] = c; idx[k++] = d
    }
  }
  for (let j = 0; j < radial; j++) {
    const j2 = (j + 1) % radial
    idx[k++] = c0; idx[k++] = j2; idx[k++] = j                       // start cap
    idx[k++] = c1; idx[k++] = (n - 1) * radial + j; idx[k++] = (n - 1) * radial + j2
  }
  return { positions: pos, normals: nrm, indices: idx }
}
