// ─────────────────────────────────────────────────────────────────────────
// WHERE A STAIR FLIGHT ACTUALLY IS, and what it weighs on the frame.
//
// A `Stair` names two members and a riser count. Everything else — the rise,
// the run, R, G, the slope, the four corners of the waist — follows from where
// those two members are, and is worked out here.
//
// WHY DERIVE RATHER THAN DECLARE. A stair has equal risers; that is not a
// preference. If R, G and the two support levels were all stated
// independently, three of them would fix the fourth and a model could hold a
// flight whose treads do not reach the landing it lands on. Deriving R and G
// from the frame closes the geometry by construction, and turns validation
// from "do these four numbers agree?" into the question worth asking: "is the
// stair this frame implies a usable one?"
//
// THE LOAD PATH. The flight is not meshed. Its reactions go onto the two
// members it bears on, as point loads spread across the bearing width — the
// total and the split between supports are then exact, and the local bending
// under the strip converges to the partial UDL the model has no load kind for.
// One point load at the strip's centroid would double the midspan moment of a
// flight that covers its whole support; a full-length UDL would smear a narrow
// flight over a beam that continues past it. Neither is a good default, and
// this needs no new load kind to avoid both.
//
// Units: geometry m, sections and bar sizes mm, loads kN and kPa. Model space,
// y up.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, Stair, RectSection, ModelLoad } from './model'
import { stairGeometry, stairLoads } from './stair'

export type Vec3 = [number, number, number]

/** How a derived stair reads to somebody who has to walk up it. */
export interface StairUsability {
  /** 2R + G, mm — the going-plus-two-risers pace rule. A comfort rule of
   *  thumb (Blondel), NOT a code clause, and labelled as one. */
  pace: number
  paceOK: boolean
  /** R and G inside the ranges ordinary stairs are built in. */
  riserOK: boolean
  goingOK: boolean
}

export interface PlacedStair {
  id: string
  /** Vertical climb and horizontal travel between the two supports, m. */
  rise: number
  run: number
  /** Derived and therefore equal: R = rise/risers, G = run/risers. mm. */
  R: number
  G: number
  thetaDeg: number
  /** Span of the waist along its own slope, m — what the flight is designed for. */
  slopeSpan: number
  /** Unit vectors: down the flight in plan, and across its width. */
  runDir: Vec3
  widthDir: Vec3
  /** The waist's TOP surface, four corners: low edge then high edge, each
   *  left-to-right across the width. */
  lowEdge: [Vec3, Vec3]
  highEdge: [Vec3, Vec3]
  width: number
  waist: number
  usable: StairUsability
}

/** Comfort ranges. Not code clauses — see `StairUsability.pace`. */
export const RISER_RANGE = [100, 200] as const
export const GOING_RANGE = [250, 350] as const
export const PACE_RANGE = [550, 700] as const

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]

/** Plan-projected unit direction of a member, or null if it is vertical. */
export function planDir(a: Vec3, b: Vec3): Vec3 | null {
  const dx = b[0] - a[0], dz = b[2] - a[2]
  const L = Math.hypot(dx, dz)
  return L < 1e-9 ? null : [dx / L, 0, dz / L]
}

/** The in-plan normal to `u`, turned 90°. */
const planNormal = (u: Vec3): Vec3 => [-u[2], 0, u[0]]

/** Both ends and the section of one member, or null when anything is missing. */
function memberLine(model: StructuralModel, id: string): { a: Vec3; b: Vec3; sec: RectSection } | null {
  const m = model.members.find((x) => x.id === id)
  if (!m) return null
  const ni = model.nodes.find((n) => n.id === m.i)
  const nj = model.nodes.find((n) => n.id === m.j)
  const sec = model.sections.find((s) => s.id === m.section)
  if (!ni || !nj || !sec) return null
  return { a: [ni.x, ni.y, ni.z], b: [nj.x, nj.y, nj.z], sec }
}

/** A member's midpoint, and the level of its TOP — where a flight bears. */
function bearing(line: { a: Vec3; b: Vec3; sec: RectSection }): { mid: Vec3; top: number } {
  const mid: Vec3 = mul(add(line.a, line.b), 0.5)
  // The node sits at the section centroid, so the top face is h/2 above it —
  // the same convention `cageBuilder` places a beam's soffit by.
  return { mid, top: mid[1] + line.sec.h / 2000 }
}

/**
 * Place one flight, or say why it cannot be placed.
 *
 * Returns null when the model does not hold enough to place it at all (a
 * missing member or node); a flight that is placeable but odd comes back
 * placed, with `usable` saying so. Telling those two apart matters: the first
 * is a broken model, the second is a stair somebody may still want to build.
 */
