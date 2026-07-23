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
import type { PlanPrimitive, Drawing } from './planRenderer'

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
  /** Tie/stirrup diameter, mm (default 10). */
  stirrupDia?: number
  /** Tie set from the footing up: [count, spacing mm] groups, then rest @ … */
  stirrupSchedule?: [number, number][]
  stirrupRest?: number
  /** Gravel/lean base thickness, m (default 0.1). */
  gravel?: number
  /** Column projection above natural grade, m (default 0.3). */
  aboveGrade?: number
  /** Top-of-footing elevation, m (−down); its magnitude is the embedment. */
  foundingElev?: number
}

export interface FootingDetailOptions { detailNo?: string; sheetRef?: string; scale?: string }
export interface DetailDrawing extends Drawing { title: string }

const INK = '#1e293b', COL = '#1e293b', REBAR = '#b45309', HATCH = '#94a3b8', PANEL = '#0f766e'
const RW = 2.4   // rebar line weight (px) — bars read as solid rod, not hairline

/** Build a column-footing detail (plan + section) from a designed footing. */
export function buildFootingDetail(f: FootingDetailInput, opts: FootingDetailOptions = {}): DetailDrawing {
  const P: PlanPrimitive[] = []
  const bar = (pts: [number, number][], w = RW) => {   // bold rebar polyline
    for (let i = 0; i < pts.length - 1; i++)
      P.push({ kind: 'line', x1: pts[i][0], y1: pts[i][1], x2: pts[i + 1][0], y2: pts[i + 1][1], stroke: REBAR, width: w })
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
  const hook = Math.min(0.12, B * 0.07)        // 90° hook leg length (m)
  const colBars = f.colBars ?? 8, colBarDia = f.colBarDia ?? f.barDia
  const stDia = f.stirrupDia ?? 10
  const stSched = f.stirrupSchedule ?? [[2, 50], [2, 75], [5, 100], [7, 150]]
  const stRest = f.stirrupRest ?? 200
  const hg = f.gravel ?? 0.1
  const aboveGrade = f.aboveGrade ?? 0.3
  const embed = f.foundingElev != null ? Math.abs(f.foundingElev) : Math.max(1.0, H * 3)

  // ══ PLAN (centred at origin) ═══════════════════════════════════════════
  P.push({ kind: 'rect', x: -hp, y: -hp, w: B, h: B, stroke: INK, fill: 'none', width: 1.4 })
  // bottom mat, both ways, each bar hooked 90° toward the footing interior
  for (let i = 0; i < n; i++) {
    const p = barX(i)
    const dz = p < 0 ? hook : -hook, dx = p < 0 ? hook : -hook
    bar([[-hp + c, p + dz], [-hp + c, p], [hp - c, p], [hp - c, p + dz]])   // bar ∥ x
    bar([[p + dx, -hp + c], [p, -hp + c], [p, hp - c], [p + dx, hp - c]])   // bar ∥ y
  }
  // column footprint + vertical bars (corner circles) + a tie square
  P.push({ kind: 'rect', x: -cw / 2, y: -cd / 2, w: cw, h: cd, stroke: COL, fill: '#fff', width: 1.1 })
  P.push({ kind: 'rect', x: -cw / 2 + c * 0.5, y: -cd / 2 + c * 0.5, w: cw - c, h: cd - c, stroke: REBAR, fill: 'none', width: 1.0 })
  const vr = Math.max(colBarDia / 2000, B * 0.008)
  for (const sxp of [-1, 1]) for (const szp of [-1, 1])
    P.push({ kind: 'circle', cx: sxp * (cw / 2 - c * 0.7), cy: szp * (cd / 2 - c * 0.7), r: vr, stroke: REBAR, fill: REBAR, width: 0.5 })
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
    P.push({ kind: 'dim', x1: a, y1: pTop, x2: b, y2: pTop, text: `${Math.round((b - a) * 1000)}`, off: 0, size: ts * 0.6 })
  P.push({ kind: 'dim', x1: -hp, y1: pTop2, x2: hp, y2: pTop2, text: `${Math.round(B * 1000)} mm`, off: 0, size: ts * 0.7 })
  const pL = -hp - ts * 1.2
  const zseg = [[-hp, -cd / 2], [-cd / 2, cd / 2], [cd / 2, hp]] as const
  for (const [a, b] of zseg)
    P.push({ kind: 'dim', x1: pL, y1: a, x2: pL, y2: b, text: `${Math.round((b - a) * 1000)}`, off: 0, size: ts * 0.6 })
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
  P.push({ kind: 'text', x: secL - ts, y: gradeZ - ts * 0.5, text: 'NATURAL GRADE LINE', size: ts * 0.5, anchor: 'start', color: INK, weight: 600 })
  // footing + gravel base + column
  P.push({ kind: 'rect', x: secL, y: footTop, w: B, h: H, stroke: INK, fill: 'none', width: 1.5 })
  P.push({ kind: 'rect', x: secL, y: footBot, w: B, h: hg, stroke: HATCH, fill: 'none', width: 0.9 })
  for (let x = secL + hg * 0.6; x < secR; x += hg * 1.1)
    P.push({ kind: 'circle', cx: x, cy: footBot + hg / 2, r: hg * 0.28, stroke: HATCH, fill: 'none', width: 0.5 })
  P.push({ kind: 'rect', x: cl, y: colTop, w: cw, h: -colTop, stroke: INK, fill: 'none', width: 1.5 })
  // bottom mat — longitudinal bar hooked up at both ends + transverse bar ends
  const matZ = H - c - bd / 2
  const hs = Math.min(H * 0.55, 0.22)
  bar([[secL + c, matZ - hs], [secL + c, matZ], [secR - c, matZ], [secR - c, matZ - hs]])
  for (let i = 0; i < n; i++)
    P.push({ kind: 'circle', cx: sx0 + barX(i), cy: matZ, r: Math.max(bd / 2, B * 0.009), stroke: REBAR, fill: REBAR, width: 0.5 })
  // column vertical bars / dowels — full height, bent out onto the mat
  const vx = [cl + c, cr - c]
  for (const dx of vx) {
    const dir = dx < sx0 ? -1 : 1
    bar([[dx, colTop + c], [dx, matZ], [dx + dir * (cw * 0.42), matZ]])
  }
  // stirrups up the column at the scheduled spacing
  const stX0 = cl + c * 0.6, stX1 = cr - c * 0.6
  let z = 0
  const stopZ = -(embed + aboveGrade) + c
  const drawStirrup = () => { if (-z > stopZ) P.push({ kind: 'line', x1: stX0, y1: -z, x2: stX1, y2: -z, stroke: REBAR, width: 1.1 }) }
  for (const [count, sp] of stSched) for (let k = 0; k < count; k++) { z += sp / 1000; drawStirrup() }
  while (-z > stopZ) { z += stRest / 1000; drawStirrup() }
  // depth dimension chain (embedment / footing / gravel) + overall
  const dX = secL - ts * 1.4
  for (const [a, b] of [[gradeZ, footTop], [footTop, footBot], [footBot, gravBot]] as const)
    P.push({ kind: 'dim', x1: dX, y1: a, x2: dX, y2: b, text: `${Math.round((b - a) * 1000)}`, off: 0, size: ts * 0.6 })
  P.push({ kind: 'dim', x1: dX - ts * 1.4, y1: gradeZ, x2: dX - ts * 1.4, y2: gravBot, text: `${Math.round((gravBot - gradeZ) * 1000)} mm`, off: 0, size: ts * 0.7 })
  // width dimension below the gravel
  P.push({ kind: 'dim', x1: secL, y1: gravBot + ts * 1.2, x2: secR, y2: gravBot + ts * 1.2, text: `${Math.round(B * 1000)} mm`, off: 0, size: ts * 0.7 })
  // callouts with leaders
  const lead = (x1: number, y1: number, x2: number, y2: number) => P.push({ kind: 'line', x1, y1, x2, y2, stroke: INK, width: 0.5 })
  lead(cr, colTop * 0.75, secR + ts * 0.6, colTop * 0.75)
  P.push({ kind: 'text', x: secR + ts * 0.8, y: colTop * 0.75, text: `${colBars}-${colBarDia}mmØ VERT. BARS`, size: ts * 0.55, anchor: 'start', color: REBAR, weight: 600 })
  lead(cr, gradeZ * 0.55, secR + ts * 0.6, gradeZ * 0.55)
  const stLines = [`STIRRUPS = ⌀${stDia} REBAR`, `${stSched.map(([cc, ss]) => `${cc}@${ss}`).join(', ')},`, `REST @ ${stRest} mm O.C.`]
  stLines.forEach((s, i) => P.push({ kind: 'text', x: secR + ts * 0.8, y: gradeZ * 0.55 + i * ts * 0.72, text: s, size: ts * 0.5, anchor: 'start', color: INK, weight: 500 }))
  lead(secR - c, matZ, secR + ts * 0.6, matZ + ts * 0.6)
  P.push({ kind: 'text', x: secR + ts * 0.8, y: matZ + ts * 0.6, text: `${n}-${f.barDia}mmØ BOTHWAY`, size: ts * 0.55, anchor: 'start', color: REBAR, weight: 600 })
  if (f.foundingElev != null)
    P.push({ kind: 'text', x: secL, y: footTop - ts * 0.5, text: `T.O.F. EL ${f.foundingElev.toFixed(2)} m`, size: ts * 0.5, anchor: 'start', color: PANEL, weight: 600 })
  P.push({ kind: 'text', x: sx0, y: gravBot + ts * 2.4, text: 'SECTION A-A', size: ts * 0.85, anchor: 'middle', color: INK, weight: 700 })

  // ══ detail-tag title block ═════════════════════════════════════════════
  const detailNo = opts.detailNo ?? '1', sheetRef = opts.sheetRef ?? 'S-05', scale = opts.scale ?? '1:25 MTS'
  const title = `COLUMN FOOTING DETAIL — ${f.mark}`
  // title sits below BOTH views (the plan runs deeper than the section here)
  const tbR = ts * 1.2, tbY = Math.max(hp + ts * 2.5, gravBot + ts * 2.4) + ts * 2.6, tbX = -hp
  P.push({ kind: 'circle', cx: tbX + tbR, cy: tbY, r: tbR, stroke: INK, fill: '#fff', width: 1 })
  P.push({ kind: 'line', x1: tbX, y1: tbY, x2: tbX + 2 * tbR, y2: tbY, stroke: INK, width: 1 })
  P.push({ kind: 'text', x: tbX + tbR, y: tbY - tbR * 0.5, text: detailNo, size: tbR * 0.72, anchor: 'middle', color: INK, weight: 700 })
  P.push({ kind: 'text', x: tbX + tbR, y: tbY + tbR * 0.5, text: sheetRef, size: tbR * 0.58, anchor: 'middle', color: INK, weight: 700 })
  const lnX0 = tbX + 2 * tbR + ts * 0.3, lnX1 = secR
  P.push({ kind: 'line', x1: lnX0, y1: tbY, x2: lnX1, y2: tbY, stroke: INK, width: 1.4 })
  P.push({ kind: 'text', x: lnX0 + ts * 0.15, y: tbY - tbR * 0.55, text: title, size: tbR * 0.75, anchor: 'start', color: INK, weight: 700 })
  P.push({ kind: 'text', x: lnX0 + ts * 0.15, y: tbY + tbR * 0.55, text: 'SCALE', size: tbR * 0.4, anchor: 'start', color: INK, weight: 600 })
  P.push({ kind: 'text', x: lnX1 - ts * 0.3, y: tbY + tbR * 0.55, text: scale, size: tbR * 0.4, anchor: 'end', color: INK, weight: 600 })

  // ══ bounds ══
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const acc = (x: number, y: number) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y) }
  for (const pr of P) {
    if (pr.kind === 'line' || pr.kind === 'dim') { acc(pr.x1, pr.y1); acc(pr.x2, pr.y2) }
    else if (pr.kind === 'rect') { acc(pr.x, pr.y); acc(pr.x + pr.w, pr.y + pr.h) }
    else if (pr.kind === 'circle') { acc(pr.cx - pr.r, pr.cy - pr.r); acc(pr.cx + pr.r, pr.cy + pr.r) }
    else {   // text: include the rendered extent so labels aren't clipped
      const w = pr.text.length * pr.size * 0.58, a = pr.anchor ?? 'start'
      acc(a === 'start' ? pr.x : a === 'end' ? pr.x - w : pr.x - w / 2, pr.y - pr.size * 0.6)
      acc(a === 'start' ? pr.x + w : a === 'end' ? pr.x : pr.x + w / 2, pr.y + pr.size * 0.6)
    }
  }
  return { primitives: P, bounds: { minX, minY, maxX, maxY }, title }
}
