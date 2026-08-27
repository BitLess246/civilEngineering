// ─────────────────────────────────────────────────────────────────────────
// GENERAL STRUCTURAL NOTES — the first sheet of the set
//
// Every detail sheet used to carry the whole rulebook under it. A beam
// elevation ran to forty lines of notes, of which perhaps three were about
// that beam; the rest were the same paragraphs printed again on the next
// sheet, and the next. Two things go wrong with that. The notes swamp the
// drawing they belong to, so nobody reads either. And a rule stated thirty
// times is a rule that will be edited in twenty-nine places.
//
// So the RULES live here, once, on S-01, and each detail keeps only what is
// true of that member and nothing else — its own dimensions, and anything the
// design had to flag about it.
//
// The sheet is in three parts:
//
//   • the notes, by trade section, in the order the work is built;
//   • the SCHEDULE OF MEASURES — every length the detailer has to get right,
//     worked out for the bar sizes and materials this job actually uses, so
//     nobody derives a lap length on site;
//   • the CHECKS, as hold points: what to look at, and before which pour.
//
// Everything is computed from the design, never typed in twice: the table's
// laps come from `calcDevLength`, its bends from `hookBendDiameter`, its hoop
// tails from `stirrupHookAllowance`'s own rule. A number on this sheet that
// disagrees with a detail sheet is a bug, not a discrepancy to reconcile.
// ─────────────────────────────────────────────────────────────────────────
import type { Drawing, PlanPrimitive, PathCmd } from './planRenderer'
import { calcDevLength } from './devLength'
import { jointHookLdh } from './beamColumnJoint'
import { hookBendDiameter, stirrupBendDiameter, hook90, STOCK_BAR_LENGTH } from './rebarModel'
import { notesBlock, titleBlock, sheetBounds, wrapCols, wrapNote, type Bounds } from './detailSheet'
import { buildColumnCage, type ColumnCageInput } from './columnCage'
import { runPolylines } from './rebarWire'
import type { RebarCage, Vec3 } from './rebarModel'

const INK = '#0f172a'
const NOTE = '#475569'
const HEAD = '#1e3a8a'
const RULE = '#94a3b8'
const BAND = '#f1f5f9'

/** Where the rules live, so every sheet can point at the same place. */
export const GENERAL_NOTES_REF = 'S-01'

/** The table of standard lengths, named once so every reference matches. */
export const SCHEDULE_NAME = 'SCHEDULE OF MEASURES'

/**
 * The one line a detail sheet carries instead of the rulebook.
 *
 * It names what it defers. "Refer to S-01 for general reinforcing
 * requirements" tells a steel fixer holding a bar nothing about where to find
 * the lap length for it, so the number gets guessed or the sheet gets a
 * paragraph of its own — which is how the rules ended up printed thirty times
 * in the first place.
 */
export const seeGeneralNotes = (ref = GENERAL_NOTES_REF) =>
  `REFER TO ${ref} FOR GENERAL REINFORCING REQUIREMENTS. STANDARD BENDS, HOOKS, ℓd, ℓdh AND LAP LENGTHS PER THE ${SCHEDULE_NAME}.`

/** What a detail sheet writes instead of restating a standard length: the
 *  measure is on S-01, worked for this job's materials, once. */
export const seeSchedule = (what: string, ref = GENERAL_NOTES_REF) =>
  `${what} PER ${SCHEDULE_NAME}. SEE ${ref}.`

export interface GeneralNotesInput {
  /** Concrete strengths in the job, MPa — the lowest governs the table. */
  fc: number[]
  /** Bar yields in the job, MPa — the highest governs the table. */
  fy: number[]
  /** Longitudinal bar Ø in the job, mm. One table row each. */
  barDias: number[]
  /** Transverse bar Ø in the job, mm. */
  tieDias: number[]
  /** Clear cover, mm, by where the member is. */
  cover: { beam: number; column: number; slab: number; footing: number }
  /** Special moment frame detailing applies (§418). */
  seismic?: boolean
  /** Commercial stock length, m. Defaults to the model's own. */
  stock?: number
}

export interface GeneralNotesOptions {
  detailNo?: string
  sheetRef?: string
  scale?: string
  /** Project name for the title block. */
  project?: string
  /** Landscape sheet size the notes are laid out to fill. Default A3. */
  paper?: PaperSize
}

/** One row of the schedule of measures — every length, for one bar size. */
export interface MeasureRow {
  /** Bar Ø, mm. */
  db: number
  /** Inside bend diameter of a standard 90°/180° hook, mm (Table 425.3.1). */
  bendDia: number
  /** Straight extension past a 90° hook, mm — 12·db. */
  ext: number
  /** Overall depth of the hook, bend plus tail, mm. */
  hookDepth: number
  /** Tension development length, mm (§425.4.2). */
  ld: number
  /** Class B tension lap, mm (§425.5.2.1). */
  lapB: number
  /** Compression lap, mm (§425.5.5). */
  lapC: number
  /** Hooked development into a joint, mm (§418.8.5.1 / §425.4.3). */
  ldh: number
}

/**
 * The schedule of measures, one row per bar size the job uses.
 *
 * Worked at the LOWEST f'c and the HIGHEST fy in the job, because a schedule
 * that quotes the best case is a schedule someone will apply to the worst one.
 * Bottom-bar casting position, uncoated, normal-weight, and the code's default
 * confinement — the same assumptions the design pipeline splices to.
 */
export function measureRows(i: GeneralNotesInput): MeasureRow[] {
  const fc = Math.min(...i.fc.filter((v) => v > 0), Infinity)
  const fy = Math.max(...i.fy.filter((v) => v > 0), 0)
  if (!Number.isFinite(fc) || fy <= 0) return []
  return [...new Set(i.barDias.filter((d) => d > 0))].sort((a, b) => a - b).map((db) => {
    const dl = calcDevLength({ db, fc, fy, topBar: false, epoxy: 'none', lambda: 1, cbKtr_db: 2.5 })
    const h = hook90(db)
    return {
      db,
      bendDia: hookBendDiameter(db),
      ext: Math.round(h.ext),
      hookDepth: Math.round(h.depth),
      ld: Math.round(dl.ld),
      lapB: Math.round(dl.ls_B),
      lapC: Math.round(dl.lsc),
      ldh: Math.round(jointHookLdh(db, fy, fc)),
    }
  })
}

