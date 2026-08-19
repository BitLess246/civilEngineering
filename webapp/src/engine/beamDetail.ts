// ─────────────────────────────────────────────────────────────────────────
// TYPICAL DETAIL OF A CONTINUOUS BEAM — the reinforcement elevation for one
// member, drafted from its designed critical sections.
//
// Like the column sheet, this adds no new calculation. `BeamScheduleRow` already
// carries a `BeamSectionDesign` per critical section (left support, midspan,
// right support) with its own bar count and stirrup spacing; the schedule showed
// them as three rows of numbers and nothing drew the bars.
//
// The arrangement drawn is the standard continuous-beam one:
//
//   TOP     continuous straight bars the full length, plus EXTRA top bars at
//           every support, run 0.25ℓ into the span from the support centreline
//           (§409.7.3 / the standard detail) — top steel is what carries the
//           hogging moment and it is needed at the supports, not at midspan.
//   BOTTOM  continuous bars the full length, plus EXTRA bottom bars through the
//           middle, started 0.15ℓ off each support where the sagging moment has
//           grown enough to need them.
//   HOOPS   closely spaced over 2h from each support face, the first at 50 mm
//           (§418.6.4.1 / §418.6.4.4), wider through the middle.
//   ENDS    at an END support the beam bars have nowhere to continue to, so they
//           are hooked DOWN into the column with a standard 90° hook, inside the
//           joint hoops and behind the far-face column vertical (§425.4.3,
//           §418.8.3; ACI SP-17 typical beam-column joint). Given the column,
//           that clear distance is cover + hoop + column bar and ℓdh is
//           dimensioned against it; without one it falls back to a nominal 60.
//
// What the drawing has to get right, and what a bar schedule cannot say:
//
//   • TOP steel is continuous through a support and belongs to BOTH adjacent
//     spans, so the count over a support is the GREATER of the two sides
//     (§409.7.7). Detailing each span independently leaves a support short from
//     one side.
//   • Hoops tighten toward the SUPPORTS, where shear peaks. A section that
//     needed no stirrups reports a spacing of ZERO, and reading that as "as
//     tight as the drawing allows" put the densest hoops at midspan and the
//     widest at the supports — the exact opposite of a beam. See `zoneSpacing`.
//   • Top bars extend past the face of support before they may be cut
//     (§409.7.3 / §425.4): the sheet marks the extension rather than showing a
//     bar stopping at the point of inflection, which is where the classic
//     "bars cut at the wrong place" failure comes from.
//
// Units: geometry m; bar/stirrup sizes mm.
// ─────────────────────────────────────────────────────────────────────────
import type { PlanPrimitive, Drawing } from './planRenderer'
import { hookClearToFace, hookFit, type HookFitResult } from './devLength'
import { jointHookLdh } from './beamColumnJoint'
import { GLYPH_W, wrapNote, measureBounds, notesBlock, titleBlock } from './detailSheet'

export interface BeamDetailSection {
  /** 'LEFT' | 'MID' | 'RIGHT' — position along the member. */
  label: string
  /** Distance from the left end, m. */
  x: number
  /** True for a hogging (top-steel) section. */
  hogging: boolean
  /** Bars provided at this section. */
  bars: number
  /** Stirrup spacing adopted here, mm. ZERO means the design needed none. */
  stirrupSpacing: number
}

export interface BeamDetailInput {
  /** Member mark (B1, G2 …). */
  mark: string
  /** Span, m — support centreline to support centreline. */
  L: number
  /** Web width and overall depth, mm. */
  b: number
  h: number
  /** Longitudinal bar diameter, mm. */
  barDia: number
  /** Stirrup diameter, mm, and number of legs. */
  stirrupDia: number
  legs?: number
  /** The designed critical sections. */
  sections: BeamDetailSection[]
  /** Top-steel count carried in from the ADJACENT span at each support, if any
   *  — the continuity rule needs both sides to resolve. */
  adjacentTopLeft?: number
  adjacentTopRight?: number
  /** Supporting column width, mm — sets how much of the joint is drawn. */
  colB?: number
  /** Whether the beam CONTINUES past each support. An end support anchors the
   *  bars with a hook; a continuous one runs them through. */
  continuousLeft?: boolean
  continuousRight?: boolean
  /** Clear cover to the stirrup, mm (default 40 — §420.6.1.3.1). */
  cover?: number
  /**
   * What the hooked end bars anchor INTO. Supplied, the sheet stops drawing
   * the end hook by eye and dimensions it: ℓdh required against the embedment
   * the column actually leaves, with the shortfall called out where there is
   * one. Omitted, the hook is drawn as before and simply not dimensioned.
   */
  hookAnchorage?: {
    /** Column depth PARALLEL to the beam bars, mm — also what gets drawn. */
    colH: number
    /** The column's far-face vertical the hook turns down behind, mm. */
    colBarDia: number
    /** Column tie/hoop Ø, mm. */
    colTieDia: number
    /** Column clear cover, mm. */
    colCover: number
    fc: number
    fy: number
  }
}

