// ─────────────────────────────────────────────────────────────────────────
// FRAME ELEVATION — one grid line, one level, drawn from the cages themselves
//
// The beam sheets before this were TYPICAL details: one beam, drawn alone,
// floating between two stubs of column that stood for whatever happened to be
// there. A typical detail cannot show the things that actually go wrong at a
// joint — a column stepping in and its bars cranking to find the bars above, a
// splice landing in the wrong third of a storey, two beams of different depth
// meeting one column — because it has no neighbours to show them against.
//
// So this sheet is PER MEMBER, in context: the whole grid line at one level,
// with every column carried half a storey below the beams and half a storey
// above, which is exactly the band a joint's detailing lives in.
//
// EVERYTHING IS DRAWN FROM THE CAGES. Not from the section sizes and a set of
// drawing rules that re-derive what the cage already decided — from the same
// `RebarCage` objects the 3D scene paints and the bar schedule counts. If the
// engine cranks a bar, the crank is on this sheet; if it does not, no amount of
// drawing code will put one there. That is the whole point of the change: the
// drawing can no longer disagree with the steel.
//
// The band is a CLIP, not a filter. A bar that runs out of the top of the sheet
// is cut at the sheet edge and shown running out, because that is what it does.
//
// Units: geometry m, sections mm. The plane's +Y is DOWN the page, which is
// `elevationPlane`'s own convention, so a world level y draws at −y.
// ─────────────────────────────────────────────────────────────────────────
import type { Drawing, PlanPrimitive } from './planRenderer'
import {
  cageToPrimitives, projectPath, type RebarCage, type RebarRun, type ViewPlane,
} from './rebarModel'
import { titleBlock, notesBlock, sheetBounds, leader, leaderKnee, textWidth } from './detailSheet'
import { seeGeneralNotes } from './generalNotes'
import { spanSections, sectionTally, type BeamSection } from './beamSection'
import {
  SHEET_INK, SHEET_NOTE, SHEET_GRID, STEEL, STEEL_LIGHT,
} from './sheetInk'

/** Concrete on the sheet, already reduced to the elevation plane. */
export interface ElevationMember {
  mark: string
  role: 'beam' | 'column'
  /** Along the grid line, m — the plane's u. */
  u0: number
  u1: number
  /** World levels, m. `yTop` of a beam is its floor level. */
  yBot: number
  yTop: number
  /** Section, mm, for the callout. */
  bw: number
  d: number
  /** What to call it out as — bars, spacing. One short line. */
  note?: string
}

export interface FrameElevationInput {
  /** Grid line label — 'A', '2', … */
  line: string
  /** The floor level this sheet is about, m. It is the TOP of its beams. */
  y: number
  /** The band drawn, m — half a storey either side of the beams. */
  yLo: number
  yHi: number
  /** The plane the cages project onto. Its origin must have y = 0. */
  plane: ViewPlane
  members: ElevationMember[]
  /** Column centrelines along the grid, m, with their bubble labels. */
  grids: { u: number; label: string }[]
  cages: RebarCage[]
  /** Which cages belong to THIS level — drawn as the subject, not context. */
  subject: Set<string>
}

export interface FrameElevationOptions {
  detailNo?: string
  sheetRef?: string
  project?: string
}

export interface FrameElevationDrawing extends Drawing {
  title: string
  /** What the detailing had to decide or could not do — for the panel beside
   *  the sheet, never printed under it. */
  designNotes: string[]
}

const CONCRETE = '#e2e8f0'

/**
 * A polyline cut to a horizontal band, as the pieces that survive.
 *
 * Per segment, so a bar that leaves the band and comes back gives two pieces
 * rather than one straight line joining its two ends. Endpoints are
 * interpolated onto the band edge, which is what makes a clipped bar read as
 * running OUT of the sheet instead of stopping just inside it.
 */