/** §425.3.2 — the tail beyond a 135° seismic hook on transverse steel, mm. */
export const seismicHookTail = (dt: number) => Math.max(6 * dt, 75)

/** A polyline as the renderer's path commands. */
const poly = (pts: [number, number][]): PathCmd[] =>
  pts.map(([x, y], k) => ({ c: k === 0 ? 'M' as const : 'L' as const, x, y }))

// ── the two figures ──────────────────────────────────────────────────────
//
// A rule that fits in a 30-mm square is drawn, not written. These two replaced
// the paragraphs that used to describe them: how a stirrup actually closes,
// and where a column's zones fall up a storey.
//
// Neither is drawn by hand here. Both build a REAL cage through the same
// `buildColumnCage` the 3-D model uses and project its runs flat, so the
// closure the sheet shows is the closure the model shows — the helix drift
// that lets the two ends pass, the 135° hooks bent round the corner bar, the
// 1-in-6 crank into the splice window, the tie spacing that tightens inside
// ℓo. A sketch drawn independently is a second opinion about the detail, and
// this set has had enough of those.
//
// Units in: the cage is metres. Units out: type units, scaled to the box.

const FIG = '#334155'
const FIGL = '#64748b'
const ACCENT = '#b45309'

/** A cage the way the model builds one. The default is the column the two
 *  figures are drawn from: one storey, its beam framing in at the top. */
function figureCage(o: Partial<ColumnCageInput> = {}): RebarCage {
  return buildColumnCage({
    mark: 'FIG', b: 300, h: 300, cover: 40, barDia: 25, bars: 4, tieDia: 10,
    sConfined: 100, sOutside: 200, lo: 600,
    // spliceLap is mm, spliceRise is metres — see ColumnCageInput.
    centre: [0, 0], yBottom: 0, yTop: COL_SOFFIT, spliceLap: 0,
    ...o,
  } as ColumnCageInput)
}

// The storey the column figure is drawn over, m. The beam frames in at the
// top, so the column proper stops at its SOFFIT and the band above it is the
// joint — which carries its own hoops (§418.8.3), not the column's ties.
const COL_FLOOR = 3.0            // top of the beams = the floor level
const COL_BEAM = 0.5             // beam depth
const COL_SOFFIT = COL_FLOOR - COL_BEAM

/** Project a run's polylines onto a plane and fit them to a box, in type
 *  units. `pick` chooses the two cage axes that become (x, y) on the sheet. */
