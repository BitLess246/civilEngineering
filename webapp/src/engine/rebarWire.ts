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
  chair: '#0ea5e9',
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
 * An open transverse bar — a cross tie, or single-legged stirrup — as the one
 * continuous bar it is.
 *
 * It is specified by the two longitudinal bars it grips. The steel does not run
 * from centre to centre: it runs TANGENT to both, turns a full 180° AROUND each
 * one, and comes back along the other side as the tail. That U is the whole
 * point of the bar — it is what makes a single leg an anchored stirrup rather
 * than a loose dowel.
 *
 * Turning it about a point beside the bar instead of about the bar itself — the
 * first cut — draws a curl that grips nothing and leaves the bar sitting on the
 * end of a straight leg.
 */
export function singleLeggedBar(run: RebarRun): Vec3[] {
  const v = run.path
  const n = v.length
  if (n < 2) return runPoints(run)
  const b0 = v[0], b1 = v[n - 1]
  const d = sub(b1, b0), l = len(d)
  const R = (run.wrapDia && run.wrapDia > 0
    ? bendRadius(run.wrapDia, run.dia)
    : bendRadius(run.bendDia[0] > 0 ? run.bendDia[0] : 4 * run.dia, run.dia)) / 1000
  if (l < 1e-9 || R <= 0 || l < 3 * R) return runPoints(run)
  const u = mul(d, 1 / l)
  // A tie lies in a horizontal plane, so it turns about the vertical; a bar
  // that is itself vertical turns about x instead.
  const axis: Vec3 = Math.abs(u[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
  const p = rotate(u, axis, Math.PI / 2)
  const off = mul(p, R)                     // the leg's own offset off the bars
  const tail = hookTailLength(run.dia)

  const SEG = 12
  /** 180° about `c`, from `from` round to −`from`. */
  const arc = (c: Vec3, from: Vec3): Vec3[] => {
    const out: Vec3[] = []
    for (let k = 1; k < SEG; k++) out.push(add(c, rotate(from, axis, (Math.PI * k) / SEG)))
    return out
  }
  return [
    add(add(b0, off), mul(u, tail)),        // the tail it starts from
    add(b0, off),
    ...arc(b0, off),                        // …round the first bar…
    sub(b0, off),
    sub(b1, off),                           // …along the leg…
    ...arc(b1, mul(off, -1)),               // …round the second…
    add(b1, off),
    sub(add(b1, off), mul(u, tail)),        // …and the tail it ends in
  ]
}

// ─────────────────────────────────────────────────────────────────────────
// A CLOSED TIE IS STILL ONE BAR
//
// A tie is cut from straight stock and bent — nothing is welded, so it cannot
// close on itself. Both ends finish at the SAME corner, which means they have
// to pass each other, and steel cannot occupy steel: over its run the bar
// drifts one diameter to the side, so the end tail comes back TANGENT to the
// start tail instead of through it. Every tie on site is this shallow single
// turn of a helix; drawn as a flat closed rectangle it was a ring, which is a
// different product.
//
// Corner 0 is therefore not a corner at all. It is where the bar is cut, so
// each end turns 135° there and runs its tail into the core (§425.3.2) — two
// hooks, one either side of the drift, each bent around the corner bar.
// ─────────────────────────────────────────────────────────────────────────

/** The least a closed tie can step aside over its run, m: one bar diameter. */
export const selfClearance = (dia: number) => dia / 1000

/**
 * A closed tie as the single continuous bar it is: hook tail, round the loop
 * through every other corner, hook tail — drifting `selfClearance` along the
 * loop normal so the two ends lie against each other rather than in each other.
 */
export function closedTieBar(run: RebarRun): Vec3[] {
  const v = run.path
  const n = v.length
  if (n < 3) return runPoints(run)
  const c0 = v[0]
  const dOut = sub(v[1], c0), dIn = sub(c0, v[n - 1])
  const lOut = len(dOut), lIn = len(dIn)
  if (lOut < 1e-9 || lIn < 1e-9) return runPoints(run)
  const uOut = mul(dOut, 1 / lOut)          // the leg the bar leaves along
  const uIn = mul(dIn, 1 / lIn)             // the leg it comes back on

  // Turning uIn by the corner's deviation gives uOut, so this axis is also the
  // one every arc below sweeps about, in the loop's own direction of travel.
  const nrm = cross(uIn, uOut)
  const lnrm = len(nrm)
  if (lnrm < 1e-9) return runPoints(run)
  const axis = mul(nrm, 1 / lnrm)

  const r = (run.wrapDia && run.wrapDia > 0
    ? bendRadius(run.wrapDia, run.dia)
    : bendRadius(run.bendDia[0] > 0 ? run.bendDia[0] : 4 * run.dia, run.dia)) / 1000
  if (r <= 0) return runPoints(run)

  // ── the corner bar both hooks are bent around ───────────────────────────
  //
  // Not the corner POINT: a tie's corners sit on the cover line precisely so
  // that a bend of this radius centres on the longitudinal bar in the corner.
  // Both ends hook around that same bar — that is what a corner bar is for —
  // so the two arcs share a centre and differ only in where they start.
  const back = mul(uIn, -1)
  const bisv = add(back, uOut)
  const lbis = len(bisv)
  if (lbis < 1e-9) return runPoints(run)
  const theta = Math.acos(Math.min(1, Math.max(-1, dot(back, uOut))))   // included
  if (theta < 1e-6 || theta > Math.PI - 1e-6) return runPoints(run)
  const t = r / Math.tan(theta / 2)
  if (t > 0.45 * lIn || t > 0.45 * lOut) return runPoints(run)
  const W = add(c0, mul(mul(bisv, 1 / lbis), r / Math.sin(theta / 2)))
  const pOut = add(c0, mul(uOut, t))        // where the leaving leg touches it
  const pIn = add(c0, mul(back, t))         // …and where the arriving leg does

  const turn = (HOOK_TURN_DEG * Math.PI) / 180
  const tail = hookTailLength(run.dia)
  const SEG = 8
  /** Forward tangent where the radius vector is `rad`. */
  const tang = (rad: Vec3): Vec3 => {
    const q = rotate(rad, axis, Math.PI / 2)
    return mul(q, 1 / len(q))
  }
  // The bar STARTS with a tail, sweeps 135° round the bar and comes out at
  // `pOut` running along the loop; it ENDS by arriving at `pIn` and sweeping
  // the same 135° on round. The two arcs overlap through the corner — which is
  // exactly where a tie's two ends pass each other, and why it has to step
  // aside.
  const rOut = sub(pOut, W), rIn = sub(pIn, W)
  const hookIn: Vec3[] = []
  for (let k = 0; k <= SEG; k++) hookIn.push(add(W, rotate(rOut, axis, -turn * (1 - k / SEG))))
  const hookOut: Vec3[] = []
  for (let k = 0; k <= SEG; k++) hookOut.push(add(W, rotate(rIn, axis, (turn * k) / SEG)))
  const aEnd = sub(hookIn[0], mul(tang(sub(hookIn[0], W)), tail))
  const bEnd = add(hookOut[SEG], mul(tang(sub(hookOut[SEG], W)), tail))

  const flat: Vec3[] = [aEnd, ...hookIn]
  for (let k = 1; k <= n - 1; k++) {
    const D = run.bendDia[k]
    const rk = run.wrapDia && run.wrapDia > 0 ? r : (D > 0 ? bendRadius(D, run.dia) / 1000 : 0)
    const next = k === n - 1 ? c0 : v[k + 1]
    flat.push(...(rk > 0 ? filletCorner(v[k - 1], v[k], next, rk) : [v[k]]))
  }
  flat.push(...hookOut, bEnd)

  // ── the drift ───────────────────────────────────────────────────────────
  // Spread over the whole run rather than kinked at one place: the bar is bent
  // at its corners and nowhere else, so the only way it can step aside is to
  // lean the whole way round. It ends up at ±½ of the lean either side of the
  // nominal plane, which is what the level it is placed at means.
  const cum = [0]
  for (let k = 1; k < flat.length; k++) cum.push(cum[k - 1] + len(sub(flat[k], flat[k - 1])))
  const total = cum[cum.length - 1]
  if (total < 1e-9) return flat
  const step = leanFor(flat, cum, total, run.dia)
  return flat.map((p, k) => add(p, mul(axis, step * (cum[k] / total - 0.5))))
}

/**
 * How far the bar has to lean, m.
 *
 * A diameter across the closure is the floor, but not always enough: each hook
 * sweeps 135°, which carries it back across the leg the OTHER end arrives on,
 * and those two cross closer together along the bar than its two ends do. Sized
 * off the tightest such pass, so nowhere does the bar come nearer to itself
 * than its own diameter — the whole point of leaning in the first place.
 *
 * Only parts of the run a third of it apart or more are compared: anything
 * nearer than that is the same leg or the same bend, where the bar is meant to
 * be next to itself.
 */
function leanFor(flat: Vec3[], cum: number[], total: number, dia: number): number {
  const d = selfClearance(dia)
  let need = d
  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      const dp = (cum[j] - cum[i]) / total
      if (dp < 1 / 3) continue
      const gap = len(sub(flat[j], flat[i]))
      if (gap >= d) continue                  // already clear in the plane
      need = Math.max(need, Math.sqrt(d * d - gap * gap) / dp)
    }
  }
  return need
}

export function runPolylines(run: RebarRun): Vec3[][] {
  if (!run.hookAllowance) return [runPoints(run)]
  // A CROSS TIE is a single straight bar hooked at both ends (§425.3.2) — an
  // open run, so the closed-loop path below has nothing to work with. Drawn
  // without them it stopped dead at each bar instead of gripping it.
  if (!run.closed) return [singleLeggedBar(run)]
  return [closedTieBar(run)]
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
