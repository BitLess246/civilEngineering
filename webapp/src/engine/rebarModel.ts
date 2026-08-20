// ─────────────────────────────────────────────────────────────────────────
// THE REBAR MODEL — one description of every bar, for every consumer.
//
// Until now a bar existed three times over, and the three never agreed:
//
//   • the DETAIL SHEETS drew one, straight into `PlanPrimitive[]`, with the
//     geometry inlined at the point of drawing;
//   • the TAKE-OFF counted a different one, from closed-form length formulas
//     (`tiePerimeter`, `tieHook`) that never looked at what was drawn;
//   • anything 3D would have had to invent a third.
//
// So a sheet could show a hook the take-off had not paid for, and neither
// would notice. This module is the one description they all read: a bar is a
// CENTRELINE POLYLINE in model space plus the bend diameters at its corners.
// From that single object you can draw it in any view, develop its cut length,
// weigh it, and — later — string it in 3D.
//
// COORDINATES. Model space, metres, matching `model.ts`: x and z horizontal,
// **y up**. Bar and bend sizes are mm, cut lengths mm, weights kg. Drawings
// project out of this space; nothing here knows about a sheet.
//
// WHAT A PATH MEANS. The vertices are the INTERSECTIONS of the straight legs —
// the corner a detailer dimensions to — not the tangent points of the bends.
// The fabricated bar cuts each corner with an arc, so it is shorter than the
// polyline. `cutLength` applies that correction; see `bendDeduction`.
// ─────────────────────────────────────────────────────────────────────────
import type { PlanPrimitive } from './planRenderer'

export type Vec3 = readonly [number, number, number]

/** Steel density, kg/m³ — the same figure the take-off uses. */
export const STEEL_DENSITY = 7850

/** Nominal area of one bar, m². */
export const barAreaM2 = (dia: number) => (Math.PI * (dia / 1000) ** 2) / 4
/** Mass per metre of one bar, kg/m. */
export const kgPerM = (dia: number) => barAreaM2(dia) * STEEL_DENSITY

export type RebarRole =
  | 'top' | 'bottom' | 'side'      // longitudinal flexural steel
  | 'stirrup' | 'tie' | 'hoop'     // transverse steel
  | 'vertical'                     // column and wall verticals
  | 'mat'                          // footing and slab mats
  | 'dowel' | 'diagonal' | 'trimmer'

/**
 * One bar shape, and how many identical copies of it the member carries.
 *
 * `count` is what keeps a cage honest without exploding it: a hoop set is one
 * `RebarRun` with `count = 21`, not 21 runs, so the take-off multiplies and a
 * 3D view instances. Where the copies are NOT identical — a hoop zone that
 * changes spacing — that is two runs, because they really are two shapes.
 */
export interface RebarRun {
  /** Schedule mark, e.g. 'B1-T1'. Unique within a cage. */
  mark: string
  /** Bar diameter, mm. */
  dia: number
  role: RebarRole
  /** The member this bar belongs to — the answer to "which bar is this?". */
  member: string
  /** Centreline vertices in model space, m. Corners, not tangent points. */
  path: Vec3[]
  /**
   * INSIDE bend diameter at each INTERIOR vertex, mm — `path.length - 2`
   * entries for an open run, `path.length` for a closed one. An empty array
   * means a straight bar.
   */
  bendDia: number[]
  /** True for a stirrup, tie or hoop: the last vertex joins back to the first. */
  closed?: boolean
  /**
   * Developed length beyond the polyline, mm — the anchoring hooks a closed
   * tie's two free ends carry, which no vertex of a closed loop can express.
   * See `stirrupHookAllowance`.
   */
  hookAllowance?: number
  /** Identical copies. */
  count: number
}

export interface RebarCage {
  member: string
  runs: RebarRun[]
}

// ── bend geometry ────────────────────────────────────────────────────────

/**
 * Minimum INSIDE bend diameter for a standard hook on a longitudinal bar, mm.
 * NSCP Table 425.3.1 / ACI 318-14 Table 25.3.1: 6db to ⌀25, 8db for ⌀28–⌀36,
 * 10db above.
 */
export function hookBendDiameter(db: number): number {
  return (db <= 25 ? 6 : db <= 36 ? 8 : 10) * db
}

/**
 * Minimum INSIDE bend diameter for a stirrup, tie or hoop, mm.
 *
 * NSCP Table 425.3.2 / ACI 318-14 Table 25.3.2 lets transverse steel turn
 * tighter than a main bar: 4db up to ⌀16 and 6db for ⌀19–⌀25. Above ⌀25 the
 * table stops and Table 425.3.1 governs again — a ⌀28 tie is unusual, but
 * bending one to 6db would be wrong.
 */
export function stirrupBendDiameter(db: number): number {
  if (db <= 16) return 4 * db
  if (db <= 25) return 6 * db
  return hookBendDiameter(db)
}

/** Bar-centreline bend radius for an inside diameter D on a `db` bar, mm. */
export const bendRadius = (bendDia: number, db: number) => bendDia / 2 + db / 2

