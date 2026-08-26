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
import type { Drawing, PlanPrimitive } from './planRenderer'
import { calcDevLength } from './devLength'
import { jointHookLdh } from './beamColumnJoint'
import { hookBendDiameter, stirrupBendDiameter, STOCK_BAR_LENGTH } from './rebarModel'
import { hook90 } from './beamDetail'
import { notesBlock, titleBlock, sheetBounds, wrapCols, wrapNote } from './detailSheet'

const INK = '#0f172a'
const NOTE = '#475569'
const HEAD = '#1e3a8a'
const RULE = '#94a3b8'
const BAND = '#f1f5f9'

/** Where the rules live, so every sheet can point at the same place. */
export const GENERAL_NOTES_REF = 'S-01'

/** The one line a detail sheet carries instead of the rulebook. */
export const seeGeneralNotes = (ref = GENERAL_NOTES_REF) =>
  `REFER TO ${ref} FOR GENERAL REINFORCING REQUIREMENTS.`

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

/**
 * The notes, by section, in the order the work is built.
 *
 * Written as RULES, not as this-member facts: anything that quotes one beam's
 * depth belongs on that beam's sheet. Where a number is common to the whole job
 * — a cover, a stock length — it is stated, because a rule nobody can apply
 * without looking something else up is not much of a rule.
 */
