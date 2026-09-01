// ─────────────────────────────────────────────────────────────────────────
// THE STAIR CAGE — the steel in one flight, placed in model space.
//
// The flight is a one-way slab spanning up the slope, so its cage is the cage
// of a slab strip: main bars parallel to the flight in the tension face,
// distribution bars across them, and an anchorage into each of the two beams
// it bears on.
//
// THE KINKS, WHERE THERE ARE LANDINGS. A flight with a half-landing has a
// re-entrant corner at each end of the slope, and at a re-entrant corner one
// layer of steel cannot be bent round without the bend's own resultant driving
// the cover off. Which layer turns and which two cross is `stairBarDetail`'s
// rule — the SAME module `StairElevation` asks, working in the flight's own
// vertical plane, so the 2D detail and the 3D cage cannot disagree about a
// corner they both draw. Here that plane is set out in metres from the low
// bearing edge and mapped back into model space at every bar position.
//
// A bare flight (no landings) has no kink, and keeps the plain arrangement it
// always had: bottom steel throughout, top steel only over an end the design
// says is continuous.
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
import { stairBars, meetLines, normalToward, type Pt } from './stairBarDetail'

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
  /**
   * Anchorage carried past a re-entrant kink by a bar that crosses it, m.
   *
   * The elevation's default is 450 mm and this matches it, so the two drawings
   * of the same detail print the same number. Only used where there is a
   * landing; a bare flight has no kink to cross.
   */
  kinkExt?: number
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

  // ── the flight's own vertical plane ──────────────────────────────────────
  // (u along the run from the LOW BEARING edge, page-y DOWN from that bearing
  // level) — the plane `stairBarDetail` works in. A height h above the low
  // bearing is page-y −h, and `at3` maps straight back to model space, so the
  // kink rule can be asked once and answered for both drawings.
  const th = (p.thetaDeg * Math.PI) / 180
  const cosT = Math.cos(th), sinT = Math.sin(th)
  const lowLand = p.landings.find((l) => l.at === 'low')
  const hiLand = p.landings.find((l) => l.at === 'high')
  const uLo = lowLand?.depth ?? 0
  const bearMid = mul(add(p.bearLow[0], p.bearLow[1]), 0.5)

  const at3 = (q: Pt, v: number): Vec3 =>
    add(add(add(bearMid, mul(p.runDir, q[0])), mul(across, v)), [0, -q[1], 0])

  /**
   * The bar line `a` metres inside every face, as a polyline in that plane,
   * running from `-pad` to `run + pad` along the run.
   *
   * Each face contributes one infinite line and the corners are where those
   * lines MEET — not the point directly under the face's own corner, which at a
   * re-entrant kink is out by a·(1 − cosθ)/sinθ in the direction that puts the
   * bar outside the concrete. Cover on the sloping part is measured normal to
   * the soffit (so a vertical step of a/cosθ), on a landing vertically, because
   * that is how each of those slabs is actually built.
   */
  const barLine = (a: number, face: 'top' | 'soffit', pad: number): Pt[] => {
    const flatDir: Pt = [1, 0], slopeDir: Pt = [cosT, -sinT]
    const segs: { p: Pt; d: Pt }[] = []
    if (lowLand) segs.push({ p: [0, face === 'top' ? a : lowLand.thickness / 1000 - a], d: flatDir })
    segs.push({ p: [uLo, face === 'top' ? a / cosT : (t - a) / cosT], d: slopeDir })
    if (hiLand) {
      segs.push({ p: [p.run, (face === 'top' ? a : hiLand.thickness / 1000 - a) - p.rise], d: flatDir })
    }
    const onX = (l: { p: Pt; d: Pt }, x: number): Pt => [x, l.p[1] + (l.d[1] / l.d[0]) * (x - l.p[0])]
    const pts: Pt[] = [onX(segs[0], -pad)]
    for (let k = 1; k < segs.length; k++) {
      const hit = meetLines(segs[k - 1].p, segs[k - 1].d, segs[k].p, segs[k].d)
      if (hit) pts.push(hit.at)
    }
    pts.push(onX(segs[segs.length - 1], p.run + pad))
    return pts
  }

  /** Points at even DEVELOPED intervals along a polyline, `spacing` mm apart. */
  const walk = (poly: Pt[], spacingMm: number): { at: Pt; s: number }[] => {
    const legs = poly.slice(1).map((q, k) => Math.hypot(q[0] - poly[k][0], q[1] - poly[k][1]))
    const L = legs.reduce((a, b) => a + b, 0)
    const sp = spacingMm / 1000
    if (!(sp > 1e-6) || !(L > 1e-9)) return []
    const n2 = Math.max(1, Math.round(L / sp))
    const pitch = L / n2
    return Array.from({ length: n2 }, (_, k) => {
      let d = pitch * (k + 0.5)
      for (let j = 0; j < legs.length; j++) {
        if (d <= legs[j] || j === legs.length - 1) {
          const f = legs[j] > 0 ? Math.min(1, d / legs[j]) : 0
          return {
            at: [poly[j][0] + (poly[j + 1][0] - poly[j][0]) * f,
              poly[j][1] + (poly[j + 1][1] - poly[j][1]) * f] as Pt,
            s: pitch * (k + 0.5),
          }
        }
        d -= legs[j]
      }
      return { at: poly[poly.length - 1], s: L }
    })
  }

  /** A bar's own path in the plane, with a 90° return at each free end. */
  const withHooks = (pts: Pt[], face: 'top' | 'soffit', hookStart: number, hookEnd: number): Pt[] => {
    // A soffit bar's hook turns UP out of the face it covers, a top bar's DOWN:
    // in this plane that is page-y −1 and +1, the same signs the elevation uses.
    const dy: -1 | 1 = face === 'top' ? 1 : -1
    const out: Pt[] = []
    if (hookStart > 0) {
      const nn = normalToward(pts[0], pts[1], dy)
      out.push([pts[0][0] + nn[0] * hookStart, pts[0][1] + nn[1] * hookStart])
    }
    out.push(...pts)
    if (hookEnd > 0) {
      const e = pts[pts.length - 1], nn = normalToward(pts[pts.length - 2], e, dy)
      out.push([e[0] + nn[0] * hookEnd, e[1] + nn[1] * hookEnd])
    }
    return out
  }

  const mains = acrossLines(p.width, i.mainSpacing, c)
  const half = p.width / 2 - c
  const aMain = c + dbM / 2, aDist = c + dbM + dbD / 2

  if (p.landings.length) {
    // ── with a landing: the crossed-bar detail at the kinks ───────────────
    //
    // The whole slab — landing, slope, landing — is one run of steel, so BOTH
    // layers go the full length here rather than the top layer appearing only
    // over a continuous end. That is not a detailing preference: a re-entrant
    // kink puts the top face in hog whatever the supports do, so the top steel
    // through the corner is required and the end condition has nothing to say
    // about it.
    const bars = stairBars(barLine(aMain, 'soffit', embed), barLine(aMain, 'top', embed),
      i.kinkExt ?? 0.45, 1, dbM)
    for (const v of mains) {
      for (const b of bars) {
        const face = b.face === 'top' ? 'top' : 'soffit'
        const path = withHooks([...b.pts], face, b.hookStart * hookLen, b.hookEnd * hookLen)
        push({
          tag: face === 'top' ? 'MT' : 'MB',
          dia: i.mainDia, role: face === 'top' ? 'top' : 'bottom',
          path: path.map((q) => at3(q, v)),
          bendDia: Array.from({ length: Math.max(0, path.length - 2) }, () => bendM),
        })
      }
    }
    // Distribution across both layers, over the whole developed length —
    // there is main steel to tie everywhere, which on a bare flight there is not.
    for (const [face, tag, role, dia] of [
      ['soffit', 'DB', 'bottom', i.distDia], ['top', 'DT', 'top', i.distDia],
    ] as const) {
      const line = barLine(aDist, face, 0)
      for (const st of walk(line, i.distSpacing)) {
        push({ tag, dia, role, path: [at3(st.at, -half), at3(st.at, half)], bendDia: [] })
      }
    }
    if (!ends.low && !ends.high) {
      notes.push('simply supported both ends — the top steel drawn is the run through '
        + 'the kinks, which the re-entrant corners need whatever the bearings do')
    }
    const needed = 2 * i.cover + 2 * i.mainDia + 2 * i.distDia
    if (p.waist < needed) {
      notes.push(`waist ${p.waist} mm is thinner than the ${Math.round(needed)} mm `
        + 'two covers + two main bars + two distribution bars need')
    }
    for (const l of p.landings) {
      if (l.thickness < p.waist) {
        notes.push(`the ${l.at} landing is ${l.thickness} mm against a ${p.waist} mm waist — `
          + 'the bars are set out to each slab\u2019s own cover, so the layers step at the kink')
      }
    }
    return { member: i.mark, runs, notes: notes.length ? notes : undefined }
  }

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
