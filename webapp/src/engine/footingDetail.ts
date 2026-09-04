// ─────────────────────────────────────────────────────────────────────────
// Column-footing detail sheet — a bar-mat PLAN + a reinforced SECTION for one
// isolated square footing, built from its designed geometry. Emits the same
// typed PlanPrimitive[] the plan renderer uses, so planToSvg paints it.
//
// The reinforcement is drawn as real bars with their end HOOKS/BENDS shown in
// full (ACI 318-14 §25.3 standard hooks, §25.4 development, §13.3 footing bar
// placement): the bottom mat hooks up at every end, the column dowels bend out
// onto the mat, and the column carries a variable-spaced stirrup set.
//
//   • PLAN — footing outline, chained sub-dimensions, the bottom mat both ways
//     with end hooks, the column footprint + vertical bars.
//   • SECTION — column with stirrups + vertical bars/dowels hooked onto the
//     mat, footing on a gravel base, natural-grade line with soil hatch, and a
//     chained depth dimension.
//
// Units: geometry m; bar/column sizes mm.
// ─────────────────────────────────────────────────────────────────────────
import type { PlanPrimitive, PathCmd, Drawing } from './planRenderer'
import { columnSectionPrimitives } from './columnSection'
import { SHEET_INK, SHEET_ZONE, STEEL } from './sheetInk'
import { titleBlock, leader } from './detailSheet'
import { projectPath, type RebarCage, type RebarRun, type ViewPlane } from './rebarModel'
import { runPolylines } from './rebarWire'
import { cutCage, cutPrimitives, type CageCut } from './cageSection'
import { clipToBand, pitchNote, pitchRuns } from './frameElevation'

type Pt = [number, number]
/** Intersection of the infinite lines p1→p2 and p3→p4 (null if parallel). */
function lineX(p1: Pt, p2: Pt, p3: Pt, p4: Pt): Pt | null {
  const d = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0])
  if (Math.abs(d) < 1e-9) return null
  const t = ((p1[0] - p3[0]) * (p3[1] - p4[1]) - (p1[1] - p3[1]) * (p3[0] - p4[0])) / d
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])]
}

export interface FootingDetailInput {
  /** Footing mark (WF-1…). */
  mark: string
  /** Plan side B, m. */
  B: number
  /** Total footing depth (thickness) H, m. */
  H: number
  /** Clear cover, mm. */
  cover: number
  /** Bottom-mat bar diameter, mm, and count each way. */
  barDia: number
  bars: number
  /** Bar spacing, mm. */
  barSpacing: number
  /** Column width (x) and depth (y), mm. */
  colB: number
  colH?: number
  /** Column vertical bars — count and diameter (default 8 × mat bar). */
  colBars?: number
  colBarDia?: number
  /** Column clear cover, mm (default 40) — for the column cross-section. */
  colCover?: number
  /** Column LATERAL TIE diameter, mm (default 10). */
  tieDia?: number
  /** Lateral-tie set from the footing up: [count, spacing mm] groups, then rest @ … */
  tieSchedule?: [number, number][]
  tieRest?: number
  /** Mat-bar end detail — '90' hook or 'none' (straight). Design-driven; only
   *  hook footings whose design calls for it. Default 'none'. */
  endHook?: '90' | 'none'
  /** Gravel/lean base thickness, m (default 0.1). */
  gravel?: number
  /** Column projection above natural grade, m (default 0.3). */
  aboveGrade?: number
  /** Top-of-footing elevation, m (−down); its magnitude is the embedment. */
  foundingElev?: number
  /**
   * The PLACED cages, in model space — draw the steel from these instead of
   * from the numbers above.
   *
   * Everything else in this interface describes the steel a second time: a bar
   * count and a spacing for the mat, a bar count and a tie schedule for the
   * column, and the sheet then laid both out with rules of its own. That is
   * three descriptions of one cage — the third, after `columnSection`'s and
   * `ColumnSchematic`'s — and the sheet's column cross-section really did
   * disagree with the cage, drawing a plain tie around a bar layout the cage
   * does not have.
   *
   * Supplied, the mat, the dowels, the column verticals and the column ties
   * are all read off the cages: the plan's column is a CUT just above the pad
   * (so its tie set is the one placed there, cross ties and all) and the
   * section is both cages projected onto it. Omitted, the numeric drawing
   * stands — the standalone foundation calculator has a design but no model to
   * build cages from.
   */
  cages?: FootingDetailCages
}

