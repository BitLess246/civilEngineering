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
import { titleBlock, notesBlock, sheetBounds, leader } from './detailSheet'
import { seeGeneralNotes } from './generalNotes'
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
 * The sheet.
 *
 * Order matters: concrete first so the steel sits on it, then the datum lines,
 * then the steel, then the annotation. Nothing is drawn twice — a bar that
 * belongs to two cages does not exist.
 */
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
  const bubbleY = hi + u * 8.6, r = u * 1.05
  for (const g of i.grids) {
    P.push({
      kind: 'line', x1: g.u, y1: lo - u * 1.2, x2: g.u, y2: bubbleY - r,
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
  const dimY = hi + u * 6.4
  const beams = i.members.filter((x) => x.role === 'beam').sort((a, b) => a.u0 - b.u0)
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
    const mid = (m.u0 + m.u1) / 2
    const own = i.cages.filter((c) => c.member === m.mark)
    const top = faceTally(own, i.plane, 'top', m.u0, m.u1)
    const bot = faceTally(own, i.plane, 'bottom', m.u0, m.u1)
    P.push({
      kind: 'dim', x1: m.u0, y1: dimY, x2: m.u1, y2: dimY,
      text: `${Math.round((m.u1 - m.u0) * 1000)}`, off: 0, size: u * 0.85, ext: Y(m.yBot),
    })
    // ABOVE the beam: what it is, and what is in it. Counted off the cage, so
    // "4-⌀20 TOP THRU" means four bars really do run through on the sheet.
    const face = (t: FaceTally, what: string) => t.thru || t.extra
      ? [`${t.thru}-⌀${t.dia} ${what} THRU`, ...(t.extra ? [`+ ${t.extra} EXTRA`] : [])].join(' ')
      : ''
    P.push(...leader({
      x: mid, y: Y(m.yTop) + (Y(m.yBot) - Y(m.yTop)) * 0.3,
      tx: mid, ty: lo - u * 2.2, side: 'right',
      text: `${m.mark}  ${m.bw}×${m.d}`,
      text2: [face(top, 'TOP'), face(bot, 'BOT.')].filter(Boolean).join(' · '),
      size: u * 0.85, color: SHEET_INK,
    }))

    // BELOW the beam: the stirrup schedule, measured off the stirrups.
    const stirrups = own.flatMap((c) => transverseStations(c, i.plane))
      .filter((v) => v >= m.u0 - 1e-6 && v <= m.u1 + 1e-6)
    const dia = own[0]?.runs.find((r) => r.role === 'stirrup')?.dia
    if (stirrups.length > 1 && dia) {
      P.push(...leader({
        x: stirrups[Math.floor(stirrups.length / 2)], y: Y(m.yBot) - u * 0.3,
        tx: mid, ty: hi + u * 3.4, side: 'right',
        text: `2L-⌀${dia} STIRRUPS, ${stirrups.length} No.`,
        text2: pitchNote(pitchRuns(stirrups)),
        size: u * 0.8, color: SHEET_INK,
      }))
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
    P.push(...leader({
      x: g.u, y: Y(i.y) - u * 1.2, tx: g.u + u * 3, ty: Y(i.y) - u * 4, side: 'right',
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
    x: uMin, top: hi + u * 11, w: uMax - uMin, size: u * 0.8, color: SHEET_NOTE,
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
