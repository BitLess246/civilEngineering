// ─────────────────────────────────────────────────────────────────────────
// THE COLUMN DETAIL — one sheet PER COLUMN, footing to top
//
// What this replaces was a TYPICAL detail: one storey of one column type,
// floating between a stub of column above and nothing below, with every figure
// on it — the tie positions, the lap, the confinement zones — computed by the
// sheet from b, h and a spacing. Deduplicated by section and tie schedule, so a
// twelve-storey building printed three sheets and none of them was any column
// you could point at on site.
//
// A column is not a storey. It starts on a footing and ends at a roof, its
// section can step, its bars crank where it does, its splices sit in the centre
// half of each storey and its confinement tightens at every floor. All of that
// is ABOUT THE WHOLE STACK, and a one-storey typical detail is the one drawing
// that cannot show it.
//
// So: one sheet per column line, the full stack, and EVERY BAR ON IT IS THE
// CAGE'S — the same `RebarCage` objects the 3D scene paints, the bar schedule
// counts and the take-off weighs, exactly as `frameElevation` does for beams.
// The sheet measures the steel rather than describing it: the tie schedule is
// read off the drawn ties (`pitchRuns`), so a schedule the cage does not have
// cannot be written.
//
// Units: geometry m, sections mm. The plane's +Y is DOWN the page, so a world
// level y draws at −y.
// ─────────────────────────────────────────────────────────────────────────
import type { Drawing, PlanPrimitive } from './planRenderer'
import {
  projectPath, type RebarCage, type RebarRun, type ViewPlane,
} from './rebarModel'
import { runPolylines } from './rebarWire'
import { clipToBand, pitchNote, pitchRuns } from './frameElevation'
import { leader, notesBlock, sheetBounds, titleBlock } from './detailSheet'
import { seeGeneralNotes } from './generalNotes'
import {
  SHEET_GRID, SHEET_INK, SHEET_NOTE, SHEET_ZONE, STEEL, STEEL_LIGHT,
} from './sheetInk'

const CONCRETE = '#e2e8f0'

/** One column member of the stack, as the sheet needs it. */
export interface ColumnStackSegment {
  /** Member id — also the cage's `member`. */
  mark: string
  /** World levels, m. */
  yBot: number
  yTop: number
  /** The face IN VIEW and the face across it, mm. */
  face: number
  depth: number
  /** Longitudinal steel, for the callout. */
  bars: number
  barDia: number
  tieDia: number
  /** Confinement zone ℓo at each end, mm — §418.7.5.1. Zero where none. */
  loZone?: number
}

export interface ColumnStackDetailInput {
  /** Sheet mark — 'C-A1'. */
  mark: string
  /** Grid reference the column stands on, for the title. */
  grid: string
  /** The column's own coordinate on the plane, m — the stack is drawn about it. */
  u: number
  /** The plane the cages project onto. Its origin must have y = 0. */
  plane: ViewPlane
  /** Bottom to top. */
  segments: ColumnStackSegment[]
  /** Levels to tag with an elevation line, m. */
  levels: { y: number; label: string }[]
  /** The pad under the stack — plan side and thickness m, and its top level. */
  footing?: { B: number; Dc: number; yTop: number }
  /** Every cage the sheet draws: the column members' and the footing's. */
  cages: RebarCage[]
  /**
   * A stretch of the stack to call out, world levels m.
   *
   * The schedule uses it to say WHICH STOREY the row it is expanding is about:
   * a column sheet runs footing to roof and carries a different arrangement at
   * every level, so on its own it says nothing about which one is being
   * discussed. Absent on the drawing-set sheets, which are about the whole
   * column.
   */
  highlight?: { yBot: number; yTop: number; label?: string }
}

export interface ColumnStackDetailOptions {
  detailNo?: string
  sheetRef?: string
  project?: string
}

export interface ColumnStackDetailDrawing extends Drawing {
  title: string
  /** What the detailing could not do — for the panel beside the sheet. */
  designNotes: string[]
}