export function generalNoteSections(i: GeneralNotesInput): { head: string; lines: string[] }[] {
  const fcList = [...new Set(i.fc.filter((v) => v > 0))].sort((a, b) => a - b)
  const fyList = [...new Set(i.fy.filter((v) => v > 0))].sort((a, b) => a - b)
  const ties = [...new Set(i.tieDias.filter((v) => v > 0))].sort((a, b) => a - b)
  const stock = i.stock ?? STOCK_BAR_LENGTH
  const c = i.cover

  return [
    {
      head: 'GENERAL',
      lines: [
        'DESIGN AND DETAILING TO NSCP 2015 (ACI 318-14). WHERE THIS SHEET AND A DETAIL SHEET DISAGREE, THE DETAIL SHEET GOVERNS FOR THAT MEMBER AND THE DISCREPANCY IS TO BE REPORTED BEFORE THE WORK PROCEEDS.',
        'ALL DIMENSIONS IN MILLIMETRES AND ALL LEVELS IN METRES UNLESS NOTED. DO NOT SCALE THE DRAWINGS — WORK TO FIGURED DIMENSIONS.',
        'THESE NOTES APPLY TO EVERY DETAIL SHEET IN THE SET. THE DETAIL SHEETS CARRY ONLY WHAT IS PARTICULAR TO THE MEMBER THEY DRAW.',
        ...(i.seismic ? ['SPECIAL MOMENT FRAME (§418) DETAILING APPLIES THROUGHOUT. THE SEISMIC RULES BELOW ARE NOT OPTIONAL AND MAY NOT BE RELAXED TO SUIT SITE ACCESS.'] : []),
      ],
    },
    {
      head: 'MATERIALS',
      lines: [
        `CONCRETE f'c = ${fcList.join(' / ')} MPa AT 28 DAYS, NORMAL WEIGHT.`,
        `REINFORCEMENT fy = ${fyList.join(' / ')} MPa DEFORMED BARS, UNCOATED.`,
        `COMMERCIAL STOCK LENGTH ${Math.round(stock * 1000)} — ANY BAR LONGER THAN THIS IS SPLICED, AND EVERY SPLICE IS SHOWN ON THE DETAIL SHEET. A BAR IS NEVER LAPPED WHERE THE DRAWING DOES NOT SHOW A LAP.`,
        'BARS ARE BENT COLD. RE-BENDING A BAR ALREADY BENT, AND HEATING TO ASSIST A BEND, ARE BOTH PROHIBITED.',
      ],
    },
    {
      head: 'CLEAR COVER',
      lines: [
        `BEAMS AND COLUMNS ${c.beam} / ${c.column} TO THE OUTSIDE OF THE STIRRUP OR TIE — NOT TO THE MAIN BAR.`,
        `SLABS ${c.slab}. FOOTINGS AND ANY SURFACE CAST AGAINST EARTH ${c.footing} (§420.6.1.3.1).`,
        'COVER IS A MINIMUM, NOT A TARGET. IT IS HELD WITH PROPRIETARY SPACERS AT NOT MORE THAN 1000 CENTRES; TIMBER, STONE AND BAR OFF-CUTS ARE NOT SPACERS.',
      ],
    },
    {
      head: 'BENDS AND HOOKS',
      lines: [
        'STANDARD 90° AND 180° HOOKS TO TABLE 425.3.1 — SEE THE SCHEDULE OF MEASURES FOR THE INSIDE BEND DIAMETER AND EXTENSION OF EVERY BAR SIZE USED.',
        `TIES, STIRRUPS AND HOOPS TAKE THE SMALLER TRANSVERSE BEND OF §425.3.2: ${ties.map((d) => `⌀${d} BENDS TO ⌀${Math.round(stirrupBendDiameter(d))} INSIDE`).join(', ')}.`,
        `SEISMIC HOOKS TURN 135° WITH A TAIL OF max(6·dt, 75): ${ties.map((d) => `⌀${d} → ${seismicHookTail(d)}`).join(', ')}.`,
        'ℓdh IS MEASURED TO THE OUTSIDE OF THE BEND, NOT TO THE END OF THE TAIL. LENGTHENING A TAIL DOES NOT DEVELOP A BAR THAT DOES NOT FIT.',
        'A TIE OR STIRRUP IS ONE BAR BENT, NOT A WELDED RING. ITS TWO ENDS PASS EACH OTHER AT THE CLOSING CORNER AND ARE BENT ROUND THE CORNER LONGITUDINAL BAR — THE HOOK GRIPS THAT BAR, IT DOES NOT PASS BEHIND IT.',
      ],
    },
    {
      head: 'DEVELOPMENT AND SPLICES',
      lines: [
        'TENSION LAPS ARE CLASS B UNLESS A DETAIL SAYS OTHERWISE. SEE THE SCHEDULE OF MEASURES FOR THE LENGTH.',
        'SPLICES ARE STAGGERED. NOT MORE THAN HALF THE BARS IN A FACE ARE LAPPED AT ONE SECTION, AND EACH LAP SITS WHERE THAT BAR IS LEAST STRESSED — BOTTOM STEEL NEAR THE SUPPORTS, TOP STEEL NEAR MIDSPAN.',
        'NO SPLICE IS PERMITTED WITHIN A BEAM–COLUMN JOINT, NOR WITHIN TWICE THE MEMBER DEPTH OF THE FACE OF A SUPPORT (§418.6.3.3).',
        'BARS ARE LAPPED IN CONTACT AND TIED. A GAP-LAPPED PAIR IS NOT THE SPLICE THAT WAS DESIGNED.',
      ],
    },
    {
      head: 'BEAMS',
      lines: [
        'FOUR CORNER BARS RUN THE FULL LENGTH — TWO TOP, TWO BOTTOM, ONE IN EACH CORNER OF THE CAGE. THEY ARE WHAT THE STIRRUPS ARE TIED TO AND ARE NEVER CRANKED. ONLY A LAP MAY INTERRUPT THEM.',
        'TOP STEEL OVER A SUPPORT IS THE GREATER OF THE TWO ADJACENT SPANS (§409.7.7).',
        'A THIRD OF THE NEGATIVE STEEL RUNS PAST THE INFLECTION POINT (§409.7.3.8.4) AND A QUARTER OF THE POSITIVE STEEL INTO THE SUPPORT (§409.7.3.8.1). A BAR EXTENDS max(d, 12·db) BEYOND THE POINT IT IS NO LONGER REQUIRED.',
        'CURTAILED BARS ARE CRANKED WHERE THEY STOP. THE KINK MARKS THE END OF THAT BAR — IT IS NOT A BAR CONTINUING BEHIND THE NEXT ONE, AND IT IS NOT SHEAR REINFORCEMENT: §422.5.10.5 AND §409.7.6.2.3 ARE NOT CLAIMED FOR IT.',
        'EXTRA BARS SHARE THE THROUGH BARS’ LAYER — SIDE BY SIDE ACROSS THE WEB AT 25 CLEAR (§425.2.2), NOT STACKED ABOVE THEM.',
        'STIRRUPS ARE CLOSED WITH SEISMIC HOOKS AND THEIR CLOSING CORNERS ALTERNATE ALONG THE BEAM (§425.7.1.6) — EVERY HOOK IN ONE CORNER LEAVES THE OTHER THREE CORNER BARS RESTRAINED BY THE BEND ALONE.',
        'HOOPS ARE CLOSELY SPACED OVER 2h FROM EACH SUPPORT FACE, THE FIRST AT 50 FROM THE FACE (§418.6.4.1 / §418.6.4.4). SPACINGS ARE ON THE MEMBER’S OWN SHEET.',
      ],
    },
    {
      head: 'ANCHORAGE AT A BEAM END',
      lines: [
        'A BAR TERMINATED IN A COLUMN EXTENDS TO THE FAR FACE OF THE CONFINED CORE AND IS DEVELOPED THERE (§418.8.4.1) — IT DOES NOT STOP AT THE NEAR FACE.',
        'THE TOP HOOK STANDS AT THE FAR FACE AND THE BOTTOM HOOK ONE BAR DIAMETER FURTHER IN, SO THE TWO TAILS PASS RATHER THAN MEET. THE TWO EMBEDMENTS ARE DELIBERATELY UNEQUAL.',
        'A TAIL TURNED UP OUT OF THE TOP OF A JOINT NEEDS A COLUMN ABOVE IT TO SIT IN. AT A ROOF JOINT THERE IS NONE AND THE BAR TURNS DOWN INSTEAD. WHERE NEITHER VERTICAL DIRECTION IS AVAILABLE THE HOOK TURNS INTO THE TRANSVERSE BEAM — SHOWN ON THE ELEVATION AS A BAR STOPPING AT ITS BEND.',
        'NO HOOK MAY END IN COVER OR IN AIR. IF THE BAR AS DRAWN CANNOT BE PLACED, STOP AND REPORT IT.',
      ],
    },
    {
      head: 'COLUMNS',
      lines: [
        'THE STRUCTURAL COLUMN STARTS AT THE TOP OF THE FOOTING, NOT AT GROUND LEVEL. THE STUMP BETWEEN THEM CARRIES THE SAME FORCES PLUS EARTH PRESSURE AND ITS OWN WEIGHT, AND IS CAGED AS COLUMN.',
        'VERTICALS ARE LAPPED ABOVE THE FLOOR, CLEAR OF THE HINGE ZONE (§425.5.5). THE PROJECTING BAR IS CRANKED ONE DIAMETER INBOARD ON A SLOPE NOT STEEPER THAN 1 IN 6 (§410.7.4.1); WHERE THE OFFSET IS TOO LARGE TO BEND, SEPARATE DOWELS ARE LAPPED WITH THE BARS BELOW (§410.7.4.5).',
        'TIES ENGAGE EVERY OTHER BAR AND NO BAR IS MORE THAN 150 CLEAR FROM ONE SO ENGAGED (§425.7.2.3). INNER, CROSS AND DIAMOND TIES ARE PART OF THE DESIGN, NOT AN OPTION.',
        'SUCCESSIVE TIES HAVE THEIR HOOKS AT DIFFERENT CORNERS (§418.7.5.3). THE TIES OF ONE SET REST ON ONE ANOTHER; THE SPACING ON THE SCHEDULE IS MEASURED CENTRE OF SET TO CENTRE OF SET.',
        'WHERE A COLUMN STOPS, ITS BARS ARE TURNED IN UNDER THE TOP STEEL OF THE BEAM AND RUN 12·db ACROSS (§425.4.2). A COLUMN BAR IS NEVER LEFT ENDING PLAIN AT THE TOP OF THE POUR.',
      ],
    },
    {
      head: 'BEAM–COLUMN JOINTS',
      lines: [
        'THE JOINT IS CONFINED BY ITS OWN HOOPS THROUGH THE FULL DEPTH OF THE SHALLOWEST BEAM FRAMING INTO IT (§418.8.3). COLUMN TIES STOP AT THE JOINT AND THE JOINT HOOPS TAKE OVER — THE BAND IS NOT LEFT EMPTY.',
        'A BEAM BAR PASSING THROUGH A JOINT NEEDS A COLUMN DEPTH OF 20·db PARALLEL TO IT (§418.8.2.3).',
      ],
    },
    {
      head: 'FOOTINGS AND SLABS',
      lines: [
        'FOUNDING LEVEL IS MEASURED FROM NATURAL GROUND TO THE UNDERSIDE OF THE PAD. IT IS A GEOTECHNICAL DIMENSION AND IS NOT THE COLUMN’S UNBRACED LENGTH.',
        'THE BEARING SURFACE IS PROVED BEFORE ANY STEEL IS PLACED. IF THE FOUNDING MATERIAL DIFFERS FROM THAT ASSUMED, STOP AND REPORT IT.',
        'COLUMN DOWELS ARE LAPPED WITH THE COLUMN BARS ABOVE AND THEIR TAILS TURN OUTWARD ONTO THE MAT; CORNER DOWELS TURN DIAGONALLY OUTWARD. DEVELOPMENT OF A COLUMN BAR INTO THE PAD BEGINS AT THE TOP OF THE FOOTING.',
        'SLAB OPENINGS ARE TRIMMED: ADD BARS EQUAL IN NUMBER AND SIZE TO THOSE INTERRUPTED, HALF EACH SIDE, TOP AND BOTTOM (§408.5.4.2), EACH DEVELOPED ℓd PAST THE FACE OF THE OPENING. NO OPENING IS FORMED THAT IS NOT ON THE DRAWINGS.',
        'A DIAGONAL BAR IS PLACED AT EVERY RE-ENTRANT CORNER, EACH FACE, FOR CRACK CONTROL (§424.3).',
      ],
    },
  ]
}