/**
 * How much shorter a bent bar is than the polyline drawn through its corners,
 * for ONE bend, mm.
 *
 * The bar does not reach the corner: it leaves the straight at a tangent point
 * R·tan(θ/2) short of it and rejoins R·tan(θ/2) beyond, travelling R·θ around
 * the arc in between. So the polyline over-counts by
 *
 *     R·(2·tan(θ/2) − θ)          θ in radians, R the centreline radius
 *
 * which for the usual 90° bend is 0.4292·R. Buying steel to the polyline
 * length instead pays for that corner at every bend in the job.
 *
 * `turnDeg` is the DEVIATION from straight, not the included angle: a bar
 * turning square has θ = 90°, and a straight bar θ = 0.
 */
export function bendDeduction(bendDia: number, db: number, turnDeg: number): number {
  const t = Math.abs(turnDeg)
  if (t < 1e-9) return 0
  // A 180° turn folds the bar back on itself — the tangent distance runs to
  // infinity, so the polyline cannot describe it. A real 180° hook is two
  // bends with a leg between them, and has to be modelled that way.
  if (t >= 180) return 0
  const R = bendRadius(bendDia, db)
  const th = (t * Math.PI) / 180
  return R * (2 * Math.tan(th / 2) - th)
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Straight-line length through the polyline's corners, m. */
export function polylineLength(path: Vec3[], closed = false): number {
  let s = 0
  for (let k = 1; k < path.length; k++) s += norm(sub(path[k], path[k - 1]))
  if (closed && path.length > 2) s += norm(sub(path[0], path[path.length - 1]))
  return s
}

/**
 * Deviation from straight at each bend, degrees — one per entry of `bendDia`.
 *
 * Interior vertices for an open run; every vertex for a closed one, where the
 * last segment wraps to the first.
 */
export function turnAngles(path: Vec3[], closed = false): number[] {
  const n = path.length
  const out: number[] = []
  const at = (k: number) => path[((k % n) + n) % n]
  const lo = closed ? 0 : 1
  const hi = closed ? n - 1 : n - 2
  for (let k = lo; k <= hi; k++) {
    const a = sub(at(k), at(k - 1)), b = sub(at(k + 1), at(k))
    const la = norm(a), lb = norm(b)
    if (la < 1e-12 || lb < 1e-12) { out.push(0); continue }
    const c = Math.min(1, Math.max(-1, dot(a, b) / (la * lb)))
    out.push((Math.acos(c) * 180) / Math.PI)
  }
  return out
}

/**
 * Developed length of one bar, mm — what the bender cuts.
 *
 * The polyline through the corners, less the corner each bend cuts off. A
 * missing or short `bendDia` array is read as "no bend there", which keeps a
 * half-specified run honest: it reports the polyline length, never less.
 */
export function cutLength(run: RebarRun): number {
  const straight = polylineLength(run.path, run.closed) * 1000
  const turns = turnAngles(run.path, run.closed)
  let ded = 0
  for (let k = 0; k < turns.length; k++) {
    const D = run.bendDia[k]
    if (D == null || D <= 0) continue
    ded += bendDeduction(D, run.dia, turns[k])
  }
  return Math.max(0, straight - ded + (run.hookAllowance ?? 0))
}

/** Fabricated weight of a run — every copy of it, kg. */
export function runWeight(run: RebarRun): number {
  return (cutLength(run) / 1000) * kgPerM(run.dia) * run.count
}

/** Total fabricated weight of a cage, kg. */
export function cageWeight(cage: RebarCage): number {
  return cage.runs.reduce((s, r) => s + runWeight(r), 0)
}

// ── projection ───────────────────────────────────────────────────────────

/**
 * A drawing plane: where the view sits and which way is right and down on the
 * page. `u` and `v` should be unit vectors; `v` points DOWN the sheet, because
 * that is the direction primitive space grows in.
 */
export interface ViewPlane {
  origin: Vec3
  u: Vec3
  v: Vec3
}

/**
 * The plane an elevation is drawn on.
 *
 * `along` is the member's own direction — the beam's span, the wall's length.
 * Down the page is down in the world, so a bar high in the member draws high
 * on the sheet.
 */
export function elevationPlane(along: Vec3, origin: Vec3 = [0, 0, 0]): ViewPlane {
  const l = norm(along)
  const u: Vec3 = l < 1e-12 ? [1, 0, 0] : [along[0] / l, along[1] / l, along[2] / l]
  return { origin, u, v: [0, -1, 0] }
}

/** The plane a plan is drawn on — looking down, with +z running down the page. */
export function planPlane(origin: Vec3 = [0, 0, 0]): ViewPlane {
  return { origin, u: [1, 0, 0], v: [0, 0, 1] }
}

/** One point, projected onto a plane. */
export function projectPoint(p: Vec3, plane: ViewPlane): [number, number] {
  const d = sub(p, plane.origin)
  return [dot(d, plane.u), dot(d, plane.v)]
}

/** A whole path, projected onto a plane. */
export function projectPath(path: Vec3[], plane: ViewPlane): [number, number][] {
  return path.map((p) => projectPoint(p, plane))
}

export interface RunStyle {
  stroke: string
  width?: number
  dash?: number[]
}

/**
 * A run, as something a sheet can paint.
 *
 * Corners are drawn square here. A sheet that wants the bend shown as the arc
 * it really is — the beam elevation does, at its end hooks — fillets the
 * corner itself from `bendDia`, which is why that number travels with the run
 * rather than being baked into the path.
 */
export function runToPrimitive(run: RebarRun, plane: ViewPlane, style: RunStyle): PlanPrimitive {
  const pts = projectPath(run.path, plane)
  return {
    kind: 'path',
    stroke: style.stroke,
    width: style.width ?? 1.6,
    dash: style.dash,
    fill: 'none',
    closed: run.closed,
    cap: 'round',
    join: 'round',
    cmds: pts.map(([x, y], k) => ({ c: k === 0 ? 'M' : 'L', x, y } as const)),
  }
}

/** Every run in a cage, painted the same way. */
export function cageToPrimitives(cage: RebarCage, plane: ViewPlane, style: (r: RebarRun) => RunStyle): PlanPrimitive[] {
  return cage.runs.map((r) => runToPrimitive(r, plane, style(r)))
}

/**
 * Cut allowance for the two 135° seismic hooks on a closed stirrup or tie, mm.
 *
 * §425.3.2 gives the EXTENSION beyond the bend, max(6·dt, 75) — that is what
 * the detail dimensions and what the bender measures once the bend is made.
 * The bar also has to travel AROUND the bend, about 3·dt more. Buying to the
 * extension alone leaves every stirrup in the job short by that much, twice
 * over.
 *
 * A closed loop's vertices cannot say this: the hooks are what happens at the
 * two free ends the loop pretends it does not have. So it rides on the run as
 * an allowance, and `cutLength` adds it.
 */
export function stirrupHookAllowance(dt: number): number {
  return 2 * (Math.max(6 * dt, 75) + 3 * dt)
}

// ── the four corner bars ─────────────────────────────────────────────────

/**
 * Longitudinal bars in each face of a beam that are there whatever the
 * analysis asked for.
 *
 * Every beam carries four corner bars, one in each corner of the cage — two
 * top, two bottom. They are what the stirrups are tied to, so they exist even
 * where the design needs no steel at all in that face. A singly reinforced
 * beam still has two bars on its compression side; they simply do not appear
 * in the analysis.
 */
export const CORNER_BARS_PER_FACE = 2

/**
 * Bars in one face that run the full length and are never cranked.
 *
 * Two rules, and the governing one wins:
 *
 *   • the two corner bars, always — nothing may curtail them;
 *   • the code's share of the designed steel: §409.7.3.8.1 keeps at least a
 *     quarter of the positive steel running into the support, §409.7.3.8.4 at
 *     least a third of the negative steel past the inflection point.
 *
 * `designed` is what the analysis called for in this face, which may be zero;
 * `keepFraction` is that code share. The result is never below two and never
 * above `designed` once `designed` exceeds two, so a face with eight bars
 * curtails six of them and still keeps its corners.
 */
export function continuousBars(designed: number, keepFraction: number): number {
  const byCode = Math.ceil(Math.max(0, designed) * keepFraction)
  return Math.max(CORNER_BARS_PER_FACE, Math.min(Math.max(0, designed), byCode))
}

/**
 * How many longitudinal bars a rectangular cage can actually take, given a
 * request.
 *
 * Four corners, and every intermediate bar on one face has a twin on the
 * opposite one — so the remainder after the corners has to be EVEN. An odd
 * request cannot be placed symmetrically and is rounded UP, which is what a
 * detailer does and what `barLayers` already does for a lone bar in a beam.
 *
 * Rounding up ADDS steel, so a column detailed this way carries at least what
 * the analysis asked for. Every consumer has to agree on it: the P–M check,
 * the cage, the schedule and the take-off must be talking about the same
 * column, or the one that is checked is not the one that gets built.
 *
 * Bars on a SPIRAL sit on a circle, where any count from six up is placeable —
 * this rule is for rectangular tied cages only.
 */
export function placedBarCount(bars: number): number {
  const n = Math.max(4, Math.round(bars))
  const rem = n - 4
  return 4 + rem + (rem % 2)
}

/** §409.7.3.8.4 — a third of the negative steel continues past the inflection point. */
export const KEEP_TOP = 1 / 3
/** §409.7.3.8.1 — a quarter of the positive steel runs into the support. */
export const KEEP_BOTTOM = 1 / 4

/** Commercial bar stock length, m — what forces a splice on a long member. */
export const STOCK_BAR_LENGTH = 6

/**
 * How many Class B laps a continuous bar of `length` needs, given stock.
 *
 * The corner bars are continuous by intent, so the only thing that may
 * interrupt one is that it cannot be bought in one piece. Each lap consumes
 * `lap` of the next stick, so the reach per stick is what is left after it.
 */
export function splicesRequired(length: number, lapM: number, stock = STOCK_BAR_LENGTH): number {
  const reach = Math.max(0.1, stock - Math.max(0, lapM))
  if (length <= stock + 1e-9) return 0
  return Math.ceil((length - stock) / reach)
}