export function placeStair(model: StructuralModel, s: Stair): PlacedStair | null {
  const lo = memberLine(model, s.low), hi = memberLine(model, s.high)
  if (!lo || !hi || s.risers < 1) return null

  const uLo = planDir(lo.a, lo.b), uHi = planDir(hi.a, hi.b)
  if (!uLo || !uHi) return null                       // a vertical member is no support for a flight

  const bLo = bearing(lo), bHi = bearing(hi)
  const rise = bHi.top - bLo.top
  if (!(rise > 1e-6)) return null                     // no climb, or the two are the wrong way round

  // The flight runs across the gap, so its direction is the in-plan normal to
  // the support it starts from, pointed at the support it lands on.
  let runDir = planNormal(uLo)
  const gap = sub(bHi.mid, bLo.mid)
  const along = gap[0] * runDir[0] + gap[2] * runDir[2]
  if (along < 0) runDir = mul(runDir, -1)
  const run = Math.abs(along)
  if (!(run > 1e-6)) return null                      // the supports sit on the same line

  const R = (rise * 1000) / s.risers
  const G = (run * 1000) / s.risers
  const { thetaDeg } = stairGeometry(R, G)
  const slopeSpan = Math.hypot(run, rise)

  // Across the width, along the low member's own axis, shifted by `offset`.
  const widthDir = uLo
  const centre = add(bLo.mid, mul(widthDir, s.offset ?? 0))
  const half = mul(widthDir, s.width / 2)
  const lowMid: Vec3 = [centre[0], bLo.top, centre[2]]
  const highMid: Vec3 = add([centre[0], bHi.top, centre[2]], mul(runDir, run))

  const pace = 2 * R + G
  return {
    id: s.id, rise, run, R, G, thetaDeg, slopeSpan, runDir, widthDir,
    lowEdge: [sub(lowMid, half), add(lowMid, half)],
    highEdge: [sub(highMid, half), add(highMid, half)],
    width: s.width, waist: s.waist,
    usable: {
      pace,
      paceOK: pace >= PACE_RANGE[0] && pace <= PACE_RANGE[1],
      riserOK: R >= RISER_RANGE[0] && R <= RISER_RANGE[1],
      goingOK: G >= GOING_RANGE[0] && G <= GOING_RANGE[1],
    },
  }
}

// ── the load the flight puts on the frame ─────────────────────────────────

/** How many point loads a bearing strip is spread over. */
export const BEARING_POINTS = 4

/**
 * Where along a member, as a fraction 0–1 of i→j, the flight's bearing strip
 * sits — one entry per point load, at the centroid of an equal sub-strip.
 *
 * Clamped into the member: a flight hanging off the end of its support is a
 * modelling mistake, but it must not put load outside the member, where the
 * solver's shape functions do not go.
 */
export function bearingStations(
  a: Vec3, b: Vec3, centre: Vec3, width: number, n = BEARING_POINTS,
): number[] {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  if (!(L > 1e-9) || n < 1) return []
  const u = mul(sub(b, a), 1 / L)
  const t0 = ((centre[0] - a[0]) * u[0] + (centre[1] - a[1]) * u[1] + (centre[2] - a[2]) * u[2]) / L
  const w = Math.min(width, L) / L                   // strip width as a fraction
  return Array.from({ length: n }, (_, k) => {
    const t = t0 - w / 2 + (w * (k + 0.5)) / n
    return Math.min(1, Math.max(0, t))
  })
}

export interface StairFrameLoad {
  /** The placed flight this came from. */
  stair: string
  loads: ModelLoad[]
  /** Total dead and live the flight delivers, kN — reported so a caller can
   *  check the frame got all of it and none of it twice. */
  totalD: number
  totalL: number
}

/**
 * One flight's reactions, as loads on the two members it bears on.
 *
 * A uniformly loaded flight puts half its weight on each support whatever its
 * end fixity — symmetry, not an assumption about continuity. `stairLoads`
 * already gives the dead components per PLAN area (waist × 1/cosθ, treads at
 * an average R/2, finishes), which is why the run and not the slope span is
 * what the reaction is computed over.
 */
export function stairFrameLoads(
  model: StructuralModel, s: Stair, gammaC?: number,
): StairFrameLoad | null {
  const p = placeStair(model, s)
  if (!p) return null
  const q = stairLoads({ t: s.waist, R: p.R, G: p.G, finishes: s.finishes, live: s.live, gammaC })
  const area = p.run * s.width                        // PLAN area of the flight, m²
  const totalD = q.dead * area, totalL = q.live * area

  const loads: ModelLoad[] = []
  for (const [id, edge] of [[s.low, p.lowEdge], [s.high, p.highEdge]] as const) {
    const line = memberLine(model, id)
    if (!line) continue
    const centre = mul(add(edge[0], edge[1]), 0.5)
    const ts = bearingStations(line.a, line.b, centre, s.width)
    if (!ts.length) continue
    for (const t of ts) {
      // Half the flight to this support, split equally between its stations.
      if (totalD > 0) loads.push({ kind: 'member-point', member: id, t, P: totalD / 2 / ts.length, cat: 'D' })
      if (totalL > 0) loads.push({ kind: 'member-point', member: id, t, P: totalL / 2 / ts.length, cat: 'L' })
    }
  }
  return { stair: s.id, loads, totalD, totalL }
}

/** Every stair's reactions, ready to concatenate into the model's load set. */
export function allStairFrameLoads(model: StructuralModel, gammaC?: number): ModelLoad[] {
  return (model.stairs ?? []).flatMap((s) => stairFrameLoads(model, s, gammaC)?.loads ?? [])
}
