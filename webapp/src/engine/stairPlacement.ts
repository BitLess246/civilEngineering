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
// LANDINGS AND THE BREAK BEAM. A flight may carry a flat landing at either
// end. The landing is not a second span: flight and landing are one one-way
// slab, so the landing eats into the run and the flight climbs the whole rise
// over what is left — R and G change, the span between the supports does not.
// The member at that end IS the landing beam, which is what a stair between
// floors breaks on: two flights meeting on a beam at mid height, one of them
// carrying the half-landing.
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
import { stairGeometry, stairLoads, landingLoads, type StairLoads } from './stair'

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

/** A flat landing, placed: where its two edges are and how thick it is. */
export interface PlacedLanding {
  at: 'low' | 'high'
  /** Plan depth along the run, m, and slab thickness, mm. */
  depth: number
  thickness: number
  /** TOP surface. `outer` is the edge over the beam, `inner` the edge the
   *  sloping flight starts from; each left-to-right across the width. */
  outer: [Vec3, Vec3]
  inner: [Vec3, Vec3]
}

export interface PlacedStair {
  id: string
  /** Vertical climb and horizontal travel between the two supports, m. */
  rise: number
  run: number
  /** The part of `run` that actually slopes — `run` less the landings. */
  flightRun: number
  /** Derived and therefore equal: R = rise/risers, G = flightRun/risers. mm. */
  R: number
  G: number
  thetaDeg: number
  /** Span of the SLOPING part along its own slope, m. */
  slopeSpan: number
  /** Developed length of the whole slab, m: landing + slope + landing. What a
   *  bar running the length of the stair has to be, and what the elevation
   *  dimensions — NOT what it is designed for, which is `run` (the loads are
   *  per unit of PLAN area, so the span that belongs with them is horizontal). */
  totalSpan: number
  /** Unit vectors: down the flight in plan, and across its width. */
  runDir: Vec3
  widthDir: Vec3
  /** The waist's TOP surface, four corners: low edge then high edge, each
   *  left-to-right across the width. With a landing at that end this is the
   *  landing's INNER edge — where the slope starts, not where it bears. */
  lowEdge: [Vec3, Vec3]
  highEdge: [Vec3, Vec3]
  /** Where the slab actually bears, on each member. Same as `lowEdge` /
   *  `highEdge` unless a landing carries the bearing out from under the slope. */
  bearLow: [Vec3, Vec3]
  bearHigh: [Vec3, Vec3]
  /** The landings, in the order low then high. Empty for a bare flight. */
  landings: PlacedLanding[]
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

/** Depth of the landing at one end, m — 0 when there is none. */
export function landingDepth(s: Stair, at: 'low' | 'high'): number {
  const l = (s.landings ?? []).find((x) => x.at === at)
  return l && l.depth > 0 ? l.depth : 0
}

/** Thickness of the landing at one end, mm — the waist unless it says otherwise. */
export function landingThickness(s: Stair, at: 'low' | 'high'): number {
  const l = (s.landings ?? []).find((x) => x.at === at)
  return l && l.thickness && l.thickness > 0 ? l.thickness : s.waist
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

  // The landings eat into the run before R and G are struck, which is the whole
  // reason they are part of THIS calculation and not a decoration on top of it:
  // the flight climbs the same rise over a shorter run, so it is steeper.
  const dLo = landingDepth(s, 'low'), dHi = landingDepth(s, 'high')
  const flightRun = run - dLo - dHi
  if (!(flightRun > 1e-6)) return null                // the landings leave no flight

  const R = (rise * 1000) / s.risers
  const G = (flightRun * 1000) / s.risers
  const { thetaDeg } = stairGeometry(R, G)
  const slopeSpan = Math.hypot(flightRun, rise)

  // Across the width, along the low member's own axis, shifted by `offset`.
  const widthDir = uLo
  const centre = add(bLo.mid, mul(widthDir, s.offset ?? 0))
  const half = mul(widthDir, s.width / 2)
  const bearLoMid: Vec3 = [centre[0], bLo.top, centre[2]]
  const bearHiMid: Vec3 = add([centre[0], bHi.top, centre[2]], mul(runDir, run))
  // The slope starts past the low landing and stops short of the high one.
  const lowMid: Vec3 = add(bearLoMid, mul(runDir, dLo))
  const highMid: Vec3 = sub(bearHiMid, mul(runDir, dHi))
  const edge = (mid: Vec3): [Vec3, Vec3] => [sub(mid, half), add(mid, half)]

  const landings: PlacedLanding[] = []
  for (const [at, depth, outer, inner] of [
    ['low', dLo, bearLoMid, lowMid], ['high', dHi, bearHiMid, highMid],
  ] as const) {
    if (depth <= 0) continue
    landings.push({
      at, depth, thickness: landingThickness(s, at),
      outer: edge(outer), inner: edge(inner),
    })
  }

  const pace = 2 * R + G
  return {
    id: s.id, rise, run, flightRun, R, G, thetaDeg, slopeSpan,
    totalSpan: dLo + slopeSpan + dHi, runDir, widthDir,
    lowEdge: edge(lowMid), highEdge: edge(highMid),
    bearLow: edge(bearLoMid), bearHigh: edge(bearHiMid),
    landings,
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
 * The slab in plan, as strips of uniform load: the low landing, the sloping
 * flight, and the high landing, each with its `x` measured from the low
 * support along the run.
 *
 * `stairLoads` and `landingLoads` both give kPa of PLAN area, which is why the
 * run and not the slope span is what a strip is measured over.
 */
export function stairStrips(p: PlacedStair, s: Stair, gammaC?: number): {
  x0: number; len: number; q: StairLoads
}[] {
  const flight = stairLoads({ t: s.waist, R: p.R, G: p.G, finishes: s.finishes, live: s.live, gammaC })
  const strips: { x0: number; len: number; q: StairLoads }[] = []
  const lo = p.landings.find((l) => l.at === 'low')
  const hi = p.landings.find((l) => l.at === 'high')
  const land = (l: PlacedLanding) =>
    landingLoads({ t: l.thickness, finishes: s.finishes, live: s.live, gammaC })
  if (lo) strips.push({ x0: 0, len: lo.depth, q: land(lo) })
  strips.push({ x0: lo?.depth ?? 0, len: p.flightRun, q: flight })
  if (hi) strips.push({ x0: p.run - hi.depth, len: hi.depth, q: land(hi) })
  return strips
}

/**
 * One flight's reactions, as loads on the two members it bears on.
 *
 * A BARE flight is uniformly loaded and puts half its weight on each support
 * whatever its end fixity — symmetry, not an assumption about continuity. A
 * flight WITH a landing is not uniformly loaded (a landing is flat and carries
 * no treads, so it is the lighter strip), so that symmetry argument is gone and
 * the split is taken by statics instead: ΣM about the low support over a simply
 * supported span. Continuity moves the split a little; the total is exact
 * either way, and the total is what must not be lost.
 */
export function stairFrameLoads(
  model: StructuralModel, s: Stair, gammaC?: number,
): StairFrameLoad | null {
  const p = placeStair(model, s)
  if (!p) return null
  const strips = stairStrips(p, s, gammaC)

  /** Total and the share of it reaching the HIGH support, kN. */
  const split = (pick: (q: StairLoads) => number) => {
    let W = 0, moment = 0
    for (const st of strips) {
      const w = pick(st.q) * st.len * s.width          // kN on this strip
      W += w
      moment += w * (st.x0 + st.len / 2)               // about the low support
    }
    return { W, hi: p.run > 1e-9 ? moment / p.run : W / 2 }
  }
  const D = split((q) => q.dead), L = split((q) => q.live)

  const loads: ModelLoad[] = []
  for (const [id, edge, d, l] of [
    [s.low, p.bearLow, D.W - D.hi, L.W - L.hi],
    [s.high, p.bearHigh, D.hi, L.hi],
  ] as const) {
    const line = memberLine(model, id)
    if (!line) continue
    const centre = mul(add(edge[0], edge[1]), 0.5)
    const ts = bearingStations(line.a, line.b, centre, s.width)
    if (!ts.length) continue
    for (const t of ts) {
      // This support's share, split equally between its stations.
      if (d > 0) loads.push({ kind: 'member-point', member: id, t, P: d / ts.length, cat: 'D' })
      if (l > 0) loads.push({ kind: 'member-point', member: id, t, P: l / ts.length, cat: 'L' })
    }
  }
  return { stair: s.id, loads, totalD: D.W, totalL: L.W }
}

/** Every stair's reactions, ready to concatenate into the model's load set. */
export function allStairFrameLoads(model: StructuralModel, gammaC?: number): ModelLoad[] {
  return (model.stairs ?? []).flatMap((s) => stairFrameLoads(model, s, gammaC)?.loads ?? [])
}

// ── the flight as a solid ─────────────────────────────────────────────────

const cross = (a: Vec3, b: Vec3): Vec3 =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: Vec3): Vec3 => {
  const L = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / L, a[1] / L, a[2] / L]
}

/** Four top corners and the four beneath them, each ring in run order and
 *  left-to-right across the width. */
export interface SolidPrism {
  top: [Vec3, Vec3, Vec3, Vec3]
  bottom: [Vec3, Vec3, Vec3, Vec3]
}

export interface FlightSolid extends SolidPrism {
  /** The landings, each a flat prism — thickness measured VERTICALLY, because
   *  a landing is flat and the 1/cosθ the waist gets does not apply to it. */
  landings: (SolidPrism & { at: 'low' | 'high' })[]
  /** Unit normal to the soffit, pointing up out of the slab — the direction
   *  the waist thickness is measured along, and the reason a stair has a
   *  1/cosθ slope factor at all. */
  normal: Vec3
  /**
   * One box per tread, sitting ON the waist.
   *
   * `at` is the MID-WIDTH point of the edge the tread rises from — the flight's
   * centreline, not a corner. A renderer builds a box centred on its origin and
   * puts it here, so an `at` on the low edge draws every tread half off the
   * side of the waist. Which is exactly what it did.
   */
  steps: { at: Vec3; run: number; rise: number; width: number }[]
}

/**
 * The flight as something you can draw: the waist prism and the treads on top.
 *
 * Kept out of the 3D component so it can be checked without a renderer — the
 * waist being measured NORMAL to the soffit is the one thing this drawing
 * exists to show, and measuring it vertically instead is exactly the mistake
 * the 2D elevation had to have fixed.
 */
export function flightSolid(p: PlacedStair): FlightSolid {
  const slope = norm(sub(p.highEdge[0], p.lowEdge[0]))
  let normal = norm(cross(p.widthDir, slope))
  if (normal[1] < 0) normal = mul(normal, -1)
  const t = p.waist / 1000
  const down = mul(normal, -t)
  const top: [Vec3, Vec3, Vec3, Vec3] = [
    p.lowEdge[0], p.lowEdge[1], p.highEdge[1], p.highEdge[0],
  ]
  const R = p.R / 1000, G = p.G / 1000
  // Over the SLOPING part only: a landing has no treads on it.
  const n = Math.max(1, Math.round(p.flightRun / Math.max(G, 1e-9)))
  const lowMid = mul(add(p.lowEdge[0], p.lowEdge[1]), 0.5)
  const ring = (a: [Vec3, Vec3], b: [Vec3, Vec3]): [Vec3, Vec3, Vec3, Vec3] =>
    [a[0], a[1], b[1], b[0]]
  return {
    top,
    bottom: top.map((q) => add(q, down)) as [Vec3, Vec3, Vec3, Vec3],
    landings: p.landings.map((l) => {
      // Run order: the low landing's outer edge comes first, the high one's last.
      const face = l.at === 'low' ? ring(l.outer, l.inner) : ring(l.inner, l.outer)
      const drop: Vec3 = [0, -l.thickness / 1000, 0]
      return { at: l.at, top: face, bottom: face.map((q) => add(q, drop)) as [Vec3, Vec3, Vec3, Vec3] }
    }),
    normal,
    steps: Array.from({ length: n }, (_, i) => ({
      at: add(add(lowMid, mul(p.runDir, i * G)), [0, i * R, 0] as Vec3),
      run: G, rise: R, width: p.width,
    })),
  }
}
