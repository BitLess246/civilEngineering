// ─────────────────────────────────────────────────────────────────────────
// THE STAIR CAGE — the steel in one flight, placed in model space.
//
// The flight is a one-way slab spanning up the slope, so its cage is the cage
// of a slab strip: main bars parallel to the flight in the tension face,
// distribution bars across them, and an anchorage into each of the two beams
// it bears on.
//
// NO KINKS HERE, AND THAT IS NOT AN OMISSION. `StairElevation` draws a flight
// WITH its landings, so it has two re-entrant corners and needs the crossed-bar
// detail that `stairLayout.stairBars` works out — the bar that cannot be bent
// round the inside of a kink without pushing the cover off. A `Stair` in the
// model is a bare flight between two beams: the landings are slabs in their own
// right, so there is no kink in this geometry and no crossing to draw. When
// landings are modelled as part of a flight, this is where that rule comes in,
// and it should come from one shared module so the two drawings cannot disagree.
//
// WHICH FACE IS IN TENSION. A simply supported flight is in sag throughout, so
// the steel that matters is the bottom. Continuity at an end puts that end in
// hog, and top steel is needed over it — which is why `support` decides how
// many top bars there are rather than a flag doing it.
//
// Units: geometry m, bar sizes mm. Model space, y up.
// ─────────────────────────────────────────────────────────────────────────
import type { RebarCage, RebarRun, Vec3 } from './rebarModel'
import { hookBendDiameter } from './rebarModel'
import { flightSolid, type PlacedStair } from './stairPlacement'
import type { StairSupport } from './stair'

export interface StairCageInput {
  /** The flight's id — the mark every bar in this cage carries. */
  mark: string
  /** Where the flight is, from `placeStair`. */
  placed: PlacedStair
  /** Cover, mm. */
  cover: number
  /** Main and distribution bar diameters, mm. */
  mainDia: number
  distDia: number
  /** Spacings the design adopted, mm (`designStair`). */
  mainSpacing: number
  distSpacing: number
  /** End condition — it decides which ends carry top steel. */
  support: StairSupport
  /** How far the steel carries into each supporting beam, m. */
  embed?: number
  /**
   * How far the top steel runs into the span from the face of a continuous
   * support, as a fraction of the flight's slope span.
   *
   * A quarter is the usual curtailment for a continuous one-way slab. Left as
   * a parameter rather than buried, because it is a detailing choice and the
   * drawing prints it.
   */
  topReach?: number
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const norm = (a: Vec3): Vec3 => {
  const L = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / L, a[1] / L, a[2] / L]
}

/**
 * Bar centres across a width, at `spacing`, spread evenly and kept inside it.
 *
 * The same rule the slab mats use: the count is what the spacing buys, then the
 * bars are spread, so there is no ragged remainder against one edge.
 */
export function acrossLines(width: number, spacingMm: number, cover: number): number[] {
  const usable = width - 2 * cover
  const s = spacingMm / 1000
  if (!(s > 1e-6) || usable <= 1e-9) return []
  const n = Math.max(1, Math.round(usable / s))
  const pitch = usable / n
  return Array.from({ length: n }, (_, k) => -usable / 2 + pitch * (k + 0.5))
}

/** Which ends of the flight are continuous, from the end condition. */
export function continuousEnds(support: StairSupport): { low: boolean; high: boolean } {
  // 'one-end' is continuous at the TOP, which is the common arrangement: the
  // flight runs on into the upper floor slab and is simply borne at the bottom.
  return {
    low: support === 'both-ends',
    high: support === 'both-ends' || support === 'one-end',
  }
}

/**
 * Every bar in one flight.
 *
 * Ordered bottom main, top main, distribution, so a viewer drawing them in
 * order builds the cage the way it is tied.
 */
