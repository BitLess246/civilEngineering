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
import type { PlanPrimitive, PathCmd, Drawing } from './planRenderer'
import { hookClearToFace, hookFit, type HookFitResult } from './devLength'
import { jointHookLdh } from './beamColumnJoint'
import { GLYPH_W, wrapNote, measureBounds, notesBlock, titleBlock, leader } from './detailSheet'
import { buildColumnCage } from './columnCage'
import {
  runToPrimitive, elevationPlane, hookBendDiameter, continuousBars,
  CORNER_BARS_PER_FACE, KEEP_TOP, KEEP_BOTTOM, splicesRequired, STOCK_BAR_LENGTH,
} from './rebarModel'

export interface BeamDetailSection {
  /** 'LEFT' | 'MID' | 'RIGHT' — position along the member. */
  label: string
  /** Distance from the left end, m. */
  x: number
  /** True for a hogging (top-steel) section. */
  hogging: boolean
  /** Bars provided at this section, in the TENSION face. */
  bars: number
  /**
   * Bars in the COMPRESSION face that the design actually counted — a doubly
   * reinforced section. Omitted or zero means singly reinforced: the two
   * corner bars in that face are still there and still drawn, but they are
   * stirrup hangers and take no part in the analysis.
   */
  compressionBars?: number
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
  /**
   * The supporting column's own cage, so the sheet can draw the steel the beam
   * bars hook behind instead of an empty rectangle.
   *
   * Spacings come straight from `columnDesign` — `tieSpacingFinal`,
   * `seismicSOut` and `seismicLoZone`. Omitted, the columns are drawn as
   * outlines exactly as before.
   */
  columnCage?: {
    /** Longitudinal bars around the perimeter. */
    bars: number
    /** Tie spacing in the confinement zone and outside it, mm. */
    sConfined: number
    sOutside?: number
    /** Confinement zone length from each end, mm (§418.7.5.1). Zero = none. */
    lo?: number
    /** Clear column height either side of the beam, m — how much is drawn. */
    storey?: number
  }
}

export interface BeamDetailOptions { detailNo?: string; sheetRef?: string; scale?: string }
export interface BeamDetailDrawing extends Drawing { title: string }

export const REBAR_INK = '#b45309'
const INK = '#1e293b', REBAR = REBAR_INK, GRID = '#9aa5b5', NOTE = '#475569', ACCENT = '#0f766e'
export const CRANK_INK = '#1d4ed8'
/** Hoops sit behind the longitudinal steel — lighter, so the bars read first. */
const HOOP = '#c7a17a'
/** The band marking a lap, painted along the two bars that share it. */
const LAP = '#0891b2'
/** Column steel — its own ink, so it never reads as the beam's. */
const COLBAR = '#7c3aed'
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
 * Minimum INSIDE bend diameter for a standard hook, mm — NSCP Table 425.3.1.
 *
 * The table itself lives in `rebarModel`, which is where every consumer of bar
 * geometry reads it. Re-exported here so the sheet's own callers and tests keep
 * their import site; two copies of a code table is how they drift apart.
 */
export { hookBendDiameter } from './rebarModel'

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

// ── Cranked (bent) bar ends ──────────────────────────────────────────────

export interface CrankInput {
  /** Span, m — support centreline to support centreline. */
  L: number
  /** Overall depth and clear cover, mm. */
  h: number
  cover: number
  stirrupDia: number
  barDia: number
  /** Where the extra TOP bars stop, m from each support centreline. */
  topRun: number
  /** Where the extra BOTTOM bars start, m from each support centreline. */
  botStart: number
  /** Support width, mm. */
  colB?: number
  /** Bend angle from the horizontal, degrees. 45° is the standard crank. */
  angleDeg?: number
  /** Tension development length ℓd, mm — sets the Class B lap quoted on the
   *  sheet for bar-to-bar splices. */
  ld?: number
  /** Special moment frame. Bent bars may NOT be counted as shear
   *  reinforcement there (§418.6.3.1 requires hoops). */
  seismic?: boolean
}

/**
 * One cranked bar end: the bar runs straight to `at`, then kinks towards the
 * opposite face, finishing `run` further along and `rise` away from its layer.
 * `tip` is that finish point in span coordinates; `drop` is the offset from
 * the bar's own layer, in metres, as a magnitude — which face it moves towards
 * follows from which layer the bar is in.
 */