/** Style for a run, by what it is. */
function inkFor(r: RebarRun): { stroke: string; width: number } {
  if (r.role === 'tie' || r.role === 'hoop') return { stroke: STEEL_LIGHT, width: 0.9 }
  if (r.role === 'mat') return { stroke: STEEL_LIGHT, width: 0.9 }
  return { stroke: STEEL, width: 1.3 }
}

/**
 * The tie levels over a stretch of the stack, as SETS, m.
 *
 * A hoop and the cross ties threaded through it rest on one another, so the
 * cage stacks them a diameter apart. Read level by level the spacing alternates
 * between the stack step and the real pitch — a true description of the bars
 * and a useless one of the spacing — so they are clustered back into the sets
 * they were placed as before anything measures them.
 *
 * Every cage on the sheet is read, not one: the band where a storey's ties stop
 * for the joint is filled by the JOINT HOOPS OF THE COLUMN ABOVE (§418.8.3.1),
 * which live in that column's cage. Measured from one member alone the schedule
 * reported a 445 mm gap in a column detailed at 320 — a gap that is not there
 * on the sheet, because the sheet draws both.
 */
export function tieSetLevels(cages: RebarCage[], lo = -Infinity, hi = Infinity): number[] {
  const zs = cages
    .flatMap((c) => c.runs)
    .filter((r) => r.role === 'tie' || r.role === 'hoop')
    .map((r) => ({ y: r.path[0]?.[1] ?? 0, d: r.dia }))
    .filter((z) => z.y >= lo - 1e-9 && z.y <= hi + 1e-9)
    .sort((a, b) => a.y - b.y)
  const out: number[] = []
  let group: { y: number; d: number }[] = []
  for (const z of zs) {
    const gap = group.length ? z.y - group[group.length - 1]!.y : 0
    if (group.length && gap > (4 * z.d) / 1000) {
      out.push(group.reduce((a, b) => a + b.y, 0) / group.length)
      group = []
    }
    group.push(z)
  }
  if (group.length) out.push(group.reduce((a, b) => a + b.y, 0) / group.length)
  return out
}