export interface BeamDetailOptions { detailNo?: string; sheetRef?: string; scale?: string }
export interface BeamDetailDrawing extends Drawing { title: string }

export const REBAR_INK = '#b45309'
const INK = '#1e293b', REBAR = REBAR_INK, GRID = '#9aa5b5', NOTE = '#475569', ACCENT = '#0f766e'
export const CRANK_INK = '#1d4ed8'
const CRANK = CRANK_INK   // bent-up bars — their own ink, they are one bar doing two jobs
const WARN = '#b91c1c'
const CONC = '#f1f5f9'

/** Mean glyph width / font size for Arial capitals — note wrapping only. */

// ── the detailing rules the drawing is built from ──────────────────────────

/** §418.6.4.1 — hoops are closely spaced over 2h from the face of the support. */
export const HOOP_ZONE_DEPTHS = 2
/** §418.6.4.4 — the first hoop sits 50 mm from the face of the support, mm. */
export const FIRST_HOOP = 50
/** Extra TOP bars run this fraction of the span from the support centreline. */
export const EXTRA_TOP_FRACTION = 0.25
/** Extra BOTTOM bars start this fraction of the span off each support. */
export const EXTRA_BOTTOM_FRACTION = 0.15
/** §418.8.3 — clear cover to the end of a beam-bar hook in the joint, mm. */
export const HOOK_END_COVER = 60

/**
 * Top steel to detail over a support — the greater of what the two adjacent
 * spans need there (§409.7.7).
 *
 * A support is one piece of concrete with one set of top bars running through
 * it. Designing each span in isolation and detailing each answer over its own
 * half leaves the support short from whichever side asked for more, which is
 * the error the "place the greater reinforcement" note on every typical
 * continuous-beam detail exists to prevent.
 */
export function continuousTopSteel(thisSpan: number, adjacent?: number): number {
  return Math.max(thisSpan, adjacent ?? 0)
}

/**
 * Where a top bar may stop, m from the face of support.
 *
 * §409.7.3.8.4: reinforcement continues at least d or 12·db past the point it is
 * no longer required, and §409.7.3.3 keeps at least a third of the negative
 * steel past the inflection point by that same margin. This returns the
 * extension itself; the sheet marks it as a dimension rather than implying a
 * bar ends at the theoretical cut-off.
 */
export function barExtension(d: number, barDia: number): number {
  return Math.max(d, 12 * barDia) / 1000
}

// ── 90° standard hook geometry (NSCP Table 425.3.1) ──────────────────────

/**
 * Minimum INSIDE bend diameter for a standard hook, mm.
 *
 * NSCP Table 425.3.1 / ACI 318-14 Table 25.3.1: 6db up to ⌀25, 8db for ⌀28–⌀36,
 * 10db above. The bend is not a corner — a ⌀28 bar turns through a 224 mm
 * inside diameter, and a sheet that draws a sharp corner tells the bar bender
 * something that cannot be fabricated.
 */
export function hookBendDiameter(db: number): number {
  return (db <= 25 ? 6 : db <= 36 ? 8 : 10) * db
}

/** Straight tail beyond the bend on a 90° hook, ℓext = 12db (Table 425.3.1). */
export const HOOK_TAIL_DB = 12

export interface Hook90 {
  /** Inside bend diameter D, mm. */
  bendDia: number
  /** Bar-centreline bend radius, mm — D/2 + db/2. */
  radius: number
  /** Straight tail ℓext beyond the bend, mm. */
  ext: number
  /** Overall height of the hook from the straight bar's centreline to the far
   *  end of the tail, mm — radius + ℓext. What has to fit inside the member. */
  depth: number
  /** Horizontal distance from the straight bar's centreline turn point to the
   *  OUTSIDE of the turned-down leg, mm. ℓdh is measured to this face
   *  (§425.4.3), not to the bar centreline. */
  outside: number
}

/** The fabricated dimensions of a 90° standard hook on a `db` bar. */
export function hook90(db: number): Hook90 {
  const bendDia = hookBendDiameter(db)
  const radius = bendDia / 2 + db / 2
  const ext = HOOK_TAIL_DB * db
  return { bendDia, radius, ext, depth: radius + ext, outside: radius + db / 2 }
}

// ── Cranked (bent-up) bars ───────────────────────────────────────────────

export interface CrankInput {
  /** Span, m — support centreline to support centreline. */
  L: number
  /** Overall depth and clear cover, mm. */
  h: number
  cover: number
  stirrupDia: number
  barDia: number
  /** Support width, mm — the crank is set out from the support FACE. */
  colB: number
  /** Bottom bars available at midspan. */
  botBars: number
  /** Beam continues past the left / right support. A crank only makes sense
   *  where there is hogging steel to become. */
  continuousLeft: boolean
  continuousRight: boolean
  /** Bend angle from the horizontal, degrees. 45° is standard for beams of
   *  ordinary depth; 30° is used only on deep members. */
  angleDeg?: number
  /** Tension development length ℓd, mm — sets the Class B lap. */
  ld?: number
  /** Special moment frame. Bent-up bars may NOT be counted as shear
   *  reinforcement there (§418.6.3.1 requires hoops), so the sheet still draws
   *  them as flexural steel but says so. */
  seismic?: boolean
}