export interface CrankEnd {
  at: number
  tip: number
  drop: number
}

/** Where the top and bottom curtailed bars are both present. */
export interface CrankOverlap {
  from: number
  to: number
  length: number
}

export interface CrankResult {
  angleDeg: number
  /** The crank's vertical and horizontal projection, mm. */
  rise: number
  run: number
  /** Length of the inclined leg, mm. */
  inclined: number
  /** Class B lap, mm (§425.5.2.1) — quoted for the through bars' own splices. */
  lap: number
  /** The extra TOP bar at each support, cranking DOWN where it stops.
   *  [0] is the left-hand bar, [1] the right-hand one. */
  top: [CrankEnd, CrankEnd]
  /** The extra BOTTOM bar, cranking UP at each of its ends. */
  bot: [CrankEnd, CrankEnd]
  /** Where a top bar and the bottom bar are both present — the overlap that
   *  makes the curtailment read as continuous reinforcement. */
  overlaps: CrankOverlap[]
  ok: boolean
  notes: string[]
}

/**
 * Cranked bar ends for a continuous beam.
 *
 * A curtailed bar is not drawn simply stopping in mid-air: at the point it is
 * no longer needed it is cranked towards the opposite face. The kink is what
 * tells the reader — and the bar bender — that the bar ENDS here rather than
 * continuing behind the bar drawn beyond it.
 *
 *   • the EXTRA TOP bar runs from the support to 0.25L, then cranks DOWN;
 *   • the EXTRA BOTTOM bar runs through midspan to 0.15L off each support,
 *     then cranks UP.
 *
 * Because 0.15L is inboard of 0.25L, the two runs overlap between them, so no
 * station along the span is left with neither bar present. They are in opposite
 * faces and do NOT splice with one another — the overlap is continuity of
 * reinforcement, not a lap. The Class B figure returned is for the through
 * bars' own splices.
 *
 * §422.5.10.5 lets a bent bar act as shear reinforcement and §409.7.6.2.3
 * counts only the centre three-quarters of the inclined portion — but a crank
 * this short is a bar terminator, not a shear bar, so the sheet says so rather
 * than claiming the capacity.
 */