/** Build the per-column detail. */
export function buildColumnStackDetail(
  i: ColumnStackDetailInput, o: ColumnStackDetailOptions = {},
): ColumnStackDetailDrawing {
  const P: PlanPrimitive[] = []
  const notes: string[] = []
  /** World level → page. */
  const Y = (y: number) => -y

  const segs = [...i.segments].sort((a, b) => a.yBot - b.yBot)
  const yLo = i.footing ? i.footing.yTop - i.footing.Dc : (segs[0]?.yBot ?? 0)
  const pedestal = i.footing && segs.length ? segs[0]!.yBot - i.footing.yTop : 0
  const yHi = segs.length ? segs[segs.length - 1]!.yTop : yLo + 3
  const H = Math.max(0.5, yHi - yLo)
  const widest = Math.max(0.2, ...segs.map((s) => s.face / 1000), i.footing?.B ?? 0)
  // Type is sized off the SHEET, not off the column: a squat two-storey stack
  // and a tall twelve-storey one print at the same size, so the same annotation
  // has to read at the same weight on both.
  const u = Math.max(1e-6, H / 46)
  const band: [number, number] = [Y(yHi) - u * 0.5, Y(yLo) + u * 0.5]

  // ── concrete: the pad, then each storey ────────────────────────────────
  if (i.footing) {
    const f = i.footing
    P.push({
      kind: 'rect', x: i.u - f.B / 2, y: Y(f.yTop), w: f.B, h: f.Dc,
      fill: CONCRETE, stroke: SHEET_INK, width: 1.2,
    })
  }
  segs.forEach((s, k) => {
    // THE PEDESTAL. A column standing on a footing does not start at its base
    // node: `cageBuilder` carries the cage down to the top of the pad, so the
    // lowest storey's concrete has to reach there too. Drawn from the node
    // instead, the sheet showed the dowels and the bottom of the column bars
    // hanging in mid-air below the concrete they are cast in.
    const bot = k === 0 && i.footing ? Math.min(s.yBot, i.footing.yTop) : s.yBot
    P.push({
      kind: 'rect', x: i.u - s.face / 2000, y: Y(s.yTop), w: s.face / 1000, h: s.yTop - bot,
      fill: CONCRETE, stroke: SHEET_INK, width: 1.1,
    })
  })

  // ── confinement zones, shaded ──────────────────────────────────────────
  // §418.7.5.1 — ℓo at EACH end of the clear height, which on a stack means at
  // both ends of every storey, not once on a typical sheet.
  for (const s of segs) {
    const lo = Math.min((s.loZone ?? 0) / 1000, (s.yTop - s.yBot) / 2)
    if (lo <= 0) continue
    for (const [a, b] of [[s.yBot, s.yBot + lo], [s.yTop - lo, s.yTop]] as const) {
      P.push({
        kind: 'rect', x: i.u - s.face / 2000, y: Y(b), w: s.face / 1000, h: b - a,
        fill: 'rgba(15,118,110,0.08)', stroke: SHEET_ZONE, width: 0.6, dash: [u * 0.5, u * 0.4],
      })
    }
  }

  const left = i.u - widest / 2
  const right = i.u + widest / 2

  // ── the storey this sheet is about, if it is about one ─────────────────
  // Between the concrete and the steel: a wash the bars read THROUGH, so it
  // says which storey is being discussed without hiding what is in it.
  if (i.highlight) {
    const a = Math.min(i.highlight.yBot, i.highlight.yTop)
    const b = Math.max(i.highlight.yBot, i.highlight.yTop)
    if (b > a) {
      P.push({
        kind: 'rect', x: left - u * 0.9, y: Y(b), w: (right - left) + u * 1.8, h: b - a,
        fill: 'rgba(29,78,216,0.09)', stroke: STEEL, width: 0.7, dash: [u * 0.5, u * 0.35],
      })
      if (i.highlight.label) {
        P.push({
          kind: 'text', x: right + u * 1.2, y: Y(b) + u * 1.2,
          text: i.highlight.label, size: u * 0.8, anchor: 'start', color: STEEL, weight: 700,
        })
      }
    }
  }

  // ── the steel, straight off the cages ──────────────────────────────────
  for (const cage of i.cages) {
    for (const r of cage.runs) {
      const pts = projectPath(runPolylines(r)[0] ?? [], i.plane)
      if (pts.length < 2) continue
      const style = inkFor(r)
      for (const piece of clipToBand(pts, band[0], band[1])) {
        if (piece.length < 2) continue
        P.push({
          kind: 'path', stroke: style.stroke, width: style.width, fill: 'none',
          cap: 'round', join: 'round',
          cmds: piece.map(([x, y], k) => ({ c: k === 0 ? 'M' : 'L', x, y } as const)),
        })
      }
    }
  }

  // ── ELEVATION LINES ────────────────────────────────────────────────────
  // The thing a typical detail structurally cannot carry: where each floor is,
  // by level, on the column that reaches it.
  for (const lv of i.levels) {
    if (lv.y < yLo - 1e-6 || lv.y > yHi + 1e-6) continue
    P.push({
      kind: 'line', x1: left - u * 1.2, y1: Y(lv.y), x2: right + u * 5.2, y2: Y(lv.y),
      stroke: SHEET_GRID, width: 0.6, dash: [u * 0.6, u * 0.35],
    })
    P.push({
      kind: 'text', x: right + u * 5.4, y: Y(lv.y) - u * 0.35,
      text: `${lv.label}  EL ${lv.y.toFixed(2)}`, size: u * 0.78, anchor: 'start', color: SHEET_NOTE, weight: 600,
    })
  }
  if (i.footing) {
    P.push({
      kind: 'text', x: right + u * 5.4, y: Y(i.footing.yTop) - u * 0.35,
      text: `T.O.F.  EL ${i.footing.yTop.toFixed(2)}`, size: u * 0.78, anchor: 'start', color: SHEET_ZONE, weight: 600,
    })
  }

  // ── dimensions: each storey, and the whole stack ───────────────────────
  const dimX = left - u * 2.6
  for (const s of segs) {
    P.push({
      kind: 'dim', x1: dimX, y1: Y(s.yTop), x2: dimX, y2: Y(s.yBot),
      text: `${Math.round((s.yTop - s.yBot) * 1000)}`, off: 0, size: u * 0.8, ext: left,
    })
    const lo = Math.min((s.loZone ?? 0) / 1000, (s.yTop - s.yBot) / 2)
    if (lo > 0) {
      P.push({
        kind: 'dim', x1: left - u * 1.1, y1: Y(s.yBot + lo), x2: left - u * 1.1, y2: Y(s.yBot),
        text: `ℓo ${Math.round(lo * 1000)}`, off: 0, size: u * 0.7, ext: left,
      })
    }
  }
  if (pedestal > 1e-6) {
    P.push({
      kind: 'dim', x1: dimX, y1: Y(segs[0]!.yBot), x2: dimX, y2: Y(i.footing!.yTop),
      text: `${Math.round(pedestal * 1000)} PED.`, off: 0, size: u * 0.8, ext: left,
    })
  }
  P.push({
    kind: 'dim', x1: dimX - u * 3.4, y1: Y(yHi), x2: dimX - u * 3.4, y2: Y(yLo),
    text: `${Math.round(H * 1000)} OVERALL`, off: 0, size: u * 0.8, ext: left,
  })

  // ── callouts, one per storey, measured off the drawn steel ─────────────
  for (const s of segs) {
    const cage = i.cages.find((c) => c.member === s.mark)
    const mid = (s.yBot + s.yTop) / 2
    // Measured over THIS STOREY, across every cage the sheet draws.
    const sched = pitchNote(pitchRuns(tieSetLevels(i.cages, s.yBot, s.yTop), 0.012))
    P.push(...leader({
      x: i.u + s.face / 2000, y: Y(mid),
      tx: right + u * 1.4, ty: Y(mid) - u * 0.6,
      text: `${s.mark}  ${Math.round(s.face)}×${Math.round(s.depth)}  ${s.bars}-⌀${s.barDia}`,
      text2: sched ? `TIES ⌀${s.tieDia} — ${sched}` : `TIES ⌀${s.tieDia}`,
      size: u * 0.74, color: STEEL, weight: 700, side: 'left',
    }))
    if (!cage) notes.push(`${s.mark}: no cage was placed, so this storey is drawn as concrete only`)
  }

  // ── a section step is a detail in itself ───────────────────────────────
  for (let k = 1; k < segs.length; k++) {
    const below = segs[k - 1]!, above = segs[k]!
    if (Math.abs(below.face - above.face) < 1e-6) continue
    notes.push(`${above.mark} steps from ${Math.round(below.face)} to ${Math.round(above.face)} at EL ${above.yBot.toFixed(2)} — the bars below crank to meet it (§410.7.4)`)
  }

  // ── notes and the title block ──────────────────────────────────────────
  const sheetL = dimX - u * 5.2
  const sheetR = right + u * 16
  const nb = notesBlock({
    x: sheetL, w: sheetR - sheetL, top: Y(yLo) + u * 3.2, size: u * 0.72,
    lines: [
      `COLUMN ${i.mark} ON GRID ${i.grid} — DRAWN FROM THE PLACED CAGE; EVERY BAR SHOWN IS SCHEDULED AND WEIGHED.`,
      'TIE SPACINGS ARE MEASURED OFF THE BARS DRAWN, SET TO SET.',
      'LAP SPLICES LIE IN THE CENTRE HALF OF EACH STOREY (§418.7.4.3); ALTERNATE BARS LAP A LAP HIGHER (§25.5.2).',
      seeGeneralNotes(),
    ],
  })
  P.push(...nb.prims)
  const title = `COLUMN DETAIL — ${i.mark}`
  const tb = titleBlock({
    x: sheetL, w: sheetR - sheetL, top: nb.bottom + u * 2.4, u: u * 0.9,
    title, detailNo: o.detailNo, sheetRef: o.sheetRef ?? 'S-06',
  })
  P.push(...tb.prims)

  return {
    title,
    designNotes: notes,
    primitives: P,
    bounds: sheetBounds(P, u * 1.2),
  }
}