export interface CrankResult {
  /** How many bottom bars are cranked at each end. 0 = the detail does not apply. */
  count: number
  angleDeg: number
  /** Vertical rise from the bottom bar centroid to the top, mm. */
  rise: number
  /** Horizontal projection of the inclined leg, mm. */
  run: number
  /** Where the bar LEAVES THE BOTTOM, m from the left support centreline —
   *  the bend point, set out from the support face. */
  bottomL: number; bottomR: number
  /** Where it ARRIVES AT THE TOP, m from the left support centreline. Closer to
   *  the support than the bend point: the bar rises AS IT APPROACHES it. */
  topL: number; topR: number
  /** Inclined length, and the centre three-quarters §409.7.6.2.3 counts as
   *  effective shear reinforcement, mm. */
  inclined: number
  effective: number
  /** Class B lap, mm (§425.5.2.1). */
  lapB: number
  /** Where laps may be made, m from the left support centreline: top steel at
   *  midspan, bottom steel over the supports — each spliced where its own
   *  stress is lowest. */
  topSplice: [number, number]
  botSplice: [[number, number], [number, number]]
  ok: boolean
  notes: string[]
}

/**
 * Cranked-bar geometry for a continuous beam.
 *
 * A bottom bar bent up near the support does two jobs: it crosses the shear
 * span at 45° and it becomes hogging steel over the support. Both are code
 * recognised — §422.5.10.5 lets a bent-up bar act as shear reinforcement, and
 * §409.7.6.2.3 counts only the centre three-quarters of the inclined portion.
 *
 * What limits the count is §409.7.3.8.1: at least a quarter of the positive
 * moment steel has to run into the support. Cranking every bottom bar leaves
 * nothing straight through, so the bars that may be bent are what is left after
 * that quarter (and never fewer than two) is set aside.
 *
 * The bend is set out from the support FACE at L/7, the usual detailing point:
 * far enough into the span to be past the face, close enough to still be in the
 * high-shear region and to arrive at the top before the hogging steel is needed.
 */
export function crankBars(i: CrankInput): CrankResult {
  const angleDeg = i.angleDeg ?? 45
  const keep = Math.max(2, Math.ceil(i.botBars / 4))          // §409.7.3.8.1
  const count = Math.max(0, i.botBars - keep)
  const rise = Math.max(0, i.h - 2 * (i.cover + i.stirrupDia) - i.barDia)
  const run = rise / Math.tan((angleDeg * Math.PI) / 180)
  const inclined = Math.hypot(rise, run)
  const face = i.colB / 2 / 1000                              // m, CL → face
  const bend = i.L / 7                                        // m, face → bend point
  // The bar rises as it APPROACHES the support: it leaves the bottom out in the
  // span and arrives at the top nearer the face, which is the direction the
  // hogging moment grows.
  const bottomL = face + bend
  const topL = bottomL - run / 1000
  const bottomR = i.L - face - bend
  const topR = bottomR + run / 1000
  const lapB = Math.max(1.3 * (i.ld ?? 0), 300)

  const notes: string[] = []
  const any = i.continuousLeft || i.continuousRight
  if (!any) notes.push('THE BEAM IS SIMPLY SUPPORTED AT BOTH ENDS — A CRANKED BAR HAS NO HOGGING STEEL TO BECOME')
  if (count === 0) notes.push(`ONLY ${i.botBars} BOTTOM BARS — §409.7.3.8.1 KEEPS ¼ OF THEM STRAIGHT INTO THE SUPPORT, SO NONE MAY BE CRANKED`)
  if (bottomL >= bottomR) notes.push('THE TWO BEND POINTS MEET OR CROSS AT MIDSPAN — THE SPAN IS TOO SHORT FOR A CRANKED BAR AT THIS DEPTH')
  if (topL < 0 || topR > i.L) notes.push(`THE INCLINE REACHES THE TOP PAST THE SUPPORT CENTRELINE — A ${Math.round(rise)} RISE NEEDS ${Math.round(run)} OF RUN AT ${angleDeg}°, MORE THAN THE ${Math.round(bend * 1000)} AVAILABLE`)
  if (i.seismic) notes.push('SPECIAL MOMENT FRAME — BENT-UP BARS MAY NOT BE COUNTED AS SHEAR REINFORCEMENT (§418.6.3.1); THE HOOPS CARRY ALL OF Vs')

  return {
    count: any ? count : 0, angleDeg, rise, run, bottomL, topL, bottomR, topR,
    inclined, effective: 0.75 * inclined, lapB,
    topSplice: [0.25 * i.L, 0.75 * i.L],
    botSplice: [[0, face + 0.15 * i.L], [i.L - face - 0.15 * i.L, i.L]],
    ok: any && count > 0 && bottomL < bottomR && topL >= 0 && topR <= i.L,
    notes,
  }
}

