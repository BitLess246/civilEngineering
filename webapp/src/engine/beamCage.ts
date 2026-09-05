// ─────────────────────────────────────────────────────────────────────────
// THE BEAM CAGE — the bars of one beam, as geometry.
//
// The companion to `columnCage`, and the thing that lets the beam elevation,
// the take-off and a 3D view describe the same steel. Before this the sheet
// drew one arrangement and the take-off costed another: every longitudinal bar
// was billed at the full span plus 40db at each end, whether the detail ran it
// through or curtailed it at 0.15L; stirrups were billed at the tightest
// spacing over the WHOLE beam, though the detail only closes them up over 2h
// at each end; and the corner bars a face gets when the analysis asked for
// none were not billed at all.
//
// The arrangement here is the one `beamDetail` draws, and the clauses are the
// same ones:
//
//   THROUGH   the four corner bars and whatever else §409.7.3.8.1/.8.4 keeps
//             continuous. Straight, never cranked, hooked at an end support.
//   EXTRA     curtailed — top bars 0.25L from each support, bottom bars from
//             0.15L off each support — and cranked where they stop.
//   STIRRUPS  closed, at the confinement spacing over 2h from each support
//             face (§418.6.4.1) and the designed spacing through the middle.
//
// Units: geometry m, bar sizes mm. Model space, y up.
// ─────────────────────────────────────────────────────────────────────────
import {
  continuousBars, stirrupBendDiameter, closedTieClosureAllowance, turnAngles,
  hookBendDiameter, KEEP_TOP, KEEP_BOTTOM, CORNER_BARS_PER_FACE,
  type RebarCage, type RebarRun, type Vec3,
} from './rebarModel'
import { hookClearToFace, hookFit } from './devLength'
import { jointHookLdh } from './beamColumnJoint'
import { rotateLoop } from './columnCage'
import { endAnchors, type AnchorBar, type JointRoom } from './beamAnchorage'
import { runSpliceCentres, pointAt, type SpliceOptions } from './barSplice'
import { momentRatioLimits } from './beamMomentRatios'