export function clipToBand(
  pts: [number, number][], lo: number, hi: number,
): [number, number][][] {
  const out: [number, number][][] = []
  let cur: [number, number][] = []
  const inside = (p: [number, number]) => p[1] >= lo - 1e-9 && p[1] <= hi + 1e-9
  const cross = (a: [number, number], b: [number, number], y: number): [number, number] => {
    const t = Math.abs(b[1] - a[1]) < 1e-12 ? 0 : (y - a[1]) / (b[1] - a[1])
    return [a[0] + (b[0] - a[0]) * t, y]
  }
  const flush = () => { if (cur.length > 1) out.push(cur); cur = [] }

  for (let k = 0; k < pts.length; k++) {
    const p = pts[k]
    if (k === 0) { if (inside(p)) cur.push(p); continue }
    const a = pts[k - 1], b = p
    const ai = inside(a), bi = inside(b)
    if (ai && bi) { cur.push(b); continue }
    // the edge this segment leaves or enters through
    const edge = (from: [number, number], to: [number, number]) =>
      cross(from, to, to[1] < lo ? lo : hi)
    if (ai && !bi) { cur.push(edge(a, b)); flush(); continue }
    if (!ai && bi) { cur = [edge(b, a), b]; continue }
    // both outside: it still crosses the band if the two are on opposite sides
    if ((a[1] < lo && b[1] > hi) || (a[1] > hi && b[1] < lo)) {
      out.push([cross(a, b, a[1] < lo ? lo : hi), cross(a, b, a[1] < lo ? hi : lo)])
    }
  }
  flush()
  return out
}

// ── reading the schedule back OFF the cage ────────────────────────────────
// The typical detail this sheet replaces printed the spacing it was HANDED —
// the design's `sAdopt` — beside a ladder of stirrups drawn by a different
// rule. The two disagreed for a while and nobody could tell from the sheet.
// Everything below measures the bars that are actually there instead, so a
// schedule that describes a layout the cage does not have cannot be written.

/** A stretch of constant pitch: `count` spaces of `pitch` mm. */
export interface PitchRun { count: number; pitch: number }

/**
 * Stations along a member grouped into runs of constant pitch, m in → mm out.
 *
 * `tol` is in metres and deliberately loose: a layout that divides a gap into
 * n equal parts lands on pitches a millimetre or two apart, and a schedule that
 * reads "11@218, 1@219" is a worse description of it than "12@218".
 */
export function pitchRuns(stations: number[], tol = 0.004): PitchRun[] {
  const s = [...stations].sort((a, b) => a - b)
  const out: PitchRun[] = []
  for (let k = 1; k < s.length; k++) {
    const gap = s[k] - s[k - 1]
    const last = out[out.length - 1]
    if (last && Math.abs(gap - last.pitch / 1000) <= tol) { last.count++; continue }
    out.push({ count: 1, pitch: Math.round(gap * 1000) })
  }
  return out
}

/** The runs as a bender reads them — "7@100, 12@220, 7@100". */
export const pitchNote = (runs: PitchRun[]) =>
  runs.map((r) => `${r.count}@${r.pitch}`).join(', ')

/** Where each transverse bar of a cage sits along the plane's u, m. */
export function transverseStations(cage: RebarCage, plane: ViewPlane): number[] {
  const out: number[] = []
  for (const r of cage.runs) {
    if (r.role !== 'stirrup' && r.role !== 'tie') continue
    if (!r.path.length) continue
    const us = projectPath(r.path, plane).map(([x]) => x)
    out.push(us.reduce((a, b) => a + b, 0) / us.length)
  }
  return out.sort((a, b) => a - b)
}

/**
 * The longitudinal steel of one face, split into what runs through and what is
 * curtailed, with where the curtailed bars stop.
 *
 * Pieces of one lapped bar are put back together first: `spliceCage` cuts a
 * through bar into `…a` and `…b`, and either piece measured alone is a short
 * bar that would be reported as curtailed.
 */