/**
 * The stirrup spacing to DRAW in a zone, mm.
 *
 * A section the design gave no stirrups reports `0` — "none required here",
 * not "as tight as possible". The sheet used to clamp that with
 * `Math.max(s, 50)`, which drew 50 mm hoops at midspan against 110 mm at the
 * supports: the densest steel where the shear is lowest, and a drawing that
 * contradicts its own notes. Where a zone has no designed spacing the drawing
 * falls back to the §409.7.6.2.2 maximum (d/2, capped at 600), which is what a
 * detailer would put there.
 */
export function zoneSpacing(designed: number, h: number, cover = 40): number {
  if (designed > 0) return designed
  const d = Math.max(h - cover - 20, 60)
  return Math.min(d / 2, 600)
}

/**
 * Hoop positions along the span, m from the left support centreline.
 *
 * Dense over 2h from each support face, the first at 50 mm (§418.6.4), then the
 * middle spanned in equal steps of at most the midspan spacing. The middle is
 * SPANNED rather than stepped from the end of the dense zone, for the same
 * reason the column sheet spans its middle: stepping leaves an oversized gap at
 * the transition.
 */
export function hoopPositions(L: number, h: number, sEnd: number, sMid: number, faceOffset = 0): number[] {
  if (!(L > 0)) return []
  const zone = Math.min(HOOP_ZONE_DEPTHS * h, L / 2 - faceOffset)
  const se = Math.max(sEnd, 25) / 1000, sm = Math.max(sMid, 25) / 1000
  const first = FIRST_HOOP / 1000
  const left: number[] = [], right: number[] = []
  for (let x = faceOffset + first; x <= faceOffset + Math.max(zone, 0) + 1e-9; x += se) left.push(x)
  for (let x = L - faceOffset - first; x >= L - faceOffset - Math.max(zone, 0) - 1e-9; x -= se) right.push(x)
  if (!left.length) left.push(faceOffset + first)
  if (!right.length) right.push(L - faceOffset - first)

  const lastL = left[left.length - 1], firstR = Math.min(...right)
  const mid: number[] = []
  const gap = firstR - lastL
  if (gap > sm + 1e-9) {
    const n = Math.ceil(gap / sm - 1e-9)
    for (let k = 1; k < n; k++) mid.push(lastL + (gap * k) / n)
  }
  return [...new Set([...left, ...mid, ...right].map((x) => Math.round(x * 1e6) / 1e6))]
    .filter((x) => x >= 0 && x <= L)
    .sort((a, b) => a - b)
}

/** Wrap a note to `max` characters a line. */

/**
 * The end-hook anchorage this sheet can dimension, or null when it was not
 * given a column to check the hook against.
 *
 * ℓdh is the §418.8.5.1 seismic hook — the SAME clause the beam–column joint
 * sheet prints — so one bar in one column can never be quoted two different
 * hook lengths on two drawings of the same building. The room it is measured
 * against comes from `hookFit`, which stops at the far-face column vertical
 * the hook turns down behind.
 */
export function endHookAnchorage(
  i: BeamDetailInput,
): (HookFitResult & { ldh: number; clear: number }) | null {
  const a = i.hookAnchorage
  if (!a) return null
  const ldh = jointHookLdh(i.barDia, a.fy, a.fc)
  const fit = hookFit({
    ldh, memberDepth: a.colH, cover: a.colCover,
    tieDia: a.colTieDia, farBarDia: a.colBarDia,
  })
  // Clear distance from the far face of the column to the OUTSIDE of the bend —
  // the same helper the joint sheet places its hook with.
  return { ...fit, ldh, clear: hookClearToFace(a.colCover, a.colTieDia, a.colBarDia) }
}