export function buildStairCage(i: StairCageInput): RebarCage {
  const p = i.placed
  const runs: RebarRun[] = []
  const notes: string[] = []
  const c = i.cover / 1000
  const dbM = i.mainDia / 1000, dbD = i.distDia / 1000
  const embed = i.embed ?? 0.15
  const bendM = hookBendDiameter(i.mainDia)
  const solid = flightSolid(p)

  // Along the slope, across the width, and out of the soffit.
  const up = norm(sub(p.highEdge[0], p.lowEdge[0]))
  const across = p.widthDir
  const nrm = solid.normal
  const lowMid = mul(add(p.lowEdge[0], p.lowEdge[1]), 0.5)
  const t = p.waist / 1000

  // The two bar layers, measured NORMAL to the soffit — the same direction the
  // waist itself is measured along, so `cover` means what it says on a slope.
  const bottomOff = mul(nrm, -(t - c - dbM / 2))
  const topOff = mul(nrm, -(c + dbM / 2))
  // Distribution steel sits INSIDE the main bars, which is what makes the main
  // bars the outer layer with the larger d.
  const bottomDist = mul(nrm, -(t - c - dbM - dbD / 2))
  const topDist = mul(nrm, -(c + dbM + dbD / 2))

  const hookLen = Math.max(12 * i.mainDia, 150) / 1000
  const ends = continuousEnds(i.support)

  let n = 0
  const push = (r: Omit<RebarRun, 'member' | 'count' | 'mark'> & { tag: string }) => {
    runs.push({ ...r, mark: `${i.mark}-${r.tag}${++n}`, member: i.mark, count: 1 })
  }

  /** A point on the flight: `u` up the slope from the low edge, `v` across. */
  const at = (u: number, v: number, off: Vec3): Vec3 =>
    add(add(add(lowMid, mul(up, u)), mul(across, v)), off)

  const span = p.slopeSpan
  const reach = (i.topReach ?? 0.25) * span

  // ── bottom main steel: the full flight, anchored into both beams ────────
  for (const v of acrossLines(p.width, i.mainSpacing, c)) {
    const a = at(-embed, v, bottomOff)
    const b = at(span + embed, v, bottomOff)
    // Turned up into each beam at the end: a bar stopping at the bearing has
    // nothing developing it, and the beam is the only concrete there is.
    push({
      tag: 'MB', dia: i.mainDia, role: 'bottom',
      path: [add(a, mul(nrm, hookLen)), a, b, add(b, mul(nrm, hookLen))],
      bendDia: [bendM, bendM],
    })
  }

  // ── top main steel: only over an end that is continuous ─────────────────
  for (const [end, continuous] of [['low', ends.low], ['high', ends.high]] as const) {
    if (!continuous) continue
    for (const v of acrossLines(p.width, i.mainSpacing, c)) {
      const u0 = end === 'low' ? -embed : span + embed
      const u1 = end === 'low' ? reach : span - reach
      push({
        tag: end === 'low' ? 'TL' : 'TH', dia: i.mainDia, role: 'top',
        path: [at(u0, v, topOff), at(u1, v, topOff)],
        bendDia: [],
      })
    }
  }

  // ── distribution steel: across the main bars, tying them ────────────────
  // Bottom layer over the whole flight; top layer only where there is top main
  // steel to tie, because a bar tying nothing is steel nobody designed.
  const half = p.width / 2 - c
  const dists = (() => {
    const s = i.distSpacing / 1000
    if (!(s > 1e-6) || span <= 0) return []
    const n2 = Math.max(1, Math.round(span / s))
    const pitch = span / n2
    return Array.from({ length: n2 }, (_, k) => pitch * (k + 0.5))
  })()
  for (const u of dists) {
    push({
      tag: 'DB', dia: i.distDia, role: 'bottom',
      path: [at(u, -half, bottomDist), at(u, half, bottomDist)],
      bendDia: [],
    })
    const overTop = (ends.low && u <= reach) || (ends.high && u >= span - reach)
    if (overTop) {
      push({
        tag: 'DT', dia: i.distDia, role: 'top',
        path: [at(u, -half, topDist), at(u, half, topDist)],
        bendDia: [],
      })
    }
  }

  // The waist has to hold two layers of main steel plus the distribution bars
  // inside them; when it does not, the cage drawn is not the cage that fits.
  const needed = 2 * i.cover + 2 * i.mainDia + 2 * i.distDia
  if (p.waist < needed) {
    notes.push(`waist ${p.waist} mm is thinner than the ${Math.round(needed)} mm `
      + `two covers + two main bars + two distribution bars need`)
  }
  if (!ends.low && !ends.high) {
    notes.push('simply supported both ends — no top steel over either bearing, '
      + 'so any restraint the beams actually provide is uncracked concrete')
  }

  return { member: i.mark, runs, notes: notes.length ? notes : undefined }
}