function project(
  polys: Vec3[][], pick: (p: Vec3) => [number, number],
  x: number, y: number, w: number, h: number,
  /** Scale the two axes independently. A plan keeps its aspect; a column
   *  ELEVATION cannot — 0.4 m of width against 4 m of height fits the box as a
   *  line, which is what the first cut of this figure drew. Stretching it is
   *  honest here because the figure carries no dimension: it is a diagram of
   *  which zone is where, and the caption says the sizes are on the schedule. */
  fitXY = false,
): { cmds: PathCmd[][]; at: (p: Vec3) => [number, number]; kx: number; ky: number } {
  const flat = polys.flat().map(pick)
  const xs = flat.map((p) => p[0]), ys = flat.map((p) => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  const y0 = Math.min(...ys), y1 = Math.max(...ys)
  const sx = w / Math.max(x1 - x0, 1e-9), sy = h / Math.max(y1 - y0, 1e-9)
  const kx = fitXY ? sx : Math.min(sx, sy), ky = fitXY ? sy : Math.min(sx, sy)
  const ox = x + (w - (x1 - x0) * kx) / 2, oy = y + (h - (y1 - y0) * ky) / 2
  // The sheet's y runs DOWN and the cage's runs up, so the vertical flips.
  const at = (p: Vec3): [number, number] => {
    const [a, b] = pick(p)
    return [ox + (a - x0) * kx, oy + (y1 - b) * ky]
  }
  return { cmds: polys.map((pl) => poly(pl.map(at))), at, kx, ky }
}

/** How a stirrup or tie closes — the cage's own tie, seen in plan. */
function stirrupHookFigure(dt: number): NonNullable<NoteSection['figure']> {
  return {
    h: 25,
    draw: (x, y, w) => {
      const P: PlanPrimitive[] = []
      const box = 15
      const cage = figureCage({ tieDia: dt })
      const tie = cage.runs.find((r) => r.role === 'tie' && r.closed)
      if (!tie) return P
      const { cmds, at, kx } = project(runPolylines(tie), (p) => [p[0], p[2]], x + 2, y + 3, box, box)
      // The four longitudinal bars the tie grips, at their real plan positions
      // AND their real size. Drawn at an arbitrary radius the circles ran
      // through the tie instead of sitting inside its bend — the cage has the
      // tie's inner face tangent to the bar, and the figure has to be drawn to
      // the same scale to show it.
      for (const v of cage.runs.filter((r) => r.role === 'vertical')) {
        const [cx, cy] = at(v.path[0])
        P.push({ kind: 'circle', cx, cy, r: (v.dia / 2 / 1000) * kx, stroke: FIG, width: 0.9, fill: '#ffffff' })
      }
      for (const c of cmds) P.push({ kind: 'path', cmds: c, stroke: ACCENT, width: 1.15 })
      const lx = x + box + 6.5
      const cap = ['135° SEISMIC HOOKS,', `TAIL max(6·dt, 75) = ${seismicHookTail(dt)}`, 'BOTH ENDS ROUND THE SAME', 'CORNER BAR, TURNED INTO', 'THE CORE.']
      cap.forEach((t, k) => P.push({ kind: 'text', x: lx, y: y + 6.4 + k * 2.2, text: t, size: 1.2, anchor: 'start', color: FIGL, weight: 600 }))
      P.push({ kind: 'text', x, y: y + box + 7.4, text: 'TYPICAL STIRRUP / TIE CLOSURE — CORNERS ALTERNATE ALONG THE MEMBER', size: 1.15, anchor: 'start', color: FIGL, weight: 600 })
      void w
      return P
    },
  }
}

/**
 * A column storey as the cage builds it, in elevation.
 *
 * Three cages, because that is three different pieces of steel: the column's
 * own bars and ties over the storey; the bars coming UP from the storey below,
 * which lap inside this storey's centre half; and the joint's hoops, which are
 * not the column's ties at all (§418.8.3) and are why the column's stop at the
 * beam soffit.
 */
function columnFigure(): NonNullable<NoteSection['figure']> {
  return {
    h: 47,
    draw: (x, y, w) => {
      const P: PlanPrimitive[] = []
      const H = 36, bw = 12
      const S = 100                                  // confined tie spacing, mm

      const col = figureCage()                       // 0 → soffit
      // The joint band: hoops at the column's confined spacing right through
      // it (§418.8.3.1). `lo` past the band's own length makes every level
      // confined, which is what the clause asks for.
      const joint = figureCage({ yBottom: COL_SOFFIT, yTop: COL_FLOOR, lo: 2 })
      // The storey BELOW, drawn only for the bars it projects up into this
      // one: they rise past the floor and lap inside the centre half here.
      const below = figureCage({
        yBottom: -0.12, yTop: 0, spliceLap: 700, spliceRise: COL_FLOOR / 4,
      })

      const colRuns = col.runs.filter((r) => r.role === 'vertical' || r.role === 'tie')
      const jointRuns = joint.runs.filter((r) => r.role === 'tie')
      const lapRuns = below.runs.filter((r) => r.role === 'vertical')
      const all = [...colRuns, ...jointRuns, ...lapRuns]
      const polys = all.map((r) => runPolylines(r)[0])
      const { at } = project(polys, (p) => [p[0], p[1]], x + 3, y + 5, bw, H, true)

      const L = at([-0.15, 0, 0])[0], R = at([0.15, 0, 0])[0]
      const band = (y0: number, y1: number, fill: string, pad = 0) => {
        const a = at([0, y1, 0])[1], b = at([0, y0, 0])[1]
        P.push({ kind: 'rect', x: L - pad, y: a, w: R - L + pad * 2, h: b - a, fill })
      }
      // §418.7.4.3 — the lap sits in the CENTRE HALF of this storey, which is
      // the window shaded here; the bars from below finish inside it.
      band(COL_FLOOR / 4, (COL_FLOOR * 3) / 4, '#fef3c7')
      band(COL_SOFFIT, COL_FLOOR, BAND, 3.2)         // the joint

      const lapSet = new Set(lapRuns)
      all.forEach((r, k) => {
        const pts = polys[k].map(at)
        if (r.role !== 'tie') {
          // The bar coming up from below is a DIFFERENT bar from the one it
          // laps onto, and drawn in the same ink at the same width the two
          // were indistinguishable — the lap, which is the whole point of the
          // figure, showed as nothing at all.
          const lap = lapSet.has(r)
          P.push({
            kind: 'path', cmds: poly(pts),
            stroke: lap ? ACCENT : FIG, width: lap ? 1.3 : 0.9,
            ...(lap ? { dash: [1.6, 1.1] } : {}),
          })
          return
        }
        // An elevation of a horizontal loop is a line; its 135° hooks project
        // as millimetre stubs that read as a wobble at this size. The extent
        // is still the cage's own bar — the hooks are the plan figure's job.
        const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
        const my = ys.reduce((a, b) => a + b, 0) / ys.length
        P.push({ kind: 'line', x1: Math.min(...xs), y1: my, x2: Math.max(...xs), y2: my, stroke: ACCENT, width: 0.75 })
      })
      P.push({ kind: 'line', x1: L - 3.2, y1: at([0, 0, 0])[1], x2: R + 3.2, y2: at([0, 0, 0])[1], stroke: RULE, width: 1 })

      const lx = x + 3 + bw + 8
      const cap = (yy: number, t: string) => {
        const ty = at([0, yy, 0])[1]
        P.push({ kind: 'line', x1: x + 3 + bw + 3.4, y1: ty, x2: lx - 1.2, y2: ty, stroke: RULE, width: 0.5 })
        P.push({ kind: 'text', x: lx, y: ty + 0.5, text: t, size: 1.2, anchor: 'start', color: FIGL, weight: 600 })
      }
      cap((COL_SOFFIT + COL_FLOOR) / 2, `JOINT — HOOPS @ ${S} THROUGH IT (§418.8.3.1)`)
      cap(COL_SOFFIT - 0.3, `CONFINED LENGTH ℓo — TIES @ ${S}`)
      cap(COL_FLOOR / 2, 'BARS FROM BELOW LAP HERE — CENTRE HALF (§418.7.4.3)')
      cap(0.3, `CONFINED LENGTH ℓo — TIES @ ${S}`)
      P.push({ kind: 'text', x: L - 3.2, y: at([0, 0, 0])[1] + 3.6, text: 'FLOOR BELOW', size: 1.15, anchor: 'start', color: FIGL, weight: 600 })
      P.push({ kind: 'text', x, y: y + H + 10, text: 'COLUMN ZONES, ONE STOREY — SPACINGS AND BAR SIZES PER THE MEMBER’S SCHEDULE', size: 1.15, anchor: 'start', color: FIGL, weight: 600 })
      void w
      return P
    },
  }
}

/** A block of rules, optionally with a small figure under them.
 *
 *  The figure is the point: a rule that can be drawn in a 30-mm square should
 *  be drawn, not written. Four lines describing how a stirrup closes are four
 *  lines nobody reads; the same thing sketched is understood at a glance. */
export interface NoteSection {
  head: string
  lines: string[]
  /** Drawn under the section's notes, inside its column. `h` is the height it
   *  needs so the column balancer can account for it. */
  figure?: { h: number; draw: (x: number, y: number, w: number) => PlanPrimitive[] }
}

/**
 * The notes, by section, in the order the work is built.
 *
 * Each note is a REQUIREMENT — what to build, to what dimension, under which
 * clause. Not why the clause exists, and not what goes wrong if it is ignored:
 * that belongs in the calculation package, and on a drawing it only competes
 * with the rules for the reader's attention.
 *
 * The division of labour across the set is:
 *
 *   S-01 (this sheet)  the rules
 *   framing plans      where things are
 *   detail sheets      exactly what to build
 *   schedules          standard dimensions and quantities
 *   calculations       why it was designed that way
 *
 * So a note that names one member's depth belongs on that member's sheet, and
 * a length every detailer needs belongs in the SCHEDULE OF MEASURES below —
 * which is why so many of these notes end in "PER SCHEDULE" rather than in a
 * derivation.
 */
export function generalNoteSections(i: GeneralNotesInput): NoteSection[] {
  const fcList = [...new Set(i.fc.filter((v) => v > 0))].sort((a, b) => a - b)
  const fyList = [...new Set(i.fy.filter((v) => v > 0))].sort((a, b) => a - b)
  const ties = [...new Set(i.tieDias.filter((v) => v > 0))].sort((a, b) => a - b)
  const stock = i.stock ?? STOCK_BAR_LENGTH
  const c = i.cover
  const REF = `PER ${SCHEDULE_NAME}`

  return [
    {
      head: 'GENERAL',
      lines: [
        'DESIGN AND DETAILING TO NSCP 2015 (ACI 318-14).',
        ...(i.seismic ? ['SPECIAL MOMENT FRAME DETAILING PER §418 APPLIES THROUGHOUT.'] : []),
        'ALL DIMENSIONS IN MILLIMETRES, ALL LEVELS IN METRES. DO NOT SCALE — WORK TO FIGURED DIMENSIONS.',
        'THESE NOTES APPLY TO EVERY SHEET IN THE SET. WHERE A DETAIL SHEET DISAGREES WITH THIS SHEET, THE DETAIL SHEET GOVERNS FOR THAT MEMBER; REPORT THE DISCREPANCY BEFORE PROCEEDING.',
        'A FLOOR LEVEL IS THE TOP OF THE BEAMS AT IT; A BEAM SOFFIT IS ITS OWN DEPTH BELOW THAT LEVEL. SET FORMWORK FROM THE LEVEL.',
      ],
    },
    {
      head: 'MATERIALS',
      lines: [
        `CONCRETE f'c = ${fcList.join(' / ')} MPa AT 28 DAYS, NORMAL WEIGHT.`,
        `REINFORCEMENT fy = ${fyList.join(' / ')} MPa DEFORMED BARS, UNCOATED.`,
        `STOCK LENGTH ${Math.round(stock * 1000)}. SPLICE ONLY WHERE A DETAIL SHEET SHOWS A SPLICE.`,
        'BARS ARE BENT COLD. RE-BENDING AND HEATING TO ASSIST A BEND ARE PROHIBITED.',
      ],
    },
    {
      head: 'CLEAR COVER',
      lines: [
        `BEAMS AND COLUMNS — ${c.beam} / ${c.column} TO OUTSIDE OF STIRRUP OR TIE.`,
        `SLABS — ${c.slab}.`,
        `FOOTINGS AND SURFACES CAST AGAINST EARTH — ${c.footing} (§420.6.1.3.1).`,
        'COVER SHALL BE MAINTAINED WITH APPROVED SPACERS AT NOT MORE THAN 1000 CENTRES.',
      ],
    },
    {
      head: 'BENDS AND HOOKS',
      lines: [
        `STANDARD 90° AND 180° HOOKS TO TABLE 425.3.1. BEND DIAMETER AND EXTENSION ${REF}.`,
        `TIES, STIRRUPS AND HOOPS TAKE THE TRANSVERSE BEND OF §425.3.2: ${ties.map((d) => `⌀${d} TO ⌀${Math.round(stirrupBendDiameter(d))} INSIDE`).join(', ')}.`,
        `SEISMIC HOOKS TURN 135° WITH A TAIL OF max(6·dt, 75): ${ties.map((d) => `⌀${d} → ${seismicHookTail(d)}`).join(', ')}.`,
        `ℓdh IS MEASURED TO THE OUTSIDE OF THE BEND — ${REF}.`,
      ],
      figure: stirrupHookFigure(ties[0] ?? 10),
    },
    {
      head: 'DEVELOPMENT AND SPLICES',
      lines: [
        `TENSION LAPS ARE CLASS B UNLESS A DETAIL SAYS OTHERWISE. LENGTH ${REF}.`,
        'STAGGER SPLICES. NOT MORE THAN HALF THE BARS IN A FACE ARE LAPPED AT ONE SECTION.',
        'LAP ZONES: BEAM TOP STEEL IN THE MIDDLE HALF OF THE SPAN, BEAM BOTTOM STEEL IN AN END QUARTER, COLUMN VERTICALS IN THE CENTRE HALF OF THE STOREY (§418.7.4.3).',
        'HOOPS ARE CLOSED UP TO 100 C/C THROUGH THE FULL LENGTH OF EVERY LAP SPLICE.',
        'NO SPLICE WITHIN A BEAM–COLUMN JOINT, NOR WITHIN TWICE THE MEMBER DEPTH OF A SUPPORT FACE (§418.6.3.3).',
        'LAP BARS IN CONTACT AND TIE THEM.',
      ],
    },
    {
      head: 'BEAMS',
      lines: [
        'LONGITUDINAL BARS ARE CONTINUOUS UNLESS DETAILED OTHERWISE. FOUR CORNER BARS RUN THE FULL LENGTH AND ARE NEVER CRANKED.',
        'PLACE TOP AND BOTTOM BARS AS DETAILED. DO NOT CRANK A BAR UNLESS SHOWN — A CRANK MARKS THE END OF THAT BAR.',
        'TOP STEEL OVER A SUPPORT IS THE GREATER OF THE TWO ADJACENT SPANS (§409.7.7). CUT-OFF POINTS ARE DIMENSIONED ON THE ELEVATION; CUT TO THE FIGURE SHOWN.',
        'EXTRA BARS SHARE THE THROUGH BARS’ LAYER AT 25 CLEAR (§425.2.2), NOT STACKED ABOVE THEM.',
        'HOOPS ARE CLOSELY SPACED OVER 2h FROM EACH SUPPORT FACE, THE FIRST AT 50 (§418.6.4.1, §418.6.4.4). SPACINGS PER THE MEMBER’S ELEVATION.',
        'STIRRUPS ARE CLOSED SEISMIC HOOPS WITH CLOSING CORNERS ALTERNATING ALONG THE BEAM (§425.7.1.6).',
        'A STIRRUP SCHEDULE READS SPACES, IN ORDER, FROM THE LEFT SUPPORT FACE — "4@220, 15@100, 4@220". THE TOTAL IS THE EXACT NUMBER IN THAT BEAM.',
        'CAMBER EVERY BEAM AND GIRDER AT LEAST 6 PER 4.50 m OF SPAN; CANTILEVERS AT LEAST 20 PER 3.0 m OF FREE SPAN, UNLESS A PLAN SAYS OTHERWISE.',
      ],
    },
    {
      head: 'ANCHORAGE AT A BEAM END',
      lines: [
        'A BEAM BAR IS NOT DEVELOPED UNLESS THE REQUIRED DEVELOPMENT LENGTH IS PROVIDED WITHIN THE SUPPORTING MEMBER.',
        'TERMINATED BARS EXTEND TO THE FAR FACE OF THE CONFINED CORE AND ARE DEVELOPED THERE (§418.8.4.1).',
        'TOP HOOK AT THE FAR FACE, BOTTOM HOOK ONE BAR DIAMETER FURTHER IN, SO THE TAILS PASS RATHER THAN MEET.',
        'AT A ROOF JOINT THE TAIL TURNS DOWN. WHERE NEITHER VERTICAL DIRECTION IS AVAILABLE IT TURNS INTO THE TRANSVERSE BEAM.',
        'WHERE THE REQUIRED ANCHORAGE DOES NOT FIT, DO NOT MODIFY THE BAR DETAIL IN THE FIELD. REFER TO THE STRUCTURAL ENGINEER.',
      ],
    },
    {
      head: 'COLUMNS — REINFORCEMENT',
      lines: [
        'THE STRUCTURAL COLUMN STARTS AT THE TOP OF THE FOOTING. THE STUMP BELOW GROUND IS CAGED AS COLUMN.',
        'TIES ENGAGE EVERY OTHER BAR AND NO BAR IS MORE THAN 150 CLEAR FROM ONE SO ENGAGED (§425.7.2.3). INNER, CROSS AND DIAMOND TIES ARE PART OF THE DESIGN.',
        'SUCCESSIVE TIES HAVE THEIR HOOKS AT DIFFERENT CORNERS (§418.7.5.3). SCHEDULED SPACING IS CENTRE OF SET TO CENTRE OF SET.',
        'WHERE A COLUMN STOPS, ITS BARS TURN IN UNDER THE BEAM TOP STEEL AND RUN 12·db ACROSS (§425.4.2).',
      ],
    },
    {
      head: 'COLUMNS — LAPS AND SPLICES',
      lines: [
        'VERTICALS ARE LAPPED WITHIN THE CENTRE HALF OF THE STOREY (§418.7.4.3, §425.5.5).',
        'THE PROJECTING BAR IS CRANKED ONE DIAMETER INBOARD ON A SLOPE NOT STEEPER THAN 1 IN 6 (§410.7.4.1). WHERE THE OFFSET IS TOO LARGE TO BEND, USE SEPARATE DOWELS LAPPED WITH THE BARS BELOW (§410.7.4.5).',
        'THE PROJECTION ABOVE A FLOOR IS A DESIGN LENGTH. IT MAY NOT BE CUT BACK TO SUIT FORMWORK OR HANDLING; REPORT A SHORT PROJECTION.',
      ],
      figure: columnFigure(),
    },
    {
      head: 'BEAM–COLUMN JOINTS',
      lines: [
        'THE JOINT IS CONFINED BY ITS OWN HOOPS THROUGH THE FULL DEPTH OF THE SHALLOWEST BEAM FRAMING INTO IT (§418.8.3). COLUMN TIES STOP AT THE JOINT AND THE JOINT HOOPS TAKE OVER.',
        'A BEAM BAR PASSING THROUGH A JOINT NEEDS A COLUMN DEPTH OF 20·db PARALLEL TO IT (§418.8.2.3).',
      ],
    },
    {
      head: 'FOOTINGS AND SLABS',
      lines: [
        'FOUNDING LEVEL IS MEASURED FROM NATURAL GROUND TO THE UNDERSIDE OF THE PAD. IT IS NOT THE COLUMN’S UNBRACED LENGTH.',
        'PROVE THE BEARING SURFACE BEFORE ANY STEEL IS PLACED. IF THE FOUNDING MATERIAL DIFFERS FROM THAT ASSUMED, STOP AND REPORT IT.',
        'COLUMN DOWELS LAP WITH THE COLUMN BARS ABOVE; TAILS TURN OUTWARD ONTO THE MAT, CORNER DOWELS DIAGONALLY OUTWARD. DEVELOPMENT INTO THE PAD BEGINS AT THE TOP OF THE FOOTING.',
        `SLAB OPENINGS ARE TRIMMED: ADD BARS EQUAL IN NUMBER AND SIZE TO THOSE INTERRUPTED, HALF EACH SIDE, TOP AND BOTTOM (§408.5.4.2), EACH DEVELOPED ℓd ${REF} PAST THE FACE.`,
        'NO OPENING IS FORMED THAT IS NOT ON THE DRAWINGS.',
        'A DIAGONAL BAR IS PLACED AT EVERY RE-ENTRANT CORNER, EACH FACE, FOR CRACK CONTROL (§424.3).',
      ],
    },
  ]
}

/**
 * The inspection hold points, by pour.
 *
 * A checklist, not a restatement of the rules above: each line is one thing to
 * LOOK AT, short enough to be ticked standing in the formwork. Anything that
 * needs a paragraph to explain is a rule, and rules are in the notes.
 */
export function constructionChecks(): NoteSection[] {
  return [
    {
      head: 'BEFORE THE FOOTING POUR',
      lines: [
        'FOUNDING LEVEL AND BEARING MATERIAL AS ASSUMED',
        'PAD SIZE AND THICKNESS TO SCHEDULE',
        'MAT BAR SIZE AND SPACING, BOTH WAYS',
        'COVER TO EARTH ON SPACERS',
        'DOWEL NUMBER, POSITION AND PROJECTION RECORDED',
      ],
    },
    {
      head: 'BEFORE THE COLUMN POUR',
      lines: [
        'BAR SIZE AND QUANTITY TO SCHEDULE',
        'LAP LENGTH AND LAP POSITION TO THE DETAIL',
        'TIE SPACING — CONFINED ZONE AND OUTSIDE IT, CHECKED SEPARATELY',
        'INNER, CROSS AND DIAMOND TIES PRESENT WHERE SCHEDULED',
        'HOOKS 135° WITH FULL TAIL, CORNERS ALTERNATING',
        'CRANK SLOPE NOT STEEPER THAN 1 IN 6; TIES WITHIN 150 OF THE BEND',
        'COVER ON SPACERS',
        'PROJECTION ABOVE THE FLOOR MEASURED AND RECORDED',
      ],
    },
    {
      head: 'BEFORE THE BEAM AND SLAB POUR',
      lines: [
        'SOFFIT LEVEL SET FROM THE FLOOR LEVEL LESS THE BEAM DEPTH',
        'TOP STEEL IS IN THE TOP, AND CHAIRED TO STAY THERE',
        'END ANCHORAGE REACHES THE FAR FACE OF THE COLUMN CORE',
        'TOP AND BOTTOM HOOKS OFFSET, NOT IN LINE',
        'HOOP SPACING IN THE 2h ZONE; FIRST HOOP AT 50 FROM THE FACE',
        'HOOP COUNT AGAINST THE TOTAL ON THE ELEVATION',
        'CLOSED-UP 100 C/C BAND PRESENT AT EVERY LAP',
        'CURTAILMENT POINTS AND CRANKS TO THE ELEVATION',
        'SPLICES STAGGERED AND IN THE ZONES SHOWN',
        'TRIMMER BARS AT OPENINGS, DEVELOPED BOTH SIDES',
        'JOINT HOOPS IN PLACE BEFORE THE BEAM CAGE CLOSES',
      ],
    },
    {
      head: 'AT EVERY POUR',
      lines: [
        'COVER RE-CHECKED AFTER THE CAGE IS FINAL',
        'COVER RE-CHECKED AFTER ANY SERVICE IS THREADED THROUGH',
        'NO BAR TOUCHING FORMWORK; NO TIE WIRE IN THE COVER ZONE',
        'CUBES TAKEN AND IDENTIFIED TO THE POUR',
        'CONSTRUCTION JOINTS ONLY WHERE SHOWN, ROUGHENED AND CLEAN',
      ],
    },
  ]
}

// ── the sheet ────────────────────────────────────────────────────────────

/** Column layout of the schedule of measures — label, width, and how to read
 *  the row. Widths are in type units so the table scales with the sheet. */
const COLS: { head: string; sub: string; w: number; get: (r: MeasureRow) => string }[] = [
  { head: 'BAR', sub: '⌀', w: 5, get: (r) => `⌀${r.db}` },
  { head: 'BEND', sub: 'INSIDE ⌀', w: 7, get: (r) => `${Math.round(r.bendDia)}` },
  { head: 'ℓext', sub: '12db', w: 6, get: (r) => `${r.ext}` },
  { head: 'HOOK', sub: 'OVERALL', w: 7, get: (r) => `${r.hookDepth}` },
  { head: 'ℓd', sub: 'TENSION', w: 7, get: (r) => `${r.ld}` },
  { head: 'LAP', sub: 'CLASS B', w: 7, get: (r) => `${r.lapB}` },
  { head: 'LAP', sub: 'COMPR.', w: 7, get: (r) => `${r.lapC}` },
  { head: 'ℓdh', sub: 'IN JOINT', w: 7, get: (r) => `${r.ldh}` },
]

/**
 * Landscape sheet sizes, mm. The sheet is drawn in type units and its BOUNDS
 * are padded to one of these aspect ratios, so it prints to the chosen size
 * without the renderer having to letterbox it.
 */
export const PAPER = {
  A4: { w: 297, h: 210 },
  A3: { w: 420, h: 297 },
  A2: { w: 594, h: 420 },
  A1: { w: 841, h: 594 },
} as const
export type PaperSize = keyof typeof PAPER

/** Lines a section will occupy once wrapped, plus its heading and figure. */
function sectionCost(sec: NoteSection, cols: number, step: number): number {
  const text = sec.lines.reduce((t, l, n) => t + wrapNote(`${n + 1}.  ${l}`, cols).length, 0)
  return (text + 3) * step + (sec.figure?.h ?? 0)
}

/**
 * Split a run of sections into `n` columns of about equal DEPTH.
 *
 * Counting sections, or even counting notes, gets this wrong: a section of
 * five long paragraphs is three times the depth of one with eight short lines,
 * and a section carrying a figure is taller again. So the cost is the height
 * each section will actually occupy at the column width it is going into.
 */
function splitColumns(secs: NoteSection[], n: number, colW: number, size: number, step: number): NoteSection[][] {
  if (n <= 1 || secs.length <= 1) return [secs]
  const cols = wrapCols(colW, size)
  const cost = secs.map((sec) => sectionCost(sec, cols, step))

  // Minimise the DEEPEST column, which is what actually sets the sheet's
  // height — a greedy sweep at a running average does not, and leaves the
  // lumpy sections (the two carrying figures) to unbalance whichever column
  // they land in. Binary-search the answer instead: for a candidate depth,
  // fill columns greedily and see whether everything fits in n of them. The
  // smallest depth that fits is optimal, and it is monotone, so bisection
  // finds it exactly.
  const fits = (cap: number): NoteSection[][] | null => {
    const out: NoteSection[][] = []
    let cur: NoteSection[] = []
    let run = 0
    for (let k = 0; k < secs.length; k++) {
      if (cur.length > 0 && run + cost[k] > cap) {
        out.push(cur); cur = []; run = 0
        if (out.length === n) return null
      }
      cur.push(secs[k]); run += cost[k]
    }
    out.push(cur)
    // Spread any spare columns over the deepest groups so a short sheet does
    // not leave a column empty next to a double-length one.
    while (out.length < n) {
      let worst = 0
      for (let k = 1; k < out.length; k++) {
        const d = (g: NoteSection[]) => g.reduce((t, sec) => t + sectionCost(sec, cols, step), 0)
        if (out[k].length > 1 && d(out[k]) > d(out[worst])) worst = k
      }
      if (out[worst].length < 2) break
      const g = out[worst]
      const half = Math.ceil(g.length / 2)
      out.splice(worst, 1, g.slice(0, half), g.slice(half))
    }
    return out
  }

  let lo = Math.max(...cost), hi = cost.reduce((a, b) => a + b, 0)
  let best = fits(hi)!
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const got = fits(mid)
    if (got) { best = got; hi = mid - 1 } else { lo = mid + 1 }
  }
  return best
}