/** The cages a footing sheet can draw from, and where they sit. */
export interface FootingDetailCages {
  /** The footing's own cage — the mat, and the dowels the column laps onto. */
  footing?: RebarCage
  /** The column standing on it. Its ties are the ties on this sheet. */
  column?: RebarCage
  /** Plan centre of the footing in MODEL space, m. The sheet is drawn about
   *  its own origin, so this is what the model coordinates are measured from. */
  centre: [number, number]
  /** Level of the TOP of the footing, m — the sheet's own zero, with the
   *  sheet's y running DOWN from it. */
  yTop: number
}

export interface FootingDetailOptions { detailNo?: string; sheetRef?: string; scale?: string }
export interface DetailDrawing extends Drawing { title: string }

const INK = SHEET_INK, COL = SHEET_INK, REBAR = STEEL, HATCH = '#94a3b8', STONE = '#64748b', PANEL = SHEET_ZONE
const RW = 0.8   // rebar outline stroke weight (px) — a thin tube edge, not a filled rod

/** Build a column-footing detail (plan + section) from a designed footing. */
export function buildFootingDetail(f: FootingDetailInput, opts: FootingDetailOptions = {}): DetailDrawing {
  const P: PlanPrimitive[] = []
  // Draw a reinforcing bar as its OUTLINE (a thin-stroked tube of radius `r`
  // about the centreline `pts`): offset both sides with mitred corners and cap
  // the two free ends with a semicircle — so the bar reads as a rod of real
  // diameter with rounded (hooked) ends, not a single centreline.
  const rod = (pts: Pt[], r: number, fill: string = 'none') => {
    const ns = pts.length - 1
    const nrm: Pt[] = []
    for (let i = 0; i < ns; i++) {
      const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1]
      const l = Math.hypot(dx, dy) || 1
      nrm.push([-dy / l, dx / l])   // left normal
    }
    const side = (s: number): Pt[] => pts.map((p, i) => {
      if (i === 0) return [p[0] + s * r * nrm[0][0], p[1] + s * r * nrm[0][1]]
      if (i === ns) return [p[0] + s * r * nrm[ns - 1][0], p[1] + s * r * nrm[ns - 1][1]]
      const a0: Pt = [pts[i - 1][0] + s * r * nrm[i - 1][0], pts[i - 1][1] + s * r * nrm[i - 1][1]]
      const a1: Pt = [p[0] + s * r * nrm[i - 1][0], p[1] + s * r * nrm[i - 1][1]]
      const b0: Pt = [p[0] + s * r * nrm[i][0], p[1] + s * r * nrm[i][1]]
      const b1: Pt = [pts[i + 1][0] + s * r * nrm[i][0], pts[i + 1][1] + s * r * nrm[i][1]]
      return lineX(a0, a1, b0, b1) ?? b0
    })
    const L = side(1), R = side(-1)
    const cmds: PathCmd[] = [{ c: 'M', x: L[0][0], y: L[0][1] }]
    for (let i = 1; i < L.length; i++) cmds.push({ c: 'L', x: L[i][0], y: L[i][1] })
    cmds.push({ c: 'A', rx: r, ry: r, x: R[R.length - 1][0], y: R[R.length - 1][1], sweep: 1 })
    for (let i = R.length - 2; i >= 0; i--) cmds.push({ c: 'L', x: R[i][0], y: R[i][1] })
    cmds.push({ c: 'A', rx: r, ry: r, x: L[0][0], y: L[0][1], sweep: 1 })
    P.push({ kind: 'path', cmds, stroke: REBAR, width: RW, fill, closed: true })
  }
  const B = f.B, H = f.H
  const c = f.cover / 1000
  const cw = f.colB / 1000, cd = (f.colH ?? f.colB) / 1000
  const bd = f.barDia / 1000
  const n = Math.max(2, Math.round(f.bars))
  const hp = B / 2
  const inner = B - 2 * c
  const barX = (i: number) => -hp + c + (inner * i) / (n - 1)
  const ts = B * 0.075
  const gap = B * 1.05
  const hookLen = (f.endHook ?? 'none') === '90' ? Math.min(0.12, B * 0.07) : 0   // mat-bar end hook (0 = straight)
  const rMain = Math.max(bd / 2, B * 0.007)    // drawn bar radius (mat/dowels)
  const colBars = f.colBars ?? 8, colBarDia = f.colBarDia ?? f.barDia
  const tieDia = f.tieDia ?? 10
  const rTie = Math.max(tieDia / 2000, B * 0.005)   // lateral ties thinner
  const tieSched = f.tieSchedule ?? [[2, 50], [2, 75], [5, 100], [7, 150]]
  const tieRest = f.tieRest ?? 200
  const hg = f.gravel ?? 0.1
  const aboveGrade = f.aboveGrade ?? 0.3
  const embed = f.foundingElev != null ? Math.abs(f.foundingElev) : Math.max(1.0, H * 3)
  const cg = f.cages

  // Column bar x-positions visible in the SECTION cut — 4 corners + the rest
  // split between faces (mirrors ColumnSchematic's 'all-around' layers).
  const cInset = c + tieDia / 1000 + colBarDia / 2000   // cover + tie + ½bar, m
  const N = Math.max(4, 2 * Math.round(colBars / 2))
  const bwIn = Math.max(1e-3, cw - 2 * cInset), hIn = Math.max(1e-3, cd - 2 * cInset)
  const nx = Math.max(2, Math.min(2 + Math.round(((N - 4) / 2) * (bwIn / (bwIn + hIn))), N / 2))
  const rowFx = Array.from({ length: nx }, (_, i) => (nx === 1 ? 0 : -cw / 2 + cInset + ((cw - 2 * cInset) * i) / (nx - 1)))   // bar x, column-local

  // ══ PLAN (centred at origin) ═══════════════════════════════════════════
  P.push({ kind: 'rect', x: -hp, y: -hp, w: B, h: B, stroke: INK, fill: 'none', width: 1.4 })
  // bottom mat, both ways.  Layering (matches the section): the ∥y bars sit ON
  // TOP of the ∥x bars, so the ∥x bars are drawn first (hollow) and the ∥y bars
  // over them WHITE-FILLED — masking the ∥x lines at each crossing so the
  // over/under reads correctly (the under-bar is trimmed where the top bar crosses).
  const xo = -hp + c, xf = hp - c   // outermost mat-bar lines (= perimeter bars)
  const hd = (p: number) => (p < 0 ? hookLen : -hookLen)
  // guard: when hooked, nudge the outermost transverse bar inward so an end hook
  // wraps AROUND it instead of landing on top of it
  const guard = hookLen ? rMain * 2.8 : 0
  const matPos = (i: number) => (i === 0 ? barX(0) + guard : i === n - 1 ? barX(n - 1) - guard : barX(i))
  if (cg) {
    // THE MAT, AS PLACED. Same layering as before — the bars running ∥z rest on
    // the ∥x bars, so the ∥x layer is drawn hollow first and the ∥z layer over
    // it white-filled, masking the lines beneath at every crossing. Which is
    // which comes off the run's own direction, not off its mark.
    const plan: ViewPlane = { origin: [cg.centre[0], cg.yTop, cg.centre[1]], u: [1, 0, 0], v: [0, 0, 1] }
    const mats = (cg.footing?.runs ?? []).filter((r) => r.role === 'mat')
    const alongU = (r: RebarRun) => {
      const pts = projectPath(runPolylines(r)[0] ?? [], plan)
      if (pts.length < 2) return true
      const du = Math.abs(pts[pts.length - 1]![0] - pts[0]![0])
      const dv = Math.abs(pts[pts.length - 1]![1] - pts[0]![1])
      return du >= dv
    }
    for (const pass of [true, false]) {
      for (const r of mats) {
        if (alongU(r) !== pass) continue
        const pts = projectPath(runPolylines(r)[0] ?? [], plan) as Pt[]
        if (pts.length > 1) rod(pts, Math.max(r.dia / 2000, B * 0.007), pass ? 'none' : '#fff')
      }
    }
    // THE COLUMN, AS A CUT just above the pad — so its bars are where the cage
    // put them and its tie set is the one really placed there, cross ties and
    // all. `columnSectionPrimitives` laid out its own nx/ny bar split and drew
    // a plain rectangle round it, which is how the sheet came to disagree with
    // the steel it was detailing.
    P.push({ kind: 'rect', x: -cw / 2, y: -cd / 2, w: cw, h: cd, stroke: COL, fill: '#fff', width: 1.2 })
    if (cg.column) {
      const above = cg.yTop + 0.05
      const cut: CageCut = {
        at: [cg.centre[0], above, cg.centre[1]], normal: [0, 1, 0],
        plane: { origin: [cg.centre[0], above, cg.centre[1]], u: [1, 0, 0], v: [0, 0, 1] },
      }
      P.push(...cutPrimitives(cutCage(cg.column, cut), {
        bar: REBAR, tie: REBAR, tieWidth: 1.3, minBarRadius: B * 0.007,
      }))
    }
  } else {
    for (let i = 0; i < n; i++) {   // ∥x bars — bottom layer (hollow)
      const p = matPos(i)
      rod(hookLen ? [[xo, p + hd(p)], [xo, p], [xf, p], [xf, p + hd(p)]] : [[xo, p], [xf, p]], rMain)
    }
    for (let i = 0; i < n; i++) {   // ∥y bars — top layer (white-filled → masks the ∥x lines under it)
      const p = matPos(i)
      rod(hookLen ? [[p + hd(p), xo], [p, xo], [p, xf], [p + hd(p), xf]] : [[p, xo], [p, xf]], rMain, '#fff')
    }
    // column — the tied column CROSS-SECTION drawn in the footing sheet's palette
    // (orange bars/ties on a white column), i.e. the report's ColumnSchematic
    // rendered by the engine, placed where the column sits in the plan
    columnSectionPrimitives(P, 0, 0, cw, { b: f.colB, h: f.colH ?? f.colB, cover: f.colCover ?? 40, barDia: colBarDia, tieDia, bars: colBars },
      { concrete: '#fff', outline: COL, rebar: REBAR }, 1.3)
  }
  // A–A cut line through the centre
  const aExt = hp + ts * 1.6
  P.push({ kind: 'line', x1: -aExt, y1: 0, x2: aExt, y2: 0, stroke: INK, width: 0.6, dash: [0.12, 0.06, 0.03, 0.06] })
  for (const sxp of [-1, 1]) {
    P.push({ kind: 'text', x: sxp * aExt, y: -ts * 0.6, text: 'A', size: ts * 0.9, anchor: 'middle', color: INK, weight: 700 })
    P.push({ kind: 'line', x1: sxp * aExt, y1: 0, x2: sxp * (aExt - ts * 0.45), y2: -ts * 0.28, stroke: INK, width: 0.8 })
    P.push({ kind: 'line', x1: sxp * aExt, y1: 0, x2: sxp * (aExt - ts * 0.45), y2: ts * 0.28, stroke: INK, width: 0.8 })
  }
  // chained sub-dimensions: edge / column / edge, both ways, + overall
  const edge = (B - cw) / 2
  const pTop = -hp - ts * 1.2, pTop2 = -hp - ts * 2.6
  const xseg = [[-hp, -cw / 2], [-cw / 2, cw / 2], [cw / 2, hp]] as const
  for (const [a, b] of xseg)
    P.push({ kind: 'dim', x1: a, y1: pTop, x2: b, y2: pTop, text: `${Math.round((b - a) * 1000)}`, off: 0, size: ts * 0.6, ext: -hp })
  P.push({ kind: 'dim', x1: -hp, y1: pTop2, x2: hp, y2: pTop2, text: `${Math.round(B * 1000)} mm`, off: 0, size: ts * 0.7, ext: -hp })
  const pL = -hp - ts * 1.2
  const zseg = [[-hp, -cd / 2], [-cd / 2, cd / 2], [cd / 2, hp]] as const
  for (const [a, b] of zseg)
    P.push({ kind: 'dim', x1: pL, y1: a, x2: pL, y2: b, text: `${Math.round((b - a) * 1000)}`, off: 0, size: ts * 0.6, ext: -hp })
  void edge
  // labels
  P.push({ kind: 'text', x: 0, y: hp + ts * 1.4, text: `${n}-${f.barDia}mmØ BOTHWAY`, size: ts * 0.7, anchor: 'middle', color: REBAR, weight: 700 })
  P.push({ kind: 'text', x: 0, y: hp + ts * 2.5, text: 'PLAN', size: ts * 0.85, anchor: 'middle', color: INK, weight: 700 })

  // ══ SECTION A–A (to the right) ═════════════════════════════════════════
  const sx0 = hp + gap + hp
  const secL = sx0 - hp, secR = sx0 + hp
  const footTop = 0, footBot = H, gravBot = H + hg
  const gradeZ = -embed, colTop = -(embed + aboveGrade)
  const cl = sx0 - cw / 2, cr = sx0 + cw / 2
  // natural-grade line (broken at the column) + soil hatch in the backfill band
  for (const [lo, hi] of [[secL - ts, cl], [cr, secR + ts]] as const) {
    P.push({ kind: 'line', x1: lo, y1: gradeZ, x2: hi, y2: gradeZ, stroke: HATCH, width: 0.9 })
    const step = Math.max(0.13, B * 0.09)
    for (let x = lo; x < hi - 1e-6; x += step)
      for (let z = gradeZ + step; z < footTop - 1e-6; z += step)
        P.push({ kind: 'line', x1: x, y1: z, x2: x + step * 0.5, y2: z - step * 0.5, stroke: HATCH, width: 0.4 })
  }
  // Right-aligned CLEAR of the column: run out from the left edge it was
  // nineteen characters long and printed straight through it. The clearance is
  // measured to the column's outermost STEEL, not to its concrete — the bars
  // and the ties stand outside the rectangle in this view, and aligning to the
  // rect left the last letter under the outer tie line.
  P.push({ kind: 'text', x: cl - ts * 1.4, y: gradeZ - ts * 0.5, text: 'NATURAL GRADE LINE', size: ts * 0.5, anchor: 'end', color: INK, weight: 600 })
  // footing + column
  P.push({ kind: 'rect', x: secL, y: footTop, w: B, h: H, stroke: INK, fill: 'none', width: 1.5 })
  P.push({ kind: 'rect', x: cl, y: colTop, w: cw, h: -colTop, stroke: INK, fill: 'none', width: 1.5 })
  // gravel bedding — packed aggregate between two lines (two staggered rows of
  // rounded stones of mixed size, so it can't be mistaken for reinforcement)
  P.push({ kind: 'line', x1: secL, y1: footBot, x2: secR, y2: footBot, stroke: INK, width: 0.9 })
  P.push({ kind: 'line', x1: secL, y1: gravBot, x2: secR, y2: gravBot, stroke: INK, width: 0.9 })
  const gs = hg * 0.42
  let gi = 0
  for (let x = secL + gs * 0.8; x < secR - gs * 0.4; x += gs * 1.15, gi++) {
    const rTop = gs * (0.42 + 0.16 * ((gi % 3) - 1))
    const rBot = gs * (0.5 - 0.14 * ((gi % 2)))
    P.push({ kind: 'circle', cx: x, cy: footBot + gs * 0.72, r: rTop, stroke: STONE, fill: 'none', width: 0.5 })
    P.push({ kind: 'circle', cx: x + gs * 0.55, cy: gravBot - gs * 0.72, r: rBot, stroke: STONE, fill: 'none', width: 0.5 })
  }
  // bottom mat in TWO stacked layers (bars cannot pass through one another):
  // the in-plane bar runs at the BOTTOM (on the cover); the perpendicular bars
  // (into the page → dots) REST ON TOP of it, touching. The bottom bar's end
  // hooks up and around, hugging the outer perpendicular bar above it.
  const zLong = H - c - rMain                       // in-plane bar centre (bottom layer, on cover)
  const rDot = rMain * 0.9
  const zPerp = zLong - rMain - rDot                 // perpendicular bars sit tangent on top
  const upHook = hookLen ? Math.min(hookLen, H * 0.45) : 0
  if (!cg) {
    // the longitudinal bar's hook clears (guards) the outer perpendicular bar
    rod(upHook ? [[secL + c, zLong - upHook], [secL + c, zLong], [secR - c, zLong], [secR - c, zLong - upHook]]
               : [[secL + c, zLong], [secR - c, zLong]], rMain)
    for (let i = 0; i < n; i++)
      P.push({ kind: 'circle', cx: sx0 + matPos(i), cy: zPerp, r: rDot, stroke: REBAR, fill: REBAR, width: 0.4 })
  }
  // LATERAL TIES first (each a thin closed tube whose ends hook around the outer
  // vertical bars) — then the vertical bars are drawn OVER them white-filled, so
  // the ties read as wrapping around / passing behind the bars (as in the report)
  const secVx = rowFx.map((fx) => sx0 + fx)
  const xL = secVx[0], xR = secVx[secVx.length - 1]
  const g = rMain * 1.3      // tie reaches just OUTSIDE the corner bar…
  const tw = rTie * 3.2      // …then hooks up around it (stays clear of the white-filled bar)
  const stopZ = -(embed + aboveGrade) + c
  const tieZs: number[] = []
  let stX1 = xR + g
  if (cg) {
    // ── the section, straight off the cages ───────────────────────────────
    //
    // The sheet's own axes: x runs east from the footing's centre, offset to
    // the section's origin; y runs DOWN from the top of the pad, which is the
    // sheet's zero. Both cages are projected onto that, and clipped to the
    // band the sheet draws — a column bar carrying on up past the sheet is cut
    // at the edge and shown running out, which is what it does.
    const S: ViewPlane = {
      origin: [cg.centre[0], cg.yTop, cg.centre[1]],
      u: [1, 0, 0], v: [0, -1, 0],
    }
    const band: [number, number] = [colTop, gravBot]
    // A bar crossing the plane rather than lying in it — a mat bar running
    // north–south, seen end-on — is a DOT, not a rod. Told apart by how far it
    // travels along the sheet: a bar seen end-on goes nowhere.
    const draw = (cage: RebarCage, fill: string) => {
      for (const r of cage.runs) {
        const pts = projectPath(runPolylines(r)[0] ?? [], S).map(([a, b]) => [sx0 + a, b] as Pt)
        if (pts.length < 2) continue
        const uLo = Math.min(...pts.map((q) => q[0])), uHi = Math.max(...pts.map((q) => q[0]))
        const rr = Math.max(r.dia / 2000, B * 0.007)
        // A TIE seen edge-on is one horizontal bar, and has to be drawn as one.
        // Its loop projects to a line traversed twice — out along the top leg
        // and back along the bottom — and an outlined rod mitres its corners,
        // so a segment that doubles back sends the two offset sides to an
        // intersection far outside the column. The first render put every tie
        // through both faces of the concrete.
        if (r.role === 'tie' || r.role === 'hoop') {
          const v = pts.reduce((a, q) => a + q[1], 0) / pts.length
          if (v < band[0] || v > band[1]) continue
          rod([[uLo, v], [uHi, v]], rr, fill)
          // The level for the SCHEDULE comes off the run's specified path, not
          // off the drawn loop: a closed tie leans half a diameter either side
          // of its level so its two ends can pass (`selfClearance`), and a mean
          // taken over the drawn points inherits that lean. It reported a 300
          // spacing as 295 — a small number, and the wrong one to print on a
          // drawing when the cage knows the right one.
          tieZs.push(projectPath([r.path[0]!], S)[0]![1])
          continue
        }
        // A bar CROSSING the plane — a mat bar running north–south, seen
        // end-on — is a dot: it goes nowhere along the sheet.
        if (uHi - uLo < rr) {
          const mid = pts[Math.floor(pts.length / 2)]!
          if (mid[1] >= band[0] && mid[1] <= band[1]) {
            P.push({ kind: 'circle', cx: mid[0], cy: mid[1], r: rr * 0.9, stroke: REBAR, fill: REBAR, width: 0.4 })
          }
          continue
        }
        for (const piece of clipToBand(pts, band[0], band[1])) {
          if (piece.length > 1) rod(piece as Pt[], rr, fill)
        }
      }
    }
    // Ties first, then the verticals white-filled over them — so a vertical
    // reads as passing IN FRONT of the tie that wraps it, which is the
    // convention the rest of this sheet already draws to.
    if (cg.column) draw({ ...cg.column, runs: cg.column.runs.filter((r) => r.role === 'tie' || r.role === 'hoop') }, 'none')
    if (cg.footing) draw({ ...cg.footing, runs: cg.footing.runs.filter((r) => r.role === 'mat') }, 'none')
    if (cg.footing) draw({ ...cg.footing, runs: cg.footing.runs.filter((r) => r.role === 'dowel') }, '#fff')
    if (cg.column) draw({ ...cg.column, runs: cg.column.runs.filter((r) => r.role === 'vertical') }, '#fff')
    stX1 = sx0 + cw / 2
  } else {
    let z = 0
    const drawTie = () => { if (-z > stopZ) { rod([[xL - g, -z + tw], [xL - g, -z], [xR + g, -z], [xR + g, -z + tw]], rTie); tieZs.push(-z) } }
    for (const [count, sp] of tieSched) for (let k = 0; k < count; k++) { z += sp / 1000; drawTie() }
    while (-z > stopZ) { z += tieRest / 1000; drawTie() }
    // column vertical bars (white-filled, on top of the ties) — one per section
    // x-position from the plan layout; the two outer bars foot out onto the mat
    for (const dx of secVx) {
      const outer = Math.abs(dx - sx0) > cw / 2 - cInset - 1e-6
      const dir = dx < sx0 ? -1 : 1
      rod(outer ? [[dx, colTop + c], [dx, zLong], [dx + dir * (cw * 0.3), zLong]]
                : [[dx, colTop + c], [dx, zLong]], rMain, '#fff')
    }
  }
  // depth dimension chain (embedment / footing / gravel) + overall
  const dX = secL - ts * 1.4
  for (const [a, b] of [[gradeZ, footTop], [footTop, footBot], [footBot, gravBot]] as const)
    P.push({ kind: 'dim', x1: dX, y1: a, x2: dX, y2: b, text: `${Math.round((b - a) * 1000)}`, off: 0, size: ts * 0.6, ext: secL })
  P.push({ kind: 'dim', x1: dX - ts * 1.4, y1: gradeZ, x2: dX - ts * 1.4, y2: gravBot, text: `${Math.round((gravBot - gradeZ) * 1000)} mm`, off: 0, size: ts * 0.7, ext: secL })
  // width dimension below the gravel
  P.push({ kind: 'dim', x1: secL, y1: gravBot + ts * 1.2, x2: secR, y2: gravBot + ts * 1.2, text: `${Math.round(B * 1000)} mm`, off: 0, size: ts * 0.7, ext: gravBot })
  // callouts — each leader starts ON the element it names (a dot marks the tap)
  // THE HOUSE LEADER, like every other sheet. This one used to draw its own:
  // a hairline from the text to a filled dot on the bar, with no landing and
  // no arrowhead — so on the one sheet where a callout crosses hatching it was
  // also the one callout that could not be told from the hatching.
  const callout = (ex: number, ey: number, tx: number, ty: number, text: string, size: number, color?: string, text2?: string) =>
    P.push(...leader({ x: ex, y: ey, tx, ty, text, text2, size, color, weight: 600 }))
  // → a column vertical bar
  const rightVx = secVx.length ? Math.max(...secVx) : cr - c
  const vy = colTop * 0.6
  // → a lateral tie
  const tieY = tieZs.length ? tieZs[Math.floor(tieZs.length * 0.55)] : gradeZ * 0.55
  // The callout says what is DRAWN. With cages, the ties on the sheet are the
  // ones the column cage placed, so the schedule is measured off their levels
  // (`pitchRuns`, the same reader the frame elevations use) instead of printing
  // the nominal schedule the drawing no longer follows.
  // A tie SET is a hoop plus the cross ties threaded through it, and the cage
  // stacks them a diameter apart so they do not interpenetrate. Read level by
  // level the spacing therefore alternates 10, 310, 10, 310 … which is a true
  // description of the bars and a useless description of the SPACING. The
  // levels are clustered back into their sets first — anything within a few
  // diameters of the last is the same set — and the pitch measured between
  // set centres, which is what "ties at 300 c/c" means.
  const setLevels = (zs: number[]): number[] => {
    const sorted = [...zs].sort((a, b) => a - b)
    const groups: number[][] = []
    let group: number[] = []
    for (const z of sorted) {
      if (group.length && z - group[group.length - 1]! > (4 * tieDia) / 1000) { groups.push(group); group = [] }
      group.push(z)
    }
    if (group.length) groups.push(group)
    // A set the SHEET'S WINDOW cut in half is not a set, and its surviving
    // members do not average to its level. The band stops at the top of the
    // drawn column, and it fell between a hoop and the cross tie stacked on it
    // — so that set contributed one bar 5 mm off centre and the schedule read
    // 6@295 for ties the cage places at 300. Only full sets are measured.
    const full = Math.max(...groups.map((g) => g.length))
    return groups.filter((g) => g.length === full)
      .map((g) => g.reduce((a, b) => a + b, 0) / g.length)
  }
  const drawnPitch = cg
    ? pitchNote(pitchRuns(setLevels(tieZs), 0.012))
    : `${tieSched.map(([cc, ss]) => `${cc}@${ss}`).join(', ')},`
  const tieLines = cg
    ? [`LATERAL TIES = ⌀${tieDia}`, ...(drawnPitch ? [`${drawnPitch} mm O.C.`] : [])]
    : [`LATERAL TIES = ⌀${tieDia}`, drawnPitch, `REST @ ${tieRest} mm O.C.`]
  callout(rightVx, vy, secR + ts * 0.9, vy, `${colBars}-${colBarDia}mmØ VERT. BARS`, ts * 0.55, REBAR)
  callout(stX1, tieY, secR + ts * 0.9, tieY, tieLines[0]!, ts * 0.5, INK, tieLines[1])
  // a third line, where the schedule needs one, under the leader's own two
  if (tieLines[2]) {
    P.push({
      kind: 'text', x: secR + ts * 0.9, y: tieY + ts * 0.5 * 2.5, text: tieLines[2],
      size: ts * 0.5, anchor: 'start', color: INK, weight: 600,
    })
  }
  // → the bottom mat bar
  callout(secR - c, zLong, secR + ts * 0.9, zLong + ts * 0.7, `${n}-${f.barDia}mmØ BOTHWAY`, ts * 0.55, REBAR)
  if (f.foundingElev != null)
    P.push({ kind: 'text', x: secL, y: footTop - ts * 0.5, text: `T.O.F. EL ${f.foundingElev.toFixed(2)} m`, size: ts * 0.5, anchor: 'start', color: PANEL, weight: 600 })
  P.push({ kind: 'text', x: sx0, y: gravBot + ts * 2.4, text: 'SECTION A-A', size: ts * 0.85, anchor: 'middle', color: INK, weight: 700 })

  // ══ detail-tag title block ═════════════════════════════════════════════
  const detailNo = opts.detailNo ?? '1', sheetRef = opts.sheetRef ?? 'S-05', scale = opts.scale ?? '1:25 MTS'
  const title = `COLUMN FOOTING DETAIL — ${f.mark}`
  // title sits below BOTH views (the plan runs deeper than the section here)
  const tbR = ts * 1.2, tbY = Math.max(hp + ts * 2.5, gravBot + ts * 2.4) + ts * 2.6, tbX = -hp
  // The house block. This sheet used to draw the rule in two pieces — one
  // across the tag, one under the title, at different widths and with a gap
  // between them — so the bisector read as cut at both ends.
  P.push(...titleBlock({
    x: tbX, w: secR - tbX, top: tbY - tbR, u: tbR / 2.6,
    title, detailNo, sheetRef, scale,
  }).prims)

  // ══ bounds ══
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const acc = (x: number, y: number) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y) }
  for (const pr of P) {
    if (pr.kind === 'line' || pr.kind === 'dim') { acc(pr.x1, pr.y1); acc(pr.x2, pr.y2) }
    else if (pr.kind === 'rect') { acc(pr.x, pr.y); acc(pr.x + pr.w, pr.y + pr.h) }
    else if (pr.kind === 'circle') { acc(pr.cx - pr.r, pr.cy - pr.r); acc(pr.cx + pr.r, pr.cy + pr.r) }
    else if (pr.kind === 'path') { for (const cmd of pr.cmds) acc(cmd.x, cmd.y) }
    else {   // text: include the rendered extent so labels aren't clipped
      const w = pr.text.length * pr.size * 0.58, a = pr.anchor ?? 'start'
      acc(a === 'start' ? pr.x : a === 'end' ? pr.x - w : pr.x - w / 2, pr.y - pr.size * 0.6)
      acc(a === 'start' ? pr.x + w : a === 'end' ? pr.x : pr.x + w / 2, pr.y + pr.size * 0.6)
    }
  }
  return { primitives: P, bounds: { minX, minY, maxX, maxY }, title }
}