export interface BeamCageInput {
  /** Member mark — every bar in the cage carries it. */
  mark: string
  /** Span, m, support centreline to centreline; and the two support widths, mm. */
  L: number
  colBLeft?: number
  colBRight?: number
  /**
   * The furthest from the beam's CENTRELINE an outer longitudinal bar may sit,
   * mm — the line the supporting column's own verticals leave it.
   *
   * A beam's bars have to pass INSIDE the column's, which every joint sheet
   * says in a note and no cage enforced: a 300 beam framing a 300 column put
   * its outer top bar at |z| = 90.0 and the column put its outer vertical at
   * |z| = 90.0, two ⌀20 bars on one line. Left out, the bars sit at the beam's
   * own cover, which is right for a beam wider than what supports it.
   */
  maxBarOffset?: number
  /** Web width and overall depth, mm. */
  b: number
  h: number
  /** Clear cover to the stirrup, mm. */
  cover: number
  /** Longitudinal and stirrup Ø, mm. */
  barDia: number
  stirrupDia: number
  /** Designed bars in each face: the worst hogging count at either support,
   *  and the sagging count at midspan. Either may be zero. */
  topBars: number
  botBars: number
  /** Stirrup spacing at the supports and through the middle, mm. */
  sEnd: number
  sMid: number
  /**
   * The seismic system, which decides how much steel is CONTINUOUS.
   *
   * A gravity beam curtails on §409.7.3.8: a third of the top steel past the
   * inflection point, a quarter of the bottom into the support. A moment frame
   * cannot — §418.6.3.2 (SMF) and §418.4.2.2 (IMF) fix the shape of the whole
   * strength envelope, and both sentences are about bars that REACH the place
   * being checked. So the continuous share becomes whichever is larger, the
   * gravity fraction or the seismic one.
   *
   * Same Ø throughout the cage, so the strength ratios read straight across as
   * bar counts; `designBeamRow` sets the sagging steel from the same counts,
   * which is what keeps the schedule and the cage talking about one beam.
   */
  system?: 'gravity' | 'imf' | 'smf'
  /** Whether the beam continues past each support. An end support hooks. */
  continuousLeft?: boolean
  continuousRight?: boolean
  /**
   * Whether a column carries on ABOVE each support, and BELOW it.
   *
   * A hooked tail has to be embedded in something. One turned up out of the
   * top of the joint needs the column above to be there — at a roof joint it
   * is not, and the bar has to turn the other way instead. Below defaults to
   * true, which is a beam framing into a column that continues down; a beam on
   * a wall or a hanger should say otherwise.
   */
  columnAboveLeft?: boolean
  columnAboveRight?: boolean
  columnBelowLeft?: boolean
  columnBelowRight?: boolean
  /**
   * A transverse beam at each support to turn a tail sideways into, and which
   * way across this beam (+1 / −1). The last resort where neither vertical
   * direction has concrete or is clear.
   */
  sideBeamLeft?: 1 | -1
  sideBeamRight?: 1 | -1
  /**
   * The supporting column's own cover, tie Ø and vertical-bar Ø, mm — what
   * decides how far a hooked beam bar can reach into the joint before it runs
   * into the far-face vertical it turns down behind (`hookClearToFace`).
   */
  colCover?: number
  colTieDia?: number
  colBarDia?: number
  /**
   * The column concrete a hooked end bar has to develop in — its f'c and fy,
   * MPa, and the depth it has to develop across, mm.
   *
   * Given, the cage checks ℓdh against the room it actually has and says so
   * when the bar does not develop. Omitted, it places the hook as before and
   * makes no claim about it.
   *
   * THE CHECK LIVES HERE, not on a drawing. It used to be the typical beam
   * detail's, so it existed only for as long as that sheet did — retiring the
   * sheet would have silently retired a design check with it, and no other view
   * of the same bar knew the bar did not develop.
   */
  jointConcrete?: { fc: number; fy: number; colH: number }
  /**
   * How the longitudinal bars will be lapped — the SAME options `spliceCage`
   * is given afterwards.
   *
   * Supplied, the cage works out where its own bars come to a lap and closes
   * the stirrups up through each one (§425.5.2 / the standard bar-bending
   * sheet's "close spacing of stirrups in the splicing, s = 100 mm"). A lap is
   * the one place along a beam where two bars share the concrete and the
   * transverse steel has to hold them together, and the stirrups were laid out
   * before anything knew a lap existed. Omitted, the layout is as before.
   */
  splice?: SpliceOptions
  /** Beam centreline in plan, m, and the level of its SOFFIT. */
  axis: { x0: number; z0: number; x1: number; z1: number }
  ySoffit: number
}

/** §418.6.4.1 — stirrups are closely spaced over 2h from each support face. */
export const HOOP_ZONE_DEPTHS = 2
/**
 * The detailing point of inflection of a continuous span, as a fraction of the
 * CLEAR span from each face. 0.211ℓn is the exact value for a fully fixed end
 * under a uniform load; ℓn/4 is what the standard bar-bending sheet draws, and
 * it is the more conservative of the two for the top steel.
 */
export const INFLECTION_FRACTION = 0.25

/**
 * Where a curtailed TOP bar stops, mm PAST THE FACE of its support —
 * §409.7.3.3 with §409.7.3.8.4.
 *
 * The bar does not stop at the point of inflection: that is the point at which
 * it is no longer required, and §409.7.3.3 makes it carry on past there by the
 * greater of d and 12db. §409.7.3.8.4 then puts a floor of ℓn/16 under the
 * third of the negative steel that has to reach furthest — detailed here for
 * every top bar, because they are cut to one length.
 *
 * Cut at ℓn/4 exactly, as the fixed 0.25L this replaces did, the bar ended
 * where it was still working.
 */
export function topCutoff(ln: number, d: number, db: number): number {
  return INFLECTION_FRACTION * ln + Math.max(d, 12 * db, ln / 16)
}

/**
 * Where a curtailed BOTTOM bar starts, mm past the face of its support —
 * §409.7.3.3.
 *
 * Positive steel is no longer required outboard of the inflection point, so it
 * runs on past it the OTHER way, back towards the support, by the greater of d
 * and 12db. Never negative: on a span short enough that the extension reaches
 * the face, the bar simply runs to the face.
 */
export function botCutoff(ln: number, d: number, db: number): number {
  return Math.max(0, INFLECTION_FRACTION * ln - Math.max(d, 12 * db))
}