/** The deepest column, for a given run of sections at a given width. */
function columnsHeight(secs: NoteSection[], n: number, colW: number, size: number, step: number): number {
  return Math.max(...splitColumns(secs, n, colW, size, step)
    .map((g) => g.reduce((t, sec) => t + sectionCost(sec, wrapCols(colW, size), step), 0)))
}

/**
 * The sheet width, in type units, at which the drawing exactly fills the paper.
 *
 * The sheet is drawn in type units and the renderer scales it, so its width is
 * free — what is FIXED is the type size, and therefore how many characters fit
 * on a line of a given column. Widen the sheet and every column takes more
 * words per line, so the notes wrap shorter and the sheet gets less tall. The
 * width that fills an A3 is where that shrinking height meets the paper's own
 * proportion, W = aspect · height(W), which the iteration below converges on
 * from either side in a handful of steps.
 *
 * Padding a too-tall sheet sideways instead — which is what `fitPaper` alone
 * does — buys the aspect ratio at the price of a fifth of the paper in margin.
 */
function fillWidth(
  aspect: number, n: number, height: (W: number, n: number) => number,
  seed = 190, iters = 24,
): number {
  let W = seed
  for (let k = 0; k < iters; k++) {
    const next = aspect * height(W, n)
    if (Math.abs(next - W) < 0.05) return next
    W = W + (next - W) * 0.6          // damped, so a step never overshoots wildly
  }
  return W
}