/** Build the continuous-beam reinforcement elevation. */
export function buildBeamDetail(i: BeamDetailInput, opts: BeamDetailOptions = {}): BeamDetailDrawing {
  const P: PlanPrimitive[] = []
  const L = Math.max(i.L, 0.1)
  const hM = i.h / 1000
  // The horizontal extent of the support in an ELEVATION is the column
  // dimension parallel to the beam, which is what ℓdh is measured along.
  const anch = endHookAnchorage(i)
  const cw = Math.max(i.hookAnchorage?.colH ?? i.colB ?? 400, 150) / 1000
  const cov = Math.max(i.cover ?? 40, 10) / 1000
  const Y = (z: number) => -z
  const u = L / 60                                        // one text unit

  const left = i.sections.find((s) => s.hogging && s.x < L / 2)
  const right = i.sections.find((s) => s.hogging && s.x >= L / 2)
  const mid = i.sections.find((s) => !s.hogging)

  const topL = continuousTopSteel(left?.bars ?? 0, i.adjacentTopLeft)
  const topR = continuousTopSteel(right?.bars ?? 0, i.adjacentTopRight)
  const botM = mid?.bars ?? 0

  // Spacings: the ends take whichever support was designed tighter, the middle
  // its own — and neither is ever the drawing's floor. See `zoneSpacing`.
  const sEnd = Math.min(
    zoneSpacing(left?.stirrupSpacing ?? 0, i.h, i.cover),
    zoneSpacing(right?.stirrupSpacing ?? 0, i.h, i.cover),
  )
  const sMid = zoneSpacing(mid?.stirrupSpacing ?? 0, i.h, i.cover)

  const yTop = hM - cov, yBot = cov
  const face = cw / 2                                     // support face from its centreline
  const x0 = -face, x1 = L + face                         // the drawn extent of the beam

  // ── the two supporting columns, and the beam between them ──
  const hookDrop = Math.max((12 * i.barDia) / 1000, 0.12)   // 12db tail, §425.3.1
  const colDrop = Math.max(hM * 0.9, hookDrop + 0.06), colRise = hM * 0.45
  for (const cx of [0, L]) {
    P.push({ kind: 'rect', x: cx - face, y: Y(0), w: cw, h: colDrop, stroke: INK, width: 1.1, fill: CONC })
    P.push({ kind: 'rect', x: cx - face, y: Y(hM + colRise), w: cw, h: colRise, stroke: INK, width: 1.1, fill: CONC })
  }
  P.push({ kind: 'rect', x: x0, y: Y(hM), w: x1 - x0, h: hM, stroke: INK, width: 1.3, fill: 'none' })
  // break lines where a continuous support carries the beam on
  for (const [cont, cx, dir] of [[i.continuousLeft, 0, -1], [i.continuousRight, L, 1]] as const) {
    if (!cont) continue
    const bx = cx + dir * face
    P.push({ kind: 'line', x1: bx, y1: Y(-hM * 0.12), x2: bx, y2: Y(hM * 1.12), stroke: GRID, width: 0.8, dash: [u * 1.2, u * 0.9] })
  }

  // ── longitudinal steel ──────────────────────────────────────────────────
  // TOP continuous straight bars, the pair that never stops
  P.push({ kind: 'line', x1: x0 + cov, y1: Y(yTop), x2: x1 - cov, y2: Y(yTop), stroke: REBAR, width: 1.4 })
  // BOTTOM continuous bars
  P.push({ kind: 'line', x1: x0 + cov, y1: Y(yBot), x2: x1 - cov, y2: Y(yBot), stroke: REBAR, width: 1.4 })

  // EXTRA top bars at each support — 0.25ℓ into the span from the centreline,
  // hooked down into the column where the beam stops there.
  const topRun = EXTRA_TOP_FRACTION * L
  const yTop2 = yTop - 0.055 * hM * (300 / Math.max(i.h, 120))   // just under the continuous pair
  for (const [cont, cx, dir] of [[i.continuousLeft, 0, 1], [i.continuousRight, L, -1]] as const) {
    const end = cx + dir * topRun
    if (cont) {
      P.push({ kind: 'line', x1: cx - dir * face, y1: Y(yTop2), x2: end, y2: Y(yTop2), stroke: REBAR, width: 1.4 })
    } else {
      // 90° standard hook turned DOWN into the column. Where the column is
      // known the hook sits behind its far-face vertical (cover + tie + bar);
      // otherwise it falls back to the nominal 60 mm clear.
      // A 90° standard hook is a BEND, not a corner: NSCP Table 425.3.1 sets a
      // 6db (⌀≤25) or 8db inside diameter, and ℓext = 12db of straight tail
      // beyond it. Drawing a square corner asks for a bar nobody can bend, and
      // it hides the fact that the bend itself eats depth.
      const hk = hook90(i.barDia)
      const rTurn = hk.radius / 1000
      // outside face of the turned-down leg, where ℓdh is measured to (§425.4.3)
      const hOut = cx - dir * (face - (anch?.clear ?? HOOK_END_COVER) / 1000)
      const hx = hOut + dir * hk.outside / 1000        // bar centreline of the leg
      P.push({
        kind: 'path', stroke: REBAR, width: 2.2, cap: 'round', join: 'round',
        cmds: [
          { c: 'M', x: end, y: Y(yTop2) },
          { c: 'L', x: hx + dir * rTurn, y: Y(yTop2) },
          { c: 'A', rx: rTurn, ry: rTurn, x: hx, y: Y(yTop2) + rTurn, large: 0, sweep: dir > 0 ? 1 : 0 },
          { c: 'L', x: hx, y: Y(yTop2 - hk.ext / 1000) + rTurn },
        ],
      })
    }
  }

  // EXTRA bottom bars through the middle, started 0.15ℓ off each support
  const botStart = EXTRA_BOTTOM_FRACTION * L
  if (botM > 0) {
    P.push({ kind: 'line', x1: botStart, y1: Y(yBot + 0.055 * hM), x2: L - botStart, y2: Y(yBot + 0.055 * hM), stroke: REBAR, width: 1.4 })
  }

  // ── cranked (bent-up) bars ──────────────────────────────────────────────
  // A bottom bar bent up at 45° near each support crosses the shear span and
  // arrives over the support as hogging steel. Drawn in its own ink because it
  // is one continuous bar doing two jobs, and a detailer reading a straight
  // bottom bar plus a straight top bar would fabricate two.
  const crank = crankBars({
    L, h: i.h, cover: i.cover ?? 40, stirrupDia: i.stirrupDia, barDia: i.barDia,
    colB: (i.colB ?? 400), botBars: botM,
    continuousLeft: !!i.continuousLeft, continuousRight: !!i.continuousRight,
    ld: anch ? anch.ldh / 0.7 : undefined,
  })
  if (crank.count > 0) {
    const zc = yBot + 0.055 * hM                    // the bottom layer it leaves
    const zt = yTop2                                // the top layer it joins
    for (const [on, bx, tx2, farX] of [
      [i.continuousLeft, crank.bottomL, crank.topL, -face],
      [i.continuousRight, crank.bottomR, crank.topR, L + face],
    ] as const) {
      if (!on) continue
      // one bar: along the bottom, up the incline, then over the support
      P.push({
        kind: 'path', stroke: CRANK, width: 2.0, cap: 'round', join: 'round',
        cmds: [
          { c: 'M', x: L / 2, y: Y(zc) },
          { c: 'L', x: bx, y: Y(zc) },
          { c: 'L', x: tx2, y: Y(zt) },
          { c: 'L', x: farX, y: Y(zt) },
        ],
      })
    }
  }

  // ── hoops ───────────────────────────────────────────────────────────────
  const hoops = hoopPositions(L, hM, sEnd, sMid, face)
  for (const x of hoops) {
    P.push({ kind: 'line', x1: x, y1: Y(cov * 0.8), x2: x, y2: Y(hM - cov * 0.8), stroke: REBAR, width: 0.75 })
  }
  // JOINT hoops — inside the column, through the depth of the beam (§418.8.3)
  for (const cx of [0, L]) {
    for (const t of [-0.28, 0.28]) {
      P.push({ kind: 'line', x1: cx + t * cw, y1: Y(cov * 0.8), x2: cx + t * cw, y2: Y(hM - cov * 0.8), stroke: REBAR, width: 0.75 })
    }
  }

  // ── callouts ────────────────────────────────────────────────────────────
  const call = (x: number, z: number, text: string, anchor: 'start' | 'middle' | 'end' = 'middle') =>
    P.push({ kind: 'text', x, y: Y(z), text, size: u * 1.5, anchor, color: REBAR, weight: 600 })
  call(L / 2, hM + colRise + u * 5.6, `${Math.max(topL, topR)}-⌀${i.barDia} TOP CONT.`)
  if (crank.count > 0) {
    // Above the beam with a leader down to the incline — the mid-depth position
    // it used to take put the text straight through the bars it labels.
    // Whichever end is actually cranked — labelling the left end of a beam that
    // only continues to the right put the callout where there is no bar.
    const mx = i.continuousLeft
      ? (crank.bottomL + crank.topL) / 2
      : (crank.bottomR + crank.topR) / 2
    const mz = hM * 0.5
    const lz = hM + colRise * 0.55
    P.push({ kind: 'line', x1: mx, y1: Y(mz), x2: mx, y2: Y(lz - u * 0.6), stroke: CRANK, width: 0.7 })
    P.push({
      kind: 'text', x: mx, y: Y(lz), text: `${crank.count}-⌀${i.barDia} CRANKED ${crank.angleDeg}°`,
      size: u * 1.4, anchor: 'middle', color: CRANK, weight: 600,
    })
  }
  if (topL > 0) call(topRun / 2, hM + colRise + u * 1.4, `${topL}-⌀${i.barDia} EXTRA`)
  if (topR > 0) call(L - topRun / 2, hM + colRise + u * 1.4, `${topR}-⌀${i.barDia} EXTRA`)
  if (botM > 0) call(L / 2, -colDrop - u * 3.4, `${botM}-⌀${i.barDia} BOT. CONT. + EXTRA`)
  call(L / 2, -colDrop - u * 5.2, `${i.legs ?? 2}L-⌀${i.stirrupDia} HOOPS @ ${Math.round(sEnd)} O/ 2h EA. END, @ ${Math.round(sMid)} ELSEWHERE`)

  // ── dimensions ──────────────────────────────────────────────────────────
  const dimTop = hM + colRise + u * 3.6
  P.push({ kind: 'dim', x1: 0, y1: Y(dimTop), x2: topRun, y2: Y(dimTop), text: `0.25L = ${Math.round(topRun * 1000)}`, off: 0, size: u * 1.35 })
  P.push({ kind: 'dim', x1: L - topRun, y1: Y(dimTop), x2: L, y2: Y(dimTop), text: `0.25L = ${Math.round(topRun * 1000)}`, off: 0, size: u * 1.35 })
  if (botM > 0) {
    P.push({ kind: 'dim', x1: 0, y1: Y(-colDrop - u * 1.6), x2: botStart, y2: Y(-colDrop - u * 1.6), text: `0.15L`, off: 0, size: u * 1.3 })
    P.push({ kind: 'dim', x1: L - botStart, y1: Y(-colDrop - u * 1.6), x2: L, y2: Y(-colDrop - u * 1.6), text: `0.15L`, off: 0, size: u * 1.3 })
  }
  // the 2h hoop zone at the left support, and the 50 mm first hoop
  const zone = Math.min(HOOP_ZONE_DEPTHS * hM, L / 2 - face)
  P.push({ kind: 'dim', x1: face, y1: Y(-colDrop - u * 7.0), x2: face + zone, y2: Y(-colDrop - u * 7.0), text: `2h = ${Math.round(zone * 1000)}`, off: 0, size: u * 1.3 })
  P.push({ kind: 'text', x: face, y: Y(-colDrop - u * 8.8), text: `${FIRST_HOOP} FIRST HOOP`, size: u * 1.2, anchor: 'start', color: NOTE })
  P.push({ kind: 'dim', x1: 0, y1: Y(-colDrop - u * 11.0), x2: L, y2: Y(-colDrop - u * 11.0), text: `L = ${Math.round(L * 1000)}`, off: 0, size: u * 1.5 })

  // ℓdh at a hooked end — the anchorage the hook has to achieve, dimensioned
  // against the room the column leaves it rather than drawn and hoped for.
  if (anch) {
    for (const [cont, cx, dir] of [[i.continuousLeft, 0, 1], [i.continuousRight, L, -1]] as const) {
      if (cont) continue
      const hx = cx - dir * (face - anch.clear / 1000)   // outside of the bend
      const faceX = cx + dir * face                       // critical section
      // Above the SPAN label at u*7.4, which the right-hand dimension used to
      // print straight through — the two shared a band and an anchor point.
      const dy = Y(hM + colRise + u * 9.4)
      P.push({
        kind: 'dim', x1: hx, y1: dy, x2: faceX, y2: dy,
        text: `${Math.round(anch.avail)} AVAIL / ℓdh ${Math.round(anch.ldh)} REQ`,
        off: 0, size: u * 1.25,
      })
      if (!anch.fits) {
        // where ℓdh would have to reach — past the back of the column
        const need = faceX - dir * (anch.ldh / 1000)
        P.push({
          kind: 'line', x1: need, y1: Y(hM + colRise + u * 9.4), x2: need, y2: Y(yTop2 - hookDrop),
          stroke: WARN, width: 0.8, dash: [u * 0.4, u * 0.3],
        })
        // Its own band, centred on the line it belongs to. Anchored to the
        // dim's end it ran straight through the AVAIL / REQ text, which is
        // centred on a span far shorter than the label it carries.
        P.push({
          kind: 'text', x: need, y: Y(hM + colRise + u * 12.6),
          text: `ℓdh ${Math.round(anch.shortfall)} SHORT`,
          size: u * 1.25, anchor: 'middle', color: WARN,
        })
      }
    }
  }

  // hook cover at an end support — the dimension image 3 turns on
  for (const [cont, cx, dir] of [[i.continuousLeft, 0, 1], [i.continuousRight, L, -1]] as const) {
    if (cont) continue
    const hx = cx - dir * (face - (anch?.clear ?? HOOK_END_COVER) / 1000)
    const ty = yTop2 - hookDrop - u * 2.2
    P.push({ kind: 'line', x1: hx, y1: Y(yTop2 - hookDrop), x2: hx - dir * u * 2.4, y2: Y(ty), stroke: NOTE, width: 0.5 })
    P.push({
      kind: 'text', x: hx - dir * u * 2.6, y: Y(ty),
      text: `${Math.round(anch?.clear ?? HOOK_END_COVER)} CL.`, size: u * 1.15,
      anchor: dir > 0 ? 'end' : 'start', color: NOTE,
    })
  }

  // ── notes ───────────────────────────────────────────────────────────────
  const notes = [
    'TOP STEEL OVER A SUPPORT IS THE GREATER OF THE TWO ADJACENT SPANS (§409.7.7)',
    ...(crank.count > 0 ? [
      `${crank.count}-⌀${i.barDia} CRANKED AT ${crank.angleDeg}° — BENT UP ${Math.round(crank.rise)} OVER ${Math.round(crank.run)}, LEAVING THE BOTTOM ${Math.round(i.L / 7 * 1000)} CLEAR OF THE SUPPORT FACE`,
      `THE CRANKED BAR IS ONE BAR: BOTTOM STEEL AT MIDSPAN, SHEAR STEEL ON THE INCLINE (§422.5.10.5), HOGGING STEEL OVER THE SUPPORT`,
      `ONLY THE CENTRE ¾ OF THE INCLINE COUNTS AS SHEAR REINFORCEMENT — ${Math.round(crank.effective)} OF ${Math.round(crank.inclined)} (§409.7.6.2.3)`,
      `¼ OF THE BOTTOM STEEL RUNS STRAIGHT INTO THE SUPPORT AND IS NEVER CRANKED (§409.7.3.8.1)`,
      `LAP CLASS B ${Math.round(crank.lapB)} (§425.5.2.1) — TOP BARS IN THE CENTRE HALF, BOTTOM BARS OVER THE SUPPORTS: EACH SPLICED WHERE ITS OWN STRESS IS LOWEST`,
      ...crank.notes,
    ] : []),
    `EXTRA TOP BARS RUN 0.25L FROM THE SUPPORT; EXTRA BOTTOM BARS START 0.15L OFF IT`,
    `HOOPS @ ${Math.round(sEnd)} OVER 2h = ${Math.round(zone * 1000)} FROM EACH SUPPORT FACE, FIRST AT ${FIRST_HOOP} (§418.6.4.1/§418.6.4.4)`,
    `HOOPS @ ${Math.round(sMid)} THROUGH THE MIDDLE — SPACING IS WIDEST WHERE THE SHEAR IS LOWEST`,
    `AT AN END SUPPORT BEAM BARS ARE HOOKED INTO THE COLUMN, ${Math.round(anch?.clear ?? HOOK_END_COVER)} CLEAR TO THE END OF THE HOOK (§425.4.3 / §418.8.3)`,
    `90° STANDARD HOOK: ${hookBendDiameter(i.barDia) / i.barDia}db INSIDE BEND ⌀${Math.round(hookBendDiameter(i.barDia))}, ℓext = 12db = ${Math.round(hook90(i.barDia).ext)}, OVERALL ${Math.round(hook90(i.barDia).depth)} DEEP (TABLE 425.3.1) — ℓdh IS MEASURED TO THE OUTSIDE OF THE BEND`,
    `TOP BARS EXTEND ${Math.round(barExtension(i.h - 60, i.barDia) * 1000)} MIN. PAST THE POINT NO LONGER REQUIRED — max(d, 12db) §409.7.3.8.4`,
  ]
  if (anch) {
    notes.push(anch.fits
      ? `ℓdh = ${Math.round(anch.ldh)} DEVELOPS IN THE ${Math.round(anch.avail)} AVAILABLE INSIDE THE COLUMN CAGE (§418.8.5.1)`
      : `ℓdh = ${Math.round(anch.ldh)} EXCEEDS THE ${Math.round(anch.avail)} AVAILABLE BY ${Math.round(anch.shortfall)} — ⌀${i.barDia} BARS DO NOT DEVELOP IN THIS COLUMN. DEEPEN IT TO ${Math.round(anch.depthNeeded)}, REDUCE THE BAR, OR USE A HEADED BAR (§425.4.4). LENGTHENING THE TAIL DOES NOT COUNT — ℓdh IS MEASURED TO THE OUTSIDE OF THE BEND`)
  }
  const noteSize = u * 1.35
  const sheetW = L + u * 8
  const noteTop = -colDrop - u * 14.5
  const nb = notesBlock({ x: x0, w: sheetW, top: Y(noteTop), size: noteSize, lines: notes, color: NOTE, step: u * 2.0 })
  P.push(...nb.prims)

  // ── title block, BELOW the drawing and the notes ────────────────────────
  const title = `TYPICAL DETAIL OF CONTINUOUS BEAM — ${i.mark} (${i.b}×${i.h})`
  const tb = titleBlock({
    x: x0, w: sheetW, top: nb.bottom + u * 2.4, u,
    title, detailNo: opts.detailNo, sheetRef: opts.sheetRef ?? 'S-07', scale: opts.scale,
  })
  P.push(...tb.prims)

  P.push({ kind: 'text', x: x1, y: Y(hM + colRise + u * 7.4), text: `SPAN ${L.toFixed(2)} m`, size: u * 1.35, anchor: 'end', color: ACCENT })

  // ── bounds: fit the content, so nothing is ever clipped ─────────────────
  // Seeded with the sheet rectangle so the block never collapses onto the
  // geometry, then grown over every primitive — text included, which is what
  // kept the ℓdh leader hanging off the top-left corner inside the page.
  const b = measureBounds(P, {
    minX: x0 - u * 1.5, maxX: Math.max(x1, x0 + sheetW) + u * 1.5,
    minY: Y(hM + colRise + u * 8.6), maxY: tb.bottom + u * 1.5,
  })

  return { primitives: P, title: `TYPICAL DETAIL OF CONTINUOUS BEAM — ${i.mark}`, bounds: b }
}

// Re-exported so the existing callers and tests keep their import site; the
// implementation now lives in `detailSheet` as a single copy.
export { GLYPH_W, wrapNote }