/** Effective depth d, mm — to the centroid of one layer of tension steel. */
export const effectiveDepth = (h: number, cover: number, stirrupDia: number, barDia: number) =>
  h - cover - stirrupDia - barDia / 2

/**
 * Both curtailments for one beam, m from the LEFT support centreline, which is
 * the datum the cage and the elevation are both laid out on.
 *
 * `topL`/`topR` are where a curtailed top bar stops; `botL`/`botR` where the
 * curtailed bottom bar starts and ends. A top bar is never run past midspan —
 * two of them meeting there is a through bar, not a pair of cut ones.
 */
export function curtailments(i: {
  L: number; h: number; cover: number; stirrupDia: number; barDia: number
  colBLeft?: number; colBRight?: number
}) {
  const fL = (i.colBLeft ?? 0) / 2000, fR = i.L - (i.colBRight ?? 0) / 2000   // the two faces, m
  const ln = Math.max(0, (fR - fL) * 1000)                        // clear span, mm
  const d = effectiveDepth(i.h, i.cover, i.stirrupDia, i.barDia)
  const t = topCutoff(ln, d, i.barDia) / 1000
  const b = botCutoff(ln, d, i.barDia) / 1000
  return {
    topL: Math.min(fL + t, i.L / 2), topR: Math.max(fR - t, i.L / 2),
    botL: fL + b, botR: fR - b,
  }
}

/**
 * Hoops are closed up to this pitch through the length of a lap splice, mm.
 *
 * A lap is where two bars share one line of concrete and rely on the transverse
 * steel to hold them together while the force passes from one to the other.
 */
export const SPLICE_HOOP_SPACING = 100

/**
 * The stations re-laid at `s` through each band, everything outside untouched.
 *
 * RE-LAID between the two stations that bracket the band, not subdivided.
 * Subdividing can only ever thirds or halve a gap, so asking for 100 through a
 * beam pitched at 220 gave 73 — 37% more stirrups than the rule asks for, on a
 * drawing whose whole complaint about the last one was uneconomical steel.
 * Dividing the bracketed stretch instead lands as near 100 as its two ends
 * allow, and never coarser.
 */
export function tightenOver(stations: number[], bands: [number, number][], s: number): number[] {
  if (!bands.length || s <= 0) return stations
  let out = [...stations].sort((a, b) => a - b)
  for (const [lo, hi] of mergeBands(bands)) {
    const below = out.filter((v) => v <= lo + 1e-9)
    const above = out.filter((v) => v >= hi - 1e-9)
    // A band running off the end of the run has no pair to lay between; the end
    // zone there is already at its own tighter spacing.
    if (!below.length || !above.length) continue
    const a = below[below.length - 1], b = above[0]
    if (b - a <= s + 1e-9) continue
    const n = Math.ceil((b - a) / s - 1e-9)
    out = out.filter((v) => v <= a + 1e-9 || v >= b - 1e-9)
    for (let k = 1; k < n; k++) out.push(a + ((b - a) * k) / n)
    out.sort((x, y) => x - y)
  }
  return out
}