/** Characters that fit on one line of a column — the readability measure that
 *  decides how many columns a sheet gets. Below ~34 a note reads as a ladder;
 *  much past ~72 the eye loses the line coming back. */
const COL_CHARS = { min: 34, ideal: 56, max: 74 }

/**
 * The general notes sheet.
 *
 * Laid out in two columns of notes with the schedule of measures between them,
 * so the sheet reads top to bottom without a column of text a metre long.
 */
export function buildGeneralNotes(i: GeneralNotesInput, opts: GeneralNotesOptions = {}): Drawing & { title: string } {
  const P: PlanPrimitive[] = []
  const u = 1                                   // type unit; the sheet is in them
  let nCols = 3
  const paper = PAPER[opts.paper ?? 'A3']
  const aspect = paper.w / paper.h
  const gut = u * 5
  const size = u * 1.45
  const step = u * 2.05
  const headSize = u * 1.9

  const secs = generalNoteSections(i)
  const checks = constructionChecks()
  const rows = measureRows(i)
  const topPad = u * 6.4
  const tableH = rows.length ? step * (1.3 + 1.7 * 1.25 + rows.length * 1.25) + step * 2.7 : 0
  const tbH = u * 5.2

  /** Everything on the sheet, stacked, for a trial width and column count. */
  const sheetHeight = (Wt: number, n: number): number => {
    const cw = (Wt - gut * (n - 1)) / n
    return topPad
      + columnsHeight(secs, n, cw, size, step) + step * 1.6
      + tableH
      + step * 1.5 + columnsHeight(checks, Math.min(n, checks.length), cw, size, step)
      + step * 0.6 + tbH
  }

  // Landscape: solve for the width that fills the paper at each plausible
  // column count, then take the one whose columns read best.
  const W = ((): number => {
    let best = 0, bestScore = Infinity
    for (const n of [2, 3, 4, 5]) {
      const w = fillWidth(aspect, n, sheetHeight)
      const chars = wrapCols((w - gut * (n - 1)) / n, size)
      if (chars < COL_CHARS.min || chars > COL_CHARS.max) continue
      const score = Math.abs(chars - COL_CHARS.ideal)
      if (score < bestScore) { bestScore = score; best = w; nCols = n }
    }
    return best || fillWidth(aspect, 3, sheetHeight)
  })()

  /** Lay a run of sections down one column and report where it ended. */
  const column = (x: number, top: number, colW: number, secs: NoteSection[]) => {
    let y = top
    secs.forEach((s, k) => {
      if (k > 0) y += step * 0.9
      P.push({ kind: 'text', x, y, text: s.head, size: headSize, anchor: 'start', color: HEAD, weight: 700 })
      P.push({ kind: 'line', x1: x, y1: y + u * 0.55, x2: x + colW, y2: y + u * 0.55, stroke: RULE, width: 0.6 })
      y += step * 1.15
      // Numbered, because a note anyone has to quote back needs a handle.
      const nb = notesBlock({
        x, w: colW, top: y, size, step,
        lines: s.lines.map((t, n) => `${n + 1}.  ${t}`),
        color: NOTE,
      })
      P.push(...nb.prims)
      y = nb.bottom + step * 0.9
      if (s.figure) { P.push(...s.figure.draw(x, y, colW)); y += s.figure.h }
      y += step * 1.2
    })
    return y
  }

  /** Run a set of sections across `n` balanced columns; report the deepest. */
  const columns = (top: number, n: number, secs: NoteSection[]) => {
    const colW = (W - gut * (n - 1)) / n
    return Math.max(...splitColumns(secs, n, colW, size, step)
      .map((g, k) => column(k * (colW + gut), top, colW, g)))
  }

  const title = 'GENERAL STRUCTURAL NOTES'
  P.push({ kind: 'text', x: 0, y: 0, text: title, size: u * 3.4, anchor: 'start', color: INK, weight: 700 })
  if (opts.project) {
    P.push({ kind: 'text', x: W, y: 0, text: opts.project.toUpperCase(), size: u * 1.7, anchor: 'end', color: NOTE, weight: 600 })
  }
  P.push({ kind: 'line', x1: 0, y1: u * 1.5, x2: W, y2: u * 1.5, stroke: INK, width: 1.2 })
  // A drawing CONVENTION, not a rule — so it sits under the title with the
  // sheet's own identity, not as a numbered note competing with the code.
  P.push({
    kind: 'text', x: 0, y: u * 3.7, size: size * 1.02, anchor: 'start', color: NOTE, weight: 600,
    text: 'EVERY BEAM IS DRAWN ON ITS OWN FRAME ELEVATION — ONE SHEET PER GRID LINE PER FLOOR. THERE IS NO TYPICAL BEAM SHEET.',
  })

  const top = topPad
  const notesEnd = columns(top, nCols, secs)

  // ── the schedule of measures ──────────────────────────────────────────
  let y = notesEnd + step * 1.6
  if (rows.length) {
    P.push({ kind: 'text', x: 0, y, text: SCHEDULE_NAME, size: headSize, anchor: 'start', color: HEAD, weight: 700 })
    const fcMin = Math.min(...i.fc.filter((v) => v > 0))
    const fyMax = Math.max(...i.fy.filter((v) => v > 0))
    P.push({
      kind: 'text', x: W, y, anchor: 'end', size: size * 0.95, color: NOTE, weight: 600,
      text: `ALL IN mm · f'c ${fcMin} MPa · fy ${fyMax} MPa · BOTTOM BARS, UNCOATED, NORMAL WEIGHT`,
    })
    y += step * 1.3

    const unit = COLS.reduce((t, c) => t + c.w, 0)
    const scale = W / unit
    const xs: number[] = []
    let cx = 0
    for (const c of COLS) { xs.push(cx); cx += c.w * scale }
    const rowH = step * 1.25
    const headH = rowH * 1.7
    const tableTop = y

    // header band, then a line per bar size
    P.push({ kind: 'rect', x: 0, y: tableTop, w: W, h: headH, fill: BAND, stroke: RULE, width: 0.6 })
    COLS.forEach((c, k) => {
      const mid = xs[k] + (c.w * scale) / 2
      P.push({ kind: 'text', x: mid, y: tableTop + rowH * 0.62, text: c.head, size: size, anchor: 'middle', color: INK, weight: 700 })
      P.push({ kind: 'text', x: mid, y: tableTop + rowH * 1.28, text: c.sub, size: size * 0.86, anchor: 'middle', color: NOTE, weight: 600 })
    })
    rows.forEach((r, n) => {
      const ry = tableTop + headH + n * rowH
      if (n % 2 === 1) P.push({ kind: 'rect', x: 0, y: ry, w: W, h: rowH, fill: BAND })
      COLS.forEach((c, k) => {
        const mid = xs[k] + (c.w * scale) / 2
        P.push({
          kind: 'text', x: mid, y: ry + rowH * 0.68, text: c.get(r), size,
          anchor: 'middle', color: k === 0 ? INK : NOTE, weight: k === 0 ? 700 : 500,
        })
      })
    })
    const tableBottom = tableTop + headH + rows.length * rowH
    // rules: the frame, one under the header, and one between every column
    P.push({ kind: 'rect', x: 0, y: tableTop, w: W, h: tableBottom - tableTop, stroke: RULE, width: 0.8 })
    P.push({ kind: 'line', x1: 0, y1: tableTop + headH, x2: W, y2: tableTop + headH, stroke: RULE, width: 0.8 })
    for (let k = 1; k < COLS.length; k++) {
      P.push({ kind: 'line', x1: xs[k], y1: tableTop, x2: xs[k], y2: tableBottom, stroke: RULE, width: 0.5 })
    }
    y = tableBottom + step * 0.9
    P.push({
      kind: 'text', x: 0, y, size: size * 0.95, anchor: 'start', color: NOTE, weight: 500,
      text: 'ℓdh IS MEASURED TO THE OUTSIDE OF THE BEND. LAPS ARE FOR BOTTOM BARS; A TOP BAR WITH MORE THAN 300 OF FRESH CONCRETE BELOW IT TAKES ψt = 1.3 ON ℓd AND ON THE CLASS B LAP.',
    })
    y += step * 1.8
  }

  // ── the checks ────────────────────────────────────────────────────────
  P.push({ kind: 'text', x: 0, y, text: 'REINFORCEMENT INSPECTION — HOLD POINTS', size: headSize, anchor: 'start', color: HEAD, weight: 700 })
  P.push({
    kind: 'text', x: W, y, anchor: 'end', size: size * 0.95, color: NOTE, weight: 600,
    text: 'EACH IS A HOLD POINT: THE POUR DOES NOT PROCEED UNTIL IT IS SIGNED OFF',
  })
  y += step * 1.5
  y = columns(y, Math.min(nCols, checks.length), checks) + step * 0.6

  const tb = titleBlock({
    x: 0, w: W, top: y, u,
    title, detailNo: opts.detailNo ?? '1',
    sheetRef: opts.sheetRef ?? GENERAL_NOTES_REF,
    scale: opts.scale ?? 'NTS',
  })
  P.push(...tb.prims)

  const b = sheetBounds(P, u * 3, { minX: 0, minY: -u * 2, maxX: W, maxY: tb.bottom })
  return { primitives: P, title, bounds: fitPaper(b, paper) }
}

/**
 * Grow a bounds box to a paper's aspect ratio, centring what is already there.
 *
 * Only ever grows: the drawing is never cropped to make it fit, so a sheet
 * with more on it than the paper's proportion wants gets margin on the short
 * axis rather than losing a column off the edge.
 */
export function fitPaper(b: Bounds, paper: { w: number; h: number }): Bounds {
  const w = b.maxX - b.minX, h = b.maxY - b.minY
  if (!(w > 0) || !(h > 0)) return b
  const want = paper.w / paper.h
  if (w / h < want) {                                   // too tall — widen it
    const grow = (h * want - w) / 2
    return { ...b, minX: b.minX - grow, maxX: b.maxX + grow }
  }
  const grow = (w / want - h) / 2                       // too wide — heighten it
  return { ...b, minY: b.minY - grow, maxY: b.maxY + grow }
}