/**
 * The construction checks, as hold points.
 *
 * Written as things to LOOK AT and when — not as a restatement of the rules
 * above. A check nobody can perform standing in the formwork is decoration.
 */
export function constructionChecks(): { head: string; lines: string[] }[] {
  return [
    {
      head: 'BEFORE THE FOOTING POUR',
      lines: [
        'FOUNDING LEVEL AND BEARING MATERIAL AGREE WITH THE DESIGN ASSUMPTION.',
        'PAD SIZE, THICKNESS AND MAT BAR SIZE / SPACING AGREE WITH THE SCHEDULE, BOTH WAYS.',
        'COVER TO EARTH HELD BY SPACERS. DOWELS TIED IN POSITION, CORRECT NUMBER, PROJECTION MEASURED AND RECORDED.',
      ],
    },
    {
      head: 'BEFORE THE COLUMN POUR',
      lines: [
        'BAR COUNT AND SIZE AGAINST THE SCHEDULE. LAP LENGTH AND LAP POSITION AGAINST THE DETAIL — NOT AGAINST THE LAST COLUMN POURED.',
        'TIE SPACING SEPARATELY IN THE CONFINED ZONE AND OUTSIDE IT. INNER, CROSS AND DIAMOND TIES PRESENT WHERE SCHEDULED.',
        'HOOKS 135° WITH THE FULL TAIL, TURNED INTO THE CORE, AND ALTERNATING CORNERS UP THE COLUMN.',
        'CRANK SLOPE NOT STEEPER THAN 1 IN 6, AND TIES PROVIDED WITHIN 150 OF THE BEND.',
      ],
    },
    {
      head: 'BEFORE THE BEAM AND SLAB POUR',
      lines: [
        'TOP STEEL IS TOP STEEL: CHECK IT HAS NOT BEEN LAID IN THE BOTTOM AND CHECK THE CHAIRS HOLD IT THERE UNDER FOOT TRAFFIC.',
        'END ANCHORAGE — EVERY TERMINATED BAR REACHES THE FAR FACE OF THE COLUMN CORE AND ITS HOOK TURNS THE WAY THE DETAIL SHOWS. TOP AND BOTTOM HOOKS ARE NOT IN THE SAME LINE.',
        'HOOP SPACING IN THE 2h ZONE AT EACH END, AND THE FIRST HOOP AT 50 FROM THE FACE.',
        'CURTAILMENT POINTS AND CRANKS AGAINST THE ELEVATION. SPLICES STAGGERED AND IN THE ZONES SHOWN.',
        'OPENINGS, SLEEVES AND CAST-IN ITEMS ARE ON THE DRAWINGS. TRIMMER BARS PLACED AND DEVELOPED BOTH SIDES.',
        'JOINT HOOPS IN PLACE THROUGH THE FULL BEAM DEPTH BEFORE THE BEAM CAGE CLOSES OVER THEM.',
      ],
    },
    {
      head: 'AT EVERY POUR',
      lines: [
        'COVER RE-CHECKED AFTER THE CAGE IS FINAL AND AFTER ANY SERVICE IS THREADED THROUGH IT.',
        'NO BAR TOUCHING FORMWORK. NO TIE WIRE ENDS TURNED OUT INTO THE COVER ZONE.',
        'CUBES TAKEN AND IDENTIFIED TO THE POUR. CONSTRUCTION JOINTS ONLY WHERE SHOWN, ROUGHENED AND CLEANED BEFORE THE NEXT LIFT.',
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
 * Where to break a run of sections into two columns of about equal DEPTH.
 *
 * Counting sections, or even counting notes, gets this wrong: a section of
 * five long paragraphs is three times the depth of one with eight short lines.
 * So the cost is the number of lines each section will actually WRAP to at the
 * column width it is going into — the same wrap `notesBlock` performs.
 */
function balance(secs: { head: string; lines: string[] }[], colW: number, size: number): number {
  const cols = wrapCols(colW, size)
  const cost = (s: { lines: string[] }) =>
    s.lines.reduce((t, l, n) => t + wrapNote(`${n + 1}.  ${l}`, cols).length, 0) + 3
  const total = secs.reduce((t, s) => t + cost(s), 0)
  let run = 0
  for (let k = 0; k < secs.length; k++) {
    const c = cost(secs[k])
    // Break BEFORE the section that would carry this column past half, unless
    // stopping short leaves even less balanced a pair.
    if (run + c / 2 >= total / 2) return Math.max(1, k)
    run += c
  }
  return secs.length
}

/**
 * The general notes sheet.
 *
 * Laid out in two columns of notes with the schedule of measures between them,
 * so the sheet reads top to bottom without a column of text a metre long.
 */
export function buildGeneralNotes(i: GeneralNotesInput, opts: GeneralNotesOptions = {}): Drawing & { title: string } {
  const P: PlanPrimitive[] = []
  const u = 1                                   // type unit; the sheet is in them
  const W = 132                                 // sheet width, type units
  const colW = (W - u * 6) / 2
  const size = u * 1.45
  const step = u * 2.05
  const headSize = u * 1.9

  /** Lay a run of sections down one column and report where it ended. */
  const column = (x: number, top: number, secs: { head: string; lines: string[] }[]) => {
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
      y = nb.bottom + step * 1.4
    })
    return y
  }

  const title = 'GENERAL STRUCTURAL NOTES'
  P.push({ kind: 'text', x: 0, y: 0, text: title, size: u * 3.4, anchor: 'start', color: INK, weight: 700 })
  if (opts.project) {
    P.push({ kind: 'text', x: W, y: 0, text: opts.project.toUpperCase(), size: u * 1.7, anchor: 'end', color: NOTE, weight: 600 })
  }
  P.push({ kind: 'line', x1: 0, y1: u * 1.5, x2: W, y2: u * 1.5, stroke: INK, width: 1.2 })

  const secs = generalNoteSections(i)
  const top = u * 4.6
  const split = balance(secs, colW, size)
  const leftEnd = column(0, top, secs.slice(0, split))
  const rightEnd = column(colW + u * 6, top, secs.slice(split))

  // ── the schedule of measures ──────────────────────────────────────────
  const rows = measureRows(i)
  let y = Math.max(leftEnd, rightEnd) + step * 1.6
  if (rows.length) {
    P.push({ kind: 'text', x: 0, y, text: 'SCHEDULE OF MEASURES', size: headSize, anchor: 'start', color: HEAD, weight: 700 })
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
  const checks = constructionChecks()
  P.push({ kind: 'text', x: 0, y, text: 'CONSTRUCTION CHECKS — HOLD POINTS', size: headSize, anchor: 'start', color: HEAD, weight: 700 })
  P.push({
    kind: 'text', x: W, y, anchor: 'end', size: size * 0.95, color: NOTE, weight: 600,
    text: 'EACH IS A HOLD POINT: THE POUR DOES NOT PROCEED UNTIL IT IS SIGNED OFF',
  })
  y += step * 1.5
  const half = balance(checks, colW, size)
  const cl = column(0, y, checks.slice(0, half))
  const cr = column(colW + u * 6, y, checks.slice(half))
  y = Math.max(cl, cr) + step * 0.6

  const tb = titleBlock({
    x: 0, w: W, top: y, u,
    title, detailNo: opts.detailNo ?? '1',
    sheetRef: opts.sheetRef ?? GENERAL_NOTES_REF,
    scale: opts.scale ?? 'NTS',
  })
  P.push(...tb.prims)

  return {
    primitives: P,
    title,
    bounds: sheetBounds(P, u * 3, { minX: 0, minY: -u * 2, maxX: W, maxY: tb.bottom }),
  }
}