/** Overlapping bands merged into disjoint ones, in order. */
export function mergeBands(bands: [number, number][]): [number, number][] {
  const sorted = [...bands].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])
  const out: [number, number][] = []
  for (const [a, b] of sorted) {
    const last = out[out.length - 1]
    if (last && a <= last[1] + 1e-9) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

/**
 * Where the stirrups go, m along the span from the left support centreline.
 *
 * Tight over 2h from each support face, the designed spacing between. The two
 * zones are laid out from their own ends so the first stirrup at each support
 * lands where §418.6.4.4 puts it rather than wherever a single run from one end
 * happened to reach.
 */
export function stirrupStations(i: Pick<BeamCageInput,
  'L' | 'h' | 'sEnd' | 'sMid' | 'colBLeft' | 'colBRight'>,
  spliceBands: [number, number][] = [],
  /** Pitch the hoops close up to through a lap, m. `SPLICE_HOOP_SPACING` by
   *  default; an SMF beam hands in min(d/4, 100) per §418.6.3.3. */
  lapPitch = SPLICE_HOOP_SPACING / 1000): number[] {
  const hM = i.h / 1000
  const faceL = (i.colBLeft ?? 0) / 2000
  const faceR = i.L - (i.colBRight ?? 0) / 2000
  const clear = Math.max(0, faceR - faceL)
  if (clear <= 0) return []
  const zone = Math.min(HOOP_ZONE_DEPTHS * hM, clear / 2)
  // A ZERO SPACING IS A CALLER WITH NO DESIGN, NOT A SPACING OF ZERO.
  //
  // The floor here used to be 25 mm, which is a sane guard against a divide by
  // nothing and a catastrophic answer to `sEnd = sMid = 0`: a beam whose shear
  // design came back "none required" (Vu ≤ φVc/2, §409.6.3.1) was handed 0 and
  // detailed with a stirrup every 25 mm — 189 of them on a 6 m beam, on the
  // beam that needed the fewest. It looked like the cage disagreeing with its
  // own worked solution, and it was.
  //
  // `cageBuilder` now supplies the §409.7.6.2.2 nominal instead, so 0 should
  // never arrive. This stays as defence for any other caller, and falls back to
  // something a beam could actually be built with rather than to the floor.
  const nominal = Math.min(i.h / 2000, 0.6)
  const sE = Math.max(0.025, (i.sEnd > 0 ? i.sEnd : i.sMid > 0 ? i.sMid : nominal * 1000) / 1000)
  const sM = Math.max(0.025, (i.sMid > 0 ? i.sMid : i.sEnd > 0 ? i.sEnd : nominal * 1000) / 1000)
  const out: number[] = []
  const push = (x: number) => { if (x >= faceL - 1e-9 && x <= faceR + 1e-9) out.push(x) }
  // Each end zone is laid out from ITS OWN support, so the first stirrup lands
  // 50 mm off the face where §418.6.4.4 puts it (a single run from one end
  // would leave the far support wherever the arithmetic happened to reach).
  let lastL = faceL, firstR = faceR
  for (let x = faceL + 0.05; x < faceL + zone; x += sE) { push(x); lastL = x }
  for (let x = faceR - 0.05; x > faceR - zone; x -= sE) { push(x); firstR = x }
  // The middle is DIVIDED, not stepped.
  //
  // Stepping at sM from the last end-zone hoop leaves whatever is left over
  // against the far end zone: on the sample frame's beam that was a 70 mm gap
  // beside a 110 mm one, tighter in the middle than at the supports, which is
  // the opposite of the rule the zones exist for. It is also asymmetric — the
  // same beam laid out from the other end gives different hoops.
  //
  // Dividing the remaining gap into equal parts at no more than sM gives a
  // spacing that is never coarser than designed, closes exactly on both end
  // zones, and is symmetric about midspan for a symmetric beam.
  const gap = firstR - lastL
  if (gap > sM + 1e-9) {
    const n = Math.ceil(gap / sM - 1e-9)
    for (let k = 1; k < n; k++) push(lastL + (gap * k) / n)
  }
  const base = [...new Set(out.map((v) => Math.round(v * 1e6) / 1e6))].sort((p, q) => p - q)
  // …and closed up through every lap, last, so a splice can only ever add
  // stirrups to a layout the code rules have already settled.
  return tightenOver(base, mergeBands(spliceBands), lapPitch)
}

/**
 * The bars of one beam.
 *
 * A through bar at an END support turns down (top) or up (bottom) into the
 * column with a standard hook; at a continuous support it runs on. An extra
 * bar stops where it is curtailed and cranks towards the opposite face.
 */
export function buildBeamCage(i: BeamCageInput): RebarCage {
  const runs: RebarRun[] = []
  const notes: string[] = []
  const { x0, z0, x1, z1 } = i.axis
  const dx = x1 - x0, dz = z1 - z0
  const span = Math.hypot(dx, dz) || 1
  const ux = dx / span, uz = dz / span            // along the beam
  const px = -uz, pz = ux                         // across it

  const inset = (i.cover + i.stirrupDia + i.barDia / 2) / 1000
  const yBot = i.ySoffit + inset
  const yTop = i.ySoffit + i.h / 1000 - inset
  // Corner bars sit at the web faces — unless the column they run into stands
  // its own verticals inside that line, in which case they move in to clear
  // them. Two bars cannot occupy one position, and the beam's are the ones
  // with somewhere to go.
  const half = Math.max(0, Math.min(
    i.b / 2000 - inset,
    i.maxBarOffset != null ? i.maxBarOffset / 1000 : Infinity,
  ))

  /** A point at `u` along the span, `v` across it, at height `y`. */
  const at = (u: number, v: number, y: number): Vec3 =>
    [x0 + ux * u + px * v, y, z0 + uz * u + pz * v]

  // §418.6.3.2 / §418.4.2.2 in bar counts — see `BeamCageInput.system`.
  //   · at a joint face:  bottom ≥ atFace · top
  //   · at ANY section:   both faces ≥ along · the larger end count
  // A gravity frame gets `null` and keeps the §409.7.3.8 fractions alone.
  const ratio = momentRatioLimits(i.system ?? 'gravity')
  const peakBars = Math.max(i.topBars, i.botBars)
  const needBot = ratio ? Math.ceil(Math.max(ratio.atFace * i.topBars, ratio.along * peakBars)) : 0
  const needTop = ratio ? Math.ceil(ratio.along * peakBars) : 0
  // Never above what the face HAS: the count the ratio asks for is provided by
  // `BeamDesignInput.AsFloor` upstream, so this clamp only guards a cage built
  // from bar counts that never went through the design.
  const keep = (designed: number, gravityShare: number, need: number) =>
    Math.min(Math.max(CORNER_BARS_PER_FACE, designed),
      Math.max(continuousBars(designed, gravityShare), need))
  const thruTop = keep(i.topBars, KEEP_TOP, needTop)
  const thruBot = keep(i.botBars, KEEP_BOTTOM, needBot)
  const extraTop = Math.max(0, i.topBars - thruTop)
  const extraBot = Math.max(0, i.botBars - thruBot)

  const hookD = hookBendDiameter(i.barDia)
  const tail = (12 * i.barDia) / 1000             // ℓext = 12db, Table 425.3.1
  // ── How far a bar reaches into its support ──────────────────────────────
  //
  // §418.8.4.1: a beam bar terminated in a column shall extend to the FAR face
  // of the confined core and be developed there. This cage stopped every bar at
  // the NEAR face and turned the hook down on the spot, so the bar had no
  // embedment in the joint at all — the anchorage the elevation dimensions
  // (`beamDetail.endHookAnchorage`, which places the hook at `hookClearToFace`
  // off the far face) and the anchorage the 3D view drew were different bars.
  //
  // A bar at a CONTINUOUS support is not anchored, it carries on; it runs to
  // the column centreline so the next span's bar meets it there instead of
  // both stopping at their own faces and leaving the joint empty.
  const clear = hookClearToFace(i.colCover ?? 40, i.colTieDia ?? 10, i.colBarDia ?? i.barDia)
  // §418.8.5.1 — does the hook actually develop in the column it turns into?
  // Only asked at an END support: a bar at a continuous support is not anchored.
  const jc = i.jointConcrete
  if (jc && (!i.continuousLeft || !i.continuousRight)) {
    const ldh = jointHookLdh(i.barDia, jc.fy, jc.fc)
    const fit = hookFit({
      ldh, memberDepth: jc.colH,
      cover: i.colCover ?? 40, tieDia: i.colTieDia ?? 10, farBarDia: i.colBarDia ?? i.barDia,
    })
    if (!fit.fits) {
      notes.push(`ℓdh ${Math.round(ldh)} exceeds the ${Math.round(fit.avail)} available in the column by ${Math.round(fit.shortfall)} — ⌀${i.barDia} bars do not develop here. Deepen the column to ${Math.round(fit.depthNeeded)}, reduce the bar, or use a headed bar (§425.4.4); a longer tail does not count, ℓdh is measured to the outside of the bend`)
    }
  }
  /** Centreline of the turned-down leg, m from the support centreline. */
  const hookIn = (colB: number) => Math.max(0, colB / 2000 - (clear + i.barDia / 2) / 1000)
  // ── through bars: the corners, plus the code's continuous share ──
  //
  // Which way each one turns where it stops is settled by `endAnchors`, not by
  // the old rule of top-down / bottom-up: the concrete a tail needs may not be
  // there, and two hooks given the same embedment stand their legs on the same
  // line and run at each other.
  const spread = (n: number, k: number) => (n === 1 ? 0 : -half + (2 * half * k) / (n - 1))
  const thru: (AnchorBar & { role: 'top' | 'bottom' })[] = [
    ...Array.from({ length: thruTop }, (_, k) =>
      ({ role: 'top' as const, y: yTop, v: spread(thruTop, k), dia: i.barDia, tail })),
    ...Array.from({ length: thruBot }, (_, k) =>
      ({ role: 'bottom' as const, y: yBot, v: spread(thruBot, k), dia: i.barDia, tail })),
  ]
  const roomAt = (colB: number, above: boolean, below: boolean, side?: 1 | -1): JointRoom => ({
    above, below, side,
    // the cover line either side: a tail that ends flush with the face has no
    // cover over it, so that is as far as it may go on the beam's own concrete
    yTop: i.ySoffit + (i.h - i.cover) / 1000,
    yBot: i.ySoffit + i.cover / 1000,
    face: hookIn(colB),
  })
  // Top steel first: it is the more heavily stressed face at a support, so it
  // keeps the far-face position and the bottom bar is the one that steps back.
  const anchL = i.continuousLeft ? null
    : endAnchors(thru, roomAt(i.colBLeft ?? 0, i.columnAboveLeft ?? true,
        i.columnBelowLeft ?? true, i.sideBeamLeft))
  const anchR = i.continuousRight ? null
    : endAnchors(thru, roomAt(i.colBRight ?? 0, i.columnAboveRight ?? true,
        i.columnBelowRight ?? true, i.sideBeamRight))
  // One note per distinct decision: every bar in a face reaches the same one,
  // and four copies of it says nothing four times.
  for (const n of new Set([...(anchL ?? []), ...(anchR ?? [])].flatMap((a) => a.note ?? [])))
    notes.push(n)

  thru.forEach((bar, m) => {
    const { role, y, v } = bar
    const path: Vec3[] = []
    const bends: number[] = []
    /** The turned tail's far end, and the leg it turns off. */
    const hook = (a: { dir: string; u: number }, sign: 1 | -1): [Vec3, Vec3] => {
      const u = sign < 0 ? -a.u : i.L + a.u
      const across = a.dir === 'side'
        ? (sign < 0 ? i.sideBeamLeft : i.sideBeamRight) ?? 1 : 0
      const dy = a.dir === 'down' ? -tail : a.dir === 'up' ? tail : 0
      return [at(u, v + across * tail, y + dy), at(u, v, y)]
    }
    const endL = anchL ? -anchL[m].u : 0
    const endR = anchR ? i.L + anchR[m].u : i.L
    if (anchL) {
      const [tip, leg] = hook(anchL[m], -1)
      path.push(tip, leg)
      bends.push(hookD)
    } else path.push(at(endL, v, y))
    path.push(at(endR, v, y))
    if (anchR) {
      const [tip] = hook(anchR[m], 1)
      path.push(tip)
      bends.push(hookD)
    }
    const k = role === 'top' ? m : m - thruTop
    runs.push({
      mark: `${i.mark}-${role === 'top' ? 'T' : 'B'}${k + 1}`,
      dia: i.barDia, role, member: i.mark, path, bendDia: bends, count: 1,
    })
  })
  const endL = anchL ? -anchL[0].u : 0
  const endR = anchR ? i.L + anchR[0].u : i.L

  // ── extra bars: curtailed, and cranked where they stop ──
  const crankRun = Math.min(0.33 * i.h, 0.05 * i.L * 1000) / 1000
  const crankD = hookBendDiameter(i.barDia)
  const cut = curtailments(i)
  if (extraTop > 0) {
    for (const [end, from, to] of [
      ['L', endL, cut.topL], ['R', endR, cut.topR],
    ] as const) {
      const dir = to > from ? 1 : -1
      for (let k = 0; k < extraTop; k++) {
        const v = extraTop === 1 ? 0 : -half + (2 * half * k) / (extraTop - 1)
        runs.push({
          mark: `${i.mark}-XT${end}${k + 1}`,
          dia: i.barDia, role: 'top', member: i.mark,
          path: [at(from, v, yTop), at(to, v, yTop), at(to + dir * crankRun, v, yTop - crankRun)],
          bendDia: [crankD], count: 1,
        })
      }
    }
  }
  if (extraBot > 0) {
    const a = cut.botL, b2 = cut.botR
    for (let k = 0; k < extraBot; k++) {
      const v = extraBot === 1 ? 0 : -half + (2 * half * k) / (extraBot - 1)
      runs.push({
        mark: `${i.mark}-XB${k + 1}`,
        dia: i.barDia, role: 'bottom', member: i.mark,
        path: [
          at(a - crankRun, v, yBot + crankRun), at(a, v, yBot),
          at(b2, v, yBot), at(b2 + crankRun, v, yBot + crankRun),
        ],
        bendDia: [crankD, crankD], count: 1,
      })
    }
  }

  // ── where the bars come to a lap ────────────────────────────────────────
  // Asked of the SAME function that will cut them, so the hoops cannot be
  // closed up over a splice the bar does not have — or miss one it does.
  const spliceBands: [number, number][] = []
  if (i.splice) {
    const lap = i.splice.lap
    // The stagger each bar will actually get: `spliceCage` counts the runs of a
    // role in order and alternates. Assuming both positions for every bar bands
    // a lap that a single-bar face never has.
    const byRole = new Map<string, number>()
    for (const r of runs) {
      if (r.role !== 'top' && r.role !== 'bottom') continue
      const k = byRole.get(r.role) ?? 0
      byRole.set(r.role, k + 1)
      const prefer = i.splice.preferByRole?.[r.role] ?? i.splice.prefer
      // …and the critical sections, resolved per role the same way `spliceCage`
      // resolves them: a hoop band over a lap the guard then moved would be
      // tightened over nothing.
      const avoid = i.splice.avoidByRole?.[r.role] ?? i.splice.avoid
      const stagger = k % 2 === 0 ? -lap / 2 : lap / 2
      for (const c of runSpliceCentres(r, { ...i.splice, prefer, avoid, stagger })) {
        const p = pointAt(r.path, c)
        const u = (p[0] - x0) * ux + (p[2] - z0) * uz
        spliceBands.push([u - lap / 2, u + lap / 2])
      }
    }
  }

  // ── stirrups ──
  const sx = Math.max(0, i.b / 2000 - i.cover / 1000 - i.stirrupDia / 2000)
  const sy0 = i.ySoffit + (i.cover + i.stirrupDia / 2) / 1000
  const sy1 = i.ySoffit + i.h / 1000 - (i.cover + i.stirrupDia / 2) / 1000
  const D = stirrupBendDiameter(i.stirrupDia)
  /** Radius the stirrup is bent to where it wraps a corner bar, mm. */
  const R = (i.barDia + i.stirrupDia) / 2
  // §418.6.3.3 — an SMF lap is enclosed by hoops at no more than d/4 and
  // 100 mm. At 100 flat a 300-deep beam (d ≈ 240) got hoops at 100 through
  // its laps where the clause asks for 60.
  const lapPitch = i.system === 'smf'
    ? Math.min(SPLICE_HOOP_SPACING, effectiveDepth(i.h, i.cover, i.stirrupDia, i.barDia) / 4) / 1000
    : SPLICE_HOOP_SPACING / 1000
  stirrupStations(i, spliceBands, lapPitch).forEach((u, k) => {
    const loop = [at(u, -sx, sy0), at(u, sx, sy0), at(u, sx, sy1), at(u, -sx, sy1)]
    runs.push({
      mark: `${i.mark}-S${k + 1}`,
      dia: i.stirrupDia, role: 'stirrup', member: i.mark,
      // §418.6.4 / §425.7.1.6 — successive stirrups meet at DIFFERENT corners.
      // All the hooks in one corner leaves every other corner bar restrained by
      // nothing but the bend, and puts the whole column of overlaps down one
      // line of the cage. Rotating the loop's start moves the corner they close
      // at without changing the bar.
      path: rotateLoop(loop, k),
      bendDia: [D, D, D, D],
      closed: true,
      wrapDia: i.barDia,
      hookAllowance: closedTieClosureAllowance(turnAngles(loop, true)[0], R, i.stirrupDia),
      count: 1,
    })
  })

  return { member: i.mark, runs, ...(notes.length ? { notes } : {}) }
}