export function crankBars(i: CrankInput): CrankResult {
  const angleDeg = i.angleDeg ?? 45
  // A terminator, sized off the member: deep enough to read at drawing scale,
  // never so long it eats the span it sits in.
  const rise = Math.max(0, Math.min(0.33 * i.h, 0.05 * i.L * 1000))
  const run = rise / Math.tan((angleDeg * Math.PI) / 180)
  const inclined = Math.hypot(rise, run)
  const lap = Math.max(1.3 * (i.ld ?? 0), 300)                 // §425.5.2.1
  const d = run / 1000, z = rise / 1000

  // Each stub continues in the direction its bar was already heading.
  const top: [CrankEnd, CrankEnd] = [
    { at: i.topRun, tip: i.topRun + d, drop: z },
    { at: i.L - i.topRun, tip: i.L - i.topRun - d, drop: z },
  ]
  const bot: [CrankEnd, CrankEnd] = [
    { at: i.botStart, tip: i.botStart - d, drop: z },
    { at: i.L - i.botStart, tip: i.L - i.botStart + d, drop: z },
  ]

  const overlaps: CrankOverlap[] = []
  for (const [a, b] of [[i.botStart, i.topRun], [i.L - i.topRun, i.L - i.botStart]] as const) {
    if (b > a) overlaps.push({ from: a, to: b, length: (b - a) * 1000 })
  }

  const notes: string[] = []
  if (rise <= 0) notes.push('THE MEMBER IS TOO SMALL TO CRANK — CHECK THE DEPTH AND SPAN')
  if (overlaps.length < 2) notes.push(`THE EXTRA TOP BAR STOPS AT ${Math.round(i.topRun * 1000)} AND THE EXTRA BOTTOM BAR ONLY STARTS AT ${Math.round(i.botStart * 1000)} — THERE IS A LENGTH OF SPAN WITH NEITHER; EXTEND ONE OF THEM`)
  if (i.topRun * 2 >= i.L) notes.push('THE TWO EXTRA TOP BARS MEET OR CROSS AT MIDSPAN — DETAIL THEM AS ONE CONTINUOUS TOP BAR INSTEAD')
  if (i.seismic) notes.push('SPECIAL MOMENT FRAME — BENT BARS MAY NOT BE COUNTED AS SHEAR REINFORCEMENT (§418.6.3.1); THE HOOPS CARRY ALL OF Vs')

  return {
    angleDeg, rise, run, inclined, lap, top, bot, overlaps,
    ok: rise > 0 && overlaps.length === 2 && i.topRun * 2 < i.L,
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

  // Which bars run THROUGH and which are curtailed — the split the drawing is
  // about. Two rules, governing one wins: the four corner bars are there
  // whatever the analysis asked for, and on top of that §409.7.3.8.4 keeps a
  // third of the negative steel past the inflection point and §409.7.3.8.1 a
  // quarter of the positive steel into the support. See `continuousBars`.
  //
  // Clamping to the designed count instead — what this did — drew a simply
  // supported beam with NO top steel, leaving the stirrups tied to nothing.
  const thruTop = continuousBars(Math.max(topL, topR), KEEP_TOP)
  const thruBot = continuousBars(botM, KEEP_BOTTOM)
  const extraTopL = Math.max(0, topL - thruTop)
  const extraTopR = Math.max(0, topR - thruTop)
  const extraBot = Math.max(0, botM - thruBot)

  // Is the compression face counted, or is it just holding the stirrups?
  // Midspan governs the top face: that is where a beam is singly reinforced.
  const midComp = mid?.compressionBars ?? 0
  const doublyReinforced = midComp > 0
  const hangerTop = !doublyReinforced && Math.max(topL, topR) === 0

  // Spacings: the ends take whichever support was designed tighter, the middle
  // its own — and neither is ever the drawing's floor. See `zoneSpacing`.
  const sEnd = Math.min(
    zoneSpacing(left?.stirrupSpacing ?? 0, i.h, i.cover),
    zoneSpacing(right?.stirrupSpacing ?? 0, i.h, i.cover),
  )
  const sMidRaw = zoneSpacing(mid?.stirrupSpacing ?? 0, i.h, i.cover)
  // Shear grows towards the support, so the end zone can never be looser than
  // the middle. Where no support section was designed the end falls back to the
  // §409.7.6.2.2 maximum, which on a beam whose midspan WAS designed comes out
  // wider than midspan — a sheet with its hoops thinnest where the shear is
  // highest, contradicting its own note.
  const sMid = sMidRaw
  const sEndUsed = Math.min(sEnd, sMid)

  const face = cw / 2                                     // support face from its centreline
  const x0 = -face, x1 = L + face                         // the drawn extent of the beam

  // ── concrete outline ────────────────────────────────────────────────────
  // Beam and column are ONE pour, so a line is drawn only where concrete meets
  // air. Two consequences the previous version got wrong:
  //
  //   * the beam's top and soffit stop at the column face they frame into and
  //     do NOT continue across the column. It used to be a single rectangle
  //     spanning the whole sheet, which drew a beam passing straight through
  //     both columns;
  //   * the column face the beam frames into is BROKEN over the beam depth —
  //     there is no edge there to draw.
  //
  // A face is "open" when there is beam on the other side of it: always on the
  // span side, and on the far side too where the member carries on past that
  // support.
  const hookDrop = Math.max((12 * i.barDia) / 1000, 0.12)   // 12db tail, §425.3.1
  const colDrop = Math.max(hM * 0.9, hookDrop + 0.06), colRise = hM * 0.45
  /** How far the beam is carried past a continuous support before the break. */
  const stub = Math.min(cw * 0.8, L * 0.05)

  for (const [cx, spanDir, contFar] of [
    [0, 1, !!i.continuousLeft], [L, -1, !!i.continuousRight],
  ] as const) {
    // column concrete above and below the beam — fill only, no stroke; every
    // edge is drawn as its own line so the ones that must not exist are omitted
    P.push({ kind: 'rect', x: cx - face, y: Y(0), w: cw, h: colDrop, stroke: 'none', fill: CONC })
    P.push({ kind: 'rect', x: cx - face, y: Y(hM + colRise), w: cw, h: colRise, stroke: 'none', fill: CONC })
    for (const s of [-1, 1] as const) {
      const fx = cx + s * face
      P.push({ kind: 'line', x1: fx, y1: Y(hM + colRise), x2: fx, y2: Y(hM), stroke: INK, width: 1.1 })
      P.push({ kind: 'line', x1: fx, y1: Y(0), x2: fx, y2: Y(-colDrop), stroke: INK, width: 1.1 })
      if (s !== spanDir && !contFar) {
        P.push({ kind: 'line', x1: fx, y1: Y(hM), x2: fx, y2: Y(0), stroke: INK, width: 1.1 })
      }
    }
    // the column is cut off above and below — draw where
    for (const cz of [hM + colRise, -colDrop]) {
      P.push({ kind: 'line', x1: cx - face, y1: Y(cz), x2: cx + face, y2: Y(cz), stroke: INK, width: 1.1 })
    }
  }

  // ── the columns' own steel ──────────────────────────────────────────────
  // Drawn from a real cage rather than sketched here, so the verticals the
  // beam bars hook behind are the bars the take-off weighs and the 3D view
  // will string. The joint band carries no COLUMN ties: hoops through the
  // joint belong to the joint (§418.8.3), and the sheet already draws them.
  if (i.columnCage) {
    const cc = i.columnCage
    const plane = elevationPlane([1, 0, 0])
    for (const cx of [0, L]) {
      const cage = buildColumnCage({
        mark: `${i.mark}-COL`,
        b: i.b, h: cw * 1000, cover: i.hookAnchorage?.colCover ?? (i.cover ?? 40),
        barDia: i.hookAnchorage?.colBarDia ?? i.barDia,
        bars: Math.max(4, Math.round(cc.bars)),
        tieDia: i.hookAnchorage?.colTieDia ?? i.stirrupDia,
        sConfined: cc.sConfined,
        sOutside: cc.sOutside ?? cc.sConfined,
        lo: cc.lo ?? 0,
        centre: [cx, 0],
        yBottom: -colDrop, yTop: hM + colRise,
        jointGap: [0, hM],
      })
      for (const run of cage.runs) {
        P.push(runToPrimitive(run, plane, {
          stroke: run.role === 'tie' ? HOOP : COLBAR,
          width: run.role === 'tie' ? 0.8 : 1.4,
        }))
      }
    }
  }

  // Beam top and soffit: the clear span, plus a stub past a continuous support
  // to show the member carries on into the next one.
  const bay: [number, number][] = [[face, L - face]]
  if (i.continuousLeft) bay.push([-face - stub, -face])
  if (i.continuousRight) bay.push([L + face, L + face + stub])
  for (const [a, bx] of bay) for (const z of [hM, 0]) {
    P.push({ kind: 'line', x1: a, y1: Y(z), x2: bx, y2: Y(z), stroke: INK, width: 1.3 })
  }
  // break line on the cut end of each stub
  for (const [cont, ex] of [
    [i.continuousLeft, -face - stub], [i.continuousRight, L + face + stub],
  ] as const) {
    if (!cont) continue
    P.push({ kind: 'line', x1: ex, y1: Y(-hM * 0.06), x2: ex, y2: Y(hM * 1.06), stroke: GRID, width: 0.8, dash: [u * 1.2, u * 0.9] })
  }
  // How far a straight bar is drawn: to the stub end where the member carries
  // on, and to the START OF ITS BEND where it hooks. Running it to the cover
  // line instead left a stub of bar poking out past the hook it belongs to.
  const barEnd = (cx: number, dir: 1 | -1, cont: boolean, down: boolean) =>
    cont ? cx - dir * (face + stub) : hookGeom(cx, dir, down).turn

  // ── longitudinal steel ──────────────────────────────────────────────────
  // Bars sit at their real centroid — clear cover, then the hoop, then half a
  // bar. Drawing them on the cover line put them under the tips of the hoop
  // legs, so the pair read as an outline around the hoops rather than as
  // steel, and the extra bars sat on top of them again.
  const inset = (i.cover ?? 40) + i.stirrupDia + i.barDia / 2
  const yTop = hM - inset / 1000, yBot = inset / 1000
  // The curtailed bars run in the SAME layer as the through bars — side by side
  // across the web, not stacked above them — so they are drawn on the same two
  // lines. An earlier version offset them inward to make both visible, which
  // shortened the drawn rise and left a crank labelled 45° drawn at 36°; the
  // straight length of an extra bar is now told by the callout and the crank,
  // and the geometry on the sheet is the geometry that gets built.
  const yTop2 = yTop, yBot2 = yBot

  // A 90° standard hook is a BEND, not a corner: NSCP Table 425.3.1 sets a 6db
  // (⌀≤25) or 8db inside diameter and ℓext = 12db of straight tail, and ℓdh is
  // measured to the OUTSIDE of the bend (§425.4.3). Drawing a square corner
  // asks for a bar nobody can bend and hides how much depth the bend eats.
  //
  // `dir` points INTO the span from the support centreline `cx`; `down` turns
  // the tail towards the soffit, which is what a top bar does.
  //
  // The turned leg's centreline, and the station where the straight bar starts
  // to bend. The top and bottom hooks are staggered by one bar diameter so
  // their tails pass rather than collide: in a beam of ordinary depth two 12db
  // tails are longer than the gap between the two bar layers.
  const hookGeom = (cx: number, dir: 1 | -1, down: boolean) => {
    const hk = hook90(i.barDia)
    const r = hk.radius / 1000
    const hOut = cx - dir * (face - (anch?.clear ?? HOOK_END_COVER) / 1000)
    const stagger = down ? 0 : i.barDia / 1000
    const hx = hOut + dir * (hk.outside / 1000 + stagger)
    return { hk, r, hx, turn: hx + dir * r }
  }
  const hookCmds = (cx: number, dir: 1 | -1, z: number, down: boolean): PathCmd[] => {
    const { hk, r, hx, turn } = hookGeom(cx, dir, down)
    const sgn = down ? 1 : -1                        // screen y grows downward
    // Sweep: the bend's centre sits on the INSIDE of the corner, so the arc
    // bulges away from it. Inverted, the bar appeared to curl back into the
    // corner it was turning out of — a fillet no bender could make.
    return [
      { c: 'M', x: hx, y: Y(z) + sgn * (hk.ext / 1000 + r) },
      { c: 'L', x: hx, y: Y(z) + sgn * r },
      { c: 'A', rx: r, ry: r, x: turn, y: Y(z), large: 0, sweep: (dir > 0) === down ? 1 : 0 },
    ]
  }

  // THROUGH bars — the pair that runs the whole length and is never cranked.
  // At an end support they have nowhere to go, so they hook into the column;
  // at a continuous one they run straight on through the joint.
  for (const [z, down] of [[yTop, true], [yBot, false]] as const) {
    P.push({
      kind: 'line', stroke: REBAR, width: 1.8,
      x1: barEnd(0, 1, !!i.continuousLeft, down), y1: Y(z),
      x2: barEnd(L, -1, !!i.continuousRight, down), y2: Y(z),
    })
    for (const [cont, cx, dir] of [[i.continuousLeft, 0, 1], [i.continuousRight, L, -1]] as const) {
      if (cont) continue
      P.push({ kind: 'path', stroke: REBAR, width: 2.2, cap: 'round', join: 'round', fill: 'none', cmds: hookCmds(cx, dir, z, down) })
    }
  }

  const topRun = EXTRA_TOP_FRACTION * L
  const botStart = EXTRA_BOTTOM_FRACTION * L
  const crank = crankBars({
    L, h: i.h, cover: i.cover ?? 40, stirrupDia: i.stirrupDia, barDia: i.barDia,
    topRun, botStart, colB: i.colB ?? 400, ld: anch ? anch.ldh / 0.7 : undefined,
  })

  // ── curtailed bars, cranked where they stop ─────────────────────────────
  // Each extra bar runs straight to its curtailment and then kinks towards the
  // opposite face. The kink is a terminator: it says the bar ENDS here, rather
  // than continuing behind whatever is drawn beyond it.
  const CR = { stroke: CRANK, width: 2.0, cap: 'round', join: 'round' } as const

  // EXTRA top bars: support → 0.25L → crank DOWN.
  for (const [cont, cx, dir, ce, n] of [
    [i.continuousLeft, 0, 1, crank.top[0], extraTopL],
    [i.continuousRight, L, -1, crank.top[1], extraTopR],
  ] as const) {
    if (n <= 0) continue
    const startX = barEnd(cx, dir, !!cont, true)   // through the joint, or its bend
    const cmds: PathCmd[] = [{ c: 'M', x: startX, y: Y(yTop2) }]
    // At an end support the extra bar hooks down into the column exactly as the
    // through bar above it does — same bend, same clear to the tail.
    if (!cont) { cmds.length = 0; cmds.push(...hookCmds(cx, dir, yTop2, true)) }
    cmds.push(
      { c: 'L', x: ce.at, y: Y(yTop2) },                 // straight run to the cut-off
      { c: 'L', x: ce.tip, y: Y(yTop2 - ce.drop) },      // the crank, turned down
    )
    P.push({ kind: 'path', ...CR, cmds })
  }

  // EXTRA bottom bar: one bar through the middle, cranked UP at both ends.
  if (extraBot > 0) {
    P.push({
      kind: 'path', ...CR,
      cmds: [
        { c: 'M', x: crank.bot[0].tip, y: Y(yBot2 + crank.bot[0].drop) },
        { c: 'L', x: crank.bot[0].at, y: Y(yBot2) },
        { c: 'L', x: crank.bot[1].at, y: Y(yBot2) },
        { c: 'L', x: crank.bot[1].tip, y: Y(yBot2 + crank.bot[1].drop) },
      ],
    })
  }

  // Where a top bar and the bottom bar are both present. They are in opposite
  // faces and do not splice with each other — the band marks that no length of
  // span is left with neither, which is what the staggered cut-offs buy.
  // An overlap needs BOTH bars. On a simply supported beam there is no top
  // extra to overlap with, and banding it anyway claimed a lap with a bar the
  // sheet does not draw.
  const overlapsShown = crank.overlaps.filter((_, k) => extraBot > 0 && (k === 0 ? extraTopL : extraTopR) > 0)
  for (const ov of overlapsShown) {
    P.push({ kind: 'line', x1: ov.from, y1: Y(hM / 2), x2: ov.to, y2: Y(hM / 2), stroke: LAP, width: 3.4 })
  }

  // ── hoops ───────────────────────────────────────────────────────────────
  // Drawn to the cover line, OUTSIDE the bars they enclose.
  const hoops = hoopPositions(L, hM, sEndUsed, sMid, face)
  for (const x of hoops) {
    P.push({ kind: 'line', x1: x, y1: Y(cov), x2: x, y2: Y(hM - cov), stroke: HOOP, width: 0.8 })
  }
  // JOINT hoops — inside the column, through the depth of the beam (§418.8.3)
  for (const cx of [0, L]) {
    for (const t of [-0.28, 0.28]) {
      P.push({ kind: 'line', x1: cx + t * cw, y1: Y(cov), x2: cx + t * cw, y2: Y(hM - cov), stroke: HOOP, width: 0.8 })
    }
  }

  // ── callouts ────────────────────────────────────────────────────────────
  const call = (x: number, z: number, text: string, anchor: 'start' | 'middle' | 'end' = 'middle') =>
    P.push({ kind: 'text', x, y: Y(z), text, size: u * 1.5, anchor, color: REBAR, weight: 600 })
  // The corner bars, and whether the analysis counted them.
  const topTail = doublyReinforced
    ? `COUNTED AS A's AT MIDSPAN`
    : hangerTop ? `STIRRUP HANGERS — NOT COUNTED` : `STRAIGHT, NEVER CRANKED`
  call(L / 2, hM + colRise + u * 5.6, `${thruTop}-⌀${i.barDia} TOP THRU — ${topTail}`)
  if (extraTopL > 0) call(topRun / 2, hM + colRise + u * 1.4, `${extraTopL}-⌀${i.barDia} EXTRA TOP`)
  if (extraTopR > 0) call(L - topRun / 2, hM + colRise + u * 1.4, `${extraTopR}-⌀${i.barDia} EXTRA TOP`)
  call(L / 2, -colDrop - u * 3.4, `${thruBot}-⌀${i.barDia} BOT. THRU${extraBot > 0 ? ` + ${extraBot}-⌀${i.barDia} EXTRA` : ''}`)
  call(L / 2, -colDrop - u * 5.2, `${i.legs ?? 2}L-⌀${i.stirrupDia} HOOPS @ ${Math.round(sEndUsed)} O/ 2h EA. END, @ ${Math.round(sMid)} ELSEWHERE`)

  // The crank itself, labelled on the incline it names. One leader per crank
  // so the reader is never left guessing which bar the note is about.
  // ONE crank callout, marked typical. Labelling each crank in full printed the
  // two labels over each other: at u = L/60 the text is a third of the span
  // wide, so any two of them inside the middle half of the beam collide. The
  // rise and run are in the notes, where there is room for them.
  const crankAt = extraTopL > 0 ? crank.top[0] : extraBot > 0 ? crank.bot[1] : undefined
  if (crankAt) {
    const mx = (crankAt.at + crankAt.tip) / 2
    const inward = mx < L / 2 ? 1 : -1
    P.push(...leader({
      x: mx, y: Y((yTop2 + yBot2) / 2),
      tx: mx + inward * L * 0.07, ty: Y(hM + colRise * 0.55),
      text: `CRANK ${crank.angleDeg}° TYP.`, size: u * 1.3, color: CRANK,
    }))
  }

  // One overlap callout with a leader onto the band it names. Labelling every
  // band put text on top of the bars and hoops it was meant to describe.
  const ov0 = overlapsShown[0]
  if (ov0) {
    const mx = (ov0.from + ov0.to) / 2
    P.push(...leader({
      x: mx, y: Y(hM / 2),
      tx: mx + L * 0.06, ty: Y(-colDrop * 0.42),
      text: `TOP AND BOTTOM EXTRAS OVERLAP ${Math.round(ov0.length)}`,
      size: u * 1.2, color: LAP,
    }))
  }

  // ── dimensions ──────────────────────────────────────────────────────────
  const dimTop = hM + colRise + u * 3.6
  // Only where the bar being dimensioned exists. A beam with no hogging steel
  // has no extra top bar, and dimensioning its run described nothing.
  if (extraTopL > 0) P.push({ kind: 'dim', x1: 0, y1: Y(dimTop), x2: topRun, y2: Y(dimTop), text: `0.25L = ${Math.round(topRun * 1000)}`, off: 0, size: u * 1.35 })
  if (extraTopR > 0) P.push({ kind: 'dim', x1: L - topRun, y1: Y(dimTop), x2: L, y2: Y(dimTop), text: `0.25L = ${Math.round(topRun * 1000)}`, off: 0, size: u * 1.35 })
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

  // The hook, dimensioned at an end support: the clear cover to the end of the
  // tail, and ℓext itself.
  //
  // ℓext is measured from the CENTRE OF THE BEND to the end of the tail — which
  // on a 90° hook is the same level as where the straight leg leaves the arc,
  // since the leg is tangent to the bend there. Dimensioning it from the bar's
  // own centreline instead would overstate the tail by the bend radius.
  for (const [cont, cx, dir] of [[i.continuousLeft, 0, 1], [i.continuousRight, L, -1]] as const) {
    if (cont) continue
    const { hx, hk } = hookGeom(cx, dir, true)
    const r = hk.radius / 1000, ext = hk.ext / 1000
    const bendC = yTop2 - r                              // bend centre = tangent level
    // One leader for the hook, two lines. These used to be a rotated ℓext
    // dimension plus a separate clear-cover leader: the rotated text was three
    // times longer than the 240 it dimensioned, so it overran its own extension
    // lines and landed on top of the other callout.
    P.push(...leader({
      x: hx, y: Y(bendC - ext),                          // the end of the tail
      tx: cx - dir * (face + u * 1.0), ty: Y(bendC - ext),
      text: `ℓext = ${Math.round(hk.ext)}`,
      text2: `${Math.round(anch?.clear ?? HOOK_END_COVER)} CL. TO END`,
      size: u * 1.15,
      side: dir > 0 ? 'right' : 'left',
    }))
    // The datum ℓext is measured FROM — the centre of the bend, which on a 90°
    // hook is the level the straight leg leaves the arc.
    P.push({
      kind: 'line', x1: hx - dir * u * 1.4, y1: Y(bendC), x2: hx + dir * r, y2: Y(bendC),
      stroke: GRID, width: 0.5, dash: [u * 0.35, u * 0.3],
    })
  }

  // ── notes ───────────────────────────────────────────────────────────────
  const spliceCount = splicesRequired(x1 - x0, crank.lap / 1000)
  const notes = [
    `${CORNER_BARS_PER_FACE * 2}-⌀${i.barDia} CORNER BARS RUN THE FULL LENGTH — ${CORNER_BARS_PER_FACE} TOP, ${CORNER_BARS_PER_FACE} BOTTOM, ONE IN EACH CORNER OF THE CAGE. THEY ARE WHAT THE STIRRUPS ARE TIED TO AND ARE NEVER CRANKED`,
    doublyReinforced
      ? `MIDSPAN IS DOUBLY REINFORCED — ${midComp}-⌀${i.barDia} IN THE COMPRESSION FACE IS COUNTED AS A's IN THE ANALYSIS`
      : `THE COMPRESSION FACE IS NOT COUNTED IN THE ANALYSIS — THE SECTION IS SINGLY REINFORCED AND ITS ${CORNER_BARS_PER_FACE} BARS ARE THERE TO HOLD THE STIRRUPS`,
    spliceCount > 0
      ? `THE CORNER BARS ARE ${Math.round((x1 - x0) * 1000)} LONG AND STOCK IS ${STOCK_BAR_LENGTH * 1000} — ${spliceCount} CLASS B LAP${spliceCount > 1 ? 'S' : ''} OF ${Math.round(crank.lap)} PER BAR, STAGGERED AND PLACED WHERE THAT BAR'S STRESS IS LOWEST (§425.5.2.1). THIS IS THE ONLY THING THAT MAY INTERRUPT A CORNER BAR`
      : `THE CORNER BARS ARE ${Math.round((x1 - x0) * 1000)} LONG AND FIT ONE ${STOCK_BAR_LENGTH * 1000} STOCK LENGTH — NO SPLICE REQUIRED`,
    'TOP STEEL OVER A SUPPORT IS THE GREATER OF THE TWO ADJACENT SPANS (§409.7.7)',
    ...(extraTopL + extraTopR + extraBot > 0 ? [
      `EVERY CURTAILED BAR IS CRANKED WHERE IT STOPS — THE KINK MARKS THE END OF THAT BAR, NOT A BAR CONTINUING BEHIND THE NEXT ONE`,
      `CRANK AT ${crank.angleDeg}°: ${Math.round(crank.rise)} DEEP OVER ${Math.round(crank.run)} OF RUN, INCLINED LENGTH ${Math.round(crank.inclined)}`,
      ...(extraTopL + extraTopR > 0 ? [`EXTRA TOP BARS RUN 0.25L FROM THE SUPPORT AND CRANK DOWN`] : []),
      ...(extraBot > 0 ? [`EXTRA BOTTOM BARS RUN TO 0.15L OFF EACH SUPPORT AND CRANK UP`] : []),
      ...(overlapsShown[0] ? [`THE TWO RUNS OVERLAP ${Math.round(overlapsShown[0].length)} BETWEEN 0.15L AND 0.25L, SO NO LENGTH OF SPAN IS LEFT WITH NEITHER. THEY ARE IN OPPOSITE FACES AND DO NOT SPLICE WITH EACH OTHER`] : []),
      `CLASS B LAP FOR THE THROUGH BARS' OWN SPLICES: ${Math.round(crank.lap)} (§425.5.2.1)`,
      `A CRANK THIS SMALL IS A BAR TERMINATOR, NOT SHEAR REINFORCEMENT — §422.5.10.5 AND §409.7.6.2.3 ARE NOT CLAIMED FOR IT`,
      `${thruTop}-⌀${i.barDia} TOP AND ${thruBot}-⌀${i.barDia} BOTTOM RUN THROUGH STRAIGHT AND ARE NEVER CRANKED (§409.7.3.8.4 / §409.7.3.8.1)`,
      `EXTRA BARS SHARE THE THROUGH BARS' LAYER — SIDE BY SIDE ACROSS THE ${i.b} WEB AT 25 CLEAR (§425.2.2), NOT STACKED ABOVE THEM`,
      ...crank.notes,
    ] : []),
    `HOOPS @ ${Math.round(sEndUsed)} OVER 2h = ${Math.round(zone * 1000)} FROM EACH SUPPORT FACE, FIRST AT ${FIRST_HOOP} (§418.6.4.1/§418.6.4.4)`,
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