export interface FaceTally {
  dia: number
  thru: number
  extra: number
  /** Where the curtailed bars stop, m along u — nearest each end, deduplicated. */
  cuts: number[]
}
export function faceTally(
  cages: RebarCage[], plane: ViewPlane, role: 'top' | 'bottom', u0: number, u1: number,
): FaceTally {
  const whole = new Map<string, { dia: number; lo: number; hi: number }>()
  for (const cage of cages) {
    for (const r of cage.runs) {
      if (r.role !== role || !r.path.length) continue
      // strip a splice piece's trailing letter, so the pieces rejoin
      const key = /[a-z]$/.test(r.mark) ? r.mark.slice(0, -1) : r.mark
      const us = projectPath(r.path, plane).map(([x]) => x)
      const lo = Math.min(...us), hi = Math.max(...us)
      const at = whole.get(key)
      if (at) { at.lo = Math.min(at.lo, lo); at.hi = Math.max(at.hi, hi) }
      else whole.set(key, { dia: r.dia, lo, hi })
    }
  }
  const span = u1 - u0
  let thru = 0, extra = 0, dia = 0
  const cuts: number[] = []
  for (const b of whole.values()) {
    if (b.hi <= u0 + 1e-6 || b.lo >= u1 - 1e-6) continue    // another span's bar
    dia = Math.max(dia, b.dia)
    if (b.hi - b.lo >= span * 0.9) { thru++; continue }
    extra++
    // the end of the bar that is inside the span, which is the cut
    for (const v of [b.lo, b.hi]) {
      if (v > u0 + span * 0.02 && v < u1 - span * 0.02) cuts.push(v)
    }
  }
  const uniq = [...new Set(cuts.map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b)
  return { dia, thru, extra, cuts: uniq }
}

/**
 * How a run is inked.
 *
 * ONE accent hue for reinforcement, full stop — longitudinal steel in it,
 * transverse steel in the light tint of it. What separates the level's own
 * beams from the columns around them is line WEIGHT, not a third colour: a
 * sheet that inks context grey ends up with the palette this set spent a
 * revision getting rid of.
 */
export function runInk(run: RebarRun): string {
  const transverse = run.role === 'stirrup' || run.role === 'tie'
  return transverse ? STEEL_LIGHT : STEEL
}

/**
 * A leader whose inclined leg runs at 45°, with its label placed immediately
 * beside the thing it names.
 *
 * THE ANGLE IS NOT DECORATION. `leader` puts its knee a fixed distance from the
 * text anchor, so as soon as the label is moved in close to the member — which
 * is where a label belongs — the leg flattens: a 1.5-unit rise over a 2.9-unit
 * knee offset arrives at a horizontal bar at 27°, a glancing wedge that does
 * not read as pointing AT anything. The eye cannot tell which of the bars under
 * it is meant.
 *
 * So the caller does not choose `tx` at all. It says where the label sits
 * vertically and which way it runs, and the knee is put exactly one vertical
 * rise from the target — which makes the leg 45° whatever the label says and
 * however close it sits.
 *
 * AND THE LEG CONTINUES AWAY FROM THE LABEL. Put on the near side of the knee,
 * the target makes the leg double back underneath its own landing: the turn at
 * the knee is a near reversal, an acute wedge that reads as a line folded on
 * itself rather than as one stroke running out to a point. The target goes on
 * the FAR side, so the landing and the leg lean the same way and meet at an
 * obtuse angle — landing out, leg on out and down, arrowhead at the end of the
 * movement, which is how a leader is drafted.
 *
 * `side` names which way the LANDING runs, as it does in `leader`: 'right'
 * puts the label to the LEFT and sends the leg off to the right.
 */
export function angledLeader(o: {
  /** The point named — an actual bar, not the middle of the concrete. */
  x: number; y: number
  /** Baseline of the label, page-Y. */
  ty: number
  /** Preferred side. Flipped if the label would fall outside `within`. */
  side: 'left' | 'right'
  /** The sheet's own extent, m. A label that runs off it is worse than one on
   *  the side the caller did not ask for. */
  within?: [number, number]
  text: string
  text2?: string
  size: number
  color?: string
}): PlanPrimitive[] {
  const rise = Math.abs(o.ty - o.y)
  const knee = leaderKnee(o.size)
  const anchor = (side: 'left' | 'right') =>
    side === 'right' ? o.x - rise - knee : o.x + rise + knee
  // The label runs AWAY from the landing: 'right' lands to the right of the
  // anchor and sets the text to its left, and the other way round.
  const w = Math.max(textWidth(o.text, o.size), o.text2 ? textWidth(o.text2, o.size) : 0)
  const span = (side: 'left' | 'right'): [number, number] => {
    const tx = anchor(side)
    return side === 'right' ? [tx - w, tx] : [tx, tx + w]
  }
  const over = (side: 'left' | 'right') => {
    if (!o.within) return 0
    const [a, b] = span(side)
    return Math.max(0, o.within[0] - a) + Math.max(0, b - o.within[1])
  }
  const other = o.side === 'right' ? 'left' : 'right'
  const side = over(o.side) <= over(other) ? o.side : other

  // A LABEL WIDER THAN THE ROOM ITS 45° LEG LEAVES.
  //
  // A long schedule under a short bay can overrun on both sides, and then the
  // choice is between a label lying across the next column and a leg at some
  // other angle. The angle gives: the anchor slides back inside, and the leg
  // simply gets steeper. What does NOT give is the TURN — the knee may never
  // pass the target, because that is the fold this function exists to prevent.
  // With no room even for that, the 45° stands and the overrun is reported by
  // the sheet's own bounds rather than hidden by a folded leader.
  let tx = anchor(side)
  if (o.within && over(side) > 0) {
    const lo = side === 'right' ? o.within[0] + w : o.x + knee
    const hi = side === 'right' ? o.x - knee : o.within[1] - w
    if (lo <= hi) tx = Math.min(hi, Math.max(lo, tx))
  }
  return leader({ ...o, side, tx })
}

/**
 * The sheet.
 *
 * Order matters: concrete first so the steel sits on it, then the datum lines,
 * then the steel, then the annotation. Nothing is drawn twice — a bar that
 * belongs to two cages does not exist.
 */
// ─────────────────────────────────────────────────────────────────────────
// THE SECTIONS UNDER THE SPAN
//
// An elevation says where a bar starts and stops. It cannot say how many are
// in a layer, which face they are on, or how the stirrup wraps them — and
// those are the questions a fixer standing at the formwork actually has. So
// each span carries its own three cuts, at the two support faces and midspan,
// drawn UNDER the station they were taken from: no leader is needed, because
// the section sits where the cut is.
//
// They differ from one another, which is the point. A bar curtailed before
// midspan is absent from that cut; the hoop spacing changes between the end
// zone and the middle. A single "typical section" printed once could say
// none of that.
// ─────────────────────────────────────────────────────────────────────────

/** One cut, drawn in a box whose top-left is (x, y). Returns its width. */
function drawSection(
  P: PlanPrimitive[], sec: BeamSection, cx: number, top: number, k: number, u: number,
): number {
  const w = sec.b * k, h = sec.h * k
  const x0 = cx - w / 2
  P.push({ kind: 'rect', x: x0, y: top, w, h, fill: CONCRETE, stroke: SHEET_INK, width: 0.7 })
  // The stirrup, from the cage — so its bend radius and cover are the cage's.
  if (sec.stirrup.length > 2) {
    const pts = sec.stirrup.map(([a, up]) => ({ x: cx + a * k, y: top + (sec.h - up) * k }))
    P.push({ kind: 'path', cmds: [...pts, pts[0]].map((q, n) => ({ c: n === 0 ? 'M' as const : 'L' as const, x: q.x, y: q.y })), stroke: STEEL, width: 0.8 })
  }
  for (const b of sec.bars) {
    P.push({
      kind: 'circle', cx: cx + b.across * k, cy: top + (sec.h - b.up) * k,
      r: Math.max(u * 0.16, (b.dia / 2000) * k), fill: STEEL, stroke: STEEL, width: 0.5,
    })
  }
  const t = sectionTally(sec)
  const lines = [
    `${sec.label} — ${Math.round(sec.b * 1000)}×${Math.round(sec.h * 1000)}`,
    [t.top && `${t.top} T`, t.bot && `${t.bot} B`].filter(Boolean).join(', '),
    sec.stirrupDia && sec.spacing ? `⌀${sec.stirrupDia} @ ${sec.spacing}` : '',
  ].filter(Boolean)
  lines.forEach((ln, n) => P.push({
    kind: 'text', x: cx, y: top + h + u * (1.5 + n * 1.15), text: ln,
    size: u * 0.72, anchor: 'middle', color: n === 0 ? SHEET_INK : SHEET_NOTE, weight: n === 0 ? 700 : 500,
  }))
  return w
}

export function buildFrameElevation(
  i: FrameElevationInput, o: FrameElevationOptions = {},
): FrameElevationDrawing {
  const P: PlanPrimitive[] = []
  const notes: string[] = []
  /** World level → page. `elevationPlane`'s v is [0, −1, 0]. */
  const Y = (y: number) => -y
  const lo = Y(i.yHi), hi = Y(i.yLo)          // the band, in page order

  const uMin = Math.min(...i.members.map((m) => m.u0))
  const uMax = Math.max(...i.members.map((m) => m.u1))
  // Type is sized off the WHOLE sheet, not one bay: a three-bay elevation and a
  // one-bay one print at the same size, so the same annotation has to read at
  // the same weight on both. `beamDetail` uses L/60 for a single span, which is
  // this on a two-bay line.
  const u = Math.max(1e-6, (uMax - uMin) / 110)

  // ── concrete ───────────────────────────────────────────────────────────
  // Clipped to the band, so a column carried half a storey shows a cut end
  // rather than a floor it does not reach.
  for (const m of i.members) {
    const y0 = Math.max(Y(m.yTop), lo), y1 = Math.min(Y(m.yBot), hi)
    if (y1 <= y0 + 1e-9) continue
    P.push({
      kind: 'rect', x: m.u0, y: y0, w: m.u1 - m.u0, h: y1 - y0,
      fill: CONCRETE, stroke: SHEET_INK, width: m.role === 'beam' ? 1.1 : 0.9,
    })
  }

  // ── datum: the floor level, and the grid bubbles ───────────────────────
  P.push({
    kind: 'line', x1: uMin - u * 2.5, y1: Y(i.y), x2: uMax + u * 2.5, y2: Y(i.y),
    stroke: SHEET_GRID, width: 0.7, dash: [u * 0.5, u * 0.3],
  })
  P.push({
    kind: 'text', x: uMax + u * 2.7, y: Y(i.y) - u * 0.3,
    text: `EL ${i.y.toFixed(2)}`, size: u * 0.85, anchor: 'start', color: SHEET_NOTE,
  })
  // The bubbles go ABOVE the drawing, where the framing plans carry them and
  // where a reader looks for them: a grid reference is the first thing you find
  // on a sheet, not the last. Below, they had the span dimensions and every
  // beam's schedule stacked on top of them.
  // The span dimensions sit with the bubbles, between them and the frame: a
  // dimension between two grids belongs beside the grids it is measured to,
  // and the space UNDER the beam is now the sections'.
  const bubbleY = lo - u * 7.4, r = u * 1.05
  const dimY = lo - u * 3.2
  for (const g of i.grids) {
    P.push({
      kind: 'line', x1: g.u, y1: bubbleY + r, x2: g.u, y2: hi + u * 1.2,
      stroke: SHEET_GRID, width: 0.6, dash: [u * 0.45, u * 0.3],
    })
    P.push({ kind: 'circle', cx: g.u, cy: bubbleY, r, stroke: SHEET_INK, fill: '#fff', width: 0.8 })
    P.push({
      kind: 'text', x: g.u, y: bubbleY, text: g.label,
      size: r * 1.05, anchor: 'middle', color: SHEET_INK, weight: 700,
    })
  }

  // ── the steel, straight off the cages ──────────────────────────────────
  for (const cage of i.cages) {
    const subject = i.subject.has(cage.member)
    for (const prim of cageToPrimitives(cage, i.plane, (r) => ({
      stroke: runInk(r), width: subject ? 1.6 : 1.0,
    }))) {
      if (prim.kind !== 'path') continue
      const pts = prim.cmds.map((c) => [c.x, c.y] as [number, number])
      // A closed run — a stirrup, a tie — is a loop; close it before clipping
      // so the band cuts the loop rather than the gap in it.
      const loop = prim.closed && pts.length > 2 ? [...pts, pts[0]] : pts
      for (const piece of clipToBand(loop, lo, hi)) {
        P.push({
          ...prim, closed: false,
          cmds: piece.map(([x, y], k) => ({ c: k === 0 ? 'M' : 'L', x, y } as const)),
        })
      }
    }
  }

  // ── annotation ─────────────────────────────────────────────────────────
  // Beams get a leader to the middle of their own span; columns a mark under
  // the bubble. Every callout is one line: the size, and the steel in it.
  const beams = i.members.filter((x) => x.role === 'beam').sort((a, b) => a.u0 - b.u0)
  // One band for every span's cuts, so they line up across the sheet instead
  // of stepping with each beam's own soffit.
  const sectionTop = hi + u * 2.6
  let sectionsBottom = hi
  // The depth is dimensioned ONCE, clear of the sheet at its left edge. Drawn
  // per beam it lands on the column between them, which is where the reader is
  // trying to look at the joint.
  if (beams[0]) {
    P.push({
      kind: 'dim', x1: uMin - u * 2, y1: Y(beams[0].yTop), x2: uMin - u * 2, y2: Y(beams[0].yBot),
      text: `${beams[0].d}`, off: 0, size: u * 0.8, ext: uMin,
    })
  }
  for (const m of beams) {
    const own = i.cages.filter((c) => c.member === m.mark)
    const depth = Y(m.yBot) - Y(m.yTop)             // page height of the beam
    const top = faceTally(own, i.plane, 'top', m.u0, m.u1)
    const bot = faceTally(own, i.plane, 'bottom', m.u0, m.u1)
    P.push({
      kind: 'dim', x1: m.u0, y1: dimY, x2: m.u1, y2: dimY,
      text: `${Math.round((m.u1 - m.u0) * 1000)}`, off: 0, size: u * 0.85, ext: dimY,
    })
    // Counted off the cage, so "4-⌀20 TOP THRU" means four bars really do run
    // through on the sheet.
    const face = (t: FaceTally, what: string) => t.thru || t.extra
      ? [`${t.thru}-⌀${t.dia} ${what} THRU`, ...(t.extra ? [`+ ${t.extra} EXTRA`] : [])].join(' ')
      : ''
    // A LEADER NAMES WHAT IT POINTS AT, and nothing else.
    //
    // One callout used to point at the top steel and then recite both faces,
    // so the reader was told about a bar the arrow was nowhere near and had no
    // way to tell which of the two the arrowhead meant. Each face gets its own
    // leader to its own bars now, and the member's mark — which is about the
    // MEMBER, not about any one bar — is a plain label with no arrow at all.
    //
    // Each is bounded to its OWN bay: a label free to slide the width of the
    // drawing ends up over the next beam's column, naming a member two bays
    // away as far as the eye can tell.
    const span = m.u1 - m.u0
    // The CLEAR span, not the bay: a beam runs centreline to centreline, so
    // half a column sits inside each end of it and a label allowed the full bay
    // comes to rest on top of one.
    const bracket = (u: number) => i.members.filter((x) => x.role === 'column'
      && x.u0 <= u + 1e-6 && x.u1 >= u - 1e-6)
    const left = bracket(m.u0), right = bracket(m.u1)
    const room: [number, number] = [
      left.length ? Math.max(...left.map((c) => c.u1)) : m.u0,
      right.length ? Math.min(...right.map((c) => c.u0)) : m.u1,
    ]
    P.push({
      kind: 'text', x: (m.u0 + m.u1) / 2, y: Y(m.yTop) - u * 4.4,
      text: `${m.mark}  ${m.bw}×${m.d}`, size: u * 0.9,
      anchor: 'middle', color: SHEET_INK, weight: 700,
    })
    if (top.thru || top.extra) {
      P.push(...angledLeader({
        x: m.u0 + span * 0.3, y: Y(m.yTop) + depth * 0.12,
        ty: Y(m.yTop) - u * 1.9, side: 'right', within: room,
        text: face(top, 'TOP'), size: u * 0.85, color: SHEET_INK,
      }))
    }
    // BOTH face callouts go ABOVE the beam. The space under it belongs to the
    // sections now, and a leader crossing them would name a bar in one drawing
    // while lying across another.
    if (bot.thru || bot.extra) {
      P.push(...angledLeader({
        x: m.u0 + span * 0.7, y: Y(m.yBot) - depth * 0.12,
        ty: Y(m.yTop) - u * 1.9, side: 'left', within: room,
        text: face(bot, 'BOT.'), size: u * 0.85, color: SHEET_INK,
      }))
    }

    // The stirrup schedule, measured off the stirrups themselves.
    const stirrups = own.flatMap((c) => transverseStations(c, i.plane))
      .filter((v) => v >= m.u0 - 1e-6 && v <= m.u1 + 1e-6)
    const dia = own[0]?.runs.find((r) => r.role === 'stirrup')?.dia
    if (stirrups.length > 1 && dia) {
      // ON a stirrup, at MID-DEPTH near the middle of the span.
      //
      // At the cover line a stirrup's leg lies on top of the longitudinal bar
      // it wraps, so an arrow landing there names either of them equally — the
      // callout said STIRRUPS while pointing at what looked like the bottom
      // bar. Halfway down the web the vertical legs stand alone, and an arrow
      // on one can only be pointing at a stirrup.
      const mid = (m.u0 + m.u1) / 2
      const at = stirrups.reduce((best, v) =>
        Math.abs(v - mid) < Math.abs(best - mid) ? v : best)
      P.push(...angledLeader({
        x: at, y: (Y(m.yTop) + Y(m.yBot)) / 2,
        ty: Y(m.yTop) - u * 6.6, side: 'right', within: room,
        text: `2L-⌀${dia} STIRRUPS, ${stirrups.length} No.`,
        text2: pitchNote(pitchRuns(stirrups)),
        size: u * 0.8, color: SHEET_INK,
      }))
    }

    // ── the three cuts, under the stations they were taken at ────────────
    //
    // The support FACES, not the centrelines: half a column sits inside each
    // end of the beam and the hogging steel is checked where it really starts.
    // `room` already holds those two faces.
    if (own.length && room[1] > room[0]) {
      const cut = {
        cage: own[0], along: i.plane.u, origin: i.plane.origin,
        b: m.bw / 1000, h: m.d / 1000, soffit: m.yBot,
      }
      const secs = spanSections(cut, room[0], room[1])
      // Sized so the deepest beam on the sheet still fits the band, and never
      // so wide that two cuts on a short span touch.
      const k = Math.min((u * 9) / Math.max(m.d / 1000, 1e-6), (room[1] - room[0]) / 4 / Math.max(m.bw / 1000, 1e-6))
      for (const sc of secs) {
        const cx = Math.min(Math.max(sc.at, room[0] + (m.bw / 1000) * k), room[1] - (m.bw / 1000) * k)
        drawSection(P, sc, cx, sectionTop, k, u)
        sectionsBottom = Math.max(sectionsBottom, sectionTop + (m.d / 1000) * k + u * 4.5)
      }
    }

    // Where a curtailed bar stops — the one dimension the elevation exists to
    // give, and only drawn where there IS a curtailed bar to dimension.
    for (const t of [top, bot]) {
      for (const c of t.cuts) {
        const near = c - m.u0 <= m.u1 - c
        P.push({
          kind: 'dim',
          x1: near ? m.u0 : c, y1: lo - u * 0.9, x2: near ? c : m.u1, y2: lo - u * 0.9,
          text: `${Math.round(Math.abs(near ? c - m.u0 : m.u1 - c) * 1000)}`,
          off: 0, size: u * 0.75, ext: Y(t === top ? m.yTop : m.yBot),
        })
      }
    }
  }
  for (const m of i.members.filter((x) => x.role === 'column')) {
    // Only the column BELOW carries the mark — one label per grid position, at
    // the level everyone measures the column from.
    if (m.yBot >= i.y - 1e-6) continue
    P.push({
      kind: 'text', x: (m.u0 + m.u1) / 2, y: hi + u * 0.9,
      text: `${m.mark}  ${m.bw}×${m.d}`, size: u * 0.75, anchor: 'middle', color: SHEET_INK,
    })
  }

  // Where the first stirrup sits off the support face — the one placing
  // instruction the pitch schedule cannot give, drawn ONCE and marked TYP.
  const first = beams[0]
  if (first) {
    const own = i.cages.filter((c) => c.member === first.mark)
    const st = own.flatMap((c) => transverseStations(c, i.plane))
      .filter((v) => v >= first.u0 - 1e-6 && v <= first.u1 + 1e-6).sort((a, b) => a - b)
    // Measured from the FACE of the support, which is where §418.6.4.4 measures
    // it and where a steel fixer's tape starts. From the centreline it reads as
    // half a column plus the real figure, which is a number nobody wants.
    const col = i.members.find((m) => m.role === 'column'
      && m.u0 < first.u0 + 1e-6 && m.u1 > first.u0 - 1e-6)
    const face = col ? col.u1 : first.u0
    if (st.length && st[0] > face + 1e-6) {
      P.push({
        kind: 'dim', x1: face, y1: Y(first.yBot) + u * 1.8, x2: st[0], y2: Y(first.yBot) + u * 1.8,
        text: `${Math.round((st[0] - face) * 1000)} TYP.`, off: 0, size: u * 0.75, ext: Y(first.yBot),
      })
    }
  }

  // A step in column size is the thing this sheet exists to show, so it says so
  // where it happens rather than leaving the reader to compare two numbers.
  for (const g of i.grids) {
    const at = (pred: (m: ElevationMember) => boolean) =>
      i.members.find((m) => m.role === 'column' && Math.abs((m.u0 + m.u1) / 2 - g.u) < 1e-6 && pred(m))
    const below = at((m) => m.yTop <= i.y + 1e-6)
    const above = at((m) => m.yBot >= i.y - 1e-6)
    if (!below || !above) continue
    if (below.bw === above.bw && below.d === above.d) continue
    P.push(...angledLeader({
      x: g.u, y: Y(i.y) - u * 1.2, ty: Y(i.y) - u * 4.4, side: 'left', within: [uMin, uMax],
      text: `COLUMN REDUCES ${below.bw}×${below.d} → ${above.bw}×${above.d}`,
      size: u * 0.72, color: SHEET_INK,
    }))
    notes.push(`at grid ${g.label}, level ${i.y.toFixed(2)}: the column reduces from ${below.bw}×${below.d} to ${above.bw}×${above.d} — check the bars below can be cranked to meet the bars above within the 1-in-6 of §410.7.4.1`)
  }

  // WHAT THE CAGES THEMSELVES FLAGGED.
  //
  // A hook that does not develop, a bar the offset rule will not let anyone
  // bend — these are questions for the engineer, not instructions to a steel
  // fixer, so they travel BESIDE the sheet and are never set under it. They
  // come off `RebarCage.notes`, which means the check that raises them lives in
  // the cage and outlives any one drawing of it.
  for (const cage of i.cages) {
    for (const n of cage.notes ?? []) {
      const line = `${cage.member}: ${n}`
      if (!notes.includes(line)) notes.push(line)
    }
  }
  // …and the laps the cage had to introduce, counted off the pieces it cut.
  for (const cage of i.cages) {
    const pieces = new Map<string, number>()
    for (const r of cage.runs) {
      if (!/[a-z]$/.test(r.mark)) continue
      const k = r.mark.slice(0, -1)
      pieces.set(k, (pieces.get(k) ?? 0) + 1)
    }
    const laps = Math.max(0, ...[...pieces.values()].map((n) => n - 1))
    if (laps > 0) {
      notes.push(`${cage.member}: bars run longer than a stock length — ${laps} lap${laps > 1 ? 's' : ''} per bar, shown on the elevation`)
    }
  }

  const bandNote = notesBlock({
    lines: [seeGeneralNotes()],
    x: uMin, top: Math.max(hi + u * 9.6, sectionsBottom + u * 2.2), w: uMax - uMin, size: u * 0.8, color: SHEET_NOTE,
  })
  P.push(...bandNote.prims)

  const title = `FRAME ELEVATION — GRID ${i.line} @ EL ${i.y.toFixed(2)}`
  const tb = titleBlock({
    x: uMin, top: bandNote.bottom + u * 1.2, w: uMax - uMin, u,
    title, scale: 'NTS', detailNo: o.detailNo ?? '1', sheetRef: o.sheetRef ?? '',
  })
  P.push(...tb.prims)

  return { primitives: P, bounds: sheetBounds(P, u * 1.5), title, designNotes: notes }
}
